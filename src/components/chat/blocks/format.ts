/**
 * Pure formatting helpers shared by the block components (P2.2). Extracted from
 * the components so they're unit-testable in the node test env (no React
 * renderer). All deterministic — relativeTime takes an injectable `now`.
 */

export function nightsBetween(checkIn: string, checkOut: string): number {
  const ci = Date.UTC(+checkIn.slice(0, 4), +checkIn.slice(5, 7) - 1, +checkIn.slice(8, 10));
  const co = Date.UTC(+checkOut.slice(0, 4), +checkOut.slice(5, 7) - 1, +checkOut.slice(8, 10));
  return Math.round((co - ci) / 86400000);
}

/** First name, mapping placeholder guest labels ("Airbnb"/"Guest") to "Guest". */
export function firstNameOf(name: string | null): string {
  const raw = name?.split(/\s+/)[0] ?? "";
  return raw && raw !== "Airbnb" && raw !== "Guest" ? raw : "Guest";
}

/** 1–2 letter initials for an avatar; "?" when empty. */
export function initialsOf(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Compact relative time ("now"/"5m"/"3h"/"2d", then a short date past a week). */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const min = Math.round((now - then) / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtMonthDay(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtWeekdayMonthDay(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
