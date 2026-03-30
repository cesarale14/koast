import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateDemandForecast } from "@/lib/pricing/forecast";

export async function GET(
  _request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership
  const { data: prop } = await supabase
    .from("properties").select("id").eq("id", params.propertyId).eq("user_id", user.id).limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!prop || (prop as any[]).length === 0) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const forecast = await generateDemandForecast(supabase, params.propertyId, 90);

  // Summary stats
  const next30 = forecast.slice(0, 30);
  const highDays = next30.filter((d) => d.demand_level === "high" || d.demand_level === "very_high").length;
  const moderateDays = next30.filter((d) => d.demand_level === "moderate").length;
  const lowDays = next30.filter((d) => d.demand_level === "low").length;

  // Find high-demand periods (consecutive high/very_high days)
  const periods: { start: string; end: string; avgScore: number; factors: string[] }[] = [];
  let periodStart: number | null = null;
  for (let i = 0; i < forecast.length; i++) {
    const isHigh = forecast[i].demand_score >= 60;
    if (isHigh && periodStart === null) periodStart = i;
    if ((!isHigh || i === forecast.length - 1) && periodStart !== null) {
      const end = isHigh ? i : i - 1;
      if (end - periodStart >= 1) {
        const slice = forecast.slice(periodStart, end + 1);
        periods.push({
          start: slice[0].date,
          end: slice[slice.length - 1].date,
          avgScore: Math.round(slice.reduce((s, d) => s + d.demand_score, 0) / slice.length),
          factors: Array.from(new Set(slice.flatMap((d) => d.factors.slice(0, 2)))).slice(0, 3),
        });
      }
      periodStart = null;
    }
  }

  return NextResponse.json({
    forecast,
    summary: { high: highDays, moderate: moderateDays, low: lowDays },
    high_demand_periods: periods.slice(0, 8),
  });
}
