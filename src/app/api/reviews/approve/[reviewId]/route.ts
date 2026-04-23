import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/pooled";
import { guestReviews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

    const isBad = body.is_bad_review ?? review.isBadReview ?? false;
    const finalText = body.final_text ?? review.draftText;
    const starRating = body.star_rating ?? review.starRating;

    // Session 6.1a: no scheduler exists. Saving a draft sets
    // status='draft_generated' (or 'bad_review_held' for flagged
    // reviews); no scheduled_publish_at is set. The "Approve & Publish"
    // verb (which actually pushes to Channex via submitGuestReview)
    // lands in 6.2 once the Channex client gains that method.
    await db
      .update(guestReviews)
      .set({
        finalText,
        starRating,
        isBadReview: isBad,
        status: isBad ? "bad_review_held" : "draft_generated",
      })
      .where(eq(guestReviews.id, params.reviewId));

    return NextResponse.json({
      status: isBad ? "bad_review_held" : "draft_generated",
      saved: true,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
