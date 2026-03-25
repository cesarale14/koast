import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncMarketData, getApiUsage } from "@/lib/airroi/market-sync";

export async function GET(
  _request: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const supabase = createClient();
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
