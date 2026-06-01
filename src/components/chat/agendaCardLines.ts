/**
 * agendaCardLines — the AgendaCard's pure text composition, extracted from the
 * component so it is unit-testable without a DOM/React renderer (the repo's jest
 * is node-env, no testing-library). The component owns JSX; this owns the
 * English composed from the typed payload's structured fields.
 *
 * The server ships per-item dates; this renders them. UPCOMING count lines must
 * show their items' ACTUAL date(s) — a multi-day group can't be stamped with one
 * representative date or a Jun-3 item displays under a false "Jun 2".
 */
import type { AgendaGap, AgendaPropertyGroup } from "@/lib/agent/render/types";

/** iso = YYYY-MM-DD → "Jun 2". Parsed + formatted in UTC so the label never
 * shifts by the viewer's timezone. */
export function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Distinct item dates, chronologically, as "Jun 2, Jun 3". ISO YYYY-MM-DD
 * sorts by calendar date, so a plain string sort is chronological. */
function datesLabel(entries: { date: string }[]): string {
  return Array.from(new Set(entries.map((e) => e.date))).sort().map(fmtDate).join(", ");
}

function entryLine(
  label: string,
  entries: { guest: string | null; date: string }[],
  showDates: boolean,
): string | null {
  if (entries.length === 0) return null;
  const named = entries.filter((e) => e.guest).map((e) => e.guest as string);
  const nameless = entries.length - named.length;
  const detail = named.length
    ? ` (${named.join(", ")}${nameless ? `, +${nameless}` : ""})`
    : "";
  // UPCOMING items carry their own day(s): show every DISTINCT date so a
  // multi-day group never displays under one item's date (a Jun-3 item must not
  // read as "Jun 2"). TODAY is all-today, so no per-item date.
  const date = showDates ? ` · ${datesLabel(entries)}` : "";
  return `${entries.length} ${label}${entries.length === 1 ? "" : "s"}${detail}${date}`;
}

/** The per-property lines for a TODAY (upcoming=false) or UPCOMING (true) block.
 * TODAY items are all today, so no per-item date; UPCOMING items carry dates. */
export function propertyBlockLines(g: AgendaPropertyGroup, upcoming: boolean): string[] {
  return [
    entryLine("check-out", g.checkOuts, upcoming),
    entryLine("check-in", g.checkIns, upcoming),
    g.turnovers.length ? `${g.turnovers.length} turnover${g.turnovers.length === 1 ? "" : "s"}` : null,
  ].filter((l): l is string => l !== null);
}

export function relTurnover(iso: string, today: string): string {
  if (iso === today) return "today's";
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  if (iso === t.toISOString().slice(0, 10)) return "tomorrow's";
  return `the ${fmtDate(iso)}`;
}

export function gapSentence(gap: AgendaGap, today: string): string {
  switch (gap.kind) {
    case "no_cleaner":
      return gap.date
        ? `${gap.property}: no cleaner for ${relTurnover(gap.date, today)} turnover`
        : `${gap.property}: no cleaner assigned`;
    case "missing_essentials":
      return `${gap.property}: missing check-in essentials`;
    case "awaiting_reply":
      return `${gap.guest ?? "A guest"} at ${gap.property} may be awaiting a reply`;
  }
}
