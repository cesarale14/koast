import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createChannexClient } from "@/lib/channex/client";

// GET: preview properties from Channex
export async function GET() {
  try {
    const channex = createChannexClient();
    const properties = await channex.getProperties();

    const preview = properties.map((p) => ({
      channex_id: p.id,
      name: p.attributes.title,
      city: p.attributes.city,
      country: p.attributes.country,
      currency: p.attributes.currency,
      is_active: p.attributes.is_active,
    }));

    return NextResponse.json({ properties: preview });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("CHANNEX_API_KEY")) {
      return NextResponse.json(
        { error: "Channex API key not configured. Add CHANNEX_API_KEY to your environment." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: `Failed to connect to Channex: ${message}` },
      { status: 500 }
    );
  }
}

// POST: import selected properties
export async function POST(request: NextRequest) {
  try {
    const { channex_ids } = await request.json();
    if (!Array.isArray(channex_ids) || channex_ids.length === 0) {
      return NextResponse.json(
        { error: "No properties selected" },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const channex = createChannexClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const today = new Date().toISOString().split("T")[0];
    const end90 = new Date();
    end90.setDate(end90.getDate() + 90);
    const endDate = end90.toISOString().split("T")[0];

    const results = [];

    for (const channexId of channex_ids) {
      try {
        // Fetch property details
        const prop = await channex.getProperty(channexId);
        const attrs = prop.attributes;

        // Upsert property
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const table = supabase.from("properties") as any;
        const { data: dbProp, error: propErr } = await table
          .upsert(
            {
              user_id: user.id,
              name: attrs.title,
              address: attrs.address || null,
              city: attrs.city || null,
              state: attrs.state || null,
              zip: attrs.zip_code || null,
              latitude: attrs.latitude,
              longitude: attrs.longitude,
              channex_property_id: channexId,
            },
            { onConflict: "channex_property_id" }
          )
          .select("id")
          .single();

        if (propErr) throw propErr;
        const propertyId = dbProp.id;

        // Fetch room types → create listings
        const roomTypes = await channex.getRoomTypes(channexId);
        let roomsImported = 0;
        for (const rt of roomTypes) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const listTable = supabase.from("listings") as any;
          await listTable.upsert(
            {
              property_id: propertyId,
              platform: "direct",
              channex_room_id: rt.id,
              platform_listing_id: rt.id,
              status: "active",
            },
            { onConflict: "property_id,platform" }
          );
          roomsImported++;
        }

        // Fetch bookings for next 90 days
        const bookings = await channex.getBookings({
          propertyId: channexId,
          departureFrom: today,
          arrivalTo: endDate,
        });

        let bookingsImported = 0;
        for (const booking of bookings) {
          if (booking.attributes.status === "cancelled") continue;
          const ba = booking.attributes;
          const guestName = ba.customer
            ? [ba.customer.name, ba.customer.surname].filter(Boolean).join(" ")
            : null;

          // Map OTA name to platform
          let platform = "direct";
          const otaLower = (ba.ota_name ?? "").toLowerCase();
          if (otaLower.includes("airbnb")) platform = "airbnb";
          else if (otaLower.includes("vrbo") || otaLower.includes("homeaway")) platform = "vrbo";
          else if (otaLower.includes("booking")) platform = "booking_com";

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bookTable = supabase.from("bookings") as any;
          await bookTable.upsert(
            {
              property_id: propertyId,
              platform,
              channex_booking_id: booking.id,
              guest_name: guestName,
              guest_email: ba.customer?.mail || null,
              guest_phone: ba.customer?.phone || null,
              check_in: ba.arrival_date,
              check_out: ba.departure_date,
              total_price: parseFloat(ba.amount) || null,
              currency: ba.currency || "USD",
              status: ba.status === "new" ? "confirmed" : "confirmed",
              platform_booking_id: ba.ota_reservation_code || null,
              notes: ba.notes || null,
            },
            { onConflict: "channex_booking_id" }
          );
          bookingsImported++;
        }

        // Fetch rates → populate calendar_rates
        let ratesImported = 0;
        try {
          const restrictions = await channex.getRestrictions(
            channexId,
            today,
            endDate
          );

          for (const r of restrictions) {
            const ra = r.attributes;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rateTable = supabase.from("calendar_rates") as any;
            await rateTable.upsert(
              {
                property_id: propertyId,
                date: ra.date,
                applied_rate: (ra.rate / 100).toFixed(2), // Channex stores rates in cents
                base_rate: (ra.rate / 100).toFixed(2),
                min_stay: ra.min_stay_arrival || 1,
                is_available: !ra.stop_sell,
                rate_source: "manual",
              },
              { onConflict: "property_id,date" }
            );
            ratesImported++;
          }
        } catch {
          // Rates may not be available for all properties
        }

        results.push({
          channex_id: channexId,
          property_id: propertyId,
          name: attrs.title,
          status: "imported",
          rooms: roomsImported,
          bookings: bookingsImported,
          rates: ratesImported,
        });
      } catch (err) {
        results.push({
          channex_id: channexId,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
