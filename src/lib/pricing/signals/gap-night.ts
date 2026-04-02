import type { SignalResult, SignalContext, SignalDefinition, BookingData } from "./types";

export function gapNightSignal(
  dateStr: string,
  bookings: BookingData[]
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

export const definition: SignalDefinition = {
  id: "gap_night",
  rawWeight: 0.08,
  compute(ctx: SignalContext): SignalResult {
    return gapNightSignal(ctx.dateStr, ctx.bookings);
  },
};
