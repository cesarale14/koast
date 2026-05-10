/**
 * Weekend-uplift confidence-banded range derivation (M8 C2, D8/D8a/D8b).
 *
 * Render-time helper consumed by the Dashboard hero (PricingIntelligenceCard).
 * The pricing engine ships point-estimate `delta_abs` per recommendation; this
 * file computes the cohort-level interquartile band that the doctrine §3.4
 * "honest confidence" framing demands — range size IS the confidence signal,
 * no separate high/medium/low chip.
 *
 * Conventions v1.6 (D8a interpretation lock): "signal-weight dispersion from
 * reason_signals" is read as cohort dispersion of recommendations whose
 * deltas are themselves signal-weighted by the engine. Field renamed from
 * `n_signals_contributing` to `n_recs_contributing` to match.
 *
 * Threshold: 4 weekend recs (D8b lock). Below threshold returns null and the
 * caller renders the "Tracking — need ~N more weekends of data" copy.
 *
 * Robust statistic choice: IQR over sample stddev. Stddev on 4-12 points is
 * outlier-sensitive; IQR (Q1, Q3) is stable for small cohorts and aligns with
 * doctrine §3.4 (don't overclaim from thin samples).
 */

export const WEEKEND_RANGE_THRESHOLD = 4;

export interface ConfidenceBandedRangeValue {
  /** Q1 of cohort delta_abs, rounded to nearest $1. Clamped to ≥0 when all cohort deltas ≥0. */
  range_low: number;
  /** Q3 of cohort delta_abs, rounded to nearest $1. */
  range_high: number;
  /** Median of cohort delta_abs, rounded to nearest $1. */
  center: number;
  /** Count of recs that passed the validity filter (delta_abs non-null AND reason_signals non-empty). */
  n_recs_contributing: number;
  /** Lookback or forward window the caller used to assemble the cohort; copied through for the source line. */
  time_period_days: number;
}

/** Minimum recommendation shape needed for derivation. Matches
 *  `PricingRecommendation` in src/hooks/usePricingTab.ts (structural). */
export interface RangeInputRec {
  delta_abs: number | null;
  reason_signals: Record<string, unknown> | null;
}

function isValidRec(rec: RangeInputRec): boolean {
  if (rec.delta_abs == null || !Number.isFinite(rec.delta_abs)) return false;
  const signals = rec.reason_signals;
  if (!signals || typeof signals !== "object") return false;
  // "clamps" is the engine's rules-layer envelope (raw_engine_suggestion +
  // clamped_by + guardrail_trips), not a signal. A rec is only valid if it
  // has at least one true signal in addition.
  const signalKeys = Object.keys(signals).filter((k) => k !== "clamps");
  return signalKeys.length > 0;
}

function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  // Linear interpolation between adjacent samples.
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 >= sorted.length) return sorted[sorted.length - 1];
  return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function median(sorted: number[]): number {
  return quantileSorted(sorted, 0.5);
}

/**
 * Derive the weekend-uplift confidence-banded range from a cohort of
 * pricing recommendations. Caller is responsible for filtering to the
 * relevant cohort (forward-looking weekend dates within the window);
 * this helper only computes statistics.
 *
 * @returns the range, or `null` when the cohort is below threshold.
 */
export function deriveWeekendRange(
  recs: RangeInputRec[],
  options: { time_period_days?: number; threshold?: number } = {},
): ConfidenceBandedRangeValue | null {
  const time_period_days = options.time_period_days ?? 90;
  const threshold = options.threshold ?? WEEKEND_RANGE_THRESHOLD;

  const valid = recs.filter(isValidRec);
  if (valid.length < threshold) return null;

  const deltas = valid
    .map((r) => r.delta_abs as number)
    .slice()
    .sort((a, b) => a - b);

  const q1 = quantileSorted(deltas, 0.25);
  const q3 = quantileSorted(deltas, 0.75);
  const med = median(deltas);

  // Defensive clamp: when the entire cohort is non-negative, the "+$X-$Y
  // uplift" copy must not show a negative low bound. IQR on all-positive
  // samples will never produce q1 < 0 by construction, but the clamp
  // makes the invariant explicit and survives future algorithm changes.
  const allNonNegative = deltas.every((d) => d >= 0);
  const low = allNonNegative && q1 < 0 ? 0 : q1;

  return {
    range_low: Math.round(low),
    range_high: Math.round(q3),
    center: Math.round(med),
    n_recs_contributing: valid.length,
    time_period_days,
  };
}

/**
 * How many more weekend recommendations the host needs before the range
 * surfaces. Floor at 1 so the copy never reads "~0 more weekends" — that
 * would be the ship-the-range case, handled upstream by `deriveWeekendRange`
 * returning a value instead of null.
 */
export function weekendsNeededForRange(
  cohortSize: number,
  threshold: number = WEEKEND_RANGE_THRESHOLD,
): number {
  return Math.max(1, threshold - cohortSize);
}

/**
 * Grammar helper for the Tracking copy. Returns the word with the right
 * pluralization for the number — "1 more weekend" vs "3 more weekends".
 */
export function pluralizeWeekend(n: number): string {
  return n === 1 ? "weekend" : "weekends";
}
