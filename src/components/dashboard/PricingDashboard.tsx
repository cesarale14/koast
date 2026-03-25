"use client";

import { useState, useMemo, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";

// ---------- Types ----------

interface RateEntry {
  date: string;
  base_rate: number | null;
  suggested_rate: number | null;
  applied_rate: number | null;
  rate_source: string;
  factors: Record<string, { score: number; weight: number; reason: string }> | null;
  is_available: boolean;
  min_stay: number;
}

interface CompEntry {
  comp_name: string | null;
  comp_adr: number | null;
  comp_occupancy: number | null;
  comp_revpar: number | null;
  comp_bedrooms: number | null;
  distance_km: number | null;
}

interface MarketSnapshot {
  market_adr: number | null;
  market_occupancy: number | null;
  market_revpar: number | null;
  market_supply: number | null;
  market_demand_score: number | null;
}

interface PropertyInfo {
  id: string;
  name: string;
}

interface PricingDashboardProps {
  properties: PropertyInfo[];
  initialPropertyId: string;
  rates: RateEntry[];
  comps: CompEntry[];
  snapshot: MarketSnapshot | null;
}

// ---------- Helpers ----------

function rateColor(rate: number, min: number, max: number): string {
  if (max === min) return "bg-blue-100";
  const t = (rate - min) / (max - min);
  if (t < 0.2) return "bg-blue-50";
  if (t < 0.4) return "bg-blue-100";
  if (t < 0.6) return "bg-blue-200";
  if (t < 0.8) return "bg-blue-300";
  return "bg-blue-400";
}

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

// ---------- Signal Bar ----------

function SignalBar({ name, score, weight, reason }: { name: string; score: number; weight: number; reason: string }) {
  const pct = Math.abs(score) * 100;
  const isPositive = score >= 0;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium text-gray-700 capitalize">{name.replace("_", " ")}</span>
        <span className={`font-mono font-semibold ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
          {score >= 0 ? "+" : ""}{score.toFixed(2)} × {weight.toFixed(2)}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${isPositive ? "bg-emerald-400" : "bg-red-400"}`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <p className="text-[11px] text-gray-400 mt-0.5">{reason}</p>
    </div>
  );
}

// ---------- Main Component ----------

export default function PricingDashboard({
  properties,
  initialPropertyId,
  rates: initialRates,
  comps,
  snapshot,
}: PricingDashboardProps) {
  const { toast } = useToast();
  const [propertyId, setPropertyId] = useState(initialPropertyId);
  const [rates, setRates] = useState(initialRates);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<string | null>(null);
  const [overrideRate, setOverrideRate] = useState("");
  const [bulkRate, setBulkRate] = useState("");
  const [pricingMode, setPricingMode] = useState<"auto" | "review" | "manual">("review");

  // Drag selection
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Stats
  const stats = useMemo(() => {
    const withApplied = rates.filter((r) => r.applied_rate != null);
    const withSuggested = rates.filter((r) => r.suggested_rate != null);
    const avgApplied = withApplied.length > 0
      ? Math.round(withApplied.reduce((s, r) => s + r.applied_rate!, 0) / withApplied.length)
      : 0;
    const avgSuggested = withSuggested.length > 0
      ? Math.round(withSuggested.reduce((s, r) => s + r.suggested_rate!, 0) / withSuggested.length)
      : 0;
    const potentialChange = withSuggested.reduce((s, r) => {
      const applied = r.applied_rate ?? r.base_rate ?? 0;
      const suggested = r.suggested_rate ?? applied;
      return s + (suggested - applied);
    }, 0);
    const needsApproval = rates.filter(
      (r) => r.suggested_rate != null && r.applied_rate !== r.suggested_rate
    ).length;
    return { avgApplied, avgSuggested, potentialChange: Math.round(potentialChange), needsApproval };
  }, [rates]);

  const rateRange = useMemo(() => {
    const allRates = rates
      .map((r) => r.applied_rate ?? r.suggested_rate ?? r.base_rate)
      .filter((v): v is number => v != null && v > 0);
    return {
      min: allRates.length > 0 ? Math.min(...allRates) : 100,
      max: allRates.length > 0 ? Math.max(...allRates) : 200,
    };
  }, [rates]);

  const selectedRateEntry = useMemo(
    () => rates.find((r) => r.date === selectedDate) ?? null,
    [rates, selectedDate]
  );

  // Group dates by month for the calendar
  const monthGroups = useMemo(() => {
    const groups: { month: string; dates: RateEntry[] }[] = [];
    let currentMonth = "";
    for (const r of rates) {
      const m = r.date.substring(0, 7);
      if (m !== currentMonth) {
        currentMonth = m;
        groups.push({
          month: new Date(r.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" }),
          dates: [],
        });
      }
      groups[groups.length - 1].dates.push(r);
    }
    return groups;
  }, [rates]);

  // Actions
  const runEngine = useCallback(async () => {
    setLoading("engine");
    try {
      const res = await fetch(`/api/pricing/calculate/${propertyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricing_mode: pricingMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Engine calculated ${data.dates_calculated} dates (range: $${data.rate_range.min}-$${data.rate_range.max})`);
      // Reload rates
      const preview = await fetch(`/api/pricing/preview/${propertyId}`);
      const previewData = await preview.json();
      if (previewData.rates) setRates(previewData.rates);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Engine failed", "error");
    }
    setLoading(null);
  }, [propertyId, pricingMode, toast]);

  const approveAll = useCallback(async () => {
    const datesToApprove = rates
      .filter((r) => r.suggested_rate != null && r.applied_rate !== r.suggested_rate)
      .map((r) => r.date);
    if (datesToApprove.length === 0) { toast("No suggestions to approve"); return; }
    setLoading("approve");
    try {
      const res = await fetch(`/api/pricing/approve/${propertyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dates: datesToApprove }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Approved ${data.approved} dates`);
      setRates((prev) =>
        prev.map((r) =>
          datesToApprove.includes(r.date) ? { ...r, applied_rate: r.suggested_rate } : r
        )
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Approve failed", "error");
    }
    setLoading(null);
  }, [rates, propertyId, toast]);

  const pushToOTAs = useCallback(async () => {
    setLoading("push");
    try {
      const res = await fetch(`/api/pricing/push/${propertyId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Pushed ${data.pushed} rates to Channex`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Push failed", "error");
    }
    setLoading(null);
  }, [propertyId, toast]);

  const approveSelected = useCallback(async () => {
    const dates = Array.from(selectedDates);
    if (dates.length === 0) return;
    setLoading("approve-sel");
    try {
      const res = await fetch(`/api/pricing/approve/${propertyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Approved ${data.approved} dates`);
      setRates((prev) =>
        prev.map((r) =>
          dates.includes(r.date) ? { ...r, applied_rate: r.suggested_rate } : r
        )
      );
      setSelectedDates(new Set());
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    }
    setLoading(null);
  }, [selectedDates, propertyId, toast]);

  const bulkOverride = useCallback(async () => {
    const rate = parseFloat(bulkRate);
    if (isNaN(rate) || rate <= 0) { toast("Enter a valid rate", "error"); return; }
    const dates = Array.from(selectedDates);
    if (dates.length === 0) return;
    setLoading("bulk");
    try {
      // Update each date via Supabase directly through a simple API
      for (const date of dates) {
        await fetch(`/api/pricing/approve/${propertyId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dates: [date] }),
        });
      }
      setRates((prev) =>
        prev.map((r) =>
          dates.includes(r.date) ? { ...r, applied_rate: rate, rate_source: "override" } : r
        )
      );
      toast(`Set $${rate} for ${dates.length} dates`);
      setSelectedDates(new Set());
      setBulkRate("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    }
    setLoading(null);
  }, [selectedDates, bulkRate, propertyId, toast]);

  const overrideSingle = useCallback(async () => {
    const rate = parseFloat(overrideRate);
    if (isNaN(rate) || rate <= 0 || !selectedDate) return;
    setRates((prev) =>
      prev.map((r) =>
        r.date === selectedDate ? { ...r, applied_rate: rate, rate_source: "override" } : r
      )
    );
    toast(`Override: $${rate} for ${formatDate(selectedDate)}`);
    setOverrideRate("");
  }, [selectedDate, overrideRate, toast]);

  const handleDateClick = (date: string) => {
    if (isDragging) return;
    setSelectedDate(date);
    const entry = rates.find((r) => r.date === date);
    setOverrideRate(entry?.applied_rate?.toString() ?? "");
  };

  const handleMouseDown = (date: string) => {
    setIsDragging(true);
    setDragStart(date);
    setSelectedDates(new Set([date]));
  };

  const handleMouseEnter = (date: string) => {
    if (!isDragging || !dragStart) return;
    const allDates = rates.map((r) => r.date);
    const start = dragStart < date ? dragStart : date;
    const end = dragStart < date ? date : dragStart;
    setSelectedDates(new Set(allDates.filter((d) => d >= start && d <= end)));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  return (
    <div onMouseUp={handleMouseUp}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Dynamic Pricing</h1>
          <p className="text-gray-500">AI-powered rate optimization</p>
        </div>
        <div className="flex items-center gap-3">
          {properties.length > 1 && (
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          {/* Pricing mode toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {(["auto", "review", "manual"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setPricingMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                  pricingMode === mode ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400">Avg Applied Rate</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">${stats.avgApplied}</p>
          {snapshot?.market_adr && (
            <p className="text-[11px] text-gray-400 mt-1">Market ADR: ${Math.round(snapshot.market_adr)}</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400">Avg Suggested Rate</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">${stats.avgSuggested}</p>
          <p className="text-[11px] text-gray-400 mt-1">
            {stats.avgSuggested > stats.avgApplied ? "↑" : "↓"} {Math.abs(stats.avgSuggested - stats.avgApplied)} vs applied
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400">Revenue Opportunity</p>
          <p className={`text-2xl font-bold mt-1 ${stats.potentialChange >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {stats.potentialChange >= 0 ? "+" : ""}{stats.potentialChange > 0 ? `$${stats.potentialChange}` : "$0"}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">If all suggestions accepted</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400">Needs Approval</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.needsApproval}</p>
          <p className="text-[11px] text-gray-400 mt-1">dates with suggestions</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={runEngine}
          disabled={loading === "engine"}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading === "engine" ? "Running..." : "Run Pricing Engine"}
        </button>
        {stats.needsApproval > 0 && (
          <button
            onClick={approveAll}
            disabled={loading === "approve"}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {loading === "approve" ? "Approving..." : `Apply All Suggestions (${stats.needsApproval})`}
          </button>
        )}
        <button
          onClick={pushToOTAs}
          disabled={loading === "push"}
          className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {loading === "push" ? "Pushing..." : "Push to OTAs"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar heatmap (2/3 width) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Rate Calendar</h2>
            {/* Legend */}
            <div className="flex items-center gap-2 text-[10px] text-gray-400">
              <span>Low</span>
              <div className="flex gap-0.5">
                {["bg-blue-50", "bg-blue-100", "bg-blue-200", "bg-blue-300", "bg-blue-400"].map((c) => (
                  <div key={c} className={`w-4 h-3 rounded-sm ${c}`} />
                ))}
              </div>
              <span>High</span>
              <span className="ml-2">●</span>
              <span className="text-emerald-500">↑ raise</span>
              <span className="text-red-500">↓ lower</span>
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedDates.size > 1 && (
            <div className="flex items-center gap-3 p-3 mb-4 bg-blue-50 rounded-lg border border-blue-200">
              <span className="text-sm font-medium text-blue-900">{selectedDates.size} dates selected</span>
              <button
                onClick={approveSelected}
                disabled={!!loading}
                className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                Approve Selected
              </button>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={bulkRate}
                  onChange={(e) => setBulkRate(e.target.value)}
                  placeholder="$rate"
                  className="w-20 px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
                />
                <button
                  onClick={bulkOverride}
                  disabled={!!loading}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  Override
                </button>
              </div>
              <button onClick={() => setSelectedDates(new Set())} className="text-xs text-gray-500 hover:text-gray-700 ml-auto">
                Clear
              </button>
            </div>
          )}

          {/* Calendar grid */}
          {monthGroups.map((group) => (
            <div key={group.month} className="mb-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">{group.month}</h3>
              <div className="grid grid-cols-7 gap-1">
                {group.dates.map((r) => {
                  const d = new Date(r.date + "T00:00:00");
                  const rate = r.applied_rate ?? r.base_rate ?? 0;
                  const hasSuggestion = r.suggested_rate != null && r.applied_rate !== r.suggested_rate;
                  const suggestUp = hasSuggestion && (r.suggested_rate ?? 0) > (r.applied_rate ?? 0);
                  const suggestDown = hasSuggestion && (r.suggested_rate ?? 0) < (r.applied_rate ?? 0);
                  const isSelected = selectedDates.has(r.date);
                  const isActive = selectedDate === r.date;
                  const bg = rate > 0 ? rateColor(rate, rateRange.min, rateRange.max) : "bg-gray-50";

                  return (
                    <div
                      key={r.date}
                      className={`relative p-1.5 rounded-lg cursor-pointer transition-all select-none ${bg} ${
                        isActive ? "ring-2 ring-blue-500" : isSelected ? "ring-2 ring-blue-300" : "hover:ring-1 hover:ring-gray-300"
                      } ${!r.is_available ? "opacity-40" : ""}`}
                      onClick={() => handleDateClick(r.date)}
                      onMouseDown={() => handleMouseDown(r.date)}
                      onMouseEnter={() => handleMouseEnter(r.date)}
                    >
                      <div className="text-[10px] text-gray-400">
                        {d.toLocaleDateString("en-US", { weekday: "narrow" })} {d.getDate()}
                      </div>
                      <div className="text-sm font-bold text-gray-900">
                        ${rate > 0 ? Math.round(rate) : "—"}
                      </div>
                      {hasSuggestion && (
                        <div className={`text-[10px] font-medium ${suggestUp ? "text-emerald-600" : "text-red-500"}`}>
                          {suggestUp ? "↑" : "↓"}${Math.round(r.suggested_rate!)}
                        </div>
                      )}
                      {(suggestUp || suggestDown) && (
                        <div className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${suggestUp ? "bg-emerald-500" : "bg-red-400"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Side panel: date detail / market context */}
        <div className="space-y-6">
          {/* Date detail panel */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {selectedDate ? formatDate(selectedDate) : "Select a Date"}
            </h2>

            {selectedRateEntry ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-400">Applied Rate</p>
                    <p className="text-xl font-bold text-gray-900">${Math.round(selectedRateEntry.applied_rate ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Suggested Rate</p>
                    <p className="text-xl font-bold text-blue-600">
                      {selectedRateEntry.suggested_rate != null ? `$${Math.round(selectedRateEntry.suggested_rate)}` : "—"}
                    </p>
                  </div>
                </div>

                {selectedRateEntry.suggested_rate != null &&
                  selectedRateEntry.applied_rate !== selectedRateEntry.suggested_rate && (
                    <button
                      onClick={() => {
                        setRates((prev) =>
                          prev.map((r) =>
                            r.date === selectedDate ? { ...r, applied_rate: r.suggested_rate } : r
                          )
                        );
                        fetch(`/api/pricing/approve/${propertyId}`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ dates: [selectedDate] }),
                        });
                        toast(`Accepted $${Math.round(selectedRateEntry.suggested_rate!)} for ${formatDate(selectedDate!)}`);
                      }}
                      className="w-full py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
                    >
                      Accept Suggestion
                    </button>
                  )}

                {/* Override */}
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={overrideRate}
                    onChange={(e) => setOverrideRate(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    placeholder="Override rate"
                  />
                  <button
                    onClick={overrideSingle}
                    className="px-4 py-2 bg-gray-700 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
                  >
                    Set
                  </button>
                </div>

                {/* Signal breakdown */}
                {selectedRateEntry.factors && (
                  <div className="pt-4 border-t border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Signal Breakdown</h3>
                    {Object.entries(selectedRateEntry.factors).map(([name, sig]) => (
                      <SignalBar key={name} name={name} score={sig.score} weight={sig.weight} reason={sig.reason} />
                    ))}
                  </div>
                )}

                <div className="pt-3 border-t border-gray-100 text-xs text-gray-400">
                  Source: {selectedRateEntry.rate_source} · Min stay: {selectedRateEntry.min_stay}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Click a date on the calendar to see details and signal breakdown.</p>
            )}
          </div>

          {/* Market context */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Market Context</h2>
            {snapshot ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Market ADR</span>
                  <span className="font-semibold text-gray-900">${Math.round(snapshot.market_adr ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Market Occupancy</span>
                  <span className="font-semibold text-gray-900">{snapshot.market_occupancy ?? 0}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Market RevPAR</span>
                  <span className="font-semibold text-gray-900">${Math.round(snapshot.market_revpar ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Demand Score</span>
                  <span className="font-semibold text-gray-900">{snapshot.market_demand_score ?? 0}/100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Active Listings</span>
                  <span className="font-semibold text-gray-900">{(snapshot.market_supply ?? 0).toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No market data. Run a market refresh.</p>
            )}

            {/* Comp set */}
            {comps.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Comp Set ({comps.length})</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {comps.map((c, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{c.comp_name ?? "Listing"}</p>
                        <p className="text-[10px] text-gray-400">
                          {c.comp_bedrooms ?? "?"}BR · {c.distance_km != null ? `${c.distance_km}km` : "—"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-gray-900">${Math.round(c.comp_adr ?? 0)}</p>
                        <p className="text-[10px] text-gray-400">{c.comp_occupancy ?? 0}% occ</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={async () => {
                setLoading("market");
                try {
                  await fetch(`/api/market/refresh/${propertyId}`, { method: "POST" });
                  toast("Market data refreshed");
                } catch { toast("Refresh failed", "error"); }
                setLoading(null);
              }}
              disabled={loading === "market"}
              className="w-full mt-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              {loading === "market" ? "Refreshing..." : "Refresh Market Data"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
