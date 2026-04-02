import type { SignalResult, SignalContext, SignalDefinition } from "./types";

export function supplySignal(
  currentListings: number | null,
  previousListings: number | null,
): SignalResult {
  if (!currentListings || !previousListings || previousListings === 0) {
    return { score: 0, weight: 0.05, reason: "No supply data for comparison" };
  }
  const changePct = ((currentListings - previousListings) / previousListings) * 100;
  let score: number;
  if (changePct < -5) score = 0.1;
  else if (changePct < -2) score = 0.05;
  else if (changePct <= 2) score = 0;
  else if (changePct <= 5) score = -0.05;
  else score = -0.1;

  const dir = changePct > 0 ? "increased" : changePct < 0 ? "decreased" : "stable";
  return {
    score: Math.round(score * 100) / 100,
    weight: 0.05,
    reason: `Active listings ${dir} ${Math.abs(changePct).toFixed(1)}% — ${score > 0 ? "less competition" : score < 0 ? "more competition" : "stable market"}`,
  };
}

export const definition: SignalDefinition = {
  id: "supply",
  rawWeight: 0.05,
  compute(ctx: SignalContext): SignalResult {
    return supplySignal(ctx.currentListings, ctx.previousListings);
  },
};
