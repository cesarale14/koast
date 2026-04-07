import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

export async function POST(
  _request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();

    // Get property with channex_property_id
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

    if (!property.channex_property_id) {
      return NextResponse.json(
        { error: "Property is not connected to Channex" },
        { status: 400 }
      );
    }

    const channexPropId = property.channex_property_id;
    const channex = createChannexClient();
    const now = new Date().toISOString();

    // Fetch channels, room types, and rate plans in parallel
    const [channexChannels, channexRoomTypes, channexRatePlans] = await Promise.all([
      channex.getChannels(channexPropId).catch(() => ({ data: [] })),
      channex.getRoomTypes(channexPropId),
      channex.getRatePlans(channexPropId),
    ]);

    // Upsert channels
    const channelList = Array.isArray(channexChannels.data) ? channexChannels.data : [];
    for (const ch of channelList) {
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
            last_error: null,
            settings: attrs.settings ?? {},
            updated_at: now,
          },
          { onConflict: "property_id,channex_channel_id" }
        );
    }

    // Upsert room types — delete stale, insert fresh
    await supabase
      .from("channex_room_types")
      .delete()
      .eq("property_id", params.propertyId);

    const roomTypeRows = channexRoomTypes.map((rt) => ({
      id: rt.id,
      property_id: params.propertyId,
      channex_property_id: channexPropId,
      title: rt.attributes.title,
      count_of_rooms: rt.attributes.count_of_rooms ?? 1,
      occ_adults: rt.attributes.occ_adults ?? 2,
      occ_children: rt.attributes.occ_children ?? 0,
      cached_at: now,
    }));
    if (roomTypeRows.length > 0) {
      await supabase.from("channex_room_types").upsert(roomTypeRows, { onConflict: "id" });
    }

    // Upsert rate plans — delete stale, insert fresh
    await supabase
      .from("channex_rate_plans")
      .delete()
      .eq("property_id", params.propertyId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ratePlanRows = channexRatePlans.map((rp: any) => ({
      id: rp.id,
      property_id: params.propertyId,
      room_type_id: rp.relationships?.room_type?.data?.id ?? rp.attributes?.room_type_id ?? "",
      title: rp.attributes.title,
      sell_mode: rp.attributes.sell_mode ?? "per_room",
      currency: rp.attributes.currency ?? "USD",
      rate_mode: rp.attributes.rate_mode ?? "manual",
      cached_at: now,
    }));
    if (ratePlanRows.length > 0) {
      await supabase.from("channex_rate_plans").upsert(ratePlanRows, { onConflict: "id" });
    }

    // Fetch final state from DB
    const [{ data: channels }, { data: roomTypes }, { data: ratePlans }] = await Promise.all([
      supabase
        .from("property_channels")
        .select("*")
        .eq("property_id", params.propertyId)
        .order("channel_name", { ascending: true }),
      supabase
        .from("channex_room_types")
        .select("*")
        .eq("property_id", params.propertyId)
        .order("title", { ascending: true }),
      supabase
        .from("channex_rate_plans")
        .select("*")
        .eq("property_id", params.propertyId)
        .order("title", { ascending: true }),
    ]);

    return NextResponse.json({
      channels: channels ?? [],
      room_types: roomTypes ?? [],
      rate_plans: ratePlans ?? [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[channels/refresh] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
