import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

/**
 * POST /api/channels/connect-booking-com/activate
 * Called after the connection test passes. Pushes initial availability,
 * ensures the webhook exists, and marks the channel as active.
 *
 * Body: { propertyId: string, channelId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { propertyId, channelId } = await request.json();
    if (!propertyId || !channelId) {
      return NextResponse.json({ error: "propertyId and channelId are required" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const channex = createChannexClient();

    // Verify property
    const { data: property } = await supabase
      .from("properties")
      .select("id, channex_property_id")
      .eq("id", propertyId)
      .eq("user_id", user.id)
      .single();

    if (!property?.channex_property_id) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const channexPropertyId = property.channex_property_id;

    // 1. Push initial availability (365 days open, then block booked dates)
    const roomTypes = await channex.getRoomTypes(channexPropertyId);
    if (roomTypes.length > 0) {
      const startStr = new Date().toISOString().split("T")[0];
      const endAvail = new Date();
      endAvail.setDate(endAvail.getDate() + 365);
      const endStr = endAvail.toISOString().split("T")[0];

      const availValues = roomTypes.map((rt) => ({
        property_id: channexPropertyId,
        room_type_id: rt.id,
        date_from: startStr,
        date_to: endStr,
        availability: 1,
      }));
      await channex.updateAvailability(availValues);
      console.log(`[connect-bdc/activate] Pushed availability=1 for ${startStr} to ${endStr}`);

      // Block booked dates
      const { data: bookings } = await supabase
        .from("bookings")
        .select("check_in, check_out")
        .eq("property_id", propertyId)
        .in("status", ["confirmed", "pending"])
        .gte("check_out", startStr);

      if (bookings && bookings.length > 0) {
        const blockValues = [];
        for (const b of bookings) {
          for (const rt of roomTypes) {
            blockValues.push({
              property_id: channexPropertyId,
              room_type_id: rt.id,
              date_from: b.check_in,
              date_to: b.check_out,
              availability: 0,
            });
          }
        }
        if (blockValues.length > 0) {
          await channex.updateAvailability(blockValues);
          console.log(`[connect-bdc/activate] Blocked ${blockValues.length} booking date ranges`);
        }
      }
    }

    // 2. Ensure webhook exists
    try {
      const webhooks = await channex.listWebhooks();
      const callbackUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://staycommand.vercel.app"}/api/webhooks/channex`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = (webhooks.data ?? []).find((wh: any) =>
        wh.attributes?.callback_url === callbackUrl &&
        (wh.attributes?.property_id === channexPropertyId || !wh.attributes?.property_id)
      );

      if (!existing) {
        await channex.createWebhook({
          property_id: channexPropertyId,
          callback_url: callbackUrl,
          event_mask: "booking_new,booking_modification,booking_cancellation",
          is_active: true,
          send_data: true,
        });
        console.log("[connect-bdc/activate] Created webhook");
      }
    } catch (err) {
      console.warn("[connect-bdc/activate] Webhook setup warning:", err instanceof Error ? err.message : err);
    }

    // 3. Activate channel
    try {
      await channex.updateChannel(channelId, { is_active: true });
    } catch (err) {
      console.warn("[connect-bdc/activate] Channel activation warning:", err instanceof Error ? err.message : err);
    }

    // 4. Update property_channels to active
    const now = new Date().toISOString();
    await supabase
      .from("property_channels")
      .update({ status: "active", last_sync_at: now, updated_at: now })
      .eq("property_id", propertyId)
      .eq("channex_channel_id", channelId);

    return NextResponse.json({
      success: true,
      status: "active",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[connect-bdc/activate]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
