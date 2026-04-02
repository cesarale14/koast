import type { SignalResult, SignalContext, SignalDefinition } from "./types";

export function competitorSignal(
  currentRate: number | null,
  propertyOccupancy: number | null,
  compAdrs: number[],
  compOccupancies: number[]
): SignalResult {
  if (compAdrs.length === 0 || currentRate == null) {
    return { score: 0, weight: 0.20, reason: "No comp data available" };
  }
  const sorted = [...compAdrs].sort((a, b) => a - b);
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const median = sorted[Math.floor(sorted.length * 0.5)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const medianOcc = compOccupancies.length > 0
    ? [...compOccupancies].sort((a, b) => a - b)[Math.floor(compOccupancies.length / 2)]
    : 50;
  const propOcc = propertyOccupancy ?? 50;
  const belowCount = sorted.filter((v) => v < currentRate).length;
  const percentile = Math.round((belowCount / sorted.length) * 100);

  let score: number;
  let detail: string;
  if (currentRate < p25) {
    score = 0.6;
    detail = propOcc > medianOcc ? "well below 25th pctl, high occ — underpriced" : "well below 25th pctl — room to raise";
  } else if (currentRate > p75 && propOcc < medianOcc) {
    score = -0.5;
    detail = "above 75th pctl, low occ — overpriced";
  } else if (currentRate < median) {
    score = propOcc < medianOcc ? 0.3 : 0.3;
    detail = "below median — room to increase";
  } else {
    score = Math.max(-1, Math.min(1, (median - currentRate) / median * 0.5));
    detail = "at or above median";
  }
  return {
    score: Math.round(score * 100) / 100,
    weight: 0.20,
    reason: `${percentile}th pctl ($${Math.round(currentRate)} vs median $${Math.round(median)}) — ${detail}`,
  };
}

export const definition: SignalDefinition = {
  id: "competitor",
  rawWeight: 0.20,
  compute(ctx: SignalContext): SignalResult {
    return competitorSignal(ctx.currentRate, ctx.propertyOccupancy, ctx.compAdrs, ctx.compOccs);
  },
};
