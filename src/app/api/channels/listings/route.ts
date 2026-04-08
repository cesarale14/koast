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

    // Build map: channex_property_id → StayCommand property
    const existingByChannexId = new Map<string, { id: string; name: string }>();
    for (const p of properties) {
      if (p.channex_property_id) {
        existingByChannexId.set(p.channex_property_id, { id: p.id, name: p.name });
      }
    }

    // Fetch channels and ALL rate plans in parallel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [channelsRes, ratePlansRes] = await Promise.all([
      channex.request<{ data: { id: string; attributes: Record<string, unknown> }[] }>("/channels"),
      channex.request<{ data: { id: string; attributes: Record<string, unknown>; relationships: Record<string, { data: { id: string } }> }[] }>("/rate_plans"),
    ]);

    // Build map: rate_plan_id → channex_property_id (from rate plans API relationships)
    const rpToProperty = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const rp of (ratePlansRes.data ?? []) as any[]) {
      const propId = rp.relationships?.property?.data?.id;
      if (propId) rpToProperty.set(rp.id, propId);
    }

    // Build map: channex_property_id → property title (from Channex properties API)
    const channexPropTitles = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propsRes = await channex.request<any>("/properties");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (propsRes.data ?? []) as any[]) {
      channexPropTitles.set(p.id, p.attributes?.title ?? "Unknown");
    }

    // Extract mapped listings from channel rate_plans
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listings: Record<string, unknown>[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const ch of (channelsRes.data ?? []) as any[]) {
      const attrs = ch.attributes ?? {};
      const channelName = attrs.channel ?? "Unknown";
      const channelId = ch.id;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const rp of (attrs.rate_plans ?? []) as any[]) {
        const settings = rp.settings ?? {};
        const listingId = settings.listing_id;
        if (!listingId) continue;

        // Find which Channex property this rate plan belongs to
        const mappedChannexPropId = rpToProperty.get(rp.rate_plan_id) ?? null;
        const existingProp = mappedChannexPropId ? existingByChannexId.get(mappedChannexPropId) : null;

        // Use Channex property title as listing name (since OTA listing name isn't in the API)
        const channexPropTitle = mappedChannexPropId ? channexPropTitles.get(mappedChannexPropId) : null;

        // Derive a display name: prefer the property title if it's not a scaffold name
        let displayName = channexPropTitle ?? `${channelName} Listing`;
        if (displayName === "My Property" || displayName.match(/^Property \d+$/)) {
          displayName = `${channelName} Listing #${String(listingId).slice(-4)}`;
        }

        // Check if this listing is ALREADY imported into StayCommand
        // Match by channex_property_id, not by channel title
        const isImported = !!existingProp && existingProp.name !== "My Property" && !existingProp.name.match(/^Property \d+$/);

        listings.push({
          listing_id: String(listingId),
          listing_type: settings.listing_type ?? null,
          listing_name: displayName,
          channel: channelName,
          channel_id: channelId,
          published: settings.published ?? false,
          daily_price: settings.pricing_setting?.default_daily_price ?? null,
          currency: settings.pricing_setting?.listing_currency ?? "USD",
          rate_plan_id: rp.rate_plan_id,
          channex_property_id: mappedChannexPropId,
          imported: isImported,
          staycommand_property_id: existingProp?.id ?? null,
          staycommand_property_name: isImported ? existingProp?.name : null,
        });
      }
    }

    return NextResponse.json({
      listings,
      channels: (channelsRes.data ?? []).length,
      imported: listings.filter((l) => l.imported).length,
      available: listings.filter((l) => !l.imported).length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[channels/listings]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
