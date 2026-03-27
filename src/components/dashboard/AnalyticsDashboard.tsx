"use client";

import { useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { useToast } from "@/components/ui/Toast";

const CompMap = dynamic(() => import("./CompMap"), { ssr: false });

// ---------- Types ----------

interface PropertyInfo {
  id: string;
  name: string;
}

interface MarketSnapshot {
  market_adr: number | null;
  market_occupancy: number | null;
  market_revpar: number | null;
  market_supply: number | null;
  market_demand_score: number | null;
}

interface CompEntry {
  comp_listing_id: string | null;
  comp_name: string | null;
  comp_bedrooms: number | null;
  comp_adr: number | null;
  comp_occupancy: number | null;
  comp_revpar: number | null;
  distance_km: number | null;
}

interface RateEntry {
  date: string;
  applied_rate: number | null;
  suggested_rate: number | null;
  base_rate: number | null;
}

interface AnalyticsDashboardProps {
  properties: PropertyInfo[];
  initialPropertyId: string;
  snapshot: MarketSnapshot | null;
  comps: CompEntry[];
  rates: RateEntry[];
  propertyStats: {
    avgRate: number;
    occupancy: number;
    revpar: number;
  };
  propertyLatLng: { lat: number; lng: number } | null;
  propertyName: string;
}

// ---------- Helpers ----------

function demandColor(score: number | null): string {
  if (score == null) return "text-neutral-400";
  if (score > 60) return "text-emerald-600";
  if (score > 30) return "text-amber-600";
  return "text-red-600";
}

function demandBg(score: number | null): string {
  if (score == null) return "bg-neutral-50";
  if (score > 60) return "bg-emerald-50";
  if (score > 30) return "bg-amber-50";
  return "bg-red-50";
}

function comparisonBar(yours: number, market: number): { pct: number; color: string; label: string } {
  if (market === 0) return { pct: 50, color: "bg-neutral-300", label: "—" };
  const ratio = yours / market;
  const pct = Math.min(100, Math.max(5, ratio * 50));
  const color = ratio >= 1 ? "bg-brand-500" : ratio >= 0.85 ? "bg-amber-400" : "bg-red-400";
  const diff = Math.round((ratio - 1) * 100);
  const label = diff >= 0 ? `+${diff}%` : `${diff}%`;
  return { pct, color, label };
}

// ---------- Sort state ----------

type SortKey = "comp_name" | "comp_bedrooms" | "comp_adr" | "comp_occupancy" | "comp_revpar" | "distance_km";

// ---------- Main Component ----------

export default function AnalyticsDashboard({
  properties,
  initialPropertyId,
  snapshot,
  comps,
  rates,
  propertyStats,
  propertyLatLng,
  propertyName,
}: AnalyticsDashboardProps) {
  const { toast } = useToast();
  const [propertyId, setPropertyId] = useState(initialPropertyId);
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("comp_adr");
  const [sortAsc, setSortAsc] = useState(false);
  const [compView, setCompView] = useState<"table" | "map">("table");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "comp_name" || key === "distance_km"); }
  };

  const sortedComps = useMemo(() => {
    return [...comps].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [comps, sortKey, sortAsc]);

  // Scatter plot data
  const scatterData = useMemo(() => {
    const dots = comps.map((c) => ({
      x: c.comp_adr ?? 0,
      y: c.comp_occupancy ?? 0,
      name: c.comp_name ?? "Comp",
      isYours: false,
    }));
    dots.push({
      x: propertyStats.avgRate,
      y: propertyStats.occupancy,
      name: "Your Property",
      isYours: true,
    });
    return dots;
  }, [comps, propertyStats]);

  // Pricing calendar (last 30 days)
  const today = new Date().toISOString().split("T")[0];
  const pricingCalendar = useMemo(() => {
    const last30 = rates.filter((r) => r.date <= today).slice(-30);
    return last30;
  }, [rates, today]);

  // Revenue opportunity
  const revenueStats = useMemo(() => {
    let leftOnTable = 0;
    let opportunityForward = 0;
    for (const r of rates) {
      const applied = r.applied_rate ?? r.base_rate ?? 0;
      const suggested = r.suggested_rate ?? applied;
      if (suggested > applied) {
        if (r.date <= today) leftOnTable += suggested - applied;
        else opportunityForward += suggested - applied;
      }
    }
    return { leftOnTable: Math.round(leftOnTable), opportunityForward: Math.round(opportunityForward) };
  }, [rates, today]);

  // Median comp ADR for calendar coloring
  const compMedianAdr = useMemo(() => {
    const adrs = comps.map((c) => c.comp_adr ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
    return adrs.length > 0 ? adrs[Math.floor(adrs.length / 2)] : 0;
  }, [comps]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch(`/api/market/refresh/${propertyId}`, { method: "POST" });
      toast("Market data refreshed — reload to see updates");
    } catch { toast("Refresh failed", "error"); }
    setRefreshing(false);
  }, [propertyId, toast]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-800 mb-1">Analytics</h1>
          <p className="text-neutral-500">Market analysis and performance metrics</p>
        </div>
        {properties.length > 1 && (
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-neutral-0"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Market Overview Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-5">
          <p className="text-xs text-neutral-400">Market ADR</p>
          <p className="text-2xl font-bold font-mono text-neutral-900 mt-1">
            ${snapshot?.market_adr != null ? Math.round(snapshot.market_adr) : "—"}
          </p>
        </div>
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-5">
          <p className="text-xs text-neutral-400">Market Occupancy</p>
          <p className="text-2xl font-bold font-mono text-neutral-900 mt-1">
            {snapshot?.market_occupancy != null ? `${snapshot.market_occupancy}%` : "—"}
          </p>
        </div>
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-5">
          <p className="text-xs text-neutral-400">Market RevPAR</p>
          <p className="text-2xl font-bold font-mono text-neutral-900 mt-1">
            ${snapshot?.market_revpar != null ? Math.round(snapshot.market_revpar) : "—"}
          </p>
        </div>
        <div className={`rounded-lg border border-[var(--border)] p-5 ${demandBg(snapshot?.market_demand_score ?? null)}`}>
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-400">Demand Score</p>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="text-[10px] text-brand-500 hover:underline disabled:opacity-50"
            >
              {refreshing ? "..." : "Refresh"}
            </button>
          </div>
          <p className={`text-2xl font-bold font-mono mt-1 ${demandColor(snapshot?.market_demand_score ?? null)}`}>
            {snapshot?.market_demand_score != null ? `${Math.round(snapshot.market_demand_score)}/100` : "—"}
          </p>
          <p className="text-[11px] text-neutral-400 mt-1">
            {snapshot?.market_supply != null ? `${snapshot.market_supply.toLocaleString()} active listings` : ""}
          </p>
        </div>
      </div>

      {/* Your Property vs Market */}
      <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6 mb-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Your Property vs Market</h2>
        <div className="space-y-4">
          {[
            { label: "Avg Daily Rate", yours: propertyStats.avgRate, market: snapshot?.market_adr ?? 0, prefix: "$" },
            { label: "Occupancy", yours: propertyStats.occupancy, market: snapshot?.market_occupancy ?? 0, suffix: "%" },
            { label: "RevPAR", yours: propertyStats.revpar, market: snapshot?.market_revpar ?? 0, prefix: "$" },
          ].map((metric) => {
            const bar = comparisonBar(metric.yours, metric.market);
            return (
              <div key={metric.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-neutral-600">{metric.label}</span>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-semibold font-mono text-neutral-900">
                      {metric.prefix ?? ""}{Math.round(metric.yours)}{metric.suffix ?? ""}
                    </span>
                    <span className="text-neutral-400">vs</span>
                    <span className="font-mono text-neutral-500">
                      {metric.prefix ?? ""}{Math.round(metric.market)}{metric.suffix ?? ""}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      bar.label.startsWith("+") ? "bg-brand-50 text-brand-600" : "bg-danger-light text-danger"
                    }`}>
                      {bar.label}
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${bar.color}`} style={{ width: `${bar.pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Scatter plot */}
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">ADR vs Occupancy</h2>
          {scatterData.length > 1 ? (
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 8, right: 8, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis
                  dataKey="x" type="number" name="ADR"
                  tick={{ fontSize: 11, fill: "#78716c" }}
                  label={{ value: "ADR ($)", position: "bottom", fontSize: 11, fill: "#78716c" }}
                />
                <YAxis
                  dataKey="y" type="number" name="Occupancy"
                  tick={{ fontSize: 11, fill: "#78716c" }}
                  label={{ value: "Occ %", angle: -90, position: "insideLeft", fontSize: 11, fill: "#78716c" }}
                />
                <Tooltip
                  formatter={(value, name) => [
                    name === "ADR" ? `$${Math.round(Number(value))}` : `${Math.round(Number(value))}%`,
                    name === "x" ? "ADR" : "Occupancy",
                  ]}
                  labelFormatter={() => ""}
                />
                <Scatter data={scatterData}>
                  {scatterData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.isYours ? "#10b981" : "#a8a29e"}
                      r={entry.isYours ? 8 : 4}
                      stroke={entry.isYours ? "#047857" : "none"}
                      strokeWidth={entry.isYours ? 2 : 0}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-neutral-400 text-sm">
              No comp data to display
            </div>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-neutral-400">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-brand-500" />
              Your Property
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-neutral-300" />
              Comps
            </div>
          </div>
        </div>

        {/* Revenue opportunity */}
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Revenue Opportunity</h2>
          <div className="space-y-4">
            <div className="bg-danger-light rounded-lg p-4">
              <p className="text-xs text-red-500 font-medium">Left on the Table (Past)</p>
              <p className="text-3xl font-bold font-mono text-red-600 mt-1">${revenueStats.leftOnTable}</p>
              <p className="text-xs text-red-400 mt-1">
                Dates where applied rate was below engine suggestion
              </p>
            </div>
            <div className="bg-success-light rounded-lg p-4">
              <p className="text-xs text-emerald-500 font-medium">Potential Upside (Next 90 Days)</p>
              <p className="text-3xl font-bold font-mono text-emerald-600 mt-1">${revenueStats.opportunityForward}</p>
              <p className="text-xs text-emerald-400 mt-1">
                If all pricing suggestions are accepted
              </p>
            </div>
          </div>

          {/* Mini pricing calendar */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-neutral-700 mb-2">Last 30 Days Performance</h3>
            <div className="grid grid-cols-10 gap-1">
              {pricingCalendar.map((r) => {
                const applied = r.applied_rate ?? r.base_rate ?? 0;
                const suggested = r.suggested_rate ?? applied;
                const status =
                  applied >= suggested ? "bg-emerald-200" :
                  applied >= suggested * 0.9 ? "bg-amber-200" :
                  "bg-red-200";
                return (
                  <div
                    key={r.date}
                    className={`w-full aspect-square rounded-sm ${status}`}
                    title={`${r.date}: Applied $${Math.round(applied)} vs Suggested $${Math.round(suggested)} vs Market $${Math.round(compMedianAdr)}`}
                  />
                );
              })}
            </div>
            <div className="flex gap-3 mt-2 text-[10px] text-neutral-400">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-emerald-200" /> At/above suggested</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-amber-200" /> Slightly below</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-red-200" /> Significantly below</div>
            </div>
          </div>
        </div>
      </div>

      {/* Comp Set */}
      <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-900">Comp Set ({comps.length} properties)</h2>
          <div className="flex bg-neutral-100 rounded-lg p-0.5">
            <button
              onClick={() => setCompView("table")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${compView === "table" ? "bg-brand-500 text-white" : "text-neutral-500"}`}
            >
              Table
            </button>
            <button
              onClick={() => setCompView("map")}
              disabled={!propertyLatLng}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${compView === "map" ? "bg-brand-500 text-white" : "text-neutral-500"} disabled:opacity-40`}
            >
              Map
            </button>
          </div>
        </div>

        {comps.length === 0 ? (
          <p className="text-sm text-neutral-400 py-8 text-center">No comparable properties found. Run a market refresh.</p>
        ) : compView === "map" && propertyLatLng ? (
          <div>
            <CompMap
              center={propertyLatLng}
              propertyName={propertyName}
              comps={comps}
              medianOccupancy={compMedianAdr > 0 ? comps.reduce((s, c) => s + (c.comp_occupancy ?? 0), 0) / comps.length : 50}
            />
            <p className="text-[10px] text-neutral-400 mt-2">
              Comp positions are approximated from distance. Green = above median occupancy, Red = below.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100">
                  {([
                    ["comp_name", "Name"],
                    ["comp_bedrooms", "BR"],
                    ["comp_adr", "ADR"],
                    ["comp_occupancy", "Occ %"],
                    ["comp_revpar", "RevPAR"],
                    ["distance_km", "Distance"],
                  ] as [SortKey, string][]).map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="text-left py-2 px-3 text-xs font-medium text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-600"
                    >
                      {label} {sortKey === key ? (sortAsc ? "↑" : "↓") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Your property row */}
                <tr className="bg-brand-50 border-b border-brand-100">
                  <td className="py-2.5 px-3 font-semibold text-brand-700">Your Property</td>
                  <td className="py-2.5 px-3 text-brand-700">—</td>
                  <td className="py-2.5 px-3 font-semibold font-mono text-brand-700">${Math.round(propertyStats.avgRate)}</td>
                  <td className="py-2.5 px-3 font-semibold font-mono text-brand-700">{Math.round(propertyStats.occupancy)}%</td>
                  <td className="py-2.5 px-3 font-semibold font-mono text-brand-700">${Math.round(propertyStats.revpar)}</td>
                  <td className="py-2.5 px-3 text-brand-400">—</td>
                </tr>
                {sortedComps.map((c, i) => {
                  const adrBetter = (c.comp_adr ?? 0) <= propertyStats.avgRate;
                  const occBetter = (c.comp_occupancy ?? 0) <= propertyStats.occupancy;
                  const compName = c.comp_name ?? "Listing";
                  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(compName + " airbnb")}`;
                  return (
                    <tr key={i} className="border-b border-neutral-50 hover:bg-neutral-50">
                      <td className="py-2.5 px-3 max-w-[250px]">
                        <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:underline flex items-center gap-1 truncate">
                          {compName}
                          <svg className="w-3 h-3 flex-shrink-0 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-500">{c.comp_bedrooms ?? "—"}</td>
                      <td className={`py-2.5 px-3 font-medium font-mono ${adrBetter ? "text-emerald-600" : "text-red-500"}`}>
                        ${Math.round(c.comp_adr ?? 0)}
                      </td>
                      <td className={`py-2.5 px-3 font-medium font-mono ${occBetter ? "text-emerald-600" : "text-red-500"}`}>
                        {Math.round(c.comp_occupancy ?? 0)}%
                      </td>
                      <td className="py-2.5 px-3 font-mono text-neutral-700">${Math.round(c.comp_revpar ?? 0)}</td>
                      <td className="py-2.5 px-3 text-neutral-400">{c.distance_km != null ? `${c.distance_km} km` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
