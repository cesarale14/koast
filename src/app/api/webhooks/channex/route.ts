import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import type { ChannexWebhookPayload } from "@/lib/channex/types";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  const sourceIp = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
  const supabase = createServiceClient();

  try {
    const payload: ChannexWebhookPayload = await request.json();

    if (!payload.event || !payload.payload) {
      console.warn(`[webhook] Rejected malformed payload from ${sourceIp}`);
      return NextResponse.json({ status: "error", message: "Missing required fields" }, { status: 400 });
    }

    const event = payload.event;
    const bookingId = payload.payload?.booking_id;
    const revisionId = payload.payload?.revision_id;
    const channexPropertyId = payload.property_id;

    console.log(`[webhook] ━━━ INCOMING ━━━`);
    console.log(`[webhook] Event: ${event}`);
    console.log(`[webhook] Booking ID: ${bookingId}`);
    console.log(`[webhook] Revision ID: ${revisionId}`);
    console.log(`[webhook] Property: ${channexPropertyId}`);
    console.log(`[webhook] Source IP: ${sourceIp}`);
    console.log(`[webhook] Payload: ${JSON.stringify(payload).substring(0, 500)}`);

    if (!bookingId) {
      return NextResponse.json({ status: "ok", message: "No booking_id, skipping" });
    }

    // Only handle booking events
    const bookingEvents = [
      "booking", "booking_new", "booking_modification", "booking_cancellation",
      "ota_booking_created", "ota_booking_modified", "ota_booking_cancelled",
    ];
    if (!bookingEvents.includes(event)) {
      console.log(`[webhook] Event ${event} not a booking event, skipping`);
      return NextResponse.json({ status: "ok", message: `Event ${event} not handled` });
    }

    if (!channexPropertyId) {
      console.warn(`[webhook] Rejected: missing property_id`);
      return NextResponse.json({ status: "error", message: "Missing property_id" }, { status: 400 });
    }

    // Verify property exists in our DB
    const { data: propData } = await supabase
      .from("properties")
      .select("id, channex_property_id")
      .eq("channex_property_id", channexPropertyId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prop = ((propData ?? []) as any[])[0];
    if (!prop) {
      console.warn(`[webhook] Property ${channexPropertyId} not found in DB`);
      return NextResponse.json({ status: "error", message: "Property not found" }, { status: 404 });
    }
    const propertyId: string = prop.id;

    // Fetch full booking details from Channex
    const channex = createChannexClient();
    console.log(`[webhook] Fetching booking ${bookingId} from Channex API...`);
    const booking = await channex.getBooking(bookingId);
    const ba = booking.attributes;

    console.log(`[webhook] Booking details: status=${ba.status}, arrival=${ba.arrival_date}, departure=${ba.departure_date}, guest=${ba.customer?.name} ${ba.customer?.surname}, ota=${ba.ota_name}, ota_code=${ba.ota_reservation_code}`);

    // Check if this booking was created by our PMS (prevent webhook loop)
    const otaCode = ba.ota_reservation_code ?? "";
    if (otaCode.startsWith("SC-") && ba.ota_name === "Offline") {
      // This booking was pushed from StayCommand — just ACK, don't re-process
      console.log(`[webhook] Skipping self-originated booking (ota_code=${otaCode})`);
      if (revisionId) {
        try { await channex.acknowledgeBookingRevision(revisionId); } catch { /* ignore */ }
      }
      // Log it but skip DB changes
      try {
        await supabase.from("channex_webhook_log").insert({
          event_type: event, booking_id: bookingId, revision_id: revisionId ?? null,
          channex_property_id: channexPropertyId,
          guest_name: ba.customer ? [ba.customer.name, ba.customer.surname].filter(Boolean).join(" ") : null,
          check_in: ba.arrival_date, check_out: ba.departure_date,
          action_taken: "skipped_self", ack_sent: true, ack_response: "self-originated",
        });
      } catch { /* ignore */ }
      return NextResponse.json({ status: "ok", action: "skipped_self", booking_id: bookingId });
    }

    // Parse guest and platform
    const guestName = ba.customer
      ? [ba.customer.name, ba.customer.surname].filter(Boolean).join(" ")
      : null;

    let platform = "direct";
    const otaLower = (ba.ota_name ?? "").toLowerCase();
    if (otaLower.includes("airbnb")) platform = "airbnb";
    else if (otaLower.includes("vrbo") || otaLower.includes("homeaway")) platform = "vrbo";
    else if (otaLower.includes("booking")) platform = "booking_com";

    // Determine action from event type AND booking status
    let action: "created" | "modified" | "cancelled";
    let bookingStatus: string;

    if (ba.status === "cancelled" || event.includes("cancellation") || event.includes("cancelled")) {
      action = "cancelled";
      bookingStatus = "cancelled";
    } else if (event.includes("modification") || event.includes("modified") || ba.status === "modified") {
      action = "modified";
      bookingStatus = "confirmed";
    } else {
      action = "created";
      bookingStatus = "confirmed";
    }

    console.log(`[webhook] Action: ${action}, DB status: ${bookingStatus}`);

    // Check for existing booking in our DB
    const { data: existingData } = await supabase
      .from("bookings")
      .select("id, check_in, check_out")
      .eq("channex_booking_id", bookingId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingBooking = ((existingData ?? []) as any[])[0];
    const oldCheckIn = existingBooking?.check_in;
    const oldCheckOut = existingBooking?.check_out;

    // Build booking record
    const bookingRecord = {
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
      status: bookingStatus,
      platform_booking_id: ba.ota_reservation_code || null,
      notes: ba.notes || null,
      updated_at: new Date().toISOString(),
    };

    // Upsert booking
    if (existingBooking) {
      await supabase.from("bookings").update(bookingRecord).eq("id", existingBooking.id);
      console.log(`[webhook] Updated existing booking ${bookingId} (action: ${action})`);
    } else {
      const { error: insertErr } = await supabase.from("bookings").insert(bookingRecord);
      if (insertErr) console.error(`[webhook] Insert error:`, insertErr);
      else console.log(`[webhook] Inserted new booking ${bookingId}`);
    }

    // Update Channex availability based on action — push for ALL room types
    let availUpdated = false;
    try {
      const roomTypes = await channex.getRoomTypes(channexPropertyId);
      if (roomTypes.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const availValues: any[] = [];

        for (const rt of roomTypes) {
          const rtId = rt.id;
          if (action === "cancelled" && oldCheckIn && oldCheckOut) {
            availValues.push(...buildAvailRange(channexPropertyId, rtId, oldCheckIn, oldCheckOut, 1));
          } else if (action === "modified" && oldCheckIn && oldCheckOut) {
            availValues.push(...buildAvailRange(channexPropertyId, rtId, oldCheckIn, oldCheckOut, 1));
            availValues.push(...buildAvailRange(channexPropertyId, rtId, ba.arrival_date, ba.departure_date, 0));
          } else if (action === "created") {
            availValues.push(...buildAvailRange(channexPropertyId, rtId, ba.arrival_date, ba.departure_date, 0));
          }
        }

        if (action === "cancelled") console.log(`[webhook] Restoring availability ${oldCheckIn} to ${oldCheckOut} for ${roomTypes.length} room types`);
        else if (action === "modified") console.log(`[webhook] Availability: restore ${oldCheckIn}-${oldCheckOut}, block ${ba.arrival_date}-${ba.departure_date} for ${roomTypes.length} room types`);
        else if (action === "created") console.log(`[webhook] Blocking availability ${ba.arrival_date} to ${ba.departure_date} for ${roomTypes.length} room types`);

        if (availValues.length > 0) {
          await channex.updateAvailability(availValues);
          availUpdated = true;
          console.log(`[webhook] Availability updated (${availValues.length} entries across ${roomTypes.length} room types)`);
        }
      }
    } catch (err) {
      console.warn(`[webhook] Availability update failed:`, err instanceof Error ? err.message : err);
    }

    // Acknowledge the booking revision
    let ackSent = false;
    let ackResponse = "";
    if (revisionId) {
      try {
        await channex.acknowledgeBookingRevision(revisionId);
        ackSent = true;
        ackResponse = "OK";
        console.log(`[webhook] ✓ Acknowledged revision ${revisionId}`);
      } catch (e) {
        ackResponse = e instanceof Error ? e.message : String(e);
        console.warn(`[webhook] ✗ Failed to acknowledge revision ${revisionId}: ${ackResponse}`);
      }
    } else {
      console.log(`[webhook] No revision_id to acknowledge`);
    }

    // Log to channex_webhook_log table
    try {
      await supabase.from("channex_webhook_log").insert({
        event_type: event,
        booking_id: bookingId,
        revision_id: revisionId ?? null,
        channex_property_id: channexPropertyId,
        guest_name: guestName,
        check_in: ba.arrival_date,
        check_out: ba.departure_date,
        payload: payload as unknown as Record<string, unknown>,
        action_taken: action,
        ack_sent: ackSent,
        ack_response: ackResponse,
      });
    } catch (logErr) {
      console.warn(`[webhook] Failed to write log:`, logErr);
    }

    console.log(`[webhook] ━━━ COMPLETE ━━━ Action: ${action}, Ack: ${ackSent}, Avail: ${availUpdated}`);

    return NextResponse.json({
      status: "ok",
      event,
      booking_id: bookingId,
      revision_id: revisionId,
      action,
      guest_name: guestName,
      check_in: ba.arrival_date,
      check_out: ba.departure_date,
      acknowledged: ackSent,
      availability_updated: availUpdated,
    });
  } catch (err) {
    console.error("[webhook] Error:", err);
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}

function buildAvailRange(
  propertyId: string,
  roomTypeId: string,
  checkIn: string,
  checkOut: string,
  availability: number
) {
  const values: { property_id: string; room_type_id: string; date_from: string; date_to: string; availability: number }[] = [];
  const ci = new Date(checkIn + "T00:00:00Z");
  const co = new Date(checkOut + "T00:00:00Z");
  for (let d = new Date(ci); d < co; d.setUTCDate(d.getUTCDate() + 1)) {
    const ds = d.toISOString().split("T")[0];
    values.push({ property_id: propertyId, room_type_id: roomTypeId, date_from: ds, date_to: ds, availability });
  }
  return values;
}
