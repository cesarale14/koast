import type { SignalResult, SignalContext, SignalDefinition } from "./types";

export function leadTimeSignal(
  dateStr: string,
  todayStr: string,
  currentRate: number | null,
  compMedianAdr: number | null,
): SignalResult {
  if (!currentRate || !compMedianAdr || compMedianAdr === 0) {
    return { score: 0, weight: 0.07, reason: "No lead time data available" };
  }
  const daysOut = Math.round((new Date(dateStr).getTime() - new Date(todayStr).getTime()) / 86400000);
  if (daysOut < 0) return { score: 0, weight: 0.07, reason: "Past date" };

  // Lead time price adjustment — market typically discounts last-minute
  let marketExpected = compMedianAdr;
  if (daysOut <= 3) marketExpected *= 0.85;
  else if (daysOut <= 7) marketExpected *= 0.90;
  else if (daysOut <= 14) marketExpected *= 0.95;
  // 30+ days: full price

  const diff = (marketExpected - currentRate) / marketExpected;
  const score = Math.max(-0.3, Math.min(0.3, diff));

  const label = diff > 0.05
    ? `below market at ${daysOut}d lead time — room to raise`
    : diff < -0.05
      ? `above market at ${daysOut}d lead time — consider lowering`
      : `aligned with market at ${daysOut}d lead time`;

  return {
    score: Math.round(score * 100) / 100,
    weight: 0.07,
    reason: `At ${daysOut}d out, market expects ~$${Math.round(marketExpected)}. Your $${Math.round(currentRate)} — ${label}`,
  };
}

export const definition: SignalDefinition = {
  id: "lead_time",
  rawWeight: 0.07,
  compute(ctx: SignalContext): SignalResult {
    return leadTimeSignal(ctx.dateStr, ctx.todayStr, ctx.currentRate, ctx.compMedianAdr);
  },
};
