/**
 * OTA apply dispatch (P3.2 — HARD-FLOOR, BDC clobber class).
 *
 * The SINGLE per-channel write path the OTA proposal actions (block_dates /
 * adjust_price / set_min_stay) share with the calendar rate-apply route — so the
 * agent's hands never get a parallel push implementation (no side-door). It does
 * exactly what /api/pricing/apply + /api/calendar/rates/apply already do inline:
 *
 *   - resolve the property's active channels with a rate plan
 *   - BDC targets route through buildSafeBdcRestrictions (read-first safe-merge:
 *     never re-opens a BDC-closed date, ±10% rate band, never weakens min-stay).
 *     BLOCK = availability=0 (NEVER stop_sell — stop_sell closes the whole
 *     property on BDC; see CLAUDE.md Channex learnings).
 *   - non-BDC targets push rate / min_stay_arrival directly via updateRestrictions
 *
 * KNOWN GAP (documented, fail-closed): non-BDC AVAILABILITY changes (a block on
 * Airbnb/Direct) require the room-type `/availability` endpoint, which is NOT yet
 * wrapped in a read-first safe pattern (the /activate 365-day clobber path). This
 * dispatch REFUSES non-BDC availability changes (skip reason
 * `non_bdc_availability_unwrapped`) rather than emit an un-wrapped room-type
 * write. BDC blocks work today; non-BDC blocks are deferred-not-unsafe.
 *
 * EXECUTION-IMPOSSIBLE WHILE OFF (belt 3 of 3): this refuses outright when
 * `isCalendarPushEnabled()` is false — independent of the ProposalCard executable
 * gate (belt 1) and executeProposal's otaTouching refusal (belt 2). The unified
 * gate (R-5) means all three read the SAME predicate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createChannexClient } from "./client";
import {
  isCalendarPushEnabled,
  isBdcChannelCode,
} from "./calendar-push-gate";
import {
  buildSafeBdcRestrictions,
  toChannexRestrictionValues,
  type KoastRestrictionProposal,
} from "./safe-restrictions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any, any, any>;
type ChannexClient = ReturnType<typeof createChannexClient>;

export type OtaApplySkip = { channel_code: string; reason: string };

export type OtaApplyResult = {
  /** true when nothing failed AND at least one channel actually pushed. */
  ok: boolean;
  pushedChannels: string[];
  failedChannels: Array<{ channel_code: string; error: string }>;
  skipped: OtaApplySkip[];
  /** Per-date set of channel_codes that accepted a push (for local-state mirroring). */
  successByDate: Map<string, Set<string>>;
  /** Present only on a hard refusal (gate off / no target / not connected). */
  refusedReason?: string;
};

function emptyResult(refusedReason?: string): OtaApplyResult {
  return {
    ok: false,
    pushedChannels: [],
    failedChannels: [],
    skipped: [],
    successByDate: new Map(),
    refusedReason,
  };
}

/** A non-BDC restriction op is "availability-touching" iff it asks to CLOSE
 *  a date (availability=0). availability=1 is a no-op on the restrictions path
 *  (bookability is room-type state); undefined is not an availability op. */
function isNonBdcBlock(p: KoastRestrictionProposal): boolean {
  return p.availability === 0;
}

/**
 * Push a per-date restriction set to a property's channels through the safe path.
 *
 * @param svc        service-role client (channel/property reads)
 * @param opts.perDate  Map<'YYYY-MM-DD', KoastRestrictionProposal> — the homogeneous
 *                      intent of one OTA op (all rate, all availability, or all min_stay)
 * @param opts.targetChannel  restrict to one channel_code (upper-cased), or null = all
 * @param opts.channex  injectable for tests; defaults to createChannexClient()
 */
export async function applyOtaRestrictions(
  svc: Svc,
  opts: {
    propertyId: string;
    perDate: Map<string, KoastRestrictionProposal>;
    targetChannel?: string | null;
    channex?: ChannexClient;
  },
): Promise<OtaApplyResult> {
  // BELT 3 — hard refusal while OTA writes are disabled. Independent of the UI
  // gate and executeProposal's guard; all three share the unified predicate.
  if (!isCalendarPushEnabled()) return emptyResult("ota_writes_disabled");

  if (opts.perDate.size === 0) return emptyResult("no_dates");

  // Resolve the Channex property id.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (svc.from("properties") as any)
    .select("id, channex_property_id")
    .eq("id", opts.propertyId)
    .maybeSingle();
  if (!prop?.channex_property_id) return emptyResult("property_not_connected");
  const channexPropertyId: string = prop.channex_property_id;

  // Resolve active channels with a configured rate plan.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: channelLinks } = await (svc.from("property_channels") as any)
    .select("channel_code, settings, status")
    .eq("property_id", opts.propertyId)
    .eq("status", "active");

  const wantCode = opts.targetChannel ? opts.targetChannel.toUpperCase() : null;
  const targets = ((channelLinks ?? []) as Array<{
    channel_code: string;
    settings: { rate_plan_id?: string } | null;
  }>)
    .filter((l) => l.settings?.rate_plan_id)
    .map((l) => ({ channel_code: l.channel_code.toUpperCase(), rate_plan_id: l.settings!.rate_plan_id as string }))
    .filter((t) => (wantCode ? t.channel_code === wantCode : true));

  if (targets.length === 0) return emptyResult("no_target_channel");

  const dates = Array.from(opts.perDate.keys()).sort();
  const dateFrom = dates[0];
  const dateTo = dates[dates.length - 1];

  const channex = opts.channex ?? createChannexClient();
  const result: OtaApplyResult = {
    ok: false,
    pushedChannels: [],
    failedChannels: [],
    skipped: [],
    successByDate: new Map(),
    refusedReason: undefined,
  };

  const markSuccess = (date: string, channel: string) => {
    if (!result.successByDate.has(date)) result.successByDate.set(date, new Set());
    result.successByDate.get(date)!.add(channel);
  };

  for (const t of targets) {
    try {
      if (isBdcChannelCode(t.channel_code)) {
        // BDC — always through the safe-merge. block=availability=0 rides the
        // restrictions payload; safe-restrictions preserves host-closed dates.
        const plan = await buildSafeBdcRestrictions({
          channex,
          channexPropertyId,
          bdcRatePlanId: t.rate_plan_id,
          dateFrom,
          dateTo,
          koastProposed: opts.perDate,
        });
        if (plan.entries_to_push.length === 0) {
          result.skipped.push({ channel_code: t.channel_code, reason: "safe_restrictions_skipped_all" });
          continue;
        }
        const payload = toChannexRestrictionValues(plan, channexPropertyId, t.rate_plan_id);
        for (let i = 0; i < payload.length; i += 200) {
          const batch = payload.slice(i, i + 200);
          await channex.updateRestrictions(batch);
          for (const e of batch) markSuccess(e.date_from, t.channel_code);
        }
        result.pushedChannels.push(t.channel_code);
      } else {
        // Non-BDC — direct restrictions push for rate / min_stay only. An
        // availability CLOSE (block) needs the room-type endpoint we haven't
        // wrapped yet: refuse rather than emit an un-wrapped room-type write.
        const blockedDates = Array.from(opts.perDate.entries()).filter(([, p]) => isNonBdcBlock(p));
        if (blockedDates.length > 0) {
          result.skipped.push({ channel_code: t.channel_code, reason: "non_bdc_availability_unwrapped" });
          continue;
        }
        // Build per-date restriction values carrying only the fields present
        // (rate in cents, min_stay_arrival). availability is never sent here.
        const values: Array<{
          property_id: string;
          rate_plan_id: string;
          date_from: string;
          date_to: string;
          rate?: number;
          min_stay_arrival?: number;
        }> = [];
        for (const [date, p] of Array.from(opts.perDate.entries())) {
          const v: { property_id: string; rate_plan_id: string; date_from: string; date_to: string; rate?: number; min_stay_arrival?: number } = {
            property_id: channexPropertyId,
            rate_plan_id: t.rate_plan_id,
            date_from: date,
            date_to: date,
          };
          if (p.rate !== undefined) v.rate = Math.round(p.rate * 100);
          if (p.min_stay_arrival !== undefined) v.min_stay_arrival = p.min_stay_arrival;
          // Skip a date that carries no non-availability field for non-BDC.
          if (v.rate === undefined && v.min_stay_arrival === undefined) continue;
          values.push(v);
        }
        if (values.length === 0) {
          result.skipped.push({ channel_code: t.channel_code, reason: "no_non_bdc_field" });
          continue;
        }
        for (let i = 0; i < values.length; i += 200) {
          const batch = values.slice(i, i + 200);
          await channex.updateRestrictions(batch);
          for (const e of batch) markSuccess(e.date_from, t.channel_code);
        }
        result.pushedChannels.push(t.channel_code);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.failedChannels.push({ channel_code: t.channel_code, error: msg });
      console.error(`[ota-apply ${t.channel_code}]`, msg);
    }
  }

  result.ok = result.failedChannels.length === 0 && result.pushedChannels.length > 0;
  return result;
}
