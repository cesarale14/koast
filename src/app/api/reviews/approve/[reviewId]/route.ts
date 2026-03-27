import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/pooled";
import { bookings, guestReviews, reviewRules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { calculatePublishTime } from "@/lib/reviews/generator";
import { getAuthenticatedUser, verifyReviewOwnership } from "@/lib/auth/api-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: { reviewId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyReviewOwnership(user.id, params.reviewId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => ({}));

    // Fetch review
    const [review] = await db
      .select({
        id: guestReviews.id,
        bookingId: guestReviews.bookingId,
        propertyId: guestReviews.propertyId,
        draftText: guestReviews.draftText,
        starRating: guestReviews.starRating,
        isBadReview: guestReviews.isBadReview,
      })
      .from(guestReviews)
      .where(eq(guestReviews.id, params.reviewId))
      .limit(1);
    if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

    // Get booking checkout date for scheduling
    const [bookingRow] = await db
      .select({ checkOut: bookings.checkOut })
      .from(bookings)
      .where(eq(bookings.id, review.bookingId))
      .limit(1);
    const checkOut = bookingRow?.checkOut;

    // Get review rules
    const [ruleRow] = await db
      .select({
        publishDelayDays: reviewRules.publishDelayDays,
        badReviewDelay: reviewRules.badReviewDelay,
      })
      .from(reviewRules)
      .where(eq(reviewRules.propertyId, review.propertyId))
      .limit(1);
    const rule = ruleRow ?? { publishDelayDays: 3, badReviewDelay: true };

    const isBad = body.is_bad_review ?? review.isBadReview ?? false;
    const finalText = body.final_text ?? review.draftText;
    const starRating = body.star_rating ?? review.starRating;

    const publishAt = checkOut
      ? calculatePublishTime(checkOut, rule.publishDelayDays ?? 3, isBad, rule.badReviewDelay ?? true)
      : new Date(Date.now() + 3 * 86400000);

    await db
      .update(guestReviews)
      .set({
        finalText,
        starRating,
        isBadReview: isBad,
        status: isBad ? "bad_review_held" : "scheduled",
        scheduledPublishAt: publishAt,
      })
      .where(eq(guestReviews.id, params.reviewId));

    return NextResponse.json({
      status: isBad ? "bad_review_held" : "scheduled",
      scheduled_publish_at: publishAt.toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
