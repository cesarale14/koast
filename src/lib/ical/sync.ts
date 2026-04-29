import { eq, and, sql, isNull } from "drizzle-orm";
import { parseICalFeed } from "./parser";
import { icalFeeds, bookings, calendarRates, properties } from "@/lib/db/schema";
import type { ICalBooking } from "./types";
import { backfillCleaningTasks } from "@/lib/turnover/auto-create";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

interface SyncResult {
  feedId: string;
  platform: string;
  newBookings: number;
  updated: number;
  cancelled: number;
  blocked: number;
  error?: string;
  // Non-fatal warnings accumulated during the sync (e.g. cleaning task
  // creation failures). The booking is considered successfully synced
  // even if a warning is present, but the user sees it in the response
  // so they know to investigate.
  warnings?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleDB = any;

export async function syncICalFeeds(
  db: DrizzleDB,
  propertyId: string
): Promise<SyncResult[]> {
  // Fetch active feeds for this property
  const feeds = await db.select().from(icalFeeds)
    .where(and(eq(icalFeeds.propertyId, propertyId), eq(icalFeeds.isActive, true)));

  const results: SyncResult[] = [];

  for (const feed of feeds) {
    try {
      const parsed = await parseICalFeed(feed.feedUrl);
      const result = await syncFeedBookings(db, propertyId, feed, parsed);
      results.push(result);

      // Update feed status
      await db.update(icalFeeds)
        .set({
          lastSynced: new Date(),
          lastError: null,
          syncCount: sql`${icalFeeds.syncCount} + 1`,
        })
        .where(eq(icalFeeds.id, feed.id));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push({
        feedId: feed.id,
        platform: feed.platform,
        newBookings: 0, updated: 0, cancelled: 0, blocked: 0,
        error: errMsg,
      });

      await db.update(icalFeeds)
        .set({ lastError: errMsg })
        .where(eq(icalFeeds.id, feed.id));
    }
  }

  return results;
}

async function syncFeedBookings(
  db: DrizzleDB,
  propertyId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  feed: any,
  parsed: ICalBooking[]
): Promise<SyncResult> {
  const warnings: string[] = [];
  let newCount = 0;
  let updatedCount = 0;
  let cancelledCount = 0;
  let blockedCount = 0;

  const feedUids = new Set<string>();
  // Track every check_in/check_out range that needs an availability push
  // back to Channex at the end of the sync. Bookings added AND cancelled
  // during this sync both go here (with different actions) so overbookings
  // can't slip through when a BDC iCal entry lands but the Channex BDC
  // channel isn't wired up (e.g. the Modern House MFA situation).
  const channexAvailUpdates: Array<{ action: "created" | "cancelled"; checkIn: string; checkOut: string }> = [];

  // TURN-S1a Amendment 1 — wrap the bulk-insert loop in a transaction
  // and SET LOCAL the bypass GUC. The pg_net trigger
  // `bookings_fire_turnover_task` (installed inert by migration 2a;
  // activated by 2b) reads this GUC and skips the http_post when it's
  // 'true'. This prevents thundering-herd against Vercel on a fresh
  // host's first iCal import (potentially dozens of bookings inserted
  // back-to-back). After the loop completes, we call
  // backfillCleaningTasks once to create any missing tasks.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.transaction(async (tx: any) => {
    await tx.execute(sql`SET LOCAL app.skip_turnover_trigger = 'true'`);
  for (const entry of parsed) {
    feedUids.add(entry.uid);

    if (entry.isBlocked) {
      // Mark dates as unavailable in calendar_rates
      const ci = new Date(entry.checkIn);
      const co = new Date(entry.checkOut);
      for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        const existing = await tx.select({ id: calendarRates.id })
          .from(calendarRates)
          .where(and(eq(calendarRates.propertyId, propertyId), eq(calendarRates.date, dateStr), isNull(calendarRates.channelCode)))
          .limit(1);

        if (existing.length > 0) {
          await tx.update(calendarRates)
            .set({ isAvailable: false })
            .where(eq(calendarRates.id, existing[0].id));
        } else {
          await tx.insert(calendarRates).values({
            propertyId, date: dateStr, isAvailable: false, rateSource: "ical",
          });
        }
      }
      blockedCount++;
      continue;
    }

    // Check if booking exists by platformBookingId (uid)
    const existing = await tx.select({ id: bookings.id, checkIn: bookings.checkIn, checkOut: bookings.checkOut })
      .from(bookings)
      .where(and(eq(bookings.propertyId, propertyId), eq(bookings.platformBookingId, entry.uid)))
      .limit(1);

    if (existing.length > 0) {
      // Update if dates changed
      if (existing[0].checkIn !== entry.checkIn || existing[0].checkOut !== entry.checkOut) {
        await tx.update(bookings)
          .set({
            checkIn: entry.checkIn,
            checkOut: entry.checkOut,
            guestName: entry.guestName,
          })
          .where(eq(bookings.id, existing[0].id));
        updatedCount++;
      }
    } else {
      // Cross-source dedup: the iCal UID didn't match anything, but a
      // Channex-sourced row with the same dates may already exist (webhook
      // inserted it without an iCal UID). We want to PROMOTE that row by
      // stamping in the iCal UID rather than either skipping silently or
      // creating a duplicate.
      //
      // CRITICAL: only consider rows with platform_booking_id IS NULL as
      // candidates. A row with a different non-null platform_booking_id is
      // a distinct legitimate booking (e.g. two real reservations that
      // happen to share dates) and must not be deduped.
      const dupCheck = await tx.select({ id: bookings.id, platformBookingId: bookings.platformBookingId })
        .from(bookings)
        .where(and(
          eq(bookings.propertyId, propertyId),
          eq(bookings.checkIn, entry.checkIn),
          eq(bookings.checkOut, entry.checkOut),
          eq(bookings.platform, entry.platform),
          sql`${bookings.status} != 'cancelled'`,
          sql`${bookings.platformBookingId} IS NULL`,
        ))
        .limit(1);

      if (dupCheck.length > 0) {
        await tx.update(bookings)
          .set({ platformBookingId: entry.uid, guestName: entry.guestName })
          .where(eq(bookings.id, dupCheck[0].id));
        console.log(`[iCal] Promoted Channex-sourced row ${dupCheck[0].id} with iCal UID ${entry.uid}`);
        updatedCount++;
        continue;
      }

      // Insert new booking
      await tx.insert(bookings).values({
        propertyId,
        platform: entry.platform,
        platformBookingId: entry.uid,
        guestName: entry.guestName,
        checkIn: entry.checkIn,
        checkOut: entry.checkOut,
        status: "confirmed",
        notes: entry.description,
      });
      newCount++;
      channexAvailUpdates.push({ action: "created", checkIn: entry.checkIn, checkOut: entry.checkOut });
      // TURN-S1a — cleaning_task creation moved to the bookings
      // pg_net trigger (`bookings_fire_turnover_task`). The trigger's
      // GUC bypass (set above) means no per-row http_post fires
      // during this iCal sweep. The end-of-sweep
      // backfillCleaningTasks call below catches up.
    }
  }
  });  // end db.transaction

  // TURN-S1a — end-of-sweep cleaning_task creation. Replaces the
  // per-booking inline createCleaningTask calls that previously lived
  // inside the for-loop. Scoped to the current property only.
  try {
    const svc = createServiceClient();
    const { data: propRow } = await svc.from("properties").select("user_id").eq("id", propertyId).limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = ((propRow ?? []) as any[])[0]?.user_id ?? undefined;
    if (userId) await backfillCleaningTasks(svc, userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`cleaning_task backfill failed: ${msg}`);
    console.warn(`[iCal] backfillCleaningTasks failed for ${propertyId}: ${msg}`);
  }

  // Cancel bookings no longer in feed. We cancel BOTH iCal-originated rows
  // AND Channex-linked rows when their UID has disappeared from the feed —
  // if the OTA removed the booking from its iCal, it's gone regardless of
  // who originally created the DB row. Previously we skipped rows with
  // channex_booking_id here, which left ghost bookings live in Moora after
  // an Airbnb/VRBO cancellation that wasn't picked up by the Channex
  // webhook (e.g. Channex channel not yet active).
  // Cancellation pass: any iCal-source row with a platform_booking_id
  // not currently in the iCal feed gets cancelled. Two guards prevent
  // over-cancellation (mirror of booking_sync.py:497-520):
  //   1. source='ical' — Channex-canonical rows (source='channex')
  //      are excluded; their truth lives in /bookings, not iCal.
  //   2. channex_booking_id IS NULL — defensive second filter catching
  //      pre-canonical-helper rows where source='ical' but the booking
  //      is also tracked in Channex (legacy insert lineage). source='ical'
  //      alone is insufficient because pre-2026-04-25 rows were inserted
  //      via paths that defaulted source to 'ical' even when Channex was
  //      tracking them. (Diagnosed 2026-04-29 in 6.8a; Briana/Nadia/Kathy/
  //      Venus were the worked examples.)
  // Together: only iCal-only-managed rows are eligible for cancellation.
  // Worker-side fix shipped in koast-workers commit 177bb08 (Session 6.8b);
  // this is the TS-side parity for /api/ical/sync/[propertyId] (Session 6.8c).
  const existingBookings = await db.select({
    id: bookings.id,
    platformBookingId: bookings.platformBookingId,
    channexBookingId: bookings.channexBookingId,
    checkIn: bookings.checkIn,
    checkOut: bookings.checkOut,
  })
    .from(bookings)
    .where(and(
      eq(bookings.propertyId, propertyId),
      eq(bookings.platform, feed.platform),
      eq(bookings.source, "ical"),
      isNull(bookings.channexBookingId),
      eq(bookings.status, "confirmed")
    ));

  for (const b of existingBookings) {
    if (!b.platformBookingId) continue;
    if (feedUids.has(b.platformBookingId)) continue;
    // Booking's UID is no longer in the feed → cancel it. Track the
    // cancellation so the availability unblock can go out to Channex
    // along with this sync's new-booking pushes.
    await db.update(bookings)
      .set({ status: "cancelled" })
      .where(eq(bookings.id, b.id));
    cancelledCount++;

    if (b.checkIn && b.checkOut) {
      channexAvailUpdates.push({ action: "cancelled", checkIn: b.checkIn, checkOut: b.checkOut });
    }

    if (b.channexBookingId && b.checkIn && b.checkOut) {
      const start = new Date(b.checkIn + "T00:00:00Z");
      const end = new Date(b.checkOut + "T00:00:00Z");
      for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
        const ds = d.toISOString().split("T")[0];
        const existing = await db
          .select({ id: calendarRates.id })
          .from(calendarRates)
          .where(and(
            eq(calendarRates.propertyId, propertyId),
            eq(calendarRates.date, ds),
            isNull(calendarRates.channelCode),
          ))
          .limit(1);
        if (existing.length > 0) {
          await db.update(calendarRates)
            .set({ isAvailable: true })
            .where(eq(calendarRates.id, existing[0].id));
        }
      }
    }
  }

  // Push the aggregated availability updates to Channex so OTHER connected
  // channels (Airbnb, Vrbo) block the booked dates automatically. This is
  // the critical path: without it, an iCal booking (e.g. a BDC reservation
  // that arrived via iCal because the BDC channel isn't connected to
  // Channex yet) would never block the sibling OTAs and overbookings
  // would happen.
  if (channexAvailUpdates.length > 0) {
    try {
      const [prop] = await db.select({
        channexPropertyId: properties.channexPropertyId,
      }).from(properties).where(eq(properties.id, propertyId)).limit(1);

      if (prop?.channexPropertyId) {
        const channex = createChannexClient();
        const roomTypes = await channex.getRoomTypes(prop.channexPropertyId);
        if (roomTypes.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const availValues: any[] = [];
          for (const u of channexAvailUpdates) {
            const avail = u.action === "created" ? 0 : 1;
            const start = new Date(u.checkIn + "T00:00:00Z");
            const end = new Date(u.checkOut + "T00:00:00Z");
            for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
              const ds = d.toISOString().split("T")[0];
              for (const rt of roomTypes) {
                availValues.push({
                  property_id: prop.channexPropertyId,
                  room_type_id: rt.id,
                  date_from: ds,
                  date_to: ds,
                  availability: avail,
                });
              }
            }
          }
          for (let i = 0; i < availValues.length; i += 200) {
            await channex.updateAvailability(availValues.slice(i, i + 200));
          }
          console.log(`[iCal] Pushed ${availValues.length} availability entries to Channex for property ${propertyId}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`channex availability push failed: ${msg}`);
      console.warn(`[iCal] Channex availability push failed for ${propertyId}: ${msg}`);
    }
  }

  return {
    feedId: feed.id,
    platform: feed.platform,
    newBookings: newCount,
    updated: updatedCount,
    cancelled: cancelledCount,
    blocked: blockedCount,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
