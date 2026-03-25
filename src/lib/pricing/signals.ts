// Individual pricing signal modules
// Each returns a score from -1.0 to +1.0 with a human-readable reason

export interface SignalResult {
  score: number;
  weight: number;
  reason: string;
}

// ---------- Demand Signal (weight: 0.30) ----------

export function demandSignal(demandScore: number | null): SignalResult {
  if (demandScore == null) {
    return { score: 0, weight: 0.30, reason: "No market demand data available" };
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
    weight: 0.30,
    reason: `Market demand score ${Math.round(demandScore)}/100 — ${label}`,
  };
}

// ---------- Seasonality Signal (weight: 0.25) ----------

const DOW_ADJUSTMENTS: Record<number, number> = {
  0: 0.05,   // Sunday
  1: -0.10,  // Monday
  2: -0.10,  // Tuesday
  3: -0.10,  // Wednesday
  4: -0.10,  // Thursday
  5: 0.15,   // Friday
  6: 0.15,   // Saturday
};

const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Tampa-specific monthly seasonality
const MONTH_ADJUSTMENTS: Record<number, { adj: number; label: string }> = {
  0:  { adj: 0.20, label: "peak season" },     // Jan
  1:  { adj: 0.20, label: "peak season" },     // Feb
  2:  { adj: 0.20, label: "peak season" },     // Mar
  3:  { adj: 0.05, label: "shoulder season" },  // Apr
  4:  { adj: -0.15, label: "low season" },      // May
  5:  { adj: -0.15, label: "low season" },      // Jun
  6:  { adj: -0.15, label: "low season" },      // Jul
  7:  { adj: -0.15, label: "low season" },      // Aug
  8:  { adj: -0.15, label: "low season" },      // Sep
  9:  { adj: 0.05, label: "shoulder season" },  // Oct
  10: { adj: 0.05, label: "shoulder season" },  // Nov
  11: { adj: 0.05, label: "shoulder season" },  // Dec
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export function seasonalitySignal(date: Date): SignalResult {
  const dow = date.getDay();
  const month = date.getMonth();
  const dowAdj = DOW_ADJUSTMENTS[dow] ?? 0;
  const monthInfo = MONTH_ADJUSTMENTS[month] ?? { adj: 0, label: "unknown" };
  const combined = Math.max(-1, Math.min(1, dowAdj + monthInfo.adj));

  return {
    score: Math.round(combined * 100) / 100,
    weight: 0.25,
    reason: `${DOW_NAMES[dow]} in ${MONTH_NAMES[month]} (${monthInfo.label} Tampa)`,
  };
}

// ---------- Competitor Signal (weight: 0.25) ----------

export function competitorSignal(
  currentRate: number | null,
  propertyOccupancy: number | null,
  compAdrs: number[],
  compOccupancies: number[]
): SignalResult {
  if (compAdrs.length === 0 || currentRate == null) {
    return { score: 0, weight: 0.25, reason: "No comp data available" };
  }

  const sorted = [...compAdrs].sort((a, b) => a - b);
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const median = sorted[Math.floor(sorted.length * 0.5)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];

  const medianOcc = compOccupancies.length > 0
    ? [...compOccupancies].sort((a, b) => a - b)[Math.floor(compOccupancies.length / 2)]
    : 50;

  const propOcc = propertyOccupancy ?? 50;

  // Calculate percentile position
  const belowCount = sorted.filter((v) => v < currentRate).length;
  const percentile = Math.round((belowCount / sorted.length) * 100);

  let score: number;
  let detail: string;

  if (currentRate < p25 && propOcc > medianOcc) {
    score = 0.5;
    detail = "below 25th percentile but high occupancy — underpriced";
  } else if (currentRate > p75 && propOcc < medianOcc) {
    score = -0.5;
    detail = "above 75th percentile with low occupancy — overpriced";
  } else if (currentRate < median && propOcc < medianOcc) {
    score = 0.3;
    detail = "below median and low occupancy — price isn't the issue";
  } else {
    // Interpolate based on percentile position relative to median
    score = (median - currentRate) / median * 0.5;
    score = Math.max(-1, Math.min(1, score));
    detail = percentile < 50
      ? "below median — room to increase"
      : "at or above median";
  }

  return {
    score: Math.round(score * 100) / 100,
    weight: 0.25,
    reason: `Priced at ${percentile}th percentile of comps ($${Math.round(currentRate)} vs median $${Math.round(median)}) — ${detail}`,
  };
}

// ---------- Gap Night Signal (weight: 0.10) ----------

export function gapNightSignal(
  dateStr: string,
  bookings: { check_in: string; check_out: string }[]
): SignalResult {
  if (bookings.length < 2) {
    return { score: 0, weight: 0.10, reason: "No adjacent bookings" };
  }

  // Sort bookings by check_in
  const sorted = [...bookings].sort((a, b) => a.check_in.localeCompare(b.check_in));

  // Find gaps between bookings
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].check_out;
    const gapEnd = sorted[i + 1].check_in;

    if (dateStr >= gapStart && dateStr < gapEnd) {
      const gapDays = Math.round(
        (new Date(gapEnd).getTime() - new Date(gapStart).getTime()) / 86400000
      );

      if (gapDays <= 2) {
        return {
          score: -0.8,
          weight: 0.10,
          reason: `Orphan night — ${gapDays}-day gap between bookings (heavy discount to fill)`,
        };
      } else if (gapDays <= 3) {
        return {
          score: -0.3,
          weight: 0.10,
          reason: `Short ${gapDays}-day gap between bookings (moderate discount)`,
        };
      }
    }
  }

  return { score: 0, weight: 0.10, reason: "No adjacent bookings" };
}

// ---------- Booking Pace Signal (weight: 0.10) ----------

export function bookingPaceSignal(
  dateStr: string,
  todayStr: string,
  isBooked: boolean
): SignalResult {
  const daysOut = Math.round(
    (new Date(dateStr).getTime() - new Date(todayStr).getTime()) / 86400000
  );

  if (isBooked) {
    if (daysOut >= 30) {
      return {
        score: 0.2,
        weight: 0.10,
        reason: `Booked ${daysOut} days out — strong advance booking`,
      };
    }
    return { score: 0, weight: 0.10, reason: `Booked ${daysOut} days out` };
  }

  // Open dates
  if (daysOut < 3) {
    return {
      score: -0.6,
      weight: 0.10,
      reason: `Only ${daysOut} day${daysOut !== 1 ? "s" : ""} away, still open — last-minute discount`,
    };
  } else if (daysOut < 7) {
    return {
      score: -0.3,
      weight: 0.10,
      reason: `${daysOut} days away, still open — moderate discount`,
    };
  } else if (daysOut < 14) {
    return {
      score: -0.1,
      weight: 0.10,
      reason: `${daysOut} days out, still open — slight discount`,
    };
  }

  return { score: 0, weight: 0.10, reason: `${daysOut} days out, open` };
}
