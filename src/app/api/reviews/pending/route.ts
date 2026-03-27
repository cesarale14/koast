import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServiceClient();
    const today = new Date().toISOString().split("T")[0];

    // Bookings needing outgoing reviews (checked out, no review exists)
    const { data: needsReview } = await supabase
      .from("bookings")
      .select("id, property_id, guest_name, check_in, check_out, platform")
      .lt("check_out", today)
      .in("status", ["confirmed", "completed"])
      .order("check_out", { ascending: false })
      .limit(50);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bookings = (needsReview ?? []) as any[];

    // Get existing reviews to filter out
    const bookingIds = bookings.map((b) => b.id);
    const { data: existingReviews } = await supabase
      .from("guest_reviews")
      .select("booking_id")
      .in("booking_id", bookingIds.length > 0 ? bookingIds : ["none"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviewedIds = new Set(((existingReviews ?? []) as any[]).map((r) => r.booking_id));
    const pendingBookings = bookings.filter((b) => !reviewedIds.has(b.id));

    // Reviews needing approval
    const { data: drafts } = await supabase
      .from("guest_reviews")
      .select("id, booking_id, property_id, draft_text, star_rating, status, is_bad_review, created_at")
      .in("status", ["draft_generated", "bad_review_held"])
      .order("created_at", { ascending: false });

    // Incoming reviews needing response
    const { data: incoming } = await supabase
      .from("guest_reviews")
      .select("id, booking_id, property_id, incoming_text, incoming_rating, incoming_date, response_draft, response_sent, status")
      .eq("direction", "incoming")
      .eq("response_sent", false)
      .order("incoming_date", { ascending: false });

    // Scheduled reviews
    const { data: scheduled } = await supabase
      .from("guest_reviews")
      .select("id, booking_id, property_id, final_text, scheduled_publish_at, status")
      .eq("status", "scheduled")
      .order("scheduled_publish_at");

    return NextResponse.json({
      needs_review: pendingBookings.length,
      needs_approval: ((drafts ?? []) as unknown[]).length,
      needs_response: ((incoming ?? []) as unknown[]).length,
      scheduled: ((scheduled ?? []) as unknown[]).length,
      pending_bookings: pendingBookings,
      draft_reviews: drafts ?? [],
      incoming_reviews: incoming ?? [],
      scheduled_reviews: scheduled ?? [],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
