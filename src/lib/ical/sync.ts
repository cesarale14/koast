import { eq, and, sql } from "drizzle-orm";
import { parseICalFeed } from "./parser";
import { icalFeeds, bookings, calendarRates } from "@/lib/db/schema";
import type { ICalBooking } from "./types";
import { createCleaningTask } from "@/lib/turnover/auto-create";
import { createServiceClient } from "@/lib/supabase/service";

interface SyncResult {
  feedId: string;
  platform: string;
  newBookings: number;
  updated: number;
  cancelled: number;
  blocked: number;
  error?: string;
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
  let newCount = 0;
  let updatedCount = 0;
  let cancelledCount = 0;
  let blockedCount = 0;

  const feedUids = new Set<string>();

  for (const entry of parsed) {
    feedUids.add(entry.uid);

    if (entry.isBlocked) {
      // Mark dates as unavailable in calendar_rates
      const ci = new Date(entry.checkIn);
      const co = new Date(entry.checkOut);
      for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        const existing = await db.select({ id: calendarRates.id })
          .from(calendarRates)
          .where(and(eq(calendarRates.propertyId, propertyId), eq(calendarRates.date, dateStr)))
          .limit(1);

        if (existing.length > 0) {
          await db.update(calendarRates)
            .set({ isAvailable: false })
            .where(eq(calendarRates.id, existing[0].id));
        } else {
          await db.insert(calendarRates).values({
            propertyId, date: dateStr, isAvailable: false, rateSource: "ical",
          });
        }
      }
      blockedCount++;
      continue;
    }

    // Check if booking exists by platformBookingId (uid)
    const existing = await db.select({ id: bookings.id, checkIn: bookings.checkIn, checkOut: bookings.checkOut })
      .from(bookings)
      .where(and(eq(bookings.propertyId, propertyId), eq(bookings.platformBookingId, entry.uid)))
      .limit(1);

    if (existing.length > 0) {
      // Update if dates changed
      if (existing[0].checkIn !== entry.checkIn || existing[0].checkOut !== entry.checkOut) {
        await db.update(bookings)
          .set({
            checkIn: entry.checkIn,
            checkOut: entry.checkOut,
            guestName: entry.guestName,
          })
          .where(eq(bookings.id, existing[0].id));
        updatedCount++;
      }
    } else {
      // Dedup: check if a booking already exists for same property + dates + platform
      // (e.g. from Channex webhook) to avoid duplicates between iCal and Channex
      const dupCheck = await db.select({ id: bookings.id })
        .from(bookings)
        .where(and(
          eq(bookings.propertyId, propertyId),
          eq(bookings.checkIn, entry.checkIn),
          eq(bookings.checkOut, entry.checkOut),
          eq(bookings.platform, entry.platform),
          sql`${bookings.status} != 'cancelled'`
        ))
        .limit(1);

      if (dupCheck.length > 0) {
        console.log(`[iCal] Skipping duplicate: booking already exists for ${propertyId} ${entry.checkIn}-${entry.checkOut} (${entry.platform})`);
        continue;
      }

      // Insert new booking
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
      newCount++;

      // Auto-create cleaning task for new booking
      const supabase = createServiceClient();
      const [inserted] = await db.select({ id: bookings.id }).from(bookings)
        .where(and(eq(bookings.propertyId, propertyId), eq(bookings.platformBookingId, entry.uid)))
        .limit(1);
      if (inserted) {
        await createCleaningTask(supabase, {
          id: inserted.id,
          property_id: propertyId,
          check_out: entry.checkOut,
        });
      }
    }
  }

  // Cancel bookings no longer in feed (only iCal-originated bookings for this platform)
  // Skip bookings with channex_booking_id — those are managed by Channex, not iCal
  const existingBookings = await db.select({
    id: bookings.id,
    platformBookingId: bookings.platformBookingId,
    channexBookingId: bookings.channexBookingId,
  })
    .from(bookings)
    .where(and(
      eq(bookings.propertyId, propertyId),
      eq(bookings.platform, feed.platform),
      eq(bookings.status, "confirmed")
    ));

  for (const b of existingBookings) {
    // Only cancel iCal-originated bookings (no channex_booking_id) that disappeared from the feed
    if (b.platformBookingId && !feedUids.has(b.platformBookingId) && !b.channexBookingId) {
      await db.update(bookings)
        .set({ status: "cancelled" })
        .where(eq(bookings.id, b.id));
      cancelledCount++;
    }
  }

  return {
    feedId: feed.id,
    platform: feed.platform,
    newBookings: newCount,
    updated: updatedCount,
    cancelled: cancelledCount,
    blocked: blockedCount,
  };
}
