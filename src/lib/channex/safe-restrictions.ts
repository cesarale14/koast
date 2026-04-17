/**
 * Track B Stage 1 — safe-restrictions helper for BDC calendar writes.
 *
 * This is the canonical "never clobber host-managed BDC state" pipeline.
 * Every code path that writes BDC restrictions goes through here.
 *
 * Context: docs/postmortems/INCIDENT_POSTMORTEM_BDC_CLOBBER.md. The old
 * /activate path did a write-only 365-day sweep with defaults (availability=1,
 * stop_sell=false, min_stay_arrival=1) for any date where Koast had no
 * opinion, re-opening dates the host had manually closed on the Booking.com
 * extranet. This helper fixes that by reading current BDC state first and
 * only emitting writes that are safe to apply.
 *
 * Behavior matrix (per date):
 *
 *   BDC status     | Koast proposed         | Outcome
 *   ---------------|------------------------|----------------------------
 *   not returned   | any                    | skipped:bdc_state_missing
 *   any            | no entry in map        | skipped silently, no push
 *   closed         | availability=0/stop    | skipped:both_agree_closed
 *   closed         | availability=1         | skipped:bdc_closed_koast_would_reopen
 *   open           | availability=0         | push, dates_to_close
 *   open           | availability=1 (same)  | no avail field in push
 *   any            | rate within ±10% BDC   | push rate
 *   any            | rate diverges >10%     | skipped:rate_delta_exceeds_threshold
 *   any            | rate set, BDC unset    | push rate (establish initial)
 *   any            | no rate                | no rate field in push
 *   any            | min_stay >= BDC        | push min_stay
 *   BDC min_stay>1 | min_stay < BDC         | skipped:bdc_stricter_min_stay
 *
 * The helper ONLY builds a plan — it never calls updateRestrictions.
 * Caller's responsibility: convert the plan to Channex cents payload +
 * batch + push. See toChannexRestrictionValues() below.
 */

import type { createChannexClient } from "./client";
type ChannexClient = ReturnType<typeof createChannexClient>;

// ---- Public shapes -------------------------------------------------------

export type KoastRestrictionProposal = {
  /** Nightly rate in DOLLARS (not cents). */
  rate?: number;
  /** 0 = closed, 1 = open. */
  availability?: number;
  stop_sell?: boolean;
  min_stay_arrival?: number;
};

export type PlanEntry = {
  date: string;
  /** Rate in DOLLARS — convert to cents at push time. */
  rate?: number;
  availability?: number;
  stop_sell?: boolean;
  min_stay_arrival?: number;
};

export type SafeRestrictionPlan = {
  entries_to_push: PlanEntry[];
  dates_to_open: string[];
  dates_to_close: string[];
  rate_changes: Array<{ date: string; from: number; to: number; delta_pct: number }>;
  min_stay_changes: Array<{ date: string; from: number | null; to: number }>;
  skipped_fields: Array<{
    date: string;
    /** Which field was preserved. "all" when BDC-closed or state-missing. */
    field: "all" | "rate" | "min_stay_arrival";
    reason:
      | "bdc_state_missing"
      | "bdc_closed_all_fields_preserved"
      | "rate_delta_exceeds_threshold"
      | "bdc_stricter_min_stay";
    bdc_value: unknown;
    koast_value: unknown;
  }>;
  bdc_state_fetched_at: string;
};

// ---- Helper --------------------------------------------------------------

/**
 * Build a SafeRestrictionPlan for a BDC rate plan on the given date range.
 * Throws if the BDC pre-flight read fails — the caller should NOT fall back
 * to "assume nothing exists" (that's how we got the clobber).
 */
export async function buildSafeBdcRestrictions(opts: {
  channex: ChannexClient;
  channexPropertyId: string;
  bdcRatePlanId: string;
  /** Inclusive start date, 'YYYY-MM-DD'. */
  dateFrom: string;
  /** Inclusive end date, 'YYYY-MM-DD'. */
  dateTo: string;
  koastProposed: Map<string, KoastRestrictionProposal>;
  /** Fraction. 0.10 = ±10%. Rates outside this band are skipped. */
  rateDeltaThresholdPct?: number;
}): Promise<SafeRestrictionPlan> {
  const {
    channex,
    channexPropertyId,
    bdcRatePlanId,
    dateFrom,
    dateTo,
    koastProposed,
    rateDeltaThresholdPct = 0.10,
  } = opts;

  // STEP 1 — Pre-flight read. getRestrictionsBucketed returns
  // { rate_plan_id: { 'YYYY-MM-DD': { rate, availability, stop_sell, min_stay_arrival } } }
  const bucketed = await channex.getRestrictionsBucketed(
    channexPropertyId,
    dateFrom,
    dateTo,
    ["rate", "availability", "min_stay_arrival", "stop_sell"]
  );
  const fetchedAt = new Date().toISOString();
  const bdcPlanState = bucketed[bdcRatePlanId] ?? {};

  // Build a normalized Map<date, {rate, availability, stop_sell, min_stay_arrival}>.
  // Channex's `rate` field comes back as a string like "222.00"; normalize to number.
  const bdcByDate = new Map<string, {
    rate: number | null;
    availability: number | null;
    stop_sell: boolean | null;
    min_stay_arrival: number | null;
  }>();
  for (const [date, stateRaw] of Object.entries(bdcPlanState)) {
    const state = stateRaw as {
      rate?: string;
      availability?: number;
      stop_sell?: boolean;
      min_stay_arrival?: number;
    };
    const rateStr = state.rate;
    const rateNum =
      typeof rateStr === "string" && rateStr !== "" ? Number(rateStr) : null;
    // Channex sometimes reports "0.00" for dates that have never had a rate
    // pushed (newly created rate plans, past dates). Treat 0 as "unset"
    // because a $0 nightly rate is never legitimate for a vacation rental.
    const rate = rateNum != null && Number.isFinite(rateNum) && rateNum > 0 ? rateNum : null;
    bdcByDate.set(date, {
      rate,
      availability: typeof state.availability === "number" ? state.availability : null,
      stop_sell: typeof state.stop_sell === "boolean" ? state.stop_sell : null,
      min_stay_arrival: typeof state.min_stay_arrival === "number" ? state.min_stay_arrival : null,
    });
  }

  // STEP 2 — Per-date safe merge.
  const plan: SafeRestrictionPlan = {
    entries_to_push: [],
    dates_to_open: [],
    dates_to_close: [],
    rate_changes: [],
    min_stay_changes: [],
    skipped_fields: [],
    bdc_state_fetched_at: fetchedAt,
  };

  // Iterate the date window inclusively in UTC.
  const start = new Date(dateFrom + "T00:00:00Z");
  const end = new Date(dateTo + "T00:00:00Z");
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().split("T")[0];
    const bdc = bdcByDate.get(date) ?? null;
    const koast = koastProposed.get(date) ?? null;

    // If Channex didn't return state for this date, be defensive.
    // Shouldn't happen for valid date ranges, but skip rather than guess.
    if (bdc === null) {
      if (koast !== null) {
        plan.skipped_fields.push({
          date,
          field: "all",
          reason: "bdc_state_missing",
          bdc_value: null,
          koast_value: koast,
        });
      }
      continue;
    }

    // Koast has no opinion for this date — leave BDC alone.
    if (koast === null) continue;

    // STRICT: BDC-closed means host intent, preserve ALL fields.
    // If BDC says availability=0 OR stop_sell=true, short-circuit every
    // per-field check. No rate update, no min_stay update, no re-open —
    // nothing. A rate update on a closed date might surprise the host
    // when they later reopen; the safest behavior is total preservation.
    const bdcIsClosed = bdc.availability === 0 || bdc.stop_sell === true;
    if (bdcIsClosed) {
      plan.skipped_fields.push({
        date,
        field: "all",
        reason: "bdc_closed_all_fields_preserved",
        bdc_value: bdc,
        koast_value: koast,
      });
      continue;
    }

    // BDC is open — evaluate each field independently.
    const entry: PlanEntry = { date };
    let entryHasContent = false;

    // F2 — Availability merge (BDC already open, so this is safe to write).
    if (koast.availability !== undefined && koast.availability !== bdc.availability) {
      entry.availability = koast.availability;
      entryHasContent = true;
      if (koast.availability === 0) plan.dates_to_close.push(date);
      else plan.dates_to_open.push(date);
    }
    if (koast.stop_sell !== undefined && koast.stop_sell !== (bdc.stop_sell ?? false)) {
      entry.stop_sell = koast.stop_sell;
      entryHasContent = true;
      if (koast.stop_sell === true) plan.dates_to_close.push(date);
    }

    // F3 — Rate preservation.
    if (koast.rate !== undefined) {
      if (bdc.rate === null) {
        // Channex returns rate="0.00" for never-pushed dates on new rate
        // plans. Treated as unset — Koast can safely establish a first rate
        // here without overwriting host-set data.
        entry.rate = koast.rate;
        entryHasContent = true;
      } else {
        const deltaPct = Math.abs(koast.rate - bdc.rate) / bdc.rate;
        if (deltaPct > rateDeltaThresholdPct) {
          plan.skipped_fields.push({
            date,
            field: "rate",
            reason: "rate_delta_exceeds_threshold",
            bdc_value: bdc.rate,
            koast_value: koast.rate,
          });
        } else {
          entry.rate = koast.rate;
          entryHasContent = true;
          if (koast.rate !== bdc.rate) {
            plan.rate_changes.push({
              date,
              from: bdc.rate,
              to: koast.rate,
              delta_pct: deltaPct,
            });
          }
        }
      }
    }

    // F4 — Min-stay preservation. If BDC has a stricter restriction, don't weaken it.
    if (koast.min_stay_arrival !== undefined) {
      if (
        bdc.min_stay_arrival != null &&
        bdc.min_stay_arrival > 1 &&
        koast.min_stay_arrival < bdc.min_stay_arrival
      ) {
        plan.skipped_fields.push({
          date,
          field: "min_stay_arrival",
          reason: "bdc_stricter_min_stay",
          bdc_value: bdc.min_stay_arrival,
          koast_value: koast.min_stay_arrival,
        });
      } else {
        entry.min_stay_arrival = koast.min_stay_arrival;
        entryHasContent = true;
        if (koast.min_stay_arrival !== bdc.min_stay_arrival) {
          plan.min_stay_changes.push({
            date,
            from: bdc.min_stay_arrival ?? null,
            to: koast.min_stay_arrival,
          });
        }
      }
    }

    if (entryHasContent) plan.entries_to_push.push(entry);
  }

  return plan;
}

// ---- Converter for the Channex payload ----------------------------------

/**
 * Convert a SafeRestrictionPlan into the batched payload Channex's
 * updateRestrictions expects. Rate is in CENTS. Caller is responsible
 * for batching (typically 200 entries per call).
 */
export function toChannexRestrictionValues(
  plan: SafeRestrictionPlan,
  channexPropertyId: string,
  bdcRatePlanId: string
): Array<{
  property_id: string;
  rate_plan_id: string;
  date_from: string;
  date_to: string;
  rate?: number;
  availability?: number;
  stop_sell?: boolean;
  min_stay_arrival?: number;
}> {
  return plan.entries_to_push.map((e) => {
    const out: {
      property_id: string;
      rate_plan_id: string;
      date_from: string;
      date_to: string;
      rate?: number;
      availability?: number;
      stop_sell?: boolean;
      min_stay_arrival?: number;
    } = {
      property_id: channexPropertyId,
      rate_plan_id: bdcRatePlanId,
      date_from: e.date,
      date_to: e.date,
    };
    if (e.rate !== undefined) out.rate = Math.round(e.rate * 100);
    if (e.availability !== undefined) out.availability = e.availability;
    if (e.stop_sell !== undefined) out.stop_sell = e.stop_sell;
    if (e.min_stay_arrival !== undefined) out.min_stay_arrival = e.min_stay_arrival;
    return out;
  });
}
