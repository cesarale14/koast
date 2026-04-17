/**
 * Track B Stage 0 gate — shared constants + helpers that protect every
 * BDC calendar-push code path from accidental writes while the safe-
 * restrictions helper (F1-F6) is being built.
 *
 * See docs/postmortems/INCIDENT_POSTMORTEM_BDC_CLOBBER.md for the incident
 * that motivated the gate and the list of entry points that must respect it.
 *
 * Callers:
 *   - src/app/api/channels/connect-booking-com/activate/route.ts (unconditional)
 *   - src/app/api/pricing/push/[propertyId]/route.ts              (unconditional)
 *   - src/app/api/channels/rates/[propertyId]/route.ts            (only when
 *       the POST body's channel_code targets BDC — Airbnb / Direct saves
 *       stay functional)
 *
 * Remove the gate by setting env var KOAST_ALLOW_BDC_CALENDAR_PUSH=true.
 */

export const CALENDAR_PUSH_DISABLED_MESSAGE =
  "BDC calendar push is disabled pending safe-restrictions helper (Track B Stage 1). See docs/postmortems/INCIDENT_POSTMORTEM_BDC_CLOBBER.md.";

export function isCalendarPushEnabled(): boolean {
  return process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH === "true";
}

/**
 * True if the channel_code string names Booking.com in any form the
 * calendar rate editor has accepted historically (BDC / booking_com /
 * booking-com / booking.com / booking). Case-insensitive.
 *
 * USE THIS HELPER — do not inline BDC detection in new code. Alias list
 * may grow as channel names surface from Channex exports, OTA imports,
 * or host-typed values; keep a single source of truth.
 */
export function isBdcChannelCode(code: string | null | undefined): boolean {
  if (!code) return false;
  const n = code.toLowerCase().trim();
  return (
    n === "bdc" ||
    n === "booking_com" ||
    n === "booking-com" ||
    n === "booking.com" ||
    n === "booking"
  );
}
