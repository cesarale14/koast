/**
 * POST /api/pricing/detect-opportunities/[propertyId]
 *
 * Runs the P4.4 opportunity detectors (gap-night + stale-weekend) for one
 * property and emits each as an adjust_price PROPOSAL through the P3 lane
 * (pending on Koast-suggests + the bell). Read-then-propose; pushes NOTHING to
 * any OTA — adjust_price is otaTouching, so the proposals are creatable while the
 * OTA flag is off and remain non-executable until A4.
 *
 * Auth: a VPS worker calls it with the service key (proposals stamp the
 * property's owner as host_id); a host can also trigger it for their own property.
 *
 * Body (optional): { maxProposals?: number }.
 *
 * VERIFY (devtools / curl with service key):
 *   POST /api/pricing/detect-opportunities/<propertyId>
 *   Expect: { created: [...], detected, skippedAlreadyProposed, capped }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership, verifyServiceKey } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { detectPricingOpportunities } from "@/lib/pricing/opportunity-detect";

export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } },
) {
  try {
    const propertyId = params.propertyId;
    const isService = verifyServiceKey(request);

    if (!isService) {
      const { user } = await getAuthenticatedUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const owner = await verifyPropertyOwnership(user.id, propertyId);
      if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = createServiceClient();
    // Resolve the property owner — proposals must stamp the right host_id (RLS),
    // and the display block carries the property name.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prop } = await (supabase.from("properties") as any)
      .select("user_id, name")
      .eq("id", propertyId)
      .maybeSingle();
    if (!prop?.user_id) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const maxProposals =
      typeof body.maxProposals === "number" && Number.isFinite(body.maxProposals)
        ? Math.max(1, Math.min(50, body.maxProposals))
        : undefined;

    const result = await detectPricingOpportunities(supabase, {
      propertyId,
      hostId: prop.user_id,
      propertyName: prop.name ?? null,
      maxProposals,
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/detect-opportunities]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
