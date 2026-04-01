import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import { getAuthenticatedUser, verifyBookingOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

const API_VERSION = "v5-supabase";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized", v: API_VERSION }, { status: 401 });

    const { owned, propertyId } = await verifyBookingOwnership(user.id, params.id);
    if (!owned) return NextResponse.json({ error: "Forbidden", v: API_VERSION }, { status: 403 });

    const body = await request.json();
    const { check_in, check_out, guest_name, total_price } = body;

    if (!check_in || !check_out) {
      return NextResponse.json({ error: "check_in and check_out required", v: API_VERSION }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Get existing booking (Supabase returns plain strings, no Date objects)
    const { data: existingData } = await supabase
      .from("bookings")
      .select("id, property_id, check_in, check_out, guest_name, total_price, status")
      .eq("id", params.id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = ((existingData ?? []) as any[])[0];

    if (!existing) {
      return NextResponse.json({ error: "Booking not found", v: API_VERSION }, { status: 404 });
    }

    const oldCheckIn = existing.check_in;
    const oldCheckOut = existing.check_out;

    // Update booking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateFields: any = {
      check_in,
      check_out,
      updated_at: new Date().toISOString(),
    };
    if (guest_name !== undefined) updateFields.guest_name = guest_name;
    if (total_price !== undefined) updateFields.total_price = total_price;

    const { data: updatedData, error: updateError } = await supabase
      .from("bookings")
      .update(updateFields)
      .eq("id", params.id)
      .select("id, guest_name, platform, check_in, check_out, total_price, status")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message, v: API_VERSION }, { status: 500 });
    }

    // Update Channex availability: restore old dates, block new dates
    let channexResponse = null;
    const { data: propData } = await supabase
      .from("properties")
      .select("channex_property_id")
      .eq("id", propertyId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prop = ((propData ?? []) as any[])[0];

    if (prop?.channex_property_id) {
      try {
        const channex = createChannexClient();
        const roomTypes = await channex.getRoomTypes(prop.channex_property_id);

        if (roomTypes.length > 0) {
          const values = roomTypes.flatMap((rt) => [
            { property_id: prop.channex_property_id, room_type_id: rt.id, date_from: oldCheckIn, date_to: oldCheckOut, availability: 1 },
            { property_id: prop.channex_property_id, room_type_id: rt.id, date_from: check_in, date_to: check_out, availability: 0 },
          ]);
          channexResponse = await channex.updateAvailability(values);
          console.log(`[bookings/edit] Channex updated: restored ${oldCheckIn}-${oldCheckOut}, blocked ${check_in}-${check_out} (${roomTypes.length} room types)`);
        }
      } catch (err) {
        console.error("[bookings/edit] Channex update failed:", err);
        channexResponse = { error: err instanceof Error ? err.message : String(err) };
      }
    }

    return NextResponse.json({
      booking: {
        id: updatedData.id,
        guest_name: updatedData.guest_name,
        platform: updatedData.platform,
        check_in: updatedData.check_in,
        check_out: updatedData.check_out,
        total_price: updatedData.total_price ? Number(updatedData.total_price) : null,
        status: updatedData.status,
      },
      channex: channexResponse,
      v: API_VERSION,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[bookings/edit] Error:", msg);
    return NextResponse.json({ error: `[${API_VERSION}] ${msg}` }, { status: 500 });
  }
}
