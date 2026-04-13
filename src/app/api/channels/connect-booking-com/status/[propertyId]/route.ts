import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/channels/connect-booking-com/status/[propertyId]
 *
 * Returns the current BDC channel state for a property so the UI can
 * poll during the async parent-rate discovery phase. Response shape:
 *   {
 *     status: "pending_authorization" | "active" | "activation_failed" | null,
 *     rate_discovery: "not_needed" | "in_progress" | "complete" | "failed",
 *     parent_rate_plan_code: number | null,
 *     hotel_id: string | null,
 *     channex_channel_id: string | null
 *   }
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: link } = await (supabase.from("property_channels") as any)
      .select("channex_channel_id, status, settings, last_sync_at")
      .eq("property_id", params.propertyId)
      .eq("channel_code", "BDC")
      .maybeSingle();

    if (!link) {
      return NextResponse.json({
        status: null,
        rate_discovery: "not_needed",
        parent_rate_plan_code: null,
        hotel_id: null,
        channex_channel_id: null,
      });
    }

    const settings = (link.settings ?? {}) as {
      hotel_id?: string;
      rate_plan_id?: string;
      parent_rate_plan_code?: number;
      rate_discovery?: "in_progress" | "complete" | "failed";
    };

    // Derive rate_discovery status. If parent_rate_plan_code is already
    // set, we're complete regardless of the stored flag. Otherwise use
    // whatever the background task has written (or "in_progress" if it's
    // still running and hasn't set it yet).
    let rateDiscovery: "not_needed" | "in_progress" | "complete" | "failed";
    if (settings.parent_rate_plan_code != null) {
      rateDiscovery = "complete";
    } else if (!settings.rate_plan_id) {
      rateDiscovery = "not_needed";
    } else {
      rateDiscovery = settings.rate_discovery ?? "in_progress";
    }

    return NextResponse.json({
      status: link.status,
      rate_discovery: rateDiscovery,
      parent_rate_plan_code: settings.parent_rate_plan_code ?? null,
      hotel_id: settings.hotel_id ?? null,
      channex_channel_id: link.channex_channel_id ?? null,
      last_sync_at: link.last_sync_at ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[connect-bdc/status] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
