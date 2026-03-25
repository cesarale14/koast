import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

export async function POST(
  _request: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const supabase = createServiceClient();
    const propertyId = params.propertyId;

    // Get property's channex ID and rate plan
    const { data: props } = await supabase
      .from("properties")
      .select("id, channex_property_id")
      .eq("id", propertyId)
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const property = ((props ?? []) as any[])[0];
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }
    if (!property.channex_property_id) {
      return NextResponse.json(
        { error: "Property not connected to Channex" },
        { status: 400 }
      );
    }

    // Fetch applied rates for next 90 days
    const today = new Date().toISOString().split("T")[0];
    const end = new Date();
    end.setDate(end.getDate() + 90);
    const endStr = end.toISOString().split("T")[0];

    const { data: ratesData } = await supabase
      .from("calendar_rates")
      .select("date, applied_rate, min_stay, is_available")
      .eq("property_id", propertyId)
      .gte("date", today)
      .lte("date", endStr)
      .not("applied_rate", "is", null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rates = (ratesData ?? []) as any[];
    if (rates.length === 0) {
      return NextResponse.json({ error: "No applied rates to push" }, { status: 400 });
    }

    const channex = createChannexClient();

    // Get rate plans for this property
    const ratePlans = await channex.getRatePlans(property.channex_property_id);
    if (ratePlans.length === 0) {
      return NextResponse.json(
        { error: "No rate plans found in Channex for this property" },
        { status: 400 }
      );
    }

    const ratePlanId = ratePlans[0].id;

    // Push rates in batches (Channex accepts arrays)
    const restrictionValues = rates.map((r) => ({
      property_id: property.channex_property_id,
      rate_plan_id: ratePlanId,
      date_from: r.date,
      date_to: r.date,
      rate: Math.round(r.applied_rate * 100), // Channex uses cents
      min_stay_arrival: r.min_stay ?? 1,
      stop_sell: !r.is_available,
    }));

    // Push in batches of 50
    let pushed = 0;
    for (let i = 0; i < restrictionValues.length; i += 50) {
      const batch = restrictionValues.slice(i, i + 50);
      await channex.updateRestrictions(batch);
      pushed += batch.length;
    }

    return NextResponse.json({
      pushed,
      channex_property_id: property.channex_property_id,
      rate_plan_id: ratePlanId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/push] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
