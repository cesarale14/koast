import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateGuestReview, calculatePublishTime } from "@/lib/reviews/generator";

export async function POST(
  _request: Request,
  { params }: { params: { bookingId: string } }
) {
  try {
    const supabase = createServiceClient();

    // Fetch booking
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, property_id, guest_name, check_in, check_out, platform")
      .eq("id", params.bookingId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const booking = ((bookings ?? []) as any[])[0];
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    // Fetch property
    const { data: props } = await supabase
      .from("properties")
      .select("name, city, bedrooms, bathrooms")
      .eq("id", booking.property_id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const property = ((props ?? []) as any[])[0];
    if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    // Fetch review rules (or use defaults)
    const { data: rules } = await supabase
      .from("review_rules")
      .select("tone, target_keywords, auto_publish, publish_delay_days, bad_review_delay")
      .eq("property_id", booking.property_id)
      .eq("is_active", true)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rule = ((rules ?? []) as any[])[0] ?? {
      tone: "warm",
      target_keywords: ["clean", "location", "comfortable"],
      auto_publish: false,
      publish_delay_days: 3,
      bad_review_delay: true,
    };

    // Generate review
    const result = await generateGuestReview(booking, property, rule);
    const publishAt = calculatePublishTime(booking.check_out, rule.publish_delay_days, false, rule.bad_review_delay);

    // Upsert guest_review
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviewTable = supabase.from("guest_reviews") as any;
    const { data: existing } = await reviewTable
      .select("id")
      .eq("booking_id", params.bookingId)
      .limit(1);

    const reviewData = {
      booking_id: params.bookingId,
      property_id: booking.property_id,
      direction: "outgoing",
      draft_text: result.review_text,
      private_note: result.private_note,
      recommend_guest: result.recommended,
      star_rating: 5,
      status: rule.auto_publish ? "scheduled" : "draft_generated",
      scheduled_publish_at: rule.auto_publish ? publishAt.toISOString() : null,
      ai_context: {
        tone: rule.tone,
        keywords: rule.target_keywords,
        guest: booking.guest_name,
        nights: Math.round((new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / 86400000),
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (existing && (existing as any[]).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await reviewTable.update(reviewData).eq("id", (existing as any[])[0].id);
    } else {
      await reviewTable.insert(reviewData);
    }

    return NextResponse.json({
      review_text: result.review_text,
      private_note: result.private_note,
      status: reviewData.status,
      scheduled_publish_at: reviewData.scheduled_publish_at,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
