/**
 * Fetch listing cover photos from OTA platforms via og:image meta tags.
 * OTAs expose og:image publicly for link previews (Facebook, Twitter, iMessage, etc).
 */

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ---------- Listing ID extraction ----------

/**
 * Extract the platform listing ID from an iCal feed URL.
 */
export function extractListingId(feedUrl: string, platform: string): string | null {
  try {
    if (platform === "airbnb") {
      // https://www.airbnb.com/calendar/ical/{LISTING_ID}.ics?t=...
      const match = feedUrl.match(/airbnb\.com\/calendar\/ical\/(\d+)\.ics/);
      return match?.[1] ?? null;
    }
    if (platform === "vrbo") {
      // https://www.vrbo.com/ical/{LISTING_ID}.ics
      const match = feedUrl.match(/vrbo\.com\/ical\/([^/.]+)\.ics/);
      return match?.[1] ?? null;
    }
    if (platform === "booking_com") {
      // https://ical.booking.com/v1/export/t/{UUID}.ics — opaque UUID, no public listing URL
      const match = feedUrl.match(/booking\.com\/v1\/export\/t\/([^/.]+)\.ics/);
      return match?.[1] ?? null;
    }
  } catch {
    // Malformed URL
  }
  return null;
}

/**
 * Build the public listing URL for a platform.
 */
function buildListingUrl(platform: string, listingId: string): string | null {
  if (platform === "airbnb") return `https://www.airbnb.com/rooms/${listingId}`;
  if (platform === "vrbo") return `https://www.vrbo.com/${listingId}`;
  // Booking.com UUIDs from iCal don't map to public URLs
  return null;
}

// ---------- OG Image extraction ----------

/**
 * Extract og:image URL from HTML content.
 */
function extractOgImage(html: string): string | null {
  // Match <meta property="og:image" content="..."/>
  const match = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    ?? html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (!match?.[1]) return null;
  // Decode HTML entities
  return match[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/**
 * Fetch the cover photo URL for a listing on any supported platform.
 * Returns the og:image URL or null if not available.
 */
export async function fetchListingPhoto(
  platform: string,
  listingId: string
): Promise<string | null> {
  const url = buildListingUrl(platform, listingId);
  if (!url) return null;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA },
      redirect: "follow",
    });
    if (!res.ok) return null;

    const html = await res.text();
    return extractOgImage(html);
  } catch {
    return null;
  }
}

/**
 * Fetch cover photo for a property from its iCal feed URL.
 * Combines extractListingId + fetchListingPhoto.
 */
export async function fetchPropertyPhoto(
  feedUrl: string,
  platform: string
): Promise<{ listingId: string | null; photoUrl: string | null }> {
  const listingId = extractListingId(feedUrl, platform);
  if (!listingId) return { listingId: null, photoUrl: null };

  const photoUrl = await fetchListingPhoto(platform, listingId);
  return { listingId, photoUrl };
}
