/**
 * resolvePropertyTimezone — THE onboarding invariant (P7.2).
 *
 * Every property-creation path runs this so a new property NEVER gets a null
 * timezone. buildAgendaRollup SKIPS any property with a null/invalid tz (a
 * wrong-day item is worse than a missing one) — so a null tz makes the property
 * invisible to Today / Calendar / Pricing. That was the second of the two
 * onboarding dead-ends; this function closes it at the source.
 *
 * Resolution order (always returns a non-null IANA string):
 *   1. valid lat/lng  → offline tz-lookup (no network, deterministic)
 *   2. country code   → a small launch-region fallback map
 *   3. last resort    → the launch region (US/ET)
 */
import tzlookup from "tz-lookup";

const COUNTRY_DEFAULT_TZ: Record<string, string> = {
  US: "America/New_York",
  USA: "America/New_York",
  CA: "America/Toronto",
  CAN: "America/Toronto",
  GB: "Europe/London",
  UK: "Europe/London",
  IE: "Europe/Dublin",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  MX: "America/Mexico_City",
};

/**
 * Launch-region last resort. The fleet is US/Eastern; a tz that is wrong by a
 * few hours is still vastly better than null (null = invisible to the agenda).
 * Revisit the fallback chain when non-US hosts onboard.
 */
export const LAST_RESORT_TZ = "America/New_York";

function toNum(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function validLatLng(lat: number, lng: number): boolean {
  // Reject out-of-range and the (0,0) "null island" sentinel that some
  // no-coords paths leave behind.
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
}

export function resolvePropertyTimezone(input: {
  latitude?: number | string | null;
  longitude?: number | string | null;
  country?: string | null;
}): string {
  const lat = toNum(input.latitude);
  const lng = toNum(input.longitude);
  if (lat != null && lng != null && validLatLng(lat, lng)) {
    try {
      const tz = tzlookup(lat, lng);
      if (tz) return tz;
    } catch {
      // out-of-range / lookup failure → fall through to the country fallback
    }
  }
  const cc = (input.country ?? "").trim().toUpperCase();
  if (cc && COUNTRY_DEFAULT_TZ[cc]) return COUNTRY_DEFAULT_TZ[cc];
  return LAST_RESORT_TZ;
}
