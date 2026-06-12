/**
 * GET /api/billing/status (P5) — the host's current plan, for the Settings UI.
 * Always works (even billing-off → proAccess true, billingEnabled false). Read-only.
 */

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveAccess } from "@/lib/billing/plan";

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServiceClient();
    const access = await resolveAccess(supabase, user.id);
    return NextResponse.json(access);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[billing/status]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
