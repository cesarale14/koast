"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import CalendarToolbar from "./CalendarToolbar";
import PropertyRow from "./PropertyRow";
import MonthlyView from "./MonthlyView";
import BookingSidePanel from "./BookingSidePanel";
import DateEditPopover from "./DateEditPopover";
import type { BookingBarData } from "./BookingBar";
import type { RateData } from "./DateCell";
import { createClient } from "@/lib/supabase/client";

interface CalendarProperty {
  id: string;
  name: string;
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

// Simple hash for property avatar color
function propColor(name: string): string {
  const colors = [
    "bg-brand-100 text-brand-700",
    "bg-blue-100 text-blue-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-violet-100 text-violet-700",
    "bg-cyan-100 text-cyan-700",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

export default function CalendarGrid({
  properties,
  bookings,
  rates: initialRates,
  totalDays,
}: CalendarGridProps) {
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

      setPopover(null);
    },
    [popover],
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

  return (
    <div className="relative">
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

      {/* ============ TIMELINE VIEW ============ */}
      {viewMode === "timeline" && (
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] overflow-hidden">
          {/* Header: date labels */}
          <div className="flex border-b border-[var(--border)]">
            <div className="w-[140px] md:w-52 min-w-[140px] md:min-w-[208px] flex-shrink-0 bg-neutral-50 border-r border-[var(--border)] px-4 py-2 sticky left-0 z-20">
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
              {/* Sticky property name with avatar */}
              <div className="w-[140px] md:w-52 min-w-[140px] md:min-w-[208px] flex-shrink-0 bg-neutral-0 border-r border-[var(--border)] px-3 md:px-4 flex items-center gap-2.5 sticky left-0 z-20 border-b border-neutral-100">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${propColor(prop.name)}`}
                >
                  {prop.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-neutral-700 truncate">
                  {prop.name}
                </span>
              </div>

              {/* Scrollable row content */}
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
        <MonthlyView
          propertyId={monthlyPropertyId}
          bookings={bookingLookup.get(monthlyPropertyId) ?? []}
          rates={rateLookup.get(monthlyPropertyId) ?? new Map()}
          todayStr={todayStr}
          todayTrigger={monthlyTodayTrigger}
          onBookingClick={setSelectedBooking}
          onDateClick={handleDateClick}
        />
      )}

      {/* Booking side panel */}
      <BookingSidePanel
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
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
