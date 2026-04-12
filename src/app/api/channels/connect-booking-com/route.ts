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

    // 2. Ensure Channex property exists (auto-scaffold if missing)
    let channexPropertyId = property.channex_property_id;
    if (!channexPropertyId) {
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

    // Ensure rate plan exists
    const { data: ratePlans } = await supabase
      .from("channex_rate_plans")
      .select("id, room_type_id")
      .eq("property_id", propertyId)
      .limit(1);

    let ratePlanId = ratePlans?.[0]?.id;
    if (!ratePlanId) {
      const rps = await channex.getRatePlans(channexPropertyId);
      if (rps.length > 0) {
        ratePlanId = rps[0].id;
      } else {
        const rp = await channex.createRatePlan({
          property_id: channexPropertyId,
          room_type_id: roomTypeId,
          title: "Best Available Rate",
          currency: "USD",
          sell_mode: "per_room",
          rate_mode: "manual",
        });
        ratePlanId = rp.id;
      }
      const now = new Date().toISOString();
      await supabase.from("channex_rate_plans").upsert({
        id: ratePlanId,
        property_id: propertyId,
        room_type_id: roomTypeId,
        title: "Best Available Rate",
        sell_mode: "per_room",
        currency: "USD",
        rate_mode: "manual",
        cached_at: now,
      }, { onConflict: "id" });
    }

    // 4. Find or create Booking.com channel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allChannels = await channex.getAllChannels();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bdcChannel = (allChannels.data ?? []).find((ch: any) =>
      ch.attributes?.channel === "BookingCom"
    );

    let channelId: string;

    if (bdcChannel) {
      channelId = bdcChannel.id;
      const existingProps: string[] = bdcChannel.attributes?.properties ?? [];
      if (!existingProps.includes(channexPropertyId)) {
        await channex.updateChannel(channelId, {
          properties: [...existingProps, channexPropertyId],
          settings: { hotel_id: hotelId },
        });
        console.log(`[connect-bdc] Added property ${channexPropertyId} to existing BDC channel ${channelId}`);
      } else {
        await channex.updateChannel(channelId, {
          settings: { hotel_id: hotelId },
        });
        console.log(`[connect-bdc] Updated hotel_id on existing BDC channel ${channelId}`);
      }
    } else {
      const channelRes = await channex.createChannel({
        channel: "BookingCom",
        title: "Booking.com",
        properties: [channexPropertyId],
        settings: { hotel_id: hotelId },
      });
      channelId = channelRes.data?.id;
      console.log(`[connect-bdc] Created new BDC channel ${channelId}`);
    }

    // 5. Save to property_channels (status pending — needs authorization test)
    const now = new Date().toISOString();
    await supabase.from("property_channels").upsert(
      {
        property_id: propertyId,
        channex_channel_id: channelId,
        channel_code: "BDC",
        channel_name: property.name ?? "Booking.com",
        status: "pending_authorization",
        settings: { hotel_id: hotelId },
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
