/**
 * The three mutually-exclusive Today states (P7.1). first_run (zero properties)
 * must NEVER collapse into all_set (≥1 property, nothing scheduled) — they look
 * different and mean different things. That collapse WAS the onboarding dead-end
 * (a brand-new account saw "you're all set" instead of a way in). Pure +
 * lib-layer so the distinction is testable without a DOM.
 */
import type { AgendaGap } from "@/lib/agent/render/types";

export type TodayView = "first_run" | "all_set" | "agenda";

export function todayView(firstRun: boolean | undefined, empty: boolean): TodayView {
  if (firstRun) return "first_run"; // 0 properties — wins over `empty`
  if (empty) return "all_set"; // ≥1 property, nothing in the window
  return "agenda";
}

/**
 * P7.5: the deep-link for a "missing check-in details" gap. Returns null for
 * any other gap kind (those aren't access-actionable here). The agenda carries
 * property nicknames only (no ids), so we resolve via the name→id map; an
 * unresolved name falls back to the property list. The P-2 form auto-opens at
 * the Access section on ?settings=access.
 */
export function essentialsHref(
  gap: AgendaGap,
  propertyIdByName?: Record<string, string>,
): string | null {
  if (gap.kind !== "missing_essentials") return null;
  const id = propertyIdByName?.[gap.property];
  return id ? `/properties/${id}?settings=access` : "/properties";
}
