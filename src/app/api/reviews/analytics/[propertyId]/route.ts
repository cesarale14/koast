import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(
  _request: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const supabase = createServiceClient();

    // All reviews for this property
    const { data: reviews } = await supabase
      .from("guest_reviews")
      .select("star_rating, incoming_rating, incoming_text, response_sent, direction, status, published_at, created_at")
      .eq("property_id", params.propertyId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allReviews = (reviews ?? []) as any[];

    const incoming = allReviews.filter((r) => r.direction === "incoming");
    const outgoing = allReviews.filter((r) => r.direction === "outgoing");

    // Stats
    const avgIncomingRating = incoming.length > 0
      ? Math.round(incoming.reduce((s, r) => s + (r.incoming_rating ?? 0), 0) / incoming.length * 10) / 10
      : 0;

    const responseRate = incoming.length > 0
      ? Math.round(incoming.filter((r) => r.response_sent).length / incoming.length * 100)
      : 0;

    const publishedCount = outgoing.filter((r) => r.status === "published").length;

    // Total bookings for review rate
    const { data: bookingCount } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("property_id", params.propertyId)
      .in("status", ["confirmed", "completed"]);

    const totalBookings = (bookingCount as unknown as number) ?? 0;
    const reviewRate = totalBookings > 0
      ? Math.round(incoming.length / totalBookings * 100)
      : 0;

    // Keyword frequency in incoming reviews
    const keywordFreq: Record<string, number> = {};
    for (const r of incoming) {
      if (!r.incoming_text) continue;
      const words = r.incoming_text.toLowerCase().split(/\W+/);
      for (const w of words) {
        if (w.length > 3) keywordFreq[w] = (keywordFreq[w] ?? 0) + 1;
      }
    }
    const topKeywords = Object.entries(keywordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([word, count]) => ({ word, count }));

    return NextResponse.json({
      avg_rating: avgIncomingRating,
      total_incoming: incoming.length,
      total_outgoing: outgoing.length,
      published: publishedCount,
      review_rate: reviewRate,
      response_rate: responseRate,
      top_keywords: topKeywords,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
