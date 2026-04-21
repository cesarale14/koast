/**
 * POST /api/pricing/apply/[propertyId]
 *
 * The user-clickable "apply recommendations" path for BDC. This is where
 * PR A's safe-restrictions helper meets PR B's rules layer and produces
 * the first end-to-end pricing push flow in Koast's history that (a)
 * respects host intent (rules clamps), (b) can't clobber BDC (safe-
 * restrictions), and (c) captures outcomes (pricing_performance).
 *
 * Request body (one of):
 *   { recommendation_ids: uuid[], idempotency_key }      // apply by ID
 *   { date_range: { from, to }, idempotency_key }        // apply by range
 *
 * Flow:
 *   1. Auth + own-property check.
 *   2. Env gate (KOAST_ALLOW_BDC_CALENDAR_PUSH). 503 if off.
 *   3. Idempotency lock via concurrency_locks, 60s TTL.
 *   4. Resolve target pending recommendations.
 *   5. Fetch BDC rate plan from property_channels (400 if none).
 *   6. Build koastProposed Map<date, { rate, availability: 1, stop_sell: false }>
 *      — availability/stop_sell kept intentional no-ops; real closures come
 *      from bookings, not apply.
 *   7. Call buildSafeBdcRestrictions — this is the correctness gate.
 *   8. Push the plan's entries_to_push via channex.updateRestrictions
 *      (200-entry batches, collect partial failures).
 *   9. For each successfully-pushed entry: upsert pricing_performance,
 *      mark recommendation status='applied'.
 *  10. Return { plan, applied_count, skipped_count, performance_rows_created,
 *               partial_failure?, failed_batches? }.
 *
 * VERIFY (browser devtools, after flipping the env gate):
 *   POST /api/pricing/apply/<propertyId>
 *     body: {"recommendation_ids":["uuid1","uuid2"],"idempotency_key":"<uuid>"}
 *   Expect: { plan: {...}, applied_count: N, performance_rows_created: N }
 *
 * ENV GATE NOTE: While KOAST_ALLOW_BDC_CALENDAR_PUSH is unset (default off),
 * every call returns 503 immediately. Helper logic never runs. Flip the
 * flag in Vercel env after PR D ships and preview endpoint verified.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import { acquireLock, releaseLock } from "@/lib/concurrency/locks";
import {
  CALENDAR_PUSH_DISABLED_MESSAGE,
  isCalendarPushEnabled,
} from "@/lib/channex/calendar-push-gate";
import {
  buildSafeBdcRestrictions,
  toChannexRestrictionValues,
  type KoastRestrictionProposal,
  type SafeRestrictionPlan,
} from "@/lib/channex/safe-restrictions";
import { isBdcChannelCode } from "@/lib/channex/calendar-push-gate";

// Map a property_channels channel_code (upper-case, e.g. 'BDC' / 'ABB')
// to the pricing_performance `channels_pushed` slug convention (lower-
// case 'booking_com' / 'airbnb'). Defined here instead of inline so the
// backfill script + other readers can share the same mapping.
function channelSlugFor(code: string): string {
  const c = code.toUpperCase();
  if (c === "BDC") return "booking_com";
  if (c === "ABB") return "airbnb";
  if (c === "VRBO") return "vrbo";
  if (c === "DIRECT") return "direct";
  return code.toLowerCase();
}

export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  if (!isCalendarPushEnabled()) {
    return NextResponse.json({ error: CALENDAR_PUSH_DISABLED_MESSAGE }, { status: 503 });
  }

  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const {
      recommendation_ids,
      date_range,
      idempotency_key,
    } = body as {
      recommendation_ids?: string[];
      date_range?: { from?: string; to?: string };
      idempotency_key?: string;
    };

    if (!idempotency_key || typeof idempotency_key !== "string") {
      return NextResponse.json(
        { error: "idempotency_key is required (client-generated UUID)" },
        { status: 400 }
      );
    }
    if (!recommendation_ids && !date_range) {
      return NextResponse.json(
        { error: "Either recommendation_ids[] or date_range{from,to} is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const propertyId = params.propertyId;

    const lockKey = `pricing_apply:${propertyId}:${idempotency_key}`;
    const lockAcquired = await acquireLock(supabase, lockKey, 60);
    if (!lockAcquired) {
      return NextResponse.json(
        { error: "duplicate_request", message: "An identical apply is in flight. Wait and retry or generate a new idempotency_key." },
        { status: 409 }
      );
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: prop } = await (supabase.from("properties") as any)
        .select("id, channex_property_id")
        .eq("id", propertyId)
        .maybeSingle();
      if (!prop?.channex_property_id) {
        return NextResponse.json({ error: "Property not connected to Channex" }, { status: 400 });
      }
      const channexPropertyId: string = prop.channex_property_id;

      // Session 4.6: multi-channel dispatch. Every active channel with a
      // registered rate plan receives the approved rate. BDC routes through
      // buildSafeBdcRestrictions (pre-flight read + safe-merge); non-BDC
      // targets push directly. Matches the pattern used by /api/pricing/push.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: channelLinks } = await (supabase.from("property_channels") as any)
        .select("channel_code, channel_name, settings, status")
        .eq("property_id", propertyId)
        .eq("status", "active");

      type RatePlanTarget = { id: string; channel: string };
      const targets: RatePlanTarget[] = [];
      for (const link of ((channelLinks ?? []) as Array<{
        channel_code: string;
        channel_name: string;
        settings: { rate_plan_id?: string } | null;
      }>)) {
        const rpId = link.settings?.rate_plan_id;
        if (rpId) targets.push({ id: rpId, channel: link.channel_code });
      }
      if (targets.length === 0) {
        return NextResponse.json(
          { error: "No connected channel with a rate plan configured for this property" },
          { status: 400 }
        );
      }

      // Resolve target recommendations.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let recs: Array<{ id: string; date: string; suggested_rate: number }> = [];
      if (recommendation_ids && recommendation_ids.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase.from("pricing_recommendations") as any)
          .select("id, date, suggested_rate, status, property_id")
          .in("id", recommendation_ids)
          .eq("property_id", propertyId)
          .eq("status", "pending");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recs = ((data ?? []) as any[]).map((r) => ({
          id: r.id, date: r.date, suggested_rate: Number(r.suggested_rate),
        }));
      } else if (date_range?.from && date_range?.to) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase.from("pricing_recommendations") as any)
          .select("id, date, suggested_rate, status")
          .eq("property_id", propertyId)
          .eq("status", "pending")
          .gte("date", date_range.from)
          .lte("date", date_range.to);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recs = ((data ?? []) as any[]).map((r) => ({
          id: r.id, date: r.date, suggested_rate: Number(r.suggested_rate),
        }));
      }

      if (recs.length === 0) {
        return NextResponse.json({
          plan: null,
          applied_count: 0,
          skipped_count: 0,
          performance_rows_created: 0,
          note: "no_pending_recommendations_matched",
        });
      }

      // Build the koastProposed Map. availability=1 / stop_sell=false are
      // intentional no-ops — rate pushes don't change bookability; Channex
      // keeps the room-type availability separate.
      const koastProposed = new Map<string, KoastRestrictionProposal>();
      const recByDate = new Map<string, typeof recs[0]>();
      for (const rec of recs) {
        koastProposed.set(rec.date, {
          rate: rec.suggested_rate,
          availability: 1,
          stop_sell: false,
        });
        recByDate.set(rec.date, rec);
      }
      const dates = Array.from(koastProposed.keys()).sort();
      const dateFrom = dates[0];
      const dateTo = dates[dates.length - 1];

      const channex = createChannexClient();
      const failedBatches: Array<{ batch_index: number; date_range: string; error: string; size: number; target: string }> = [];
      // Per-date per-channel success tracking. Keys are dates; values
      // are the set of channel_codes (upper-case, e.g. 'BDC') that
      // accepted the push for that date.
      const successByDate = new Map<string, Set<string>>();
      const bdcPlans: Array<{ rate_plan_id: string; channel: string; plan: SafeRestrictionPlan }> = [];
      // Session 5a.1 Fix 3: per-channel calendar_rates overrides populated
      // *inside* the batch-success branch so only entries actually accepted
      // by Channex land in local state. Entries skipped by
      // buildSafeBdcRestrictions never enter a batch, so they never reach
      // this list — matching the "don't update local state for un-pushed
      // entries" rule. No base (channel_code IS NULL) rows are written
      // here; applying a rec is a per-channel action.
      const appliedAt = new Date().toISOString();
      const calendarRateUpserts: Array<Record<string, unknown>> = [];

      // Per-target push loop. Each target = one Channex rate plan = one
      // platform (BDC, ABB, etc.). BDC runs through safe-restrictions;
      // non-BDC targets push directly.
      for (const t of targets) {
        if (isBdcChannelCode(t.channel)) {
          const plan = await buildSafeBdcRestrictions({
            channex,
            channexPropertyId,
            bdcRatePlanId: t.id,
            dateFrom,
            dateTo,
            koastProposed,
          });
          bdcPlans.push({ rate_plan_id: t.id, channel: t.channel, plan });
          if (plan.entries_to_push.length === 0) continue;
          const payload = toChannexRestrictionValues(plan, channexPropertyId, t.id);
          for (let i = 0; i < payload.length; i += 200) {
            const batch = payload.slice(i, i + 200);
            const firstDate = batch[0]?.date_from ?? "?";
            const lastDate = batch[batch.length - 1]?.date_to ?? "?";
            try {
              await channex.updateRestrictions(batch);
              for (const entry of batch) {
                if (!successByDate.has(entry.date_from)) successByDate.set(entry.date_from, new Set());
                successByDate.get(entry.date_from)!.add(t.channel);
                const rec = recByDate.get(entry.date_from);
                if (rec) {
                  calendarRateUpserts.push({
                    property_id: propertyId,
                    date: entry.date_from,
                    channel_code: t.channel,
                    applied_rate: rec.suggested_rate,
                    rate_source: "engine",
                    is_available: true,
                    channex_rate_plan_id: t.id,
                    last_pushed_at: appliedAt,
                    last_channex_rate: rec.suggested_rate,
                  });
                }
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              failedBatches.push({
                batch_index: Math.floor(i / 200),
                date_range: `${firstDate}..${lastDate}`,
                error: msg,
                size: batch.length,
                target: t.channel,
              });
              console.error(`[pricing/apply ${t.channel}] Batch ${i / 200} failed (${firstDate}..${lastDate}): ${msg}`);
            }
          }
          continue;
        }

        // Non-BDC direct push. Same shape as /api/pricing/push — one
        // entry per date using the rec's suggested_rate in cents.
        const restrictionValues: Array<{
          property_id: string;
          rate_plan_id: string;
          date_from: string;
          date_to: string;
          rate: number;
          min_stay_arrival: number;
          stop_sell: boolean;
        }> = [];
        for (const rec of recs) {
          restrictionValues.push({
            property_id: channexPropertyId,
            rate_plan_id: t.id,
            date_from: rec.date,
            date_to: rec.date,
            rate: Math.round(rec.suggested_rate * 100),
            min_stay_arrival: 1,
            stop_sell: false,
          });
        }
        for (let i = 0; i < restrictionValues.length; i += 200) {
          const batch = restrictionValues.slice(i, i + 200);
          const firstDate = batch[0]?.date_from ?? "?";
          const lastDate = batch[batch.length - 1]?.date_to ?? "?";
          try {
            await channex.updateRestrictions(batch);
            for (const entry of batch) {
              if (!successByDate.has(entry.date_from)) successByDate.set(entry.date_from, new Set());
              successByDate.get(entry.date_from)!.add(t.channel);
              const rec = recByDate.get(entry.date_from);
              if (rec) {
                calendarRateUpserts.push({
                  property_id: propertyId,
                  date: entry.date_from,
                  channel_code: t.channel,
                  applied_rate: rec.suggested_rate,
                  rate_source: "engine",
                  is_available: true,
                  channex_rate_plan_id: t.id,
                  last_pushed_at: appliedAt,
                  last_channex_rate: rec.suggested_rate,
                });
              }
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            failedBatches.push({
              batch_index: Math.floor(i / 200),
              date_range: `${firstDate}..${lastDate}`,
              error: msg,
              size: batch.length,
              target: t.channel,
            });
            console.error(`[pricing/apply ${t.channel}] Batch ${i / 200} failed (${firstDate}..${lastDate}): ${msg}`);
          }
        }
      }

      // Consolidate pricing_performance rows: for each date that had AT
      // LEAST ONE successful channel push, emit one performance row
      // tagging which channels accepted. calendar_rates is already
      // populated per-entry inside the batch loop above (Session 5a.1
      // Fix 3) — one override row per successfully-pushed (date,
      // channel) pair, no base row.
      const perfRows: Array<Record<string, unknown>> = [];
      const appliedRecIds: string[] = [];
      const successEntries = Array.from(successByDate.entries());
      for (const [date, channelSet] of successEntries) {
        const rec = recByDate.get(date);
        if (!rec || channelSet.size === 0) continue;
        const slugs = (Array.from(channelSet) as string[]).map(channelSlugFor);
        perfRows.push({
          property_id: propertyId,
          date: rec.date,
          suggested_rate: rec.suggested_rate,
          applied_rate: rec.suggested_rate,
          applied_at: appliedAt,
          booked: false,
          channels_pushed: slugs,
        });
        appliedRecIds.push(rec.id);
      }

      let performance_rows_created = 0;
      if (perfRows.length > 0) {
        // Upsert (not insert): re-applying the same rec for the same
        // (property, date) overwrites the prior row. The
        // pricing_performance_prop_date_unique index (migration
        // 20260421000000) backs this onConflict target. Prior apply
        // attempts are overwritten — historical audit trail is out of
        // scope; add a separate pricing_apply_events log if/when it's
        // needed.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: perfErr } = await (supabase.from("pricing_performance") as any)
          .upsert(perfRows, { onConflict: "property_id,date" });
        if (perfErr) {
          console.warn("[pricing/apply] pricing_performance upsert failed:", perfErr.message);
        } else {
          performance_rows_created = perfRows.length;
        }
      }

      let calendar_rates_upserted = 0;
      if (calendarRateUpserts.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: crErr } = await (supabase.from("calendar_rates") as any)
          .upsert(calendarRateUpserts, { onConflict: "property_id,date,channel_code" });
        if (crErr) {
          console.warn("[pricing/apply] calendar_rates upsert failed:", crErr.message);
        } else {
          calendar_rates_upserted = calendarRateUpserts.length;
        }
      }

      if (appliedRecIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("pricing_recommendations") as any)
          .update({ status: "applied", applied_at: appliedAt })
          .in("id", appliedRecIds);
      }

      const responseBody = {
        plan: bdcPlans[0]?.plan ?? null, // first BDC plan for backwards compat
        bdc_plans: bdcPlans,
        applied_count: appliedRecIds.length,
        skipped_count: recs.length - appliedRecIds.length,
        performance_rows_created,
        calendar_rates_upserted,
        targets: targets.map((t) => t.channel),
        applied_at: appliedAt,
        ...(failedBatches.length > 0
          ? { partial_failure: true, failed_batches: failedBatches }
          : {}),
      };
      return NextResponse.json(responseBody, { status: failedBatches.length > 0 ? 207 : 200 });
    } finally {
      await releaseLock(supabase, lockKey);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/apply]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
