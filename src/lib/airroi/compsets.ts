import { createAirROIClient } from "./client";
import type { AirROIListing } from "@/types/airroi";

interface CompSetProperty {
  id: string;
  latitude: number | null;
  longitude: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  max_guests: number | null;
}

interface CompSetResult {
  propertyId: string;
  comps: {
    listing_id: string;
    name: string;
    bedrooms: number;
    adr: number;
    occupancy: number;
    revpar: number;
    distance_km: number | null;
    photo_url: string | null;
    latitude: number;
    longitude: number;
  }[];
  summary: {
    median_adr: number;
    median_occupancy: number;
    median_revpar: number;
    total_comps: number;
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapListing(
  listing: AirROIListing,
  propLat: number | null,
  propLng: number | null
) {
  const pm = listing.performance_metrics;
  const loc = listing.location_info;
  const distance =
    propLat != null && propLng != null
      ? Math.round(haversineKm(propLat, propLng, loc.latitude, loc.longitude) * 100) / 100
      : null;

  return {
    listing_id: String(listing.listing_info.listing_id),
    name: listing.listing_info.listing_name,
    bedrooms: listing.property_details.bedrooms,
    adr: Math.round(pm.ttm_avg_rate * 100) / 100,
    occupancy: Math.round(pm.ttm_occupancy * 10000) / 100, // as percentage
    revpar: Math.round(pm.ttm_revpar * 100) / 100,
    distance_km: distance,
    photo_url: listing.listing_info.cover_photo_url || null,
    latitude: loc.latitude,
    longitude: loc.longitude,
  };
}

export async function buildCompSet(property: CompSetProperty): Promise<CompSetResult> {
  if (!property.latitude || !property.longitude) {
    throw new Error("Property must have lat/lng to build comp set");
  }

  const airroi = createAirROIClient();
  const bedrooms = property.bedrooms ?? 2;
  const baths = property.bathrooms ?? 1;
  const guests = property.max_guests ?? (bedrooms * 2 + 2);

  const result = await airroi.getComparables(
    property.latitude,
    property.longitude,
    bedrooms,
    baths,
    guests
  );

  // Take up to 15 comps
  const listings = result.listings.slice(0, 15);
  const comps = listings.map((l) => mapListing(l, property.latitude, property.longitude));

  const adrs = comps.map((c) => c.adr).filter((v) => v > 0);
  const occs = comps.map((c) => c.occupancy).filter((v) => v > 0);
  const revpars = comps.map((c) => c.revpar).filter((v) => v > 0);

  return {
    propertyId: property.id,
    comps,
    summary: {
      median_adr: Math.round(median(adrs) * 100) / 100,
      median_occupancy: Math.round(median(occs) * 100) / 100,
      median_revpar: Math.round(median(revpars) * 100) / 100,
      total_comps: comps.length,
    },
  };
}

/**
 * Auto-bootstrap a comp set for a newly-imported property. Called from
 * the property import flow so the Competitor signal (20% weight in the
 * pricing engine) has real data from day 1 instead of starting cold.
 *
 * Policy:
 *   - Skip if env var KOAST_DISABLE_COMP_BOOTSTRAP === "true"
 *   - Skip if property has no lat/lng
 *   - Query AirROI /listings/search/radius within ~2km (1.3 miles)
 *     filtered by bedrooms when known
 *   - If the property has existing calendar_rates, filter results to
 *     those within ±20% of the property's median rate
 *   - Sort by occupancy desc (proxy for actively-booked = real comps)
 *   - Take top 8
 *   - If <3 matches found, do NOT insert (caller surfaces the "add
 *     comps" prompt via absence of market_comps rows). "Don't silently
 *     succeed with bad data."
 *
 * Non-blocking: callers should wrap in try/catch; bootstrap failure
 * must not fail the import.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function autoBootstrapCompSet(supabase: any, propertyId: string): Promise<{
  inserted: number;
  reason?: "disabled" | "no_location" | "insufficient_matches" | "error";
  count?: number;
}> {
  if (process.env.KOAST_DISABLE_COMP_BOOTSTRAP === "true") {
    return { inserted: 0, reason: "disabled" };
  }

  const { data: prop } = await supabase
    .from("properties")
    .select("id, latitude, longitude, bedrooms")
    .eq("id", propertyId)
    .maybeSingle();

  if (!prop || prop.latitude == null || prop.longitude == null) {
    return { inserted: 0, reason: "no_location" };
  }

  const lat = Number(prop.latitude);
  const lng = Number(prop.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { inserted: 0, reason: "no_location" };
  }

  // Price anchor for the ±20% filter. Not all properties have rate data
  // yet — if none, skip the price filter entirely and use radius +
  // bedrooms alone.
  let priceAnchor: number | null = null;
  try {
    const { data: rates } = await supabase
      .from("calendar_rates")
      .select("applied_rate, suggested_rate, base_rate")
      .eq("property_id", propertyId)
      .limit(60);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nums = (rates ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => Number(r.applied_rate ?? r.suggested_rate ?? r.base_rate))
      .filter((n: number) => Number.isFinite(n) && n > 0);
    if (nums.length > 0) {
      nums.sort((a: number, b: number) => a - b);
      priceAnchor = nums[Math.floor(nums.length / 2)];
    }
  } catch {
    // Non-critical; fall through to unfiltered search.
  }

  const airroi = createAirROIClient();
  const filter: Record<string, unknown> = {};
  if (prop.bedrooms != null) filter.bedrooms = prop.bedrooms;

  const result = await airroi.searchByRadius(lat, lng, 1.3, filter, 25);

  // AirROISearchResult.results is AirROIListing[] — see src/types/airroi.ts
  const mapped = (result.results ?? []).map((l) => mapListing(l, lat, lng));

  let filtered = mapped;
  if (priceAnchor != null) {
    const lo = priceAnchor * 0.8;
    const hi = priceAnchor * 1.2;
    filtered = mapped.filter((c: ReturnType<typeof mapListing>) => c.adr >= lo && c.adr <= hi);
  }

  filtered.sort(
    (a: ReturnType<typeof mapListing>, b: ReturnType<typeof mapListing>) => b.occupancy - a.occupancy
  );
  const top = filtered.slice(0, 8);

  if (top.length < 3) {
    return { inserted: 0, reason: "insufficient_matches", count: top.length };
  }

  const nowIso = new Date().toISOString();
  // Replace any existing comps for this property to keep the set fresh.
  await supabase.from("market_comps").delete().eq("property_id", propertyId);
  const rows = top.map((c: ReturnType<typeof mapListing>) => ({
    property_id: propertyId,
    comp_listing_id: c.listing_id,
    comp_name: c.name,
    comp_bedrooms: c.bedrooms,
    comp_adr: c.adr,
    comp_occupancy: c.occupancy,
    comp_revpar: c.revpar,
    distance_km: c.distance_km,
    photo_url: c.photo_url,
    latitude: c.latitude,
    longitude: c.longitude,
    last_synced: nowIso,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertErr } = await (supabase.from("market_comps") as any).insert(rows);
  if (insertErr) {
    return { inserted: 0, reason: "error" };
  }

  return { inserted: top.length };
}

export async function storeCompSet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  propertyId: string,
  compSet: CompSetResult
): Promise<void> {
  // Delete existing comps for this property
  await supabase.from("market_comps").delete().eq("property_id", propertyId);

  // Insert new comps
  if (compSet.comps.length > 0) {
    const rows = compSet.comps.map((c) => ({
      property_id: propertyId,
      comp_listing_id: c.listing_id,
      comp_name: c.name,
      comp_bedrooms: c.bedrooms,
      comp_adr: c.adr,
      comp_occupancy: c.occupancy,
      comp_revpar: c.revpar,
      distance_km: c.distance_km,
      photo_url: c.photo_url,
      latitude: c.latitude,
      longitude: c.longitude,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("market_comps") as any).insert(rows);
  }
}
