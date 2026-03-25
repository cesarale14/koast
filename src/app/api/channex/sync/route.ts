import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createChannexClient } from "@/lib/channex/client";

// POST: sync all Channex-connected properties
export async function POST() {
  try {
    const supabase = createClient();
    const channex = createChannexClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get all properties with channex_property_id
    const propsRes = await supabase
      .from("properties")
      .select("id, channex_property_id")
      .not("channex_property_id", "is", null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties = (propsRes.data ?? []) as any[];

    if (properties.length === 0) {
      return NextResponse.json({
        message: "No Channex-connected properties to sync",
        synced: 0,
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const end90 = new Date();
    end90.setDate(end90.getDate() + 90);
    const endDate = end90.toISOString().split("T")[0];

    let totalBookings = 0;
    let totalRates = 0;
    const errors: string[] = [];

    for (const prop of properties) {
      try {
        const channexId = prop.channex_property_id;

        // Sync bookings
        const bookings = await channex.getBookings({
          propertyId: channexId,
          departureFrom: today,
          arrivalTo: endDate,
        });

        for (const booking of bookings) {
          const ba = booking.attributes;
          const guestName = ba.customer
            ? [ba.customer.name, ba.customer.surname].filter(Boolean).join(" ")
            : null;

          let platform = "direct";
          const otaLower = (ba.ota_name ?? "").toLowerCase();
          if (otaLower.includes("airbnb")) platform = "airbnb";
          else if (otaLower.includes("vrbo") || otaLower.includes("homeaway")) platform = "vrbo";
          else if (otaLower.includes("booking")) platform = "booking_com";

          let status = "confirmed";
          if (ba.status === "cancelled") status = "cancelled";

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bookTable = supabase.from("bookings") as any;
          await bookTable.upsert(
            {
              property_id: prop.id,
              platform,
              channex_booking_id: booking.id,
              guest_name: guestName,
              guest_email: ba.customer?.mail || null,
              guest_phone: ba.customer?.phone || null,
              check_in: ba.arrival_date,
              check_out: ba.departure_date,
              total_price: parseFloat(ba.amount) || null,
              currency: ba.currency || "USD",
              status,
              platform_booking_id: ba.ota_reservation_code || null,
              notes: ba.notes || null,
            },
            { onConflict: "channex_booking_id" }
          );
          totalBookings++;
        }

        // Sync rates
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
                property_id: prop.id,
                date: ra.date,
                applied_rate: (ra.rate / 100).toFixed(2),
                base_rate: (ra.rate / 100).toFixed(2),
                min_stay: ra.min_stay_arrival || 1,
                is_available: !ra.stop_sell,
                rate_source: "manual",
              },
              { onConflict: "property_id,date" }
            );
            totalRates++;
          }
        } catch {
          // Rates endpoint may not be available
        }
      } catch (err) {
        errors.push(
          `Property ${prop.id}: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    }

    return NextResponse.json({
      message: `Synced ${properties.length} properties`,
      synced: properties.length,
      bookings: totalBookings,
      rates: totalRates,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
