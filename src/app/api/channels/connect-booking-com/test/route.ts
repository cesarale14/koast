import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createChannexClient } from "@/lib/channex/client";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/channels/connect-booking-com/test
 * Tests the Booking.com channel connection via Channex.
 * Returns whether the hotel has authorized Channex as connectivity provider.
 *
 * Body: { channelId: string, propertyId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { channelId, propertyId } = await request.json();
    if (!channelId) {
      return NextResponse.json({ error: "channelId is required" }, { status: 400 });
    }

    const channex = createChannexClient();
    const result = await channex.testChannelConnection(channelId);

    const connected = result.status === "ok" || result.status === "success" || result.status === "connected";

    if (connected && propertyId) {
      const supabase = createServiceClient();
      await supabase
        .from("property_channels")
        .update({ status: "authorized", updated_at: new Date().toISOString() })
        .eq("property_id", propertyId)
        .eq("channex_channel_id", channelId);
    }

    return NextResponse.json({
      connected,
      status: result.status,
      message: result.message,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[connect-bdc/test]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
