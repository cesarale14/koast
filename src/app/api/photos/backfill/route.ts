import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { extractListingId, fetchListingPhoto } from "@/lib/photos/fetcher";

/**
 * POST /api/photos/backfill
 * Scan all iCal feeds, extract listing IDs, fetch cover photos,
 * and store on properties that don't have one yet.
 */
export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  // Get all properties for this user that have no cover photo
  const { data: props } = await service
    .from("properties")
    .select("id, cover_photo_url")
    .eq("user_id", user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = (props ?? []) as any[];
  const needsPhoto = properties.filter((p) => !p.cover_photo_url);
  if (needsPhoto.length === 0) {
    return NextResponse.json({ message: "All properties have photos", updated: 0 });
  }

  const propIds = needsPhoto.map((p) => p.id);

  // Get iCal feeds for these properties
  const { data: feeds } = await service
    .from("ical_feeds")
    .select("id, property_id, platform, feed_url, platform_listing_id")
    .in("property_id", propIds)
    .eq("is_active", true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feedRows = (feeds ?? []) as any[];

  const results: { propertyId: string; platform: string; listingId: string | null; photoUrl: string | null }[] = [];

  for (const feed of feedRows) {
    // Extract listing ID if not already stored
    let listingId = feed.platform_listing_id;
    if (!listingId) {
      listingId = extractListingId(feed.feed_url, feed.platform);
      if (listingId) {
        await service.from("ical_feeds").update({ platform_listing_id: listingId }).eq("id", feed.id);
      }
    }

    if (!listingId) {
      results.push({ propertyId: feed.property_id, platform: feed.platform, listingId: null, photoUrl: null });
      continue;
    }

    // Fetch cover photo
    const photoUrl = await fetchListingPhoto(feed.platform, listingId);
    results.push({ propertyId: feed.property_id, platform: feed.platform, listingId, photoUrl });

    // Store on property
    if (photoUrl) {
      await service
        .from("properties")
        .update({ cover_photo_url: photoUrl })
        .eq("id", feed.property_id);
    }
  }

  return NextResponse.json({
    scanned: feedRows.length,
    updated: results.filter((r) => r.photoUrl).length,
    results,
  });
}
