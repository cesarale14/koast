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

    // Look up the BDC-specific rate plan for this property so we can push
    // rates + restrictions (not just availability) to the channel. Without
    // rates, Booking.com displays the listing as "closed / not bookable".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pc } = await (supabase.from("property_channels") as any)
      .select("settings")
      .eq("property_id", propertyId)
      .eq("channex_channel_id", channelId)
      .maybeSingle();
    const bdcRatePlanId: string | undefined = pc?.settings?.rate_plan_id;

    // 1. Push initial availability + rates for 365 days
    const roomTypes = await channex.getRoomTypes(channexPropertyId);
    if (roomTypes.length > 0) {
      const startStr = new Date().toISOString().split("T")[0];
      const endAvail = new Date();
      endAvail.setDate(endAvail.getDate() + 365);
      const endStr = endAvail.toISOString().split("T")[0];

      // Load Moora's rates for the next 365 days
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: moorRates } = await (supabase.from("calendar_rates") as any)
        .select("date, applied_rate, base_rate, min_stay, is_available")
        .eq("property_id", propertyId)
        .is("channel_code", null)
        .gte("date", startStr)
        .lte("date", endStr);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rateByDate = new Map<string, any>();
      for (const r of (moorRates ?? [])) rateByDate.set(r.date, r);

      // Build booked-date set so we can mark stop_sell=true
      const { data: bookings } = await supabase
        .from("bookings")
        .select("check_in, check_out")
        .eq("property_id", propertyId)
        .in("status", ["confirmed", "pending"])
        .gte("check_out", startStr);
      const blockedDates = new Set<string>();
      for (const b of (bookings ?? []) as Array<{ check_in: string; check_out: string }>) {
        const s = new Date(b.check_in + "T00:00:00Z");
        const e = new Date(b.check_out + "T00:00:00Z");
        for (let d = new Date(s); d < e; d.setUTCDate(d.getUTCDate() + 1)) {
          blockedDates.add(d.toISOString().split("T")[0]);
        }
      }

      // Push restrictions (rate + availability + min_stay + stop_sell) to
      // the BDC-specific rate plan. If there's no rate plan (legacy), fall
      // back to pushing only availability to all room types.
      if (bdcRatePlanId) {
        const restrictionValues: Array<{
          property_id: string;
          rate_plan_id: string;
          date_from: string;
          date_to: string;
          rate?: number;
          min_stay_arrival: number;
          stop_sell: boolean;
          availability?: number;
        }> = [];
        for (let d = new Date(startStr + "T00:00:00Z"); d <= new Date(endStr + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
          const ds = d.toISOString().split("T")[0];
          const r = rateByDate.get(ds);
          const isBlocked = blockedDates.has(ds);
          restrictionValues.push({
            property_id: channexPropertyId,
            rate_plan_id: bdcRatePlanId,
            date_from: ds,
            date_to: ds,
            rate: r?.applied_rate ? Math.round(Number(r.applied_rate) * 100) : undefined,
            min_stay_arrival: r?.min_stay ?? 1,
            stop_sell: isBlocked || r?.is_available === false,
            availability: isBlocked ? 0 : 1,
          });
        }
        for (let i = 0; i < restrictionValues.length; i += 200) {
          await channex.updateRestrictions(restrictionValues.slice(i, i + 200));
        }
        console.log(`[connect-bdc/activate] Pushed ${restrictionValues.length} restrictions to BDC rate plan ${bdcRatePlanId}`);
      } else {
        // Legacy path — push availability only
        const availValues = roomTypes.map((rt) => ({
          property_id: channexPropertyId,
          room_type_id: rt.id,
          date_from: startStr,
          date_to: endStr,
          availability: 1,
        }));
        await channex.updateAvailability(availValues);
        console.log(`[connect-bdc/activate] Pushed availability=1 for ${startStr} to ${endStr}`);

        if (blockedDates.size > 0) {
          const blockValues: Array<{ property_id: string; room_type_id: string; date_from: string; date_to: string; availability: number }> = [];
          blockedDates.forEach((ds) => {
            for (const rt of roomTypes) {
              blockValues.push({ property_id: channexPropertyId, room_type_id: rt.id, date_from: ds, date_to: ds, availability: 0 });
            }
          });
          for (let i = 0; i < blockValues.length; i += 200) {
            await channex.updateAvailability(blockValues.slice(i, i + 200));
          }
          console.log(`[connect-bdc/activate] Blocked ${blockValues.length} date slots`);
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
