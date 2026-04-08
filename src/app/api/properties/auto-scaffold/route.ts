import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

/**
 * POST /api/properties/auto-scaffold
 * Creates Channex properties (with room type + rate plan) so the user has
 * enough "slots" to map OTA listings. Accepts ?count=N to create multiple.
 *
 * Returns existing Channex-connected properties if they already exist,
 * otherwise creates new ones.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const requestedCount = Math.min(10, Math.max(1, parseInt(url.searchParams.get("count") ?? "1", 10)));

    const supabase = createServiceClient();

    // Get all existing Channex-connected properties for this user
    const { data: existing } = await supabase
      .from("properties")
      .select("id, channex_property_id")
      .eq("user_id", user.id)
      .not("channex_property_id", "is", null);

    const existingProps = (existing ?? []) as { id: string; channex_property_id: string }[];

    // If user already has enough Channex properties, return them
    if (existingProps.length >= requestedCount) {
      return NextResponse.json({
        properties: existingProps.map((p) => ({
          property_id: p.id,
          channex_property_id: p.channex_property_id,
        })),
        created: 0,
      });
    }

    const channex = createChannexClient();
    const toCreate = requestedCount - existingProps.length;
    const created: { property_id: string; channex_property_id: string }[] = [];

    for (let i = 0; i < toCreate; i++) {
      const label = existingProps.length + i + 1;
      const title = toCreate === 1 && existingProps.length === 0 ? "My Property" : `Property ${label}`;

      // Create Channex property
      const channexProp = await channex.createProperty({
        title,
        currency: "USD",
        email: user.email || "",
        phone: "",
        zip_code: "",
        country: "US",
        state: "",
        city: "",
        address: "",
        longitude: 0,
        latitude: 0,
        timezone: "America/New_York",
      });

      // Create room type
      const roomType = await channex.createRoomType({
        property_id: channexProp.id,
        title: "Entire Home",
        count_of_rooms: 1,
        occ_adults: 6,
        occ_children: 2,
        occ_infants: 1,
        default_occupancy: 6,
      });

      // Create rate plan
      await channex.createRatePlan({
        property_id: channexProp.id,
        room_type_id: roomType.id,
        title: "Standard Rate",
        currency: "USD",
        sell_mode: "per_room",
        rate_mode: "manual",
      });

      // Create property in our DB
      const { data: newProp, error: insertErr } = await supabase
        .from("properties")
        .insert({
          user_id: user.id,
          name: title,
          channex_property_id: channexProp.id,
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error(`[auto-scaffold] DB insert failed for ${title}:`, insertErr.message);
        continue;
      }

      // Cache room type
      await supabase.from("channex_room_types").upsert({
        id: roomType.id,
        property_id: newProp.id,
        channex_property_id: channexProp.id,
        title: "Entire Home",
        count_of_rooms: 1,
        occ_adults: 6,
        cached_at: new Date().toISOString(),
      }, { onConflict: "id" });

      created.push({
        property_id: newProp.id,
        channex_property_id: channexProp.id,
      });

      // Small delay to avoid Channex rate limiting
      if (i < toCreate - 1) await new Promise((r) => setTimeout(r, 300));
    }

    const allProps = [
      ...existingProps.map((p) => ({ property_id: p.id, channex_property_id: p.channex_property_id })),
      ...created,
    ];

    return NextResponse.json({
      properties: allProps,
      created: created.length,
      // For backwards compat: return first property as property_id
      property_id: allProps[0]?.property_id,
      channex_property_id: allProps[0]?.channex_property_id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[auto-scaffold]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
