/**
 * Pricing-recommendation freshness / validity window (P4.2).
 *
 * A recommendation is only actionable if BOTH hold:
 *   1. its target `date` has not passed (date >= today) — a rec about a night
 *      that's already gone is never "act now"; and
 *   2. the run that produced it is recent (created_at within REC_VALIDITY_DAYS)
 *      — if the daily engine run stopped, a 10-day-old future rec must NOT keep
 *      screaming "act now" off stale signals.
 *
 * Root cause this closes: the daily /api/pricing/calculate run DELETE-then-inserts
 * pending rows only for the window today..+90, so rows whose date goes PAST linger
 * forever (the Apr–Jun stale set). And every read surface ordered by date-asc
 * surfaced those past rows FIRST. Both surfaces now filter through isRecFresh, and
 * the calculate run sweeps past-date pending rows so they never accumulate.
 *
 * Pure functions — deterministic, no clock reads (callers pass `nowISO`).
 */

/** A run older than this (in days) is considered stale even for a future date. */
export const REC_VALIDITY_DAYS = 2;

const DAY_MS = 86_400_000;

/** The UTC calendar date (YYYY-MM-DD) of an ISO instant. */
export function todayStrUTC(nowISO: string): string {
  return nowISO.slice(0, 10);
}

export interface RecFreshnessFields {
  /** Target night, YYYY-MM-DD. */
  date: string;
  /** When the rec row was written, ISO timestamp. */
  createdAt: string | null | undefined;
}

/**
 * True iff the rec is still actionable as of `nowISO`. date >= today AND the
 * producing run is within REC_VALIDITY_DAYS. A missing/unparseable createdAt
 * fails the freshness check (we can't prove the run is recent → treat as stale).
 */
export function isRecFresh(
  rec: RecFreshnessFields,
  nowISO: string,
  validityDays: number = REC_VALIDITY_DAYS,
): boolean {
  // 1) target date not in the past (calendar-date string compare; both UTC).
  if (rec.date < todayStrUTC(nowISO)) return false;

  // 2) producing run recent enough.
  if (!rec.createdAt) return false;
  const createdMs = Date.parse(rec.createdAt);
  if (!Number.isFinite(createdMs)) return false;
  const nowMs = Date.parse(nowISO);
  if (!Number.isFinite(nowMs)) return false;
  return createdMs >= nowMs - validityDays * DAY_MS;
}

/** Filter a list of recs to only the fresh ones. */
export function filterFreshRecs<T extends RecFreshnessFields>(
  recs: readonly T[],
  nowISO: string,
  validityDays: number = REC_VALIDITY_DAYS,
): T[] {
  return recs.filter((r) => isRecFresh(r, nowISO, validityDays));
}
