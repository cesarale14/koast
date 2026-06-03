/**
 * deriveGreeting — the Today-home state-aware greeting, DETERMINISTIC (NOT an
 * LLM turn), derived from the agenda render payload.
 *
 * It returns STRUCTURED FACTS (category + count + tone + time-of-day), never a
 * rendered string. The TodayHome component composes the prose ("Morning, Cesar —
 * 2 turnovers need cleaners") from these facts. That is a design property, not a
 * test convention: there is no string here to be tempted to assert, so the gate
 * is on the FACTS (the checkout-split lesson, applied structurally).
 *
 * Gap urgency is REUSED from the payload, not re-derived: toAgendaRenderPayload
 * already orders gaps no_cleaner (today before upcoming) → awaiting_reply →
 * missing_essentials, so the first gap is the most pressing. We group by category
 * preserving that order (first-seen), so gaps[0] stays the lead.
 */
import type { AgendaRenderPayload } from "@/lib/agent/render/types";

export type GreetingTone = "clear" | "attention";
export type GapCategory = "turnovers" | "essentials" | "replies";

export type GreetingFacts = {
  timeOfDay: "Morning" | "Afternoon" | "Evening";
  name: string | null;
  /** "clear" on an empty gap set (all-clear day); "attention" otherwise. */
  tone: GreetingTone;
  /** Gap categories with counts, in the payload's URGENCY order — gaps[0] is the
   * most pressing. Empty on an all-clear day. */
  gaps: { category: GapCategory; count: number }[];
};

const KIND_TO_CATEGORY: Record<AgendaRenderPayload["gaps"][number]["kind"], GapCategory> = {
  no_cleaner: "turnovers",
  missing_essentials: "essentials",
  awaiting_reply: "replies",
};

function timeOfDay(hourLocal: number): GreetingFacts["timeOfDay"] {
  if (hourLocal < 12) return "Morning";
  if (hourLocal < 18) return "Afternoon";
  return "Evening";
}

export function deriveGreeting(
  payload: AgendaRenderPayload,
  name: string | null,
  hourLocal: number,
): GreetingFacts {
  // Count by category, preserving the payload's gap order (a Map keeps insertion
  // order, and first-seen == urgency order from toAgendaRenderPayload).
  const counts = new Map<GapCategory, number>();
  for (const g of payload.gaps) {
    const cat = KIND_TO_CATEGORY[g.kind];
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  const gaps = Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
  return {
    timeOfDay: timeOfDay(hourLocal),
    name,
    tone: gaps.length > 0 ? "attention" : "clear",
    gaps,
  };
}
