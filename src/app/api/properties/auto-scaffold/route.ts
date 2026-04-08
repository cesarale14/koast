import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

/**
 * POST /api/properties/auto-scaffold
 * Ensures the user has at least one Channex property (with room type + rate plan).
 * Returns the existing one if it exists, or creates a new one.
 */
export async function POST() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServiceClient();

    // Check if user already has a property with channex_property_id
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

    const channex = createChannexClient();

    // Create Channex property
    const channexProp = await channex.createProperty({
      title: "My Property",
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
        name: "My Property",
        channex_property_id: channexProp.id,
      })
      .select("id")
      .single();

    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

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
