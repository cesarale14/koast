import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/pooled";
import { icalFeeds } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { parseICalFeed, validateICalUrl } from "@/lib/ical/parser";
import { syncICalFeeds } from "@/lib/ical/sync";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { fetchPropertyPhoto } from "@/lib/photos/fetcher";
import { createServiceClient } from "@/lib/supabase/service";

function detectPlatform(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("airbnb.com")) return "airbnb";
  if (lower.includes("vrbo.com") || lower.includes("homeaway.com")) return "vrbo";
  if (lower.includes("booking.com")) return "booking_com";
  return "direct";
}

// Sentinel value the onboarding/property-create form uses when it wants to
// validate an iCal URL BEFORE the user has saved the property. We accept
// this instead of a real UUID and run the flow in "preview mode" which
// parses and counts bookings without writing anything to the DB.
const PREVIEW_PROPERTY_ID = "preview";

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { property_id, feed_url, platform } = await request.json();

    if (!property_id || !feed_url) {
      return NextResponse.json({ error: "property_id and feed_url required" }, { status: 400 });
    }

    const isPreview = property_id === PREVIEW_PROPERTY_ID;
    if (!isPreview) {
      const isOwner = await verifyPropertyOwnership(user.id, property_id);
      if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate by fetching
    let parsed;
    try {
      // AbortController-based timeout so a slow/hung iCal feed doesn't
      // tie up the Next.js handler for 30s. 15s is plenty for iCal export
      // endpoints at Airbnb/Vrbo/Booking.com.
      const ctl = new AbortController();
      const timeout = setTimeout(() => ctl.abort(), 15_000);
      let res: Response;
      try {
        res = await fetch(feed_url, { headers: { "User-Agent": "StayCommand/1.0" }, signal: ctl.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!validateICalUrl(text)) {
        return NextResponse.json({
          error: "Invalid iCal feed. Make sure the URL points to an .ics calendar export, not a webpage.",
        }, { status: 400 });
      }
      parsed = await parseICalFeed(feed_url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({
        error: msg.includes("aborted")
          ? "Calendar fetch timed out after 15 seconds. Check the URL and try again."
          : `Could not fetch calendar: ${msg}`,
      }, { status: 400 });
    }

    const detectedPlatform = platform ?? detectPlatform(feed_url);

    // Preview mode — return booking/blocked counts without writing to DB.
    // Used by the property-create form's "Test" button so the user can
    // validate their iCal URL before committing to saving the property.
    if (isPreview) {
      return NextResponse.json({
        preview: true,
        platform: detectedPlatform,
        bookings_found: parsed.filter((b) => !b.isBlocked).length,
        blocked_dates: parsed.filter((b) => b.isBlocked).length,
      });
    }

    // Upsert feed — check existing then insert or update
    const [existing] = await db.select({ id: icalFeeds.id })
      .from(icalFeeds)
      .where(and(eq(icalFeeds.propertyId, property_id), eq(icalFeeds.platform, detectedPlatform)))
      .limit(1);

    // Extract listing ID and fetch cover photo (non-blocking)
    const { listingId, photoUrl } = await fetchPropertyPhoto(feed_url, detectedPlatform);

    if (existing) {
      await db.update(icalFeeds)
        .set({ feedUrl: feed_url, isActive: true, lastError: null, platformListingId: listingId })
        .where(eq(icalFeeds.id, existing.id));
    } else {
      await db.insert(icalFeeds).values({
        propertyId: property_id,
        platform: detectedPlatform,
        feedUrl: feed_url,
        platformListingId: listingId,
        isActive: true,
      });
    }

    // Store cover photo on property if found and property has no photo yet
    if (photoUrl) {
      const supabase = createServiceClient();
      const { data: prop } = await supabase
        .from("properties")
        .select("cover_photo_url")
        .eq("id", property_id)
        .single();
      if (!prop?.cover_photo_url) {
        await supabase
          .from("properties")
          .update({ cover_photo_url: photoUrl })
          .eq("id", property_id);
      }
    }

    // Run initial sync
    const syncResults = await syncICalFeeds(db, property_id);

    const bookingsCount = parsed.filter((b) => !b.isBlocked).length;
    const blockedCount = parsed.filter((b) => b.isBlocked).length;

    return NextResponse.json({
      success: true,
      platform: detectedPlatform,
      listing_id: listingId,
      cover_photo_url: photoUrl,
      bookings_found: bookingsCount,
      blocked_dates: blockedCount,
      sync_results: syncResults,
    });
  } catch (err) {
    console.error("[ical/add] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
