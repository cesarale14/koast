/**
 * POST /api/reviews/sync
 *
 * Session 6 — pull Channex reviews into guest_reviews. Scope-by
 * property_id if provided, else every Channex-mapped property the
 * authed user owns. Polling-based MVP; review-event webhook
 * subscription is deferred (event_mask undocumented per
 * channex-expert known-quirks #6).
 *
 * Session 6.7 — logic moved to src/lib/reviews/sync.ts so the same
 * upsert path runs from the import + connect-booking-com/activate
 * on-connect triggers without HTTP round-tripping.
 *
 * Body:   { property_id?: string }
 * Returns ReviewSyncResult (see src/lib/reviews/sync.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncReviewsForUser } from "@/lib/reviews/sync";

export async function POST(request: NextRequest) {
  try {
    const auth = createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const propertyId: string | undefined = body?.property_id;

    const result = await syncReviewsForUser({ userId: user.id, propertyId });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[reviews/sync]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
