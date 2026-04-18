import type { SignalResult, SignalContext, SignalDefinition } from "./types";

export function competitorSignal(
  currentRate: number | null,
  propertyOccupancy: number | null,
  compAdrs: number[],
  compOccupancies: number[],
  compSetQuality: "precise" | "fallback" | "insufficient" | "unknown" = "unknown"
): SignalResult {
  // PR B — confidence-aware output. Reads properties.comp_set_quality
  // (passed through SignalContext) and maps to confidence: precise=1.0,
  // fallback=0.5, insufficient=0.0, unknown=0.0. Engine aggregation
  // multiplies weight by confidence and redistributes dropped weight
  // across the other signals. See engine.ts and src/lib/pricing/signals/types.ts.
  const confidence =
    compSetQuality === "precise" ? 1.0 :
    compSetQuality === "fallback" ? 0.5 :
    0.0;

  if (compAdrs.length === 0 || currentRate == null) {
    return { score: 0, weight: 0.20, reason: "No comp data available", confidence: 0.0 };
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
    confidence,
  };
}

export const definition: SignalDefinition = {
  id: "competitor",
  rawWeight: 0.20,
  compute(ctx: SignalContext): SignalResult {
    return competitorSignal(
      ctx.currentRate,
      ctx.propertyOccupancy,
      ctx.compAdrs,
      ctx.compOccs,
      ctx.compSetQuality ?? "unknown"
    );
  },
};
