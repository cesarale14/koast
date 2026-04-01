import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import { getAuthenticatedUser, verifyBookingOwnership } from "@/lib/auth/api-auth";
import { db } from "@/lib/db/pooled";
import { bookings, properties } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { owned } = await verifyBookingOwnership(user.id, params.id);
    if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Get existing booking
    const [existing] = await db
      .select({
        id: bookings.id,
        propertyId: bookings.propertyId,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
        guestName: bookings.guestName,
        status: bookings.status,
      })
      .from(bookings)
      .where(eq(bookings.id, params.id));

    if (!existing) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Normalize dates from Drizzle (may be Date objects at runtime)
    const ciStr = typeof existing.checkIn === "string" ? existing.checkIn.split("T")[0] : new Date(existing.checkIn as unknown as string).toISOString().split("T")[0];
    const coStr = typeof existing.checkOut === "string" ? existing.checkOut.split("T")[0] : new Date(existing.checkOut as unknown as string).toISOString().split("T")[0];

    if (existing.status === "cancelled") {
      return NextResponse.json({ error: "Booking is already cancelled" }, { status: 400 });
    }

    // Update booking status to cancelled
    const [updated] = await db
      .update(bookings)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, params.id))
      .returning();

    // Restore Channex availability on all booked dates
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
          // Restore ALL room types to available
          const values = roomTypes.flatMap((rt) =>
            buildAvailabilityValues(prop.channexPropertyId!, rt.id, ciStr, coStr, 1)
          );
          channexResponse = await channex.updateAvailability(values);
          console.log(`[bookings/cancel] Channex availability restored for ${ciStr} to ${coStr} (${roomTypes.length} room types)`);
        }
      } catch (err) {
        console.error("[bookings/cancel] Channex update failed:", err);
        channexResponse = { error: err instanceof Error ? err.message : String(err) };
      }
    }

    return NextResponse.json({
      booking: {
        id: updated.id,
        guest_name: updated.guestName,
        platform: updated.platform,
        check_in: updated.checkIn,
        check_out: updated.checkOut,
        total_price: updated.totalPrice ? Number(updated.totalPrice) : null,
        status: updated.status,
      },
      channex: channexResponse,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[bookings/cancel] Error:", msg);
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
