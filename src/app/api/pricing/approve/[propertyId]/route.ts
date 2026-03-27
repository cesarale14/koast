import { NextRequest, NextResponse } from "next/server";
import { PricingEngine } from "@/lib/pricing/engine";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { dates } = await request.json();

    if (!Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json(
        { error: "Provide an array of dates to approve" },
        { status: 400 }
      );
    }

    const engine = new PricingEngine();
    const approved = await engine.approveRates(params.propertyId, dates);

    return NextResponse.json({
      approved,
      total_requested: dates.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/approve] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
