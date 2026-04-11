import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

function detectPlatform(otaName: string | null | undefined, uniqueId: string | null | undefined): string {
  // Prefer the unique_id prefix — it's the most reliable source signal
  // (BDC-xxx for Booking.com, ABB-xxx for Airbnb).
  const uid = (uniqueId ?? "").toUpperCase();
  if (uid.startsWith("BDC-")) return "booking_com";
  if (uid.startsWith("ABB-")) return "airbnb";
  if (uid.startsWith("VRBO-") || uid.startsWith("HA-")) return "vrbo";

  const n = (otaName ?? "").toLowerCase();
  if (n.includes("airbnb")) return "airbnb";
  if (n.includes("vrbo") || n.includes("homeaway")) return "vrbo";
  if (n.includes("booking")) return "booking_com";
  return "direct";
}

/**
 * GET /api/channex/sync-bookings
 *
 * Pulls every booking for the authenticated user's Channex-mapped properties
 * from the Channex API and upserts them into the bookings table. Skips
 * cancelled bookings per the task spec. Returns per-property counts.
 */
export async function GET() {
  try {
    const auth = createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const channex = createChannexClient();

    const { data: propData } = await supabase
      .from("properties")
      .select("id, name, channex_property_id")
      .eq("user_id", user.id)
      .not("channex_property_id", "is", null);
    const properties = (propData ?? []) as { id: string; name: string; channex_property_id: string }[];

    if (properties.length === 0) {
      return NextResponse.json({
        message: "No Channex-mapped properties for this user",
        synced_count: 0,
        properties: [],
      });
    }

    let totalSynced = 0;
    let totalSkippedCancelled = 0;
    const perProperty: {
      property_id: string;
      name: string;
      fetched: number;
      inserted: number;
      updated: number;
      skipped_cancelled: number;
      error?: string;
    }[] = [];

    for (const prop of properties) {
      let fetched = 0;
      let inserted = 0;
      let updated = 0;
      let skippedCancelled = 0;
      try {
        const bookings = await channex.getBookings({ propertyId: prop.channex_property_id });
        fetched = bookings.length;

        for (const b of bookings) {
          const ba = b.attributes;

          if (ba.status === "cancelled") {
            skippedCancelled++;
            continue;
          }

          const guestName = ba.customer
            ? [ba.customer.name, ba.customer.surname].filter(Boolean).join(" ")
            : null;

          const platform = detectPlatform(
            ba.ota_name,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (ba as any).unique_id ?? ba.ota_reservation_code
          );

          const bookingRecord = {
            property_id: prop.id,
            platform,
            channex_booking_id: b.id,
            guest_name: guestName,
            guest_email: ba.customer?.mail || null,
            guest_phone: ba.customer?.phone || null,
            check_in: ba.arrival_date,
            check_out: ba.departure_date,
            total_price: ba.amount ? parseFloat(ba.amount) : null,
            currency: ba.currency || "USD",
            status: "confirmed",
            platform_booking_id: ba.ota_reservation_code || null,
            notes: ba.notes || null,
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bookTable = supabase.from("bookings") as any;
          const { data: existing } = await bookTable
            .select("id")
            .eq("channex_booking_id", b.id)
            .limit(1);

          if (existing && existing.length > 0) {
            const { error } = await bookTable.update(bookingRecord).eq("id", existing[0].id);
            if (error) {
              console.error(`[sync-bookings] update ${b.id}:`, error.message);
            } else {
              updated++;
              totalSynced++;
            }
          } else {
            const { error } = await bookTable.insert(bookingRecord);
            if (error) {
              console.error(`[sync-bookings] insert ${b.id}:`, error.message);
            } else {
              inserted++;
              totalSynced++;
            }
          }
        }

        totalSkippedCancelled += skippedCancelled;
        perProperty.push({
          property_id: prop.id,
          name: prop.name,
          fetched,
          inserted,
          updated,
          skipped_cancelled: skippedCancelled,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[sync-bookings] ${prop.name}: ${msg}`);
        perProperty.push({
          property_id: prop.id,
          name: prop.name,
          fetched,
          inserted,
          updated,
          skipped_cancelled: skippedCancelled,
          error: msg,
        });
      }
    }

    return NextResponse.json({
      message: `Synced ${totalSynced} booking${totalSynced === 1 ? "" : "s"} from Channex`,
      synced_count: totalSynced,
      skipped_cancelled: totalSkippedCancelled,
      properties: perProperty,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    console.error("[sync-bookings] top-level:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
