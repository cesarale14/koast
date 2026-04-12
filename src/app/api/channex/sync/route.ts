import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

function detectPlatform(otaName: string | null | undefined): string {
  const lower = (otaName ?? "").toLowerCase();
  if (lower.includes("airbnb")) return "airbnb";
  if (lower.includes("vrbo") || lower.includes("homeaway")) return "vrbo";
  if (lower.includes("booking")) return "booking_com";
  return "direct";
}

// POST: sync bookings + rates from Channex for the current user's connected
// properties. Body { property_id?: uuid } limits the sync to one property.
export async function POST(request: NextRequest) {
  try {
    const auth = createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let body: { property_id?: string } = {};
    try { body = await request.json(); } catch { /* empty body ok */ }

    const supabase = createServiceClient();
    const channex = createChannexClient();

    let query = supabase
      .from("properties")
      .select("id, name, channex_property_id")
      .eq("user_id", user.id)
      .not("channex_property_id", "is", null);
    if (body.property_id) query = query.eq("id", body.property_id);

    const { data: propData } = await query;
    const properties = (propData ?? []) as { id: string; name: string; channex_property_id: string }[];

    if (properties.length === 0) {
      return NextResponse.json({
        message: "No Channex-connected properties to sync",
        synced: 0,
        bookings: 0,
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const end90 = new Date();
    end90.setDate(end90.getDate() + 90);
    const endDate = end90.toISOString().split("T")[0];

    let totalBookingsInserted = 0;
    let totalBookingsUpdated = 0;
    let totalRates = 0;
    const perProperty: {
      property_id: string;
      name: string;
      bookings_new: number;
      bookings_updated: number;
      rates: number;
      error?: string;
    }[] = [];
    const errors: string[] = [];

    for (const prop of properties) {
      const channexId = prop.channex_property_id;
      let newCount = 0;
      let updatedCount = 0;
      let rateCount = 0;
      try {
        // Fetch ALL bookings for the property (no date filter — the task
        // wants Channex to be the source of truth for this property).
        const bookings = await channex.getBookings({ propertyId: channexId });

        for (const booking of bookings) {
          const ba = booking.attributes;
          const guestName = ba.customer
            ? [ba.customer.name, ba.customer.surname].filter(Boolean).join(" ")
            : null;

          const platform = detectPlatform(ba.ota_name);
          const status = ba.status === "cancelled" ? "cancelled" : "confirmed";

          const bookingRecord = {
            property_id: prop.id,
            platform,
            channex_booking_id: booking.id,
            guest_name: guestName,
            guest_email: ba.customer?.mail || null,
            guest_phone: ba.customer?.phone || null,
            check_in: ba.arrival_date,
            check_out: ba.departure_date,
            total_price: ba.amount ? parseFloat(ba.amount) : null,
            currency: ba.currency || "USD",
            status,
            platform_booking_id: ba.ota_reservation_code || null,
            notes: ba.notes || null,
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bookTable = supabase.from("bookings") as any;
          const { data: existing } = await bookTable
            .select("id")
            .eq("channex_booking_id", booking.id)
            .limit(1);

          if (existing && existing.length > 0) {
            const { error } = await bookTable
              .update(bookingRecord)
              .eq("id", existing[0].id);
            if (error) {
              console.error(`[channex/sync] Update error for ${booking.id}:`, error.message);
            } else {
              updatedCount++;
            }
          } else {
            const { error } = await bookTable.insert(bookingRecord);
            if (error) {
              console.error(`[channex/sync] Insert error for ${booking.id}:`, error.message);
            } else {
              newCount++;
            }
          }
        }

        // Best-effort rate sync — don't fail the whole run if restrictions
        // aren't available for this channex property.
        try {
          const restrictions = await channex.getRestrictions(channexId, today, endDate);
          for (const r of restrictions) {
            const ra = r.attributes;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rateTable = supabase.from("calendar_rates") as any;
            await rateTable.upsert(
              {
                property_id: prop.id,
                date: ra.date,
                applied_rate: ra.rate ? (ra.rate / 100).toFixed(2) : null,
                base_rate: ra.rate ? (ra.rate / 100).toFixed(2) : null,
                min_stay: ra.min_stay_arrival || 1,
                is_available: !ra.stop_sell,
                rate_source: "manual",
                channel_code: null,
              },
              { onConflict: "property_id,date,channel_code" }
            );
            rateCount++;
          }
        } catch (rateErr) {
          console.warn(`[channex/sync] Rates skipped for ${prop.name}:`, rateErr instanceof Error ? rateErr.message : rateErr);
        }

        totalBookingsInserted += newCount;
        totalBookingsUpdated += updatedCount;
        totalRates += rateCount;

        perProperty.push({
          property_id: prop.id,
          name: prop.name,
          bookings_new: newCount,
          bookings_updated: updatedCount,
          rates: rateCount,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${prop.name}: ${msg}`);
        perProperty.push({
          property_id: prop.id,
          name: prop.name,
          bookings_new: newCount,
          bookings_updated: updatedCount,
          rates: rateCount,
          error: msg,
        });
      }
    }

    return NextResponse.json({
      message: `Synced ${properties.length} propert${properties.length === 1 ? "y" : "ies"}`,
      synced: properties.length,
      bookings_new: totalBookingsInserted,
      bookings_updated: totalBookingsUpdated,
      rates: totalRates,
      per_property: perProperty,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
