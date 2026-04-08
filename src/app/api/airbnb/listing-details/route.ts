import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";

/**
 * In-memory cache for listing details (per serverless invocation).
 * Prevents duplicate fetches within the same request lifecycle.
 */
const listingCache = new Map<
  string,
  { name: string | null; short_name: string | null; photo_url: string | null; success: boolean }
>();

/**
 * Multiple User-Agent strings to rotate through if one gets blocked.
 */
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (compatible; StayCommand/1.0)",
];

/**
 * Extracts OG meta tags from Airbnb HTML.
 */
function parseOgTags(html: string): { name: string | null; photo_url: string | null } {
  const ogTitle =
    html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/) ??
    html.match(/<meta\s+content="([^"]*)"\s+property="og:title"/);
  const ogImage =
    html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/) ??
    html.match(/<meta\s+content="([^"]*)"\s+property="og:image"/);

  return {
    name: ogTitle?.[1] ?? null,
    photo_url: ogImage?.[1] ?? null,
  };
}

/**
 * Extracts a short name from the full Airbnb og:title.
 * Airbnb returns titles like "Home in Tampa · ★4.82 · 4 bedrooms · 6 beds · 2 baths"
 * We extract just the first part before the "·" character.
 */
function extractShortName(fullName: string | null): string | null {
  if (!fullName) return null;
  const parts = fullName.split("·");
  return parts[0].trim() || fullName.trim();
}

/**
 * Fetches listing details from Airbnb with retry logic.
 * Tries up to 3 attempts, rotating User-Agent strings.
 */
async function fetchListingDetails(
  listingId: string
): Promise<{ name: string | null; short_name: string | null; photo_url: string | null; success: boolean }> {
  // Check cache first
  const cached = listingCache.get(listingId);
  if (cached) return cached;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const userAgent = USER_AGENTS[attempt % USER_AGENTS.length];
      const res = await fetch(`https://www.airbnb.com/rooms/${listingId}`, {
        headers: { "User-Agent": userAgent },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 403 || res.status === 429) {
        console.warn(
          `[airbnb/listing-details] Attempt ${attempt + 1} blocked (${res.status}), retrying...`
        );
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      const html = await res.text();
      const { name, photo_url } = parseOgTags(html);
      const success = !!(name || photo_url);

      if (!success && attempt < 2) {
        console.warn(
          `[airbnb/listing-details] Attempt ${attempt + 1} no OG tags found, retrying...`
        );
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      const result = { name, short_name: extractShortName(name), photo_url, success };
      listingCache.set(listingId, result);
      return result;
    } catch (err) {
      console.warn(
        `[airbnb/listing-details] Attempt ${attempt + 1} failed:`,
        err instanceof Error ? err.message : err
      );
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // All attempts failed — return fallback
  const fallback = {
    name: `Airbnb Listing ${listingId}`,
    short_name: `Airbnb Listing ${listingId}`,
    photo_url: null,
    success: false,
  };
  listingCache.set(listingId, fallback);
  return fallback;
}

/**
 * GET /api/airbnb/listing-details?listingId=1240054136658113220
 * Fetches listing name + photo from the public Airbnb page via OG meta tags.
 * Includes retry logic (up to 3 attempts), User-Agent rotation, and in-memory caching.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const listingId = request.nextUrl.searchParams.get("listingId");
    if (!listingId) {
      return NextResponse.json({ error: "Missing listingId query param" }, { status: 400 });
    }

    const result = await fetchListingDetails(listingId);

    return NextResponse.json({
      listing_id: listingId,
      name: result.name,
      short_name: result.short_name,
      photo_url: result.photo_url,
      success: result.success,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[airbnb/listing-details]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
