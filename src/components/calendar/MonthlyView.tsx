"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import type { BookingBarData } from "./BookingBar";
import type { RateData } from "./DateCell";

const TOTAL_MONTHS = 24;

const platformColors: Record<string, string> = {
  airbnb: "#222222",
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
}

interface BookingSegment {
  booking: BookingBarData;
  startCol: number;
  endCol: number;
  isStart: boolean;
  isEnd: boolean;
  row: number;
  nights: number;
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

function getNights(checkIn: string, checkOut: string): number {
  const ci = Date.UTC(+checkIn.slice(0, 4), +checkIn.slice(5, 7) - 1, +checkIn.slice(8, 10));
  const co = Date.UTC(+checkOut.slice(0, 4), +checkOut.slice(5, 7) - 1, +checkOut.slice(8, 10));
  return Math.round((co - ci) / 86400000);
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
    week.push({ date, dayNum: d, isCurrentMonth: false, isToday: date === todayStr });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    if (week.length === 7) { weeks.push(week); week = []; }
    const date = toDateStr(year, month, d);
    week.push({ date, dayNum: d, isCurrentMonth: true, isToday: date === todayStr });
  }
  let nd = 1;
  const nm = month === 11 ? 0 : month + 1;
  const ny = month === 11 ? year + 1 : year;
  while (week.length < 7) {
    const date = toDateStr(ny, nm, nd);
    week.push({ date, dayNum: nd, isCurrentMonth: false, isToday: date === todayStr });
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
    const nights = getNights(booking.check_in, booking.check_out);

    for (let row = startPos.row; row <= endPos.row; row++) {
      segments.push({
        booking,
        startCol: row === startPos.row ? startPos.col : 0,
        endCol: row === endPos.row ? endPos.col : 6,
        isStart: row === startPos.row && isActualStart,
        isEnd: row === endPos.row && isActualEnd,
        row,
        nights,
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

  const months = useMemo(() => {
    const result: MonthData[] = [];
    for (let i = 0; i < TOTAL_MONTHS; i++) {
      const m = (thisMonth + i) % 12;
      const y = thisYear + Math.floor((thisMonth + i) / 12);
      result.push({
        year: y, month: m,
        label: `${MONTH_NAMES[m]} ${y}`,
        abbr: y !== thisYear ? `${MONTH_ABBRS[m]} '${String(y).slice(2)}` : MONTH_ABBRS[m],
        key: `${y}-${pad2(m + 1)}`,
        weeks: getMonthWeeks(y, m, todayStr),
      });
    }
    return result;
  }, [todayStr, thisYear, thisMonth]);

  const segmentsByMonth = useMemo(() => {
    const map = new Map<string, BookingSegment[]>();
    for (const m of months) map.set(m.key, getBookingSegments(bookings, m.weeks));
    return map;
  }, [months, bookings]);

  // Build set of booked dates for rate hiding
  const bookedDates = useMemo(() => {
    const set = new Set<string>();
    for (const b of bookings) {
      // Mark check_in through check_out - 1 as booked
      const ci = new Date(b.check_in + "T00:00:00");
      const co = new Date(b.check_out + "T00:00:00");
      const d = new Date(ci);
      while (d < co) {
        set.add(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }
    }
    return set;
  }, [bookings]);

  const containerRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activeMonth, setActiveMonth] = useState(months[0]?.key ?? "");

  const scrollToMonth = useCallback((key: string) => {
    const el = monthRefs.current.get(key);
    if (el && containerRef.current) {
      containerRef.current.scrollTop = el.offsetTop - 38;
    }
  }, []);

  const scrollToToday = useCallback(() => {
    const todayMonth = months.find((m) => m.weeks.some((w) => w.some((d) => d.isToday)));
    if (todayMonth) { scrollToMonth(todayMonth.key); setActiveMonth(todayMonth.key); }
  }, [months, scrollToMonth]);

  useEffect(() => {
    const t = setTimeout(scrollToToday, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (todayTrigger > 0) scrollToToday();
  }, [todayTrigger, scrollToToday]);

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
    <div className="bg-neutral-0 rounded-xl border border-neutral-100 overflow-hidden flex flex-col" style={{ maxHeight: "calc(100vh - 190px)" }}>
      {/* Quick scroll month pills */}
      <div className="flex gap-1.5 px-4 py-3 border-b border-neutral-100 overflow-x-auto flex-shrink-0">
        {months.map((m) => (
          <button
            key={m.key}
            onClick={() => { scrollToMonth(m.key); setActiveMonth(m.key); }}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors flex-shrink-0 ${
              activeMonth === m.key
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            {m.abbr}
          </button>
        ))}
      </div>

      {/* Scrollable calendar */}
      <div ref={containerRef} className="overflow-y-auto flex-1">
        {/* Sticky day-of-week header */}
        <div className="sticky top-0 z-10 bg-neutral-0 grid grid-cols-7 border-b border-neutral-100">
          {DAY_LABELS.map((label) => (
            <div key={label} className="py-2.5 text-center text-xs font-medium uppercase tracking-wider text-neutral-400">
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
              ref={(el) => { if (el) monthRefs.current.set(m.key, el); }}
              data-month={m.key}
            >
              {/* Sticky month header */}
              <div className="sticky top-[37px] z-[9] bg-neutral-0 border-b border-neutral-100 px-4 pt-8 pb-3">
                <span className="text-xl font-bold text-neutral-800">{m.label}</span>
              </div>

              {/* Week rows */}
              {m.weeks.map((week, weekIdx) => {
                const rowSegs = segments.filter((s) => s.row === weekIdx);

                return (
                  <div key={weekIdx} className="relative grid grid-cols-7" style={{ overflow: "visible" }}>
                    {/* Day cells */}
                    {week.map((day) => {
                      const rate = rates.get(day.date);
                      const isAvailable = rate?.is_available !== false;
                      const displayRate = rate?.suggested_rate ?? rate?.applied_rate ?? rate?.base_rate ?? null;
                      const isEngineRate = rate?.suggested_rate != null && rate.rate_source !== "manual";
                      const isBooked = bookedDates.has(day.date);
                      const isBlocked = !isAvailable && !isBooked;

                      return (
                        <div
                          key={day.date}
                          className={`min-h-[90px] p-2 cursor-pointer transition-colors ${
                            !day.isCurrentMonth
                              ? "bg-neutral-50/40"
                              : isBlocked
                                ? "bg-neutral-50"
                                : "bg-neutral-0 hover:bg-neutral-50/50"
                          }`}
                          style={{
                            boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.07)",
                            borderRadius: "8px",
                            ...(isBlocked
                              ? { backgroundImage: "repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(0,0,0,0.02) 4px, rgba(0,0,0,0.02) 5px)" }
                              : {}),
                          }}
                          onClick={() => {
                            if (!isBooked) onDateClick(propertyId, day.date, rate ?? null);
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <span
                              className={`text-sm leading-none ${
                                day.isToday
                                  ? "w-6 h-6 flex items-center justify-center rounded-full ring-2 ring-brand-500 text-brand-600 font-bold"
                                  : day.isCurrentMonth
                                    ? "font-semibold text-neutral-700"
                                    : "font-medium text-neutral-300"
                              }`}
                            >
                              {day.dayNum}
                            </span>
                            {/* Only show rate on available, non-booked dates */}
                            {!isBooked && displayRate !== null && day.isCurrentMonth && (
                              <span className={`text-[13px] font-mono leading-none ${isAvailable ? "text-neutral-400" : "text-neutral-300 line-through"}`}>
                                ${displayRate}
                                {isEngineRate && <span className="text-[9px] ml-0.5">&#8599;</span>}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Booking bars — pill-shaped, bottom-aligned, overlapping */}
                    {rowSegs.map((seg, segIdx) => {
                      const cellPct = 100 / 7;
                      let left = seg.startCol * cellPct;
                      let width = (seg.endCol - seg.startCol + 1) * cellPct;

                      // Airbnb overlap: outgoing ends at 55%, incoming starts at 45%
                      // Creates a 10% overlap zone where incoming bar is on top
                      if (seg.isStart) {
                        left += cellPct * 0.45;
                        width -= cellPct * 0.45;
                      }
                      if (seg.isEnd) {
                        width -= cellPct * 0.45;
                      }
                      if (width <= 0.5) return null;

                      const color = platformColors[seg.booking.platform] ?? "#6B7280";
                      const firstName = seg.booking.guest_name?.split(" ")[0] ?? "Guest";
                      const initial = firstName.charAt(0).toUpperCase();
                      // Show text if bar spans 3+ cells, or 2 cells without start/end offsets
                      const spanCells = seg.endCol - seg.startCol + 1;
                      const effectiveSpan = spanCells - (seg.isStart ? 0.45 : 0) - (seg.isEnd ? 0.45 : 0);
                      const showText = effectiveSpan >= 2;

                      // Incoming bars (isStart) render on top of outgoing (isEnd) in the overlap
                      const zIdx = seg.isStart ? 6 : 5;

                      return (
                        <div
                          key={`${seg.booking.id}-${seg.row}-${segIdx}`}
                          className="absolute flex items-center text-white text-xs font-medium overflow-hidden whitespace-nowrap cursor-pointer hover:brightness-125 transition-all"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            bottom: "6px",
                            height: "28px",
                            backgroundColor: color,
                            borderRadius: `${seg.isStart ? "14px" : "0"} ${seg.isEnd ? "14px" : "0"} ${seg.isEnd ? "14px" : "0"} ${seg.isStart ? "14px" : "0"}`,
                            zIndex: zIdx,
                          }}
                          onClick={(e) => { e.stopPropagation(); onBookingClick(seg.booking); }}
                          title={`${seg.booking.guest_name} · ${seg.nights} night${seg.nights !== 1 ? "s" : ""} · ${seg.booking.platform}`}
                        >
                          {/* Guest avatar */}
                          {seg.isStart && (
                            <div
                              className="flex-shrink-0 rounded-full bg-neutral-600 flex items-center justify-center text-[11px] font-bold text-white"
                              style={{ width: "26px", height: "26px", marginLeft: "-1px" }}
                            >
                              {initial}
                            </div>
                          )}
                          {showText && (
                            <span className="truncate ml-1.5 mr-1">
                              {firstName} + {seg.nights}
                            </span>
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
