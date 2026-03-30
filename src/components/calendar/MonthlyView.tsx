"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import type { BookingBarData } from "./BookingBar";
import type { RateData } from "./DateCell";

const TOTAL_MONTHS = 24;
const GAP = 3;

const platformColors: Record<string, string> = {
  airbnb: "#333333", vrbo: "#3B5998", booking_com: "#003580", booking: "#003580", direct: "#10B981",
};
const platformLogos: Record<string, string> = {
  airbnb: "/logos/airbnb.svg", vrbo: "/logos/vrbo.svg", booking_com: "/logos/booking.svg", booking: "/logos/booking.svg", direct: "/logos/direct.svg",
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LABELS_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_ABBRS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface DayInfo { date: string; dayNum: number; isToday: boolean; isPast: boolean; gridCol: number; gridRow: number; }

interface BarSegment {
  booking: BookingBarData;
  startCol: number; endCol: number; row: number;
  isStart: boolean; isEnd: boolean; // actual checkin/checkout (gets offset)
  capLeft: boolean; capRight: boolean; // rounded cap (month break or actual start/end)
  nights: number; isPast: boolean;
}

interface MonthData {
  year: number; month: number; label: string; abbr: string; key: string;
  days: DayInfo[]; startDow: number; totalDays: number;
}

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

function buildMonthDays(year: number, month: number, todayStr: string): { days: DayInfo[]; startDow: number; totalDays: number } {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  let startDow = first.getDay() - 1; // Mon=0 Sun=6
  if (startDow < 0) startDow = 6;
  const totalDays = last.getDate();
  const days: DayInfo[] = [];
  for (let d = 1; d <= totalDays; d++) {
    const date = toDateStr(year, month, d);
    const gridPos = d - 1 + startDow;
    days.push({ date, dayNum: d, isToday: date === todayStr, isPast: date < todayStr, gridCol: gridPos % 7, gridRow: Math.floor(gridPos / 7) });
  }
  return { days, startDow, totalDays };
}

function buildBarSegments(bookings: BookingBarData[], year: number, month: number, startDow: number, totalDays: number, todayStr: string): BarSegment[] {
  const monthStart = toDateStr(year, month, 1);
  const monthEnd = toDateStr(year, month, totalDays);
  const nm = month === 11 ? 0 : month + 1;
  const ny = month === 11 ? year + 1 : year;
  const nextFirst = toDateStr(ny, nm, 1);
  const segments: BarSegment[] = [];

  for (const booking of bookings) {
    if (booking.check_in >= nextFirst || booking.check_out <= monthStart) continue;

    const nights = getNights(booking.check_in, booking.check_out);
    const isPast = booking.check_out <= todayStr;

    // Bar start in this month
    let barStartDay: number, isStart: boolean, capLeft: boolean;
    if (booking.check_in < monthStart) {
      barStartDay = 1; isStart = false; capLeft = true; // month-break cap
    } else {
      barStartDay = parseInt(booking.check_in.slice(8, 10));
      isStart = true; capLeft = true;
    }

    // Bar end in this month
    let barEndDay: number, isEnd: boolean, capRight: boolean;
    if (booking.check_out > monthEnd) {
      barEndDay = totalDays; isEnd = false; capRight = true; // month-break cap
    } else {
      barEndDay = parseInt(booking.check_out.slice(8, 10));
      isEnd = true; capRight = true;
    }

    // Grid positions
    const startGridPos = barStartDay - 1 + startDow;
    const endGridPos = barEndDay - 1 + startDow;
    const sRow = Math.floor(startGridPos / 7);
    const sCol = startGridPos % 7;
    const eRow = Math.floor(endGridPos / 7);
    const eCol = endGridPos % 7;

    for (let row = sRow; row <= eRow; row++) {
      const sc = row === sRow ? sCol : 0;
      const ec = row === eRow ? eCol : 6;
      segments.push({
        booking, startCol: sc, endCol: ec, row,
        isStart: row === sRow && isStart,
        isEnd: row === eRow && isEnd,
        capLeft: row === sRow ? capLeft : false,
        capRight: row === eRow ? capRight : false,
        nights, isPast,
      });
    }
  }
  return segments;
}

const gridVars = {
  "--col": `calc((100% + ${GAP}px) / 7)`,
  "--cell": `calc((100% + ${GAP}px) / 7 - ${GAP}px)`,
} as React.CSSProperties;

export default function MonthlyView({
  propertyId, bookings, rates, todayStr, todayTrigger, onBookingClick, onDateClick,
}: MonthlyViewProps) {
  const thisYear = new Date().getFullYear();
  const thisMonth = new Date().getMonth();

  // Measure actual cell height for bar row positioning (can't use % because
  // --col is width-based but top needs height-based values)
  const [cellH, setCellH] = useState(0);
  const measureElRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const measure = () => {
      const cell = measureElRef.current?.querySelector("[data-cell]");
      if (cell) setCellH(cell.getBoundingClientRect().height);
    };
    measure();
    const el = measureElRef.current;
    if (!el) return;
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Calendar intelligence — fetch events + cleaning tasks client-side
  const [calEvents, setCalEvents] = useState<Map<string, { name: string; impact: number }>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [calClean, setCalClean] = useState<Map<string, string>>(new Map()); // date → status (future use)
  useEffect(() => {
    // Events
    fetch(`/api/analytics/forecast/${propertyId}`).then((r) => r.ok ? r.json() : null).then((d) => {
      if (!d?.forecast) return;
      const map = new Map<string, { name: string; impact: number }>();
      for (const f of d.forecast as { date: string; demand_score: number; factors: string[] }[]) {
        const eventFactor = f.factors.find((fac) => !fac.includes("season") && !fac.includes("DOW") && !fac.includes("Market") && !fac.includes("Supply") && !fac.includes("learned") && !fac.includes("default") && !fac.includes("Clear") && !fac.includes("Rain"));
        if (eventFactor) map.set(f.date, { name: eventFactor, impact: f.demand_score / 100 });
      }
      setCalEvents(map);
    }).catch(() => {});
    // Cleaning tasks
    fetch("/api/dashboard/actions", { method: "POST" }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (!d?.actions) return;
      const map = new Map<string, string>();
      for (const a of d.actions as { id: string; type: string; description: string }[]) {
        if (a.type === "cleaning") {
          const status = a.description.includes("pending") ? "pending" : a.description.includes("assigned") ? "assigned" : "ok";
          map.set(a.id, status);
        }
      }
      setCalClean(map);
    }).catch(() => {});
  }, [propertyId]);

  const months = useMemo(() => {
    const result: MonthData[] = [];
    for (let i = 0; i < TOTAL_MONTHS; i++) {
      const m = (thisMonth + i) % 12;
      const y = thisYear + Math.floor((thisMonth + i) / 12);
      const { days, startDow, totalDays } = buildMonthDays(y, m, todayStr);
      result.push({
        year: y, month: m,
        label: `${MONTH_NAMES[m]} ${y}`,
        abbr: y !== thisYear ? `${MONTH_ABBRS[m]} '${String(y).slice(2)}` : MONTH_ABBRS[m],
        key: `${y}-${pad2(m + 1)}`,
        days, startDow, totalDays,
      });
    }
    return result;
  }, [todayStr, thisYear, thisMonth]);

  const segmentsByMonth = useMemo(() => {
    const map = new Map<string, BarSegment[]>();
    for (const m of months) map.set(m.key, buildBarSegments(bookings, m.year, m.month, m.startDow, m.totalDays, todayStr));
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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activeMonth, setActiveMonth] = useState(months[0]?.key ?? "");

  const scrollToMonth = useCallback((key: string) => {
    const el = monthRefs.current.get(key);
    if (el && containerRef.current) containerRef.current.scrollTop = el.offsetTop - 28;
  }, []);
  const scrollToToday = useCallback(() => {
    const m = months.find((m) => m.days.some((d) => d.isToday));
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
          <button key={m.key} onClick={() => { scrollToMonth(m.key); setActiveMonth(m.key); }}
            className={`px-2 py-0.5 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors flex-shrink-0 ${
              activeMonth === m.key ? "bg-[#222] text-white" : "text-[#999] hover:text-[#555] hover:bg-[#f5f5f5]"
            }`}>{m.abbr}</button>
        ))}
      </div>

      <div ref={(el) => { containerRef.current = el; measureElRef.current = el; }} className="overflow-y-auto flex-1 min-h-0 bg-white px-2 md:px-0">
        {/* Sticky day header */}
        <div className="sticky top-0 z-10 bg-white grid grid-cols-7 gap-[3px] border-b border-[#e8e8e8]">
          {DAY_LABELS.map((l, i) => (
            <div key={`${l}-${i}`} className="py-1 md:py-1.5 text-center text-[11px] font-medium uppercase tracking-widest text-[#999]">
              <span className="md:hidden">{DAY_LABELS_SHORT[i]}</span>
              <span className="hidden md:inline">{l}</span>
            </div>
          ))}
        </div>

        {/* Month sections — only actual days, no padding cells */}
        {months.map((m) => {
          const segments = segmentsByMonth.get(m.key) ?? [];
          return (
            <div key={m.key} ref={(el) => { if (el) monthRefs.current.set(m.key, el); }} data-month={m.key}>
              <div className="sticky top-[27px] md:top-[29px] z-[9] bg-white px-1 pt-6 md:pt-10 pb-1.5 md:pb-2">
                <span className="text-lg md:text-xl font-bold text-[#222]">{m.label}</span>
              </div>

              {/* Single flat grid — cells auto-wrap, day 1 placed via gridColumnStart */}
              <div className="relative grid grid-cols-7" style={{ gap: `${GAP}px`, overflow: "visible", ...gridVars }}>
                {m.days.map((day, i) => {
                  const rate = rates.get(day.date);
                  const isAvail = rate?.is_available !== false;
                  const rawRate = rate?.suggested_rate ?? rate?.applied_rate ?? rate?.base_rate ?? null;
                  const isBooked = bookedDates.has(day.date);
                  const isBlocked = !isAvail && !isBooked;

                  return (
                    <div
                      key={day.date}
                      data-cell
                      className={`relative aspect-square cursor-pointer transition-colors flex flex-col justify-between rounded-md md:rounded-[10px] ${
                        day.isPast ? "bg-[#f9f9f7]" : isBlocked ? "bg-[#f5f5f5]" : day.isToday ? "bg-white" : "bg-white hover:bg-[#fafafa]"
                      }`}
                      style={{
                        border: "1px solid #e8e8e8",
                        ...(i === 0 && m.startDow > 0 ? { gridColumnStart: m.startDow + 1 } : {}),
                        ...(isBlocked && !day.isPast ? { backgroundImage: "repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(0,0,0,0.015) 4px, rgba(0,0,0,0.015) 5px)" } : {}),
                      }}
                      onClick={() => { if (!isBooked && !day.isPast) onDateClick(propertyId, day.date, rate ?? null); }}
                    >
                      <div className="p-1 md:p-[6px] flex flex-col justify-between h-full">
                        <div className="flex items-start justify-between">
                          <div>
                            {day.isToday ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 md:w-6 md:h-6 rounded-full bg-emerald-500 text-white text-[12px] md:text-[13px] font-semibold leading-none">{day.dayNum}</span>
                            ) : (
                              <span className={`text-[12px] md:text-[13px] font-semibold leading-none ${day.isPast ? "text-[#bbb]" : "text-[#333]"}`}>{day.dayNum}</span>
                            )}
                          </div>
                          {/* Event dot indicator */}
                          {!day.isPast && calEvents.has(day.date) && (() => {
                            const ev = calEvents.get(day.date)!;
                            const dotColor = ev.impact > 0.6 ? "bg-red-400" : ev.impact > 0.3 ? "bg-amber-400" : "bg-neutral-300";
                            return <span className={`w-1.5 h-1.5 rounded-full ${dotColor} flex-shrink-0`} title={ev.name} />;
                          })()}
                        </div>
                        {/* Rate with comparison color */}
                        {!isBooked && !day.isPast && rawRate !== null && isAvail && (() => {
                          const applied = rate?.applied_rate;
                          const suggested = rate?.suggested_rate;
                          let rateColor = "text-[#999]";
                          if (applied && suggested && Math.abs(suggested - applied) / applied > 0.08) {
                            rateColor = suggested > applied ? "text-emerald-500" : "text-red-400";
                          }
                          return <span className={`self-end text-[10px] md:text-[11px] font-mono ${rateColor} leading-none`}>${rawRate}</span>;
                        })()}
                      </div>
                    </div>
                  );
                })}

                {/* Booking bars — positioned by grid row/col using calc with --col */}
                {segments.map((seg, si) => {
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

                  // Position bar at bottom of its row using measured cell height (px)
                  const rowUnit = cellH + GAP;
                  const top = cellH > 0 ? `${seg.row * rowUnit + cellH - 3}px` : "0px";

                  const color = platformColors[seg.booking.platform] ?? "#333333";
                  const logo = platformLogos[seg.booking.platform] ?? null;
                  const firstName = seg.booking.guest_name?.split(" ")[0] ?? "Guest";
                  const effectiveSpan = span - startFrac - endFrac;
                  const showText = effectiveSpan >= 1.5;

                  const rL = seg.capLeft ? "14px" : "0";
                  const rR = seg.capRight ? "14px" : "0";
                  const shadow = seg.isStart
                    ? "-3px 1px 3px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.1)"
                    : "0 1px 2px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)";

                  return (
                    <div
                      key={`${seg.booking.id}-${seg.row}-${si}`}
                      className="absolute flex items-center gap-1 text-white overflow-hidden whitespace-nowrap cursor-pointer transition-all duration-150 ease-out hover:-translate-y-px h-[28px] md:h-[32px]"
                      style={{
                        left, width, top, transform: "translateY(-100%)",
                        backgroundColor: color,
                        borderRadius: `${rL} ${rR} ${rR} ${rL}`,
                        zIndex: seg.isStart ? 2 : 1,
                        paddingLeft: seg.capLeft ? "3px" : "4px",
                        paddingRight: seg.capRight ? "10px" : "4px",
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
                      {seg.capLeft && logo && (
                        <div className="flex-shrink-0 rounded-full bg-white flex items-center justify-center w-[22px] h-[22px] md:w-[24px] md:h-[24px]"
                          style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={logo} alt="" className="w-[14px] h-[14px] md:w-[16px] md:h-[16px]" />
                        </div>
                      )}
                      {showText && <span className="truncate text-[11px] md:text-[12px] font-medium">{firstName} +{seg.nights}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
