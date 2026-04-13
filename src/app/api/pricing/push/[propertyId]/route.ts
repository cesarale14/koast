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

    // Fetch rates for the next 90 days — BOTH base rates (channel_code=NULL)
    // and any per-channel overrides. Per-channel overrides take precedence
    // for their channel; the base rate is the fallback for channels that
    // don't have an explicit override set.
    const today = new Date().toISOString().split("T")[0];
    const end = new Date();
    end.setDate(end.getDate() + 90);
    const endStr = end.toISOString().split("T")[0];

    // Base rates
    const { data: baseRatesData } = await supabase
      .from("calendar_rates")
      .select("date, applied_rate, min_stay, is_available")
      .eq("property_id", propertyId)
      .is("channel_code", null)
      .gte("date", today)
      .lte("date", endStr)
      .not("applied_rate", "is", null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseRates = (baseRatesData ?? []) as Array<{
      date: string;
      applied_rate: number;
      min_stay: number | null;
      is_available: boolean;
    }>;
    if (baseRates.length === 0) {
      return NextResponse.json({ error: "No applied rates to push" }, { status: 400 });
    }

    // Per-channel override rates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: overrideRatesData } = await (supabase.from("calendar_rates") as any)
      .select("date, channel_code, applied_rate, min_stay, is_available")
      .eq("property_id", propertyId)
      .not("channel_code", "is", null)
      .gte("date", today)
      .lte("date", endStr);

    // overrides[channel_code][date] = { rate, min_stay, is_available }
    const overrides = new Map<string, Map<string, { applied_rate: number; min_stay: number | null; is_available: boolean }>>();
    for (const r of (overrideRatesData ?? []) as Array<{
      date: string;
      channel_code: string;
      applied_rate: number | null;
      min_stay: number | null;
      is_available: boolean;
    }>) {
      if (r.applied_rate == null) continue;
      if (!overrides.has(r.channel_code)) overrides.set(r.channel_code, new Map());
      overrides.get(r.channel_code)!.set(r.date, {
        applied_rate: Number(r.applied_rate),
        min_stay: r.min_stay,
        is_available: r.is_available,
      });
    }

    const channex = createChannexClient();

    // Resolve which rate plans to push to via per-channel registration.
    // Legacy fallback: if no property_channels entries exist, push to every
    // rate plan on the Channex property (keeps properties imported directly
    // from Channex working without going through connect-booking-com).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: channelLinks } = await (supabase.from("property_channels") as any)
      .select("channel_code, channel_name, settings, status")
      .eq("property_id", propertyId)
      .eq("status", "active");

    type RatePlanTarget = { id: string; channel: string };
    const targets: RatePlanTarget[] = [];

    // Push to every connected channel — Airbnb, Booking.com, Vrbo all get
    // rates via their dedicated Channex rate plans. Moora is the single
    // source of truth for pricing.
    for (const link of (channelLinks ?? []) as Array<{
      channel_code: string;
      channel_name: string;
      settings: { rate_plan_id?: string } | null;
    }>) {
      const rpId = link.settings?.rate_plan_id;
      if (rpId) targets.push({ id: rpId, channel: link.channel_code });
    }

    if (targets.length === 0) {
      const ratePlans = await channex.getRatePlans(property.channex_property_id);
      if (ratePlans.length === 0) {
        return NextResponse.json(
          { error: "No rate plans found in Channex for this property" },
          { status: 400 }
        );
      }
      for (const rp of ratePlans) targets.push({ id: rp.id, channel: "legacy" });
    }

    // Per-target, per-date restrictions. For each target channel, use the
    // per-channel override if one exists for the date, else the base rate.
    // This ensures manual markups (e.g. BDC +15%) are preserved when the
    // pricing engine re-pushes — the biggest risk we're fixing here.
    const restrictionValues: Array<{
      property_id: string;
      rate_plan_id: string;
      date_from: string;
      date_to: string;
      rate: number;
      min_stay_arrival: number;
      stop_sell: boolean;
    }> = [];

    for (const t of targets) {
      const channelOverrides = overrides.get(t.channel);
      for (const base of baseRates) {
        const override = channelOverrides?.get(base.date);
        const rateDollars = override?.applied_rate ?? base.applied_rate;
        const minStay = override?.min_stay ?? base.min_stay ?? 1;
        const isAvailable = override?.is_available ?? base.is_available;
        restrictionValues.push({
          property_id: property.channex_property_id,
          rate_plan_id: t.id,
          date_from: base.date,
          date_to: base.date,
          rate: Math.round(rateDollars * 100),
          min_stay_arrival: minStay,
          stop_sell: !isAvailable,
        });
      }
    }

    let pushed = 0;
    for (let i = 0; i < restrictionValues.length; i += 200) {
      const batch = restrictionValues.slice(i, i + 200);
      await channex.updateRestrictions(batch);
      pushed += batch.length;
    }

    // Summarize: which channels had overrides actually applied for any date?
    const channelsWithOverrides = Array.from(overrides.keys());

    return NextResponse.json({
      pushed,
      channex_property_id: property.channex_property_id,
      ratePlans: targets.length,
      targets: targets.map((t) => t.channel),
      channels_with_overrides: channelsWithOverrides,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/push] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
