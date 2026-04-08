import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";

/**
 * GET /api/airbnb/listing-details?listingId=1240054136658113220
 * Fetches listing name + photo from the public Airbnb page via OG meta tags.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const listingId = request.nextUrl.searchParams.get("listingId");
    if (!listingId) {
      return NextResponse.json({ error: "Missing listingId query param" }, { status: 400 });
    }

    let name: string | null = null;
    let photo_url: string | null = null;
    let success = false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`https://www.airbnb.com/rooms/${listingId}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; StayCommand/1.0)",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const html = await res.text();

      const ogTitle =
        html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/) ??
        html.match(/<meta\s+content="([^"]*)"\s+property="og:title"/);
      const ogImage =
        html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/) ??
        html.match(/<meta\s+content="([^"]*)"\s+property="og:image"/);

      name = ogTitle?.[1] ?? null;
      photo_url = ogImage?.[1] ?? null;
      success = !!(name || photo_url);
    } catch (err) {
      console.warn("[airbnb/listing-details] Fetch failed:", err instanceof Error ? err.message : err);
    }

    return NextResponse.json({
      listing_id: listingId,
      name,
      photo_url,
      success,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[airbnb/listing-details]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
