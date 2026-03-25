import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildCompSet, storeCompSet } from "@/lib/airroi/compsets";

export async function GET(
  _request: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const supabase = createClient();
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

    // Build comp set from AirROI
    const compSet = await buildCompSet(property);
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
