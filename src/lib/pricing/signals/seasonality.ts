import type { SignalResult, SignalContext, SignalDefinition, LearnedDowRates } from "./types";

export const DOW_ADJUSTMENTS: Record<number, number> = {
  0: 0.05, 1: -0.10, 2: -0.10, 3: -0.10, 4: -0.10, 5: 0.15, 6: 0.15,
};
export const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const MONTH_ADJUSTMENTS: Record<number, { adj: number; label: string }> = {
  0:  { adj: 0.20, label: "peak season" },
  1:  { adj: 0.20, label: "peak season" },
  2:  { adj: 0.20, label: "peak season" },
  3:  { adj: 0.05, label: "shoulder season" },
  4:  { adj: -0.15, label: "low season" },
  5:  { adj: -0.15, label: "low season" },
  6:  { adj: -0.15, label: "low season" },
  7:  { adj: -0.15, label: "low season" },
  8:  { adj: -0.15, label: "low season" },
  9:  { adj: 0.05, label: "shoulder season" },
  10: { adj: 0.05, label: "shoulder season" },
  11: { adj: 0.05, label: "shoulder season" },
};
export const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function seasonalitySignal(
  date: Date,
  learnedDow?: LearnedDowRates | null,
): SignalResult {
  const dow = date.getDay();
  const month = date.getMonth();
  const monthInfo = MONTH_ADJUSTMENTS[month] ?? { adj: 0, label: "unknown" };

  let dowAdj: number;
  let source = "default";

  if (learnedDow && Object.keys(learnedDow).length >= 7) {
    // Use learned day-of-week adjustments from actual booking data
    const avgRate = Object.values(learnedDow).reduce((s, v) => s + v, 0) / 7;
    dowAdj = avgRate > 0 ? (learnedDow[dow] - avgRate) / avgRate : 0;
    dowAdj = Math.max(-0.5, Math.min(0.5, dowAdj));
    source = "learned";
  } else {
    dowAdj = DOW_ADJUSTMENTS[dow] ?? 0;
  }

  const combined = Math.max(-1, Math.min(1, dowAdj + monthInfo.adj));
  return {
    score: Math.round(combined * 100) / 100,
    weight: 0.15,
    reason: `${DOW_NAMES[dow]} in ${MONTH_NAMES[month]} (${monthInfo.label}) — ${source} DOW data`,
  };
}

export const definition: SignalDefinition = {
  id: "seasonality",
  rawWeight: 0.15,
  compute(ctx: SignalContext): SignalResult {
    return seasonalitySignal(ctx.date, ctx.learnedDow);
  },
};
