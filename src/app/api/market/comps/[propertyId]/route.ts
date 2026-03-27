import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildCompSet, storeCompSet } from "@/lib/airroi/compsets";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";

export async function GET(
  _request: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();
    const propertyId = params.propertyId;

    // Check for cached comps
    const { data: cached } = await supabase
      .from("market_comps")
      .select("*")
      .eq("property_id", propertyId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cachedComps = (cached ?? []) as any[];

    // Return cached if less than 7 days old
    if (cachedComps.length > 0) {
      const newest = cachedComps.reduce((a, b) =>
        new Date(a.last_synced) > new Date(b.last_synced) ? a : b
      );
      const age = Date.now() - new Date(newest.last_synced).getTime();
      if (age < 7 * 24 * 60 * 60 * 1000) {
        return NextResponse.json({
          source: "cache",
          comps: cachedComps,
        });
      }
    }

    // Fetch property
    const { data: props } = await supabase
      .from("properties")
      .select("id, latitude, longitude, bedrooms, bathrooms, max_guests")
      .eq("id", propertyId)
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propData = (props ?? []) as any[];
    if (propData.length === 0) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const property = propData[0];
    if (!property.latitude || !property.longitude) {
      return NextResponse.json(
        { error: "Property has no location data (lat/lng required)" },
        { status: 400 }
      );
    }

    // Build comp set from AirROI (use defaults if bedrooms/baths not set)
    const compProperty = {
      ...property,
      bedrooms: property.bedrooms ?? 2,
      bathrooms: property.bathrooms ?? 1,
      max_guests: property.max_guests ?? 4,
    };
    const compSet = await buildCompSet(compProperty);
    await storeCompSet(supabase, propertyId, compSet);

    return NextResponse.json({
      source: "airroi",
      ...compSet,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[market/comps] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
