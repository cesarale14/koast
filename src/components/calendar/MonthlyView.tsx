"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import type { BookingBarData } from "./BookingBar";
import type { RateData } from "./DateCell";

const TOTAL_MONTHS = 24;
const GAP = 3;

const platformColors: Record<string, string> = {
  airbnb: "#333333",
  vrbo: "#3B5998",
  booking_com: "#003580",
  booking: "#003580",
  direct: "#10B981",
};

const platformLogos: Record<string, string> = {
  airbnb: "/logos/airbnb.svg",
  vrbo: "/logos/vrbo.svg",
  booking_com: "/logos/booking.svg",
  booking: "/logos/booking.svg",
  direct: "/logos/direct.svg",
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LABELS_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_ABBRS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface DayInfo { date: string; dayNum: number; isCurrentMonth: boolean; isToday: boolean; isPast: boolean; }
interface BookingSegment { booking: BookingBarData; startCol: number; endCol: number; isStart: boolean; isEnd: boolean; row: number; nights: number; isPast: boolean; }
interface MonthData { year: number; month: number; label: string; abbr: string; key: string; weeks: DayInfo[][]; }

export interface MonthlyViewProps {
  propertyId: string;
  bookings: BookingBarData[];
  rates: Map<string, RateData>;
  todayStr: string;
  todayTrigger: number;
  onBookingClick: (booking: BookingBarData) => void;
  onDateClick: (propertyId: string, date: string, rate: RateData | null) => void;
}

function pad2(n: number): string { return String(n).padStart(2, "0"); }
function toDateStr(y: number, m: number, d: number): string { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }
function getNights(ci: string, co: string): number {
  return Math.round((Date.UTC(+co.slice(0, 4), +co.slice(5, 7) - 1, +co.slice(8, 10)) -
    Date.UTC(+ci.slice(0, 4), +ci.slice(5, 7) - 1, +ci.slice(8, 10))) / 86400000);
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
    week.push({ date, dayNum: d, isCurrentMonth: false, isToday: false, isPast: date < todayStr });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    if (week.length === 7) { weeks.push(week); week = []; }
    const date = toDateStr(year, month, d);
    week.push({ date, dayNum: d, isCurrentMonth: true, isToday: date === todayStr, isPast: date < todayStr });
  }
  let nd = 1;
  const nm = month === 11 ? 0 : month + 1;
  const ny = month === 11 ? year + 1 : year;
  while (week.length < 7) {
    const date = toDateStr(ny, nm, nd);
    week.push({ date, dayNum: nd, isCurrentMonth: false, isToday: date === todayStr, isPast: date < todayStr });
    nd++;
  }
  weeks.push(week);
  return weeks;
}

function getBookingSegments(bookings: BookingBarData[], weeks: DayInfo[][], todayStr: string): BookingSegment[] {
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
    const isPast = booking.check_out <= todayStr;
    for (let row = startPos.row; row <= endPos.row; row++) {
      segments.push({
        booking,
        startCol: row === startPos.row ? startPos.col : 0,
        endCol: row === endPos.row ? endPos.col : 6,
        isStart: row === startPos.row && isActualStart,
        isEnd: row === endPos.row && isActualEnd,
        row, nights, isPast,
      });
    }
  }
  return segments;
}

const rowVars = {
  "--col": `calc((100% + ${GAP}px) / 7)`,
  "--cell": `calc((100% + ${GAP}px) / 7 - ${GAP}px)`,
} as React.CSSProperties;

export default function MonthlyView({
  propertyId, bookings, rates, todayStr, todayTrigger, onBookingClick, onDateClick,
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
    for (const m of months) map.set(m.key, getBookingSegments(bookings, m.weeks, todayStr));
    return map;
  }, [months, bookings, todayStr]);

  const bookedDates = useMemo(() => {
    const set = new Set<string>();
    for (const b of bookings) {
      const d = new Date(b.check_in + "T00:00:00");
      const co = new Date(b.check_out + "T00:00:00");
      while (d < co) { set.add(d.toISOString().split("T")[0]); d.setDate(d.getDate() + 1); }
    }
    return set;
  }, [bookings]);

  const containerRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activeMonth, setActiveMonth] = useState(months[0]?.key ?? "");

  const scrollToMonth = useCallback((key: string) => {
    const el = monthRefs.current.get(key);
    if (el && containerRef.current) containerRef.current.scrollTop = el.offsetTop - 28;
  }, []);

  const scrollToToday = useCallback(() => {
    const m = months.find((m) => m.weeks.some((w) => w.some((d) => d.isToday)));
    if (m) { scrollToMonth(m.key); setActiveMonth(m.key); }
  }, [months, scrollToMonth]);

  useEffect(() => { const t = setTimeout(scrollToToday, 80); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (todayTrigger > 0) scrollToToday(); }, [todayTrigger, scrollToToday]);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const obs = new IntersectionObserver(
      (entries) => { for (const e of entries) if (e.isIntersecting) { const k = e.target.getAttribute("data-month"); if (k) setActiveMonth(k); } },
      { root: c, rootMargin: "-28px 0px -70% 0px", threshold: 0 },
    );
    monthRefs.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [months]);

  return (
    <div className="bg-white flex flex-col flex-1 min-h-0">
      {/* Month pills — desktop only */}
      <div className="hidden md:flex gap-1.5 px-3 py-2 border-b border-[#e8e8e8] overflow-x-auto flex-shrink-0">
        {months.map((m) => (
          <button
            key={m.key}
            onClick={() => { scrollToMonth(m.key); setActiveMonth(m.key); }}
            className={`px-2 py-0.5 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors flex-shrink-0 ${
              activeMonth === m.key ? "bg-[#222] text-white" : "text-[#999] hover:text-[#555] hover:bg-[#f5f5f5]"
            }`}
          >
            {m.abbr}
          </button>
        ))}
      </div>

      {/* Scrollable calendar */}
      <div ref={containerRef} className="overflow-y-auto flex-1 min-h-0 bg-white px-2 md:px-0">
        {/* Sticky day-of-week header */}
        <div className="sticky top-0 z-10 bg-white grid grid-cols-7 gap-[3px] border-b border-[#e8e8e8]">
          {DAY_LABELS.map((l, i) => (
            <div key={`${l}-${i}`} className="py-1 md:py-1.5 text-center text-[11px] font-medium uppercase tracking-widest text-[#999]">
              <span className="md:hidden">{DAY_LABELS_SHORT[i]}</span>
              <span className="hidden md:inline">{l}</span>
            </div>
          ))}
        </div>

        {/* All 24 month sections */}
        {months.map((m) => {
          const segments = segmentsByMonth.get(m.key) ?? [];
          return (
            <div key={m.key} ref={(el) => { if (el) monthRefs.current.set(m.key, el); }} data-month={m.key}>
              <div className="sticky top-[27px] md:top-[29px] z-[9] bg-white px-1 pt-6 md:pt-10 pb-1.5 md:pb-2">
                <span className="text-lg md:text-xl font-bold text-[#222]">{m.label}</span>
              </div>

              {m.weeks.map((week, weekIdx) => {
                const rowSegs = segments.filter((s) => s.row === weekIdx);
                return (
                  <div
                    key={weekIdx}
                    className="relative grid grid-cols-7"
                    style={{ gap: `${GAP}px`, marginBottom: `${GAP}px`, overflow: "visible", ...rowVars }}
                  >
                    {week.map((day) => {
                      const rate = rates.get(day.date);
                      const isAvail = rate?.is_available !== false;
                      const rawRate = rate?.suggested_rate ?? rate?.applied_rate ?? rate?.base_rate ?? null;
                      const isBooked = bookedDates.has(day.date);
                      const isBlocked = !isAvail && !isBooked;

                      return (
                        <div
                          key={day.date}
                          className={`relative aspect-square cursor-pointer transition-colors flex flex-col justify-between rounded-md md:rounded-[10px] ${
                            !day.isCurrentMonth
                              ? "bg-[#fafafa]"
                              : day.isPast
                                ? "bg-[#f9f9f7]"
                                : isBlocked
                                  ? "bg-[#f5f5f5]"
                                  : day.isToday
                                    ? "bg-white"
                                    : "bg-white hover:bg-[#fafafa]"
                          }`}
                          style={{
                            minHeight: undefined,
                            padding: undefined,
                            border: "1px solid #e8e8e8",
                            ...(isBlocked && !day.isPast ? { backgroundImage: "repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(0,0,0,0.015) 4px, rgba(0,0,0,0.015) 5px)" } : {}),
                          }}
                          onClick={() => { if (!isBooked && !day.isPast) onDateClick(propertyId, day.date, rate ?? null); }}
                        >
                          {/* Inner content with responsive padding */}
                          <div className="p-1 md:p-[6px] flex flex-col justify-between h-full">
                            <div>
                              {day.isToday ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 md:w-6 md:h-6 rounded-full bg-emerald-500 text-white text-[12px] md:text-[13px] font-semibold leading-none">
                                  {day.dayNum}
                                </span>
                              ) : (
                                <span className={`text-[12px] md:text-[13px] font-semibold leading-none ${
                                  !day.isCurrentMonth ? "text-[#ccc]"
                                    : day.isPast ? "text-[#bbb]"
                                    : "text-[#333]"
                                }`}>
                                  {day.dayNum}
                                </span>
                              )}
                            </div>
                            {/* Rate: hide on mobile booked/past, show below date on mobile */}
                            {!isBooked && !day.isPast && rawRate !== null && day.isCurrentMonth && isAvail && (
                              <span className="self-end text-[10px] md:text-[11px] font-mono text-[#999] leading-none">${rawRate}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Booking bars — 32px, platform logos */}
                    {rowSegs.map((seg, si) => {
                      const span = seg.endCol - seg.startCol + 1;
                      const startFrac = seg.isStart ? 0.3 : 0;
                      const endFrac = seg.isEnd ? 0.65 : 0;

                      const left = startFrac > 0
                        ? `calc(var(--col) * ${seg.startCol} + var(--cell) * ${startFrac})`
                        : `calc(var(--col) * ${seg.startCol})`;

                      const subs = [`${GAP}px`];
                      if (startFrac > 0) subs.push(`var(--cell) * ${startFrac}`);
                      if (endFrac > 0) subs.push(`var(--cell) * ${endFrac}`);
                      const width = `calc(var(--col) * ${span} - ${subs.join(" - ")})`;

                      const color = platformColors[seg.booking.platform] ?? "#333333";
                      const logo = platformLogos[seg.booking.platform] ?? null;
                      const firstName = seg.booking.guest_name?.split(" ")[0] ?? "Guest";
                      const effectiveSpan = span - startFrac - endFrac;
                      const showText = effectiveSpan >= 1.5;

                      const shadow = seg.isStart
                        ? "-3px 1px 3px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.1)"
                        : "0 1px 2px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)";

                      return (
                        <div
                          key={`${seg.booking.id}-${weekIdx}-${si}`}
                          className="absolute flex items-center gap-1 text-white overflow-hidden whitespace-nowrap cursor-pointer transition-all duration-150 ease-out hover:-translate-y-px h-[28px] md:h-[32px]"
                          style={{
                            left, width,
                            bottom: "3px",
                            backgroundColor: color,
                            borderRadius: `${seg.isStart ? "14px" : "0"} ${seg.isEnd ? "14px" : "0"} ${seg.isEnd ? "14px" : "0"} ${seg.isStart ? "14px" : "0"}`,
                            zIndex: seg.isStart ? 2 : 1,
                            paddingLeft: seg.isStart ? "3px" : "4px",
                            paddingRight: seg.isEnd ? "10px" : "4px",
                            opacity: seg.isPast ? 0.7 : 1,
                            border: "1px solid rgba(0,0,0,0.15)",
                            borderTop: "1px solid rgba(255,255,255,0.1)",
                            boxShadow: shadow,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.1)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = shadow; }}
                          onClick={(e) => { e.stopPropagation(); onBookingClick(seg.booking); }}
                          title={`${seg.booking.guest_name} · ${seg.nights} night${seg.nights !== 1 ? "s" : ""} · ${seg.booking.platform}`}
                        >
                          {/* Platform logo circle */}
                          {seg.isStart && logo && (
                            <div
                              className="flex-shrink-0 rounded-full bg-white flex items-center justify-center w-[22px] h-[22px] md:w-[24px] md:h-[24px]"
                              style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={logo} alt="" className="w-[14px] h-[14px] md:w-[16px] md:h-[16px]" />
                            </div>
                          )}
                          {showText && (
                            <span className="truncate text-[11px] md:text-[12px] font-medium">{firstName} +{seg.nights}</span>
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
