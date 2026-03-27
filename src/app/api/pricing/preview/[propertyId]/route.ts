import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";

export async function GET(
  _request: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();
    const propertyId = params.propertyId;
    const today = new Date().toISOString().split("T")[0];
    const end = new Date();
    end.setDate(end.getDate() + 90);
    const endStr = end.toISOString().split("T")[0];

    const { data } = await supabase
      .from("calendar_rates")
      .select("date, base_rate, suggested_rate, applied_rate, rate_source, factors, is_available, min_stay")
      .eq("property_id", propertyId)
      .gte("date", today)
      .lte("date", endStr)
      .order("date");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rates = (data ?? []) as any[];

    const needsApproval = rates.filter(
      (r) => r.suggested_rate != null && r.applied_rate !== r.suggested_rate
    );

    return NextResponse.json({
      total_dates: rates.length,
      needs_approval: needsApproval.length,
      rates,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/preview] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
