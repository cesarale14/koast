import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/pooled";
import { guestReviews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUser, verifyReviewOwnership } from "@/lib/auth/api-auth";

// RDX-4 — host's mark-as-bad action lands here. Writes
// is_flagged_by_host (the host-asserted flag); is_low_rating is
// owned by sync and never touched by this route. is_bad_review is
// also kept in lockstep for one release cycle so legacy reads keep
// working until tech-debt cleanup drops the column.
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

    const [review] = await db
      .select({
        id: guestReviews.id,
        draftText: guestReviews.draftText,
        starRating: guestReviews.starRating,
        isFlaggedByHost: guestReviews.isFlaggedByHost,
      })
      .from(guestReviews)
      .where(eq(guestReviews.id, params.reviewId))
      .limit(1);
    if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

    // Accept legacy `is_bad_review` payload key for backwards-compat
    // with any external caller; new clients send `is_flagged_by_host`.
    const flagged = (body.is_flagged_by_host ?? body.is_bad_review ?? review.isFlaggedByHost ?? false) as boolean;
    const finalText = body.final_text ?? review.draftText;
    const starRating = body.star_rating ?? review.starRating;

    await db
      .update(guestReviews)
      .set({
        finalText,
        starRating,
        isFlaggedByHost: flagged,
        // Keep legacy column in sync until removed.
        isBadReview: flagged,
      })
      .where(eq(guestReviews.id, params.reviewId));

    return NextResponse.json({
      saved: true,
      is_flagged_by_host: flagged,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
