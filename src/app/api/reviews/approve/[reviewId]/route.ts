import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
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
    const supabase = createServiceClient();

    // Fetch review
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviewTable = supabase.from("guest_reviews") as any;
    const { data: reviews } = await reviewTable
      .select("id, booking_id, property_id, draft_text, star_rating, is_bad_review")
      .eq("id", params.reviewId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const review = ((reviews ?? []) as any[])[0];
    if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

    // Get booking checkout date for scheduling
    const { data: bookings } = await supabase
      .from("bookings")
      .select("check_out")
      .eq("id", review.booking_id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checkOut = ((bookings ?? []) as any[])[0]?.check_out;

    // Get review rules
    const { data: rules } = await supabase
      .from("review_rules")
      .select("publish_delay_days, bad_review_delay")
      .eq("property_id", review.property_id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rule = ((rules ?? []) as any[])[0] ?? { publish_delay_days: 3, bad_review_delay: true };

    const isBad = body.is_bad_review ?? review.is_bad_review ?? false;
    const finalText = body.final_text ?? review.draft_text;
    const starRating = body.star_rating ?? review.star_rating;

    const publishAt = checkOut
      ? calculatePublishTime(checkOut, rule.publish_delay_days, isBad, rule.bad_review_delay)
      : new Date(Date.now() + 3 * 86400000);

    await reviewTable.update({
      final_text: finalText,
      star_rating: starRating,
      is_bad_review: isBad,
      status: isBad ? "bad_review_held" : "scheduled",
      scheduled_publish_at: publishAt.toISOString(),
    }).eq("id", params.reviewId);

    return NextResponse.json({
      status: isBad ? "bad_review_held" : "scheduled",
      scheduled_publish_at: publishAt.toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
