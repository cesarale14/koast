// DEV-ONLY: Channex certification/testing endpoint — not for production use
import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const propertyId = body.property_id ?? "c83ba211-2e79-4de0-b388-c88d9f695581";
    const mode = body.mode ?? "crs"; // "crs" or "poll"

    const channex = createChannexClient();

    if (mode === "poll") {
      // ===== POLL MODE: fetch unacknowledged revisions =====
      console.log("[booking-test] Polling for unacknowledged booking revisions...");

      const feed = await channex.getUnacknowledgedRevisions(propertyId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const revisions = (feed as any)?.data ?? [];
      console.log(`[booking-test] Found ${revisions.length} unacknowledged revisions`);

      const results = [];
      for (const rev of revisions) {
        const revId = rev.id;
        const bookingId = rev.attributes?.booking_id ?? rev.relationships?.booking?.data?.id;
        const status = rev.attributes?.status;

        console.log(`[booking-test] Revision ${revId}: booking=${bookingId}, status=${status}`);

        // Fetch full booking details
        let bookingDetails = null;
        try {
          bookingDetails = await channex.getBooking(bookingId);
        } catch (e) {
          console.warn(`[booking-test] Could not fetch booking ${bookingId}: ${e}`);
        }

        // Acknowledge
        try {
          await channex.acknowledgeBookingRevision(revId);
          console.log(`[booking-test] Acknowledged revision ${revId}`);
        } catch (e) {
          console.warn(`[booking-test] Ack failed: ${e}`);
        }

        results.push({
          revision_id: revId,
          booking_id: bookingId,
          status,
          guest: bookingDetails?.attributes?.customer
            ? `${bookingDetails.attributes.customer.name} ${bookingDetails.attributes.customer.surname}`
            : null,
          arrival: bookingDetails?.attributes?.arrival_date,
          departure: bookingDetails?.attributes?.departure_date,
        });
      }

      // Check Supabase for webhook delivery
      const supabase = createServiceClient();
      const { data: dbBookings } = await supabase
        .from("bookings")
        .select("id, channex_booking_id, guest_name, check_in, check_out, status")
        .eq("property_id", body.supabase_property_id ?? "0bf7120f-0f8a-4c91-a337-a574b587f98b")
        .order("created_at", { ascending: false })
        .limit(5);

      return NextResponse.json({
        mode: "poll",
        revisions_found: results.length,
        revisions: results,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase_bookings: (dbBookings ?? []) as any[],
      });
    }

    // ===== CRS MODE: create/modify/cancel via API =====
    console.log("[booking-test] Using CRS API...");

    const roomTypes = await channex.getRoomTypes(propertyId);
    const ratePlans = await channex.getRatePlans(propertyId);

    if (roomTypes.length === 0 || ratePlans.length === 0) {
      return NextResponse.json({ error: "No room types or rate plans found" }, { status: 400 });
    }

    const roomTypeId = roomTypes[0].id;
    const ratePlanId = ratePlans[0].id;

    const bookingBase = {
      property_id: propertyId,
      room_type_id: roomTypeId,
      rate_plan_id: ratePlanId,
      guest_name: "Test Guest",
      guest_email: "testguest@koast.com",
    };

    // Step 1: Create
    console.log("\n[booking-test] === STEP 1: Create Booking (CRS) ===");
    let createRes;
    try {
      createRes = await channex.createBooking({
        ...bookingBase,
        arrival_date: "2026-12-01",
        departure_date: "2026-12-03",
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (errMsg.includes("403")) {
        return NextResponse.json({
          error: "CRS API returned 403 Forbidden. The Booking CRS app needs to be installed on this property.",
          instructions: [
            "1. Go to https://app.channex.io",
            "2. Navigate to Applications page",
            "3. Find 'Booking CRS' and install it on the test property",
            "4. Or use mode: 'poll' to process manually created bookings:",
            "   POST with {\"mode\":\"poll\"} to poll for existing booking revisions",
          ],
          alternative: "Create a booking manually in the Channex dashboard, then call this endpoint with {\"mode\":\"poll\"} to acknowledge it.",
        });
      }
      throw e;
    }

    const bookingId = createRes.data?.attributes?.booking_id ?? createRes.data?.id;
    const createRevisionId = createRes.data?.attributes?.revision_id ?? null;
    console.log(`[booking-test] Booking ID: ${bookingId}, Revision: ${createRevisionId}`);

    if (createRevisionId) {
      try { await channex.acknowledgeBookingRevision(createRevisionId); } catch (e) {
        console.warn(`[booking-test] Ack failed: ${e}`);
      }
    }

    // Step 2: Modify
    console.log("\n[booking-test] Waiting 5 seconds...");
    await sleep(5000);
    console.log("[booking-test] === STEP 2: Modify Booking ===");
    const modifyRes = await channex.modifyBooking(bookingId, {
      ...bookingBase,
      arrival_date: "2026-12-01",
      departure_date: "2026-12-05",
    });
    const modRevisionId = modifyRes.data?.attributes?.revision_id ?? null;
    console.log(`[booking-test] Modify revision: ${modRevisionId}`);
    if (modRevisionId) {
      try { await channex.acknowledgeBookingRevision(modRevisionId); } catch (e) {
        console.warn(`[booking-test] Ack failed: ${e}`);
      }
    }

    // Step 3: Cancel
    console.log("\n[booking-test] Waiting 5 seconds...");
    await sleep(5000);
    console.log("[booking-test] === STEP 3: Cancel Booking ===");
    const cancelRes = await channex.cancelBooking(bookingId, {
      ...bookingBase,
      arrival_date: "2026-12-01",
      departure_date: "2026-12-05",
    });
    const cancelRevisionId = cancelRes.data?.attributes?.revision_id ?? null;
    console.log(`[booking-test] Cancel revision: ${cancelRevisionId}`);
    if (cancelRevisionId) {
      try { await channex.acknowledgeBookingRevision(cancelRevisionId); } catch (e) {
        console.warn(`[booking-test] Ack failed: ${e}`);
      }
    }

    // Check webhook
    await sleep(3000);
    const supabase = createServiceClient();
    const { data: webhookBookings } = await supabase
      .from("bookings")
      .select("id, channex_booking_id, guest_name, check_in, check_out, status")
      .eq("channex_booking_id", bookingId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webhookDelivered = ((webhookBookings ?? []) as any[]).length > 0;

    return NextResponse.json({
      mode: "crs",
      booking_id: bookingId,
      new_revision_id: createRevisionId,
      modified_revision_id: modRevisionId,
      cancelled_revision_id: cancelRevisionId,
      webhook_delivered: webhookDelivered,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      webhook_data: webhookDelivered ? (webhookBookings as any[])[0] : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[booking-test] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
