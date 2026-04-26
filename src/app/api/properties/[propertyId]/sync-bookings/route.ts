import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import { createServiceClient } from "@/lib/supabase/service";
import { db } from "@/lib/db/pooled";
import { icalFeeds, bookings } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { parseICalFeed } from "@/lib/ical/parser";
import {
  getAuthenticatedUser,
  verifyPropertyOwnership,
  verifyServiceKey,
} from "@/lib/auth/api-auth";

/**
 * Maps Channex ota_name to our normalized platform string.
 */
function mapOtaName(otaName: string | undefined): string {
  if (!otaName) return "direct";
  const lower = otaName.toLowerCase();
  if (lower.includes("airbnb")) return "airbnb";
  if (lower.includes("booking")) return "booking_com";
  if (lower.includes("vrbo") || lower.includes("homeaway")) return "vrbo";
  if (lower.includes("expedia")) return "vrbo";
  return "direct";
}

export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    // Auth: service key OR session-based user auth
    if (verifyServiceKey(request)) {
      // Service key valid — skip user auth
    } else {
      const { user } = await getAuthenticatedUser();
      if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
      if (!isOwner)
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const propertyId = params.propertyId;

    // Get property's channex_property_id
    const supabase = createServiceClient();
    const { data: propData } = await supabase
      .from("properties")
      .select("id, name, channex_property_id")
      .eq("id", propertyId)
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const property = ((propData ?? []) as any[])[0];
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    let channexCount = 0;
    let icalCount = 0;
    let newImported = 0;
    const updated = 0;

    // ===================== Source A: Channex API =====================
    const channexPropId = property.channex_property_id;
    if (channexPropId) {
      try {
        const channex = createChannexClient();
        let page = 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allBookings: any[] = [];
        while (true) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res = await channex.request<any>(
            `/bookings?filter[property_id]=${channexPropId}&pagination[page]=${page}&pagination[limit]=100`
          );
          allBookings.push(...(res.data ?? []));
          if (!res.meta || allBookings.length >= res.meta.total) break;
          page++;
        }

        channexCount = allBookings.length;
        console.log(
          `[sync-bookings] Channex returned ${channexCount} bookings for property ${propertyId}`
        );

        for (const booking of allBookings) {
          const attrs = booking.attributes ?? {};
          const customer = attrs.customer ?? {};

          const guestName = [customer.name, customer.surname]
            .filter(Boolean)
            .join(" ");

          const bookingData = {
            property_id: propertyId,
            platform: mapOtaName(attrs.ota_name),
            channex_booking_id: booking.id,
            guest_name: guestName || null,
            guest_email: customer.mail || null,
            guest_phone: customer.phone || null,
            check_in: attrs.arrival_date,
            check_out: attrs.departure_date,
            total_price: attrs.amount ? parseFloat(attrs.amount) : null,
            currency: attrs.currency || "USD",
            status:
              attrs.status === "cancelled" ? "cancelled" : "confirmed",
            platform_booking_id: attrs.ota_reservation_code || null,
            // RDX-3 — populate the dedicated column so reviews-sync can
            // join via ota_reservation_code rather than the legacy
            // platform_booking_id key (which is iCal email-UID for
            // iCal-sourced rows and HM-code for Channex-sourced —
            // unjoinable without disambiguation).
            ota_reservation_code: attrs.ota_reservation_code || null,
            notes: attrs.notes || null,
          };

          if (!bookingData.check_in || !bookingData.check_out) {
            console.warn(
              `[sync-bookings] Skipping Channex booking ${booking.id} — missing dates`
            );
            continue;
          }

          // Upsert by channex_booking_id using Supabase (which supports onConflict)
          const { data: upserted, error: upsertErr } = await supabase
            .from("bookings")
            .upsert(bookingData, { onConflict: "channex_booking_id" })
            .select("id");

          if (upsertErr) {
            console.error(
              `[sync-bookings] Upsert error for Channex booking ${booking.id}:`,
              upsertErr.message
            );
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rows = (upserted ?? []) as any[];
            if (rows.length > 0) {
              // We can't easily tell insert vs update from upsert,
              // but we count the channex total separately
            }
          }
        }
      } catch (err) {
        console.error(
          "[sync-bookings] Channex sync error:",
          err instanceof Error ? err.message : String(err)
        );
        // Continue to iCal sync even if Channex fails
      }
    }

    // ===================== Source B: iCal Feeds =====================
    try {
      const feeds = await db
        .select()
        .from(icalFeeds)
        .where(
          and(
            eq(icalFeeds.propertyId, propertyId),
            eq(icalFeeds.isActive, true)
          )
        );

      for (const feed of feeds) {
        try {
          const parsed = await parseICalFeed(feed.feedUrl);
          const realBookings = parsed.filter((b) => !b.isBlocked);
          icalCount += realBookings.length;

          for (const entry of realBookings) {
            // Dedup: check property_id + check_in + check_out + platform
            const [existing] = await db
              .select({ id: bookings.id })
              .from(bookings)
              .where(
                and(
                  eq(bookings.propertyId, propertyId),
                  eq(bookings.checkIn, entry.checkIn),
                  eq(bookings.checkOut, entry.checkOut),
                  eq(bookings.platform, entry.platform),
                  sql`${bookings.status} != 'cancelled'`
                )
              )
              .limit(1);

            if (existing) {
              // Already exists (from Channex or previous iCal sync)
              continue;
            }

            // Also check by platformBookingId (uid)
            const [existingByUid] = await db
              .select({ id: bookings.id })
              .from(bookings)
              .where(
                and(
                  eq(bookings.propertyId, propertyId),
                  eq(bookings.platformBookingId, entry.uid)
                )
              )
              .limit(1);

            if (existingByUid) {
              continue;
            }

            // Insert new booking from iCal
            await db.insert(bookings).values({
              propertyId,
              platform: entry.platform,
              platformBookingId: entry.uid,
              guestName: entry.guestName,
              checkIn: entry.checkIn,
              checkOut: entry.checkOut,
              status: "confirmed",
              notes: entry.description,
            });
            newImported++;
          }

          // Update feed sync status
          await db
            .update(icalFeeds)
            .set({
              lastSynced: new Date(),
              lastError: null,
              syncCount: sql`${icalFeeds.syncCount} + 1`,
            })
            .where(eq(icalFeeds.id, feed.id));
        } catch (feedErr) {
          const errMsg =
            feedErr instanceof Error ? feedErr.message : String(feedErr);
          console.error(
            `[sync-bookings] iCal feed ${feed.id} error:`,
            errMsg
          );
          await db
            .update(icalFeeds)
            .set({ lastError: errMsg })
            .where(eq(icalFeeds.id, feed.id));
        }
      }
    } catch (err) {
      console.error(
        "[sync-bookings] iCal sync error:",
        err instanceof Error ? err.message : String(err)
      );
    }

    // Count total bookings for this property
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookings)
      .where(
        and(
          eq(bookings.propertyId, propertyId),
          sql`${bookings.status} != 'cancelled'`
        )
      );
    const total = Number(totalResult[0]?.count ?? 0);

    return NextResponse.json({
      property: property.name,
      channex_count: channexCount,
      ical_count: icalCount,
      new_imported: newImported,
      updated,
      total,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[sync-bookings] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
