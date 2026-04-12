import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
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

    // Resolve which rate plans to push to.
    //
    // Preferred: use per-channel rate plans registered in property_channels
    // so each channel gets its own rate (different Airbnb vs Booking.com
    // prices are supported and channels don't overwrite each other).
    //
    // Fallback: if the user hasn't connected any channels through the
    // dedicated flow yet, fall back to pushing to every rate plan on the
    // Channex property (legacy behavior for properties that were imported
    // directly from Channex without going through connect-booking-com).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: channelLinks } = await (supabase.from("property_channels") as any)
      .select("channel_code, channel_name, settings, status")
      .eq("property_id", propertyId)
      .eq("status", "active");

    type RatePlanTarget = { id: string; channel: string };
    const targets: RatePlanTarget[] = [];

    for (const link of (channelLinks ?? []) as Array<{
      channel_code: string;
      channel_name: string;
      settings: { rate_plan_id?: string } | null;
    }>) {
      const rpId = link.settings?.rate_plan_id;
      if (rpId) targets.push({ id: rpId, channel: link.channel_code });
    }

    if (targets.length === 0) {
      // Legacy fallback — push to every rate plan on the Channex property
      const ratePlans = await channex.getRatePlans(property.channex_property_id);
      if (ratePlans.length === 0) {
        return NextResponse.json(
          { error: "No rate plans found in Channex for this property" },
          { status: 400 }
        );
      }
      for (const rp of ratePlans) targets.push({ id: rp.id, channel: "legacy" });
    }

    // Push rates to each targeted rate plan. Currently all channels get the
    // same applied_rate — per-channel pricing multipliers would go here
    // (e.g. BDC gets 1.15x to cover commission) if the user configures them.
    const restrictionValues = rates.flatMap((r) =>
      targets.map((t) => ({
        property_id: property.channex_property_id,
        rate_plan_id: t.id,
        date_from: r.date,
        date_to: r.date,
        rate: Math.round(r.applied_rate * 100), // Channex uses cents
        min_stay_arrival: r.min_stay ?? 1,
        stop_sell: !r.is_available,
      }))
    );

    let pushed = 0;
    for (let i = 0; i < restrictionValues.length; i += 200) {
      const batch = restrictionValues.slice(i, i + 200);
      await channex.updateRestrictions(batch);
      pushed += batch.length;
    }

    return NextResponse.json({
      pushed,
      channex_property_id: property.channex_property_id,
      ratePlans: targets.length,
      targets: targets.map((t) => t.channel),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/push] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
