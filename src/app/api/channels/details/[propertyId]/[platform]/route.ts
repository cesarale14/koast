import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

const PLATFORM_TO_CODE: Record<string, string> = {
  airbnb: "ABB",
  booking_com: "BDC",
  vrbo: "VRBO",
  direct: "DIRECT",
};

const LISTING_URL_TEMPLATES: Record<string, (id: string) => string> = {
  airbnb: (id) => `https://www.airbnb.com/rooms/${id}`,
  booking_com: (id) => `https://www.booking.com/hotel/us/${id}.html`,
  vrbo: (id) => `https://www.vrbo.com/${id}`,
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export async function GET(
  _req: Request,
  { params }: { params: { propertyId: string; platform: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { propertyId, platform } = params;
    const channelCode = PLATFORM_TO_CODE[platform] ?? platform.toUpperCase();
    const svc = createServiceClient();

    // Verify the user owns this property
    const { data: propCheck } = await svc
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .eq("user_id", user.id)
      .limit(1);
    if (!propCheck || propCheck.length === 0) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // Channel info
    const { data: channelRows } = await svc
      .from("property_channels")
      .select("id, channel_code, channel_name, status, settings, updated_at")
      .eq("property_id", propertyId)
      .eq("channel_code", channelCode)
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (channelRows ?? [])[0] as any | undefined;

    // Channel health status
    let syncStatus: "synced" | "degraded" | "disconnected" = "disconnected";
    let lastSynced: string | null = null;
    if (channel) {
      lastSynced = channel.updated_at ?? null;
      if (channel.status === "active") {
        if (lastSynced) {
          const minsSince = (Date.now() - new Date(lastSynced).getTime()) / 60000;
          syncStatus = minsSince < 15 ? "synced" : minsSince < 60 ? "degraded" : "disconnected";
        } else {
          syncStatus = "synced";
        }
      }
    }

    // Stats — this month's bookings/revenue for this platform
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

    const { data: bookingRows } = await svc
      .from("bookings")
      .select("id, total_price, platform")
      .eq("property_id", propertyId)
      .eq("platform", platform)
      .gte("check_in", monthStart)
      .lte("check_in", monthEnd)
      .in("status", ["confirmed", "completed"]);

    const bookings = (bookingRows ?? []) as { id: string; total_price: number | null }[];
    const bookingCount = bookings.length;
    const revenue = Math.round(bookings.reduce((s, b) => s + (b.total_price ?? 0), 0));

    // Rating from guest_reviews for this platform
    const { data: reviewRows } = await svc
      .from("guest_reviews")
      .select("rating")
      .eq("property_id", propertyId)
      .not("rating", "is", null);
    const ratings = (reviewRows ?? []) as { rating: number | string | null }[];
    const validRatings = ratings.map((r) => Number(r.rating)).filter((v) => Number.isFinite(v) && v > 0);
    const avgRating = validRatings.length > 0
      ? Math.round((validRatings.reduce((a, b) => a + b, 0) / validRatings.length) * 10) / 10
      : 0;

    // Listing ID from property_channels settings or listings table
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings: any = channel?.settings ?? {};
    let listingId: string | null = settings.hotel_id?.toString() ?? settings.listing_id?.toString() ?? null;
    if (!listingId) {
      const { data: listingRows } = await svc
        .from("listings")
        .select("platform_listing_id")
        .eq("property_id", propertyId)
        .eq("platform", platform)
        .limit(1);
      listingId = ((listingRows ?? [])[0] as { platform_listing_id: string | null } | undefined)?.platform_listing_id ?? null;
    }

    const listingUrl = listingId && LISTING_URL_TEMPLATES[platform]
      ? LISTING_URL_TEMPLATES[platform](listingId)
      : null;

    // Channex IDs (for advanced section)
    const { data: propRow } = await svc
      .from("properties")
      .select("channex_property_id")
      .eq("id", propertyId)
      .limit(1);
    const channexPropertyId = ((propRow ?? [])[0] as { channex_property_id: string | null } | undefined)?.channex_property_id ?? null;

    return NextResponse.json({
      status: syncStatus,
      channel_status: channel?.status ?? null,
      stats: {
        bookings: bookingCount,
        revenue,
        rating: avgRating,
      },
      connection: {
        listing_id: listingId,
        last_synced: lastSynced,
        last_synced_ago: timeAgo(lastSynced),
        sync_method: channel ? "Channex API" : "Not connected",
        channex_property_id: channexPropertyId,
        channex_channel_id: channel?.id ?? null,
      },
      listing_url: listingUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
