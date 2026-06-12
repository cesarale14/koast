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
 *   7. Push through applyOtaRestrictions (H3.3 — the ONE canonical writer; BDC →
 *      buildSafeBdcRestrictions, non-BDC → direct, per-batch partial failure).
 *      capturePriorState does the non-BDC pre-flight for M2 revert.
 *   8. From the writer's result: upsert calendar_rates + pricing_performance,
 *      mark recommendation status='applied', assemble the revert prior_state
 *      (priorStateFromBdcPlan over result.bdcPlans + result.priorStateByChannel).
 *   9. Return { plan, bdc_plans, applied_count, skipped_count,
 *               performance_rows_created, calendar_rates_upserted, targets,
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
import { acquireLock, releaseLock } from "@/lib/concurrency/locks";
import {
  CALENDAR_PUSH_DISABLED_MESSAGE,
  isCalendarPushEnabled,
} from "@/lib/channex/calendar-push-gate";
import {
  priorStateFromBdcPlan,
  type CapturedPriorState,
  type KoastRestrictionProposal,
} from "@/lib/channex/safe-restrictions";
import { applyOtaRestrictions } from "@/lib/channex/ota-apply";

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
      // Early "not connected" guard for a clean 400; applyOtaRestrictions
      // re-resolves the channex property id itself.
      if (!prop?.channex_property_id) {
        return NextResponse.json({ error: "Property not connected to Channex" }, { status: 400 });
      }

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

      // H3.3 — the push goes through the ONE canonical writer (applyOtaRestrictions).
      // capturePriorState performs the non-BDC pre-flight (M2 revert) inside the
      // writer; BDC prior state rides apply.bdcPlans. Everything downstream
      // (pricing_performance, calendar_rates, the audit prior_state + response) is
      // assembled from the writer's result, preserving the exact prior shapes.
      const appliedAt = new Date().toISOString();
      const apply = await applyOtaRestrictions(supabase, {
        propertyId,
        perDate: koastProposed,
        capturePriorState: true,
      });
      const successByDate = apply.successByDate;
      // Re-shape to the names + shapes the downstream audit/response already use:
      // bdcPlans is [{ rate_plan_id, channel, plan }]; nonBdcPriorStates is
      // Map<channel, Map<date, CapturedPriorState>>.
      const bdcPlans = apply.bdcPlans.map((b) => ({
        rate_plan_id: b.rate_plan_id,
        channel: b.channel_code,
        plan: b.plan,
      }));
      const nonBdcPriorStates = apply.priorStateByChannel;
      // failed_batches preserved (UI reads .length + partial_failure); one entry
      // per failed channel, carrying the run's date span.
      const failedBatches = apply.failedChannels.map((fc) => ({
        batch_index: 0,
        date_range: `${dateFrom}..${dateTo}`,
        error: fc.error,
        size: 0,
        target: fc.channel_code,
      }));
      // calendar_rates: one override row per successfully-pushed (date, channel)
      // (Session 5a.1 Fix 3 semantics — only landed entries reach local state).
      const ratePlanByChannel = new Map(apply.targets.map((t) => [t.channel_code, t.rate_plan_id]));
      const calendarRateUpserts: Array<Record<string, unknown>> = [];
      for (const [date, channels] of Array.from(successByDate.entries())) {
        const rec = recByDate.get(date);
        if (!rec) continue;
        for (const ch of Array.from(channels)) {
          calendarRateUpserts.push({
            property_id: propertyId,
            date,
            channel_code: ch,
            applied_rate: rec.suggested_rate,
            rate_source: "engine",
            is_available: true,
            channex_rate_plan_id: ratePlanByChannel.get(ch),
            last_pushed_at: appliedAt,
            last_channex_rate: rec.suggested_rate,
          });
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

      // M9 Phase G E2: pricing_apply action_type seeding per M8 Phase A
      // non-gating CF. VIEW unified_audit_feed (migration 20260507040000)
      // maps 'pricing_apply' → 'rate_push' category; this INSERT lights
      // up the forward-compat mapping so host-clicked applies surface in
      // the audit feed. Narrow scope per v2.6 §1.3 framing; NOT agent-
      // loop integration. INSERT gates on appliedRecIds.length > 0 —
      // pure-failure runs (0 applied) stay out of the audit feed per
      // /ultraplan §3.2 framing. Partial-failure (≥1 applied + some
      // failed batches) fires with payload.partial_failure flag.
      if (appliedRecIds.length > 0) {
        const successfulChannels = Array.from(
          new Set(
            Array.from(successByDate.values()).flatMap((s) => Array.from(s)),
          ),
        ).map(channelSlugFor);
        const partialFailure = failedBatches.length > 0;

        // M11 Phase C item 1 (M2) — assemble priorState across successful
        // (date, channel) pushes for revert precision. BDC: read from each
        // plan via priorStateFromBdcPlan (rate_changes + min_stay_changes
        // already capture the from-state). Non-BDC: read from the pre-flight
        // map (only present for channels whose pre-flight succeeded).
        const priorStateEntries: CapturedPriorState[] = [];
        // BDC contributions
        for (const bdcPlan of bdcPlans) {
          const successfulBdcDates = new Set<string>();
          for (const [date, channels] of Array.from(successByDate.entries())) {
            if (channels.has(bdcPlan.channel)) successfulBdcDates.add(date);
          }
          priorStateEntries.push(
            ...priorStateFromBdcPlan(bdcPlan.plan, bdcPlan.channel, successfulBdcDates),
          );
        }
        // Non-BDC contributions
        for (const [channel, stateMap] of Array.from(nonBdcPriorStates.entries())) {
          for (const [date, channels] of Array.from(successByDate.entries())) {
            if (!channels.has(channel)) continue;
            const prior = stateMap.get(date);
            if (!prior) continue;
            // Only emit if there's something to revert (rate or min_stay
            // was non-null pre-push).
            if (prior.rate === null && prior.min_stay_arrival === null) continue;
            priorStateEntries.push(prior);
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: auditErr } = await (supabase.from("agent_audit_log") as any)
          .insert({
            host_id: user.id,
            action_type: "pricing_apply",
            source: "frontend_api",
            actor_kind: "host",
            actor_id: user.id,
            autonomy_level: "confirmed",
            outcome: "succeeded",
            created_at: appliedAt,
            payload: {
              property_id: propertyId,
              applied_count: appliedRecIds.length,
              channels_pushed: successfulChannels,
              recommendation_ids: appliedRecIds,
              // M11 Phase C item 1 (M2): prior_state for revert. Only
              // dates+channels that actually pushed AND had a non-null
              // pre-state field are listed. Empty array allowed (no
              // revertable dates → no revert button).
              prior_state: priorStateEntries,
              ...(partialFailure && {
                partial_failure: true,
                failed_batches: failedBatches,
              }),
            },
            context: {
              idempotency_key,
              target_channels: targets.map((t) => t.channel),
            },
          });
        if (auditErr) {
          console.warn("[pricing/apply] agent_audit_log insert failed:", auditErr.message);
        }
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
