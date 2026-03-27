import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import { getAuthenticatedUser, verifyBookingOwnership } from "@/lib/auth/api-auth";

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

    const supabase = createServiceClient();

    // Get existing booking with old dates
    const { data: existing } = await supabase
      .from("bookings")
      .select("id, property_id, check_in, check_out, guest_name, total_price, status")
      .eq("id", params.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const oldCheckIn = existing.check_in;
    const oldCheckOut = existing.check_out;

    // Update booking in Supabase
    const updateData: Record<string, unknown> = {
      check_in,
      check_out,
      updated_at: new Date().toISOString(),
    };
    if (guest_name !== undefined) updateData.guest_name = guest_name;
    if (total_price !== undefined) updateData.total_price = total_price;

    const { data: updated, error: updateError } = await supabase
      .from("bookings")
      .update(updateData)
      .eq("id", params.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Update Channex availability: restore old dates, decrease new dates
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
          const rtId = roomTypes[0].id;
          const values = [
            // Restore availability on OLD dates (set to 1 = available)
            ...buildAvailabilityValues(prop.channex_property_id, rtId, oldCheckIn, oldCheckOut, 1),
            // Decrease availability on NEW dates (set to 0 = booked)
            ...buildAvailabilityValues(prop.channex_property_id, rtId, check_in, check_out, 0),
          ];

          channexResponse = await channex.updateAvailability(values);
          console.log(`[bookings/edit] Channex availability updated: restored ${oldCheckIn}-${oldCheckOut}, blocked ${check_in}-${check_out}`);
        }
      } catch (err) {
        console.error("[bookings/edit] Channex update failed:", err);
        channexResponse = { error: err instanceof Error ? err.message : String(err) };
      }
    }

    return NextResponse.json({
      booking: updated,
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
