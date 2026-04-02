import type { SignalResult, SignalContext, SignalDefinition } from "./types";

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

export const definition: SignalDefinition = {
  id: "booking_pace",
  rawWeight: 0.08,
  compute(ctx: SignalContext): SignalResult {
    return bookingPaceSignal(ctx.dateStr, ctx.todayStr, ctx.isBooked, ctx.avgLeadTimeDays);
  },
};
