import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import { getAuthenticatedUser, verifyBookingOwnership } from "@/lib/auth/api-auth";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { owned } = await verifyBookingOwnership(user.id, params.id);
    if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();

    // Get existing booking
    const { data: existing } = await supabase
      .from("bookings")
      .select("id, property_id, check_in, check_out, guest_name, status")
      .eq("id", params.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (existing.status === "cancelled") {
      return NextResponse.json({ error: "Booking is already cancelled" }, { status: 400 });
    }

    // Update booking status to cancelled
    const { data: updated, error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Restore Channex availability on all booked dates
    let channexResponse = null;
    const { data: prop } = await supabase
      .from("properties")
      .select("channex_property_id")
      .eq("id", existing.property_id)
      .single();

    if (prop?.channex_property_id) {
      try {
        const channex = createChannexClient();
        const roomTypes = await channex.getRoomTypes(prop.channex_property_id);

        if (roomTypes.length > 0) {
          const values = buildAvailabilityValues(
            prop.channex_property_id,
            roomTypes[0].id,
            existing.check_in,
            existing.check_out,
            1 // restore to available
          );

          channexResponse = await channex.updateAvailability(values);
          console.log(`[bookings/cancel] Channex availability restored for ${existing.check_in} to ${existing.check_out}`);
        }
      } catch (err) {
        console.error("[bookings/cancel] Channex update failed:", err);
        channexResponse = { error: err instanceof Error ? err.message : String(err) };
      }
    }

    return NextResponse.json({
      booking: updated,
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
