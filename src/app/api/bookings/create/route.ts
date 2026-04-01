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

    // Push booking to Channex CRS if connected
    let channexResponse = null;
    if (prop.channex_property_id) {
      try {
        const channex = createChannexClient();
        const roomTypes = await channex.getRoomTypes(prop.channex_property_id);
        const ratePlans = await channex.getRatePlans(prop.channex_property_id);

        if (roomTypes.length > 0 && ratePlans.length > 0) {
          // Build per-night rates from calendar_rates
          const days = buildDaysMap(check_in, check_out);
          const { data: rateData } = await supabase
            .from("calendar_rates")
            .select("date, applied_rate")
            .eq("property_id", property_id)
            .in("date", Object.keys(days));

          for (const r of (rateData ?? []) as { date: string; applied_rate: number | null }[]) {
            if (r.applied_rate) days[r.date] = Number(r.applied_rate).toFixed(2);
          }

          const nameParts = (guest_name || "Guest").split(" ");
          const firstName = nameParts[0];
          const lastName = nameParts.slice(1).join(" ") || "Guest";

          // Create booking in Channex CRS with per-night rates
          const crsResult = await channex.createBooking({
            property_id: prop.channex_property_id,
            room_type_id: roomTypes[0].id,
            rate_plan_id: ratePlans[0].id,
            arrival_date: check_in,
            departure_date: check_out,
            guest_name: `${firstName} ${lastName}`,
            guest_email: "guest@staycommand.com",
            days, // pass pre-built per-night rates directly
            currency: "USD",
          });

          const channexBookingId = crsResult?.data?.id;
          if (channexBookingId) {
            // Store channex_booking_id on our booking
            await supabase
              .from("bookings")
              .update({ channex_booking_id: channexBookingId })
              .eq("id", booking.id);
            console.log(`[bookings/create] Channex CRS booking created: ${channexBookingId}`);
          }
          channexResponse = { id: channexBookingId, synced: true };
        }
      } catch (err) {
        console.error("[bookings/create] Channex CRS failed:", err);
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

function buildDaysMap(checkIn: string, checkOut: string): Record<string, string> {
  const days: Record<string, string> = {};
  const ci = new Date(checkIn + "T00:00:00Z");
  const co = new Date(checkOut + "T00:00:00Z");
  for (let d = new Date(ci); d < co; d.setUTCDate(d.getUTCDate() + 1)) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    days[`${y}-${m}-${day}`] = "160.00"; // default rate, overridden from DB
  }
  return days;
}
