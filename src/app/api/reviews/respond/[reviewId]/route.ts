import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateReviewResponse } from "@/lib/reviews/generator";
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviewTable = supabase.from("guest_reviews") as any;
    const { data: reviews } = await reviewTable
      .select("id, booking_id, property_id, incoming_text, incoming_rating, response_draft")
      .eq("id", params.reviewId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const review = ((reviews ?? []) as any[])[0];
    if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

    let responseText = body.response_text;

    // Generate if not provided
    if (!responseText && !review.response_draft) {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("guest_name, check_in, check_out, platform")
        .eq("id", review.booking_id)
        .limit(1);
      const { data: props } = await supabase
        .from("properties")
        .select("name, city, bedrooms, bathrooms")
        .eq("id", review.property_id)
        .limit(1);
      const { data: rules } = await supabase
        .from("review_rules")
        .select("tone, target_keywords")
        .eq("property_id", review.property_id)
        .limit(1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const booking = ((bookings ?? []) as any[])[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const property = ((props ?? []) as any[])[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rule = ((rules ?? []) as any[])[0] ?? { tone: "warm", target_keywords: [] };

      if (booking && property) {
        const result = await generateReviewResponse(
          review.incoming_text, review.incoming_rating, booking, property, rule
        );
        responseText = result.response_text;
      }
    }

    responseText = responseText ?? review.response_draft;

    await reviewTable.update({
      response_final: responseText,
      response_sent: true,
    }).eq("id", params.reviewId);

    return NextResponse.json({ response_text: responseText, sent: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
