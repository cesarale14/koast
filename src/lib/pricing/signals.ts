// Individual pricing signal modules
// Each returns a score from -1.0 to +1.0 with a human-readable reason

export interface SignalResult {
  score: number;
  weight: number;
  reason: string;
}

// ---------- Signal 1: Demand (weight: 0.20) ----------

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

// ---------- Signal 2: Seasonality (weight: 0.15) — learnable ----------

const DOW_ADJUSTMENTS: Record<number, number> = {
  0: 0.05, 1: -0.10, 2: -0.10, 3: -0.10, 4: -0.10, 5: 0.15, 6: 0.15,
};
const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MONTH_ADJUSTMENTS: Record<number, { adj: number; label: string }> = {
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
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export interface LearnedDowRates { [dow: number]: number } // 0-6 → booking rate 0-1

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

// ---------- Signal 3: Competitor (weight: 0.20) ----------

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

// ---------- Signal 4: Event (weight: 0.12) ----------

export function eventSignal(
  events: { event_name: string; venue_name: string | null; demand_impact: number; estimated_attendance: number; event_type: string }[]
): SignalResult {
  if (events.length === 0) {
    return { score: 0, weight: 0.12, reason: "No significant events nearby" };
  }
  const top = events.reduce((best, e) => e.demand_impact > best.demand_impact ? e : best, events[0]);
  const score = Math.min(1, top.demand_impact);
  const attendanceStr = top.estimated_attendance > 0 ? ` (${top.estimated_attendance.toLocaleString()})` : "";
  const label = score >= 0.7 ? "very high demand" : score >= 0.4 ? "high demand" : "moderate demand";
  return {
    score: Math.round(score * 100) / 100,
    weight: 0.12,
    reason: `${top.event_name}${top.venue_name ? ` at ${top.venue_name}` : ""}${attendanceStr} — ${label}`,
  };
}

// ---------- Signal 5: Gap Night (weight: 0.08) ----------

export function gapNightSignal(
  dateStr: string,
  bookings: { check_in: string; check_out: string }[]
): SignalResult {
  if (bookings.length < 2) return { score: 0, weight: 0.08, reason: "No adjacent bookings" };
  const sorted = [...bookings].sort((a, b) => a.check_in.localeCompare(b.check_in));
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].check_out;
    const gapEnd = sorted[i + 1].check_in;
    if (dateStr >= gapStart && dateStr < gapEnd) {
      const gapDays = Math.round((new Date(gapEnd).getTime() - new Date(gapStart).getTime()) / 86400000);
      if (gapDays <= 2) return { score: -0.8, weight: 0.08, reason: `Orphan night — ${gapDays}-day gap (heavy discount)` };
      if (gapDays <= 3) return { score: -0.3, weight: 0.08, reason: `Short ${gapDays}-day gap (moderate discount)` };
    }
  }
  return { score: 0, weight: 0.08, reason: "No adjacent bookings" };
}

// ---------- Signal 6: Booking Pace (weight: 0.08) — improved ----------

export function bookingPaceSignal(
  dateStr: string,
  todayStr: string,
  isBooked: boolean,
  avgLeadTimeDays?: number | null,
): SignalResult {
  const daysOut = Math.round((new Date(dateStr).getTime() - new Date(todayStr).getTime()) / 86400000);
  const baseline = avgLeadTimeDays ?? 21; // default 21 days if no historical data

  if (isBooked) {
    if (daysOut >= baseline * 1.5) {
      return { score: 0.3, weight: 0.08, reason: `Booked ${daysOut}d out (well ahead of ${baseline}d avg lead time)` };
    }
    if (daysOut >= 30) return { score: 0.2, weight: 0.08, reason: `Booked ${daysOut}d out — strong advance booking` };
    return { score: 0, weight: 0.08, reason: `Booked ${daysOut}d out` };
  }

  // Open dates — severity based on how far past the typical booking window
  const ratio = daysOut / baseline;
  if (ratio < 0.15) return { score: -0.6, weight: 0.08, reason: `${daysOut}d away, open — well past ${baseline}d avg lead time` };
  if (ratio < 0.35) return { score: -0.3, weight: 0.08, reason: `${daysOut}d away, open — past typical booking window` };
  if (ratio < 0.65) return { score: -0.1, weight: 0.08, reason: `${daysOut}d out, open — approaching booking window` };
  return { score: 0, weight: 0.08, reason: `${daysOut}d out, open — within normal range` };
}

// ---------- Signal 7: Weather Forecast (weight: 0.05) ----------

export interface WeatherDay {
  date: string;
  tempHigh: number; // °F
  precipChance: number; // 0-100
  conditions: string;
}

export function weatherSignal(dateStr: string, forecast: WeatherDay[]): SignalResult {
  const day = forecast.find((f) => f.date === dateStr);
  if (!day) return { score: 0, weight: 0.05, reason: "No forecast available" };

  const cond = day.conditions.toLowerCase();
  let score = 0;
  let detail = "";

  if (cond.includes("hurricane") || cond.includes("tropical storm")) {
    score = -0.5;
    detail = "tropical storm/hurricane warning";
  } else if (day.precipChance > 60 || cond.includes("thunderstorm")) {
    score = -0.1;
    detail = `${day.precipChance}% rain — reduces last-minute bookings`;
  } else if (day.tempHigh >= 95) {
    score = -0.05;
    detail = `extreme heat ${day.tempHigh}°F`;
  } else if (day.tempHigh < 50) {
    score = 0.15;
    detail = `cold snap ${day.tempHigh}°F — snowbird demand`;
  } else if (day.tempHigh >= 75 && day.tempHigh <= 85 && day.precipChance < 30) {
    score = 0.1;
    detail = `clear skies, ${day.tempHigh}°F — favorable weather`;
  } else {
    detail = `${day.tempHigh}°F, ${day.precipChance}% precip`;
  }

  return {
    score: Math.round(score * 100) / 100,
    weight: 0.05,
    reason: `${day.conditions} ${day.tempHigh}°F — ${detail}`,
  };
}

// ---------- Signal 8: Supply Pressure (weight: 0.05) ----------

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

// ---------- Signal 9: Lead Time Pricing (weight: 0.07) ----------

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
