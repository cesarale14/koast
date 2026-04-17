import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncMarketData, getApiUsage } from "@/lib/airroi/market-sync";
import { buildFilteredCompSet } from "@/lib/airroi/compsets";
import { getAuthenticatedUser, verifyPropertyOwnership, verifyServiceKey } from "@/lib/auth/api-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    // Allow VPS workers with service key to bypass session auth
    if (verifyServiceKey(request)) {
      // Service key valid — skip user auth, proceed with propertyId from params
    } else {
      const { user } = await getAuthenticatedUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
      if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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

    // Refresh both market snapshot and comp set in parallel. The comp-set
    // path now uses buildFilteredCompSet — the same bed/price/radius
    // filtered logic that runs at property import. Previously market_sync
    // called buildCompSet (unfiltered top-15 from /comparables) which
    // clobbered first-time-import rows within 24h; that's resolved by
    // unifying on this single canonical builder.
    const [snapshot, compResult] = await Promise.all([
      syncMarketData(supabase, property, true),
      buildFilteredCompSet(supabase, propertyId),
    ]);

    return NextResponse.json({
      snapshot,
      compSet: {
        total_comps: compResult.summary.total_comps,
        summary: compResult.summary,
        skipped_reason: compResult.reason ?? null,
      },
      api_usage: getApiUsage(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[market/refresh] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
