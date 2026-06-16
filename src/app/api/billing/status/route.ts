/**
 * GET /api/billing/status (P5) — the host's current plan, for the Settings UI.
 * Always works (even billing-off → proAccess true, billingEnabled false). Read-only.
 *
 * Also returns `proPrice` — the live, charge-accurate Pro price read from the
 * configured Stripe price object (operator msg 3730 pricing-integrity rule).
 * null when billing is off / no price id / lookup fails; the UI then shows no
 * price rather than a static one that could diverge from the charge.
 */

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveAccess } from "@/lib/billing/plan";
import { getProPrice } from "@/lib/billing/stripe";

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServiceClient();
    const access = await resolveAccess(supabase, user.id);
    const proPrice = await getProPrice();
    return NextResponse.json({ ...access, proPrice });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[billing/status]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
