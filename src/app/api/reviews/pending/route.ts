import { NextResponse } from "next/server";
import { db } from "@/lib/db/pooled";
import { bookings, guestReviews, properties } from "@/lib/db/schema";
import { and, eq, lt, inArray, desc } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const today = new Date().toISOString().split("T")[0];

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
          lt(bookings.checkOut, today),
          inArray(bookings.status, ["confirmed", "completed"])
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
          .where(inArray(guestReviews.bookingId, bookingIds))
      : [];

    const reviewedIds = new Set(existingReviews.map((r) => r.booking_id));
    const pendingBookings = allBookings.filter((b) => !reviewedIds.has(b.id));

    // Reviews needing approval — FILTERED by user's properties
    const drafts = await db
      .select({
        id: guestReviews.id,
        booking_id: guestReviews.bookingId,
        property_id: guestReviews.propertyId,
        draft_text: guestReviews.draftText,
        star_rating: guestReviews.starRating,
        status: guestReviews.status,
        is_bad_review: guestReviews.isBadReview,
        created_at: guestReviews.createdAt,
      })
      .from(guestReviews)
      .where(
        and(
          inArray(guestReviews.propertyId, userPropertyIds),
          inArray(guestReviews.status, ["draft_generated", "bad_review_held"])
        )
      )
      .orderBy(desc(guestReviews.createdAt));

    // Incoming reviews needing response — FILTERED by user's properties
    const incoming = await db
      .select({
        id: guestReviews.id,
        booking_id: guestReviews.bookingId,
        property_id: guestReviews.propertyId,
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

    return NextResponse.json({
      needs_review: pendingBookings.length,
      needs_approval: drafts.length,
      needs_response: incoming.length,
      scheduled: scheduled.length,
      pending_bookings: pendingBookings,
      draft_reviews: drafts,
      incoming_reviews: incoming,
      scheduled_reviews: scheduled,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
