import { createAirROIClient } from "./client";

const CACHE_HOURS = 24;

interface SyncProperty {
  id: string;
  latitude: number | null;
  longitude: number | null;
}

interface MarketSnapshot {
  property_id: string;
  snapshot_date: string;
  market_adr: number | null;
  market_occupancy: number | null;
  market_revpar: number | null;
  market_supply: number | null;
  market_demand_score: number | null;
  data_source: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw_data: any;
}

// Simple in-memory API call counter
let apiCallCount = 0;
let apiCallCost = 0;
const COST_PER_CALL = 0.01;

export function getApiUsage() {
  return { calls: apiCallCount, cost: Math.round(apiCallCost * 100) / 100 };
}

export async function syncMarketData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  property: SyncProperty,
  force: boolean = false
): Promise<MarketSnapshot | null> {
  if (!property.latitude || !property.longitude) {
    console.warn(`[market-sync] Property ${property.id} has no lat/lng, skipping`);
    return null;
  }

  const today = new Date().toISOString().split("T")[0];

  // Check cache (skip if fresh data exists within CACHE_HOURS)
  if (!force) {
    const cacheThreshold = new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000).toISOString();
    const { data: cached } = await supabase
      .from("market_snapshots")
      .select("*")
      .eq("property_id", property.id)
      .eq("snapshot_date", today)
      .gte("created_at", cacheThreshold)
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cachedData = (cached ?? []) as any[];
    if (cachedData.length > 0) {
      console.log(`[market-sync] Cache hit for property ${property.id}`);
      return cachedData[0];
    }
  }

  const airroi = createAirROIClient();

  // Step 1: Look up market from lat/lng
  const market = await airroi.lookupMarket(property.latitude, property.longitude);
  apiCallCount++;
  apiCallCost += COST_PER_CALL;

  if (!market.country || !market.region || !market.locality) {
    console.warn(`[market-sync] Could not resolve market for property ${property.id}`);
    return null;
  }

  // Step 2: Get market summary
  const summary = await airroi.getMarketSummary({
    country: market.country,
    region: market.region,
    locality: market.locality,
    district: market.district || undefined,
  });
  apiCallCount++;
  apiCallCost += COST_PER_CALL;

  // Build snapshot
  const snapshot: MarketSnapshot = {
    property_id: property.id,
    snapshot_date: today,
    market_adr: summary.average_daily_rate ?? null,
    market_occupancy: summary.occupancy != null ? Math.round(summary.occupancy * 10000) / 100 : null,
    market_revpar: summary.rev_par ?? null,
    market_supply: summary.active_listings_count ?? null,
    market_demand_score: null, // Computed from occupancy + booking lead time
    data_source: "airroi",
    raw_data: {
      market: summary.market,
      revenue: summary.revenue,
      booking_lead_time: summary.booking_lead_time,
      length_of_stay: summary.length_of_stay,
    },
  };

  // Calculate demand score (0-100) from occupancy and booking lead time
  if (summary.occupancy != null) {
    // Higher occupancy + shorter lead time = higher demand
    const occScore = Math.min(100, summary.occupancy * 100);
    const leadScore = summary.booking_lead_time
      ? Math.max(0, 100 - summary.booking_lead_time)
      : 50;
    snapshot.market_demand_score = Math.round((occScore * 0.7 + leadScore * 0.3) * 100) / 100;
  }

  // Upsert into Supabase
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapTable = supabase.from("market_snapshots") as any;
  const { data: existing } = await snapTable
    .select("id")
    .eq("property_id", property.id)
    .eq("snapshot_date", today)
    .limit(1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingData = (existing ?? []) as any[];
  if (existingData.length > 0) {
    await snapTable.update(snapshot).eq("id", existingData[0].id);
  } else {
    await snapTable.insert(snapshot);
  }

  console.log(
    `[market-sync] Synced market data for property ${property.id}: ADR=$${snapshot.market_adr}, Occ=${snapshot.market_occupancy}%, Supply=${snapshot.market_supply}`
  );

  return snapshot;
}
