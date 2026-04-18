/**
 * GET /api/pricing/performance/[propertyId]
 *
 * Aggregated outcome summary for the Pricing tab's "how the engine
 * performed" panel. Read-only. Reads pricing_performance + joins
 * pricing_recommendations for dismissed_count.
 *
 * Query param: window = 7 | 30 | 60 | 90  (default: 30)
 *
 * Response: see types below.
 *
 * VERIFY (devtools):
 *   GET /api/pricing/performance/<propertyId>?window=30
 *   Expect: { window_days, applied_count, booked_count, ... }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

const ALLOWED_WINDOWS = new Set([7, 30, 60, 90]);

interface DailyRow {
  date: string;
  suggested_rate: number | null;
  applied_rate: number | null;
  actual_rate_if_booked: number | null;
  booked: boolean;
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
    const windowDays = Number(url.searchParams.get("window") ?? 30);
    if (!ALLOWED_WINDOWS.has(windowDays)) {
      return NextResponse.json({ error: "window must be 7|30|60|90" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    const cutoffStr = cutoff.toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: perfRows } = await (supabase.from("pricing_performance") as any)
      .select("date, suggested_rate, applied_rate, actual_rate, booked, booked_at, applied_at, revenue_delta")
      .eq("property_id", params.propertyId)
      .gte("applied_at", cutoffStr);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dismissedRows } = await (supabase.from("pricing_recommendations") as any)
      .select("id")
      .eq("property_id", params.propertyId)
      .eq("status", "dismissed")
      .gte("dismissed_at", cutoffStr);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perfs = (perfRows ?? []) as any[];
    const applied_count = perfs.length;
    const booked_count = perfs.filter((r) => r.booked).length;
    const dismissed_count = (dismissedRows ?? []).length;

    const acceptance_rate =
      applied_count + dismissed_count > 0
        ? Math.round((applied_count / (applied_count + dismissed_count)) * 100) / 100
        : null;

    const revenue_captured = perfs
      .filter((r) => r.booked && r.actual_rate != null)
      .reduce((sum, r) => sum + Number(r.actual_rate), 0);

    const revenue_delta_vs_suggested = perfs
      .filter((r) => r.booked && r.revenue_delta != null)
      .reduce((sum, r) => sum + Number(r.revenue_delta), 0);

    const deltaPcts = perfs
      .filter((r) => r.applied_rate != null && r.suggested_rate != null && Number(r.suggested_rate) > 0)
      .map((r) => (Number(r.applied_rate) - Number(r.suggested_rate)) / Number(r.suggested_rate));
    const avg_applied_delta_pct =
      deltaPcts.length > 0
        ? Math.round((deltaPcts.reduce((a, b) => a + b, 0) / deltaPcts.length) * 1000) / 1000
        : null;

    const by_date: DailyRow[] = perfs
      .map((r) => ({
        date: r.date,
        suggested_rate: r.suggested_rate != null ? Number(r.suggested_rate) : null,
        applied_rate: r.applied_rate != null ? Number(r.applied_rate) : null,
        actual_rate_if_booked: r.booked && r.actual_rate != null ? Number(r.actual_rate) : null,
        booked: r.booked === true,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    return NextResponse.json({
      window_days: windowDays,
      applied_count,
      booked_count,
      dismissed_count,
      acceptance_rate,
      revenue_captured: Math.round(revenue_captured * 100) / 100,
      revenue_delta_vs_suggested: Math.round(revenue_delta_vs_suggested * 100) / 100,
      avg_applied_delta_pct,
      by_date,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/performance GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
