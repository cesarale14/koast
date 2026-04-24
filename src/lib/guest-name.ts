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
  bookingGuestName,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  channexGuestName,
  platform,
}: ResolveDisplayGuestNameInput): string {
  const bk = (bookingGuestName ?? "").trim();
  if (bk && bk !== ICAL_AIRBNB_SENTINEL) return bk;
  return platformFallback(platform);
}
