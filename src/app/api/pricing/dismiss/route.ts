import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/pricing/dismiss
 *
 * Body: { recommendation_id, reason? }
 *
 * Sets pricing_recommendations.status='dismissed' + dismissed_at=now().
 * 404 if the recommendation doesn't exist or isn't owned by this user.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { recommendation_id } = body as { recommendation_id?: string };
    if (!recommendation_id) {
      return NextResponse.json(
        { error: "recommendation_id is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    // Join via properties.user_id ownership to prevent cross-tenant dismissal.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recRow } = await (supabase.from("pricing_recommendations") as any)
      .select("id, property_id, status, properties!inner(user_id)")
      .eq("id", recommendation_id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!recRow || (recRow as any).properties?.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upErr } = await (supabase.from("pricing_recommendations") as any)
      .update({ status: "dismissed", dismissed_at: now })
      .eq("id", recommendation_id);
    if (upErr) {
      return NextResponse.json({ error: `Dismiss failed: ${upErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ dismissed: true, recommendation_id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/dismiss]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
