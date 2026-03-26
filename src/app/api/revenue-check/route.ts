import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createAirROIClient } from "@/lib/airroi/client";

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "StayCommand/1.0 (contact@staycommand.com)" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, city, state, zip, bedrooms, current_rate } = body;

    if (!bedrooms || !current_rate) {
      return NextResponse.json({ error: "Bedrooms and current rate are required" }, { status: 400 });
    }

    // Rate limit: 10 per hour per IP
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const supabase = createServiceClient();

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentChecks } = await supabase
      .from("revenue_checks")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ip)
      .gte("created_at", hourAgo);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((recentChecks as any)?.length > 10) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again in an hour." }, { status: 429 });
    }

    // Geocode
    const fullAddress = [address, city, state, zip].filter(Boolean).join(", ");
    const coords = await geocode(fullAddress);
    if (!coords) {
      return NextResponse.json({ error: "Could not find that address. Try including city and state." }, { status: 400 });
    }

    const airroi = createAirROIClient();

    // Market lookup + summary
    const market = await airroi.lookupMarket(coords.lat, coords.lng);
    let marketSummary = null;
    try {
      marketSummary = await airroi.getMarketSummary({
        country: market.country,
        region: market.region,
        locality: market.locality,
      });
    } catch {
      // Market summary may fail for some locations
    }

    // Comps
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let comps: any[] = [];
    try {
      const compResult = await airroi.getComparables(
        coords.lat, coords.lng,
        bedrooms, Math.max(1, Math.floor(bedrooms * 0.75)), bedrooms * 2 + 2
      );
      comps = compResult.listings.slice(0, 15);
    } catch {
      // Comps may fail
    }

    // Calculate analysis
    const marketAdr = marketSummary?.average_daily_rate ?? 0;
    const marketOcc = marketSummary?.occupancy ?? 0;
    const marketRevpar = marketSummary?.rev_par ?? 0;
    const activeListings = marketSummary?.active_listings_count ?? 0;

    const compAdrs = comps.map((c) => c.performance_metrics?.ttm_avg_rate ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
    const compMedian = compAdrs.length > 0 ? compAdrs[Math.floor(compAdrs.length / 2)] : marketAdr;
    const topPerformers = compAdrs.length > 0 ? compAdrs[Math.floor(compAdrs.length * 0.75)] : marketAdr;

    // Percentile ranking
    const belowCount = compAdrs.filter((v) => v < current_rate).length;
    const percentile = compAdrs.length > 0 ? Math.round((belowCount / compAdrs.length) * 100) : 50;

    // Suggested rate (simplified engine)
    const suggestedRate = Math.round(compMedian * 0.95); // Conservative: 95% of comp median
    const rateGap = suggestedRate - current_rate;
    const estimatedBookedNights = Math.round(365 * (marketOcc > 0 ? marketOcc : 0.5));
    const annualOpportunity = Math.max(0, Math.round(rateGap * estimatedBookedNights));

    // Build 30-day rate preview
    const ratePreview = [];
    const now = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const dow = d.getDay();
      const isWeekend = dow === 5 || dow === 6;
      const suggested = Math.round(suggestedRate * (isWeekend ? 1.15 : 0.95));
      ratePreview.push({
        date: d.toISOString().split("T")[0],
        suggested,
        status: current_rate >= suggested ? "good" : current_rate >= suggested * 0.9 ? "close" : "low",
      });
    }

    // Top 5 comps for display
    const compPreview = comps.slice(0, 5).map((c, i) => ({
      rank: i + 1,
      name: c.listing_info?.listing_name ?? "Listing",
      bedrooms: c.property_details?.bedrooms ?? 0,
      adr: Math.round(c.performance_metrics?.ttm_avg_rate ?? 0),
      occupancy: Math.round((c.performance_metrics?.ttm_occupancy ?? 0) * 100),
    }));

    const result = {
      location: { lat: coords.lat, lng: coords.lng, city: market.locality, state: market.region },
      your_rate: current_rate,
      market_adr: Math.round(marketAdr),
      comp_median: Math.round(compMedian),
      top_performers: Math.round(topPerformers),
      suggested_rate: suggestedRate,
      percentile,
      annual_opportunity: annualOpportunity,
      market_occupancy: Math.round(marketOcc * 100),
      market_revpar: Math.round(marketRevpar),
      active_listings: activeListings,
      comp_count: comps.length,
      comp_preview: compPreview,
      rate_preview: ratePreview,
    };

    // Store the check
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("revenue_checks") as any).insert({
      ip_address: ip,
      address: address ?? null,
      city: city ?? market.locality,
      state: state ?? market.region,
      bedrooms,
      current_rate,
      result_json: result,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[revenue-check] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
