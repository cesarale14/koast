"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import CalendarToolbar from "./CalendarToolbar";
import PropertyRow from "./PropertyRow";
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

export default function CalendarGrid({
  properties,
  bookings,
  rates: initialRates,
  totalDays,
}: CalendarGridProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = getToday();

  const [offsetWeeks, setOffsetWeeks] = useState(0);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingBarData | null>(null);
  const [popover, setPopover] = useState<{
    propertyId: string;
    dates: string[];
    rate: RateData | null;
    position: { top: number; left: number };
  } | null>(null);

  // Drag selection state
  const [dragPropertyId, setDragPropertyId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const isDragging = useRef(false);

  // Rates state (mutable for inline edits)
  const [ratesState, setRatesState] = useState(initialRates);

  // Build rate lookup: property_id -> date -> RateData
  const rateLookup = useMemo(() => {
    const map = new Map<string, Map<string, RateData>>();
    for (const r of ratesState) {
      if (!map.has(r.property_id)) {
        map.set(r.property_id, new Map());
      }
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

  // Build booking lookup: property_id -> BookingBarData[]
  const bookingLookup = useMemo(() => {
    const map = new Map<string, BookingBarData[]>();
    for (const b of bookings) {
      if (!map.has(b.property_id)) {
        map.set(b.property_id, []);
      }
      map.get(b.property_id)!.push(b);
    }
    return map;
  }, [bookings]);

  // Generate all dates
  const allDates = generateDates(today, totalDays);

  // Visible window based on scroll offset
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() + offsetWeeks * 7);
  const visibleDayCount = 30;
  const startIdx = Math.max(0, offsetWeeks * 7);

  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + startIdx + visibleDayCount - 1);

  // Scrollable container ref
  const scrollRef = useRef<HTMLDivElement>(null);

  // Virtual scroll tracking
  const [scrollLeft, setScrollLeft] = useState(0);
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollLeft(scrollRef.current.scrollLeft);
    }
  }, []);

  const visibleColStart = Math.floor(scrollLeft / 80);
  const visibleColEnd = Math.min(
    allDates.length,
    visibleColStart + Math.ceil((scrollRef.current?.clientWidth ?? 1200) / 80) + 2
  );

  // Filter properties
  const filteredProperties = selectedPropertyId
    ? properties.filter((p) => p.id === selectedPropertyId)
    : properties;

  // Drag selection helpers
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
      // Don't start drag on booked dates
      const propBookings = bookingLookup.get(propertyId) ?? [];
      const isBooked = propBookings.some(
        (b) => date >= b.check_in && date < b.check_out
      );
      if (isBooked) return;
      isDragging.current = true;
      setDragPropertyId(propertyId);
      setDragStart(date);
      setDragEnd(date);
    },
    [bookingLookup]
  );

  const handleDragEnter = useCallback(
    (_propertyId: string, date: string) => {
      if (isDragging.current) {
        setDragEnd(date);
      }
    },
    []
  );

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

  // Handlers
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
    []
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

      // Upsert each date
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
          { onConflict: "property_id,date" }
        );
      }

      // Update local state
      setRatesState((prev) => {
        const next = [...prev];
        for (const date of updates.dates) {
          const idx = next.findIndex(
            (r) => r.property_id === popover.propertyId && r.date === date
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
    [popover]
  );

  const selectedDates = getSelectedDates();

  return (
    <div className="relative">
      <CalendarToolbar
        startDate={new Date(today.getTime() + offsetWeeks * 7 * 86400000)}
        endDate={endDate}
        properties={properties}
        selectedPropertyId={selectedPropertyId}
        onToday={() => {
          setOffsetWeeks(0);
          if (scrollRef.current) scrollRef.current.scrollLeft = 0;
        }}
        onPrev={() => setOffsetWeeks((w) => Math.max(0, w - 1))}
        onNext={() => setOffsetWeeks((w) => Math.min(Math.floor(totalDays / 7) - 4, w + 1))}
        onPropertyFilter={setSelectedPropertyId}
      />

      <div className="bg-neutral-0 rounded-lg border border-[var(--border)] overflow-hidden">
        {/* Header: date labels */}
        <div className="flex border-b border-[var(--border)]">
          {/* Sticky property name column header */}
          <div className="w-[120px] md:w-44 min-w-[120px] md:min-w-[176px] flex-shrink-0 bg-neutral-50 border-r border-[var(--border)] px-4 py-2 sticky left-0 z-20">
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              Property
            </span>
          </div>

          {/* Scrollable date headers */}
          <div
            className="flex-1 overflow-x-auto"
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
                      isToday ? "bg-brand-50" : isWeekend ? "bg-neutral-50/50" : ""
                    } ${isFirstOfMonth ? "border-l-2 border-l-neutral-300" : ""}`}
                  >
                    <div className={`text-[10px] uppercase ${isToday ? "text-brand-500 font-semibold" : "text-neutral-400"}`}>
                      {d.toLocaleDateString("en-US", { weekday: "short" })}
                    </div>
                    <div className={`text-sm font-medium ${isToday ? "text-brand-500" : "text-neutral-700"}`}>
                      {d.getDate()}
                    </div>
                    {isFirstOfMonth && (
                      <div className="text-[9px] text-neutral-400 font-medium">
                        {d.toLocaleDateString("en-US", { month: "short" })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Property rows */}
        {filteredProperties.map((prop) => (
          <div key={prop.id} className="flex">
            {/* Sticky property name */}
            <div className="w-[120px] md:w-44 min-w-[120px] md:min-w-[176px] flex-shrink-0 bg-neutral-0 border-r border-[var(--border)] px-4 flex items-center sticky left-0 z-20 border-b border-neutral-100">
              <span className="text-sm font-medium text-neutral-700 truncate">
                {prop.name}
              </span>
            </div>

            {/* Scrollable row content — synced with header scroll */}
            <div
              className="flex-1 overflow-hidden"
            >
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
                  selectedDates={
                    dragPropertyId === prop.id ? selectedDates : new Set()
                  }
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
