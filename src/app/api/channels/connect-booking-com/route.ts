import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

/**
 * POST /api/channels/connect-booking-com
 * Creates (or reuses) a Channex BDC channel, links the property, and
 * pushes initial availability. The caller must separately test the
 * connection and handle the Booking.com authorization flow before
 * calling /activate.
 *
 * Body: { propertyId: string, hotelId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { propertyId, hotelId } = await request.json();
    if (!propertyId || !hotelId) {
      return NextResponse.json({ error: "propertyId and hotelId are required" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const channex = createChannexClient();

    // 1. Verify property ownership
    const { data: property } = await supabase
      .from("properties")
      .select("id, name, channex_property_id, user_id")
      .eq("id", propertyId)
      .eq("user_id", user.id)
      .single();

    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // 2. Ensure Channex property exists
    //    First try to find a matching Channex property from the user's account
    //    (e.g., from Airbnb OAuth) before falling back to scaffold creation.
    let channexPropertyId = property.channex_property_id;
    if (!channexPropertyId) {
      // Search existing Channex properties for a name match
      const allChannexProps = await channex.getProperties();
      const propName = (property.name || "").toLowerCase().replace(/\s*-\s*(tampa|orlando|miami|jacksonville|st\.?\s*pete).*$/i, "").trim();
      const matched = allChannexProps.find((p) => {
        const cTitle = (p.attributes?.title || "").toLowerCase().trim();
        // Match if either name contains the other (handles "Pool House" vs "Pool Home in Tampa")
        const cBase = cTitle.replace(/\s*(in|-)?\s*(tampa|orlando|miami|jacksonville|st\.?\s*pete).*$/i, "").trim();
        return (
          cBase === propName ||
          cBase.includes(propName) ||
          propName.includes(cBase)
        );
      });

      if (matched) {
        channexPropertyId = matched.id;
        await supabase
          .from("properties")
          .update({ channex_property_id: channexPropertyId })
          .eq("id", propertyId);
        console.log(`[connect-bdc] Matched existing Channex property "${matched.attributes?.title}" (${channexPropertyId})`);
      } else {
        // No match — scaffold a new Channex property
        const scaffoldTitle = `SC-Scaffold-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
        const channexProp = await channex.createProperty({
          title: scaffoldTitle,
          currency: "USD",
          email: user.email || "",
          phone: "",
          zip_code: "",
          country: "US",
          state: "",
          city: "",
          address: "",
          longitude: 0,
          latitude: 0,
          timezone: "America/New_York",
        });
        channexPropertyId = channexProp.id;
        await supabase
          .from("properties")
          .update({ channex_property_id: channexPropertyId })
          .eq("id", propertyId);
        console.log(`[connect-bdc] Auto-scaffolded Channex property ${channexPropertyId}`);
      }
    }

    // 3. Ensure room type + rate plan exist
    const { data: roomTypes } = await supabase
      .from("channex_room_types")
      .select("id, channex_property_id")
      .eq("property_id", propertyId)
      .limit(1);

    let roomTypeId = roomTypes?.[0]?.id;
    if (!roomTypeId) {
      const rts = await channex.getRoomTypes(channexPropertyId);
      if (rts.length > 0) {
        roomTypeId = rts[0].id;
      } else {
        const rt = await channex.createRoomType({
          property_id: channexPropertyId,
          title: "Entire Home",
          count_of_rooms: 1,
          occ_adults: 6,
          occ_children: 2,
          occ_infants: 1,
          default_occupancy: 6,
        });
        roomTypeId = rt.id;
      }
      const now = new Date().toISOString();
      await supabase.from("channex_room_types").upsert({
        id: roomTypeId,
        property_id: propertyId,
        channex_property_id: channexPropertyId,
        title: "Entire Home",
        count_of_rooms: 1,
        occ_adults: 6,
        cached_at: now,
      }, { onConflict: "id" });
    }

    // Always create a DEDICATED rate plan for the BDC channel.
    // Reusing an existing rate plan (e.g. Airbnb's) would cause rate bleed
    // between channels — pushing a rate update for Booking.com would also
    // overwrite the Airbnb price.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingBdcLink } = await (supabase.from("property_channels") as any)
      .select("settings")
      .eq("property_id", propertyId)
      .eq("channel_code", "BDC")
      .maybeSingle();

    let bdcRatePlanId: string | undefined = existingBdcLink?.settings?.rate_plan_id;

    // Verify the stored rate plan still exists in Channex before reusing it
    if (bdcRatePlanId) {
      try {
        const rps = await channex.getRatePlans(channexPropertyId);
        if (!rps.find((rp) => rp.id === bdcRatePlanId)) {
          bdcRatePlanId = undefined;
        }
      } catch {
        bdcRatePlanId = undefined;
      }
    }

    if (!bdcRatePlanId) {
      const rp = await channex.createRatePlan({
        property_id: channexPropertyId,
        room_type_id: roomTypeId,
        title: `${property.name ?? "Pool House"} BDC Rate`,
        currency: "USD",
        sell_mode: "per_room",
        rate_mode: "manual",
        options: [{
          occupancy: 8,
          is_primary: true,
          inherit_rate: false,
          inherit_min_stay_arrival: false,
          inherit_min_stay_through: false,
          inherit_max_stay: false,
          inherit_closed_to_arrival: false,
          inherit_closed_to_departure: false,
          inherit_stop_sell: false,
          inherit_availability_offset: false,
          inherit_max_availability: false,
        }],
      });
      bdcRatePlanId = rp.id;
      console.log(`[connect-bdc] Created dedicated BDC rate plan ${bdcRatePlanId}`);

      const now = new Date().toISOString();
      await supabase.from("channex_rate_plans").upsert({
        id: bdcRatePlanId,
        property_id: propertyId,
        room_type_id: roomTypeId,
        title: `${property.name ?? "BDC"} BDC Rate`,
        sell_mode: "per_room",
        currency: "USD",
        rate_mode: "manual",
        cached_at: now,
      }, { onConflict: "id" });
    }

    // 4. Find or create Booking.com channel
    //    Match on (a) channels already mapped to this property OR (b) same hotel_id.
    //    Never reuse an arbitrary BDC channel from another property — that was the
    //    original bug that linked Pool House to Villa Jamaica's BDC channel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allChannels = await channex.getAllChannels();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bdcChannel = (allChannels.data ?? []).find((ch: any) => {
      if (ch.attributes?.channel !== "BookingCom") return false;
      const chProps: string[] = ch.attributes?.properties ?? [];
      const chHotelId: string | undefined = ch.attributes?.settings?.hotel_id;
      return chProps.includes(channexPropertyId) || chHotelId === hotelId;
    });

    let channelId: string;

    if (bdcChannel) {
      channelId = bdcChannel.id;
      // Replace properties with ONLY this one — BDC channels should be
      // 1:1 with properties (one hotel_id = one property).
      await channex.updateChannel(channelId, {
        properties: [channexPropertyId],
        settings: { hotel_id: hotelId },
      });
      console.log(`[connect-bdc] Reconfigured existing BDC channel ${channelId} → ${channexPropertyId} (hotel ${hotelId})`);
    } else {
      const channelRes = await channex.createChannel({
        channel: "BookingCom",
        title: `${property.name ?? "Property"} - Booking.com`,
        properties: [channexPropertyId],
        settings: { hotel_id: hotelId },
      });
      channelId = channelRes.data?.id;
      console.log(`[connect-bdc] Created new BDC channel ${channelId}`);
    }

    // 5. Link the BDC-specific rate plan to the Channex channel so Channex
    //    syncs rates/availability from that rate plan (not a shared Airbnb one).
    //    The rate_plan_code/room_type_code values come back from Channex after
    //    the first successful sync and Channex auto-updates them.
    try {
      await channex.updateChannel(channelId, {
        rate_plans: [{
          settings: {
            readonly: false,
            occupancy: 8,
            primary_occ: true,
          },
          rate_plan_id: bdcRatePlanId,
        }],
      });
    } catch (rpErr) {
      console.warn(`[connect-bdc] Could not link rate plan to channel immediately (will retry on activation):`, rpErr instanceof Error ? rpErr.message : rpErr);
    }

    // 6. Save to property_channels — include the dedicated rate_plan_id
    //    in settings so pricing/push can target only this channel's plan.
    const now = new Date().toISOString();
    await supabase.from("property_channels").upsert(
      {
        property_id: propertyId,
        channex_channel_id: channelId,
        channel_code: "BDC",
        channel_name: property.name ?? "Booking.com",
        status: "pending_authorization",
        settings: { hotel_id: hotelId, rate_plan_id: bdcRatePlanId },
        last_sync_at: now,
        updated_at: now,
      },
      { onConflict: "property_id,channex_channel_id" }
    );

    return NextResponse.json({
      success: true,
      channelId,
      channexPropertyId,
      hotelId,
      status: "pending_authorization",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[connect-bdc]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
