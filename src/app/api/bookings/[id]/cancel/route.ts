import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import { getAuthenticatedUser, verifyBookingOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { owned, propertyId } = await verifyBookingOwnership(user.id, params.id);
    if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();

    // Get existing booking
    const { data: existingData } = await supabase
      .from("bookings")
      .select("id, property_id, check_in, check_out, guest_name, status, channex_booking_id")
      .eq("id", params.id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = ((existingData ?? []) as any[])[0];
    if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (existing.status === "cancelled") return NextResponse.json({ error: "Already cancelled" }, { status: 400 });

    // Cancel in DB
    const { data: updatedData, error: updateError } = await supabase
      .from("bookings")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .select("id, guest_name, platform, check_in, check_out, total_price, status")
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    // Push to Channex: cancel CRS booking + restore availability
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

        // Cancel CRS booking if we have a channex_booking_id
        if (existing.channex_booking_id && roomTypes.length > 0) {
          const ratePlans = await channex.getRatePlans(prop.channex_property_id);
          if (ratePlans.length > 0) {
            await channex.cancelBooking(existing.channex_booking_id, {
              property_id: prop.channex_property_id,
              room_type_id: roomTypes[0].id,
              rate_plan_id: ratePlans[0].id,
              guest_name: existing.guest_name || "Guest",
              arrival_date: existing.check_in,
              departure_date: existing.check_out,
            });
            console.log(`[bookings/cancel] Channex CRS booking cancelled: ${existing.channex_booking_id}`);
          }
        }

        // Restore availability for all room types
        if (roomTypes.length > 0) {
          const values = roomTypes.map((rt) => ({
            property_id: prop.channex_property_id,
            room_type_id: rt.id,
            date_from: existing.check_in,
            date_to: existing.check_out,
            availability: 1,
          }));
          await channex.updateAvailability(values);
          console.log(`[bookings/cancel] Channex availability restored: ${existing.check_in} to ${existing.check_out}`);
        }
        channexResponse = { synced: true };
      } catch (err) {
        console.error("[bookings/cancel] Channex update failed:", err);
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
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[bookings/cancel] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
