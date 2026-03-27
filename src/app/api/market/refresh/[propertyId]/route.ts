import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncMarketData, getApiUsage } from "@/lib/airroi/market-sync";
import { buildCompSet, storeCompSet } from "@/lib/airroi/compsets";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";

export async function POST(
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
        { error: "Property has no location data" },
        { status: 400 }
      );
    }

    // Ensure property has defaults for comp search
    const compProperty = {
      ...property,
      bedrooms: property.bedrooms ?? 2,
      bathrooms: property.bathrooms ?? 1,
      max_guests: property.max_guests ?? 4,
    };

    // Force refresh both market snapshot and comp set
    const [snapshot, compSet] = await Promise.all([
      syncMarketData(supabase, property, true),
      buildCompSet(compProperty).then(async (cs) => {
        await storeCompSet(supabase, propertyId, cs);
        return cs;
      }),
    ]);

    return NextResponse.json({
      snapshot,
      compSet: compSet
        ? { total_comps: compSet.comps.length, summary: compSet.summary }
        : null,
      api_usage: getApiUsage(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[market/refresh] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
