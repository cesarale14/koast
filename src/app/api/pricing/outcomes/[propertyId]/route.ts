import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(
  _request: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const supabase = createServiceClient();

    const { data } = await supabase
      .from("pricing_outcomes")
      .select("*")
      .eq("property_id", params.propertyId)
      .order("date", { ascending: false })
      .limit(180);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcomes = (data ?? []) as any[];

    const booked = outcomes.filter((o) => o.was_booked);
    const totalDates = outcomes.length;
    const bookedPct = totalDates > 0 ? Math.round((booked.length / totalDates) * 100) : 0;
    const avgRevenueVsSuggested = booked.length > 0
      ? Math.round(booked.reduce((s: number, o: { revenue_vs_suggested: number }) => s + (o.revenue_vs_suggested ?? 0), 0) / booked.length)
      : 0;

    // Conversion by price tier
    const tiers: Record<string, { total: number; booked: number }> = {};
    for (const o of outcomes) {
      const rate = o.applied_rate ?? 0;
      const tierKey = rate < 100 ? "<$100" : rate < 150 ? "$100-149" : rate < 200 ? "$150-199" : rate < 250 ? "$200-249" : "$250+";
      if (!tiers[tierKey]) tiers[tierKey] = { total: 0, booked: 0 };
      tiers[tierKey].total++;
      if (o.was_booked) tiers[tierKey].booked++;
    }

    const conversionByTier = Object.entries(tiers).map(([tier, { total, booked: b }]) => ({
      tier,
      total,
      booked: b,
      conversion: total > 0 ? Math.round((b / total) * 100) : 0,
    }));

    return NextResponse.json({
      total_dates: totalDates,
      booked_pct: bookedPct,
      avg_revenue_vs_suggested: avgRevenueVsSuggested,
      conversion_by_tier: conversionByTier,
      outcomes: outcomes.slice(0, 30),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
