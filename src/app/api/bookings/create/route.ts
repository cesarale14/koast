import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { property_id, guest_name, check_in, check_out, total_price } = body;

    if (!property_id || !guest_name || !check_in || !check_out) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Get property with Channex ID
    const { data: prop } = await supabase
      .from("properties")
      .select("id, channex_property_id")
      .eq("id", property_id)
      .single();

    if (!prop) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // Insert booking into Supabase
    const { data: booking, error: insertError } = await supabase
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
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Update Channex availability if connected
    let channexResponse = null;
    if (prop.channex_property_id) {
      try {
        const channex = createChannexClient();
        const roomTypes = await channex.getRoomTypes(prop.channex_property_id);

        if (roomTypes.length > 0) {
          // Build per-date availability updates (decrease by 1 for each booked date)
          const values = buildAvailabilityValues(
            prop.channex_property_id,
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
      booking,
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
