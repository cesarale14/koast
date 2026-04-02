import type { SignalResult, SignalContext, SignalDefinition, EventData } from "./types";

export function eventSignal(
  events: EventData[]
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

export const definition: SignalDefinition = {
  id: "event",
  rawWeight: 0.12,
  compute(ctx: SignalContext): SignalResult {
    return eventSignal(ctx.events);
  },
};
