import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateScenarios } from "@/lib/pricing/scenarios";

export async function GET(
  _request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: prop } = await supabase
    .from("properties").select("id").eq("id", params.propertyId).eq("user_id", user.id).limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!prop || (prop as any[]).length === 0) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const scenarios = await generateScenarios(supabase, params.propertyId);
  const totalOpportunity = scenarios.reduce((s, sc) => s + sc.estimated_impact, 0);

  return NextResponse.json({ scenarios, total_opportunity: totalOpportunity });
}
