import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncMarketData, getApiUsage } from "@/lib/airroi/market-sync";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";

const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function GET(
  _request: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    if (!isValidUUID(params.propertyId)) return NextResponse.json({ error: "Invalid property ID" }, { status: 400 });

    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();
    const propertyId = params.propertyId;

    // Fetch property
    const { data: props } = await supabase
      .from("properties")
      .select("id, latitude, longitude")
      .eq("id", propertyId)
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propData = (props ?? []) as any[];
    if (propData.length === 0) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const snapshot = await syncMarketData(supabase, propData[0]);

    if (!snapshot) {
      return NextResponse.json(
        { error: "Could not fetch market data (property needs lat/lng)" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      snapshot,
      api_usage: getApiUsage(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[market/snapshot] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
