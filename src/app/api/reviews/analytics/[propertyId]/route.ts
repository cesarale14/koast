import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";

const MIN_RESPONSES_FOR_MEDIAN = 5;
const MIN_REVIEWS_FOR_DELTA = 5;

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export async function GET(
  _request: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();

    // All reviews for this property
    const { data: reviews } = await supabase
      .from("guest_reviews")
      .select("star_rating, incoming_rating, incoming_text, response_sent, direction, status, published_at, incoming_date, created_at")
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

    // RDX-2 Phase B — rolling 30d response time + rating delta.
    const now = Date.now();
    const D30 = 30 * 86400000;
    const window30Start = now - D30;
    const window60Start = now - 2 * D30;

    const publishedIncoming = incoming.filter(
      (r) => r.status === "published" && r.response_sent && r.published_at && r.incoming_date,
    );
    const recentResponses = publishedIncoming.filter(
      (r) => new Date(r.published_at).getTime() >= window30Start,
    );
    let medianHoursToResponse: number | null = null;
    if (recentResponses.length >= MIN_RESPONSES_FOR_MEDIAN) {
      const hours = recentResponses
        .map((r) => (new Date(r.published_at).getTime() - new Date(r.incoming_date).getTime()) / 3600000)
        .filter((h) => Number.isFinite(h) && h >= 0);
      medianHoursToResponse = median(hours);
    }

    // Avg-rating delta vs prior 30-day window. Anchor on incoming_date
    // so the delta tracks reviews actually received in the window
    // (not reviews backfilled by a Channex re-sync into a prior period).
    const ratingsRecent = incoming
      .filter((r) => r.incoming_date && new Date(r.incoming_date).getTime() >= window30Start)
      .map((r) => Number(r.incoming_rating))
      .filter((n) => Number.isFinite(n));
    const ratingsPrior = incoming
      .filter((r) => {
        if (!r.incoming_date) return false;
        const t = new Date(r.incoming_date).getTime();
        return t >= window60Start && t < window30Start;
      })
      .map((r) => Number(r.incoming_rating))
      .filter((n) => Number.isFinite(n));

    let avgRatingDelta30d: number | null = null;
    if (ratingsRecent.length >= MIN_REVIEWS_FOR_DELTA && ratingsPrior.length >= MIN_REVIEWS_FOR_DELTA) {
      const avgRecent = ratingsRecent.reduce((a, b) => a + b, 0) / ratingsRecent.length;
      const avgPrior = ratingsPrior.reduce((a, b) => a + b, 0) / ratingsPrior.length;
      avgRatingDelta30d = Math.round((avgRecent - avgPrior) * 10) / 10;
    }

    return NextResponse.json({
      avg_rating: avgIncomingRating,
      total_incoming: incoming.length,
      total_outgoing: outgoing.length,
      published: publishedCount,
      review_rate: reviewRate,
      response_rate: responseRate,
      top_keywords: topKeywords,
      // RDX-2 Phase B
      median_hours_to_response: medianHoursToResponse,
      avg_rating_delta_30d: avgRatingDelta30d,
      total_incoming_30d: incoming.filter(
        (r) => r.incoming_date && new Date(r.incoming_date).getTime() >= window30Start,
      ).length,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
