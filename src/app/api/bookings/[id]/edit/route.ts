import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import { getAuthenticatedUser, verifyBookingOwnership } from "@/lib/auth/api-auth";
import { db } from "@/lib/db/pooled";
import { bookings, properties } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { owned } = await verifyBookingOwnership(user.id, params.id);
    if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { check_in, check_out, guest_name, total_price } = body;

    if (!check_in || !check_out) {
      return NextResponse.json({ error: "check_in and check_out required" }, { status: 400 });
    }

    // Get existing booking with old dates
    const [existing] = await db
      .select({
        id: bookings.id,
        propertyId: bookings.propertyId,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
        guestName: bookings.guestName,
        totalPrice: bookings.totalPrice,
        status: bookings.status,
      })
      .from(bookings)
      .where(eq(bookings.id, params.id));

    if (!existing) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // postgres.js returns date columns as Date objects — normalize to YYYY-MM-DD strings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toDateStr = (v: any): string => (v instanceof Date ? v.toISOString() : String(v)).split("T")[0];
    const oldCheckIn = toDateStr(existing.checkIn);
    const oldCheckOut = toDateStr(existing.checkOut);

    // Update booking
    const updateData: Record<string, unknown> = {
      checkIn: check_in,
      checkOut: check_out,
      updatedAt: new Date().toISOString(),
    };
    if (guest_name !== undefined) updateData.guestName = guest_name;
    if (total_price !== undefined) updateData.totalPrice = total_price;

    const [updated] = await db
      .update(bookings)
      .set(updateData)
      .where(eq(bookings.id, params.id))
      .returning();

    // Update Channex availability: restore old dates, decrease new dates
    let channexResponse = null;
    const [prop] = await db
      .select({ channexPropertyId: properties.channexPropertyId })
      .from(properties)
      .where(eq(properties.id, existing.propertyId));

    if (prop?.channexPropertyId) {
      try {
        const channex = createChannexClient();
        const roomTypes = await channex.getRoomTypes(prop.channexPropertyId);

        if (roomTypes.length > 0) {
          // Update ALL room types: restore old dates, block new dates
          const values = roomTypes.flatMap((rt) => [
            ...buildAvailabilityValues(prop.channexPropertyId!, rt.id, oldCheckIn, oldCheckOut, 1),
            ...buildAvailabilityValues(prop.channexPropertyId!, rt.id, check_in, check_out, 0),
          ]);
          channexResponse = await channex.updateAvailability(values);
          console.log(`[bookings/edit] Channex availability updated: restored ${oldCheckIn}-${oldCheckOut}, blocked ${check_in}-${check_out} (${roomTypes.length} room types)`);
        }
      } catch (err) {
        console.error("[bookings/edit] Channex update failed:", err);
        channexResponse = { error: err instanceof Error ? err.message : String(err) };
      }
    }

    return NextResponse.json({
      booking: {
        id: updated.id,
        guest_name: updated.guestName,
        platform: updated.platform,
        check_in: toDateStr(updated.checkIn),
        check_out: toDateStr(updated.checkOut),
        total_price: updated.totalPrice ? Number(updated.totalPrice) : null,
        status: updated.status,
      },
      channex: channexResponse,
      changes: {
        old_dates: { check_in: oldCheckIn, check_out: oldCheckOut },
        new_dates: { check_in, check_out },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[bookings/edit] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function buildAvailabilityValues(
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
    const dateStr = d.toISOString().split("T")[0];
    values.push({
      property_id: propertyId,
      room_type_id: roomTypeId,
      date_from: dateStr,
      date_to: dateStr,
      availability,
    });
  }

  return values;
}
