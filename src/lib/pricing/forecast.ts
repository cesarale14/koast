// 90-day demand forecasting — combines multiple data sources
// into a daily demand score (0-100)

import { fetchWeatherForecast } from "./weather";

export interface ForecastDay {
  date: string;
  demand_score: number;
  demand_level: "low" | "moderate" | "high" | "very_high";
  factors: string[];
  suggested_action: string;
}

const DOW_BASE: Record<number, number> = {
  0: 55, 1: 35, 2: 35, 3: 40, 4: 45, 5: 70, 6: 75,
};
const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Tampa seasonal curve (monthly base offset)
const MONTH_BASE: Record<number, { offset: number; label: string }> = {
  0: { offset: 15, label: "peak" }, 1: { offset: 15, label: "peak" },
  2: { offset: 15, label: "peak" }, 3: { offset: 5, label: "shoulder" },
  4: { offset: -10, label: "low" }, 5: { offset: -10, label: "low" },
  6: { offset: -10, label: "low" }, 7: { offset: -10, label: "low" },
  8: { offset: -10, label: "low" }, 9: { offset: 5, label: "shoulder" },
  10: { offset: 5, label: "shoulder" }, 11: { offset: 5, label: "shoulder" },
};

function demandLevel(score: number): ForecastDay["demand_level"] {
  if (score >= 80) return "very_high";
  if (score >= 60) return "high";
  if (score >= 30) return "moderate";
  return "low";
}

function suggestedAction(level: ForecastDay["demand_level"], score: number): string {
  if (level === "very_high") return `Raise rates 20-25% above base (score ${score})`;
  if (level === "high") return `Raise rates 10-20% above base (score ${score})`;
  if (level === "moderate") return `Hold rates near base (score ${score})`;
  return `Consider 10-15% discount to attract bookings (score ${score})`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateDemandForecast(supabase: any, propertyId: string, days = 90): Promise<ForecastDay[]> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // 1. Learned DOW rates from pricing_outcomes
  const { data: outcomes } = await supabase
    .from("pricing_outcomes")
    .select("date, was_booked")
    .eq("property_id", propertyId)
    .order("date", { ascending: false })
    .limit(180);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outcomeRows = (outcomes ?? []) as any[];
  let learnedDow: Record<number, number> | null = null;
  if (outcomeRows.length >= 60) {
    const counts: Record<number, { b: number; t: number }> = {};
    for (let d = 0; d < 7; d++) counts[d] = { b: 0, t: 0 };
    for (const o of outcomeRows) {
      const dow = new Date(o.date + "T00:00:00").getDay();
      counts[dow].t++;
      if (o.was_booked) counts[dow].b++;
    }
    learnedDow = {};
    for (let d = 0; d < 7; d++) learnedDow[d] = counts[d].t > 0 ? Math.round((counts[d].b / counts[d].t) * 100) : 50;
  }

  // 2. Events for the next 90 days
  const endStr = new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
  const { data: events } = await supabase
    .from("local_events")
    .select("event_date, event_name, demand_impact, estimated_attendance")
    .eq("property_id", propertyId)
    .gte("event_date", todayStr)
    .lte("event_date", endStr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventsByDate = new Map<string, any[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (events ?? []) as any[]) {
    const d = e.event_date;
    if (!eventsByDate.has(d)) eventsByDate.set(d, []);
    eventsByDate.get(d)!.push(e);
  }

  // 3. Weather forecast (next 14 days)
  const { data: propData } = await supabase.from("properties").select("latitude, longitude").eq("id", propertyId).limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = ((propData ?? []) as any[])[0];
  const weatherDays = await fetchWeatherForecast(
    prop?.latitude ? parseFloat(prop.latitude) : null,
    prop?.longitude ? parseFloat(prop.longitude) : null,
  );
  const weatherMap = new Map(weatherDays.map((w) => [w.date, w]));

  // 4. Market trend from snapshots
  const { data: snapshots } = await supabase
    .from("market_snapshots")
    .select("market_occupancy, market_supply, snapshot_date")
    .eq("property_id", propertyId)
    .order("snapshot_date", { ascending: false })
    .limit(2);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snaps = (snapshots ?? []) as any[];
  let marketTrend = 0;
  let supplyTrend = 0;
  if (snaps.length >= 2) {
    const currOcc = snaps[0].market_occupancy ?? 50;
    const prevOcc = snaps[1].market_occupancy ?? 50;
    marketTrend = currOcc > prevOcc + 2 ? 10 : currOcc < prevOcc - 2 ? -10 : 0;

    const currSup = snaps[0].market_supply ?? 0;
    const prevSup = snaps[1].market_supply ?? 0;
    if (prevSup > 0) {
      const supChange = ((currSup - prevSup) / prevSup) * 100;
      supplyTrend = supChange > 3 ? -5 : supChange < -3 ? 5 : 0;
    }
  }

  // Generate daily forecast
  const result: ForecastDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const dow = d.getDay();
    const month = d.getMonth();
    const factors: string[] = [];

    // Base: DOW + month
    let score = learnedDow ? learnedDow[dow] : DOW_BASE[dow];
    const monthInfo = MONTH_BASE[month];
    score += monthInfo.offset;
    factors.push(`${DOW_NAMES[dow]} in ${monthInfo.label} season (${learnedDow ? "learned" : "default"} DOW)`);

    // Events
    const dayEvents = eventsByDate.get(dateStr) ?? [];
    let eventBoost = 0;
    for (const e of dayEvents) {
      const impact = Math.min(20, (e.demand_impact ?? 0.3) * 20);
      eventBoost += impact;
      factors.push(`${e.event_name} (+${Math.round(impact)})`);
    }
    score += Math.min(40, eventBoost);

    // Weather (14 days only)
    const w = weatherMap.get(dateStr);
    if (w) {
      if (w.precipChance > 60) { score -= 5; factors.push(`Rain forecast (-5)`); }
      else if (w.tempHigh >= 75 && w.tempHigh <= 85 && w.precipChance < 30) { score += 5; factors.push(`Clear ${w.tempHigh}°F (+5)`); }
      else if (w.tempHigh < 50) { score += 8; factors.push(`Cold snap ${w.tempHigh}°F — snowbird demand (+8)`); }
    }

    // Market trend
    if (marketTrend !== 0) { score += marketTrend; factors.push(`Market occupancy trending ${marketTrend > 0 ? "up" : "down"} (${marketTrend > 0 ? "+" : ""}${marketTrend})`); }
    if (supplyTrend !== 0) { score += supplyTrend; factors.push(`Supply ${supplyTrend > 0 ? "decreasing" : "increasing"} (${supplyTrend > 0 ? "+" : ""}${supplyTrend})`); }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const level = demandLevel(score);

    result.push({
      date: dateStr,
      demand_score: score,
      demand_level: level,
      factors,
      suggested_action: suggestedAction(level, score),
    });
  }

  return result;
}
