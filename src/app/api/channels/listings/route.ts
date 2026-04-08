import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

/**
 * GET /api/channels/listings
 * Returns all mapped OTA listings across all connected channels,
 * with import status (whether each listing has a StayCommand property).
 */
export async function GET() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServiceClient();
    const channex = createChannexClient();

    // Get user's properties
    const { data: props } = await supabase
      .from("properties")
      .select("id, name, channex_property_id")
      .eq("user_id", user.id);
    const properties = (props ?? []) as { id: string; name: string; channex_property_id: string | null }[];

    // Get all channels from Channex
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelsRes = await channex.request<any>("/channels");
    const channels = channelsRes.data ?? [];

    // Build set of existing channex_property_ids for matching
    const existingByChannexId = new Map<string, { id: string; name: string }>();
    for (const p of properties) {
      if (p.channex_property_id) {
        existingByChannexId.set(p.channex_property_id, { id: p.id, name: p.name });
      }
    }

    // Extract all mapped listings from channel rate_plans
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listings: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const ch of channels as any[]) {
      const attrs = ch.attributes ?? {};
      const channelName = attrs.channel ?? "Unknown";
      const channelId = ch.id;
      const ratePlans = attrs.rate_plans ?? [];
      const channelProperties = attrs.properties ?? [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const rp of ratePlans as any[]) {
        const settings = rp.settings ?? {};
        const listingId = settings.listing_id;
        if (!listingId) continue;

        // Find which Channex property this listing is mapped to
        const mappedChannexPropId = channelProperties[0]; // Usually one property per mapping
        const existingProp = mappedChannexPropId ? existingByChannexId.get(mappedChannexPropId) : null;

        listings.push({
          listing_id: listingId,
          listing_type: settings.listing_type ?? null,
          listing_name: attrs.title ?? `${channelName} Listing`,
          channel: channelName,
          channel_id: channelId,
          published: settings.published ?? false,
          daily_price: settings.pricing_setting?.default_daily_price ?? null,
          currency: settings.pricing_setting?.listing_currency ?? "USD",
          rate_plan_id: rp.rate_plan_id,
          channex_property_id: mappedChannexPropId ?? null,
          imported: !!existingProp,
          staycommand_property_id: existingProp?.id ?? null,
          staycommand_property_name: existingProp?.name ?? null,
        });
      }
    }

    return NextResponse.json({
      listings,
      channels: channels.length,
      imported: listings.filter((l) => l.imported).length,
      available: listings.filter((l) => !l.imported).length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[channels/listings]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
