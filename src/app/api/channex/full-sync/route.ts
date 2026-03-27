import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { channex_property_id } = await request.json();
    if (!channex_property_id) {
      return NextResponse.json({ error: "channex_property_id required" }, { status: 400 });
    }

    const channex = createChannexClient();

    // Fetch room types and rate plans for this property
    const roomTypes = await channex.getRoomTypes(channex_property_id);
    const ratePlans = await channex.getRatePlans(channex_property_id);

    if (roomTypes.length === 0) {
      return NextResponse.json({ error: "No room types found for this property" }, { status: 400 });
    }

    const roomTypeIds = roomTypes.map((rt) => rt.id);
    const ratePlanMappings = ratePlans.map((rp) => ({
      ratePlanId: rp.id,
      roomTypeId: rp.attributes.room_type_id,
    }));

    console.log(`[full-sync] Property ${channex_property_id}: ${roomTypeIds.length} room types, ${ratePlanMappings.length} rate plans`);

    const result = await channex.fullSync(
      channex_property_id,
      roomTypeIds,
      ratePlanMappings,
      500
    );

    return NextResponse.json({
      success: true,
      roomTypes: roomTypeIds.length,
      ratePlans: ratePlanMappings.length,
      availabilityResult: result.availabilityResult,
      restrictionsResult: result.restrictionsResult,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[full-sync] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
