/**
 * The three mutually-exclusive Today states (P7.1). first_run (zero properties)
 * must NEVER collapse into all_set (≥1 property, nothing scheduled) — they look
 * different and mean different things. That collapse WAS the onboarding dead-end
 * (a brand-new account saw "you're all set" instead of a way in). Pure +
 * lib-layer so the distinction is testable without a DOM.
 */
export type TodayView = "first_run" | "all_set" | "agenda";

export function todayView(firstRun: boolean | undefined, empty: boolean): TodayView {
  if (firstRun) return "first_run"; // 0 properties — wins over `empty`
  if (empty) return "all_set"; // ≥1 property, nothing in the window
  return "agenda";
}
