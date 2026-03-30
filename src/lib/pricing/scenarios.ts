// Revenue optimization scenarios — "what-if" analysis

export interface Scenario {
  id: string;
  name: string;
  icon: string;
  current_state: string;
  recommendation: string;
  estimated_impact: number; // $/year
  confidence: "high" | "medium" | "low";
  details: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateScenarios(supabase: any, propertyId: string): Promise<Scenario[]> {
  const todayStr = new Date().toISOString().split("T")[0];
  const end90 = new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];

  // Fetch data
  const [bookingsRes, ratesRes, compsRes, snapRes] = await Promise.all([
    supabase.from("bookings").select("check_in, check_out, total_price, status")
      .eq("property_id", propertyId).gte("check_out", todayStr).lte("check_in", end90)
      .in("status", ["confirmed", "completed"]),
    supabase.from("calendar_rates").select("date, applied_rate, suggested_rate, min_stay, is_available")
      .eq("property_id", propertyId).gte("date", todayStr).lte("date", end90),
    supabase.from("market_comps").select("comp_adr, comp_occupancy").eq("property_id", propertyId),
    supabase.from("market_snapshots").select("market_adr, market_occupancy, market_supply")
      .eq("property_id", propertyId).order("snapshot_date", { ascending: false }).limit(1),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookings = (bookingsRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rates = (ratesRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comps = (compsRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshot = ((snapRes.data ?? []) as any[])[0] ?? {};

  const sortedBookings = [...bookings].sort((a, b) => a.check_in.localeCompare(b.check_in));
  const compAdrs = comps.map((c) => c.comp_adr).filter((v: number) => v > 0).sort((a: number, b: number) => a - b);
  const avgRate = rates.filter((r) => r.applied_rate).length > 0
    ? Math.round(rates.filter((r) => r.applied_rate).reduce((s, r) => s + Number(r.applied_rate), 0) / rates.filter((r) => r.applied_rate).length)
    : 150;

  const scenarios: Scenario[] = [];

  // Scenario 1: Lower Minimum Stay (fill gap nights)
  let gapNights = 0;
  for (let i = 0; i < sortedBookings.length - 1; i++) {
    const gapStart = sortedBookings[i].check_out;
    const gapEnd = sortedBookings[i + 1].check_in;
    const days = Math.round((new Date(gapEnd).getTime() - new Date(gapStart).getTime()) / 86400000);
    if (days >= 1 && days <= 2) gapNights += days;
  }
  if (gapNights > 0) {
    const revenue = Math.round(gapNights * avgRate * 0.6); // 60% fill rate
    scenarios.push({
      id: "min_stay", name: "Lower Minimum Stay", icon: "calendar",
      current_state: `${gapNights} orphan nights (1-2 day gaps) in next 90 days`,
      recommendation: "Reduce minimum stay by 1 night to fill short gaps",
      estimated_impact: revenue * 4, // annualized
      confidence: gapNights >= 4 ? "high" : "medium",
      details: `${gapNights} gap nights × $${avgRate} × 60% fill rate = $${revenue} per quarter`,
    });
  }

  // Scenario 2: Raise Weekend Rates
  const weekendRates = rates.filter((r) => {
    const dow = new Date(r.date + "T00:00:00").getDay();
    return (dow === 5 || dow === 6) && r.applied_rate;
  });
  if (weekendRates.length > 0) {
    const avgWeekend = Math.round(weekendRates.reduce((s, r) => s + Number(r.applied_rate), 0) / weekendRates.length);
    const bump = 20;
    const weekendNightsPerMonth = 8;
    const dropRate = 0.05; // 5% fewer bookings
    const monthlyGain = Math.round(weekendNightsPerMonth * bump * (1 - dropRate));
    scenarios.push({
      id: "weekend_rates", name: "Raise Weekend Rates", icon: "trending_up",
      current_state: `Current avg weekend rate: $${avgWeekend}`,
      recommendation: `Raise Fri/Sat rates by $${bump}`,
      estimated_impact: monthlyGain * 12,
      confidence: weekendRates.length >= 8 ? "high" : "medium",
      details: `${weekendNightsPerMonth} weekend nights/mo × $${bump} increase × 95% booking rate = $${monthlyGain}/mo`,
    });
  }

  // Scenario 3: Fill Low-Demand Periods
  const openDays: { date: string; rate: number }[] = [];
  for (const r of rates) {
    if (!r.applied_rate || !r.is_available) continue;
    const isBooked = bookings.some((b) => r.date >= b.check_in && r.date < b.check_out);
    if (!isBooked) openDays.push({ date: r.date, rate: Number(r.applied_rate) });
  }
  if (openDays.length >= 7) {
    // Find lowest 14-day stretch
    const lowestChunk = openDays.slice(0, Math.min(14, openDays.length));
    const avgChunkRate = Math.round(lowestChunk.reduce((s, d) => s + d.rate, 0) / lowestChunk.length);
    const discountRate = Math.round(avgChunkRate * 0.85);
    const additionalNights = Math.min(4, Math.round(lowestChunk.length * 0.3));
    const revenue = additionalNights * discountRate;
    const startDate = lowestChunk[0]?.date ?? "";
    const endDate = lowestChunk[lowestChunk.length - 1]?.date ?? "";
    scenarios.push({
      id: "fill_low_demand", name: "Fill Low-Demand Periods", icon: "discount",
      current_state: `${openDays.length} open nights in next 90 days`,
      recommendation: `15% discount during ${startDate.slice(5)} — ${endDate.slice(5)}`,
      estimated_impact: revenue * 4,
      confidence: openDays.length >= 14 ? "medium" : "low",
      details: `At $${discountRate}/night (15% off), est. ${additionalNights} extra bookings = $${revenue}/quarter`,
    });
  }

  // Scenario 4: Same-Day Turnovers
  let sameDayGaps = 0;
  for (let i = 0; i < sortedBookings.length - 1; i++) {
    if (sortedBookings[i].check_out === sortedBookings[i + 1].check_in) continue;
    const gapDays = Math.round(
      (new Date(sortedBookings[i + 1].check_in).getTime() - new Date(sortedBookings[i].check_out).getTime()) / 86400000
    );
    if (gapDays === 1) sameDayGaps++;
  }
  if (sameDayGaps > 0) {
    const revenue = sameDayGaps * avgRate;
    scenarios.push({
      id: "same_day_turnover", name: "Same-Day Turnovers", icon: "refresh",
      current_state: `${sameDayGaps} single-night gaps between back-to-back bookings`,
      recommendation: "Enable same-day turnovers to fill 1-night gaps",
      estimated_impact: revenue * 4,
      confidence: sameDayGaps >= 2 ? "medium" : "low",
      details: `${sameDayGaps} nights × $${avgRate} = $${revenue}/quarter if same-day cleaning is feasible`,
    });
  }

  // Scenario 5: Price to Market Leader
  if (compAdrs.length >= 3 && avgRate > 0) {
    const p75 = compAdrs[Math.floor(compAdrs.length * 0.75)];
    const currentAnnual = avgRate * 365 * ((snapshot.market_occupancy ?? 50) / 100);
    const occDrop = Math.max(5, Math.round((p75 - avgRate) / avgRate * 15)); // est occupancy drop
    const newOcc = Math.max(30, (snapshot.market_occupancy ?? 50) - occDrop);
    const newAnnual = p75 * 365 * (newOcc / 100);
    const diff = Math.round(newAnnual - currentAnnual);

    if (p75 > avgRate * 1.05) {
      scenarios.push({
        id: "market_leader", name: "Price to Market Leader", icon: "crown",
        current_state: `Your ADR: $${avgRate} vs 75th percentile: $${Math.round(p75)}`,
        recommendation: `Raise to $${Math.round(p75)}/night (75th percentile)`,
        estimated_impact: diff > 0 ? diff : 0,
        confidence: compAdrs.length >= 5 ? "medium" : "low",
        details: `At $${Math.round(p75)}/night, even with ${occDrop}% occ drop (${newOcc}%), annual revenue increases by $${Math.max(0, diff).toLocaleString()}`,
      });
    }
  }

  // Sort by impact
  scenarios.sort((a, b) => b.estimated_impact - a.estimated_impact);
  return scenarios;
}
