import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/connection";
import { icalFeeds } from "@/lib/db/schema";
import { parseICalFeed, validateICalUrl } from "@/lib/ical/parser";
import { syncICalFeeds } from "@/lib/ical/sync";

function detectPlatform(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("airbnb.com")) return "airbnb";
  if (lower.includes("vrbo.com") || lower.includes("homeaway.com")) return "vrbo";
  if (lower.includes("booking.com")) return "booking_com";
  return "direct";
}

export async function POST(request: NextRequest) {
  try {
    const { property_id, feed_url, platform } = await request.json();

    if (!property_id || !feed_url) {
      return NextResponse.json({ error: "property_id and feed_url required" }, { status: 400 });
    }

    // Validate by fetching
    let parsed;
    try {
      const res = await fetch(feed_url, { headers: { "User-Agent": "StayCommand/1.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!validateICalUrl(text)) {
        return NextResponse.json({
          error: "Invalid iCal feed. Make sure the URL points to an .ics calendar export, not a webpage.",
        }, { status: 400 });
      }
      parsed = await parseICalFeed(feed_url);
    } catch (err) {
      return NextResponse.json({
        error: `Could not fetch calendar: ${err instanceof Error ? err.message : String(err)}`,
      }, { status: 400 });
    }

    const detectedPlatform = platform ?? detectPlatform(feed_url);

    // Insert feed
    await db.insert(icalFeeds).values({
      propertyId: property_id,
      platform: detectedPlatform,
      feedUrl: feed_url,
      isActive: true,
    }).onConflictDoUpdate({
      target: [icalFeeds.propertyId, icalFeeds.platform],
      set: { feedUrl: feed_url, isActive: true, lastError: null },
    });

    // Run initial sync
    const syncResults = await syncICalFeeds(db, property_id);

    const bookingsCount = parsed.filter((b) => !b.isBlocked).length;
    const blockedCount = parsed.filter((b) => b.isBlocked).length;

    return NextResponse.json({
      success: true,
      platform: detectedPlatform,
      bookings_found: bookingsCount,
      blocked_dates: blockedCount,
      sync_results: syncResults,
    });
  } catch (err) {
    console.error("[ical/add] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
