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

    // Fetch cached data from local tables
    const [channelsRes, roomTypesRes, ratePlansRes] = await Promise.all([
      supabase.from("property_channels").select("*").eq("property_id", params.propertyId).order("channel_name"),
      supabase.from("channex_room_types").select("*").eq("property_id", params.propertyId).order("title"),
      supabase.from("channex_rate_plans").select("*").eq("property_id", params.propertyId).order("title"),
    ]);

    const channels = (channelsRes.data ?? []) as Record<string, unknown>[];
    const roomTypes = (roomTypesRes.data ?? []) as Record<string, unknown>[];
    const ratePlans = (ratePlansRes.data ?? []) as Record<string, unknown>[];

    // Determine if local cache is stale — check room_types cache age (channels can legitimately be 0)
    const isStale = roomTypes.length === 0 && !!property.channex_property_id;
    const isExpired = roomTypes.some((rt) => {
      const cachedAt = rt.cached_at as string | null;
      if (!cachedAt) return true;
      return Date.now() - new Date(cachedAt).getTime() > STALE_MINUTES * 60 * 1000;
    });

    // If stale and property has channex_property_id, refresh from Channex
    if ((isStale || isExpired) && property.channex_property_id) {
      try {
        const channex = createChannexClient();
        const now = new Date().toISOString();
        const channexPropId = property.channex_property_id;

        // Fetch channels, room types, rate plans in parallel
        const [channexChannelsRes, channexRoomTypes, channexRatePlans] = await Promise.all([
          channex.getChannels(channexPropId).catch(() => ({ data: [] })),
          channex.getRoomTypes(channexPropId),
          channex.getRatePlans(channexPropId),
        ]);

        // Upsert channels (may be empty — that's OK)
        const channexChannels = Array.isArray(channexChannelsRes.data) ? channexChannelsRes.data : [];
        for (const ch of channexChannels) {
          const attrs = ch.attributes ?? {};
          await supabase.from("property_channels").upsert({
            property_id: params.propertyId,
            channex_channel_id: ch.id,
            channel_code: attrs.channel_code ?? "unknown",
            channel_name: attrs.title ?? "Unknown",
            status: attrs.is_active === false ? "inactive" : "active",
            last_sync_at: now,
            settings: attrs.settings ?? {},
            updated_at: now,
          }, { onConflict: "property_id,channex_channel_id" });
        }

        // Upsert room types
        if (channexRoomTypes.length > 0) {
          await supabase.from("channex_room_types").delete().eq("property_id", params.propertyId);
          await supabase.from("channex_room_types").upsert(
            channexRoomTypes.map((rt) => ({
              id: rt.id,
              property_id: params.propertyId,
              channex_property_id: channexPropId,
              title: rt.attributes.title,
              count_of_rooms: rt.attributes.count_of_rooms ?? 1,
              occ_adults: rt.attributes.occ_adults ?? 2,
              occ_children: rt.attributes.occ_children ?? 0,
              cached_at: now,
            })),
            { onConflict: "id" }
          );
        }

        // Upsert rate plans
        if (channexRatePlans.length > 0) {
          await supabase.from("channex_rate_plans").delete().eq("property_id", params.propertyId);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await supabase.from("channex_rate_plans").upsert(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            channexRatePlans.map((rp: any) => ({
              id: rp.id,
              property_id: params.propertyId,
              room_type_id: rp.relationships?.room_type?.data?.id ?? "",
              title: rp.attributes.title,
              sell_mode: rp.attributes.sell_mode ?? "per_room",
              currency: rp.attributes.currency ?? "USD",
              rate_mode: rp.attributes.rate_mode ?? "manual",
              cached_at: now,
            })),
            { onConflict: "id" }
          );
        }

        // Re-fetch from DB
        const [refreshedChannels, refreshedRT, refreshedRP] = await Promise.all([
          supabase.from("property_channels").select("*").eq("property_id", params.propertyId).order("channel_name"),
          supabase.from("channex_room_types").select("*").eq("property_id", params.propertyId).order("title"),
          supabase.from("channex_rate_plans").select("*").eq("property_id", params.propertyId).order("title"),
        ]);

        return NextResponse.json({
          channels: refreshedChannels.data ?? [],
          room_types: refreshedRT.data ?? [],
          rate_plans: refreshedRP.data ?? [],
          property: { id: property.id, name: property.name, channex_property_id: property.channex_property_id },
        });
      } catch (err) {
        console.error("[channels] Channex refresh failed:", err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({
      channels,
      room_types: roomTypes,
      rate_plans: ratePlans,
      property: { id: property.id, name: property.name, channex_property_id: property.channex_property_id },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[channels] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
