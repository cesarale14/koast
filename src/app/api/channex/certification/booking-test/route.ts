import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import { createServiceClient } from "@/lib/supabase/service";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const propertyId = body.property_id ?? "c83ba211-2e79-4de0-b388-c88d9f695581";

    const channex = createChannexClient();

    // Get room types and rate plans
    console.log("[booking-test] Fetching room types and rate plans...");
    const roomTypes = await channex.getRoomTypes(propertyId);
    const ratePlans = await channex.getRatePlans(propertyId);

    if (roomTypes.length === 0 || ratePlans.length === 0) {
      return NextResponse.json(
        { error: "No room types or rate plans found" },
        { status: 400 }
      );
    }

    const roomTypeId = roomTypes[0].id;
    const ratePlanId = ratePlans[0].id;
    console.log(`[booking-test] Room: ${roomTypes[0].attributes.title} (${roomTypeId})`);
    console.log(`[booking-test] Rate plan: ${ratePlanId}`);

    const bookingBase = {
      property_id: propertyId,
      room_type_id: roomTypeId,
      rate_plan_id: ratePlanId,
      guest_name: "Test Guest",
      guest_email: "testguest@staycommand.com",
    };

    // ===== Step 1: Create Booking =====
    console.log("\n[booking-test] === STEP 1: Create Booking (CRS) ===");
    const createRes = await channex.createBooking({
      ...bookingBase,
      arrival_date: "2026-12-01",
      departure_date: "2026-12-03",
    });

    const bookingId = createRes.data?.attributes?.booking_id ?? createRes.data?.id;
    const createRevisionId = createRes.data?.attributes?.revision_id ?? null;
    console.log(`[booking-test] Booking ID: ${bookingId}`);
    console.log(`[booking-test] Create revision: ${createRevisionId}`);
    console.log(`[booking-test] Full create response:`, JSON.stringify(createRes, null, 2));

    // Wait for async processing
    console.log("[booking-test] Waiting 5 seconds for async processing...");
    await sleep(5000);

    // Fetch booking to confirm
    let fetchedBooking;
    try {
      fetchedBooking = await channex.getBooking(bookingId);
      console.log(`[booking-test] Fetched booking status: ${fetchedBooking.attributes?.status}`);
    } catch (e) {
      console.log(`[booking-test] Could not fetch booking yet: ${e}`);
    }

    // Acknowledge create revision
    if (createRevisionId) {
      try { await channex.acknowledgeBookingRevision(createRevisionId); } catch (e) {
        console.warn(`[booking-test] Ack failed: ${e}`);
      }
    }

    // ===== Step 2: Modify Booking =====
    console.log("\n[booking-test] === STEP 2: Modify Booking (extend to Dec 5) ===");
    const modifyRes = await channex.modifyBooking(bookingId, {
      ...bookingBase,
      arrival_date: "2026-12-01",
      departure_date: "2026-12-05",
    });

    const modRevisionId = modifyRes.data?.attributes?.revision_id ?? null;
    console.log(`[booking-test] Modify revision: ${modRevisionId}`);
    console.log(`[booking-test] Full modify response:`, JSON.stringify(modifyRes, null, 2));

    console.log("[booking-test] Waiting 5 seconds...");
    await sleep(5000);

    if (modRevisionId) {
      try { await channex.acknowledgeBookingRevision(modRevisionId); } catch (e) {
        console.warn(`[booking-test] Ack failed: ${e}`);
      }
    }

    // ===== Step 3: Cancel Booking =====
    console.log("\n[booking-test] === STEP 3: Cancel Booking ===");
    const cancelRes = await channex.cancelBooking(bookingId, {
      ...bookingBase,
      arrival_date: "2026-12-01",
      departure_date: "2026-12-05",
    });

    const cancelRevisionId = cancelRes.data?.attributes?.revision_id ?? null;
    console.log(`[booking-test] Cancel revision: ${cancelRevisionId}`);
    console.log(`[booking-test] Full cancel response:`, JSON.stringify(cancelRes, null, 2));

    console.log("[booking-test] Waiting 5 seconds...");
    await sleep(5000);

    if (cancelRevisionId) {
      try { await channex.acknowledgeBookingRevision(cancelRevisionId); } catch (e) {
        console.warn(`[booking-test] Ack failed: ${e}`);
      }
    }

    // ===== Step 4: Check webhook delivery =====
    console.log("\n[booking-test] === Checking webhook delivery ===");
    const supabase = createServiceClient();
    const { data: webhookBookings } = await supabase
      .from("bookings")
      .select("id, channex_booking_id, guest_name, check_in, check_out, status")
      .eq("channex_booking_id", bookingId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webhookDelivered = ((webhookBookings ?? []) as any[]).length > 0;
    console.log(`[booking-test] Webhook delivered to Supabase: ${webhookDelivered}`);
    if (webhookDelivered) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.log(`[booking-test] Supabase booking:`, JSON.stringify((webhookBookings as any[])[0]));
    }

    const result = {
      booking_id: bookingId,
      new_revision_id: createRevisionId,
      modified_revision_id: modRevisionId,
      cancelled_revision_id: cancelRevisionId,
      webhook_delivered: webhookDelivered,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      webhook_data: webhookDelivered ? (webhookBookings as any[])[0] : null,
      timeline: [
        { step: "create", booking_id: bookingId, revision_id: createRevisionId, check_in: "2026-12-01", check_out: "2026-12-03" },
        { step: "modify", booking_id: bookingId, revision_id: modRevisionId, change: "check_out → 2026-12-05" },
        { step: "cancel", booking_id: bookingId, revision_id: cancelRevisionId },
      ],
    };

    console.log("\n[booking-test] === COMPLETE ===");
    console.log(JSON.stringify(result, null, 2));

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[booking-test] Error:", msg);
    if (err instanceof Error && err.stack) console.error(err.stack);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
