import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

const STALE_MINUTES = 5;

export async function GET(
  _request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();

    // Get property info with channex_property_id
    const { data: propData } = await supabase
      .from("properties")
      .select("id, name, channex_property_id")
      .eq("id", params.propertyId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const property = ((propData ?? []) as any[])[0];
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // Check local cache
    const { data: cachedChannels } = await supabase
      .from("property_channels")
      .select("*")
      .eq("property_id", params.propertyId)
      .order("channel_name", { ascending: true });

    const channels = (cachedChannels ?? []) as Record<string, unknown>[];

    // Determine if data is stale
    const isStale =
      channels.length === 0 ||
      channels.some((ch) => {
        const syncAt = ch.last_sync_at as string | null;
        if (!syncAt) return true;
        const age = Date.now() - new Date(syncAt).getTime();
        return age > STALE_MINUTES * 60 * 1000;
      });

    // If stale and property has channex_property_id, refresh from Channex
    if (isStale && property.channex_property_id) {
      try {
        const channex = createChannexClient();
        const channexData = await channex.getChannels(property.channex_property_id);
        const channexChannels = Array.isArray(channexData.data) ? channexData.data : [];

        const now = new Date().toISOString();
        for (const ch of channexChannels) {
          const attrs = ch.attributes ?? {};
          await supabase
            .from("property_channels")
            .upsert(
              {
                property_id: params.propertyId,
                channex_channel_id: ch.id,
                channel_code: attrs.channel_code ?? attrs.id ?? "unknown",
                channel_name: attrs.title ?? attrs.channel_name ?? "Unknown",
                status: attrs.is_active === false ? "inactive" : "active",
                last_sync_at: now,
                settings: attrs.settings ?? {},
                updated_at: now,
              },
              { onConflict: "property_id,channex_channel_id" }
            );
        }

        // Re-fetch from DB after upsert
        const { data: refreshed } = await supabase
          .from("property_channels")
          .select("*")
          .eq("property_id", params.propertyId)
          .order("channel_name", { ascending: true });

        return NextResponse.json({
          channels: refreshed ?? [],
          property: {
            id: property.id,
            name: property.name,
            channex_property_id: property.channex_property_id,
          },
        });
      } catch (err) {
        console.error("[channels] Channex fetch failed, returning cached:", err instanceof Error ? err.message : err);
        // Fall through to return cached data
      }
    }

    return NextResponse.json({
      channels,
      property: {
        id: property.id,
        name: property.name,
        channex_property_id: property.channex_property_id,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[channels] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
