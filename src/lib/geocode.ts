const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "StayCommand/1.0 (contact@luxeshinesolutionsllc.com)";

interface GeoResult {
  lat: number;
  lng: number;
}

/**
 * Geocode an address using Nominatim (OpenStreetMap).
 * Returns lat/lng or null if the address can't be resolved.
 */
export async function geocodeAddress(
  address: string | null,
  city: string | null,
  state: string | null
): Promise<GeoResult | null> {
  const query = [address, city, state].filter(Boolean).join(", ");
  if (!query) return null;

  const res = await fetch(
    `${NOMINATIM_BASE}?q=${encodeURIComponent(query)}&format=json&countrycodes=us&limit=1`,
    { headers: { "User-Agent": USER_AGENT } }
  );

  if (!res.ok) return null;

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const lat = parseFloat(data[0].lat);
  const lng = parseFloat(data[0].lon);
  if (isNaN(lat) || isNaN(lng)) return null;

  return { lat, lng };
}
