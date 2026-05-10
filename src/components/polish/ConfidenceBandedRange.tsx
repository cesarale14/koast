"use client";

/**
 * ConfidenceBandedRange — M8 C2 (D8).
 *
 * Honest-confidence hero treatment. Renders either:
 *   - the "+$X–$Y weekend uplift" + source line "based on N comparable
 *     weekends, last 90 days", when the cohort cleared the threshold; or
 *   - the "Tracking — need ~N more weekends of data" copy when below.
 *
 * Doctrine binding (locked at C2 sign-off):
 *   - §3.4 honest confidence: range, sample size, time period, comparison
 *     set named. No confidence chip (range size IS the signal).
 *   - §5.5 banned hedges: no "estimate", "approximate", "roughly", "~$30".
 *   - Range copy: "+$X–$Y weekend uplift"
 *   - Source line: "based on N comparable weekends, last N days"
 *   - Below-threshold: "Tracking — need ~N more weekends of data" with
 *     pluralization handling.
 *
 * Style-agnostic typography — caller chooses Fraunces/Plus Jakarta sizes
 * via `titleStyle` / `subtitleStyle` props. The dashboard hero passes the
 * existing PricingIntelligenceCard slot styles so this component drops in
 * without restyling the surrounding gradient card.
 */

import type { CSSProperties } from "react";
import {
  pluralizeWeekend,
  weekendsNeededForRange,
  type ConfidenceBandedRangeValue,
} from "@/lib/pricing/range";

interface ConfidenceBandedRangeProps {
  /** Output of deriveWeekendRange; null when below threshold. */
  range: ConfidenceBandedRangeValue | null;
  /** Pre-filter cohort size. Required when `range === null` so the Tracking
   *  copy can compute "~N more weekends". Ignored when range is non-null. */
  cohortSize: number;
  /** Style applied to the primary heading (range copy or Tracking heading). */
  titleStyle?: CSSProperties;
  /** Style applied to the secondary source line. */
  subtitleStyle?: CSSProperties;
}

export default function ConfidenceBandedRange({
  range,
  cohortSize,
  titleStyle,
  subtitleStyle,
}: ConfidenceBandedRangeProps) {
  if (range === null) {
    const need = weekendsNeededForRange(cohortSize);
    return (
      <div>
        <h2 style={titleStyle}>Tracking — need ~{need} more {pluralizeWeekend(need)} of data</h2>
        <p style={subtitleStyle}>
          Koast watches each weekend rate against its comparable cohort. The band tightens as
          forward data accumulates.
        </p>
      </div>
    );
  }

  const sign = range.center >= 0 ? "+" : "−";
  const lo = Math.abs(range.range_low);
  const hi = Math.abs(range.range_high);
  // Title format "+$X–$Y weekend uplift" — locked at C2 sign-off.
  const title =
    sign === "+"
      ? `+$${lo}–$${hi} weekend uplift`
      : `−$${hi}–$${lo} weekend gap`;
  const source = `based on ${range.n_recs_contributing} comparable ${pluralizeWeekend(
    range.n_recs_contributing,
  )}, last ${range.time_period_days} days`;

  return (
    <div>
      <h2 style={titleStyle}>{title}</h2>
      <p style={subtitleStyle}>{source}</p>
    </div>
  );
}
