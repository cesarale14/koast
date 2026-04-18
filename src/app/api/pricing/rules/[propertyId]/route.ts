import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { inferPricingRulesFromHistory } from "@/lib/pricing/rules-inference";

/**
 * GET /api/pricing/rules/[propertyId]
 *
 * Always returns a usable rules object. UI never gets 404.
 *   - If row exists: return it.
 *   - If no row and history ≥30 days: infer, insert, return (source='inferred').
 *   - If no row and insufficient history: insert safe defaults, return (source='defaults').
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();
    const propertyId = params.propertyId;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase.from("pricing_rules") as any)
      .select("*")
      .eq("property_id", propertyId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ rules: existing, exists: true });
    }

    // Try inference first.
    const inferred = await inferPricingRulesFromHistory({ supabase, propertyId });
    let insert;
    let source: "inferred" | "defaults";
    if (inferred) {
      insert = { ...inferred, property_id: propertyId, source: "inferred", auto_apply: false };
      source = "inferred";
    } else {
      // Fall back to hard-coded defaults, seeded from latest applied rate if any.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lastRate } = await (supabase.from("calendar_rates") as any)
        .select("applied_rate")
        .eq("property_id", propertyId)
        .is("channel_code", null)
        .not("applied_rate", "is", null)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const baseSeed = lastRate?.applied_rate != null ? Number(lastRate.applied_rate) : 150;
      insert = {
        property_id: propertyId,
        base_rate: baseSeed,
        min_rate: 50,
        max_rate: 1000,
        channel_markups: {},
        max_daily_delta_pct: 0.25,
        comp_floor_pct: 0.85,
        source: "defaults",
        auto_apply: false,
      };
      source = "defaults";
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: created, error: insErr } = await (supabase.from("pricing_rules") as any)
      .insert(insert)
      .select("*")
      .single();
    if (insErr) {
      return NextResponse.json({ error: `Failed to create rules row: ${insErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ rules: created, exists: true, just_created: true, source });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/rules GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PUT /api/pricing/rules/[propertyId]
 *
 * Explicit host edit. Upserts source='host_set'. Validates CHECK constraints
 * server-side before hitting the DB so errors come back with per-field
 * clarity instead of a cryptic 23514.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const {
      base_rate,
      min_rate,
      max_rate,
      channel_markups,
      max_daily_delta_pct,
      comp_floor_pct,
      seasonal_overrides,
      auto_apply,
    } = body as Record<string, unknown>;

    const errors: Record<string, string> = {};
    const n = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    const baseN = n(base_rate);
    const minN = n(min_rate);
    const maxN = n(max_rate);
    const deltaN = n(max_daily_delta_pct);
    const floorN = n(comp_floor_pct);

    if (baseN == null || baseN <= 0) errors.base_rate = "base_rate must be a positive number";
    if (minN == null || minN < 0) errors.min_rate = "min_rate must be a non-negative number";
    if (maxN == null || maxN <= 0) errors.max_rate = "max_rate must be a positive number";
    if (baseN != null && minN != null && minN > baseN) errors.min_rate = "min_rate must be ≤ base_rate";
    if (baseN != null && maxN != null && maxN < baseN) errors.max_rate = "max_rate must be ≥ base_rate";
    if (deltaN == null || deltaN <= 0 || deltaN > 1)
      errors.max_daily_delta_pct = "max_daily_delta_pct must be in (0, 1]";
    if (floorN == null || floorN < 0 || floorN > 1)
      errors.comp_floor_pct = "comp_floor_pct must be in [0, 1]";
    if (channel_markups != null && typeof channel_markups !== "object")
      errors.channel_markups = "channel_markups must be an object";
    if (seasonal_overrides != null && typeof seasonal_overrides !== "object")
      errors.seasonal_overrides = "seasonal_overrides must be an object";
    if (auto_apply != null && typeof auto_apply !== "boolean")
      errors.auto_apply = "auto_apply must be a boolean";

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: "validation_failed", field_errors: errors }, { status: 400 });
    }

    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const row = {
      property_id: params.propertyId,
      base_rate: baseN,
      min_rate: minN,
      max_rate: maxN,
      channel_markups: (channel_markups as Record<string, unknown>) ?? {},
      max_daily_delta_pct: deltaN,
      comp_floor_pct: floorN,
      seasonal_overrides: (seasonal_overrides as Record<string, unknown>) ?? {},
      auto_apply: auto_apply ?? false,
      source: "host_set",
      updated_at: now,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: upserted, error: upErr } = await (supabase.from("pricing_rules") as any)
      .upsert(row, { onConflict: "property_id" })
      .select("*")
      .single();
    if (upErr) {
      return NextResponse.json({ error: `Failed to upsert rules: ${upErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ rules: upserted, exists: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/rules PUT]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
