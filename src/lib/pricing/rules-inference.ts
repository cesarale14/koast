/**
 * Infer pricing_rules defaults from a property's calendar_rates history.
 *
 * When a property has ≥minDays of rate data, we can pick better defaults
 * than hard-coded constants — base_rate from the median of what the host
 * actually charged, min/max from their observed p10/p90, and a daily
 * delta cap from their observed p95 day-over-day change. Host can still
 * override any of these later; source='inferred' vs 'host_set' tracks
 * lineage.
 *
 * If the property doesn't have enough history, returns null and the
 * caller falls back to hard-coded defaults (source='defaults').
 *
 * inferred_from JSONB captures the summary stats used so re-inference
 * can be audited and re-run when the algorithm improves.
 */

export interface InferredRules {
  base_rate: number;
  min_rate: number;
  max_rate: number;
  max_daily_delta_pct: number;
  comp_floor_pct: number;
  channel_markups: Record<string, number>;
  inferred_from: {
    row_count: number;
    date_range: { from: string; to: string };
    percentiles: { p10: number; p50: number; p90: number };
    daily_delta_p95: number;
    channels_sampled: string[];
    computed_at: string;
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p)));
  return sorted[idx];
}

export async function inferPricingRulesFromHistory(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  propertyId: string;
  minDays?: number;
}): Promise<InferredRules | null> {
  const { supabase, propertyId, minDays = 30 } = opts;

  const todayStr = new Date().toISOString().split("T")[0];
  const futureEnd = new Date();
  futureEnd.setDate(futureEnd.getDate() + 60);
  const futureEndStr = futureEnd.toISOString().split("T")[0];
  const pastStart = new Date();
  pastStart.setDate(pastStart.getDate() - 60);
  const pastStartStr = pastStart.toISOString().split("T")[0];

  // Prefer future-forward rates (what the host has set for upcoming dates)
  // over historical. Host's future pricing reflects current intent; past
  // rates reflect intent at a different time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: futureRows } = await (supabase.from("calendar_rates") as any)
    .select("date, applied_rate, channel_code")
    .eq("property_id", propertyId)
    .gte("date", todayStr)
    .lte("date", futureEndStr)
    .not("applied_rate", "is", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pastRows } = await (supabase.from("calendar_rates") as any)
    .select("date, applied_rate, channel_code")
    .eq("property_id", propertyId)
    .gte("date", pastStartStr)
    .lt("date", todayStr)
    .not("applied_rate", "is", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const futureBase = ((futureRows ?? []) as any[]).filter((r) => r.channel_code == null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pastBase = ((pastRows ?? []) as any[]).filter((r) => r.channel_code == null);

  const baseRows = (futureBase.length >= pastBase.length ? futureBase : pastBase) as Array<{
    date: string;
    applied_rate: number | string;
    channel_code: string | null;
  }>;

  if (baseRows.length < minDays) {
    return null;
  }

  const rates = baseRows
    .map((r) => Number(r.applied_rate))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  if (rates.length < minDays) return null;

  const p10 = percentile(rates, 0.10);
  const p50 = percentile(rates, 0.50);
  const p90 = percentile(rates, 0.90);

  // Daily delta p95: compute absolute relative change between consecutive
  // dates (sorted by date). Host's typical swing is a good ceiling for
  // the max_daily_delta guardrail.
  const byDate = [...baseRows].sort((a, b) => a.date.localeCompare(b.date));
  const deltas: number[] = [];
  for (let i = 1; i < byDate.length; i++) {
    const prev = Number(byDate[i - 1].applied_rate);
    const cur = Number(byDate[i].applied_rate);
    if (Number.isFinite(prev) && Number.isFinite(cur) && prev > 0) {
      deltas.push(Math.abs(cur - prev) / prev);
    }
  }
  deltas.sort((a, b) => a - b);
  const deltaP95 = deltas.length > 0 ? percentile(deltas, 0.95) : 0;
  // Floor at 0.25 so a very-stable host doesn't end up with an over-strict
  // cap that blocks legitimate pricing-engine moves.
  const max_daily_delta_pct = Math.min(0.25, Math.max(deltaP95, 0.05));

  // Channel markups: for each non-null channel_code row in either window,
  // compute the median ratio to the baseline (null-channel) rate on the
  // same date. If there's only one channel (base), no markups to report.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allChannelRows = ([...(futureRows ?? []), ...(pastRows ?? [])] as any[])
    .filter((r) => r.channel_code != null);
  const baseByDate = new Map<string, number>();
  for (const r of byDate) {
    const n = Number(r.applied_rate);
    if (Number.isFinite(n) && n > 0) baseByDate.set(r.date, n);
  }
  const channelRatios = new Map<string, number[]>();
  for (const r of allChannelRows) {
    const base = baseByDate.get(r.date);
    const channelRate = Number(r.applied_rate);
    if (base == null || !Number.isFinite(channelRate) || channelRate <= 0) continue;
    const ratio = (channelRate - base) / base;
    if (!channelRatios.has(r.channel_code)) channelRatios.set(r.channel_code, []);
    channelRatios.get(r.channel_code)!.push(ratio);
  }
  const channel_markups: Record<string, number> = {};
  channelRatios.forEach((ratios, code) => {
    if (ratios.length < 3) return;
    const sorted = [...ratios].sort((a, b) => a - b);
    channel_markups[code.toLowerCase()] = Math.round(percentile(sorted, 0.5) * 1000) / 1000;
  });

  const base_rate = Math.round(p50 * 100) / 100;
  const min_rate = Math.round(p10 * 100) / 100;
  const max_rate = Math.round(p90 * 100) / 100;

  // Guard: ensure min < base < max (tiny ranges can collapse these).
  const safeMin = Math.min(min_rate, base_rate);
  const safeMax = Math.max(max_rate, base_rate);

  return {
    base_rate,
    min_rate: safeMin,
    max_rate: safeMax,
    max_daily_delta_pct: Math.round(max_daily_delta_pct * 1000) / 1000,
    comp_floor_pct: 0.85,
    channel_markups,
    inferred_from: {
      row_count: rates.length,
      date_range: { from: byDate[0].date, to: byDate[byDate.length - 1].date },
      percentiles: { p10, p50, p90 },
      daily_delta_p95: Math.round(deltaP95 * 1000) / 1000,
      channels_sampled: Array.from(channelRatios.keys()),
      computed_at: new Date().toISOString(),
    },
  };
}
