/**
 * GET /api/pricing/recommendations/[propertyId]
 *
 * List pricing recommendations for a property. Read-only. Powers the
 * future UI's recommendation list.
 *
 * Query params:
 *   status = pending | applied | dismissed  (default: pending)
 *   limit  = N                                (default: 200, max: 500)
 *   since  = ISO date (optional)              (filter by created_at >= since)
 *
 * Response:
 *   {
 *     recommendations: Array<{ id, property_id, date, current_rate,
 *       suggested_rate, delta_abs, delta_pct, urgency, reason_text,
 *       status, reason_signals, created_at, applied_at, dismissed_at }>,
 *     total_count: N
 *   }
 *
 * Sort: urgency priority (act_now > coming_up > review > null), date ASC,
 * created_at DESC. Ordering happens server-side via a CASE expression.
 *
 * VERIFY (devtools):
 *   GET /api/pricing/recommendations/<propertyId>?status=pending
 *   Expect: { recommendations: [...], total_count: N }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

const URGENCY_ORDER: Record<string, number> = {
  act_now: 0,
  coming_up: 1,
  review: 2,
};

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
    const status = url.searchParams.get("status") ?? "pending";
    const limitParam = Number(url.searchParams.get("limit") ?? 200);
    const limit = Math.min(500, Math.max(1, Number.isFinite(limitParam) ? limitParam : 200));
    const since = url.searchParams.get("since");

    if (!["pending", "applied", "dismissed"].includes(status)) {
      return NextResponse.json({ error: "status must be one of pending|applied|dismissed" }, { status: 400 });
    }

    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from("pricing_recommendations") as any)
      .select("*")
      .eq("property_id", params.propertyId)
      .eq("status", status)
      .order("date", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (since) query = query.gte("created_at", since);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((data ?? []) as any[]).sort((a, b) => {
      const ua = URGENCY_ORDER[a.urgency ?? "review"] ?? 3;
      const ub = URGENCY_ORDER[b.urgency ?? "review"] ?? 3;
      if (ua !== ub) return ua - ub;
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });

    return NextResponse.json({ recommendations: rows, total_count: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/recommendations GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
