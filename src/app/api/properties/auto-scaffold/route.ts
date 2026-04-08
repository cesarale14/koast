import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

/**
 * POST /api/properties/auto-scaffold
 * Creates a Channex property with room type + rate plan.
 *
 * Without ?force=true: returns existing Channex property if one exists.
 * With ?force=true: always creates a NEW Channex property (for mapping additional OTA listings).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "true";

    const supabase = createServiceClient();

    // Unless force-creating, return existing property
    if (!force) {
      const { data: existing } = await supabase
        .from("properties")
        .select("id, channex_property_id")
        .eq("user_id", user.id)
        .not("channex_property_id", "is", null)
        .limit(1);

      if (existing && existing.length > 0) {
        return NextResponse.json({
          property_id: existing[0].id,
          channex_property_id: existing[0].channex_property_id,
          created: false,
        });
      }
    }

    // Count existing properties for naming
    const { data: allProps } = await supabase
      .from("properties")
      .select("id")
      .eq("user_id", user.id);
    const count = (allProps ?? []).length;
    const title = count === 0 ? "My Property" : `Property ${count + 1}`;

    const channex = createChannexClient();

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
    console.log(`[auto-scaffold] Created Channex property: ${channexProp.id} "${title}"`);

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
    console.log(`[auto-scaffold] Created room type: ${roomType.id}`);

    // Create rate plan
    const ratePlan = await channex.createRatePlan({
      property_id: channexProp.id,
      room_type_id: roomType.id,
      title: "Best Available Rate",
      currency: "USD",
      sell_mode: "per_room",
      rate_mode: "manual",
    });
    console.log(`[auto-scaffold] Created rate plan: ${ratePlan.id}`);

    // Add new property to the existing Airbnb channel (if one exists)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const channelsRes = await channex.request<any>("/channels");
      const airbnbChannel = (channelsRes.data ?? []).find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ch: any) => ch.attributes?.channel === "AirBNB" && ch.attributes?.is_active
      );
      if (airbnbChannel) {
        const existingProps = airbnbChannel.attributes?.properties ?? [];
        if (!existingProps.includes(channexProp.id)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await channex.request<any>(`/channels/${airbnbChannel.id}`, {
            method: "PUT",
            body: JSON.stringify({
              channel: { properties: [...existingProps, channexProp.id] },
            }),
          });
          console.log(`[auto-scaffold] Added property ${channexProp.id} to Airbnb channel ${airbnbChannel.id}`);
        }
      }
    } catch (err) {
      console.warn("[auto-scaffold] Could not add to channel:", err instanceof Error ? err.message : err);
    }

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

    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

    // Cache room type and rate plan
    const now = new Date().toISOString();
    await supabase.from("channex_room_types").upsert({
      id: roomType.id,
      property_id: newProp.id,
      channex_property_id: channexProp.id,
      title: "Entire Home",
      count_of_rooms: 1,
      occ_adults: 6,
      cached_at: now,
    }, { onConflict: "id" });

    await supabase.from("channex_rate_plans").upsert({
      id: ratePlan.id,
      property_id: newProp.id,
      room_type_id: roomType.id,
      title: "Best Available Rate",
      sell_mode: "per_room",
      currency: "USD",
      rate_mode: "manual",
      cached_at: now,
    }, { onConflict: "id" });

    return NextResponse.json({
      property_id: newProp.id,
      channex_property_id: channexProp.id,
      created: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[auto-scaffold]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
