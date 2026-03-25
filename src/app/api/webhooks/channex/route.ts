import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import type { ChannexWebhookPayload } from "@/lib/channex/types";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  try {
    const payload: ChannexWebhookPayload = await request.json();
    const event = payload.event;
    const bookingId = payload.payload?.booking_id;
    const revisionId = payload.payload?.revision_id;
    const channexPropertyId = payload.property_id;

    console.log(`[webhook] Event: ${event}, booking: ${bookingId}, revision: ${revisionId}, property: ${channexPropertyId}`);

    if (!bookingId) {
      return NextResponse.json({ status: "ok", message: "No booking_id, skipping" });
    }

    // Handle all booking events
    const bookingEvents = [
      "booking", "booking_new", "booking_modification", "booking_cancellation",
      "ota_booking_created", "ota_booking_modified", "ota_booking_cancelled",
    ];
    if (!bookingEvents.includes(event)) {
      console.log(`[webhook] Event ${event} not a booking event, skipping`);
      return NextResponse.json({ status: "ok", message: `Event ${event} not handled` });
    }

    const supabase = createServiceClient();
    const channex = createChannexClient();

    // Fetch full booking from Channex API
    console.log(`[webhook] Fetching booking ${bookingId} from Channex...`);
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
      console.log(`[webhook] Property ${channexPropertyId} not in DB, skipping`);
      // Still acknowledge the revision
      if (revisionId) {
        try { await channex.acknowledgeBookingRevision(revisionId); } catch (e) {
          console.warn(`[webhook] Failed to ack revision ${revisionId}:`, e);
        }
      }
      return NextResponse.json({
        status: "ok",
        message: `Property ${channexPropertyId} not found in DB`,
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
