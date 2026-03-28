import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import type { ChannexWebhookPayload } from "@/lib/channex/types";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  const sourceIp = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";

  try {
    const payload: ChannexWebhookPayload = await request.json();

    // Validate required webhook fields
    if (!payload.event || !payload.payload) {
      console.warn(`[webhook] Rejected malformed payload from ${sourceIp}: missing event or payload`);
      return NextResponse.json(
        { status: "error", message: "Missing required fields: event, payload" },
        { status: 400 }
      );
    }

    const event = payload.event;
    const bookingId = payload.payload?.booking_id;
    const revisionId = payload.payload?.revision_id;
    const channexPropertyId = payload.property_id;

    console.log(`[webhook] ${new Date().toISOString()} | Event: ${event}, booking: ${bookingId}, revision: ${revisionId}, property: ${channexPropertyId}, ip: ${sourceIp}`);

    if (!bookingId) {
      return NextResponse.json({ status: "ok", message: "No booking_id, skipping" });
    }

    // Handle all booking events
    const bookingEvents = [
      "booking", "booking_new", "booking_modification", "booking_cancellation",
      "ota_booking_created", "ota_booking_modified", "ota_booking_cancelled",
    ];
    if (!bookingEvents.includes(event)) {
      console.log(`[webhook] ${new Date().toISOString()} | Event ${event} not a booking event, skipping, ip: ${sourceIp}`);
      return NextResponse.json({ status: "ok", message: `Event ${event} not handled` });
    }

    // Validate property_id is present in the payload
    if (!channexPropertyId) {
      console.warn(`[webhook] ${new Date().toISOString()} | Rejected: missing property_id in payload, ip: ${sourceIp}`);
      return NextResponse.json(
        { status: "error", message: "Missing property_id in webhook payload" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Verify the property exists in our database before fetching from Channex API
    const propCheck = await supabase
      .from("properties")
      .select("id")
      .eq("channex_property_id", channexPropertyId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const verifiedProps = (propCheck.data ?? []) as any[];
    if (verifiedProps.length === 0) {
      console.warn(`[webhook] ${new Date().toISOString()} | Rejected: property ${channexPropertyId} not found in DB, ip: ${sourceIp}`);
      return NextResponse.json(
        { status: "error", message: `Property ${channexPropertyId} not found` },
        { status: 404 }
      );
    }

    const channex = createChannexClient();

    // Fetch full booking from Channex API
    console.log(`[webhook] Fetching booking ${bookingId} from Channex...`);
    const booking = await channex.getBooking(bookingId);
    const ba = booking.attributes;

    const propertyId = verifiedProps[0].id;

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
    if (event.includes("modification")) status = "confirmed"; // modified bookings are still active

    // Upsert booking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bookTable = supabase.from("bookings") as any;
    const bookingData = {
      property_id: propertyId,
      platform,
      channex_booking_id: bookingId,
      guest_name: guestName,
      guest_email: ba.customer?.mail || null,
      guest_phone: ba.customer?.phone || null,
      check_in: ba.arrival_date,
      check_out: ba.departure_date,
      total_price: ba.amount ? parseFloat(ba.amount) : null,
      currency: ba.currency || "USD",
      status,
      platform_booking_id: ba.ota_reservation_code || null,
      notes: ba.notes || null,
    };

    // Check if booking exists
    const { data: existing } = await bookTable
      .select("id")
      .eq("channex_booking_id", bookingId)
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (existing && (existing as any[]).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await bookTable.update(bookingData).eq("id", (existing as any[])[0].id);
      console.log(`[webhook] Updated booking ${bookingId} (${event})`);
    } else {
      const { error: insertErr } = await bookTable.insert(bookingData);
      if (insertErr) console.error(`[webhook] Insert error:`, insertErr);
      else console.log(`[webhook] Inserted new booking ${bookingId}`);
    }

    // Acknowledge the booking revision
    if (revisionId) {
      try {
        await channex.acknowledgeBookingRevision(revisionId);
        console.log(`[webhook] Acknowledged revision ${revisionId}`);
      } catch (e) {
        console.warn(`[webhook] Failed to ack revision ${revisionId}:`, e);
      }
    }

    return NextResponse.json({
      status: "ok",
      event,
      booking_id: bookingId,
      revision_id: revisionId,
      action: status === "cancelled" ? "cancelled" : event.includes("modification") ? "modified" : "created",
      acknowledged: !!revisionId,
    });
  } catch (err) {
    console.error("[webhook] Error:", err);
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
