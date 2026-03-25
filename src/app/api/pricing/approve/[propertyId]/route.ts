import { NextRequest, NextResponse } from "next/server";
import { PricingEngine } from "@/lib/pricing/engine";

export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
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
