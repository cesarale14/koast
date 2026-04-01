import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { db } from "@/lib/db/pooled";
import { properties, bookings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { property_id, guest_name, check_in, check_out, total_price } = body;

    const isOwner = await verifyPropertyOwnership(user.id, property_id);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!property_id || !guest_name || !check_in || !check_out) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get property with Channex ID
    const [prop] = await db
      .select({ id: properties.id, channexPropertyId: properties.channexPropertyId })
      .from(properties)
      .where(eq(properties.id, property_id));

    if (!prop) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // Insert booking
    const [booking] = await db
      .insert(bookings)
      .values({
        propertyId: property_id,
        guestName: guest_name,
        checkIn: check_in,
        checkOut: check_out,
        totalPrice: total_price || null,
        platform: "direct",
        status: "confirmed",
        currency: "USD",
      })
      .returning();

    // Update Channex availability if connected
    let channexResponse = null;
    if (prop.channexPropertyId) {
      try {
        const channex = createChannexClient();
        const roomTypes = await channex.getRoomTypes(prop.channexPropertyId);

        if (roomTypes.length > 0) {
          // Build per-date availability updates (decrease by 1 for each booked date)
          const values = buildAvailabilityValues(
            prop.channexPropertyId,
            roomTypes[0].id,
            check_in,
            check_out,
            0 // set to 0 (booked)
          );

          channexResponse = await channex.updateAvailability(values);
          console.log(`[bookings/create] Channex availability updated for ${check_in} to ${check_out}`);
        }
      } catch (err) {
        console.error("[bookings/create] Channex update failed:", err);
        channexResponse = { error: err instanceof Error ? err.message : String(err) };
      }
    }

    return NextResponse.json({
      booking: {
        id: booking.id,
        guest_name: booking.guestName,
        platform: booking.platform,
        check_in: booking.checkIn,
        check_out: booking.checkOut,
        total_price: booking.totalPrice ? Number(booking.totalPrice) : null,
        status: booking.status,
      },
      channex: channexResponse,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[bookings/create] Error:", msg);
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
  // Create one entry per date from check-in to check-out (exclusive of checkout)
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
