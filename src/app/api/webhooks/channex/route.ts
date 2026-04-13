import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  const sourceIp = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rawPayload: any;
  try {
    rawPayload = await request.json();
  } catch {
    console.warn(`[webhook] Failed to parse JSON from ${sourceIp}`);
    return NextResponse.json({ status: "ok", message: "Invalid JSON, ignored" });
  }

  const event = rawPayload?.event ?? rawPayload?.type ?? null;
  const payloadBody = rawPayload?.payload ?? {};
  const bookingId = payloadBody?.booking_id ?? null;
  const revisionId = payloadBody?.revision_id ?? null;
  const channexPropertyId = rawPayload?.property_id ?? payloadBody?.property_id ?? null;

  console.log(`[webhook] ━━━ INCOMING ━━━`);
  console.log(`[webhook] Event: ${event ?? "(none)"}`);
  console.log(`[webhook] Booking ID: ${bookingId ?? "(none)"}`);
  console.log(`[webhook] Property: ${channexPropertyId ?? "(none)"}`);
  console.log(`[webhook] Source IP: ${sourceIp}`);
  console.log(`[webhook] Payload: ${JSON.stringify(rawPayload).substring(0, 500)}`);

  // Handle test/ping payloads — Channex sends these when testing webhook connectivity
  const testEvents = ["test", "ping", "webhook_test"];
  if (!event || testEvents.includes(event) || (!bookingId && !event)) {
    console.log(`[webhook] Test/ping received (event=${event}), returning 200`);
    try {
      await supabase.from("channex_webhook_log").insert({
        event_type: event ?? "test_ping",
        booking_id: bookingId,
        revision_id: revisionId,
        channex_property_id: channexPropertyId,
        payload: rawPayload as Record<string, unknown>,
        action_taken: "test_ping",
        ack_sent: false,
        ack_response: null,
      });
    } catch { /* non-critical */ }
    return NextResponse.json({ status: "ok", message: "webhook test received" });
  }

  // Only handle booking events. Keep the list explicit so a new Channex
  // event type falls through to the logger instead of mutating rows.
  const bookingEvents = [
    "booking", "booking_new", "booking_modification", "booking_modified",
    "booking_cancellation", "booking_cancelled",
    "booking_unmapped_new", "booking_unmapped_modified", "booking_unmapped_cancelled",
    "ota_booking_created", "ota_booking_modified", "ota_booking_cancelled",
  ];

  if (!bookingEvents.includes(event)) {
    console.log(`[webhook] Event "${event}" not a booking event, logging and returning 200`);
    try {
      await supabase.from("channex_webhook_log").insert({
        event_type: event,
        booking_id: bookingId,
        revision_id: revisionId,
        channex_property_id: channexPropertyId,
        payload: rawPayload as Record<string, unknown>,
        action_taken: "skipped_non_booking",
        ack_sent: false,
        ack_response: null,
      });
    } catch { /* non-critical */ }
    return NextResponse.json({ status: "ok", message: `Event ${event} not handled` });
  }

  // Unmapped-channel events: we don't yet know which StayCommand
  // property the booking belongs to, so log + ack without mutating any
  // rows. They'll show up in channex_webhook_log for debugging.
  if (event.startsWith("booking_unmapped")) {
    console.log(`[webhook] Unmapped-channel event "${event}" received — logging for debugging`);
    try {
      await supabase.from("channex_webhook_log").insert({
        event_type: event,
        booking_id: bookingId,
        revision_id: revisionId,
        channex_property_id: channexPropertyId,
        payload: rawPayload as Record<string, unknown>,
        action_taken: "logged_unmapped",
        ack_sent: false,
        ack_response: null,
      });
    } catch { /* non-critical */ }
    return NextResponse.json({ status: "ok", message: `Unmapped event ${event} logged` });
  }

  if (!bookingId) {
    console.log(`[webhook] Booking event without booking_id, logging and returning 200`);
    try {
      await supabase.from("channex_webhook_log").insert({
        event_type: event,
        channex_property_id: channexPropertyId,
        payload: rawPayload as Record<string, unknown>,
        action_taken: "skipped_no_booking_id",
        ack_sent: false,
        ack_response: null,
      });
    } catch { /* non-critical */ }
    return NextResponse.json({ status: "ok", message: "No booking_id, skipping" });
  }

  if (!channexPropertyId) {
    console.warn(`[webhook] Missing property_id for booking ${bookingId}, logging and returning 200`);
    try {
      await supabase.from("channex_webhook_log").insert({
        event_type: event,
        booking_id: bookingId,
        revision_id: revisionId,
        payload: rawPayload as Record<string, unknown>,
        action_taken: "skipped_no_property",
        ack_sent: false,
        ack_response: null,
      });
    } catch { /* non-critical */ }
    return NextResponse.json({ status: "ok", message: "Missing property_id" });
  }

  try {
    // Idempotency: Channex retries webhooks on network failures. If we've
    // already processed this revision (or booking+event combo when no
    // revision_id is sent), ack and return without re-processing. This
    // prevents duplicate bookings and double-pushed availability updates.
    if (revisionId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dup } = await (supabase.from("channex_webhook_log") as any)
        .select("id, action_taken")
        .eq("revision_id", revisionId)
        .in("action_taken", ["created", "modified", "cancelled", "skipped_self"])
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (dup && (dup as any[]).length > 0) {
        console.log(`[webhook] Duplicate revision ${revisionId} — already processed, skipping`);
        try {
          await supabase.from("channex_webhook_log").insert({
            event_type: event,
            booking_id: bookingId,
            revision_id: revisionId,
            channex_property_id: channexPropertyId,
            payload: rawPayload as Record<string, unknown>,
            action_taken: "skipped_duplicate",
            ack_sent: false,
            ack_response: null,
          });
        } catch { /* non-critical */ }
        // Re-ack to Channex so it stops retrying this revision
        try {
          const channexClient = createChannexClient();
          await channexClient.acknowledgeBookingRevision(revisionId);
        } catch { /* ignore */ }
        return NextResponse.json({ status: "ok", action: "skipped_duplicate", revision_id: revisionId });
      }
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
      try {
        await supabase.from("channex_webhook_log").insert({
          event_type: event, booking_id: bookingId, revision_id: revisionId,
          channex_property_id: channexPropertyId,
          payload: rawPayload as Record<string, unknown>,
          action_taken: "skipped_unknown_property", ack_sent: false, ack_response: null,
        });
      } catch { /* non-critical */ }
      return NextResponse.json({ status: "ok", message: "Property not found" });
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
      console.log(`[webhook] Skipping self-originated booking (ota_code=${otaCode})`);
      if (revisionId) {
        try { await channex.acknowledgeBookingRevision(revisionId); } catch { /* ignore */ }
      }
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

    // Prefer unique_id prefix (BDC-/ABB-/VRBO-) — it's Channex's canonical
    // per-channel source tag — then fall back to ota_name.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uniqueId = String(((ba as any).unique_id ?? ba.ota_reservation_code ?? "")).toUpperCase();
    let platform = "direct";
    if (uniqueId.startsWith("BDC-")) platform = "booking_com";
    else if (uniqueId.startsWith("ABB-")) platform = "airbnb";
    else if (uniqueId.startsWith("VRBO-") || uniqueId.startsWith("HA-")) platform = "vrbo";
    else {
      const otaLower = (ba.ota_name ?? "").toLowerCase();
      if (otaLower.includes("airbnb")) platform = "airbnb";
      else if (otaLower.includes("vrbo") || otaLower.includes("homeaway")) platform = "vrbo";
      else if (otaLower.includes("booking")) platform = "booking_com";
    }
    console.log(`[webhook] Detected platform=${platform} (unique_id=${uniqueId || "—"}, ota_name=${ba.ota_name ?? "—"})`);

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
    } else if (bookingStatus !== "cancelled") {
      // Dedup scope: only same-platform exact-date matches are
      // duplicates. Different platforms at overlapping dates are
      // cross-platform overbookings (e.g. Airbnb guest X and
      // Booking.com guest Y on the same night) and must be left alone
      // so /api/bookings/conflicts can surface them.
      const { data: exact } = await supabase
        .from("bookings")
        .select("id")
        .eq("property_id", propertyId)
        .eq("platform", platform)
        .eq("check_in", ba.arrival_date)
        .eq("check_out", ba.departure_date)
        .is("channex_booking_id", null)
        .eq("status", "confirmed")
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exactRow = ((exact ?? []) as any[])[0];
      if (exactRow) {
        await supabase.from("bookings").update(bookingRecord).eq("id", exactRow.id);
        console.log(`[webhook] Promoted iCal placeholder ${exactRow.id} with Channex data for ${bookingId}`);
      } else {
        const { error: insertErr } = await supabase.from("bookings").insert(bookingRecord);
        if (insertErr) console.error(`[webhook] Insert error:`, insertErr);
        else console.log(`[webhook] Inserted new booking ${bookingId}`);
      }
    } else {
      console.log(`[webhook] Skipping insert for cancelled booking ${bookingId} (no existing row)`);
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
        console.log(`[webhook] Acknowledged revision ${revisionId}`);
      } catch (e) {
        ackResponse = e instanceof Error ? e.message : String(e);
        console.warn(`[webhook] Failed to acknowledge revision ${revisionId}: ${ackResponse}`);
      }
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
        payload: rawPayload as Record<string, unknown>,
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
    // Log the error but still return 200 to prevent Channex retries
    try {
      await supabase.from("channex_webhook_log").insert({
        event_type: event,
        booking_id: bookingId,
        revision_id: revisionId,
        channex_property_id: channexPropertyId,
        payload: rawPayload as Record<string, unknown>,
        action_taken: "error",
        ack_sent: false,
        ack_response: err instanceof Error ? err.message : String(err),
      });
    } catch { /* non-critical */ }
    return NextResponse.json({
      status: "ok",
      message: "Processed with error",
      error: err instanceof Error ? err.message : "Unknown",
    });
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
