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

export interface SyncResult {
  message: string;
  checked: number;      // total bookings pulled from Channex
  inserted: number;     // new rows in bookings
  updated: number;      // existing rows whose fields changed (includes cancellations)
  cancelled: number;    // rows flipped to cancelled during this run
  synced_count: number; // inserted + updated (back-compat with previous UI)
  synced_at: string;    // ISO timestamp
  properties: PerProperty[];
  errors?: string[];
}

interface PerProperty {
  property_id: string;
  name: string;
  fetched: number;
  inserted: number;
  updated: number;
  cancelled: number;
  error?: string;
}

/**
 * GET /api/channex/sync-bookings
 *
 * Pulls every booking for the authed user's Channex-mapped properties
 * and upserts them into the bookings table. Cancellations on the
 * Channex side flip the local row's status to "cancelled" — they no
 * longer get skipped. Returns per-property counts and a timestamp for
 * the UI to display.
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
      const empty: SyncResult = {
        message: "No Channex-mapped properties for this user",
        checked: 0,
        inserted: 0,
        updated: 0,
        cancelled: 0,
        synced_count: 0,
        synced_at: new Date().toISOString(),
        properties: [],
      };
      return NextResponse.json(empty);
    }

    let totalChecked = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalCancelled = 0;
    const perProperty: PerProperty[] = [];
    const errors: string[] = [];

    for (const prop of properties) {
      let fetched = 0;
      let inserted = 0;
      let updated = 0;
      let cancelled = 0;
      try {
        const bookings = await channex.getBookings({ propertyId: prop.channex_property_id });
        fetched = bookings.length;
        totalChecked += fetched;

        for (const b of bookings) {
          const ba = b.attributes;
          const guestName = ba.customer
            ? [ba.customer.name, ba.customer.surname].filter(Boolean).join(" ")
            : null;

          const platform = detectPlatform(
            ba.ota_name,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (ba as any).unique_id ?? ba.ota_reservation_code
          );

          const isCancelled = ba.status === "cancelled";

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
            status: isCancelled ? "cancelled" : "confirmed",
            platform_booking_id: ba.ota_reservation_code || null,
            notes: ba.notes || null,
            updated_at: new Date().toISOString(),
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bookTable = supabase.from("bookings") as any;
          const { data: existing } = await bookTable
            .select("id, status")
            .eq("channex_booking_id", b.id)
            .limit(1);

          if (existing && existing.length > 0) {
            const wasConfirmed = existing[0].status === "confirmed";
            const { error } = await bookTable.update(bookingRecord).eq("id", existing[0].id);
            if (error) {
              console.error(`[sync-bookings] update ${b.id}:`, error.message);
            } else {
              updated++;
              if (isCancelled && wasConfirmed) cancelled++;
            }
          } else if (!isCancelled) {
            // Dedup against iCal placeholder rows. Channex and the Airbnb
            // iCal feed both report the same reservation: Channex via the
            // real API, iCal as a "blocked" Airbnb Guest entry. Before
            // inserting a fresh Channex row, check for an overlapping
            // placeholder (no channex_booking_id) and either promote it
            // in-place (exact match) or cancel it (inexact overlap).
            const { data: exact } = await bookTable
              .select("id")
              .eq("property_id", prop.id)
              .eq("check_in", ba.arrival_date)
              .eq("check_out", ba.departure_date)
              .is("channex_booking_id", null)
              .eq("status", "confirmed")
              .limit(1);

            if (exact && exact.length > 0) {
              const { error } = await bookTable.update(bookingRecord).eq("id", exact[0].id);
              if (error) {
                console.error(`[sync-bookings] promote iCal ${exact[0].id}:`, error.message);
              } else {
                updated++;
              }
            } else {
              // Look for overlapping placeholder rows (iCal) and cancel
              // them — they're stale references to the same underlying
              // reservation from a different OTA.
              const { data: placeholders } = await bookTable
                .select("id")
                .eq("property_id", prop.id)
                .lt("check_in", ba.departure_date)
                .gt("check_out", ba.arrival_date)
                .is("channex_booking_id", null)
                .eq("status", "confirmed");
              if (placeholders && placeholders.length > 0) {
                for (const p of placeholders) {
                  await bookTable
                    .update({
                      status: "cancelled",
                      notes: `[auto] superseded by Channex booking ${b.id}`,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", p.id);
                }
              }

              const { error } = await bookTable.insert(bookingRecord);
              if (error) {
                console.error(`[sync-bookings] insert ${b.id}:`, error.message);
              } else {
                inserted++;
              }
            }
          }
        }

        totalInserted += inserted;
        totalUpdated += updated;
        totalCancelled += cancelled;
        perProperty.push({
          property_id: prop.id,
          name: prop.name,
          fetched,
          inserted,
          updated,
          cancelled,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${prop.name}: ${msg}`);
        console.error(`[sync-bookings] ${prop.name}: ${msg}`);
        perProperty.push({
          property_id: prop.id,
          name: prop.name,
          fetched,
          inserted,
          updated,
          cancelled,
          error: msg,
        });
      }
    }

    const result: SyncResult = {
      message: `${totalChecked} booking${totalChecked === 1 ? "" : "s"} checked, ${totalInserted} new, ${totalUpdated} updated${totalCancelled > 0 ? `, ${totalCancelled} cancelled` : ""}`,
      checked: totalChecked,
      inserted: totalInserted,
      updated: totalUpdated,
      cancelled: totalCancelled,
      synced_count: totalInserted + totalUpdated,
      synced_at: new Date().toISOString(),
      properties: perProperty,
      errors: errors.length > 0 ? errors : undefined,
    };
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    console.error("[sync-bookings] top-level:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
