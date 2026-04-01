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
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: any[];
  initialPropertyId: string;
  initialComps: Comp[];
  propertyAvgRate: number;
}

const BG_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500"];
function letterBg(name: string | null): string {
  const s = name ?? "L";
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return BG_COLORS[Math.abs(hash) % BG_COLORS.length];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default function CompSetsClient({ properties, initialPropertyId, initialComps, propertyAvgRate }: Props) {
  const [propertyId, setPropertyId] = useState(initialPropertyId);
  const [comps, setComps] = useState(initialComps);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<"comp_adr" | "comp_occupancy" | "comp_revpar" | "distance_km">("comp_adr");
  const [sortAsc, setSortAsc] = useState(false);

  const switchProperty = useCallback(async (id: string) => {
    setPropertyId(id);
    setLoading(true);
    try {
      const res = await fetch(`/api/market/comps/${id}`);
      const data = await res.json();
      setComps(data.comps ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const sorted = useMemo(() => {
    return [...comps].sort((a, b) => {
      const av = (a[sortKey] ?? 0) as number;
      const bv = (b[sortKey] ?? 0) as number;
      return sortAsc ? av - bv : bv - av;
    });
  }, [comps, sortKey, sortAsc]);

  const summary = useMemo(() => {
    const adrs = comps.map((c) => c.comp_adr ?? 0).filter((v) => v > 0);
    const occs = comps.map((c) => c.comp_occupancy ?? 0).filter((v) => v > 0);
    const revpars = comps.map((c) => c.comp_revpar ?? 0).filter((v) => v > 0);
    return {
      count: comps.length,
      avgAdr: Math.round(median(adrs)),
      avgOcc: Math.round(median(occs)),
      avgRevpar: Math.round(median(revpars)),
    };
  }, [comps]);

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const currentProp = properties.find((p: { id: string }) => p.id === propertyId);
  const sortArrow = (key: string) => sortKey === key ? (sortAsc ? " ↑" : " ↓") : "";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-neutral-800 mb-1">Comp Sets</h1>
          <p className="text-sm text-neutral-500">Your competitive set analysis</p>
        </div>
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
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-4 text-center">
          <p className="text-2xl font-bold font-mono text-neutral-800">{summary.count}</p>
          <p className="text-xs text-neutral-500 mt-1">Comps</p>
        </div>
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-4 text-center">
          <p className="text-2xl font-bold font-mono text-neutral-800">${summary.avgAdr}</p>
          <p className="text-xs text-neutral-500 mt-1">Median ADR</p>
        </div>
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-4 text-center">
          <p className="text-2xl font-bold font-mono text-neutral-800">{summary.avgOcc}%</p>
          <p className="text-xs text-neutral-500 mt-1">Median Occupancy</p>
        </div>
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-4 text-center">
          <p className="text-2xl font-bold font-mono text-neutral-800">${summary.avgRevpar}</p>
          <p className="text-xs text-neutral-500 mt-1">Median RevPAR</p>
        </div>
      </div>

      {/* Comp table */}
      <div className={`bg-neutral-0 rounded-lg border border-[var(--border)] overflow-hidden ${loading ? "opacity-50" : ""}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50">
                <th className="text-left py-3 px-4 text-xs font-medium text-neutral-400 uppercase tracking-wider">Listing</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">BR</th>
                <th className="text-right py-3 px-3 text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-600" onClick={() => handleSort("comp_adr")}>
                  ADR{sortArrow("comp_adr")}
                </th>
                <th className="text-right py-3 px-3 text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-600" onClick={() => handleSort("comp_occupancy")}>
                  Occ{sortArrow("comp_occupancy")}
                </th>
                <th className="text-right py-3 px-3 text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-600" onClick={() => handleSort("comp_revpar")}>
                  RevPAR{sortArrow("comp_revpar")}
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-600" onClick={() => handleSort("distance_km")}>
                  Distance{sortArrow("distance_km")}
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Your property row */}
              {currentProp && (
                <tr className="border-b border-brand-100 bg-brand-50/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <PropertyAvatar name={currentProp.name} photoUrl={currentProp.cover_photo_url} size={32} />
                      <div>
                        <p className="font-semibold text-brand-700">{currentProp.name}</p>
                        <p className="text-[10px] text-brand-500">Your Property</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-brand-700">{currentProp.bedrooms ?? "—"}</td>
                  <td className="py-3 px-3 text-right font-bold font-mono text-brand-700">${propertyAvgRate}</td>
                  <td className="py-3 px-3 text-right font-mono text-brand-700">—</td>
                  <td className="py-3 px-3 text-right font-mono text-brand-700">—</td>
                  <td className="py-3 px-4 text-right text-brand-400">—</td>
                </tr>
              )}

              {/* Comp rows */}
              {sorted.map((comp) => {
                const adrDiff = propertyAvgRate > 0 ? (comp.comp_adr ?? 0) - propertyAvgRate : 0;
                const adrColor = adrDiff > 0 ? "text-red-500" : adrDiff < -5 ? "text-emerald-600" : "text-neutral-800";
                return (
                  <tr key={comp.comp_listing_id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        {comp.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={comp.photo_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${letterBg(comp.comp_name)}`}>
                            <span className="text-sm font-bold text-white">{(comp.comp_name ?? "L").charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                        <p className="font-medium text-neutral-800 truncate max-w-[200px]">{comp.comp_name ?? "Listing"}</p>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-neutral-500">{comp.comp_bedrooms ?? "—"}</td>
                    <td className={`py-3 px-3 text-right font-bold font-mono ${adrColor}`}>
                      ${Math.round(comp.comp_adr ?? 0)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-neutral-800">
                      {Math.round(comp.comp_occupancy ?? 0)}%
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-neutral-800">
                      ${Math.round(comp.comp_revpar ?? 0)}
                    </td>
                    <td className="py-3 px-4 text-right text-neutral-400">
                      {comp.distance_km != null ? `${comp.distance_km} km` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sorted.length === 0 && (
          <div className="p-16 text-center">
            <p className="text-neutral-400 text-sm">No comp data. Refresh market data on the Pricing page.</p>
          </div>
        )}
      </div>
    </div>
  );
}
