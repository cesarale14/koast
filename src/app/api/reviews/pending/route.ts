import { NextResponse } from "next/server";
import { db } from "@/lib/db/pooled";
import { bookings, guestReviews } from "@/lib/db/schema";
import { and, eq, lt, inArray, desc } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const today = new Date().toISOString().split("T")[0];

    // Bookings needing outgoing reviews (checked out, no review exists)
    const allBookings = await db
      .select({
        id: bookings.id,
        propertyId: bookings.propertyId,
        guestName: bookings.guestName,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
        platform: bookings.platform,
      })
      .from(bookings)
      .where(
        and(
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
          .select({ bookingId: guestReviews.bookingId })
          .from(guestReviews)
          .where(inArray(guestReviews.bookingId, bookingIds))
      : [];

    const reviewedIds = new Set(existingReviews.map((r) => r.bookingId));
    const pendingBookings = allBookings.filter((b) => !reviewedIds.has(b.id));

    // Reviews needing approval
    const drafts = await db
      .select({
        id: guestReviews.id,
        bookingId: guestReviews.bookingId,
        propertyId: guestReviews.propertyId,
        draftText: guestReviews.draftText,
        starRating: guestReviews.starRating,
        status: guestReviews.status,
        isBadReview: guestReviews.isBadReview,
        createdAt: guestReviews.createdAt,
      })
      .from(guestReviews)
      .where(inArray(guestReviews.status, ["draft_generated", "bad_review_held"]))
      .orderBy(desc(guestReviews.createdAt));

    // Incoming reviews needing response
    const incoming = await db
      .select({
        id: guestReviews.id,
        bookingId: guestReviews.bookingId,
        propertyId: guestReviews.propertyId,
        incomingText: guestReviews.incomingText,
        incomingRating: guestReviews.incomingRating,
        incomingDate: guestReviews.incomingDate,
        responseDraft: guestReviews.responseDraft,
        responseSent: guestReviews.responseSent,
        status: guestReviews.status,
      })
      .from(guestReviews)
      .where(
        and(
          eq(guestReviews.direction, "incoming"),
          eq(guestReviews.responseSent, false)
        )
      )
      .orderBy(desc(guestReviews.incomingDate));

    // Scheduled reviews
    const scheduled = await db
      .select({
        id: guestReviews.id,
        bookingId: guestReviews.bookingId,
        propertyId: guestReviews.propertyId,
        finalText: guestReviews.finalText,
        scheduledPublishAt: guestReviews.scheduledPublishAt,
        status: guestReviews.status,
      })
      .from(guestReviews)
      .where(eq(guestReviews.status, "scheduled"))
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
