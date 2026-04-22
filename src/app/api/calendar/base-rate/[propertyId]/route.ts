/**
 * POST /api/calendar/base-rate/[propertyId]
 *
 * Session 5b.3 — bulk update the Koast-side base rate (the
 * calendar_rates row with channel_code IS NULL) for one or more
 * dates. DB-only; does NOT call Channex. Base rate is engine
 * intent and platform overrides are kept intact.
 *
 * Session 5b.4 — optional master-push. When body.masterPush is
 * true, after the base row upsert the route ALSO writes per-channel
 * override rows for every active channel in property_channels AND
 * calls Channex.updateRestrictions for each channel's rate plan.
 * Per-channel failures are collected into the response; one
 * channel's failure never blocks another's push.
 *
 * Request body:
 *   { dates: string[], rate: number, masterPush?: boolean }
 *
 * Response:
 *   masterPush=false (default):
 *     200 { ok: true, updated: number, dates: string[] }
 *   masterPush=true:
 *     200 { ok: true, base: { updated, dates }, channels: { <code>: { pushed, failed } } }
 *   400 on validation
 *   401/403 on auth/ownership
 *   500 on base DB failure (no channel pushes attempted)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import { CALENDAR_PUSH_DISABLED_MESSAGE, isBdcChannelCode, isCalendarPushEnabled } from "@/lib/channex/calendar-push-gate";
import { buildSafeBdcRestrictions, toChannexRestrictionValues, type KoastRestrictionProposal } from "@/lib/channex/safe-restrictions";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function groupContiguousDates(sorted: string[]): Array<{ from: string; to: string; dates: string[] }> {
  const groups: Array<{ from: string; to: string; dates: string[] }> = [];
  if (sorted.length === 0) return groups;
  let groupStart = sorted[0];
  let groupEnd = sorted[0];
  let acc: string[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(groupEnd + "T00:00:00Z");
    const next = new Date(sorted[i] + "T00:00:00Z");
    const delta = (next.getTime() - prev.getTime()) / 86_400_000;
    if (delta === 1) {
      groupEnd = sorted[i];
      acc.push(sorted[i]);
    } else {
      groups.push({ from: groupStart, to: groupEnd, dates: acc });
      groupStart = sorted[i];
      groupEnd = sorted[i];
      acc = [sorted[i]];
    }
  }
  groups.push({ from: groupStart, to: groupEnd, dates: acc });
  return groups;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const { dates, rate, masterPush } = body as { dates?: unknown; rate?: unknown; masterPush?: unknown };

    if (!Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json({ error: "dates must be a non-empty array" }, { status: 400 });
    }
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: "rate must be a positive number" }, { status: 400 });
    }
    const dateList: string[] = [];
    for (const d of dates) {
      if (typeof d !== "string" || !DATE_RE.test(d)) {
        return NextResponse.json({ error: `invalid date: ${d}` }, { status: 400 });
      }
      if (!dateList.includes(d)) dateList.push(d);
    }
    dateList.sort();
    const wantsMasterPush = masterPush === true;

    const supabase = createServiceClient();
    const propertyId = params.propertyId;

    // --- Step 1: upsert base rows. Always runs. ----------------------------
    const baseRows = dateList.map((date) => ({
      property_id: propertyId,
      date,
      channel_code: null as string | null,
      base_rate: rate,
      applied_rate: rate,
      rate_source: "manual",
      is_available: true,
      min_stay: 1,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upErr } = await (supabase.from("calendar_rates") as any)
      .upsert(baseRows, { onConflict: "property_id,date,channel_code" });
    if (upErr) {
      console.error("[calendar/base-rate POST]", upErr);
      return NextResponse.json({ error: `DB upsert failed: ${upErr.message}` }, { status: 500 });
    }

    // Non-master path — mirror the 5b.3 shape exactly.
    if (!wantsMasterPush) {
      return NextResponse.json({ ok: true, updated: dateList.length, dates: dateList });
    }

    // --- Step 2: master push. Fetch active channels + rate plans ----------
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: propRow } = await (supabase.from("properties") as any)
      .select("id, channex_property_id")
      .eq("id", propertyId)
      .maybeSingle();
    if (!propRow?.channex_property_id) {
      return NextResponse.json({
        ok: true,
        base: { updated: dateList.length, dates: dateList },
        channels: {},
        note: "property_not_connected_to_channex",
      });
    }
    const channexPropertyId: string = propRow.channex_property_id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: channelLinks } = await (supabase.from("property_channels") as any)
      .select("channel_code, settings")
      .eq("property_id", propertyId)
      .eq("status", "active");
    const links = ((channelLinks ?? []) as Array<{ channel_code: string; settings: { rate_plan_id?: string } | null }>)
      .filter((l) => l.settings?.rate_plan_id)
      .map((l) => ({ code: l.channel_code.toUpperCase(), ratePlanId: l.settings!.rate_plan_id as string }));

    const channels: Record<string, { pushed: number; failed: Array<{ date: string; error: string }> }> = {};

    if (links.length === 0) {
      return NextResponse.json({
        ok: true,
        base: { updated: dateList.length, dates: dateList },
        channels,
      });
    }

    // Respect the BDC calendar-push gate. If any target is BDC and the
    // gate is off, we skip BDC but STILL push non-BDC channels so the
    // host gets partial value.
    const gateOpen = isCalendarPushEnabled();
    const channex = createChannexClient();
    const pushedAt = new Date().toISOString();

    for (const link of links) {
      const { code, ratePlanId } = link;
      channels[code] = { pushed: 0, failed: [] };

      const isBdc = isBdcChannelCode(code);
      if (isBdc && !gateOpen) {
        for (const d of dateList) {
          channels[code].failed.push({ date: d, error: CALENDAR_PUSH_DISABLED_MESSAGE });
        }
        continue;
      }

      const perChannelOverrideRows = dateList.map((d) => ({
        property_id: propertyId,
        date: d,
        channel_code: code,
        applied_rate: rate,
        base_rate: rate,
        min_stay: 1,
        is_available: true,
        rate_source: "manual_per_channel",
        channex_rate_plan_id: ratePlanId,
        last_pushed_at: pushedAt,
        last_channex_rate: rate,
      }));

      // BDC path: group dates into contiguous ranges, safe-restrictions
      // each range.
      if (isBdc) {
        const groups = groupContiguousDates(dateList);
        const successfulDates = new Set<string>();
        for (const g of groups) {
          const koastProposed = new Map<string, KoastRestrictionProposal>();
          for (const d of g.dates) koastProposed.set(d, { rate });
          try {
            const plan = await buildSafeBdcRestrictions({
              channex,
              channexPropertyId,
              bdcRatePlanId: ratePlanId,
              dateFrom: g.from,
              dateTo: g.to,
              koastProposed,
            });
            const payload = toChannexRestrictionValues(plan, channexPropertyId, ratePlanId);
            for (let i = 0; i < payload.length; i += 200) {
              await channex.updateRestrictions(payload.slice(i, i + 200));
            }
            for (const d of g.dates) successfulDates.add(d);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            for (const d of g.dates) channels[code].failed.push({ date: d, error: msg });
          }
        }
        channels[code].pushed = successfulDates.size;
        // Only upsert calendar_rates for dates that actually landed in Channex.
        const successfulRows = perChannelOverrideRows.filter((r) => successfulDates.has(r.date));
        if (successfulRows.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("calendar_rates") as any)
            .upsert(successfulRows, { onConflict: "property_id,date,channel_code" });
        }
        continue;
      }

      // Non-BDC: one restriction entry per date, rate in cents.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const restrictionValues: any[] = dateList.map((d) => ({
        property_id: channexPropertyId,
        rate_plan_id: ratePlanId,
        date_from: d,
        date_to: d,
        rate: Math.round(rate * 100),
      }));
      const successfulDates = new Set<string>();
      for (let i = 0; i < restrictionValues.length; i += 200) {
        const slice = restrictionValues.slice(i, i + 200);
        const batchDates = dateList.slice(i, i + 200);
        try {
          await channex.updateRestrictions(slice);
          for (const d of batchDates) successfulDates.add(d);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          for (const d of batchDates) channels[code].failed.push({ date: d, error: msg });
        }
      }
      channels[code].pushed = successfulDates.size;
      const successfulRows = perChannelOverrideRows.filter((r) => successfulDates.has(r.date));
      if (successfulRows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("calendar_rates") as any)
          .upsert(successfulRows, { onConflict: "property_id,date,channel_code" });
      }
    }

    return NextResponse.json({
      ok: true,
      base: { updated: dateList.length, dates: dateList },
      channels,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[calendar/base-rate POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
