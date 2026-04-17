import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import {
  buildSafeBdcRestrictions,
  type KoastRestrictionProposal,
} from "@/lib/channex/safe-restrictions";

/**
 * POST /api/pricing/preview-bdc-push/[propertyId]
 *
 * Dry-run the BDC safe-restrictions helper. Reads current BDC state from
 * Channex (GET, no writes) and returns the SafeRestrictionPlan that
 * /commit-bdc-push would apply. Shows the host exactly which dates will
 * change vs. which the helper refuses to touch.
 *
 * Body: { dateFrom, dateTo, koastProposed: { [date]: { rate?, availability?, stop_sell?, min_stay_arrival? } } }
 *
 * Read-only — NOT gated by KOAST_ALLOW_BDC_CALENDAR_PUSH.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const { dateFrom, dateTo, koastProposed } = body as {
      dateFrom?: string;
      dateTo?: string;
      koastProposed?: Record<string, KoastRestrictionProposal>;
    };

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: "dateFrom and dateTo are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const propertyId = params.propertyId;

    // Look up property + BDC rate plan id via property_channels.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prop } = await (supabase.from("properties") as any)
      .select("id, channex_property_id")
      .eq("id", propertyId)
      .maybeSingle();
    if (!prop?.channex_property_id) {
      return NextResponse.json(
        { error: "Property not connected to Channex" },
        { status: 400 }
      );
    }
    const channexPropertyId: string = prop.channex_property_id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bdcLink } = await (supabase.from("property_channels") as any)
      .select("settings, status")
      .eq("property_id", propertyId)
      .eq("channel_code", "BDC")
      .maybeSingle();
    const bdcRatePlanId: string | undefined = bdcLink?.settings?.rate_plan_id;
    if (!bdcRatePlanId) {
      return NextResponse.json(
        { error: "No BDC channel with a rate plan configured for this property" },
        { status: 400 }
      );
    }

    const koastMap = new Map<string, KoastRestrictionProposal>(
      Object.entries(koastProposed ?? {})
    );

    const channex = createChannexClient();
    const plan = await buildSafeBdcRestrictions({
      channex,
      channexPropertyId,
      bdcRatePlanId,
      dateFrom,
      dateTo,
      koastProposed: koastMap,
    });

    return NextResponse.json({
      plan,
      channex_property_id: channexPropertyId,
      bdc_rate_plan_id: bdcRatePlanId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/preview-bdc-push] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
