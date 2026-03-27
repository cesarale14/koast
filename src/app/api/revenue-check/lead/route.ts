import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/pooled";
import { leads } from "@/lib/db/schema";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, address, city, state, zip, bedrooms, current_rate, estimated_opportunity, market_adr } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    await db.insert(leads).values({
      email,
      address: address ?? null,
      city: city ?? null,
      state: state ?? null,
      zip: zip ?? null,
      bedrooms: bedrooms ?? null,
      currentRate: current_rate ? String(current_rate) : null,
      estimatedOpportunity: estimated_opportunity ? String(estimated_opportunity) : null,
      marketAdr: market_adr ? String(market_adr) : null,
      source: "revenue_check",
    });

    return NextResponse.json({ saved: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
