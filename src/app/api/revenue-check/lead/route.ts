import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, address, city, state, zip, bedrooms, current_rate, estimated_opportunity, market_adr } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("leads") as any).insert({
      email,
      address: address ?? null,
      city: city ?? null,
      state: state ?? null,
      zip: zip ?? null,
      bedrooms: bedrooms ?? null,
      current_rate: current_rate ?? null,
      estimated_opportunity: estimated_opportunity ?? null,
      market_adr: market_adr ?? null,
      source: "revenue_check",
    });

    return NextResponse.json({ saved: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
