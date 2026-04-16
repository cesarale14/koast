"use client";

import { useState, useCallback, useMemo } from "react";
import PropertyAvatar from "@/components/ui/PropertyAvatar";
import { useCountUp } from "@/hooks/useCountUp";

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

const BG_COLORS = ["bg-[var(--coastal)]", "bg-[var(--tideline)]", "bg-[var(--golden)]", "bg-[var(--deep-water)]", "bg-[var(--lagoon)]", "bg-[var(--amber-tide)]"];
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

function CompGlassCard({ label, value, prefix, suffix, delay }: { label: string; value: number; prefix?: string; suffix?: string; delay: number }) {
  const animated = useCountUp(value, 1200, 800);
  return (
    <div
      className="koast-anim relative rounded-2xl p-5 overflow-hidden text-center"
      style={{
        background: "linear-gradient(165deg, rgba(255,255,255,0.95), rgba(247,243,236,0.85) 50%, rgba(237,231,219,0.7))",
        border: "1px solid rgba(255,255,255,0.6)",
        boxShadow: "var(--shadow-glass)",
        animationDelay: `${delay * 80}ms`,
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-1/2 rounded-t-2xl pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.35), transparent)" }} />
      <p className="relative font-bold font-mono" style={{ fontSize: 26, color: "var(--coastal)", letterSpacing: "-0.03em" }}>
        {prefix ?? ""}{Math.round(animated)}{suffix ?? ""}
      </p>
      <p className="relative mt-1" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--golden)" }}>{label}</p>
    </div>
  );
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
      {/* Entrance animation keyframes */}
      <style>{`
        @keyframes koast-fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .koast-anim {
          opacity: 0;
          animation: koast-fade-up 0.55s ease-out forwards;
        }
      `}</style>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-bold" style={{ fontSize: 20, color: "var(--coastal)" }}>Comp Sets</h1>
          <p style={{ fontSize: 13, color: "var(--tideline)" }}>Your competitive set analysis</p>
        </div>
        {properties.length > 1 && (
          <select
            value={propertyId}
            onChange={(e) => switchProperty(e.target.value)}
            className="px-3 py-2 text-sm rounded-[10px] focus:outline-none focus:ring-2"
            style={{ background: "var(--shore)", border: "1px solid var(--dry-sand)", color: "var(--coastal)" }}
          >
            {properties.map((p: { id: string; name: string }) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Section Label */}
      <div className="mb-[14px]" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--golden)" }}>Summary</div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <CompGlassCard label="Comps" value={summary.count} delay={0} />
        <CompGlassCard label="Median ADR" value={summary.avgAdr} prefix="$" delay={1} />
        <CompGlassCard label="Median Occupancy" value={summary.avgOcc} suffix="%" delay={2} />
        <CompGlassCard label="Median RevPAR" value={summary.avgRevpar} prefix="$" delay={3} />
      </div>

      {/* Section Label */}
      <div className="mb-[14px]" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--golden)" }}>Competitive Set</div>

      {/* Comp table */}
      <div className={`koast-anim rounded-2xl overflow-hidden ${loading ? "opacity-50" : ""}`} style={{ background: "white", boxShadow: "var(--shadow-card)", animationDelay: "400ms" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-3 px-4" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--tideline)" }}>Listing</th>
                <th className="text-left py-3 px-3" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--tideline)" }}>BR</th>
                <th className="text-right py-3 px-3 cursor-pointer" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--tideline)" }} onClick={() => handleSort("comp_adr")}>
                  ADR{sortArrow("comp_adr")}
                </th>
                <th className="text-right py-3 px-3 cursor-pointer" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--tideline)" }} onClick={() => handleSort("comp_occupancy")}>
                  Occ{sortArrow("comp_occupancy")}
                </th>
                <th className="text-right py-3 px-3 cursor-pointer" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--tideline)" }} onClick={() => handleSort("comp_revpar")}>
                  RevPAR{sortArrow("comp_revpar")}
                </th>
                <th className="text-right py-3 px-4 cursor-pointer" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--tideline)" }} onClick={() => handleSort("distance_km")}>
                  Distance{sortArrow("distance_km")}
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Your property row */}
              {currentProp && (
                <tr style={{ background: "rgba(196,154,90,0.05)", borderLeft: "3px solid var(--golden)" }}>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <PropertyAvatar name={currentProp.name} photoUrl={currentProp.cover_photo_url} size={32} />
                      <div>
                        <p className="font-semibold" style={{ fontSize: 13, color: "var(--coastal)" }}>{currentProp.name}</p>
                        <p style={{ fontSize: 10, color: "var(--golden)" }}>Your Property</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3" style={{ color: "var(--coastal)" }}>{currentProp.bedrooms ?? "\u2014"}</td>
                  <td className="py-3 px-3 text-right font-bold font-mono" style={{ color: "var(--coastal)" }}>${propertyAvgRate}</td>
                  <td className="py-3 px-3 text-right font-mono" style={{ color: "var(--coastal)" }}>{"\u2014"}</td>
                  <td className="py-3 px-3 text-right font-mono" style={{ color: "var(--coastal)" }}>{"\u2014"}</td>
                  <td className="py-3 px-4 text-right" style={{ color: "var(--tideline)" }}>{"\u2014"}</td>
                </tr>
              )}

              {/* Comp rows */}
              {sorted.map((comp, idx) => {
                const adrDiff = propertyAvgRate > 0 ? (comp.comp_adr ?? 0) - propertyAvgRate : 0;
                const adrColorStyle = adrDiff > 0 ? "var(--coral-reef)" : adrDiff < -5 ? "var(--lagoon)" : "var(--coastal)";
                return (
                  <tr
                    key={comp.comp_listing_id}
                    className="koast-anim transition-colors"
                    style={{ background: idx % 2 === 0 ? "white" : "var(--shore)", animationDelay: `${500 + idx * 30}ms` }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(237,231,219,0.4)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = idx % 2 === 0 ? "white" : "var(--shore)"; }}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        {comp.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={comp.photo_url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${letterBg(comp.comp_name)}`}>
                            <span className="text-sm font-bold text-white">{(comp.comp_name ?? "L").charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                        <p className="truncate max-w-[200px]" style={{ fontSize: 13, fontWeight: 600, color: "var(--coastal)" }}>{comp.comp_name ?? "Listing"}</p>
                      </div>
                    </td>
                    <td className="py-3 px-3" style={{ color: "var(--tideline)" }}>{comp.comp_bedrooms ?? "\u2014"}</td>
                    <td className="py-3 px-3 text-right font-bold font-mono" style={{ color: adrColorStyle }}>
                      ${Math.round(comp.comp_adr ?? 0)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono" style={{ color: "var(--coastal)" }}>
                      {Math.round(comp.comp_occupancy ?? 0)}%
                    </td>
                    <td className="py-3 px-3 text-right font-mono" style={{ color: "var(--coastal)" }}>
                      ${Math.round(comp.comp_revpar ?? 0)}
                    </td>
                    <td className="py-3 px-4 text-right" style={{ color: "var(--tideline)" }}>
                      {comp.distance_km != null ? `${comp.distance_km} km` : "\u2014"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sorted.length === 0 && (
          <div className="p-16 text-center">
            <p className="text-sm" style={{ color: "var(--tideline)" }}>No comp data. Refresh market data on the Pricing page.</p>
          </div>
        )}
      </div>
    </div>
  );
}
