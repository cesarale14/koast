/**
 * aggregateSignalContribution — collapse a set of pricing
 * recommendations' reason_signals into a ranked list of
 * {name, weight} pairs sorted by total effective contribution.
 *
 * Effective weight per signal = weight × confidence, summed across
 * the recommendation set, then normalized to a fraction of the total
 * aggregate. The result maps cleanly onto KoastSignalBar's props
 * (label, weight) with score pinned at 1 (aggregate view) and
 * confidence implicitly baked into the weight already.
 */

export interface AggregateSignalRow {
  name: string;
  weight: number; // normalized fraction in [0, 1]
}

interface SignalContrib {
  name: string;
  sum: number;
}

interface RawSignalValue {
  weight?: number;
  confidence?: number;
  score?: number;
  reason?: string;
}

interface RecommendationLike {
  reason_signals?: Record<string, unknown> | null;
}

export function aggregateSignalContribution(
  recs: RecommendationLike[],
  topN = 5
): AggregateSignalRow[] {
  const map = new Map<string, SignalContrib>();
  for (const rec of recs) {
    const signals = rec.reason_signals as Record<string, unknown> | null | undefined;
    if (!signals) continue;
    for (const [name, raw] of Object.entries(signals)) {
      if (name === "clamps") continue;
      const v = raw as RawSignalValue;
      const w = typeof v.weight === "number" ? v.weight : 0;
      const c = typeof v.confidence === "number" ? v.confidence : 1;
      const contrib = w * c;
      if (contrib <= 0) continue;
      const entry = map.get(name) ?? { name, sum: 0 };
      entry.sum += contrib;
      map.set(name, entry);
    }
  }
  const total = Array.from(map.values()).reduce((s, e) => s + e.sum, 0);
  if (total <= 0) return [];
  return Array.from(map.values())
    .map((e) => ({ name: e.name, weight: e.sum / total }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN);
}
