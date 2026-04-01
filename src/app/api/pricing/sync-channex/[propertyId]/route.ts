import { NextRequest, NextResponse } from "next/server";
import { createChannexClient } from "@/lib/channex/client";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const dates: string[] = body.dates;
    if (!dates || dates.length === 0) {
      return NextResponse.json({ error: "dates array required" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Get property's Channex ID
    const { data: propData } = await supabase
      .from("properties")
      .select("channex_property_id")
      .eq("id", params.propertyId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prop = ((propData ?? []) as any[])[0];
    if (!prop?.channex_property_id) {
      return NextResponse.json({ synced: false, reason: "Not connected to Channex" });
    }

    const channexPropId = prop.channex_property_id;

    // Get current rates for requested dates
    const { data: rateData } = await supabase
      .from("calendar_rates")
      .select("date, applied_rate, min_stay, is_available")
      .eq("property_id", params.propertyId)
      .in("date", dates);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rates = (rateData ?? []) as any[];

    if (rates.length === 0) {
      return NextResponse.json({ synced: false, reason: "No rates found for dates" });
    }

    // Get all rate plans from Channex
    const channex = createChannexClient();
    const ratePlans = await channex.getRatePlans(channexPropId);

    if (ratePlans.length === 0) {
      return NextResponse.json({ synced: false, reason: "No rate plans in Channex" });
    }

    // Build restriction values: each date × each rate plan
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values: any[] = [];
    for (const r of rates) {
      if (r.applied_rate == null) continue;
      for (const rp of ratePlans) {
        values.push({
          property_id: channexPropId,
          rate_plan_id: rp.id,
          date_from: r.date,
          date_to: r.date,
          rate: Math.round(Number(r.applied_rate) * 100), // cents
          min_stay_arrival: r.min_stay ?? 1,
          stop_sell: r.is_available === false,
        });
      }
    }

    if (values.length === 0) {
      return NextResponse.json({ synced: false, reason: "No rates to push" });
    }

    const result = await channex.updateRestrictions(values);
    console.log(`[sync-channex] Pushed ${values.length} restrictions for ${dates.length} dates (${ratePlans.length} rate plans)`);

    return NextResponse.json({
      synced: true,
      pushed: values.length,
      dates: dates.length,
      ratePlans: ratePlans.length,
      taskId: result?.data?.[0]?.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-channex] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
