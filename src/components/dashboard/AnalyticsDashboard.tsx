"use client";

import { useState, useMemo, useCallback, useTransition, useEffect } from "react";
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
import { useRouter } from "next/navigation";
import { BarChart3 } from "lucide-react";

const CompMap = dynamic(() => import("./CompMap"), { ssr: false });
const IntelMap = dynamic(() => import("./IntelMap"), { ssr: false });

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
  lastUpdated: string | null;
  hasRevenueData: boolean;
}

// ---------- Helpers ----------

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  const diffMo = Math.floor(diffD / 30);
  return `${diffMo}mo ago`;
}

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
  lastUpdated,
  hasRevenueData,
}: AnalyticsDashboardProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [propertyId, setPropertyId] = useState(initialPropertyId);
  const handlePropertyChange = (newId: string) => {
    setPropertyId(newId);
    router.push(`/analytics?property=${newId}`);
  };
  const [refreshing, setRefreshing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isLoading = refreshing || isPending;
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

  // Revenue opportunity — scoped to current month
  const currentMonthName = new Date().toLocaleDateString("en-US", { month: "long" });
  const revenueStats = useMemo(() => {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

    let leftOnTable = 0;
    let opportunityForward = 0;
    for (const r of rates) {
      if (r.date < monthStart || r.date >= monthEnd) continue;
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
      const res = await fetch(`/api/market/refresh/${propertyId}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Refresh failed (${res.status})`);
      }
      toast("Market data refreshed — loading results…");
      // Hand off loading state to isPending (from useTransition)
      setRefreshing(false);
      startTransition(() => { router.refresh(); });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Refresh failed", "error");
      setRefreshing(false);
    }
  }, [propertyId, toast, router]);

  // 30-day demand calendar data
  const demandCalendar = useMemo(() => {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const overallScore = snapshot?.market_demand_score ?? 50;
    const days: { date: Date; dayNum: number; dow: number; demandLevel: "high" | "moderate" | "low" }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dow = d.getDay(); // 0=Sun, 5=Fri, 6=Sat
      let demandLevel: "high" | "moderate" | "low";
      if (dow === 5 || dow === 6) {
        demandLevel = "high";
      } else if (dow === 4 || dow === 0) {
        demandLevel = "moderate";
      } else {
        // Mon-Wed: use overall market demand score
        demandLevel = overallScore > 60 ? "high" : overallScore > 30 ? "moderate" : "low";
      }
      days.push({ date: d, dayNum: d.getDate(), dow, demandLevel });
    }
    return days;
  }, [snapshot]);

  // Pad demand calendar so first day aligns to its day-of-week column
  const demandCalendarPadded = useMemo(() => {
    if (demandCalendar.length === 0) return [];
    const firstDow = demandCalendar[0].dow;
    const padding: (null)[] = Array(firstDow).fill(null);
    return [...padding, ...demandCalendar];
  }, [demandCalendar]);

  // Empty state: no snapshot AND no comps
  if (!snapshot && comps.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-neutral-800 mb-1">Analytics</h1>
            <p className="text-neutral-500">Market analysis and performance metrics</p>
          </div>
          {properties.length > 1 && (
            <select
              value={propertyId}
              onChange={(e) => handlePropertyChange(e.target.value)}
              className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-neutral-0"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-16 text-center">
          <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            {isLoading ? (
              <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
            ) : (
              <BarChart3 className="w-8 h-8 text-brand-500" />
            )}
          </div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">
            {isLoading ? "Analyzing your market…" : "Run your first market analysis to see how your property compares"}
          </h2>
          <p className="text-neutral-500 mb-6">
            {isLoading
              ? "Finding comparable properties and pulling market data. This may take a moment."
              : "We\u2019ll find comparable properties, analyze market rates, and show you where you stand."}
          </p>
          {!isLoading && !propertyLatLng && (
            <div className="mb-4">
              <p className="text-sm text-warning font-medium mb-2">
                We couldn&apos;t locate this property. Update the address in Property Settings to enable market analysis.
              </p>
              <a
                href={`/properties/${propertyId}`}
                className="text-sm text-brand-500 hover:underline font-medium"
              >
                Go to Property Settings
              </a>
            </div>
          )}
          {!isLoading && (
            <button
              onClick={refresh}
              disabled={!propertyLatLng}
              className="btn-primary-3d inline-flex px-6 py-3 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Analyze My Market
            </button>
          )}
        </div>
      </div>
    );
  }

  const marketOcc = snapshot?.market_occupancy ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-neutral-800 mb-1">Analytics</h1>
          <p className="text-neutral-500">
            Market analysis and performance metrics
            {lastUpdated && <span className="text-xs text-neutral-400 ml-2">Last updated: {timeAgo(lastUpdated)}</span>}
          </p>
        </div>
        {properties.length > 1 && (
          <select
            value={propertyId}
            onChange={(e) => handlePropertyChange(e.target.value)}
            className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-neutral-0"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Market Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="stat-card relative bg-neutral-0 rounded-lg border border-[var(--border)] p-5">
          <p className="text-xs text-neutral-400">Market ADR</p>
          <p className="text-2xl font-bold font-mono text-neutral-900 mt-1">
            ${snapshot?.market_adr != null ? Math.round(snapshot.market_adr) : "—"}
          </p>
        </div>
        <div className="stat-card relative bg-neutral-0 rounded-lg border border-[var(--border)] p-5">
          <p className="text-xs text-neutral-400">Market Occupancy</p>
          <p className="text-2xl font-bold font-mono text-neutral-900 mt-1">
            {snapshot?.market_occupancy != null ? `${snapshot.market_occupancy}%` : "—"}
          </p>
        </div>
        <div className="stat-card relative bg-neutral-0 rounded-lg border border-[var(--border)] p-5">
          <p className="text-xs text-neutral-400">Market RevPAR</p>
          <p className="text-2xl font-bold font-mono text-neutral-900 mt-1">
            ${snapshot?.market_revpar != null ? Math.round(snapshot.market_revpar) : "—"}
          </p>
        </div>
        <div className={`stat-card relative rounded-lg border border-[var(--border)] p-5 ${demandBg(snapshot?.market_demand_score ?? null)}`}>
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-400">Demand Score</p>
            <button
              onClick={refresh}
              disabled={isLoading}
              className="text-[10px] text-brand-500 hover:underline disabled:opacity-50"
            >
              {isLoading ? "..." : "Refresh"}
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

      {/* Occupancy Comparison Highlight */}
      <div className="card-elevated bg-neutral-0 rounded-lg border border-[var(--border)] p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-xs text-neutral-400">Your Occupancy</p>
              <p className="text-2xl font-bold font-mono text-brand-600">{propertyStats.occupancy}%</p>
            </div>
            <div className="text-neutral-300 text-lg">|</div>
            <div>
              <p className="text-xs text-neutral-400">Market Average</p>
              <p className="text-2xl font-bold font-mono text-neutral-600">{marketOcc}%</p>
            </div>
          </div>
          {marketOcc > 0 && (
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${
              propertyStats.occupancy >= marketOcc ? "bg-brand-50 text-brand-600" : "bg-danger-light text-danger"
            }`}>
              {propertyStats.occupancy >= marketOcc
                ? `+${propertyStats.occupancy - marketOcc}pp above market`
                : `${propertyStats.occupancy - marketOcc}pp below market`}
            </span>
          )}
        </div>
        <div className="relative h-3 bg-neutral-100 rounded-full overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full bg-brand-500 rounded-full transition-all"
            style={{ width: `${Math.min(100, propertyStats.occupancy)}%` }}
          />
          {marketOcc > 0 && (
            <div
              className="absolute top-0 h-full w-0.5 bg-neutral-500"
              style={{ left: `${Math.min(100, marketOcc)}%` }}
              title={`Market average: ${marketOcc}%`}
            />
          )}
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-neutral-400">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Your Property vs Market */}
      <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6 mb-6">
        <h2 className="text-lg font-bold text-neutral-900 mb-4">Your Property vs Market</h2>
        <div className="space-y-4">
          {[
            { label: "Avg Daily Rate", yours: propertyStats.avgRate, market: snapshot?.market_adr ?? 0, prefix: "$", isRevenue: true },
            { label: "Occupancy", yours: propertyStats.occupancy, market: snapshot?.market_occupancy ?? 0, suffix: "%", isRevenue: false },
            { label: "RevPAR", yours: propertyStats.revpar, market: snapshot?.market_revpar ?? 0, prefix: "$", isRevenue: true },
          ].map((metric) => {
            const showDash = !hasRevenueData && metric.isRevenue;
            const bar = showDash ? { pct: 50, color: "bg-neutral-300", label: "—" } : comparisonBar(metric.yours, metric.market);
            return (
              <div key={metric.label}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1 gap-1">
                  <span className="text-sm text-neutral-600">{metric.label}</span>
                  <div className="flex items-center gap-2 sm:gap-4 text-sm flex-wrap">
                    {showDash ? (
                      <span className="font-mono text-neutral-400">—</span>
                    ) : (
                      <span className="font-bold font-mono text-neutral-900">
                        {metric.prefix ?? ""}{Math.round(metric.yours)}{metric.suffix ?? ""}
                      </span>
                    )}
                    <span className="text-neutral-400">vs</span>
                    <span className="font-mono text-neutral-500">
                      {metric.prefix ?? ""}{Math.round(metric.market)}{metric.suffix ?? ""}
                    </span>
                    {showDash ? (
                      <span className="text-[10px] text-neutral-400">Revenue data available with Channex integration</span>
                    ) : (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        bar.label.startsWith("+") ? "bg-brand-50 text-brand-600" : "bg-danger-light text-danger"
                      }`}>
                        {bar.label}
                      </span>
                    )}
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
          <h2 className="text-lg font-bold text-neutral-900 mb-4">ADR vs Occupancy</h2>
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
          <h2 className="text-lg font-bold text-neutral-900 mb-4">Revenue Opportunity — {currentMonthName}</h2>
          {hasRevenueData ? (
            <div className="space-y-4">
              <div className="bg-danger-light rounded-lg p-4">
                <p className="text-xs text-red-500 font-medium">Left on the Table ({currentMonthName})</p>
                <p className="text-3xl font-bold font-mono text-red-600 mt-1">${revenueStats.leftOnTable}</p>
                <p className="text-xs text-red-400 mt-1">
                  Dates where applied rate was below engine suggestion
                </p>
              </div>
              <div className="bg-success-light rounded-lg p-4">
                <p className="text-xs text-emerald-500 font-medium">Potential Upside (Rest of {currentMonthName})</p>
                <p className="text-3xl font-bold font-mono text-emerald-600 mt-1">${revenueStats.opportunityForward}</p>
                <p className="text-xs text-emerald-400 mt-1">
                  If all pricing suggestions are accepted
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-neutral-400" />
              </div>
              <p className="text-sm text-neutral-500 mb-1">Connect Channex for revenue tracking</p>
              <p className="text-xs text-neutral-400">Revenue data will appear here once rate information is available</p>
            </div>
          )}

          {/* Mini pricing calendar */}
          {hasRevenueData && (
            <div className="mt-6">
              <h3 className="text-sm font-bold text-neutral-700 mb-2">Last 30 Days Performance</h3>
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
          )}
        </div>
      </div>

      {/* Comp Set */}
      <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">{comps.length} comparable properties</h2>
            <p className="text-xs text-neutral-400">Similar properties ranked by relevance</p>
          </div>
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
                  <td className="py-2.5 px-3 font-bold text-brand-700">Your Property</td>
                  <td className="py-2.5 px-3 text-brand-700">—</td>
                  <td className="py-2.5 px-3 font-bold font-mono text-brand-700">${Math.round(propertyStats.avgRate)}</td>
                  <td className="py-2.5 px-3 font-bold font-mono text-brand-700">{Math.round(propertyStats.occupancy)}%</td>
                  <td className="py-2.5 px-3 font-bold font-mono text-brand-700">${Math.round(propertyStats.revpar)}</td>
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

      {/* 30-Day Demand Outlook */}
      <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6">
        <h2 className="text-lg font-bold text-neutral-900 mb-4">30-Day Demand Outlook</h2>
        <div className="grid grid-cols-7 gap-1.5">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center text-[10px] font-medium text-neutral-400 pb-1">{d}</div>
          ))}
          {demandCalendarPadded.map((day, i) => {
            if (day === null) return <div key={`pad-${i}`} />;
            const bgClass = day.demandLevel === "high" ? "bg-brand-100" : day.demandLevel === "moderate" ? "bg-warning-light" : "bg-danger-light";
            return (
              <div key={day.date.toISOString()} className={`${bgClass} rounded-md flex items-center justify-center aspect-square text-xs font-medium text-neutral-700`}
                title={`${day.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} — ${day.demandLevel} demand`}>{day.dayNum}</div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-3 text-[10px] text-neutral-400">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-brand-100" /> High demand</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-warning-light" /> Moderate</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-danger-light" /> Lower demand</div>
        </div>
      </div>

      {/* ========== Market Health Score ========== */}
      <MarketHealthCard snapshot={snapshot} />

      {/* ========== Intelligence Map ========== */}
      {propertyLatLng && (
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6 mb-6">
          <h2 className="text-lg font-bold text-neutral-900 mb-4">Market Intelligence Map</h2>
          <IntelMap
            properties={[{ id: propertyId, name: propertyName, lat: propertyLatLng.lat, lng: propertyLatLng.lng }]}
            comps={comps.map((c) => ({
              name: c.comp_name ?? "Listing",
              adr: c.comp_adr ?? 0,
              occupancy: c.comp_occupancy ?? 0,
              revpar: c.comp_revpar ?? 0,
              distanceKm: c.distance_km ?? 2,
            }))}
            center={propertyLatLng}
            snapshot={snapshot ? { market_adr: snapshot.market_adr ?? undefined, market_occupancy: snapshot.market_occupancy ?? undefined, market_supply: snapshot.market_supply ?? undefined } : null}
            propertyStats={propertyStats}
          />
        </div>
      )}

      {/* ========== 90-Day Demand Forecast ========== */}
      <DemandForecastSection propertyId={propertyId} />

      {/* ========== Revenue Optimization Scenarios ========== */}
      <RevenueScenariosSection propertyId={propertyId} />
    </div>
  );
}

// ---------- Market Health Score Card ----------

function MarketHealthCard({ snapshot }: { snapshot: MarketSnapshot | null }) {
  const score = useMemo(() => {
    if (!snapshot) return { score: 0, grade: "N/A", summary: "No market data.", strengths: [] as string[], risks: [] as string[] };
    const adr = snapshot.market_adr ?? 0;
    const occ = snapshot.market_occupancy ?? 0;
    const revpar = snapshot.market_revpar ?? 0;
    const supply = snapshot.market_supply ?? 0;
    let s = 0;
    const str: string[] = [];
    const rsk: string[] = [];
    if (adr > 200) { s += 15; str.push(`High ADR ($${Math.round(adr)})`); } else if (adr >= 150) { s += 10; } else if (adr > 0) { s += 5; rsk.push(`Low ADR ($${Math.round(adr)})`); }
    if (occ > 65) { s += 20; str.push(`Strong occupancy (${Math.round(occ)}%)`); } else if (occ >= 50) { s += 15; } else if (occ > 0) { s += 5; rsk.push(`Low occupancy (${Math.round(occ)}%)`); }
    if (supply > 0 && supply < 500) { s += 15; str.push("Low competition"); } else if (supply <= 2000) { s += 10; } else { s += 5; rsk.push(`${supply.toLocaleString()} listings`); }
    if (revpar > 130) { s += 20; str.push(`High RevPAR ($${Math.round(revpar)})`); } else if (revpar >= 80) { s += 15; } else if (revpar > 0) { s += 5; rsk.push(`Low RevPAR ($${Math.round(revpar)})`); }
    s = Math.min(100, s);
    const g = s >= 85 ? "A" : s >= 75 ? "B+" : s >= 65 ? "B" : s >= 55 ? "C+" : s >= 45 ? "C" : "D";
    const sum = s >= 70 ? "Strong market for STR investment." : s >= 50 ? "Moderate market — smart pricing needed." : "Challenging market conditions.";
    return { score: s, grade: g, summary: sum, strengths: str, risks: rsk };
  }, [snapshot]);

  if (!snapshot) return null;

  const gradeColor = score.grade.startsWith("A") ? "text-emerald-600 bg-emerald-50"
    : score.grade.startsWith("B") ? "text-blue-600 bg-blue-50"
    : score.grade.startsWith("C") ? "text-amber-600 bg-amber-50"
    : "text-red-600 bg-red-50";

  return (
    <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6 mb-6">
      <div className="flex items-start gap-6">
        <div className={`w-20 h-20 rounded-2xl ${gradeColor} flex items-center justify-center flex-shrink-0`}>
          <span className="text-3xl font-bold">{score.grade}</span>
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-neutral-900 mb-1">Market Health Score</h2>
          <p className="text-sm text-neutral-500 mb-3">{score.summary}</p>
          <div className="flex flex-wrap gap-4">
            {score.strengths.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-neutral-400 uppercase mb-1">Strengths</p>
                <div className="flex flex-wrap gap-1">{score.strengths.map((s) => (
                  <span key={s} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded-full">{s}</span>
                ))}</div>
              </div>
            )}
            {score.risks.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-neutral-400 uppercase mb-1">Risks</p>
                <div className="flex flex-wrap gap-1">{score.risks.map((r) => (
                  <span key={r} className="px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded-full">{r}</span>
                ))}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- 90-Day Demand Forecast Section ----------

interface ForecastDay { date: string; demand_score: number; demand_level: string; factors: string[]; suggested_action: string; }
interface ForecastData { forecast: ForecastDay[]; summary: { high: number; moderate: number; low: number }; high_demand_periods: { start: string; end: string; avgScore: number; factors: string[] }[]; }

function DemandForecastSection({ propertyId }: { propertyId: string }) {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/forecast/${propertyId}`);
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6 mb-6"><p className="text-sm text-neutral-400">Loading demand forecast...</p></div>;
  if (!data) return null;

  const barColor = (score: number) => score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-emerald-400" : score >= 30 ? "bg-amber-400" : "bg-red-400";

  return (
    <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6 mb-6">
      <h2 className="text-lg font-bold text-neutral-900 mb-1">90-Day Demand Forecast</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Next 30 days: <strong>{data.summary.high}</strong> high, <strong>{data.summary.moderate}</strong> moderate, <strong>{data.summary.low}</strong> low demand days
      </p>

      {/* Heatmap bar */}
      <div className="flex gap-px mb-4 rounded-lg overflow-hidden">
        {data.forecast.slice(0, 90).map((d) => (
          <div
            key={d.date}
            className={`flex-1 h-8 ${barColor(d.demand_score)} min-w-0`}
            title={`${d.date}: Score ${d.demand_score} (${d.demand_level})\n${d.factors.join(", ")}\n${d.suggested_action}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-neutral-400 mb-4">
        <span>Today</span>
        <span>30 days</span>
        <span>60 days</span>
        <span>90 days</span>
      </div>
      <div className="flex gap-3 text-[10px] text-neutral-400 mb-4">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Very high</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> High</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Moderate</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> Low</span>
      </div>

      {/* High demand periods */}
      {data.high_demand_periods.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-700 mb-2">High Demand Periods</h3>
          <div className="space-y-2">
            {data.high_demand_periods.slice(0, 5).map((p, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-neutral-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-neutral-800">
                    {new Date(p.start + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {new Date(p.end + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                  <p className="text-xs text-neutral-400">{p.factors.slice(0, 2).join(", ")}</p>
                </div>
                <span className="text-sm font-bold font-mono text-emerald-600">Score {p.avgScore}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Revenue Optimization Scenarios ----------

interface ScenarioItem { id: string; name: string; icon: string; current_state: string; recommendation: string; estimated_impact: number; confidence: string; details: string; }
interface ScenariosData { scenarios: ScenarioItem[]; total_opportunity: number; }

const scenarioIcons: Record<string, string> = {
  calendar: "📅", trending_up: "📈", discount: "🏷️", refresh: "♻️", crown: "👑",
};

function RevenueScenariosSection({ propertyId }: { propertyId: string }) {
  const [data, setData] = useState<ScenariosData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/scenarios/${propertyId}`);
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6"><p className="text-sm text-neutral-400">Analyzing revenue opportunities...</p></div>;
  if (!data || data.scenarios.length === 0) return null;

  return (
    <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Revenue Opportunities</h2>
          <p className="text-sm text-neutral-500">What-if scenarios based on your data</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-neutral-400">Total potential</p>
          <p className="text-2xl font-bold font-mono text-emerald-600">+${data.total_opportunity.toLocaleString()}<span className="text-sm font-normal text-neutral-400">/yr</span></p>
        </div>
      </div>

      <div className="space-y-3">
        {data.scenarios.map((sc) => (
          <div key={sc.id} className="border border-[var(--border)] rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{scenarioIcons[sc.icon] ?? "💡"}</span>
                <div>
                  <h3 className="text-sm font-semibold text-neutral-800">{sc.name}</h3>
                  <p className="text-xs text-neutral-400">{sc.current_state}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold font-mono text-emerald-600">+${sc.estimated_impact.toLocaleString()}</p>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  sc.confidence === "high" ? "bg-emerald-50 text-emerald-700"
                  : sc.confidence === "medium" ? "bg-amber-50 text-amber-700"
                  : "bg-neutral-100 text-neutral-500"
                }`}>{sc.confidence} confidence</span>
              </div>
            </div>
            <p className="text-sm text-neutral-600 mb-1">{sc.recommendation}</p>
            <p className="text-xs text-neutral-400">{sc.details}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
