import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { parseListingUrl } from "@/lib/listing-url-parser";
import { fetchListingDetails } from "@/lib/listing-details";
import { autoBootstrapCompSet } from "@/lib/airroi/compsets";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = ReturnType<typeof createServiceClient>;

/**
 * POST /api/properties/import-from-url
 *
 * Creates a property from a listing URL (no Channex required).
 *
 * Body:
 * {
 *   "listing_url": "https://www.airbnb.com/rooms/1234567",
 *   "custom_name": "Villa Jamaica",       // optional
 *   "ical_url": "https://www.airbnb.com/calendar/ical/..."  // optional
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const { user } = await getAuthenticatedUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { listing_url, custom_name, ical_url } = body as {
      listing_url: string;
      custom_name?: string;
      ical_url?: string;
    };

    if (!listing_url) {
      return NextResponse.json(
        { error: "Missing listing_url" },
        { status: 400 }
      );
    }

    // 2. Parse listing URL
    const parsed = parseListingUrl(listing_url);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "Could not parse listing URL. Supported: Airbnb, Booking.com, VRBO",
        },
        { status: 400 }
      );
    }

    const { platform, listingId } = parsed;

    // 3. Fetch listing details (name, photo)
    const details = await fetchListingDetails(platform, listingId);
    const propertyName = custom_name || details.shortName;
    const photoUrl = details.photoUrl;

    const supabase = createServiceClient();

    // 4. Check for duplicate listing
    const { data: existingListings } = await supabase
      .from("listings")
      .select("id, property_id")
      .eq("platform", platform)
      .eq("platform_listing_id", listingId)
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingListing = ((existingListings ?? []) as any[])[0];
    if (existingListing) {
      // Check if this user owns the property
      const { data: existingProp } = await supabase
        .from("properties")
        .select("id, name, cover_photo_url")
        .eq("id", existingListing.property_id)
        .eq("user_id", user.id)
        .limit(1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prop = ((existingProp ?? []) as any[])[0];
      if (prop) {
        return NextResponse.json(
          {
            error: "This listing has already been imported",
            property: {
              id: prop.id,
              name: prop.name,
              photo_url: prop.cover_photo_url,
              platform,
            },
          },
          { status: 409 }
        );
      }
    }

    // 5. Create property in DB
    // Try to extract location from name or default to Tampa
    const nameLower = propertyName.toLowerCase();
    const isTampa = nameLower.includes("tampa");
    const defaultLat = isTampa ? "27.9506" : null;
    const defaultLng = isTampa ? "-82.4572" : null;

    const { data: newProp, error: insertErr } = await supabase
      .from("properties")
      .insert({
        user_id: user.id,
        name: propertyName,
        cover_photo_url: photoUrl,
        city: isTampa ? "Tampa" : null,
        state: isTampa ? "FL" : null,
        latitude: defaultLat,
        longitude: defaultLng,
      })
      .select("id")
      .single();

    if (insertErr) {
      return NextResponse.json(
        { error: `Property insert failed: ${insertErr.message}` },
        { status: 500 }
      );
    }

    const propertyId = newProp.id;
    console.log(
      `[import-from-url] Created property ${propertyId} name="${propertyName}"`
    );

    // 5b. Auto-bootstrap comp set from AirROI. Non-blocking — any error
    //     here logs a warning and continues so a flaky AirROI run doesn't
    //     fail the import. Skip conditions (no lat/lng, <3 matches, env
    //     disable) are normal and logged.
    try {
      const bootstrap = await autoBootstrapCompSet(supabase, propertyId);
      if (bootstrap.inserted > 0) {
        console.log(
          `[import-from-url] Bootstrapped ${bootstrap.inserted} comps for ${propertyId}`
        );
      } else {
        console.log(
          `[import-from-url] Comp bootstrap skipped for ${propertyId}: ${bootstrap.reason}${
            bootstrap.count != null ? ` (count=${bootstrap.count})` : ""
          }`
        );
      }
    } catch (err) {
      console.warn(
        "[import-from-url] Comp bootstrap error:",
        err instanceof Error ? err.message : err
      );
    }

    // 6. Create listings record
    const { error: listingErr } = await supabase.from("listings").insert({
      property_id: propertyId,
      platform,
      platform_listing_id: listingId,
      listing_url: listing_url.trim(),
      status: "active",
    });

    if (listingErr) {
      console.warn(
        "[import-from-url] Failed to create listing record:",
        listingErr.message
      );
    }

    // 7. Handle iCal feed if provided
    let bookingCount = 0;
    if (ical_url) {
      try {
        // Save iCal feed
        await supabase.from("ical_feeds").upsert(
          {
            property_id: propertyId,
            platform,
            feed_url: ical_url,
            platform_listing_id: listingId,
            is_active: true,
          },
          { onConflict: "property_id,platform" }
        );
        console.log(`[import-from-url] Saved iCal feed for ${platform}`);

        // Sync bookings inline
        bookingCount = await syncIcalBookings(
          propertyId,
          platform,
          ical_url,
          supabase
        );
        console.log(
          `[import-from-url] Synced ${bookingCount} bookings from iCal`
        );
      } catch (err) {
        console.warn(
          "[import-from-url] iCal sync failed:",
          err instanceof Error ? err.message : err
        );
      }
    }

    // 8. Return result
    return NextResponse.json({
      property: {
        id: propertyId,
        name: propertyName,
        photo_url: photoUrl,
        platform,
      },
      booking_count: bookingCount,
      imported: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[import-from-url]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Fetches and parses an iCal feed, inserting new bookings into the DB.
 */
async function syncIcalBookings(
  propertyId: string,
  platform: string,
  icalUrl: string,
  supabase: SupabaseClient
): Promise<number> {
  const res = await fetch(icalUrl, {
    headers: { "User-Agent": "StayCommand/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return 0;
  const text = await res.text();

  // Parse iCal events
  const events = text.split("BEGIN:VEVENT");
  let count = 0;
  for (const event of events.slice(1)) {
    const dtstart = event.match(
      /DTSTART(?:;VALUE=DATE)?:(\d{4})(\d{2})(\d{2})/
    );
    const dtend = event.match(/DTEND(?:;VALUE=DATE)?:(\d{4})(\d{2})(\d{2})/);
    const summary = event.match(/SUMMARY:(.*)/);
    const uid = event.match(/UID:(.*)/);

    if (!dtstart || !dtend) continue;

    const checkIn = `${dtstart[1]}-${dtstart[2]}-${dtstart[3]}`;
    const checkOut = `${dtend[1]}-${dtend[2]}-${dtend[3]}`;
    const guestName = summary?.[1]?.trim() || "Guest";
    const bookingUid = uid?.[1]?.trim() || `ical-${checkIn}-${checkOut}`;

    // Skip blocked/unavailable dates
    if (
      guestName.toLowerCase().includes("not available") ||
      guestName.toLowerCase().includes("blocked") ||
      guestName.toLowerCase().includes("unavailable")
    )
      continue;

    // Dedup: check if booking exists
    const { data: existing } = await supabase
      .from("bookings")
      .select("id")
      .eq("property_id", propertyId)
      .eq("check_in", checkIn)
      .eq("check_out", checkOut)
      .eq("platform", platform)
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (existing && (existing as any[]).length > 0) continue;

    await supabase.from("bookings").insert({
      property_id: propertyId,
      platform,
      platform_booking_id: bookingUid,
      guest_name:
        guestName === "Reserved" ? "Airbnb Guest" : guestName,
      check_in: checkIn,
      check_out: checkOut,
      status: "confirmed",
    });
    count++;
  }
  return count;
}
