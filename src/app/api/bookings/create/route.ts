import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

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

    const supabase = createServiceClient();

    // Get property with Channex ID
    const { data: propData } = await supabase
      .from("properties")
      .select("id, channex_property_id")
      .eq("id", property_id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prop = ((propData ?? []) as any[])[0];
    if (!prop) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    // Insert booking
    const { data: insertedData, error: insertErr } = await supabase
      .from("bookings")
      .insert({
        property_id,
        guest_name,
        check_in,
        check_out,
        total_price: total_price || null,
        platform: "direct",
        status: "confirmed",
        currency: "USD",
      })
      .select("id, guest_name, platform, check_in, check_out, total_price, status")
      .single();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    const booking = insertedData;

    // Push availability to Channex (block booked dates) — do NOT push CRS booking
    // CRS booking push was resetting Channex restriction rates
    let channexResponse = null;
    if (prop.channex_property_id) {
      try {
        const channex = createChannexClient();
        const roomTypes = await channex.getRoomTypes(prop.channex_property_id);

        if (roomTypes.length > 0) {
          const values = roomTypes.map((rt) => ({
            property_id: prop.channex_property_id,
            room_type_id: rt.id,
            date_from: check_in,
            date_to: check_out,
            availability: 0,
          }));
          await channex.updateAvailability(values);
          console.log(`[bookings/create] Channex availability blocked: ${check_in} to ${check_out} (${roomTypes.length} room types)`);
          channexResponse = { synced: true };
        }
      } catch (err) {
        console.error("[bookings/create] Channex update failed:", err);
        channexResponse = { error: err instanceof Error ? err.message : String(err) };
      }
    }

    return NextResponse.json({
      booking: {
        id: booking.id,
        guest_name: booking.guest_name,
        platform: booking.platform,
        check_in: booking.check_in,
        check_out: booking.check_out,
        total_price: booking.total_price ? Number(booking.total_price) : null,
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
