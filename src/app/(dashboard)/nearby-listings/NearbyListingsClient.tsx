"use client";

import { useState, useCallback, useMemo } from "react";
import PropertyAvatar from "@/components/ui/PropertyAvatar";

interface Comp {
  comp_listing_id: string;
  comp_name: string | null;
  comp_bedrooms: number | null;
  comp_adr: number | null;
  comp_occupancy: number | null;
  comp_revpar: number | null;
  distance_km: number | null;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: any[];
  initialPropertyId: string;
  initialComps: Comp[];
  propertyLat: number | null;
  propertyLng: number | null;
}

export default function NearbyListingsClient({
  properties,
  initialPropertyId,
  initialComps,
  propertyLat,
  propertyLng,
}: Props) {
  const [propertyId, setPropertyId] = useState(initialPropertyId);
  const [comps, setComps] = useState(initialComps);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bedroomFilter, setBedroomFilter] = useState<string>("all");
  const [, setCenter] = useState<{ lat: number; lng: number } | null>(
    propertyLat && propertyLng ? { lat: propertyLat, lng: propertyLng } : null
  );

  const switchProperty = useCallback(async (id: string) => {
    setPropertyId(id);
    setLoading(true);
    try {
      const res = await fetch(`/api/market/comps/${id}`);
      const data = await res.json();
      setComps(data.comps ?? []);
      const prop = properties.find((p: { id: string }) => p.id === id);
      if (prop?.latitude && prop?.longitude) {
        setCenter({ lat: parseFloat(prop.latitude), lng: parseFloat(prop.longitude) });
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [properties]);

  const filtered = useMemo(() => {
    let result = comps;
    if (bedroomFilter !== "all") {
      const br = parseInt(bedroomFilter);
      result = result.filter((c) => c.comp_bedrooms === br);
    }
    return result;
  }, [comps, bedroomFilter]);

  const currentProp = properties.find((p: { id: string }) => p.id === propertyId);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-neutral-800 mb-1">Nearby Listings</h1>
          <p className="text-sm text-neutral-500">{filtered.length} similar listings nearby</p>
        </div>
        <div className="flex items-center gap-3">
          {properties.length > 1 && (
            <select
              value={propertyId}
              onChange={(e) => switchProperty(e.target.value)}
              className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-neutral-0"
            >
              {properties.map((p: { id: string; name: string }) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <select
            value={bedroomFilter}
            onChange={(e) => setBedroomFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-neutral-0"
          >
            <option value="all">All Bedrooms</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n} BR</option>
            ))}
          </select>
        </div>
      </div>

      <div className={loading ? "opacity-50 pointer-events-none" : ""}>
        {/* Your property summary */}
        {currentProp && (
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 mb-6 flex items-center gap-4">
            <PropertyAvatar name={currentProp.name} photoUrl={currentProp.cover_photo_url} size={48} />
            <div>
              <p className="text-sm font-bold text-neutral-800">{currentProp.name}</p>
              <p className="text-xs text-neutral-500">
                {currentProp.bedrooms ?? "?"}BR · {currentProp.bathrooms ?? "?"}BA · Your Property
              </p>
            </div>
          </div>
        )}

        {/* Listing cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((comp) => {
            const isSelected = selectedId === comp.comp_listing_id;
            return (
              <div
                key={comp.comp_listing_id}
                onClick={() => setSelectedId(isSelected ? null : comp.comp_listing_id)}
                className={`bg-neutral-0 rounded-lg border overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                  isSelected ? "border-brand-400 ring-1 ring-brand-200" : "border-[var(--border)]"
                }`}
              >
                {/* Photo */}
                {comp.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={comp.photo_url} alt="" className="w-full h-36 object-cover" />
                ) : (
                  <div className="w-full h-36 bg-gradient-to-br from-neutral-100 to-neutral-200 flex items-center justify-center">
                    <span className="text-3xl text-neutral-300">🏠</span>
                  </div>
                )}

                <div className="p-4">
                  <h3 className="text-sm font-semibold text-neutral-800 truncate mb-1">
                    {comp.comp_name ?? "Listing"}
                  </h3>
                  <p className="text-xs text-neutral-400 mb-3">
                    {comp.comp_bedrooms ?? "?"}BR · {comp.distance_km != null ? `${comp.distance_km} km away` : "—"}
                  </p>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10px] text-neutral-400 uppercase">ADR</p>
                      <p className="text-sm font-bold font-mono text-neutral-800">${Math.round(comp.comp_adr ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-neutral-400 uppercase">Occ</p>
                      <p className="text-sm font-bold font-mono text-neutral-800">{Math.round(comp.comp_occupancy ?? 0)}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-neutral-400 uppercase">RevPAR</p>
                      <p className="text-sm font-bold font-mono text-neutral-800">${Math.round(comp.comp_revpar ?? 0)}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-16 text-center">
            <p className="text-neutral-400 text-sm">
              No nearby listings found. Try refreshing market data on the Pricing page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
