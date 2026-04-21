import type {
  AirROIListing,
  AirROISearchResult,
  AirROIComparablesResult,
  AirROIMarketSummary,
  AirROIMarketMetricEntry,
  AirROIMarketLookup,
  AirROIMarketRef,
  AirROIListingMetricEntry,
  AirROICalculatorEstimate,
} from "@/types/airroi";

const DEFAULT_BASE_URL = "https://api.airroi.com";
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

class AirROIClient {
  private apiKey: string;
  private baseUrl: string;
  private requestQueue: Promise<void> = Promise.resolve();
  private lastRequestTime = 0;
  private minIntervalMs = 600; // ~100 req/min

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL;
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private async request<T>(
    method: "GET" | "POST",
    endpoint: string,
    params?: Record<string, string | number>,
    body?: unknown
  ): Promise<T> {
    // Queue requests to respect rate limits
    return new Promise((resolve, reject) => {
      this.requestQueue = this.requestQueue.then(async () => {
        await this.throttle();

        let url = `${this.baseUrl}${endpoint}`;
        if (params && method === "GET") {
          const sp = new URLSearchParams();
          for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null) sp.set(k, String(v));
          }
          const q = sp.toString();
          if (q) url += `?${q}`;
        }

        let lastError: Error | null = null;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            const res = await fetch(url, {
              method,
              headers: {
                "Content-Type": "application/json",
                "X-API-KEY": this.apiKey,
              },
              body: body ? JSON.stringify(body) : undefined,
            });

            if (res.status === 429 || res.status >= 500) {
              const wait = RETRY_BASE_MS * Math.pow(2, attempt);
              console.warn(
                `[AirROI] ${res.status} on ${endpoint}, retrying in ${wait}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
              );
              await new Promise((r) => setTimeout(r, wait));
              continue;
            }

            if (!res.ok) {
              const text = await res.text().catch(() => "");
              throw new Error(`AirROI API error: ${res.status} ${res.statusText} — ${text}`);
            }

            // Parse with large number protection: convert listing_id numeric values to strings
            // to prevent JavaScript's Number from losing precision on 18+ digit IDs
            const rawText = await res.text();
            const safeText = rawText.replace(/"listing_id"\s*:\s*(\d{15,})/g, '"listing_id":"$1"');
            resolve(JSON.parse(safeText));
            return;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (attempt < MAX_RETRIES - 1) {
              const wait = RETRY_BASE_MS * Math.pow(2, attempt);
              await new Promise((r) => setTimeout(r, wait));
            }
          }
        }

        reject(lastError ?? new Error("AirROI request failed after retries"));
      });
    });
  }

  // -- Listings --

  async getListing(id: number, currency: string = "usd"): Promise<AirROIListing> {
    return this.request("GET", "/listings", { id, currency });
  }

  async getListingMetrics(
    id: number,
    numMonths: number = 12,
    currency: string = "usd"
  ): Promise<{ results: AirROIListingMetricEntry[] }> {
    return this.request("GET", "/listings/metrics/all", {
      id,
      num_months: numMonths,
      currency,
    });
  }

  async getComparables(
    lat: number,
    lng: number,
    bedrooms: number,
    baths: number,
    guests: number,
    currency: string = "usd"
  ): Promise<AirROIComparablesResult> {
    return this.request("GET", "/listings/comparables", {
      latitude: lat,
      longitude: lng,
      bedrooms,
      baths,
      guests,
      currency,
    });
  }

  // -- Search --

  async searchByRadius(
    lat: number,
    lng: number,
    radiusMiles: number = 3,
    filters?: Record<string, unknown>,
    // AirROI caps pageSize at 10 on /listings/search/radius ("pagination.pageSize
    // must be less than or equal to 10"). Callers needing more should page
    // via the offset parameter.
    pageSize: number = 10,
    offset: number = 0,
    currency: string = "usd"
  ): Promise<AirROISearchResult> {
    return this.request("POST", "/listings/search/radius", undefined, {
      latitude: lat,
      longitude: lng,
      radius_miles: radiusMiles,
      filter: filters ?? {},
      pagination: { page_size: pageSize, offset },
      currency,
      num_months: 12,
    });
  }

  // -- Markets --

  async lookupMarket(lat: number, lng: number): Promise<AirROIMarketLookup> {
    return this.request("GET", "/markets/lookup", { lat, lng });
  }

  async getMarketSummary(market: AirROIMarketRef, currency: string = "usd"): Promise<AirROIMarketSummary> {
    return this.request("POST", "/markets/summary", undefined, {
      market,
      currency,
    });
  }

  async getMarketMetrics(
    market: AirROIMarketRef,
    numMonths: number = 12,
    currency: string = "usd"
  ): Promise<{ market: AirROIMarketRef; results: AirROIMarketMetricEntry[] }> {
    return this.request("POST", "/markets/metrics/all", undefined, {
      market,
      num_months: numMonths,
      currency,
    });
  }

  // -- Calculator --

  async getEstimate(
    lat: number,
    lng: number,
    bedrooms: number,
    baths: number,
    guests: number,
    currency: string = "usd"
  ): Promise<AirROICalculatorEstimate> {
    return this.request("GET", "/calculator/estimate", {
      lat,
      lng,
      bedrooms,
      baths,
      guests,
      currency,
    });
  }
}

export function createAirROIClient(): AirROIClient {
  // Hard kill switch. When set, every caller (market-sync, compsets,
  // revenue-check) errors out before a billable request can leave the
  // app. Safer than per-caller checks because it catches new callers
  // added later. Paired with systemd `staycommand-market.timer`
  // being disabled on the VPS (2026-04-21). Remove once we've moved
  // off AirROI onto the Koast-host-data moat.
  if (process.env.KOAST_DISABLE_AIRROI === "true") {
    throw new Error("AirROI disabled (KOAST_DISABLE_AIRROI=true)");
  }
  const apiKey = process.env.AIRROI_API_KEY;
  if (!apiKey) throw new Error("AIRROI_API_KEY is not set");
  const baseUrl = process.env.AIRROI_BASE_URL ?? DEFAULT_BASE_URL;
  return new AirROIClient(apiKey, baseUrl);
}
