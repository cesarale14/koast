/**
 * range.ts — deriveWeekendRange + helpers (M8 C2).
 *
 * Locked test list per Cesar's C2 sign-off (message 2754):
 *   1. Tight signal agreement → narrow IQR band
 *   2. High dispersion → wide IQR band
 *   3. Cohort of 3 (below threshold) → null
 *   4. Empty cohort → null
 *   5. All recs missing delta_abs → null
 *   6. Mix positive + negative deltas → range may straddle zero, no clamp
 *   7. All-positive cohort → range_low ≥ 0 (clamp invariant)
 *
 * Plus IQR-vs-stddev coverage and grammar/helper smoke per spec.
 */

import {
  deriveWeekendRange,
  weekendsNeededForRange,
  pluralizeWeekend,
  WEEKEND_RANGE_THRESHOLD,
  type RangeInputRec,
} from "../range";

function rec(delta: number | null, signal: string = "demand"): RangeInputRec {
  return {
    delta_abs: delta,
    reason_signals: { [signal]: { score: 1, weight: 0.2, reason: "test" } },
  };
}

describe("deriveWeekendRange — locked test list", () => {
  test("1. tight signal agreement → narrow IQR band, 8 weekends", () => {
    // Deltas tightly clustered $30-$37; IQR pulls Q1 ≈ $31.75, Q3 ≈ $35.25.
    const recs = [30, 31, 32, 33, 34, 35, 36, 37].map((d) => rec(d));
    const range = deriveWeekendRange(recs);
    expect(range).not.toBeNull();
    expect(range!.n_recs_contributing).toBe(8);
    expect(range!.range_low).toBe(32); // round(31.75)
    expect(range!.range_high).toBe(35); // round(35.25)
    expect(range!.center).toBe(34); // round(median 33.5)
    expect(range!.range_high - range!.range_low).toBeLessThanOrEqual(4);
  });

  test("2. high dispersion → wide IQR band, same 8-cohort size", () => {
    // Deltas spread $10-$80; IQR captures the spread without outlier blowup.
    const recs = [10, 15, 20, 25, 30, 40, 55, 80].map((d) => rec(d));
    const range = deriveWeekendRange(recs);
    expect(range).not.toBeNull();
    expect(range!.n_recs_contributing).toBe(8);
    expect(range!.range_high - range!.range_low).toBeGreaterThanOrEqual(20);
  });

  test("3. cohort of 3 (below threshold) → null", () => {
    const recs = [30, 32, 34].map((d) => rec(d));
    expect(deriveWeekendRange(recs)).toBeNull();
  });

  test("4. empty cohort → null", () => {
    expect(deriveWeekendRange([])).toBeNull();
  });

  test("5. all recs missing delta_abs → null", () => {
    const recs: RangeInputRec[] = [null, null, null, null, null].map((d) => ({
      delta_abs: d,
      reason_signals: { demand: { score: 1, weight: 0.2, reason: "x" } },
    }));
    expect(deriveWeekendRange(recs)).toBeNull();
  });

  test("6. mix positive + negative deltas → range may straddle zero, no clamp", () => {
    // Symmetric around zero — clamp must NOT activate.
    const recs = [-20, -10, -5, 0, 5, 10, 15, 25].map((d) => rec(d));
    const range = deriveWeekendRange(recs);
    expect(range).not.toBeNull();
    expect(range!.range_low).toBeLessThan(0);
    expect(range!.range_high).toBeGreaterThan(0);
  });

  test("7. all-positive cohort → range_low ≥ 0 (clamp invariant)", () => {
    // All deltas ≥ 0. IQR by construction yields q1 ≥ 0; clamp is defensive.
    const recs = [5, 10, 15, 20, 25, 30, 35, 40].map((d) => rec(d));
    const range = deriveWeekendRange(recs);
    expect(range).not.toBeNull();
    expect(range!.range_low).toBeGreaterThanOrEqual(0);
  });
});

describe("deriveWeekendRange — IQR vs stddev choice (spec verification)", () => {
  test("single extreme outlier does not blow up the band", () => {
    // 7 tightly-clustered weekends + 1 wild outlier. Stddev would balloon
    // the band; IQR ignores the outlier (it falls above Q3).
    const tight = [30, 31, 32, 33, 34, 35, 36];
    const outlier = 250;
    const recs = [...tight, outlier].map((d) => rec(d));
    const range = deriveWeekendRange(recs);
    expect(range).not.toBeNull();
    // Q3 of [30..36, 250] sorted = position 5.25 of [30,31,32,33,34,35,36,250]
    // ≈ 35.25 — outlier sits above Q3, doesn't pull it.
    expect(range!.range_high).toBeLessThan(50);
  });

  test("invalid recs (no signals) excluded from cohort count", () => {
    const validRecs = [30, 32, 34, 36].map((d) => rec(d));
    const invalidRec: RangeInputRec = {
      delta_abs: 100,
      reason_signals: { clamps: { raw_engine_suggestion: 100, clamped_by: [], guardrail_trips: [] } },
    };
    const range = deriveWeekendRange([...validRecs, invalidRec]);
    expect(range).not.toBeNull();
    expect(range!.n_recs_contributing).toBe(4); // invalid rec excluded
  });

  test("threshold override respected", () => {
    const recs = [30, 32, 34].map((d) => rec(d));
    // Default threshold (4) → null. Override to 3 → returns range.
    expect(deriveWeekendRange(recs)).toBeNull();
    expect(deriveWeekendRange(recs, { threshold: 3 })).not.toBeNull();
  });

  test("time_period_days copied through", () => {
    const recs = [30, 32, 34, 36, 38].map((d) => rec(d));
    const range = deriveWeekendRange(recs, { time_period_days: 60 });
    expect(range!.time_period_days).toBe(60);
    expect(deriveWeekendRange(recs)!.time_period_days).toBe(90); // default
  });
});

describe("weekendsNeededForRange + pluralizeWeekend", () => {
  test("returns threshold − cohortSize when cohort below threshold", () => {
    expect(weekendsNeededForRange(0)).toBe(WEEKEND_RANGE_THRESHOLD);
    expect(weekendsNeededForRange(1)).toBe(3);
    expect(weekendsNeededForRange(3)).toBe(1);
  });

  test("floored at 1 (never zero — that case is upstream)", () => {
    expect(weekendsNeededForRange(4)).toBe(1);
    expect(weekendsNeededForRange(10)).toBe(1);
  });

  test("pluralization: 1 → singular, >1 → plural", () => {
    expect(pluralizeWeekend(1)).toBe("weekend");
    expect(pluralizeWeekend(2)).toBe("weekends");
    expect(pluralizeWeekend(3)).toBe("weekends");
  });
});
