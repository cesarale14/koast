import type { SignalResult, SignalContext, SignalDefinition } from "./types";

export function demandSignal(demandScore: number | null): SignalResult {
  if (demandScore == null) {
    return { score: 0, weight: 0.20, reason: "No market demand data available" };
  }
  const score = Math.max(-1, Math.min(1, (demandScore - 50) / 50));
  const label =
    demandScore >= 70 ? "high demand"
    : demandScore >= 55 ? "slightly above neutral"
    : demandScore >= 45 ? "neutral"
    : demandScore >= 30 ? "below average"
    : "low demand";
  return {
    score: Math.round(score * 100) / 100,
    weight: 0.20,
    reason: `Market demand score ${Math.round(demandScore)}/100 — ${label}`,
  };
}

export const definition: SignalDefinition = {
  id: "demand",
  rawWeight: 0.20,
  compute(ctx: SignalContext): SignalResult {
    return demandSignal(ctx.demandScore);
  },
};
