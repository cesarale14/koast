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
    console.log(`[bookings/create] Property ${property_id}: channex_id=${prop.channexPropertyId ?? "NONE"}`);
    if (prop.channexPropertyId) {
      try {
        const channex = createChannexClient();
        const roomTypes = await channex.getRoomTypes(prop.channexPropertyId);
        console.log(`[bookings/create] Found ${roomTypes.length} room types: ${roomTypes.map(r => r.id).join(", ")}`);

        if (roomTypes.length > 0) {
          // Block availability for ALL room types (vacation rental = 0 when booked)
          const values = roomTypes.flatMap((rt) =>
            buildAvailabilityValues(prop.channexPropertyId!, rt.id, check_in, check_out, 0)
          );
          console.log(`[bookings/create] Pushing ${values.length} availability entries (avail=0) for ${check_in} to ${check_out}`);
          channexResponse = await channex.updateAvailability(values);
          console.log(`[bookings/create] Channex response: ${JSON.stringify(channexResponse).substring(0, 200)}`);
        }
      } catch (err) {
        console.error("[bookings/create] Channex update failed:", err);
        channexResponse = { error: err instanceof Error ? err.message : String(err) };
      }
    } else {
      console.log(`[bookings/create] No Channex connection — skipping availability push`);
    }

    return NextResponse.json({
      booking: {
        id: booking.id,
        guest_name: booking.guestName,
        platform: booking.platform,
        check_in: check_in,  // use the original string from request body
        check_out: check_out,
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
  // Use date range instead of per-day entries
  return [{
    property_id: propertyId,
    room_type_id: roomTypeId,
    date_from: checkIn,
    date_to: checkOut,
    availability,
  }];
}
