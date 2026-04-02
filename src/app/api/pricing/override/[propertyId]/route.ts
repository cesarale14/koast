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

    const { dates, rate } = await request.json();

    if (!Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json(
        { error: "Provide an array of dates" },
        { status: 400 }
      );
    }
    if (typeof rate !== "number" || rate <= 0) {
      return NextResponse.json(
        { error: "Provide a positive rate" },
        { status: 400 }
      );
    }

    const engine = new PricingEngine();
    const updated = await engine.overrideRates(params.propertyId, dates, rate);

    return NextResponse.json({
      updated,
      rate,
      total_requested: dates.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pricing/override] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
