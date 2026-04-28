// Session 6.1c — single source of truth for resolving the guest's
// display name on a review or message card.
//
// Priority today (two real branches):
//   1. bookingGuestName, if non-empty AND not the literal sentinel
//      "Airbnb Guest" that iCal sync writes when the OTA hides the
//      real name. iCal feeds for Airbnb don't expose customer
//      identity, so the worker fills this constant — we treat it
//      as "no real name" and fall through.
//   2. Platform-tagged fallback ("Airbnb Guest", "Booking.com guest",
//      "Vrbo guest", "Guest").
//
// channexGuestName is accepted for forward compatibility. Today it
// is null on every Airbnb review Channex returns (see channex-expert
// known-quirks.md #7) so it never wins. When Airbnb ingestion
// migrates from iCal to /booking_revisions/feed (session 6.3),
// either bookingGuestName starts carrying the real name OR
// channexGuestName starts being populated — at that point we slot
// in the third branch. Keep the param to avoid a signature change
// when that flips.

const ICAL_AIRBNB_SENTINEL = "Airbnb Guest";

export interface ResolveDisplayGuestNameInput {
  // Session 6.3 — host's manual override. Wins over every other
  // source. Set via the inline-edit pencil on review cards. Used to
  // recover names for historical reviews whose booking has aged out
  // of Channex's /bookings window (channex-expert known-quirks #20).
  overrideName?: string | null | undefined;
  bookingGuestName: string | null | undefined;
  channexGuestName: string | null | undefined;
  platform: string | null | undefined;
}

function platformFallback(platform: string | null | undefined): string {
  switch ((platform ?? "").toLowerCase()) {
    case "airbnb":
      return "Airbnb Guest";
    case "booking_com":
    case "booking.com":
    case "bdc":
      return "Booking.com guest";
    case "vrbo":
    case "homeaway":
      return "Vrbo guest";
    default:
      return "Guest";
  }
}

export function resolveDisplayGuestName({
  overrideName,
  bookingGuestName,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  channexGuestName,
  platform,
}: ResolveDisplayGuestNameInput): string {
  const ov = (overrideName ?? "").trim();
  if (ov) return ov;
  const bk = (bookingGuestName ?? "").trim();
  if (bk && bk !== ICAL_AIRBNB_SENTINEL) return bk;
  return platformFallback(platform);
}

// Session 6.7 — calendar-pill label resolver.
//
// KoastBookingBar previously called a local helper that didn't share
// this file's iCal-sentinel knowledge — so `guest_name='Airbnb Guest'`
// rendered as "Airbnb G." on the pill (read as a fake name with a
// fake last initial). This shared helper is the canonical entry point
// for any surface that renders a guest name as a short label: returns
// first-name-plus-last-initial when a real name is available, or a
// platform-tagged short fallback when the underlying value is the
// iCal sentinel / null / empty.
//
// Three cleanup rules baked in:
//   1. Trim whitespace; treat empty as null.
//   2. Strip a literal " None" suffix (booking_sync.py concatenates
//      guest_first_name + guest_last_name without a null guard, so
//      missing last names surface as "Jasiauna None" — render as
//      "Jasiauna" rather than "Jasiauna N."). See tech-debt.md for
//      the source-side fix.
//   3. ICAL_AIRBNB_SENTINEL ("Airbnb Guest") falls through to platform
//      fallback, same as resolveDisplayGuestName.
//
// Convention: any new surface that renders a guest name as a short
// label should use this helper. Don't reinvent truncation per
// component (the calendar-pill bug from 6.7 is the worked example of
// what reinvention costs).
const NONE_SUFFIX_RE = /\s+None\s*$/i;

function shortPlatformFallback(platform: string | null | undefined): string {
  switch ((platform ?? "").toLowerCase()) {
    case "airbnb":
      return "Airbnb";
    case "booking_com":
    case "booking.com":
    case "bdc":
      return "Booking";
    case "vrbo":
    case "homeaway":
      return "Vrbo";
    case "direct":
      return "Direct";
    default:
      return "Guest";
  }
}

export function resolveBookingPillLabel({
  guestName,
  platform,
}: {
  guestName: string | null | undefined;
  platform: string | null | undefined;
}): string {
  const cleaned = (guestName ?? "").trim().replace(NONE_SUFFIX_RE, "").trim();
  if (!cleaned || cleaned === ICAL_AIRBNB_SENTINEL) {
    return shortPlatformFallback(platform);
  }
  const parts = cleaned.split(/\s+/);
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return last ? `${first} ${last.toUpperCase()}.` : first;
}
