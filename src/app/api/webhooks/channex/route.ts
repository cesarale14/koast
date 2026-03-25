import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import type { ChannexWebhookPayload } from "@/lib/channex/types";
import { createServerClient } from "@supabase/ssr";

// Use service role for webhook handler (no user session)
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY required for webhooks");
  return createServerClient(url, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}

export async function POST(request: NextRequest) {
  try {
    const payload: ChannexWebhookPayload = await request.json();
    const event = payload.event;
    const bookingId = payload.payload?.booking_id;
    const channexPropertyId = payload.property_id;

    if (!bookingId) {
      return NextResponse.json({ status: "ok", message: "No booking_id, skipping" });
    }

    // Only handle booking events
    const bookingEvents = [
      "booking", "booking_new", "booking_modification", "booking_cancellation",
      "ota_booking_created", "ota_booking_modified", "ota_booking_cancelled",
    ];
    if (!bookingEvents.includes(event)) {
      return NextResponse.json({ status: "ok", message: `Event ${event} not handled` });
    }

    const supabase = createServiceClient();
    const channex = createChannexClient();

    // Fetch full booking from Channex API
    const booking = await channex.getBooking(bookingId);
    const ba = booking.attributes;

    // Find the property in our DB by channex_property_id
    const propRes = await supabase
      .from("properties")
      .select("id")
      .eq("channex_property_id", channexPropertyId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (propRes.data ?? []) as any[];

    if (props.length === 0) {
      return NextResponse.json({
        status: "ok",
        message: `Property ${channexPropertyId} not found in DB, skipping`,
      });
    }

    const propertyId = props[0].id;

    const guestName = ba.customer
      ? [ba.customer.name, ba.customer.surname].filter(Boolean).join(" ")
      : null;

    let platform = "direct";
    const otaLower = (ba.ota_name ?? "").toLowerCase();
    if (otaLower.includes("airbnb")) platform = "airbnb";
    else if (otaLower.includes("vrbo") || otaLower.includes("homeaway")) platform = "vrbo";
    else if (otaLower.includes("booking")) platform = "booking_com";

    let status = "confirmed";
    if (ba.status === "cancelled") status = "cancelled";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bookTable = supabase.from("bookings") as any;
    await bookTable.upsert(
      {
        property_id: propertyId,
        platform,
        channex_booking_id: bookingId,
        guest_name: guestName,
        guest_email: ba.customer?.mail || null,
        guest_phone: ba.customer?.phone || null,
        check_in: ba.arrival_date,
        check_out: ba.departure_date,
        total_price: parseFloat(ba.amount) || null,
        currency: ba.currency || "USD",
        status,
        platform_booking_id: ba.ota_reservation_code || null,
        notes: ba.notes || null,
      },
      { onConflict: "channex_booking_id" }
    );

    return NextResponse.json({
      status: "ok",
      event,
      booking_id: bookingId,
      action: status === "cancelled" ? "cancelled" : "upserted",
    });
  } catch (err) {
    console.error("Channex webhook error:", err);
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
