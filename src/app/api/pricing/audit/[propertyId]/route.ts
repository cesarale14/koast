/**
 * GET /api/pricing/audit/[propertyId]?date=YYYY-MM-DD
 *
 * Per-date "why this suggestion?" drill-down. Read-only. Returns the
 * newest pricing_recommendations row for (property, date) with the
 * signal breakdown decomposed for UI rendering, plus the rules in
 * effect and auto-apply blocker explainer.
 *
 * VERIFY (devtools):
 *   GET /api/pricing/audit/<propertyId>?date=2026-04-20
 *   Expect: { date, recommendation, signals_breakdown, rules_at_time_of_recommendation,
 *             comp_set_quality, auto_apply_blockers }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

interface SignalRow {
  signal: string;
  score: number;
  weight: number;
  confidence: number;
  effective_weight: number;
  reason: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Newest recommendation snapshot for this (property, date).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recRow } = await (supabase.from("pricing_recommendations") as any)
      .select("*")
      .eq("property_id", params.propertyId)
      .eq("date", date)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!recRow) {
      return NextResponse.json({ error: "No recommendation found for this date" }, { status: 404 });
    }

    // Rules snapshot — we don't version rules yet, so "rules at time of
    // recommendation" is today's rules row. When we add rules_history,
    // this swaps to a timestamp-bounded lookup.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rulesRow } = await (supabase.from("pricing_rules") as any)
      .select("*")
      .eq("property_id", params.propertyId)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: propRow } = await (supabase.from("properties") as any)
      .select("comp_set_quality")
      .eq("id", params.propertyId)
      .maybeSingle();
    const comp_set_quality = (propRow?.comp_set_quality as "precise" | "fallback" | "insufficient" | "unknown") ?? "unknown";

    // Decompose reason_signals JSONB. Signal entries have score/weight/
    // confidence/reason; the special "clamps" key sits alongside and is
    // NOT a signal. Effective weight computed per the engine's normalization.
    const signalsRaw = (recRow.reason_signals ?? {}) as Record<string, unknown>;
    const signalEntries = Object.entries(signalsRaw).filter(([k]) => k !== "clamps");
    const parsed = signalEntries.map(([id, raw]) => {
      const r = raw as { score?: number; weight?: number; confidence?: number; reason?: string };
      return {
        id,
        score: typeof r.score === "number" ? r.score : 0,
        weight: typeof r.weight === "number" ? r.weight : 0,
        confidence: typeof r.confidence === "number" ? r.confidence : 1.0,
        reason: typeof r.reason === "string" ? r.reason : "",
      };
    });
    const totalEffective = parsed.reduce((sum, s) => sum + s.weight * s.confidence, 0);
    const signals_breakdown: SignalRow[] = parsed.map((s) => ({
      signal: s.id,
      score: s.score,
      weight: Math.round(s.weight * 1000) / 1000,
      confidence: s.confidence,
      effective_weight: totalEffective > 0
        ? Math.round(((s.weight * s.confidence) / totalEffective) * 1000) / 1000
        : 0,
      reason: s.reason,
    }));

    // auto_apply_blockers — enumerate why auto-apply wouldn't fire for
    // this property right now. Stage 1 ships the explainer even though
    // auto_apply itself isn't wired; the UI uses it to show "Koast can
    // auto-apply after X days of validation / turn on auto-apply in rules."
    const autoApplyBlockers: Array<{ condition: string; current_state: unknown; required_state: unknown }> = [];

    if (!rulesRow?.auto_apply) {
      autoApplyBlockers.push({
        condition: "auto_apply_disabled",
        current_state: rulesRow?.auto_apply ?? false,
        required_state: true,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: validationCount } = await (supabase.from("pricing_recommendations") as any)
      .select("created_at", { count: "exact", head: false })
      .eq("property_id", params.propertyId);
    const validationDays = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of ((validationCount ?? []) as any[])) {
      if (r.created_at) validationDays.add(String(r.created_at).split("T")[0]);
    }
    if (validationDays.size < 14) {
      autoApplyBlockers.push({
        condition: "validation_days_below_14",
        current_state: validationDays.size,
        required_state: 14,
      });
    }

    // Recent comp_floor_exceeds_max_rate conflicts flag a rules-quality
    // concern the host should address before enabling auto-apply.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recentConflicts } = await (supabase.from("pricing_recommendations") as any)
      .select("reason_signals")
      .eq("property_id", params.propertyId)
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .limit(100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conflictCount = ((recentConflicts ?? []) as any[]).filter((r) => {
      const trips = (r.reason_signals?.clamps?.guardrail_trips ?? []) as Array<{ guardrail?: string }>;
      return trips.some((t) => t.guardrail === "comp_floor_exceeds_max_rate");
    }).length;
    if (conflictCount >= 3) {
      autoApplyBlockers.push({
        condition: "recent_comp_floor_conflicts",
        current_state: conflictCount,
        required_state: "resolve by raising max_rate in rules",
      });
    }

    return NextResponse.json({
      date,
      recommendation: recRow,
      signals_breakdown,
      rules_at_time_of_recommendation: rulesRow ?? null,
      comp_set_quality,
      auto_apply_blockers: autoApplyBlockers,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/audit GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
