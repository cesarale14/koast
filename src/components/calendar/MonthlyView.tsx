"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import type { BookingBarData } from "./BookingBar";
import type { RateData } from "./DateCell";

const TOTAL_MONTHS = 24;
const GAP = 5;

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
  // Fractional cell coordinates for Airbnb-style partial-cell rendering.
  // floatStart/floatEnd are in "cell widths" from the left edge of column 0
  // on this row — e.g. 0.5 means "halfway through column 0", 2.4 means
  // "40% into column 2". Lane packing still uses integer startCol/endCol.
  floatStart: number; floatEnd: number;
  isStart: boolean; isEnd: boolean; // actual checkin/checkout (gets offset)
  capLeft: boolean; capRight: boolean; // rounded cap (month break or actual start/end)
  nights: number; isPast: boolean;
  lane: number; // vertical lane within the row (0 = bottom, stacking upward for conflicts)
  conflict: boolean; // true if this booking overlaps another in the calendar's bookings
  hasFollower: boolean; // another booking checks in on this booking's checkout day
  hasPredecessor: boolean; // another booking checked out on this booking's check-in day
}

// Airbnb-style partial-cell offsets. Non-turnover check-in starts at 50%
// of the cell, non-turnover checkout ends at 40% of the cell. On a
// turnover day the outgoing bar runs to 50% and the incoming bar starts
// at 40%, creating a 10% overlap seam in the middle of the cell.
const CHECKIN_OFFSET = 0.5;
const CHECKOUT_EXT = 0.4;
const TURNOVER_CHECKIN_OFFSET = 0.4;
const TURNOVER_CHECKOUT_EXT = 0.5;

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

function buildBarSegments(bookings: BookingBarData[], conflictBookingIds: Set<string>, followerIds: Set<string>, predecessorIds: Set<string>, year: number, month: number, startDow: number, totalDays: number, todayStr: string): BarSegment[] {
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
    const hasFollower = followerIds.has(booking.id);
    const hasPredecessor = predecessorIds.has(booking.id);

    // The bar covers "nights" — i.e. every date from check_in (inclusive)
    // through check_out minus one (inclusive). A 3-night stay 4/12→4/15
    // highlights 4/12, 4/13, 4/14. Compute the last-night date in YYYY-MM-DD
    // form so we can clip cleanly against the current month's edges.
    const coDate = new Date(booking.check_out + "T00:00:00Z");
    coDate.setUTCDate(coDate.getUTCDate() - 1);
    const lastNight = `${coDate.getUTCFullYear()}-${pad2(coDate.getUTCMonth() + 1)}-${pad2(coDate.getUTCDate())}`;

    // Skip entirely if the last night is before this month starts.
    if (lastNight < monthStart) continue;

    // Bar start in this month
    let barStartDay: number, isStart: boolean;
    if (booking.check_in < monthStart) {
      barStartDay = 1; isStart = false; // continues from previous month
    } else {
      barStartDay = parseInt(booking.check_in.slice(8, 10));
      isStart = true;
    }

    // Bar end in this month — the LAST NIGHT, not the checkout day
    let barEndDay: number, isEnd: boolean;
    if (lastNight > monthEnd) {
      barEndDay = totalDays; isEnd = false; // continues into next month
    } else {
      barEndDay = parseInt(lastNight.slice(8, 10));
      isEnd = true;
    }

    // Grid positions
    const startGridPos = barStartDay - 1 + startDow;
    const endGridPos = barEndDay - 1 + startDow;
    const sRow = Math.floor(startGridPos / 7);
    const sCol = startGridPos % 7;
    const eRow = Math.floor(endGridPos / 7);
    const eCol = endGridPos % 7;

    // Grid position of the checkout day, if it still lives in this month.
    // We use this to decide whether the last row can absorb a partial
    // "checkout nub" into the checkout day cell without crossing a week
    // boundary. Cross-row wraps keep the old cell-edge visual to avoid
    // competing with lane-packed neighbors on the next row.
    let checkoutRow = -1;
    let checkoutColSameRow = false;
    if (isEnd && barEndDay + 1 <= totalDays) {
      const coGridPos = barEndDay + 1 - 1 + startDow;
      checkoutRow = Math.floor(coGridPos / 7);
      checkoutColSameRow = checkoutRow === eRow;
    }

    for (let row = sRow; row <= eRow; row++) {
      const sc = row === sRow ? sCol : 0;
      const ec = row === eRow ? eCol : 6;
      const isStartRow = row === sRow && isStart;
      const isEndRow = row === eRow && isEnd;

      // Default: bar covers whole cell(s) from sc to ec+1 (exclusive right).
      let floatStart = sc;
      let floatEnd = ec + 1;

      // Check-in inset on the first row. Turnover (another booking
      // checked out on this check-in day) starts 10% earlier to create
      // the overlap seam with the outgoing bar.
      if (isStartRow) {
        floatStart = sc + (hasPredecessor ? TURNOVER_CHECKIN_OFFSET : CHECKIN_OFFSET);
      }

      // Checkout extension on the last row — only when the checkout
      // day lives on the same grid row (no week wrap). Turnover extends
      // 10% further so it meets the incoming bar at its start offset.
      if (isEndRow && checkoutColSameRow) {
        floatEnd = ec + 1 + (hasFollower ? TURNOVER_CHECKOUT_EXT : CHECKOUT_EXT);
      }

      // capLeft: round the left edge of the bar only at the true start
      //   (check-in within this month on the first row).
      // capRight: round the right edge only at the true end (last night
      //   within this month on the last row). Continuation rows across
      //   week boundaries get flat edges so the bar reads as "continues".
      segments.push({
        booking, startCol: sc, endCol: ec, row,
        floatStart, floatEnd,
        isStart: isStartRow,
        isEnd: isEndRow,
        capLeft: isStartRow,
        capRight: isEndRow,
        nights, isPast,
        lane: 0,
        conflict: conflictBookingIds.has(booking.id),
        hasFollower,
        hasPredecessor,
      });
    }
  }

  // Assign lanes per row with a greedy interval packing pass so overlapping
  // bookings stack upward instead of colliding on a single line.
  const byRow = new Map<number, BarSegment[]>();
  for (const s of segments) {
    if (!byRow.has(s.row)) byRow.set(s.row, []);
    byRow.get(s.row)!.push(s);
  }
  for (const rowSegs of Array.from(byRow.values())) {
    rowSegs.sort((a, b) => a.startCol - b.startCol || a.endCol - b.endCol);
    // lanes[i] = the rightmost endCol currently occupied in lane i
    const lanes: number[] = [];
    for (const seg of rowSegs) {
      let placed = false;
      for (let li = 0; li < lanes.length; li++) {
        if (seg.startCol > lanes[li]) {
          seg.lane = li;
          lanes[li] = seg.endCol;
          placed = true;
          break;
        }
      }
      if (!placed) {
        seg.lane = lanes.length;
        lanes.push(seg.endCol);
      }
    }
  }

  return segments;
}

const gridVars = {
  "--col": `calc((100% + ${GAP}px) / 7)`,
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  const bookedDates = useMemo(() => {
    const set = new Set<string>();
    for (const b of bookings) {
      const d = new Date(b.check_in + "T00:00:00");
      const co = new Date(b.check_out + "T00:00:00");
      while (d < co) { set.add(d.toISOString().split("T")[0]); d.setDate(d.getDate() + 1); }
    }
    return set;
  }, [bookings]);

  // Overbooking detection — dates where two or more confirmed bookings
  // span the same night, plus the set of booking IDs involved in any
  // overlap and the pairwise conflict ranges shown in the summary pill.
  // Computed locally from the bookings the calendar already has.
  const { conflictDates, conflictBookingIds } = useMemo(() => {
    const confirmed = bookings.filter((b) => !b.status || b.status === "confirmed");
    const dateToCount = new Map<string, number>();
    for (const b of confirmed) {
      const d = new Date(b.check_in + "T00:00:00");
      const co = new Date(b.check_out + "T00:00:00");
      while (d < co) {
        const key = d.toISOString().split("T")[0];
        dateToCount.set(key, (dateToCount.get(key) ?? 0) + 1);
        d.setDate(d.getDate() + 1);
      }
    }
    const dates = new Set<string>();
    for (const [k, v] of Array.from(dateToCount.entries())) if (v > 1) dates.add(k);

    const ids = new Set<string>();
    const pairs: { a: BookingBarData; b: BookingBarData; start: string; end: string; nights: number }[] = [];
    const sorted = [...confirmed].sort((x, y) =>
      x.check_in === y.check_in ? x.check_out.localeCompare(y.check_out) : x.check_in.localeCompare(y.check_in)
    );
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        // Same-day turnovers (Guest A checks out, Guest B checks in on
        // the same date) are a normal back-to-back booking, NOT a
        // conflict. Half-open interval math handles it already but we
        // enforce it explicitly for clarity.
        if (sorted[j].check_in >= sorted[i].check_out) continue;
        if (!(sorted[i].check_in < sorted[j].check_out && sorted[j].check_in < sorted[i].check_out)) continue;
        if (sorted[i].check_out === sorted[j].check_in || sorted[j].check_out === sorted[i].check_in) continue;
        const start = sorted[i].check_in > sorted[j].check_in ? sorted[i].check_in : sorted[j].check_in;
        const end = sorted[i].check_out < sorted[j].check_out ? sorted[i].check_out : sorted[j].check_out;
        const nights = getNights(start, end);
        if (nights === 0) continue;
        ids.add(sorted[i].id);
        ids.add(sorted[j].id);
        pairs.push({ a: sorted[i], b: sorted[j], start, end, nights });
      }
    }
    return { conflictDates: dates, conflictBookingIds: ids, conflictPairs: pairs };
  }, [bookings]);

  // Turnover detection: A has a "follower" when another booking checks
  // in on A's checkout date. The mirror set records predecessors. These
  // drive the Airbnb-style overlap seam on the turnover cell.
  const { followerIds, predecessorIds } = useMemo(() => {
    const f = new Set<string>();
    const p = new Set<string>();
    const byCheckIn = new Map<string, BookingBarData>();
    for (const b of bookings) {
      if (!byCheckIn.has(b.check_in)) byCheckIn.set(b.check_in, b);
    }
    for (const b of bookings) {
      const next = byCheckIn.get(b.check_out);
      if (next && next.id !== b.id) {
        f.add(b.id);
        p.add(next.id);
      }
    }
    return { followerIds: f, predecessorIds: p };
  }, [bookings]);

  const segmentsByMonth = useMemo(() => {
    const map = new Map<string, BarSegment[]>();
    for (const m of months) map.set(m.key, buildBarSegments(bookings, conflictBookingIds, followerIds, predecessorIds, m.year, m.month, m.startDow, m.totalDays, todayStr));
    return map;
  }, [months, bookings, conflictBookingIds, followerIds, predecessorIds, todayStr]);

  // Gap night detection — 1-2 available nights between bookings (kept for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const gapDates = useMemo(() => {
    const gaps = new Set<string>();
    const sorted = [...bookings]
      .filter((b) => b.check_out >= todayStr)
      .sort((a, b) => a.check_in.localeCompare(b.check_in));
    for (let i = 0; i < sorted.length - 1; i++) {
      const co = sorted[i].check_out;
      const ci = sorted[i + 1].check_in;
      const gapNights = getNights(co, ci);
      if (gapNights >= 1 && gapNights <= 2) {
        const d = new Date(co + "T00:00:00");
        const end = new Date(ci + "T00:00:00");
        while (d < end) {
          gaps.add(d.toISOString().split("T")[0]);
          d.setDate(d.getDate() + 1);
        }
      }
    }
    return gaps;
  }, [bookings, todayStr]);

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
      <div className="hidden md:flex gap-0.5 px-3 py-1.5 border-b border-[#e5e5e5] overflow-x-auto flex-shrink-0">
        {months.map((m) => (
          <button key={m.key} onClick={() => { scrollToMonth(m.key); setActiveMonth(m.key); }}
            className={`px-2 py-0.5 text-[11px] font-medium rounded-full whitespace-nowrap transition-colors flex-shrink-0 ${
              activeMonth === m.key ? "bg-[#222] text-white" : "text-[#999] hover:text-[#555] hover:bg-[#f5f5f5]"
            }`}>{m.abbr}</button>
        ))}
      </div>

      <div ref={(el) => { containerRef.current = el; measureElRef.current = el; }} className="overflow-y-auto flex-1 min-h-0 bg-white px-2 md:px-0">
        {/* Sticky day header */}
        <div className="sticky top-0 z-10 bg-white grid grid-cols-7 gap-[5px] border-b border-[#e8e8e8]">
          {DAY_LABELS.map((l, i) => (
            <div key={`${l}-${i}`} className="py-1 text-center text-[11px] font-medium text-[#999]">
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
              <div className="sticky top-[25px] md:top-[27px] z-[9] bg-white px-1 pt-5 md:pt-8 pb-2">
                <span className="text-xl md:text-2xl font-bold text-[#222]">{m.label}</span>
              </div>

              {/* Single flat grid — cells auto-wrap, day 1 placed via gridColumnStart */}
              <div className="relative grid grid-cols-7" style={{ gap: `${GAP}px`, ...gridVars }}>
                {m.days.map((day, i) => {
                  const rate = rates.get(day.date);
                  const isAvail = rate?.is_available !== false;
                  const rawRate = rate?.applied_rate ?? rate?.base_rate ?? null;
                  const isBooked = bookedDates.has(day.date);
                  const isBlocked = !isAvail && !isBooked;
                  const isConflict = conflictDates.has(day.date);

                  return (
                    <div
                      key={day.date}
                      data-cell
                      className={`relative cursor-pointer transition-colors rounded-xl ${
                        isConflict ? "bg-red-50 ring-1 ring-red-300" : day.isPast ? "bg-[#f9f8f5]" : isBlocked ? "bg-[#f5f3ee]" : "bg-white hover:bg-[#faf9f6]"
                      }`}
                      style={{
                        aspectRatio: "6 / 5",
                        border: "1px solid #e8e8e8",
                        ...(i === 0 && m.startDow > 0 ? { gridColumnStart: m.startDow + 1 } : {}),
                      }}
                      onClick={() => { if (!isBooked && !day.isPast) onDateClick(propertyId, day.date, rate ?? null); }}
                    >
                      <div className="px-1.5 pt-1 pb-0.5 flex flex-col justify-between h-full">
                        <div className="flex items-start justify-between">
                          {day.isToday ? (
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${isConflict ? "bg-red-500" : "bg-red-500"} text-white text-[11px] font-semibold leading-none`}>{day.dayNum}</span>
                          ) : (
                            <span className={`text-[12px] font-medium leading-none pt-0.5 ${isConflict ? "text-red-600" : day.isPast ? "text-[#ccc]" : "text-[#333]"}`}>{day.dayNum}</span>
                          )}
                          {isConflict && (
                            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] font-bold flex-shrink-0">!</span>
                          )}
                        </div>
                        {!isBooked && !day.isPast && rawRate !== null && isAvail && (
                          <span className="text-[11px] font-mono text-[#888] leading-none">${rawRate}</span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Booking bars — full-width across the nights they cover,
                    stacked into lanes within a row when bookings overlap. */}
                {segments.map((seg, si) => {
                  // Airbnb-style partial-cell span. floatStart/floatEnd
                  // encode check-in/checkout offsets into the grid's
                  // --col width so the bar meets the cell edge cleanly.
                  const cellSpan = seg.floatEnd - seg.floatStart;
                  const left = `calc(var(--col) * ${seg.floatStart})`;
                  const width = `calc(var(--col) * ${cellSpan} - ${GAP}px)`;

                  // Lane stacking. BAR_H must match the rendered bar height
                  // (32px desktop) and include LANE_GAP so stacked bars are
                  // visibly separated.
                  const BAR_H = 30;
                  const LANE_GAP = 2;
                  const laneOffset = seg.lane * (BAR_H + LANE_GAP);
                  const rowUnit = cellH + GAP;
                  const top = cellH > 0 ? `${seg.row * rowUnit + cellH - 4 - laneOffset}px` : "0px";

                  // Color: dark neutral by default; Booking.com uses the
                  // brand dark blue so the two platforms are distinguishable
                  // at a glance.
                  const isBooking = seg.booking.platform === "booking_com" || seg.booking.platform === "booking";
                  const color = isBooking ? "#003580" : "#222222";
                  const logo = platformLogos[seg.booking.platform] ?? null;

                  const rawName = seg.booking.guest_name?.trim() ?? "";
                  const firstName = rawName.split(" ")[0];
                  const hasRealName = firstName.length > 0 && firstName !== "Airbnb" && firstName !== "Guest" && firstName !== "Reserved";
                  const label = hasRealName ? `${firstName} + ${seg.nights}` : `Booked + ${seg.nights}`;
                  const showText = cellSpan >= 1.5;

                  const rL = seg.capLeft ? "15px" : "0";
                  const rR = seg.capRight ? "15px" : "0";
                  const shadow = "0 1px 3px rgba(0,0,0,0.12)";

                  // Red diagonal stripe overlay + red border when the bar is
                  // part of a conflict somewhere in the loaded bookings.
                  const conflictOverlay = seg.conflict
                    ? "repeating-linear-gradient(45deg, rgba(239,68,68,0.55) 0 6px, rgba(239,68,68,0) 6px 12px)"
                    : undefined;
                  const border = seg.conflict
                    ? "2px solid #ef4444"
                    : "none";

                  return (
                    <div
                      key={`${seg.booking.id}-${seg.row}-${si}`}
                      className="absolute flex items-center gap-1.5 text-white overflow-hidden whitespace-nowrap cursor-pointer transition-all duration-150 ease-out hover:brightness-110 h-[26px] md:h-[30px]"
                      style={{
                        left, width, top, transform: "translateY(-100%)",
                        backgroundColor: color,
                        backgroundImage: conflictOverlay,
                        borderRadius: `${rL} ${rR} ${rR} ${rL}`,
                        zIndex: seg.conflict ? 3 : seg.lane + 1,
                        paddingLeft: seg.capLeft ? "3px" : "4px",
                        paddingRight: seg.capRight ? "10px" : "4px",
                        opacity: seg.isPast ? 0.7 : 1,
                        border,
                        boxShadow: shadow,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.1)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = shadow; }}
                      onClick={(e) => { e.stopPropagation(); onBookingClick(seg.booking); }}
                      title={`${label} · ${seg.nights} night${seg.nights !== 1 ? "s" : ""} · ${seg.booking.platform}${seg.conflict ? " · ⚠︎ Overbooking" : ""}`}
                    >
                      {seg.capLeft && logo && (
                        <div className="flex-shrink-0 rounded-full bg-white flex items-center justify-center w-[20px] h-[20px] md:w-[22px] md:h-[22px]"
                          style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={logo} alt="" className="w-[12px] h-[12px] md:w-[14px] md:h-[14px]" />
                        </div>
                      )}
                      {showText && (
                        <span className="truncate text-[10px] md:text-[11px] font-medium">
                          {label}
                        </span>
                      )}
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
