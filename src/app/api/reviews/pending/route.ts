import { NextResponse } from "next/server";
import { db } from "@/lib/db/pooled";
import { bookings, guestReviews, properties } from "@/lib/db/schema";
import { and, eq, ne, lt, gte, inArray, desc } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Include checkouts up to 3 days in the future (hosts can pre-write reviews)
    const futureWindow = new Date();
    futureWindow.setDate(futureWindow.getDate() + 3);
    const maxDate = futureWindow.toISOString().split("T")[0];

    // Airbnb allows reviews up to 14 days after checkout
    const reviewWindowStart = new Date();
    reviewWindowStart.setDate(reviewWindowStart.getDate() - 14);
    const reviewCutoff = reviewWindowStart.toISOString().split("T")[0];

    // Get all property IDs owned by this user
    const userProperties = await db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.userId, user.id));

    const userPropertyIds = userProperties.map((p) => p.id);

    if (userPropertyIds.length === 0) {
      return NextResponse.json({
        needs_review: 0,
        needs_approval: 0,
        needs_response: 0,
        scheduled: 0,
        pending_bookings: [],
        draft_reviews: [],
        incoming_reviews: [],
        scheduled_reviews: [],
      });
    }

    // Bookings needing outgoing reviews (checked out, no review exists)
    // FILTERED by user's properties
    // Keys use snake_case to match frontend expectations
    const allBookings = await db
      .select({
        id: bookings.id,
        property_id: bookings.propertyId,
        guest_name: bookings.guestName,
        check_in: bookings.checkIn,
        check_out: bookings.checkOut,
        platform: bookings.platform,
      })
      .from(bookings)
      .where(
        and(
          inArray(bookings.propertyId, userPropertyIds),
          lt(bookings.checkOut, maxDate),
          gte(bookings.checkOut, reviewCutoff),
          ne(bookings.status, "cancelled")
        )
      )
      .orderBy(desc(bookings.checkOut))
      .limit(50);

    // Get existing reviews to filter out
    const bookingIds = allBookings.map((b) => b.id);

    const existingReviews = bookingIds.length > 0
      ? await db
          .select({ booking_id: guestReviews.bookingId })
          .from(guestReviews)
          .where(
            and(
              inArray(guestReviews.bookingId, bookingIds),
              eq(guestReviews.direction, "outgoing")
            )
          )
      : [];

    const reviewedIds = new Set(existingReviews.map((r) => r.booking_id));
    const pendingBookings = allBookings.filter((b) => !reviewedIds.has(b.id));

    // Reviews needing approval — FILTERED by user's properties
    // Session 6.1a: added direction='outgoing' filter to stop incoming
    // rows (status=pending after Channex sync) from leaking into the
    // Outgoing/Drafts bucket.
    const drafts = await db
      .select({
        id: guestReviews.id,
        booking_id: guestReviews.bookingId,
        property_id: guestReviews.propertyId,
        draft_text: guestReviews.draftText,
        star_rating: guestReviews.starRating,
        status: guestReviews.status,
        is_bad_review: guestReviews.isBadReview,
        guest_name: guestReviews.guestName,
        created_at: guestReviews.createdAt,
      })
      .from(guestReviews)
      .where(
        and(
          inArray(guestReviews.propertyId, userPropertyIds),
          eq(guestReviews.direction, "outgoing"),
          inArray(guestReviews.status, ["pending", "draft_generated", "bad_review_held"])
        )
      )
      .orderBy(desc(guestReviews.createdAt));

    // Incoming reviews needing response — FILTERED by user's properties
    const incoming = await db
      .select({
        id: guestReviews.id,
        booking_id: guestReviews.bookingId,
        property_id: guestReviews.propertyId,
        guest_name: guestReviews.guestName,
        incoming_text: guestReviews.incomingText,
        incoming_rating: guestReviews.incomingRating,
        incoming_date: guestReviews.incomingDate,
        response_draft: guestReviews.responseDraft,
        response_sent: guestReviews.responseSent,
        status: guestReviews.status,
      })
      .from(guestReviews)
      .where(
        and(
          inArray(guestReviews.propertyId, userPropertyIds),
          eq(guestReviews.direction, "incoming"),
          eq(guestReviews.responseSent, false)
        )
      )
      .orderBy(desc(guestReviews.incomingDate));

    // Scheduled reviews — FILTERED by user's properties
    const scheduled = await db
      .select({
        id: guestReviews.id,
        booking_id: guestReviews.bookingId,
        property_id: guestReviews.propertyId,
        final_text: guestReviews.finalText,
        scheduled_publish_at: guestReviews.scheduledPublishAt,
        status: guestReviews.status,
      })
      .from(guestReviews)
      .where(
        and(
          inArray(guestReviews.propertyId, userPropertyIds),
          eq(guestReviews.status, "scheduled")
        )
      )
      .orderBy(guestReviews.scheduledPublishAt);

    // Enrich drafts with property and booking context
    const draftBookingIds = drafts.map((d) => d.booking_id).filter(Boolean) as string[];
    const draftPropertyIds = drafts.map((d) => d.property_id).filter(Boolean) as string[];

    const draftBookings = draftBookingIds.length > 0
      ? await db.select({
          id: bookings.id,
          guest_name: bookings.guestName,
          check_in: bookings.checkIn,
          check_out: bookings.checkOut,
          platform: bookings.platform,
        }).from(bookings).where(inArray(bookings.id, draftBookingIds))
      : [];

    const draftProperties = draftPropertyIds.length > 0
      ? await db.select({
          id: properties.id,
          name: properties.name,
          cover_photo_url: properties.coverPhotoUrl,
        }).from(properties).where(inArray(properties.id, draftPropertyIds))
      : [];

    const bookingLookup = new Map(draftBookings.map((b) => [b.id, b]));
    const propLookup = new Map(draftProperties.map((p) => [p.id, p]));

    const enrichedDrafts = drafts.map((d) => {
      const bk = d.booking_id ? bookingLookup.get(d.booking_id) : null;
      const pr = d.property_id ? propLookup.get(d.property_id) : null;
      return {
        ...d,
        guest_name: d.guest_name ?? bk?.guest_name ?? null,
        check_in: bk?.check_in ?? null,
        check_out: bk?.check_out ?? null,
        platform: bk?.platform ?? "airbnb",
        property_name: pr?.name ?? "Property",
        property_photo: pr?.cover_photo_url ?? null,
      };
    });

    return NextResponse.json({
      needs_review: pendingBookings.length,
      needs_approval: enrichedDrafts.length,
      needs_response: incoming.length,
      scheduled: scheduled.length,
      pending_bookings: pendingBookings,
      draft_reviews: enrichedDrafts,
      incoming_reviews: incoming,
      scheduled_reviews: scheduled,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
