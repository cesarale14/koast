"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import type { BookingBarData } from "./BookingBar";
import type { RateData } from "./DateCell";

const TOTAL_MONTHS = 24;

const platformColors: Record<string, string> = {
  airbnb: "#FF5A5F",
  vrbo: "#3B5998",
  booking_com: "#003580",
  booking: "#003580",
  direct: "#10B981",
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_ABBRS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface DayInfo {
  date: string;
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
}

interface BookingSegment {
  booking: BookingBarData;
  startCol: number;
  endCol: number;
  isStart: boolean;
  isEnd: boolean;
  row: number;
}

interface MonthData {
  year: number;
  month: number;
  label: string;
  abbr: string;
  key: string;
  weeks: DayInfo[][];
}

interface MonthlyViewProps {
  propertyId: string;
  bookings: BookingBarData[];
  rates: Map<string, RateData>;
  todayStr: string;
  todayTrigger: number;
  onBookingClick: (booking: BookingBarData) => void;
  onDateClick: (propertyId: string, date: string, rate: RateData | null) => void;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function getMonthWeeks(year: number, month: number, todayStr: string): DayInfo[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  let dow = first.getDay() - 1;
  if (dow < 0) dow = 6;

  const weeks: DayInfo[][] = [];
  let week: DayInfo[] = [];

  const prevLast = new Date(year, month, 0);
  for (let i = dow - 1; i >= 0; i--) {
    const d = prevLast.getDate() - i;
    const date = toDateStr(prevLast.getFullYear(), prevLast.getMonth(), d);
    week.push({ date, dayNum: d, isCurrentMonth: false, isToday: date === todayStr, isWeekend: week.length >= 5 });
  }

  for (let d = 1; d <= last.getDate(); d++) {
    if (week.length === 7) { weeks.push(week); week = []; }
    const date = toDateStr(year, month, d);
    week.push({ date, dayNum: d, isCurrentMonth: true, isToday: date === todayStr, isWeekend: week.length >= 5 });
  }

  let nd = 1;
  const nm = month === 11 ? 0 : month + 1;
  const ny = month === 11 ? year + 1 : year;
  while (week.length < 7) {
    const date = toDateStr(ny, nm, nd);
    week.push({ date, dayNum: nd, isCurrentMonth: false, isToday: date === todayStr, isWeekend: week.length >= 5 });
    nd++;
  }
  weeks.push(week);

  return weeks;
}

function getBookingSegments(bookings: BookingBarData[], weeks: DayInfo[][]): BookingSegment[] {
  const dateToPos = new Map<string, { row: number; col: number }>();
  weeks.forEach((w, row) => w.forEach((d, col) => dateToPos.set(d.date, { row, col })));

  const gridStart = weeks[0][0].date;
  const gridEnd = weeks[weeks.length - 1][6].date;
  const segments: BookingSegment[] = [];

  for (const booking of bookings) {
    const bStart = booking.check_in < gridStart ? gridStart : booking.check_in;
    const bEnd = booking.check_out > gridEnd ? gridEnd : booking.check_out;

    const startPos = dateToPos.get(bStart);
    const endPos = dateToPos.get(bEnd);
    if (!startPos || !endPos) continue;

    const isActualStart = bStart === booking.check_in;
    const isActualEnd = bEnd === booking.check_out;

    for (let row = startPos.row; row <= endPos.row; row++) {
      segments.push({
        booking,
        startCol: row === startPos.row ? startPos.col : 0,
        endCol: row === endPos.row ? endPos.col : 6,
        isStart: row === startPos.row && isActualStart,
        isEnd: row === endPos.row && isActualEnd,
        row,
      });
    }
  }
  return segments;
}

export default function MonthlyView({
  propertyId,
  bookings,
  rates,
  todayStr,
  todayTrigger,
  onBookingClick,
  onDateClick,
}: MonthlyViewProps) {
  const thisYear = new Date().getFullYear();
  const thisMonth = new Date().getMonth();

  // Generate 24 months of data
  const months = useMemo(() => {
    const result: MonthData[] = [];
    for (let i = 0; i < TOTAL_MONTHS; i++) {
      const m = (thisMonth + i) % 12;
      const y = thisYear + Math.floor((thisMonth + i) / 12);
      result.push({
        year: y,
        month: m,
        label: `${MONTH_NAMES[m]} ${y}`,
        abbr: y !== thisYear ? `${MONTH_ABBRS[m]} '${String(y).slice(2)}` : MONTH_ABBRS[m],
        key: `${y}-${pad2(m + 1)}`,
        weeks: getMonthWeeks(y, m, todayStr),
      });
    }
    return result;
  }, [todayStr, thisYear, thisMonth]);

  // Pre-compute booking segments per month
  const segmentsByMonth = useMemo(() => {
    const map = new Map<string, BookingSegment[]>();
    for (const m of months) {
      map.set(m.key, getBookingSegments(bookings, m.weeks));
    }
    return map;
  }, [months, bookings]);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activeMonth, setActiveMonth] = useState(months[0]?.key ?? "");

  const isDateBooked = useCallback(
    (date: string) => bookings.some((b) => date >= b.check_in && date < b.check_out),
    [bookings],
  );

  // Scroll to a specific month
  const scrollToMonth = useCallback((key: string) => {
    const el = monthRefs.current.get(key);
    if (el && containerRef.current) {
      containerRef.current.scrollTop = el.offsetTop - 38;
    }
  }, []);

  // Scroll to today's month
  const scrollToToday = useCallback(() => {
    const todayMonth = months.find((m) =>
      m.weeks.some((w) => w.some((d) => d.isToday)),
    );
    if (todayMonth) {
      scrollToMonth(todayMonth.key);
      setActiveMonth(todayMonth.key);
    }
  }, [months, scrollToMonth]);

  // Auto-scroll to today on mount
  useEffect(() => {
    // Small delay so refs are populated
    const t = setTimeout(scrollToToday, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to today when trigger changes
  useEffect(() => {
    if (todayTrigger > 0) scrollToToday();
  }, [todayTrigger, scrollToToday]);

  // Track visible month with IntersectionObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const key = entry.target.getAttribute("data-month");
            if (key) setActiveMonth(key);
          }
        }
      },
      { root: container, rootMargin: "-40px 0px -70% 0px", threshold: 0 },
    );

    monthRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [months]);

  return (
    <div className="bg-neutral-0 rounded-lg border border-[var(--border)] overflow-hidden flex flex-col" style={{ maxHeight: "calc(100vh - 190px)" }}>
      {/* Quick scroll month pills */}
      <div className="flex gap-1 px-3 py-2 border-b border-neutral-100 overflow-x-auto flex-shrink-0">
        {months.map((m) => (
          <button
            key={m.key}
            onClick={() => {
              scrollToMonth(m.key);
              setActiveMonth(m.key);
            }}
            className={`px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors flex-shrink-0 ${
              activeMonth === m.key
                ? "bg-brand-500 text-white"
                : "text-neutral-500 hover:bg-neutral-100"
            }`}
          >
            {m.abbr}
          </button>
        ))}
      </div>

      {/* Scrollable calendar container */}
      <div ref={containerRef} className="overflow-y-auto flex-1">
        {/* Sticky day-of-week header */}
        <div className="sticky top-0 z-10 bg-neutral-0 grid grid-cols-7 border-b border-[var(--border)]">
          {DAY_LABELS.map((label, i) => (
            <div
              key={label}
              className={`py-2.5 text-center text-xs font-medium uppercase tracking-wider ${
                i >= 5 ? "text-neutral-400 bg-neutral-25" : "text-neutral-500"
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Month sections */}
        {months.map((m) => {
          const segments = segmentsByMonth.get(m.key) ?? [];

          return (
            <div
              key={m.key}
              ref={(el) => {
                if (el) monthRefs.current.set(m.key, el);
              }}
              data-month={m.key}
            >
              {/* Sticky month header */}
              <div className="sticky top-[37px] z-[9] bg-neutral-0 border-b border-neutral-100 px-4 py-3">
                <span className="text-lg font-bold text-neutral-800">
                  {m.label}
                </span>
              </div>

              {/* Week rows */}
              {m.weeks.map((week, weekIdx) => {
                const rowSegs = segments.filter((s) => s.row === weekIdx);

                return (
                  <div
                    key={weekIdx}
                    className="relative grid grid-cols-7 border-b border-neutral-100 last:border-b-0"
                  >
                    {/* Day cells */}
                    {week.map((day) => {
                      const rate = rates.get(day.date);
                      const isAvailable = rate?.is_available !== false;
                      const displayRate = rate?.applied_rate ?? rate?.base_rate ?? null;
                      const booked = isDateBooked(day.date);
                      const isBlocked = !isAvailable && !booked;

                      return (
                        <div
                          key={day.date}
                          className={`min-h-[88px] border-r border-neutral-100 last:border-r-0 p-1.5 cursor-pointer transition-colors ${
                            !day.isCurrentMonth
                              ? "bg-neutral-50/60 text-neutral-300"
                              : isBlocked
                                ? "bg-neutral-100"
                                : day.isWeekend
                                  ? "bg-neutral-25"
                                  : "bg-neutral-0 hover:bg-neutral-50/60"
                          }`}
                          onClick={() => {
                            if (!booked) onDateClick(propertyId, day.date, rate ?? null);
                          }}
                          style={
                            isBlocked
                              ? { backgroundImage: "repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(0,0,0,0.03) 3px, rgba(0,0,0,0.04) 4px)" }
                              : undefined
                          }
                        >
                          <div className="flex items-start justify-between">
                            <span
                              className={`text-sm w-6 h-6 flex items-center justify-center rounded-full ${
                                day.isToday
                                  ? "ring-2 ring-brand-500 text-brand-600 font-bold"
                                  : day.isCurrentMonth
                                    ? "font-semibold text-neutral-800"
                                    : "font-medium text-neutral-300"
                              }`}
                            >
                              {day.dayNum}
                            </span>
                            {displayRate !== null && day.isCurrentMonth && (
                              <span className={`text-xs font-mono ${isAvailable ? "text-neutral-400" : "text-neutral-300 line-through"}`}>
                                ${displayRate}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Booking bar segments */}
                    {rowSegs.map((seg, segIdx) => {
                      const cellPct = 100 / 7;
                      let left = seg.startCol * cellPct;
                      let width = (seg.endCol - seg.startCol + 1) * cellPct;
                      if (seg.isStart) { left += cellPct / 2; width -= cellPct / 2; }
                      if (seg.isEnd) { width -= cellPct / 2; }
                      if (width <= 0) return null;

                      const color = platformColors[seg.booking.platform] ?? "#6B7280";
                      const firstName = seg.booking.guest_name?.split(" ")[0] ?? "Guest";
                      const nights = (() => {
                        const ci = Date.UTC(+seg.booking.check_in.slice(0, 4), +seg.booking.check_in.slice(5, 7) - 1, +seg.booking.check_in.slice(8, 10));
                        const co = Date.UTC(+seg.booking.check_out.slice(0, 4), +seg.booking.check_out.slice(5, 7) - 1, +seg.booking.check_out.slice(8, 10));
                        return Math.round((co - ci) / 86400000);
                      })();

                      return (
                        <div
                          key={`${seg.booking.id}-${seg.row}-${segIdx}`}
                          className="absolute flex items-center gap-1 px-2 text-white text-xs font-medium overflow-hidden whitespace-nowrap cursor-pointer hover:brightness-110 hover:shadow-md transition-all z-[5]"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            top: "36px",
                            height: "28px",
                            backgroundColor: color,
                            borderRadius: `${seg.isStart ? "6px" : "0"} ${seg.isEnd ? "6px" : "0"} ${seg.isEnd ? "6px" : "0"} ${seg.isStart ? "6px" : "0"}`,
                          }}
                          onClick={(e) => { e.stopPropagation(); onBookingClick(seg.booking); }}
                          title={`${seg.booking.guest_name} · ${nights} night${nights !== 1 ? "s" : ""} · ${seg.booking.platform}`}
                        >
                          <span className="truncate">{firstName}</span>
                          {seg.isStart && width > 10 && (
                            <span className="text-white/70 text-[10px] flex-shrink-0">{nights}n</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
