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
import { useCountUp } from "@/hooks/useCountUp";

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
  photo_url: string | null;
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

function comparisonBar(yours: number, market: number): { pct: number; color: string; label: string } {
  if (market === 0) return { pct: 50, color: "bg-[var(--shell)]", label: "—" };
  const ratio = yours / market;
  const pct = Math.min(100, Math.max(5, ratio * 50));
  const color = ratio >= 1 ? "bg-[var(--lagoon)]" : "bg-[var(--coral-reef)]";
  const diff = Math.round((ratio - 1) * 100);
  const label = diff >= 0 ? `+${diff}%` : `${diff}%`;
  return { pct, color, label };
}

// ---------- Sort state ----------

type SortKey = "comp_name" | "comp_bedrooms" | "comp_adr" | "comp_occupancy" | "comp_revpar" | "distance_km";

// ---------- Glass Stat Card ----------

function GlassStatCard({ label, value, prefix, suffix, delay }: { label: string; value: number | null; prefix?: string; suffix?: string; delay: number }) {
  const animated = useCountUp(value ?? 0, 1200, 800);
  return (
    <div
      className="koast-anim relative rounded-2xl p-5 overflow-hidden"
      style={{
        background: "linear-gradient(165deg, rgba(255,255,255,0.95), rgba(247,243,236,0.85) 50%, rgba(237,231,219,0.7))",
        border: "1px solid rgba(255,255,255,0.6)",
        boxShadow: "var(--shadow-glass)",
        animationDelay: `${delay * 80}ms`,
      }}
    >
      {/* Reflection overlay */}
      <div className="absolute top-0 left-0 right-0 h-1/2 rounded-t-2xl pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.35), transparent)" }} />
      <p className="relative" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--golden)", marginTop: 4 }}>{label}</p>
      <p className="relative font-bold font-mono mt-1" style={{ fontSize: 26, color: "var(--coastal)", letterSpacing: "-0.03em" }}>
        {value != null ? `${prefix ?? ""}${Math.round(animated)}${suffix ?? ""}` : "\u2014"}
      </p>
    </div>
  );
}

function DemandScoreValue({ target }: { target: number }) {
  const animated = useCountUp(target, 1200, 800);
  return <>{Math.round(animated)}/100</>;
}

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
    router.push(`/market-explorer?property=${newId}`);
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

  // Empty state: no snapshot AND no comps
  if (!snapshot && comps.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ fontSize: 20, color: "var(--coastal)" }}>Market Intel</h1>
            <p style={{ fontSize: 13, color: "var(--tideline)" }}>Market analysis and performance metrics</p>
          </div>
          {properties.length > 1 && (
            <select
              value={propertyId}
              onChange={(e) => handlePropertyChange(e.target.value)}
              className="px-3 py-2 text-sm rounded-[10px]"
              style={{ background: "var(--shore)", border: "1px solid var(--dry-sand)", color: "var(--coastal)" }}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="rounded-2xl p-16 text-center" style={{ background: "linear-gradient(165deg, rgba(255,255,255,0.95), rgba(247,243,236,0.85) 50%, rgba(237,231,219,0.7))", border: "1px solid rgba(255,255,255,0.6)", boxShadow: "var(--shadow-glass)" }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: "var(--shore)" }}>
            {isLoading ? (
              <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: "var(--dry-sand)", borderTopColor: "var(--golden)" }} />
            ) : (
              <BarChart3 className="w-8 h-8" style={{ color: "var(--golden)" }} />
            )}
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: "var(--coastal)" }}>
            {isLoading ? "Analyzing your market\u2026" : "Run your first market analysis to see how your property compares"}
          </h2>
          <p className="mb-6" style={{ color: "var(--tideline)" }}>
            {isLoading
              ? "Finding comparable properties and pulling market data. This may take a moment."
              : "We\u2019ll find comparable properties, analyze market rates, and show you where you stand."}
          </p>
          {!isLoading && !propertyLatLng && (
            <div className="mb-4">
              <p className="text-sm font-medium mb-2" style={{ color: "var(--amber-tide)" }}>
                We couldn&apos;t locate this property. Update the address in Property Settings to enable market analysis.
              </p>
              <a
                href={`/properties/${propertyId}`}
                className="text-sm hover:underline font-medium"
                style={{ color: "var(--golden)" }}
              >
                Go to Property Settings
              </a>
            </div>
          )}
          {!isLoading && (
            <button
              onClick={refresh}
              disabled={!propertyLatLng}
              className="btn-primary-3d inline-flex px-6 py-3 text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "var(--coastal)" }}
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

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-bold" style={{ fontSize: 20, color: "var(--coastal)" }}>Market Intel</h1>
          <p style={{ fontSize: 13, color: "var(--tideline)" }}>
            Market analysis and performance metrics
            {lastUpdated && <span className="ml-2" style={{ fontSize: 12, color: "var(--tideline)", opacity: 0.7 }}>Last updated: {timeAgo(lastUpdated)}</span>}
          </p>
        </div>
        {properties.length > 1 && (
          <select
            value={propertyId}
            onChange={(e) => handlePropertyChange(e.target.value)}
            className="px-3 py-2 text-sm rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[var(--golden)]"
            style={{ background: "var(--shore)", border: "1px solid var(--dry-sand)", color: "var(--coastal)" }}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Section Label */}
      <div className="mb-[14px]" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--golden)" }}>Market Overview</div>

      {/* Market Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <GlassStatCard label="Market ADR" value={snapshot?.market_adr != null ? Math.round(snapshot.market_adr) : null} prefix="$" delay={0} />
        <GlassStatCard label="Market Occupancy" value={snapshot?.market_occupancy != null ? Math.round(snapshot.market_occupancy) : null} suffix="%" delay={1} />
        <GlassStatCard label="Market RevPAR" value={snapshot?.market_revpar != null ? Math.round(snapshot.market_revpar) : null} prefix="$" delay={2} />
        <div
          className="koast-anim relative rounded-2xl p-5 overflow-hidden"
          style={{
            background: "linear-gradient(165deg, rgba(255,255,255,0.95), rgba(247,243,236,0.85) 50%, rgba(237,231,219,0.7))",
            border: "1px solid rgba(255,255,255,0.6)",
            boxShadow: "var(--shadow-glass)",
            animationDelay: "240ms",
          }}
        >
          {/* Reflection overlay */}
          <div className="absolute top-0 left-0 right-0 h-1/2 rounded-t-2xl pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.35), transparent)" }} />
          <div className="relative flex items-center justify-between">
            <p className="mt-1" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--golden)" }}>Demand Score</p>
            <button
              onClick={refresh}
              disabled={isLoading}
              className="hover:underline disabled:opacity-50 bg-transparent"
              style={{ fontSize: 10, color: "var(--tideline)", border: "1px solid var(--dry-sand)", borderRadius: 8, padding: "2px 8px" }}
            >
              {isLoading ? "..." : "Refresh"}
            </button>
          </div>
          <p className="relative font-bold font-mono mt-1" style={{ fontSize: 26, color: "var(--golden)", letterSpacing: "-0.03em" }}>
            {snapshot?.market_demand_score != null ? <DemandScoreValue target={Math.round(snapshot.market_demand_score)} /> : "—"}
          </p>
          <p className="relative mt-1" style={{ fontSize: 11, color: "var(--tideline)" }}>
            {snapshot?.market_supply != null ? `${snapshot.market_supply.toLocaleString()} active listings` : ""}
          </p>
        </div>
      </div>

      {/* Occupancy Comparison Highlight */}
      <div className="koast-anim rounded-2xl p-5 mb-6" style={{ background: "white", boxShadow: "var(--shadow-card)", animationDelay: "400ms" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-6">
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--golden)" }}>Your Occupancy</p>
              <p className="font-bold font-mono" style={{ fontSize: 26, color: "var(--coastal)", letterSpacing: "-0.03em" }}>{propertyStats.occupancy}%</p>
            </div>
            <div style={{ color: "var(--shell)" }} className="text-lg">|</div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--golden)" }}>Market Average</p>
              <p className="font-bold font-mono" style={{ fontSize: 26, color: "var(--tideline)", letterSpacing: "-0.03em" }}>{marketOcc}%</p>
            </div>
          </div>
          {marketOcc > 0 && (
            <span className="text-sm font-bold px-3 py-1 rounded-full" style={
              propertyStats.occupancy >= marketOcc
                ? { background: "rgba(26,122,90,0.1)", color: "var(--lagoon)" }
                : { background: "rgba(196,64,64,0.1)", color: "var(--coral-reef)" }
            }>
              {propertyStats.occupancy >= marketOcc
                ? `+${propertyStats.occupancy - marketOcc}pp above market`
                : `${propertyStats.occupancy - marketOcc}pp below market`}
            </span>
          )}
        </div>
        <div className="relative h-3 rounded-full overflow-hidden" style={{ background: "var(--dry-sand)" }}>
          <div
            className="absolute top-0 left-0 h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, propertyStats.occupancy)}%`, background: "var(--coastal)" }}
          />
          {marketOcc > 0 && (
            <div
              className="absolute top-0 h-full w-0.5"
              style={{ left: `${Math.min(100, marketOcc)}%`, background: "var(--tideline)" }}
              title={`Market average: ${marketOcc}%`}
            />
          )}
        </div>
        <div className="flex justify-between mt-1.5" style={{ fontSize: 10, color: "var(--tideline)" }}>
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Your Property vs Market */}
      <div className="mb-[14px]" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--golden)" }}>Your Property vs Market</div>
      <div className="koast-anim rounded-2xl p-6 mb-6" style={{ background: "white", boxShadow: "var(--shadow-card)", animationDelay: "400ms" }}>
        <div className="space-y-4">
          {[
            { label: "Avg Daily Rate", yours: propertyStats.avgRate, market: snapshot?.market_adr ?? 0, prefix: "$", isRevenue: true },
            { label: "Occupancy", yours: propertyStats.occupancy, market: snapshot?.market_occupancy ?? 0, suffix: "%", isRevenue: false },
            { label: "RevPAR", yours: propertyStats.revpar, market: snapshot?.market_revpar ?? 0, prefix: "$", isRevenue: true },
          ].map((metric) => {
            const showDash = !hasRevenueData && metric.isRevenue;
            const bar = showDash ? { pct: 50, color: "bg-[var(--shell)]", label: "—" } : comparisonBar(metric.yours, metric.market);
            const isAbove = bar.label.startsWith("+");
            return (
              <div key={metric.label}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1 gap-1">
                  <span className="text-sm" style={{ color: "var(--tideline)" }}>{metric.label}</span>
                  <div className="flex items-center gap-2 sm:gap-4 text-sm flex-wrap">
                    {showDash ? (
                      <span className="font-mono" style={{ color: "var(--shell)" }}>—</span>
                    ) : (
                      <span className="font-bold font-mono" style={{ color: "var(--coastal)" }}>
                        {metric.prefix ?? ""}{Math.round(metric.yours)}{metric.suffix ?? ""}
                      </span>
                    )}
                    <span style={{ color: "var(--shell)" }}>vs</span>
                    <span className="font-mono" style={{ color: "var(--tideline)" }}>
                      {metric.prefix ?? ""}{Math.round(metric.market)}{metric.suffix ?? ""}
                    </span>
                    {showDash ? (
                      <span style={{ fontSize: 10, color: "var(--tideline)" }}>Revenue data available with Channex integration</span>
                    ) : (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={
                        isAbove
                          ? { background: "rgba(26,122,90,0.1)", color: "var(--lagoon)" }
                          : { background: "rgba(196,64,64,0.1)", color: "var(--coral-reef)" }
                      }>
                        {bar.label}
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--dry-sand)" }}>
                  <div className={`h-full rounded-full transition-all ${bar.color}`} style={{ width: `${bar.pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section Label */}
      <div className="mb-[14px]" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--golden)" }}>Market Intelligence</div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Scatter plot */}
        <div className="koast-anim rounded-2xl p-6" style={{ background: "white", boxShadow: "var(--shadow-card)", animationDelay: "600ms" }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: "var(--coastal)" }}>ADR vs Occupancy</h2>
          {scatterData.length > 1 ? (
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 8, right: 8, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--dry-sand)" />
                <XAxis
                  dataKey="x" type="number" name="ADR"
                  tick={{ fontSize: 11, fill: "#3d6b52" }}
                  label={{ value: "ADR ($)", position: "bottom", fontSize: 11, fill: "#3d6b52" }}
                />
                <YAxis
                  dataKey="y" type="number" name="Occupancy"
                  tick={{ fontSize: 11, fill: "#3d6b52" }}
                  label={{ value: "Occ %", angle: -90, position: "insideLeft", fontSize: 11, fill: "#3d6b52" }}
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
                      fill={entry.isYours ? "#1a7a5a" : "#c49a5a"}
                      r={entry.isYours ? 8 : 4}
                      stroke={entry.isYours ? "#17392a" : "none"}
                      strokeWidth={entry.isYours ? 2 : 0}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-sm" style={{ color: "var(--tideline)" }}>
              No comp data to display
            </div>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: "var(--tideline)" }}>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full" style={{ background: "var(--lagoon)" }} />
              Your Property
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full" style={{ background: "var(--golden)" }} />
              Comps
            </div>
          </div>
        </div>

        {/* Revenue opportunity — AI dark card */}
        <div className="koast-anim rounded-2xl p-[22px] relative overflow-hidden" style={{ background: "linear-gradient(135deg, var(--deep-sea), #0e2218)", color: "var(--shore)", animationDelay: "600ms" }}>
          {/* Ambient golden glow */}
          <div className="absolute pointer-events-none" style={{ top: "-50%", right: "-30%", width: "70%", height: "120%", background: "radial-gradient(ellipse, rgba(196,154,90,0.08), transparent 70%)", animation: "koast-breathe 4s ease-in-out infinite" }} />
          <style>{`@keyframes koast-breathe { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }`}</style>

          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(196,154,90,0.15)" }}>
              <div className="w-2 h-2 rounded-full" style={{ background: "var(--golden)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--golden)" }}>Koast AI</span>
            </div>
          </div>

          <h2 className="text-lg font-bold mb-4" style={{ color: "var(--shore)" }}>Revenue Opportunity — {currentMonthName}</h2>
          {hasRevenueData ? (
            <div className="space-y-4 relative">
              <div className="rounded-xl p-4" style={{ background: "rgba(196,64,64,0.12)" }}>
                <p className="text-xs font-medium" style={{ color: "var(--coral-reef)" }}>Left on the Table ({currentMonthName})</p>
                <p className="font-bold font-mono mt-1" style={{ fontSize: 28, color: "var(--golden)", letterSpacing: "-0.03em" }}>${revenueStats.leftOnTable}</p>
                <p className="text-xs mt-1" style={{ color: "rgba(247,243,236,0.6)" }}>
                  Dates where applied rate was below engine suggestion
                </p>
              </div>
              <div className="rounded-xl p-4" style={{ background: "rgba(26,122,90,0.15)" }}>
                <p className="text-xs font-medium" style={{ color: "var(--lagoon)" }}>Potential Upside (Rest of {currentMonthName})</p>
                <p className="font-bold font-mono mt-1" style={{ fontSize: 28, color: "var(--golden)", letterSpacing: "-0.03em" }}>${revenueStats.opportunityForward}</p>
                <p className="text-xs mt-1" style={{ color: "rgba(247,243,236,0.6)" }}>
                  If all pricing suggestions are accepted
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center relative">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: "rgba(247,243,236,0.1)" }}>
                <BarChart3 className="w-6 h-6" style={{ color: "var(--golden)" }} />
              </div>
              <p className="text-sm mb-1" style={{ color: "var(--shore)" }}>Connect Channex for revenue tracking</p>
              <p className="text-xs" style={{ color: "rgba(247,243,236,0.5)" }}>Revenue data will appear here once rate information is available</p>
            </div>
          )}

          {/* Mini pricing calendar */}
          {hasRevenueData && (
            <div className="mt-6 relative">
              <h3 className="text-sm font-bold mb-2" style={{ color: "var(--driftwood)" }}>Last 30 Days Performance</h3>
              <div className="grid grid-cols-10 gap-1">
                {pricingCalendar.map((r) => {
                  const applied = r.applied_rate ?? r.base_rate ?? 0;
                  const suggested = r.suggested_rate ?? applied;
                  const bgColor =
                    applied >= suggested ? "rgba(26,122,90,0.4)" :
                    applied >= suggested * 0.9 ? "rgba(212,150,11,0.4)" :
                    "rgba(196,64,64,0.4)";
                  return (
                    <div
                      key={r.date}
                      className="w-full aspect-square rounded-sm"
                      style={{ background: bgColor }}
                      title={`${r.date}: Applied $${Math.round(applied)} vs Suggested $${Math.round(suggested)} vs Market $${Math.round(compMedianAdr)}`}
                    />
                  );
                })}
              </div>
              <div className="flex gap-3 mt-2 text-[10px]" style={{ color: "rgba(247,243,236,0.5)" }}>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm" style={{ background: "rgba(26,122,90,0.4)" }} /> At/above suggested</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm" style={{ background: "rgba(212,150,11,0.4)" }} /> Slightly below</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm" style={{ background: "rgba(196,64,64,0.4)" }} /> Significantly below</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section Label */}
      <div className="mb-[14px]" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--golden)" }}>Competitive Set</div>

      {/* Comp Set */}
      <div className="koast-anim rounded-2xl p-6 mb-6" style={{ background: "white", boxShadow: "var(--shadow-card)", animationDelay: "600ms" }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--coastal)" }}>{comps.length} comparable properties</h2>
            <p className="text-xs" style={{ color: "var(--tideline)" }}>Similar properties ranked by relevance</p>
          </div>
          <div className="flex rounded-[10px] p-0.5" style={{ background: "var(--shore)" }}>
            <button
              onClick={() => setCompView("table")}
              className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
              style={compView === "table" ? { background: "var(--coastal)", color: "white" } : { color: "var(--tideline)" }}
            >
              Table
            </button>
            <button
              onClick={() => setCompView("map")}
              disabled={!propertyLatLng}
              className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-40"
              style={compView === "map" ? { background: "var(--coastal)", color: "white" } : { color: "var(--tideline)" }}
            >
              Map
            </button>
          </div>
        </div>

        {comps.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: "var(--tideline)" }}>No comparable properties found. Run a market refresh.</p>
        ) : compView === "map" && propertyLatLng ? (
          <div>
            <CompMap
              center={propertyLatLng}
              propertyName={propertyName}
              comps={comps}
              medianOccupancy={compMedianAdr > 0 ? comps.reduce((s, c) => s + (c.comp_occupancy ?? 0), 0) / comps.length : 50}
            />
            <p className="text-[10px] mt-2" style={{ color: "var(--tideline)" }}>
              Comp positions are approximated from distance. Green = above median occupancy, Red = below.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
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
                      className="text-left py-2 px-3 cursor-pointer"
                      style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--tideline)" }}
                    >
                      {label} {sortKey === key ? (sortAsc ? "\u2191" : "\u2193") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Your property row */}
                <tr style={{ background: "rgba(196,154,90,0.05)", borderLeft: "3px solid var(--golden)" }}>
                  <td className="py-2.5 px-3 font-bold" style={{ color: "var(--coastal)" }}>Your Property</td>
                  <td className="py-2.5 px-3" style={{ color: "var(--coastal)" }}>{"\u2014"}</td>
                  <td className="py-2.5 px-3 font-bold font-mono" style={{ color: "var(--coastal)" }}>${Math.round(propertyStats.avgRate)}</td>
                  <td className="py-2.5 px-3 font-bold font-mono" style={{ color: "var(--coastal)" }}>{Math.round(propertyStats.occupancy)}%</td>
                  <td className="py-2.5 px-3 font-bold font-mono" style={{ color: "var(--coastal)" }}>${Math.round(propertyStats.revpar)}</td>
                  <td className="py-2.5 px-3" style={{ color: "var(--tideline)" }}>{"\u2014"}</td>
                </tr>
                {sortedComps.map((c, i) => {
                  const adrBetter = (c.comp_adr ?? 0) <= propertyStats.avgRate;
                  const occBetter = (c.comp_occupancy ?? 0) <= propertyStats.occupancy;
                  const compName = c.comp_name ?? "Listing";
                  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(compName + " airbnb")}`;
                  return (
                    <tr key={i} className="transition-colors" style={{ background: i % 2 === 0 ? "white" : "var(--shore)" }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(237,231,219,0.4)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 === 0 ? "white" : "var(--shore)"; }}>
                      <td className="py-2.5 px-3 max-w-[250px]">
                        <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1.5 truncate" style={{ color: "var(--coastal)" }}>
                          {c.photo_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={c.photo_url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px]" style={{ background: "var(--shore)", color: "var(--tideline)" }}>{"\ud83c\udfe0"}</span>
                          )}
                          <span className="truncate text-[13px] font-semibold">{compName}</span>
                          <svg className="w-3 h-3 flex-shrink-0" style={{ color: "var(--tideline)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </td>
                      <td className="py-2.5 px-3" style={{ color: "var(--tideline)" }}>{c.comp_bedrooms ?? "\u2014"}</td>
                      <td className="py-2.5 px-3 font-medium font-mono" style={{ color: adrBetter ? "var(--lagoon)" : "var(--coral-reef)" }}>
                        ${Math.round(c.comp_adr ?? 0)}
                      </td>
                      <td className="py-2.5 px-3 font-medium font-mono" style={{ color: occBetter ? "var(--lagoon)" : "var(--coral-reef)" }}>
                        {Math.round(c.comp_occupancy ?? 0)}%
                      </td>
                      <td className="py-2.5 px-3 font-mono" style={{ color: "var(--coastal)" }}>${Math.round(c.comp_revpar ?? 0)}</td>
                      <td className="py-2.5 px-3" style={{ color: "var(--tideline)" }}>{c.distance_km != null ? `${c.distance_km} km` : "\u2014"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section Label */}
      <div className="mb-[14px]" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--golden)" }}>Demand Outlook</div>

      {/* 30-Day Demand Outlook — compact strip */}
      <div className="koast-anim rounded-2xl p-4 mb-6" style={{ background: "white", boxShadow: "var(--shadow-card)", animationDelay: "600ms" }}>
        <h2 className="text-sm font-bold mb-2" style={{ color: "var(--coastal)" }}>30-Day Demand Outlook</h2>
        <div className="flex gap-px rounded-xl overflow-hidden h-10">
          {demandCalendar.map((day) => {
            const bgStyle = day.demandLevel === "high" ? "var(--coastal)" : day.demandLevel === "moderate" ? "var(--amber-tide)" : "var(--coral-reef)";
            return (
              <div
                key={day.date.toISOString()}
                className="flex-1 min-w-0"
                style={{ background: bgStyle }}
                title={`${day.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} — ${day.demandLevel} demand`}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-1.5">
          <span style={{ fontSize: 10, color: "var(--tideline)" }}>Today</span>
          <span style={{ fontSize: 10, color: "var(--tideline)" }}>+30d</span>
        </div>
        <div className="flex gap-3 mt-1" style={{ fontSize: 10, color: "var(--tideline)" }}>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--coastal)" }} /> High</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--amber-tide)" }} /> Moderate</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--coral-reef)" }} /> Low</span>
        </div>
      </div>

      {/* ========== Market Health Score ========== */}
      <MarketHealthCard snapshot={snapshot} />

      {/* ========== Intelligence Map ========== */}
      {propertyLatLng && (
        <div className="koast-anim rounded-2xl p-6 mb-6" style={{ background: "white", boxShadow: "var(--shadow-card)", animationDelay: "600ms" }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: "var(--coastal)" }}>Market Intelligence Map</h2>
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

  const gradeStyle = score.grade.startsWith("A") ? { color: "var(--coastal)", background: "var(--shore)" }
    : score.grade.startsWith("B") ? { color: "var(--deep-water)", background: "var(--shore)" }
    : score.grade.startsWith("C") ? { color: "var(--amber-tide)", background: "var(--shore)" }
    : { color: "var(--coral-reef)", background: "var(--shore)" };

  return (
    <div className="koast-anim rounded-2xl p-6 mb-6" style={{ background: "white", boxShadow: "var(--shadow-card)", animationDelay: "600ms" }}>
      <div className="flex items-start gap-6">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center flex-shrink-0" style={gradeStyle}>
          <span className="text-3xl font-bold">{score.grade}</span>
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold mb-1" style={{ color: "var(--coastal)" }}>Market Health Score</h2>
          <p className="text-sm mb-3" style={{ color: "var(--tideline)" }}>{score.summary}</p>
          <div className="flex flex-wrap gap-4">
            {score.strengths.length > 0 && (
              <div>
                <p className="uppercase mb-1" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "var(--golden)" }}>Strengths</p>
                <div className="flex flex-wrap gap-1">{score.strengths.map((s) => (
                  <span key={s} className="px-2 py-0.5 text-xs rounded-full" style={{ background: "rgba(26,122,90,0.1)", color: "var(--lagoon)" }}>{s}</span>
                ))}</div>
              </div>
            )}
            {score.risks.length > 0 && (
              <div>
                <p className="uppercase mb-1" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "var(--golden)" }}>Risks</p>
                <div className="flex flex-wrap gap-1">{score.risks.map((r) => (
                  <span key={r} className="px-2 py-0.5 text-xs rounded-full" style={{ background: "rgba(196,64,64,0.1)", color: "var(--coral-reef)" }}>{r}</span>
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

  if (loading) return <div className="rounded-2xl p-6 mb-6" style={{ background: "white", boxShadow: "var(--shadow-card)" }}><p className="text-sm" style={{ color: "var(--tideline)" }}>Loading demand forecast...</p></div>;
  if (!data) return null;

  const barColorStyle = (score: number) => score >= 80 ? "var(--deep-sea)" : score >= 60 ? "var(--coastal)" : score >= 30 ? "var(--amber-tide)" : "var(--coral-reef)";

  return (
    <div className="koast-anim rounded-2xl p-6 mb-6" style={{ background: "white", boxShadow: "var(--shadow-card)", animationDelay: "600ms" }}>
      <h2 className="text-lg font-bold mb-1" style={{ color: "var(--coastal)" }}>90-Day Demand Forecast</h2>
      <p className="text-sm mb-4" style={{ color: "var(--tideline)" }}>
        Next 30 days: <strong>{data.summary.high}</strong> high, <strong>{data.summary.moderate}</strong> moderate, <strong>{data.summary.low}</strong> low demand days
      </p>

      {/* Heatmap bar */}
      <div className="flex gap-px mb-4 rounded-xl overflow-hidden">
        {data.forecast.slice(0, 90).map((d) => (
          <div
            key={d.date}
            className="flex-1 h-8 min-w-0"
            style={{ background: barColorStyle(d.demand_score) }}
            title={`${d.date}: Score ${d.demand_score} (${d.demand_level})\n${d.factors.join(", ")}\n${d.suggested_action}`}
          />
        ))}
      </div>
      <div className="flex justify-between mb-4" style={{ fontSize: 10, color: "var(--tideline)" }}>
        <span>Today</span>
        <span>30 days</span>
        <span>60 days</span>
        <span>90 days</span>
      </div>
      <div className="flex gap-3 mb-4" style={{ fontSize: 10, color: "var(--tideline)" }}>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--deep-sea)" }} /> Very high</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--coastal)" }} /> High</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--amber-tide)" }} /> Moderate</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--coral-reef)" }} /> Low</span>
      </div>

      {/* High demand periods */}
      {data.high_demand_periods.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--coastal)" }}>High Demand Periods</h3>
          <div className="space-y-2">
            {data.high_demand_periods.slice(0, 5).map((p, i) => (
              <div key={i} className="flex items-center justify-between py-2 last:border-0" style={{ borderBottom: "1px solid var(--shore)" }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--coastal)" }}>
                    {new Date(p.start + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {new Date(p.end + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                  <p className="text-xs" style={{ color: "var(--tideline)" }}>{p.factors.slice(0, 2).join(", ")}</p>
                </div>
                <span className="text-sm font-bold font-mono" style={{ color: "var(--coastal)" }}>Score {p.avgScore}</span>
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

  if (loading) return <div className="rounded-2xl p-6" style={{ background: "white", boxShadow: "var(--shadow-card)" }}><p className="text-sm" style={{ color: "var(--tideline)" }}>Analyzing revenue opportunities...</p></div>;
  if (!data || data.scenarios.length === 0) return null;

  return (
    <div className="koast-anim rounded-2xl p-6" style={{ background: "white", boxShadow: "var(--shadow-card)", animationDelay: "600ms" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--coastal)" }}>Revenue Opportunities</h2>
          <p className="text-sm" style={{ color: "var(--tideline)" }}>What-if scenarios based on your data</p>
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: "var(--golden)" }}>Total potential</p>
          <p className="text-2xl font-bold font-mono" style={{ color: "var(--coastal)" }}>+${data.total_opportunity.toLocaleString()}<span className="text-sm font-normal" style={{ color: "var(--tideline)" }}>/yr</span></p>
        </div>
      </div>

      <div className="space-y-3">
        {data.scenarios.map((sc) => (
          <div key={sc.id} className="rounded-xl p-4" style={{ border: "1px solid var(--dry-sand)" }}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{scenarioIcons[sc.icon] ?? "\ud83d\udca1"}</span>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--coastal)" }}>{sc.name}</h3>
                  <p className="text-xs" style={{ color: "var(--tideline)" }}>{sc.current_state}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold font-mono" style={{ color: "var(--lagoon)" }}>+${sc.estimated_impact.toLocaleString()}</p>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={
                  sc.confidence === "high" ? { background: "rgba(26,122,90,0.1)", color: "var(--lagoon)" }
                  : sc.confidence === "medium" ? { background: "rgba(212,150,11,0.1)", color: "var(--amber-tide)" }
                  : { background: "var(--shore)", color: "var(--tideline)" }
                }>{sc.confidence} confidence</span>
              </div>
            </div>
            <p className="text-sm mb-1" style={{ color: "var(--coastal)" }}>{sc.recommendation}</p>
            <p className="text-xs" style={{ color: "var(--tideline)" }}>{sc.details}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
