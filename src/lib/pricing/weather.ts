// Weather.gov API — completely free, no key needed, US-only
// Caches forecasts daily to avoid excessive API calls

import type { WeatherDay } from "./signals";

const cache = new Map<string, { data: WeatherDay[]; fetchedAt: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function fetchWeatherForecast(lat: number | null, lng: number | null): Promise<WeatherDay[]> {
  if (!lat || !lng) return [];

  const cacheKey = `${lat},${lng}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.data;

  try {
    // Step 1: Get the forecast grid endpoint
    const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lng}`, {
      headers: { "User-Agent": "StayCommand/1.0 (contact@staycommand.com)" },
    });
    if (!pointsRes.ok) return [];
    const points = await pointsRes.json();
    const forecastUrl = points?.properties?.forecast;
    if (!forecastUrl) return [];

    // Step 2: Get the actual forecast
    const fcRes = await fetch(forecastUrl, {
      headers: { "User-Agent": "StayCommand/1.0 (contact@staycommand.com)" },
    });
    if (!fcRes.ok) return [];
    const fc = await fcRes.json();

    const periods = fc?.properties?.periods ?? [];
    const days: WeatherDay[] = [];
    const seen = new Set<string>();

    for (const p of periods) {
      if (!p.isDaytime) continue; // Only use daytime periods
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

    cache.set(cacheKey, { data: days, fetchedAt: Date.now() });
    return days;
  } catch (err) {
    console.error("[weather] Forecast fetch failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
