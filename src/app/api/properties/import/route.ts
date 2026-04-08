import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

/**
 * POST /api/properties/import
 * Imports unmapped OTA listings by creating Channex properties + room types + rate plans.
 * For listings that are already mapped to a Channex property but not in StayCommand,
 * creates the StayCommand property entry.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const listingIds = body.listing_ids as string[];
    if (!Array.isArray(listingIds) || listingIds.length === 0) {
      return NextResponse.json({ error: "Provide listing_ids array" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const channex = createChannexClient();
    const now = new Date().toISOString();

    // Get all channels to find listing details
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelsRes = await channex.request<any>("/channels");
    const channels = channelsRes.data ?? [];

    // Build listing lookup from channel rate_plans
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listingMap = new Map<string, any>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const ch of channels as any[]) {
      const attrs = ch.attributes ?? {};
      for (const rp of (attrs.rate_plans ?? [])) {
        const lid = rp.settings?.listing_id;
        if (lid) {
          listingMap.set(String(lid), {
            channelName: attrs.channel,
            channelId: ch.id,
            channexPropertyId: (attrs.properties ?? [])[0],
            listingName: attrs.title ?? `${attrs.channel} Listing`,
            listingType: rp.settings?.listing_type,
            dailyPrice: rp.settings?.pricing_setting?.default_daily_price,
            currency: rp.settings?.pricing_setting?.listing_currency ?? "USD",
            ratePlanId: rp.rate_plan_id,
          });
        }
      }
    }

    // Check which listings are already imported
    const { data: existingProps } = await supabase
      .from("properties")
      .select("id, name, channex_property_id")
      .eq("user_id", user.id);
    const existingChannexIds = new Set(
      ((existingProps ?? []) as { channex_property_id: string | null }[])
        .map((p) => p.channex_property_id)
        .filter(Boolean)
    );

    const results: { listing_id: string; status: string; property_name?: string; error?: string }[] = [];

    for (const listingId of listingIds) {
      const listing = listingMap.get(String(listingId));
      if (!listing) {
        results.push({ listing_id: listingId, status: "not_found", error: "Listing not found in connected channels" });
        continue;
      }

      // Skip if already imported
      if (listing.channexPropertyId && existingChannexIds.has(listing.channexPropertyId)) {
        results.push({ listing_id: listingId, status: "already_imported", property_name: listing.listingName });
        continue;
      }

      try {
        // The listing is already mapped to a Channex property (from the iframe flow)
        // We just need to create the StayCommand DB entry
        const channexPropId = listing.channexPropertyId;

        if (channexPropId) {
          // Fetch property details from Channex
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const propDetails = await channex.request<any>(`/properties/${channexPropId}`);
          const pa = propDetails.data?.attributes ?? {};

          // Try to get photo from Airbnb OG image
          let coverPhotoUrl: string | null = null;
          if (listing.channelName === "AirBNB" && listingId) {
            coverPhotoUrl = `https://a0.muscache.com/im/pictures/miso/Hosting-${listingId}/original/`;
          }

          // Create property in StayCommand DB
          const { data: newProp, error: insertErr } = await supabase
            .from("properties")
            .insert({
              user_id: user.id,
              name: listing.listingName || pa.title || "Imported Property",
              address: pa.address || null,
              city: pa.city || null,
              state: pa.state || null,
              zip: pa.zip_code || null,
              latitude: pa.latitude ? parseFloat(pa.latitude) : null,
              longitude: pa.longitude ? parseFloat(pa.longitude) : null,
              channex_property_id: channexPropId,
              property_type: listing.listingType === "house" ? "entire_home" : "entire_home",
              cover_photo_url: coverPhotoUrl,
            })
            .select("id")
            .single();

          if (insertErr) {
            results.push({ listing_id: listingId, status: "error", error: insertErr.message });
            continue;
          }

          // Cache room types
          const roomTypes = await channex.getRoomTypes(channexPropId);
          if (roomTypes.length > 0) {
            await supabase.from("channex_room_types").upsert(
              roomTypes.map((rt) => ({
                id: rt.id,
                property_id: newProp.id,
                channex_property_id: channexPropId,
                title: rt.attributes.title,
                count_of_rooms: rt.attributes.count_of_rooms ?? 1,
                occ_adults: rt.attributes.occ_adults ?? 4,
                occ_children: rt.attributes.occ_children ?? 0,
                cached_at: now,
              })),
              { onConflict: "id" }
            );
          }

          // Cache rate plans
          const ratePlans = await channex.getRatePlans(channexPropId);
          if (ratePlans.length > 0) {
            await supabase.from("channex_rate_plans").upsert(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ratePlans.map((rp: any) => ({
                id: rp.id,
                property_id: newProp.id,
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

          // Cache channel connection
          await supabase.from("property_channels").upsert({
            property_id: newProp.id,
            channex_channel_id: listing.channelId,
            channel_code: listing.channelName === "AirBNB" ? "ABB" : listing.channelName === "BookingCom" ? "BDC" : listing.channelName,
            channel_name: listing.listingName,
            status: "active",
            last_sync_at: now,
            updated_at: now,
          }, { onConflict: "property_id,channex_channel_id" });

          results.push({
            listing_id: listingId,
            status: "imported",
            property_name: listing.listingName || pa.title,
          });

          existingChannexIds.add(channexPropId);
        } else {
          results.push({ listing_id: listingId, status: "unmapped", error: "Listing not yet mapped to a Channex property" });
        }

        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        results.push({
          listing_id: listingId,
          status: "error",
          error: err instanceof Error ? err.message : "Import failed",
        });
      }
    }

    return NextResponse.json({
      results,
      total: listingIds.length,
      imported: results.filter((r) => r.status === "imported").length,
      already_imported: results.filter((r) => r.status === "already_imported").length,
      errors: results.filter((r) => r.status === "error").length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[properties/import]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
