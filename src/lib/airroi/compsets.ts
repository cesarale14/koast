import { createAirROIClient } from "./client";
import type { AirROIListing } from "@/types/airroi";

// ---- Internal helpers ----------------------------------------------------

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
    occupancy: Math.round(pm.ttm_occupancy * 10000) / 100, // percentage
    revpar: Math.round(pm.ttm_revpar * 100) / 100,
    distance_km: distance,
    photo_url: listing.listing_info.cover_photo_url || null,
    latitude: loc.latitude,
    longitude: loc.longitude,
  };
}

type CompRow = ReturnType<typeof mapListing>;

// ---- Public result shape ------------------------------------------------

export interface CompSetBuildResult {
  /** Rows inserted into market_comps. 0 if skipped for any reason. */
  inserted: number;
  /** Why the insert was skipped (if applicable). */
  reason?: "disabled" | "no_location" | "insufficient_matches" | "error";
  /** Count of filtered matches found BEFORE the 3-match threshold check. */
  count?: number;
  /** Per-comp rows that were inserted. Empty when skipped. */
  comps: CompRow[];
  /** Summary stats over the inserted rows. */
  summary: {
    median_adr: number;
    median_occupancy: number;
    median_revpar: number;
    total_comps: number;
  };
}

// ---- Canonical comp-set builder -----------------------------------------

/**
 * Build a filtered comp set for a property and persist it to market_comps.
 * This is the CANONICAL comp-set function — it replaces the legacy
 * buildCompSet / storeCompSet pair (the legacy helpers used AirROI's
 * `/comparables` endpoint with no filters, which was prone to returning
 * wildly-differentiated listings for co-located properties like Villa
 * Jamaica and Cozy Loft that share coords but differ in bedroom count).
 *
 * Policy (unified across first-time import and daily market_sync refresh):
 *   - Skip if env var KOAST_DISABLE_COMP_BOOTSTRAP === "true"
 *   - Skip if property has no lat/lng
 *   - Query AirROI /listings/search/radius within ~2km (1.3 miles)
 *     filtered by bedrooms when known
 *   - If the property has existing calendar_rates, filter results to
 *     those within ±20% of the property's median rate (price anchor)
 *   - Sort by occupancy desc (proxy for actively-booked = real comps)
 *   - Take top 8
 *   - If <3 matches found, do NOT insert (caller surfaces the "add comps"
 *     prompt via absence of market_comps rows). Don't silently succeed
 *     with bad data.
 *   - Always DELETE-then-INSERT for the property's rows (refresh semantics)
 *
 * Formerly known as autoBootstrapCompSet. The rename reflects that this
 * is the canonical build path for BOTH first-time import AND the daily
 * market_sync.py → /api/market/refresh cycle, unifying on filtered logic
 * instead of the old buildCompSet's unfiltered top-15 pattern.
 *
 * Non-blocking: callers should wrap in try/catch; comp-set failure must
 * not fail the import or the market refresh.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildFilteredCompSet(supabase: any, propertyId: string): Promise<CompSetBuildResult> {
  const empty: CompSetBuildResult = {
    inserted: 0,
    comps: [],
    summary: { median_adr: 0, median_occupancy: 0, median_revpar: 0, total_comps: 0 },
  };

  if (process.env.KOAST_DISABLE_COMP_BOOTSTRAP === "true") {
    return { ...empty, reason: "disabled" };
  }

  const { data: prop } = await supabase
    .from("properties")
    .select("id, latitude, longitude, bedrooms")
    .eq("id", propertyId)
    .maybeSingle();

  if (!prop || prop.latitude == null || prop.longitude == null) {
    return { ...empty, reason: "no_location" };
  }

  const lat = Number(prop.latitude);
  const lng = Number(prop.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ...empty, reason: "no_location" };
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

  // AirROI's /listings/search/radius rejects every filter shape we've tried
  // (bedrooms scalar, array, min/max, bedroom_count). Filter is effectively
  // a black-box field — empty object works, anything else returns "Invalid
  // request JSON". Until AirROI documents the filter schema, we fetch the
  // raw radius results and do bedroom / price filtering client-side.
  //
  // pageSize capped at 10 server-side ("pagination.pageSize must be less
  // than or equal to 10"). Page three times to get ~30 candidates before
  // bedroom / ±20% price / top-8-by-occupancy reduce the set.
  const [page1, page2, page3] = await Promise.all([
    airroi.searchByRadius(lat, lng, 1.3, {}, 10, 0),
    airroi.searchByRadius(lat, lng, 1.3, {}, 10, 10),
    airroi.searchByRadius(lat, lng, 1.3, {}, 10, 20),
  ]);
  const combined = [
    ...(page1.results ?? []),
    ...(page2.results ?? []),
    ...(page3.results ?? []),
  ];

  const mapped = combined.map((l) => mapListing(l, lat, lng));

  // Exclude self-listings (property's own AirBnB listing id shouldn't be a
  // comp of itself). Not critical since top-8 by occupancy usually crowds
  // out the own-listing, but defensive.
  let filtered = mapped;

  // Bedroom filter (client-side — AirROI server-side filter is broken).
  if (prop.bedrooms != null) {
    filtered = filtered.filter((c: CompRow) => c.bedrooms === prop.bedrooms);
  }

  // Price anchor filter (±20% of property's median rate, if we have one).
  if (priceAnchor != null) {
    const lo = priceAnchor * 0.8;
    const hi = priceAnchor * 1.2;
    filtered = filtered.filter((c: CompRow) => c.adr >= lo && c.adr <= hi);
  }

  filtered.sort((a: CompRow, b: CompRow) => b.occupancy - a.occupancy);
  const top = filtered.slice(0, 8);

  if (top.length < 3) {
    return { ...empty, reason: "insufficient_matches", count: top.length };
  }

  const nowIso = new Date().toISOString();
  // Replace any existing comps for this property (refresh semantics).
  await supabase.from("market_comps").delete().eq("property_id", propertyId);
  const rows = top.map((c: CompRow) => ({
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
    return { ...empty, reason: "error" };
  }

  const adrs = top.map((c: CompRow) => c.adr).filter((v: number) => v > 0);
  const occs = top.map((c: CompRow) => c.occupancy).filter((v: number) => v > 0);
  const revpars = top.map((c: CompRow) => c.revpar).filter((v: number) => v > 0);

  return {
    inserted: top.length,
    count: top.length,
    comps: top,
    summary: {
      median_adr: Math.round(median(adrs) * 100) / 100,
      median_occupancy: Math.round(median(occs) * 100) / 100,
      median_revpar: Math.round(median(revpars) * 100) / 100,
      total_comps: top.length,
    },
  };
}
