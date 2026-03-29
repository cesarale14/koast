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
    const action = body.action ?? "generate"; // "generate" or "approve"
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

    if (action === "approve") {
      // Approve: move draft (or edited text) to final
      const finalText = body.response_text ?? review.response_draft;
      if (!finalText) {
        return NextResponse.json({ error: "No draft to approve. Generate a draft first." }, { status: 400 });
      }
      await reviewTable.update({
        response_draft: finalText,
        response_final: finalText,
        response_sent: true,
      }).eq("id", params.reviewId);

      return NextResponse.json({ response_text: finalText, sent: true });
    }

    // Generate draft
    let responseText = body.response_text;

    if (!responseText) {
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

    if (!responseText) {
      return NextResponse.json({ error: "Could not generate response" }, { status: 500 });
    }

    // Save as draft only
    await reviewTable.update({
      response_draft: responseText,
    }).eq("id", params.reviewId);

    return NextResponse.json({ response_text: responseText, sent: false });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
