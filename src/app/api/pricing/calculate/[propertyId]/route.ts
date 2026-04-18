import { NextRequest, NextResponse } from "next/server";
import { PricingEngine } from "@/lib/pricing/engine";
import { createServiceClient } from "@/lib/supabase/service";
import { syncMarketData } from "@/lib/airroi/market-sync";
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

    const propertyId = params.propertyId;
    const body = await request.json().catch(() => ({}));
    const days = body.days ?? 90;

    const supabase = createServiceClient();

    // Fetch property for config
    const { data: props } = await supabase
      .from("properties")
      .select("id, name, latitude, longitude")
      .eq("id", propertyId)
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propData = (props ?? []) as any[];
    if (propData.length === 0) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // Ensure market snapshot exists (auto-sync if missing)
    const { data: existingSnap } = await supabase
      .from("market_snapshots")
      .select("id")
      .eq("property_id", propertyId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (((existingSnap ?? []) as any[]).length === 0 && propData[0].latitude && propData[0].longitude) {
      console.log("[pricing/calculate] No market snapshot, triggering sync...");
      try {
        await syncMarketData(supabase, propData[0]);
      } catch (e) {
        console.warn("[pricing/calculate] Market sync failed:", e);
      }
    }

    // Get base rate from existing calendar_rates
    const { data: rateData } = await supabase
      .from("calendar_rates")
      .select("base_rate, applied_rate")
      .eq("property_id", propertyId)
      .is("channel_code", null)
      .not("base_rate", "is", null)
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingRate = ((rateData ?? []) as any[])[0];
    const baseRate = existingRate?.base_rate ?? existingRate?.applied_rate ?? 150;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const engine = new PricingEngine();
    const rates = await engine.calculateRates(propertyId, startDate, endDate, {
      base_rate: baseRate,
      min_rate: Math.round(baseRate * 0.5),
      max_rate: Math.round(baseRate * 3),
      pricing_mode: body.pricing_mode ?? "review",
    });

    // Apply to database
    const updated = await engine.applyRates(rates);

    // PR C — write pricing_recommendations rows with the new clamps
    // metadata + plain-English reason_text + urgency classification so
    // the PR D UI can surface "Koast wanted $X but your max is $Y" as
    // an actionable insight. reason_signals merges the engine's factors
    // (per-signal breakdown) with a `clamps` sub-object containing
    // raw_engine_suggestion, clamped_by, and guardrail_trips.
    //
    // Note: pricing_validator.py also writes pricing_recommendations
    // (with live-Channex current_rate). These route-written rows have
    // current_rate=null; the validator fills that in on its daily run.
    //
    // VERIFY (browser devtools):
    //   POST /api/pricing/calculate/<propertyId>  body: {"days":7}
    //   Expect: { dates_calculated: N, recommendations_written: N, ... }
    //   Then: SELECT reason_signals, reason_text, urgency, status FROM
    //         pricing_recommendations WHERE property_id='<id>'
    //         ORDER BY created_at DESC LIMIT 5;
    const recRows = rates.map((r) => ({
      property_id: r.property_id,
      date: r.date,
      current_rate: null,
      suggested_rate: r.suggested_rate,
      reason_signals: { ...r.factors, clamps: r.clamps },
      reason_text: r.reason_text,
      urgency: r.urgency,
      status: "pending",
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supabase.from("pricing_recommendations") as any).insert(recRows);
    if (insErr) {
      console.warn("[pricing/calculate] pricing_recommendations insert failed:", insErr.message);
    }

    return NextResponse.json({
      property: propData[0].name,
      dates_calculated: rates.length,
      dates_updated: updated,
      recommendations_written: insErr ? 0 : recRows.length,
      base_rate: baseRate,
      rate_range: {
        min: Math.min(...rates.map((r) => r.suggested_rate)),
        max: Math.max(...rates.map((r) => r.suggested_rate)),
        avg: Math.round(rates.reduce((s, r) => s + r.suggested_rate, 0) / rates.length),
      },
      sample: rates.slice(0, 7).map((r) => ({
        date: r.date,
        suggested: r.suggested_rate,
        applied: r.applied_rate,
        factors: r.factors,
        clamps: r.clamps,
        reason_text: r.reason_text,
        urgency: r.urgency,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/calculate] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
