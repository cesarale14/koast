// Weather.gov API — completely free, no key needed, US-only
// Caches forecasts daily: in-memory + weather_cache table

import type { WeatherDay } from "./signals";

const memCache = new Map<string, { data: WeatherDay[]; fetchedAt: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const USER_AGENT = "Koast/1.0 (contact@luxeshinesolutionsllc.com)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchWeatherForecast(lat: number | null, lng: number | null, supabase?: any): Promise<WeatherDay[]> {
  if (!lat || !lng) return [];

  const cacheKey = `${lat},${lng}`;
  const cached = memCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.data;

  // Try database cache first
  if (supabase) {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const { data: dbRows } = await supabase
        .from("weather_cache")
        .select("forecast_date, temp_high, precipitation_pct, conditions")
        .eq("latitude", lat)
        .eq("longitude", lng)
        .gte("forecast_date", todayStr)
        .order("forecast_date");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (dbRows ?? []) as any[];
      // Check if the cache was fetched today
      if (rows.length > 0) {
        const days: WeatherDay[] = rows.map((r) => ({
          date: r.forecast_date,
          tempHigh: Number(r.temp_high) || 75,
          precipChance: r.precipitation_pct ?? 0,
          conditions: r.conditions ?? "Unknown",
        }));
        memCache.set(cacheKey, { data: days, fetchedAt: Date.now() });
        return days;
      }
    } catch { /* fall through to API */ }
  }

  try {
    // Step 1: Get forecast grid endpoint
    const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lng}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!pointsRes.ok) return [];
    const points = await pointsRes.json();
    const forecastUrl = points?.properties?.forecast;
    if (!forecastUrl) return [];

    // Step 2: Get forecast
    const fcRes = await fetch(forecastUrl, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!fcRes.ok) return [];
    const fc = await fcRes.json();

    const periods = fc?.properties?.periods ?? [];
    const days: WeatherDay[] = [];
    const seen = new Set<string>();

    for (const p of periods) {
      if (!p.isDaytime) continue;
      const date = p.startTime?.split("T")[0];
      if (!date || seen.has(date)) continue;
      seen.add(date);
      days.push({
        date,
        tempHigh: p.temperature ?? 75,
        precipChance: p.probabilityOfPrecipitation?.value ?? 0,
        conditions: p.shortForecast ?? "Unknown",
      });
    }

    memCache.set(cacheKey, { data: days, fetchedAt: Date.now() });

    // Persist to weather_cache table
    if (supabase && days.length > 0) {
      try {
        const rows = days.map((d) => ({
          latitude: lat,
          longitude: lng,
          forecast_date: d.date,
          temp_high: d.tempHigh,
          precipitation_pct: d.precipChance,
          conditions: d.conditions,
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("weather_cache") as any).upsert(rows, {
          onConflict: "latitude,longitude,forecast_date",
        });
      } catch { /* non-critical */ }
    }

    return days;
  } catch (err) {
    console.error("[weather] Forecast fetch failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
