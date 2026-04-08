import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

/**
 * POST /api/properties/import
 *
 * Imports or updates a StayCommand property from a Channex property that was
 * scaffolded via auto-scaffold and mapped via the Channex iframe.
 *
 * Body:
 * {
 *   "channex_property_id": "uuid",
 *   "listing_id": "12345",
 *   "custom_name": "My Beach House",  // optional
 *   "platform": "airbnb",
 *   "ical_url": "https://www.airbnb.com/calendar/ical/..."  // optional
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const {
      channex_property_id,
      listing_id,
      custom_name,
      platform,
      ical_url,
    } = body as {
      channex_property_id: string;
      listing_id: string;
      custom_name?: string;
      platform: string;
      ical_url?: string;
    };

    if (!channex_property_id) {
      return NextResponse.json({ error: "Missing channex_property_id" }, { status: 400 });
    }
    if (!listing_id) {
      return NextResponse.json({ error: "Missing listing_id" }, { status: 400 });
    }
    if (!platform) {
      return NextResponse.json({ error: "Missing platform" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const channex = createChannexClient();
    const now = new Date().toISOString();

    // 2. Resolve property name and photo
    let propertyName = custom_name || null;
    let photoUrl: string | null = null;

    if (!propertyName && platform === "airbnb" && listing_id) {
      // Fetch real name + photo from Airbnb listing details
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000";
        const detailsUrl = `${baseUrl}/api/airbnb/listing-details?listingId=${listing_id}`;

        // Use internal fetch with auth cookie forwarding
        const detailsRes = await fetch(detailsUrl, {
          headers: {
            cookie: request.headers.get("cookie") || "",
          },
        });
        if (detailsRes.ok) {
          const details = await detailsRes.json();
          if (details.success) {
            propertyName = details.short_name || details.name;
            photoUrl = details.photo_url;
          }
        }
      } catch (err) {
        console.warn("[properties/import] Failed to fetch Airbnb details:", err instanceof Error ? err.message : err);
      }
    }

    // Fallback name if nothing worked
    if (!propertyName) {
      propertyName = `Airbnb Listing ${listing_id}`;
    }

    // 3. Create or update StayCommand property
    const { data: existingProps } = await supabase
      .from("properties")
      .select("id, name, channex_property_id, cover_photo_url")
      .eq("channex_property_id", channex_property_id)
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingProp = ((existingProps ?? []) as any[])[0];
    let propertyId: string;

    if (existingProp) {
      // UPDATE existing property (e.g. rename from "Pending Setup" to real name)
      const updateData: Record<string, unknown> = {
        name: propertyName,
        updated_at: now,
      };
      if (photoUrl) updateData.cover_photo_url = photoUrl;

      const { error: updateErr } = await supabase
        .from("properties")
        .update(updateData)
        .eq("id", existingProp.id);

      if (updateErr) {
        return NextResponse.json({ error: `Update failed: ${updateErr.message}` }, { status: 500 });
      }
      propertyId = existingProp.id;
      console.log(`[properties/import] Updated property ${propertyId} name="${propertyName}"`);
    } else {
      // INSERT new property
      const { data: newProp, error: insertErr } = await supabase
        .from("properties")
        .insert({
          user_id: user.id,
          name: propertyName,
          channex_property_id: channex_property_id,
          cover_photo_url: photoUrl,
        })
        .select("id")
        .single();

      if (insertErr) {
        return NextResponse.json({ error: `Insert failed: ${insertErr.message}` }, { status: 500 });
      }
      propertyId = newProp.id;
      console.log(`[properties/import] Created property ${propertyId} name="${propertyName}"`);
    }

    // 4. Update Channex property title to match
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await channex.request<any>(`/properties/${channex_property_id}`, {
        method: "PUT",
        body: JSON.stringify({
          property: { title: propertyName },
        }),
      });
      console.log(`[properties/import] Updated Channex property title to "${propertyName}"`);
    } catch (err) {
      console.warn("[properties/import] Failed to update Channex title:", err instanceof Error ? err.message : err);
    }

    // 5. Cache room types + rate plans from Channex
    try {
      const roomTypes = await channex.getRoomTypes(channex_property_id);
      if (roomTypes.length > 0) {
        await supabase.from("channex_room_types").upsert(
          roomTypes.map((rt) => ({
            id: rt.id,
            property_id: propertyId,
            channex_property_id: channex_property_id,
            title: rt.attributes.title,
            count_of_rooms: rt.attributes.count_of_rooms ?? 1,
            occ_adults: rt.attributes.occ_adults ?? 4,
            occ_children: rt.attributes.occ_children ?? 0,
            cached_at: now,
          })),
          { onConflict: "id" }
        );
      }

      const ratePlans = await channex.getRatePlans(channex_property_id);
      if (ratePlans.length > 0) {
        await supabase.from("channex_rate_plans").upsert(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ratePlans.map((rp: any) => ({
            id: rp.id,
            property_id: propertyId,
            room_type_id: rp.relationships?.room_type?.data?.id ?? "",
            title: rp.attributes.title,
            sell_mode: rp.attributes.sell_mode ?? "per_room",
            currency: rp.attributes.currency ?? "USD",
            rate_mode: rp.attributes.rate_mode ?? "manual",
            cached_at: now,
          })),
          { onConflict: "id" }
        );
      }
    } catch (err) {
      console.warn("[properties/import] Failed to cache room types/rate plans:", err instanceof Error ? err.message : err);
    }

    // 6. Create property_channels record
    try {
      // Find the active channel for this platform
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const channelsRes = await channex.request<any>("/channels");
      const channelMapping: Record<string, string> = {
        airbnb: "AirBNB",
        booking_com: "BookingCom",
        vrbo: "VRBO",
      };
      const targetChannel = channelMapping[platform] || platform;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matchingChannel = (channelsRes.data ?? []).find((ch: any) => {
        const attrs = ch.attributes ?? {};
        return (
          attrs.channel === targetChannel &&
          attrs.is_active &&
          (attrs.properties ?? []).includes(channex_property_id)
        );
      });

      if (matchingChannel) {
        await supabase.from("property_channels").upsert(
          {
            property_id: propertyId,
            channex_channel_id: matchingChannel.id,
            channel_code: platform === "airbnb" ? "ABB" : platform === "booking_com" ? "BDC" : platform.toUpperCase(),
            channel_name: propertyName,
            status: "active",
            last_sync_at: now,
            updated_at: now,
          },
          { onConflict: "property_id,channex_channel_id" }
        );
        console.log(`[properties/import] Created property_channels record for ${platform}`);
      }
    } catch (err) {
      console.warn("[properties/import] Failed to create property_channels:", err instanceof Error ? err.message : err);
    }

    // 7. Push availability to Channex: all dates available, then block booked dates
    // Without this, Channex defaults to availability=0 which blocks the entire calendar on OTAs
    try {
      const roomTypes = await channex.getRoomTypes(channex_property_id);
      if (roomTypes.length > 0) {
        const startStr = new Date().toISOString().split("T")[0];
        const endAvail = new Date();
        endAvail.setDate(endAvail.getDate() + 365);
        const endStr = endAvail.toISOString().split("T")[0];

        // Set all dates to available
        const availValues = roomTypes.map((rt) => ({
          property_id: channex_property_id,
          room_type_id: rt.id,
          date_from: startStr,
          date_to: endStr,
          availability: 1,
        }));
        await channex.updateAvailability(availValues);
        console.log(`[properties/import] Pushed availability=1 for ${startStr} to ${endStr}`);

        // Block dates with existing bookings
        const { data: existingBookings } = await supabase
          .from("bookings")
          .select("check_in, check_out")
          .eq("property_id", propertyId)
          .in("status", ["confirmed", "completed"])
          .gte("check_out", startStr);

        if (existingBookings && existingBookings.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const blockedValues: any[] = [];
          for (const b of existingBookings as { check_in: string; check_out: string }[]) {
            for (const rt of roomTypes) {
              const ci = new Date(b.check_in + "T00:00:00Z");
              const co = new Date(b.check_out + "T00:00:00Z");
              for (let d = new Date(ci); d < co; d.setUTCDate(d.getUTCDate() + 1)) {
                const ds = d.toISOString().split("T")[0];
                if (ds >= startStr) {
                  blockedValues.push({
                    property_id: channex_property_id,
                    room_type_id: rt.id,
                    date_from: ds,
                    date_to: ds,
                    availability: 0,
                  });
                }
              }
            }
          }
          if (blockedValues.length > 0) {
            await channex.updateAvailability(blockedValues);
            console.log(`[properties/import] Blocked ${blockedValues.length} booked date entries`);
          }
        }
      }
    } catch (err) {
      console.warn("[properties/import] Failed to push availability:", err instanceof Error ? err.message : err);
    }

    // 8. Handle iCal feed if provided
    let bookingCount = 0;
    if (ical_url) {
      try {
        // Insert iCal feed
        await supabase.from("ical_feeds").upsert(
          {
            property_id: propertyId,
            platform,
            feed_url: ical_url,
            platform_listing_id: listing_id,
            is_active: true,
          },
          { onConflict: "property_id,platform" }
        );
        console.log(`[properties/import] Saved iCal feed for ${platform}`);

        // Trigger immediate sync
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : "http://localhost:3000";
          const syncRes = await fetch(`${baseUrl}/api/properties/${propertyId}/sync-bookings`, {
            method: "POST",
            headers: {
              cookie: request.headers.get("cookie") || "",
            },
          });
          if (syncRes.ok) {
            const syncData = await syncRes.json();
            bookingCount = syncData.total ?? 0;
            console.log(`[properties/import] Sync complete: ${bookingCount} bookings`);
          }
        } catch (syncErr) {
          console.warn("[properties/import] Sync-bookings call failed:", syncErr instanceof Error ? syncErr.message : syncErr);
        }
      } catch (err) {
        console.warn("[properties/import] Failed to save iCal feed:", err instanceof Error ? err.message : err);
      }
    }

    // If no iCal sync was done, count existing bookings
    if (!ical_url) {
      const { count } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("property_id", propertyId)
        .neq("status", "cancelled");
      bookingCount = count ?? 0;
    }

    // 8. Return result
    return NextResponse.json({
      property: {
        id: propertyId,
        name: propertyName,
        photo_url: photoUrl || existingProp?.cover_photo_url || null,
        booking_count: bookingCount,
      },
      imported: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[properties/import]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
