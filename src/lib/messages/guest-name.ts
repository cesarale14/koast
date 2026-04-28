/**
 * Multi-tier guest display name resolver for the messaging surface.
 *
 * Mirrors the four-tier convention from `references/conventions.md`
 * "Multi-tier guest_display_name resolver". Reviews uses a sibling
 * resolver at `src/lib/guest-name.ts` (different table, different
 * override-column name); the two are deliberately not unified yet —
 * see that note in the conventions doc.
 *
 * Tier order:
 *   1. bookings.guest_name (first non-empty wins)
 *   2. message_threads.title (Airbnb often carries the guest first
 *      name here when bookings.guest_name is null)
 *   3. Platform-tagged fallback ("Airbnb Guest", "Booking.com Guest")
 *
 * Tier 0 (manual override column) is reserved — `bookings` has no
 * override column today; the reviews table has `guest_name_override`
 * but messages don't surface a parallel control. If/when one ships,
 * slot it ahead of tier 1.
 *
 * The Python worker `~/koast-workers/messaging_executor.py`
 * mirrors this logic with a comment pointing here as canonical.
 * Keep the two in sync.
 */

const PLATFORM_LABEL: Record<string, string> = {
  airbnb: "Airbnb Guest",
  abb: "Airbnb Guest",
  booking_com: "Booking.com Guest",
  bookingcom: "Booking.com Guest",
  bdc: "Booking.com Guest",
  vrbo: "Vrbo Guest",
  direct: "Guest",
};

export function resolveGuestName(
  bookingGuestName: string | null | undefined,
  threadTitle: string | null | undefined,
  platform: string | null | undefined
): string {
  const fromBooking = (bookingGuestName ?? "").trim();
  if (fromBooking && !/^guest$/i.test(fromBooking)) return fromBooking;

  const fromThread = (threadTitle ?? "").trim();
  // Reject titles that are obviously not personal (Channex sometimes
  // sends "Conversation with X" or the channel display name).
  if (fromThread && !/^conversation\b/i.test(fromThread) && !/^(airbnb|booking)/i.test(fromThread)) {
    return fromThread;
  }

  const key = (platform ?? "").trim().toLowerCase();
  return PLATFORM_LABEL[key] ?? "Guest";
}
