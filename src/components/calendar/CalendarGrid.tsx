"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import CalendarToolbar from "./CalendarToolbar";
import PropertyRow from "./PropertyRow";
import MonthlyView from "./MonthlyView";
import BookingSidePanel from "./BookingSidePanel";
import DateEditPopover from "./DateEditPopover";
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

function generateDates(startDate: Date, count: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}


export default function CalendarGrid({
  properties,
  bookings,
  rates: initialRates,
  totalDays,
}: CalendarGridProps) {
  const { toast } = useToast();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = getToday();

  // ---------- View mode (persisted) ----------
  const defaultView = properties.length === 1 ? "monthly" : "timeline";
  const [viewMode, setViewMode] = useState<"timeline" | "monthly">(defaultView);

  useEffect(() => {
    const saved = localStorage.getItem("calendar-view");
    if (saved === "timeline" || saved === "monthly") setViewMode(saved);
  }, []);

  const handleViewChange = useCallback((mode: "timeline" | "monthly") => {
    setViewMode(mode);
    localStorage.setItem("calendar-view", mode);
  }, []);

  // ---------- Timeline state ----------
  const [offsetWeeks, setOffsetWeeks] = useState(0);
  const [timelinePropertyId, setTimelinePropertyId] = useState<string | null>(null);

  // ---------- Monthly state ----------
  const [monthlyPropertyId, setMonthlyPropertyId] = useState(properties[0]?.id ?? "");
  const [monthlyTodayTrigger, setMonthlyTodayTrigger] = useState(0);

  // ---------- Common state ----------
  const [selectedBooking, setSelectedBooking] = useState<BookingBarData | null>(null);
  const [activeConflict, setActiveConflict] = useState<Conflict | null>(null);
  const [popover, setPopover] = useState<{
    propertyId: string;
    dates: string[];
    rate: RateData | null;
    position: { top: number; left: number };
  } | null>(null);

  // ---------- Drag selection (timeline) ----------
  const [dragPropertyId, setDragPropertyId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const isDragging = useRef(false);

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

  // ---------- Gap nights (per property) ----------
  const gapLookup = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const propId of Array.from(bookingLookup.keys())) {
      const propBookings = bookingLookup.get(propId)!;
      const gaps = new Set<string>();
      const sorted = [...propBookings].sort((a, b) => a.check_in.localeCompare(b.check_in));
      for (let i = 0; i < sorted.length - 1; i++) {
        const co = sorted[i].check_out;
        const ci = sorted[i + 1].check_in;
        const gapMs = Date.UTC(+ci.slice(0, 4), +ci.slice(5, 7) - 1, +ci.slice(8, 10)) -
                      Date.UTC(+co.slice(0, 4), +co.slice(5, 7) - 1, +co.slice(8, 10));
        const gapNights = Math.round(gapMs / 86400000);
        if (gapNights >= 1 && gapNights <= 2) {
          const d = new Date(co + "T00:00:00");
          const end = new Date(ci + "T00:00:00");
          while (d < end) {
            gaps.add(d.toISOString().split("T")[0]);
            d.setDate(d.getDate() + 1);
          }
        }
      }
      map.set(propId, gaps);
    }
    return map;
  }, [bookingLookup]);

  // ---------- Timeline dates ----------
  const allDates = generateDates(today, totalDays);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() + offsetWeeks * 7);
  const visibleDayCount = 30;
  const startIdx = Math.max(0, offsetWeeks * 7);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + startIdx + visibleDayCount - 1);

  // ---------- Scroll ----------
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const handleScroll = useCallback(() => {
    if (scrollRef.current) setScrollLeft(scrollRef.current.scrollLeft);
  }, []);

  const visibleColStart = Math.floor(scrollLeft / 80);
  const visibleColEnd = Math.min(
    allDates.length,
    visibleColStart + Math.ceil((scrollRef.current?.clientWidth ?? 1200) / 80) + 2,
  );

  // ---------- Filtered properties (timeline) ----------
  const filteredProperties = timelinePropertyId
    ? properties.filter((p) => p.id === timelinePropertyId)
    : properties;

  // ---------- Drag helpers ----------
  const getSelectedDates = useCallback((): Set<string> => {
    if (!dragStart || !dragEnd || !isDragging.current) return new Set();
    const start = dragStart < dragEnd ? dragStart : dragEnd;
    const end = dragStart < dragEnd ? dragEnd : dragStart;
    const selected = new Set<string>();
    for (const d of allDates) {
      if (d >= start && d <= end) selected.add(d);
    }
    return selected;
  }, [dragStart, dragEnd, allDates]);

  const handleDragStart = useCallback(
    (propertyId: string, date: string) => {
      const propBookings = bookingLookup.get(propertyId) ?? [];
      const isBooked = propBookings.some((b) => date >= b.check_in && date < b.check_out);
      if (isBooked) return;
      isDragging.current = true;
      setDragPropertyId(propertyId);
      setDragStart(date);
      setDragEnd(date);
    },
    [bookingLookup],
  );

  const handleDragEnter = useCallback((_propertyId: string, date: string) => {
    if (isDragging.current) setDragEnd(date);
  }, []);

  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging.current && dragPropertyId && dragStart && dragEnd) {
        isDragging.current = false;
        const start = dragStart < dragEnd ? dragStart : dragEnd;
        const end = dragStart < dragEnd ? dragEnd : dragStart;
        const dates = allDates.filter((d) => d >= start && d <= end);

        if (dates.length > 0) {
          const propRates = rateLookup.get(dragPropertyId);
          const firstRate = propRates?.get(dates[0]) ?? null;
          setPopover({
            propertyId: dragPropertyId,
            dates,
            rate: firstRate,
            position: { top: 100, left: 300 },
          });
        }

        setDragStart(null);
        setDragEnd(null);
        setDragPropertyId(null);
      }
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [dragPropertyId, dragStart, dragEnd, allDates, rateLookup]);

  // ---------- Handlers ----------
  const handleDateClick = useCallback(
    (propertyId: string, date: string, rate: RateData | null) => {
      if (isDragging.current) return;
      setPopover({
        propertyId,
        dates: [date],
        rate,
        position: { top: 100, left: 300 },
      });
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
      if (!popover) return;
      const supabase = createClient();

      for (const date of updates.dates) {
        await supabase.from("calendar_rates").upsert(
          {
            property_id: popover.propertyId,
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
            (r) => r.property_id === popover.propertyId && r.date === date,
          );
          const entry: CalendarRate = {
            property_id: popover.propertyId,
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
      setPopover(null);
    },
    [popover, toast],
  );

  // ---------- Timeline navigation ----------
  const goToTodayTimeline = useCallback(() => {
    setOffsetWeeks(0);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, []);

  const goToPrevWeek = useCallback(() => {
    setOffsetWeeks((w) => {
      const next = Math.max(0, w - 1);
      if (scrollRef.current) scrollRef.current.scrollLeft = next * 7 * 80;
      return next;
    });
  }, []);

  const goToNextWeek = useCallback(() => {
    setOffsetWeeks((w) => {
      const maxOffset = Math.max(0, Math.ceil((totalDays - 7) / 7));
      const next = Math.min(maxOffset, w + 1);
      if (scrollRef.current) scrollRef.current.scrollLeft = next * 7 * 80;
      return next;
    });
  }, [totalDays]);

  const selectedDates = getSelectedDates();

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

  // ---------- Conflict pairs (monthly banner) ----------
  const monthlyConflictPairs = useMemo(() => {
    if (viewMode !== "monthly") return [];
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
  }, [viewMode, monthlyPropertyId, bookingLookup]);

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
        viewMode={viewMode}
        onViewChange={handleViewChange}
        startDate={new Date(today.getTime() + offsetWeeks * 7 * 86400000)}
        endDate={endDate}
        onToday={viewMode === "timeline" ? goToTodayTimeline : () => setMonthlyTodayTrigger((t) => t + 1)}
        onPrev={goToPrevWeek}
        onNext={goToNextWeek}
        properties={properties}
        selectedPropertyId={viewMode === "timeline" ? timelinePropertyId : monthlyPropertyId}
        onPropertyChange={
          viewMode === "timeline"
            ? setTimelinePropertyId
            : (id) => setMonthlyPropertyId(id ?? properties[0]?.id ?? "")
        }
        showAllOption={viewMode === "timeline"}
      />

      {/* Conflict banner — full width between toolbar and calendar */}
      {viewMode === "monthly" && monthlyConflictPairs.length > 0 && (
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
      <div className="flex-1 min-h-0">
        {/* ============ TIMELINE VIEW ============ */}
        {viewMode === "timeline" && (
          <div className="h-full overflow-hidden bg-white">
            {/* Header: date labels */}
            <div className="flex border-b border-gray-100">
              <div className="w-[140px] md:w-52 min-w-[140px] md:min-w-[208px] flex-shrink-0 bg-neutral-50 border-r border-gray-100 px-4 py-2 sticky left-0 z-20">
                <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Property
                </span>
              </div>

              <div
                className="flex-1 overflow-x-auto scroll-smooth"
                ref={scrollRef}
                onScroll={handleScroll}
              >
                <div className="flex" style={{ width: `${allDates.length * 80}px` }}>
                  {allDates.map((date, i) => {
                    if (i < visibleColStart - 1 || i > visibleColEnd + 1) {
                      return <div key={date} className="w-[80px] flex-shrink-0" />;
                    }
                    const d = new Date(date + "T00:00:00");
                    const isToday = date === todayStr;
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const isFirstOfMonth = d.getDate() === 1;
                    return (
                      <div
                        key={date}
                        className={`w-[80px] flex-shrink-0 text-center py-2 border-r border-neutral-100 ${
                          isToday ? "bg-brand-50" : isWeekend ? "bg-neutral-25" : ""
                        } ${isFirstOfMonth ? "border-l-2 border-l-neutral-300" : ""}`}
                      >
                        {isFirstOfMonth && (
                          <div className="text-[9px] text-brand-500 font-semibold uppercase tracking-wider mb-0.5">
                            {d.toLocaleDateString("en-US", { month: "short" })}
                          </div>
                        )}
                        <div
                          className={`text-[10px] uppercase ${isToday ? "text-brand-500 font-semibold" : "text-neutral-400"}`}
                        >
                          {d.toLocaleDateString("en-US", { weekday: "short" })}
                        </div>
                        <div
                          className={`text-sm ${isToday ? "font-bold text-brand-500" : "font-semibold text-neutral-800"}`}
                        >
                          {d.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Property rows */}
            {filteredProperties.map((prop) => (
              <div key={prop.id} className="flex">
                <div className="w-[140px] md:w-52 min-w-[140px] md:min-w-[208px] flex-shrink-0 bg-white border-r border-gray-100 px-3 md:px-4 flex items-center gap-2.5 sticky left-0 z-20 border-b border-neutral-100">
                  <PropertyAvatar name={prop.name} photoUrl={prop.cover_photo_url} size={40} />
                  <span className="text-sm font-medium text-neutral-700 truncate">
                    {prop.name}
                  </span>
                </div>

                <div className="flex-1 overflow-hidden">
                  <div
                    style={{
                      transform: `translateX(-${scrollLeft}px)`,
                      width: `${allDates.length * 80}px`,
                    }}
                  >
                    <PropertyRow
                      property={prop}
                      dates={allDates}
                      bookings={bookingLookup.get(prop.id) ?? []}
                      rates={rateLookup.get(prop.id) ?? new Map()}
                      todayStr={todayStr}
                      visibleStart={visibleColStart}
                      visibleEnd={visibleColEnd}
                      selectedDates={dragPropertyId === prop.id ? selectedDates : new Set()}
                      onBookingClick={setSelectedBooking}
                      onDateClick={handleDateClick}
                      onDragStart={handleDragStart}
                      onDragEnter={handleDragEnter}
                      events={eventLookup.get(prop.id) ?? new Map()}
                      gaps={gapLookup.get(prop.id) ?? new Set()}
                    />
                  </div>
                </div>
              </div>
            ))}

            {filteredProperties.length === 0 && (
              <div className="p-12 text-center text-neutral-400 text-sm">
                No properties to display.
              </div>
            )}
          </div>
        )}

        {/* ============ MONTHLY VIEW ============ */}
        {viewMode === "monthly" && (
          <div className="h-full flex flex-col md:flex-row bg-white overflow-hidden">
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
          </div>
        )}
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
        onResolved={() => { /* parent refreshes on navigation — bookings already reloaded from server on next mount */ }}
      />

      {/* Date edit popover */}
      {popover && (
        <DateEditPopover
          dates={popover.dates}
          initialRate={popover.rate}
          position={popover.position}
          onSave={handleSaveRate}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}
