"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import CalendarToolbar from "./CalendarToolbar";
import MonthlyView from "./MonthlyView";
import BookingSidePanel from "./BookingSidePanel";
import { ConflictResolutionModal, type Conflict, type ConflictBooking } from "@/components/dashboard/ConflictResolution";
import PropertyAvatar from "@/components/ui/PropertyAvatar";
import type { BookingBarData } from "./BookingBar";
import type { RateData } from "./DateCell";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

interface CalendarProperty {
  id: string;
  name: string;
  cover_photo_url?: string | null;
}

interface CalendarBooking {
  id: string;
  property_id: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  check_in: string;
  check_out: string;
  platform: string;
  total_price: number | null;
  num_guests: number | null;
  status: string;
  notes: string | null;
}

interface CalendarRate {
  property_id: string;
  date: string;
  base_rate: number | null;
  suggested_rate: number | null;
  applied_rate: number | null;
  min_stay: number;
  is_available: boolean;
  rate_source: string;
}

interface CalendarEvent {
  name: string;
  impact: number;
}

interface CalendarGridProps {
  properties: CalendarProperty[];
  bookings: CalendarBooking[];
  rates: CalendarRate[];
  totalDays: number;
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

export default function CalendarGrid({
  properties,
  bookings,
  rates: initialRates,
}: CalendarGridProps) {
  const { toast } = useToast();
  const todayStr = getToday();

  // ---------- State ----------
  const [monthlyPropertyId, setMonthlyPropertyId] = useState(properties[0]?.id ?? "");
  const [monthlyTodayTrigger, setMonthlyTodayTrigger] = useState(0);
  const [selectedBooking, setSelectedBooking] = useState<BookingBarData | null>(null);
  const [activeConflict, setActiveConflict] = useState<Conflict | null>(null);

  // Right-side rate editing panel
  const [ratePanel, setRatePanel] = useState<{
    propertyId: string;
    dates: string[];
    rate: RateData | null;
  } | null>(null);

  // ---------- Rates ----------
  const [ratesState, setRatesState] = useState(initialRates);

  const rateLookup = useMemo(() => {
    const map = new Map<string, Map<string, RateData>>();
    for (const r of ratesState) {
      if (!map.has(r.property_id)) map.set(r.property_id, new Map());
      map.get(r.property_id)!.set(r.date, {
        base_rate: r.base_rate,
        suggested_rate: r.suggested_rate,
        applied_rate: r.applied_rate,
        min_stay: r.min_stay,
        is_available: r.is_available,
        rate_source: r.rate_source,
      });
    }
    return map;
  }, [ratesState]);

  // ---------- Bookings ----------
  const bookingLookup = useMemo(() => {
    const map = new Map<string, BookingBarData[]>();
    for (const b of bookings) {
      if (!map.has(b.property_id)) map.set(b.property_id, []);
      map.get(b.property_id)!.push(b);
    }
    return map;
  }, [bookings]);

  // ---------- Events (per property) ----------
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [eventLookup, setEventLookup] = useState<Map<string, Map<string, CalendarEvent>>>(new Map());
  useEffect(() => {
    const map = new Map<string, Map<string, CalendarEvent>>();
    const fetches = properties.map((p) =>
      fetch(`/api/analytics/forecast/${p.id}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (!d?.forecast) return;
          const dateMap = new Map<string, CalendarEvent>();
          for (const f of d.forecast as { date: string; demand_score: number; factors: string[] }[]) {
            const eventFactor = f.factors.find((fac: string) =>
              !fac.includes("season") && !fac.includes("DOW") && !fac.includes("Market") &&
              !fac.includes("Supply") && !fac.includes("learned") && !fac.includes("default") &&
              !fac.includes("Clear") && !fac.includes("Rain")
            );
            if (eventFactor) dateMap.set(f.date, { name: eventFactor, impact: f.demand_score / 100 });
          }
          map.set(p.id, dateMap);
        })
        .catch(() => {})
    );
    Promise.all(fetches).then(() => setEventLookup(new Map(map)));
  }, [properties]);

  // ---------- Handlers ----------
  const handleDateClick = useCallback(
    (propertyId: string, date: string, rate: RateData | null) => {
      setRatePanel({ propertyId, dates: [date], rate });
    },
    [],
  );

  const handleSaveRate = useCallback(
    async (updates: {
      dates: string[];
      applied_rate: number | null;
      is_available: boolean;
      min_stay: number;
    }) => {
      if (!ratePanel) return;
      const supabase = createClient();

      for (const date of updates.dates) {
        await supabase.from("calendar_rates").upsert(
          {
            property_id: ratePanel.propertyId,
            date,
            applied_rate: updates.applied_rate,
            is_available: updates.is_available,
            min_stay: updates.min_stay,
            rate_source: "manual",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          { onConflict: "property_id,date" },
        );
      }

      setRatesState((prev) => {
        const next = [...prev];
        for (const date of updates.dates) {
          const idx = next.findIndex(
            (r) => r.property_id === ratePanel.propertyId && r.date === date,
          );
          const entry: CalendarRate = {
            property_id: ratePanel.propertyId,
            date,
            base_rate: null,
            suggested_rate: null,
            applied_rate: updates.applied_rate,
            min_stay: updates.min_stay,
            is_available: updates.is_available,
            rate_source: "manual",
          };
          if (idx >= 0) {
            next[idx] = { ...next[idx], ...entry };
          } else {
            next.push(entry);
          }
        }
        return next;
      });

      toast(`Rate saved for ${updates.dates.length} date${updates.dates.length > 1 ? "s" : ""}. Use "Push to OTAs" on the Pricing page to sync to Channex.`);
      setRatePanel(null);
    },
    [ratePanel, toast],
  );

  // ---------- Monthly property stats ----------
  const monthlyStats = useMemo(() => {
    if (!monthlyPropertyId) return { nextCheckIn: "—", occupancy: 0, avgRate: 0 };
    const propBookings = bookingLookup.get(monthlyPropertyId) ?? [];
    const propRates = rateLookup.get(monthlyPropertyId) ?? new Map<string, RateData>();

    const upcoming = propBookings
      .filter((b) => b.check_in >= todayStr)
      .sort((a, b) => a.check_in.localeCompare(b.check_in));
    const nextCheckIn = upcoming[0]
      ? new Date(upcoming[0].check_in + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "—";

    let bookedNights = 0;
    const days = 30;
    for (let i = 0; i < days; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const ds = d.toISOString().split("T")[0];
      if (propBookings.some((b) => ds >= b.check_in && ds < b.check_out)) bookedNights++;
    }
    const occupancy = Math.round((bookedNights / days) * 100);

    let rateSum = 0, rateCount = 0;
    propRates.forEach((r) => {
      const rate = r.applied_rate ?? r.suggested_rate ?? r.base_rate;
      if (rate) { rateSum += rate; rateCount++; }
    });
    const avgRate = rateCount > 0 ? Math.round(rateSum / rateCount) : 0;

    return { nextCheckIn, occupancy, avgRate };
  }, [monthlyPropertyId, bookingLookup, rateLookup, todayStr]);

  // ---------- Conflict pairs (banner) ----------
  const monthlyConflictPairs = useMemo(() => {
    const propBookings = bookingLookup.get(monthlyPropertyId) ?? [];
    const confirmed = propBookings.filter((b) => !b.status || b.status === "confirmed");
    const sorted = [...confirmed].sort((x, y) =>
      x.check_in === y.check_in ? x.check_out.localeCompare(y.check_out) : x.check_in.localeCompare(y.check_in),
    );
    const pairs: { a: BookingBarData; b: BookingBarData; start: string; end: string; nights: number }[] = [];
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].check_in >= sorted[i].check_out) continue;
        if (sorted[i].check_out === sorted[j].check_in || sorted[j].check_out === sorted[i].check_in) continue;
        const start = sorted[i].check_in > sorted[j].check_in ? sorted[i].check_in : sorted[j].check_in;
        const end = sorted[i].check_out < sorted[j].check_out ? sorted[i].check_out : sorted[j].check_out;
        const nights = Math.round(
          (Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10)) -
            Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10))) /
            86400000,
        );
        if (nights === 0) continue;
        pairs.push({ a: sorted[i], b: sorted[j], start, end, nights });
      }
    }
    return pairs;
  }, [monthlyPropertyId, bookingLookup]);

  const handleConflictResolve = useCallback(
    (a: BookingBarData, b: BookingBarData) => {
      const toConflictBooking = (x: BookingBarData): ConflictBooking => ({
        id: x.id, property_id: x.property_id, guest_name: x.guest_name,
        check_in: x.check_in, check_out: x.check_out, platform: x.platform,
        total_price: x.total_price, channex_booking_id: null,
        platform_booking_id: null, status: x.status,
      });
      const start = a.check_in > b.check_in ? a.check_in : b.check_in;
      const end = a.check_out < b.check_out ? a.check_out : b.check_out;
      const nights = Math.round(
        (Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10)) -
          Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10))) /
          86400000,
      );
      setActiveConflict({
        property_id: monthlyPropertyId,
        property_name: properties.find((p) => p.id === monthlyPropertyId)?.name ?? "Property",
        booking1: toConflictBooking(a), booking2: toConflictBooking(b),
        overlap_start: start, overlap_end: end, overlap_nights: nights,
      });
    },
    [monthlyPropertyId, properties],
  );

  return (
    <div className="flex flex-col h-full relative bg-white">
      <CalendarToolbar
        onToday={() => setMonthlyTodayTrigger((t) => t + 1)}
        properties={properties}
        selectedPropertyId={monthlyPropertyId}
        onPropertyChange={(id) => setMonthlyPropertyId(id ?? properties[0]?.id ?? "")}
      />

      {/* Conflict banner — full width between toolbar and calendar */}
      {monthlyConflictPairs.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 border-b border-red-100 bg-red-50">
          <div className="flex flex-wrap items-center gap-2">
            {monthlyConflictPairs.map((p, i) => {
              const s = new Date(p.start + "T00:00:00");
              const e = new Date(p.end + "T00:00:00");
              const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
              const sMonth = s.toLocaleDateString("en-US", { month: "short" });
              const eMonth = e.toLocaleDateString("en-US", { month: "short" });
              const range = sameMonth
                ? `${sMonth} ${s.getDate()}–${e.getDate()}`
                : `${sMonth} ${s.getDate()} – ${eMonth} ${e.getDate()}`;
              const label = `${monthlyConflictPairs.length > 1 ? `#${i + 1} ` : ""}${p.nights} night${p.nights === 1 ? "" : "s"} overlap ${range}`;
              return (
                <button
                  key={`${p.a.id}-${p.b.id}`}
                  onClick={() => handleConflictResolve(p.a, p.b)}
                  className="inline-flex items-center gap-2 px-3 h-7 rounded-full bg-red-100 text-red-800 text-xs font-semibold border border-red-200 hover:bg-red-200 transition-colors"
                  title={`${p.a.guest_name ?? "Guest"} × ${p.b.guest_name ?? "Guest"}`}
                >
                  <span className="w-4 h-4 rounded-full bg-red-500 text-white inline-flex items-center justify-center text-[10px] font-bold">!</span>
                  <span>{label}</span>
                  <span className="text-red-600/80 font-normal">· Click to resolve</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main content fills remaining viewport height */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row bg-white overflow-hidden">
        {/* Left property panel — desktop only */}
        <aside className="hidden md:flex flex-col w-[200px] flex-shrink-0 border-r border-gray-100 overflow-y-auto">
          <div className="p-3">
            <div className="space-y-0.5">
              {properties.map((p) => {
                const isActive = monthlyPropertyId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setMonthlyPropertyId(p.id)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                      isActive ? "bg-gray-100" : "hover:bg-gray-50"
                    }`}
                    style={isActive ? { borderLeft: "3px solid var(--brand-500)" } : { borderLeft: "3px solid transparent" }}
                  >
                    <PropertyAvatar name={p.name} photoUrl={p.cover_photo_url} size={26} />
                    <span className={`text-sm truncate ${isActive ? "font-bold text-[#222]" : "text-[#555]"}`}>
                      {p.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick stats */}
          <div className="border-t border-gray-100 p-3 mt-auto">
            <h3 className="text-[10px] font-medium uppercase tracking-widest text-[#999] mb-2">
              Quick Stats
            </h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#999]">Next check-in</span>
                <span className="font-medium text-[#333]">{monthlyStats.nextCheckIn}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#999]">Occupancy</span>
                <span className="font-medium text-[#333]">{monthlyStats.occupancy}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#999]">Avg rate</span>
                <span className="font-mono font-medium text-[#333]">
                  {monthlyStats.avgRate > 0 ? `$${monthlyStats.avgRate}` : "—"}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Calendar grid fills remaining space */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <MonthlyView
            propertyId={monthlyPropertyId}
            bookings={bookingLookup.get(monthlyPropertyId) ?? []}
            rates={rateLookup.get(monthlyPropertyId) ?? new Map()}
            todayStr={todayStr}
            todayTrigger={monthlyTodayTrigger}
            onBookingClick={setSelectedBooking}
            onDateClick={handleDateClick}
          />
        </div>

        {/* Right-side rate/availability panel */}
        {ratePanel && <RateSettingsPanel ratePanel={ratePanel} rateLookup={rateLookup} onSave={handleSaveRate} onClose={() => setRatePanel(null)} />}
      </div>

      {/* Booking side panel */}
      <BookingSidePanel
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
        propertyMap={new Map(properties.map((p) => [p.id, { name: p.name, cover_photo_url: p.cover_photo_url }]))}
      />

      {/* Conflict resolution modal */}
      <ConflictResolutionModal
        conflict={activeConflict}
        onClose={() => setActiveConflict(null)}
        onResolved={() => {}}
      />
    </div>
  );
}

// ---------- Right-side rate settings panel ----------

function RateSettingsPanel({
  ratePanel,
  rateLookup,
  onSave,
  onClose,
}: {
  ratePanel: { propertyId: string; dates: string[]; rate: RateData | null };
  rateLookup: Map<string, Map<string, RateData>>;
  onSave: (updates: { dates: string[]; applied_rate: number | null; is_available: boolean; min_stay: number }) => void;
  onClose: () => void;
}) {
  const r = ratePanel.rate;
  const [rateValue, setRateValue] = useState(r?.applied_rate?.toString() ?? r?.base_rate?.toString() ?? "");
  const [available, setAvailable] = useState(r?.is_available !== false);
  const [minStay, setMinStay] = useState(r?.min_stay ?? 1);
  const [saving, setSaving] = useState(false);

  // Reset form when selection changes
  const panelKey = ratePanel.dates.join(",");
  useEffect(() => {
    const fresh = ratePanel.rate;
    setRateValue(fresh?.applied_rate?.toString() ?? fresh?.base_rate?.toString() ?? "");
    setAvailable(fresh?.is_available !== false);
    setMinStay(fresh?.min_stay ?? 1);
    setSaving(false);
  }, [panelKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const propRates = rateLookup.get(ratePanel.propertyId);
  const dateLabel =
    ratePanel.dates.length === 1
      ? new Date(ratePanel.dates[0] + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
      : `${ratePanel.dates.length} dates`;

  const handleSave = () => {
    setSaving(true);
    onSave({
      dates: ratePanel.dates,
      applied_rate: rateValue ? parseFloat(rateValue) : null,
      is_available: available,
      min_stay: minStay,
    });
  };

  return (
    <aside className="w-[260px] flex-shrink-0 border-l border-gray-100 bg-white overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-[#222]">{dateLabel}</h3>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Current rate info */}
        {ratePanel.dates.length === 1 && (() => {
          const dr = propRates?.get(ratePanel.dates[0]);
          if (!dr) return null;
          return (
            <div className="space-y-1.5">
              <h4 className="text-[10px] font-medium uppercase tracking-widest text-[#999]">Current</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {dr.base_rate != null && (
                  <div className="bg-gray-50 rounded-lg px-2.5 py-2">
                    <div className="text-[10px] text-[#999]">Base</div>
                    <div className="font-mono font-semibold text-[#333]">${dr.base_rate}</div>
                  </div>
                )}
                {dr.suggested_rate != null && (
                  <div className="bg-emerald-50 rounded-lg px-2.5 py-2">
                    <div className="text-[10px] text-emerald-600">Suggested</div>
                    <div className="font-mono font-semibold text-emerald-700">${dr.suggested_rate}</div>
                  </div>
                )}
                {dr.applied_rate != null && (
                  <div className="bg-blue-50 rounded-lg px-2.5 py-2">
                    <div className="text-[10px] text-blue-600">Applied</div>
                    <div className="font-mono font-semibold text-blue-700">${dr.applied_rate}</div>
                  </div>
                )}
                <div className="bg-gray-50 rounded-lg px-2.5 py-2">
                  <div className="text-[10px] text-[#999]">Source</div>
                  <div className="font-medium text-[#333] capitalize">{dr.rate_source}</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Rate input */}
        <div>
          <label className="block text-[11px] font-medium text-[#666] mb-1">Nightly Rate ($)</label>
          <input
            type="number"
            value={rateValue}
            onChange={(e) => setRateValue(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            placeholder="0"
            min="0"
            step="1"
          />
        </div>

        {/* Min stay */}
        <div>
          <label className="block text-[11px] font-medium text-[#666] mb-1">Min Stay (nights)</label>
          <input
            type="number"
            value={minStay}
            onChange={(e) => setMinStay(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            min="1"
          />
        </div>

        {/* Availability toggle */}
        <label className="flex items-center justify-between cursor-pointer py-1">
          <span className="text-sm text-[#333]">Available</span>
          <button
            type="button"
            role="switch"
            aria-checked={available}
            onClick={() => setAvailable(!available)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              available ? "bg-emerald-500" : "bg-gray-300"
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              available ? "translate-x-[18px]" : "translate-x-[3px]"
            }`} />
          </button>
        </label>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-100 space-y-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-3 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={onClose}
          className="w-full px-3 py-2 text-sm font-medium text-[#666] bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </aside>
  );
}
