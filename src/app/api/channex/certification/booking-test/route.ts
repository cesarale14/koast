import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const propertyId = body.property_id ?? "c83ba211-2e79-4de0-b388-c88d9f695581";

    const channex = createChannexClient();

    // Get room types and rate plans for this property
    console.log("[booking-test] Fetching room types and rate plans...");
    const roomTypes = await channex.getRoomTypes(propertyId);
    const ratePlans = await channex.getRatePlans(propertyId);

    if (roomTypes.length === 0 || ratePlans.length === 0) {
      return NextResponse.json(
        { error: "No room types or rate plans found for this property" },
        { status: 400 }
      );
    }

    // Use the first room type (Twin) and its first rate plan
    const roomTypeId = roomTypes[0].id;
    const ratePlanId = ratePlans[0].id;

    console.log(`[booking-test] Using room type: ${roomTypes[0].attributes.title} (${roomTypeId})`);
    console.log(`[booking-test] Using rate plan: ${ratePlanId}`);

    // Step 1: Create a test booking
    console.log("\n[booking-test] === STEP 1: Create Booking ===");
    const createRes = await channex.createBooking({
      property_id: propertyId,
      room_type_id: roomTypeId,
      rate_plan_id: ratePlanId,
      arrival_date: "2026-12-01",
      departure_date: "2026-12-03",
      guest_name: "Test Guest",
      guest_email: "testguest@staycommand.com",
    });

    const bookingId = createRes.data?.id;
    console.log(`[booking-test] Booking created: ${bookingId}`);
    console.log(`[booking-test] Create response:`, JSON.stringify(createRes, null, 2));

    // Get the initial revision
    const createRevisions = await channex.getUnacknowledgedRevisions(propertyId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createRevision = (createRevisions as any)?.data?.[0]?.id ?? null;
    console.log(`[booking-test] Create revision ID: ${createRevision}`);

    // Acknowledge the creation
    if (createRevision) {
      await channex.acknowledgeBookingRevision(createRevision);
    }

    // Step 2: Wait then modify (extend stay)
    console.log("\n[booking-test] Waiting 3 seconds before modification...");
    await sleep(3000);

    console.log("[booking-test] === STEP 2: Modify Booking ===");
    const modifyRes = await channex.modifyBooking(bookingId, {
      departure_date: "2026-12-05",
    });
    console.log(`[booking-test] Modify response:`, JSON.stringify(modifyRes, null, 2));

    // Get the modification revision
    await sleep(1000);
    const modRevisions = await channex.getUnacknowledgedRevisions(propertyId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modRevData = (modRevisions as any)?.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modRevision = modRevData.find((r: any) => r.id !== createRevision)?.id ?? modRevData[0]?.id ?? null;
    console.log(`[booking-test] Modification revision ID: ${modRevision}`);

    if (modRevision) {
      await channex.acknowledgeBookingRevision(modRevision);
    }

    // Step 3: Wait then cancel
    console.log("\n[booking-test] Waiting 3 seconds before cancellation...");
    await sleep(3000);

    console.log("[booking-test] === STEP 3: Cancel Booking ===");
    const cancelRes = await channex.cancelBooking(bookingId);
    console.log(`[booking-test] Cancel response:`, JSON.stringify(cancelRes, null, 2));

    // Get the cancellation revision
    await sleep(1000);
    const cancelRevisions = await channex.getUnacknowledgedRevisions(propertyId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cancelRevData = (cancelRevisions as any)?.data ?? [];
    const cancelRevision = cancelRevData.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => r.id !== createRevision && r.id !== modRevision
    )?.id ?? cancelRevData[0]?.id ?? null;
    console.log(`[booking-test] Cancellation revision ID: ${cancelRevision}`);

    if (cancelRevision) {
      await channex.acknowledgeBookingRevision(cancelRevision);
    }

    const result = {
      booking_id: bookingId,
      create_revision_id: createRevision,
      modify_revision_id: modRevision,
      cancel_revision_id: cancelRevision,
      timeline: [
        { step: "create", booking_id: bookingId, revision_id: createRevision, guest: "Test Guest", check_in: "2026-12-01", check_out: "2026-12-03" },
        { step: "modify", booking_id: bookingId, revision_id: modRevision, change: "check_out extended to 2026-12-05" },
        { step: "cancel", booking_id: bookingId, revision_id: cancelRevision },
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
