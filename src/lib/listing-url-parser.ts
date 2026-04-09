/**
 * Parses an OTA listing URL and extracts the platform + listing ID.
 *
 * Supported formats:
 * - https://www.airbnb.com/rooms/1240054136658113220
 * - https://airbnb.com/rooms/1234567?check_in=...
 * - https://www.airbnb.com/hosting/listings/1234567
 * - https://www.booking.com/hotel/us/my-property.html
 * - https://www.vrbo.com/1234567
 */
export function parseListingUrl(
  url: string
): { platform: string; listingId: string } | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace("www.", "");

    if (host.includes("airbnb")) {
      // Match /rooms/{id} or /hosting/listings/{id}
      const match = parsed.pathname.match(
        /\/(?:rooms|hosting\/listings)\/(\d+)/
      );
      if (match) return { platform: "airbnb", listingId: match[1] };
    }

    if (host.includes("booking.com")) {
      // Match /hotel/xx/name.html or property ID in URL
      const match = parsed.pathname.match(/\/hotel\/\w+\/([^/.]+)/);
      if (match) return { platform: "booking_com", listingId: match[1] };
    }

    if (host.includes("vrbo.com") || host.includes("homeaway.com")) {
      const match = parsed.pathname.match(/\/(\d+)/);
      if (match) return { platform: "vrbo", listingId: match[1] };
    }

    return null;
  } catch {
    return null;
  }
}
