"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import type { BookingBarData } from "./BookingBar";
import type { RateData } from "./DateCell";
import { PLATFORMS, platformKeyFrom } from "@/lib/platforms";

const GAP = 0;

const DAY_LABELS_LONG = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LABELS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface DayInfo {
  date: string;
  dayNum: number;
  isToday: boolean;
  isPast: boolean;
  inMonth: boolean;
  gridCol: number;
  gridRow: number;
}

interface BarSegment {
  booking: BookingBarData;
  startCol: number;
  endCol: number;
  row: number;
  floatStart: number;
  floatEnd: number;
  isStart: boolean;
  isEnd: boolean;
  capLeft: boolean;
  capRight: boolean;
  nights: number;
  isPast: boolean;
  lane: number;
  conflict: boolean;
  hasFollower: boolean;
  hasPredecessor: boolean;
}

// Airbnb-style check-in 50% / checkout 40% offsets. Turnover handoffs
// use 40% / 50% so the two bars meet with a 10% shared seam instead of
// overlapping the full cell.
const CHECKIN_OFFSET = 0.5;
const CHECKOUT_EXT = 0.4;
const TURNOVER_CHECKIN_OFFSET = 0.4;
const TURNOVER_CHECKOUT_EXT = 0.5;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function getNights(ci: string, co: string): number {
  return Math.round(
    (Date.UTC(+co.slice(0, 4), +co.slice(5, 7) - 1, +co.slice(8, 10)) -
      Date.UTC(+ci.slice(0, 4), +ci.slice(5, 7) - 1, +ci.slice(8, 10))) /
      86400000
  );
}

// Bar label: prefer "First L." when we have a real name, fall back to
// the platform-specific placeholder Channex sends us ("Airbnb Guest",
// "BDC Guest") for anonymous bookings. Never "Booked".
function formatBookingLabel(
  guestName: string | null,
  platformKey: ReturnType<typeof platformKeyFrom>
): string {
  const raw = (guestName ?? "").trim();
  const platformFallback =
    platformKey === "airbnb"
      ? "Airbnb Guest"
      : platformKey === "booking_com"
      ? "BDC Guest"
      : "Guest";

  if (!raw) return platformFallback;
  // Channel-generated anonymous names like "Airbnb Guest" or
  // "BookingDotCom Guest" should pass through without being parsed as
  // first + last initial.
  if (/guest$/i.test(raw) || /^reserved$/i.test(raw)) return platformFallback;

  const parts = raw.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const lastInitial = parts[1]?.[0];
  return lastInitial ? `${first} ${lastInitial.toUpperCase()}.` : first;
}

// Build the 6×7 grid including leading/trailing dates from adjacent
// months so the first and last rows stay visually complete.
function buildMonthGrid(year: number, month: number, todayStr: string): DayInfo[] {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  // JavaScript getDay: 0 = Sun, 1 = Mon ... 6 = Sat. We align Sunday-first.
  const leadingBlanks = first.getDay();
  const days: DayInfo[] = [];

  // Leading days from previous month
  const prevLast = new Date(year, month, 0).getDate();
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 11 : month - 1;
  for (let i = leadingBlanks - 1; i >= 0; i--) {
    const d = prevLast - i;
    const date = toDateStr(prevYear, prevMonth, d);
    days.push({
      date,
      dayNum: d,
      isToday: date === todayStr,
      isPast: date < todayStr,
      inMonth: false,
      gridCol: days.length % 7,
      gridRow: Math.floor(days.length / 7),
    });
  }

  for (let d = 1; d <= lastDay; d++) {
    const date = toDateStr(year, month, d);
    days.push({
      date,
      dayNum: d,
      isToday: date === todayStr,
      isPast: date < todayStr,
      inMonth: true,
      gridCol: days.length % 7,
      gridRow: Math.floor(days.length / 7),
    });
  }

  // Trailing days from next month — pad to complete the last row.
  const nextYear = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  let nextD = 1;
  while (days.length % 7 !== 0) {
    const date = toDateStr(nextYear, nextMonth, nextD);
    days.push({
      date,
      dayNum: nextD,
      isToday: date === todayStr,
      isPast: date < todayStr,
      inMonth: false,
      gridCol: days.length % 7,
      gridRow: Math.floor(days.length / 7),
    });
    nextD++;
  }

  return days;
}

// Build booking bar segments for the rendered grid. Bars map onto the
// full days array (including leading/trailing dates from adjacent
// months) because a booking might start in March and bleed into the
// April view on Sunday of the first week.
function buildBarSegments(
  bookings: BookingBarData[],
  days: DayInfo[],
  conflictBookingIds: Set<string>,
  followerIds: Set<string>,
  predecessorIds: Set<string>,
  todayStr: string
): BarSegment[] {
  if (days.length === 0) return [];
  const gridStart = days[0].date;
  const gridEnd = days[days.length - 1].date;
  const dateIndex = new Map<string, number>();
  days.forEach((d, i) => dateIndex.set(d.date, i));

  const segments: BarSegment[] = [];

  for (const booking of bookings) {
    const coDate = new Date(booking.check_out + "T00:00:00Z");
    coDate.setUTCDate(coDate.getUTCDate() - 1);
    const lastNight = `${coDate.getUTCFullYear()}-${pad2(coDate.getUTCMonth() + 1)}-${pad2(coDate.getUTCDate())}`;
    if (lastNight < gridStart) continue;
    if (booking.check_in > gridEnd) continue;

    const nights = getNights(booking.check_in, booking.check_out);
    const isPast = booking.check_out <= todayStr;
    const hasFollower = followerIds.has(booking.id);
    const hasPredecessor = predecessorIds.has(booking.id);

    const startIdx = booking.check_in < gridStart ? 0 : dateIndex.get(booking.check_in) ?? 0;
    const endIdx = lastNight > gridEnd ? days.length - 1 : dateIndex.get(lastNight) ?? days.length - 1;

    const isStart = booking.check_in >= gridStart;
    const isEnd = lastNight <= gridEnd;

    // Determine whether the checkout day itself also lives in this grid
    // and on the same row as the last-night cell, so we can extend the
    // bar into it for the morning-departure visual.
    const checkoutIdx = isEnd && endIdx + 1 < days.length ? endIdx + 1 : -1;
    const checkoutSameRow =
      checkoutIdx >= 0 && Math.floor(checkoutIdx / 7) === Math.floor(endIdx / 7);

    const sRow = Math.floor(startIdx / 7);
    const eRow = Math.floor(endIdx / 7);
    const sCol = startIdx % 7;
    const eCol = endIdx % 7;

    for (let row = sRow; row <= eRow; row++) {
      const sc = row === sRow ? sCol : 0;
      const ec = row === eRow ? eCol : 6;
      const isStartRow = row === sRow && isStart;
      const isEndRow = row === eRow && isEnd;

      let floatStart = sc;
      let floatEnd = ec + 1;

      if (isStartRow) {
        floatStart = sc + (hasPredecessor ? TURNOVER_CHECKIN_OFFSET : CHECKIN_OFFSET);
      }
      if (isEndRow && checkoutSameRow) {
        floatEnd = ec + 1 + (hasFollower ? TURNOVER_CHECKOUT_EXT : CHECKOUT_EXT);
      }

      segments.push({
        booking,
        startCol: sc,
        endCol: ec,
        row,
        floatStart,
        floatEnd,
        isStart: isStartRow,
        isEnd: isEndRow,
        capLeft: isStartRow,
        capRight: isEndRow,
        nights,
        isPast,
        lane: 0,
        conflict: conflictBookingIds.has(booking.id),
        hasFollower,
        hasPredecessor,
      });
    }
  }

  // Lane packing so overlapping bars stack inside a row instead of
  // colliding on the same horizontal line.
  const byRow = new Map<number, BarSegment[]>();
  for (const s of segments) {
    if (!byRow.has(s.row)) byRow.set(s.row, []);
    byRow.get(s.row)!.push(s);
  }
  for (const rowSegs of Array.from(byRow.values())) {
    rowSegs.sort((a, b) => a.startCol - b.startCol || a.endCol - b.endCol);
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

export interface MonthlyViewProps {
  propertyId: string;
  bookings: BookingBarData[];
  rates: Map<string, RateData>;
  todayStr: string;
  selectedDate: string | null;
  viewMonth: { year: number; month: number };
  onBookingClick: (booking: BookingBarData) => void;
  onDateClick: (date: string, rate: RateData | null) => void;
}

export default function MonthlyView({
  propertyId,
  bookings,
  rates,
  todayStr,
  selectedDate,
  viewMonth,
  onBookingClick,
  onDateClick,
}: MonthlyViewProps) {
  const days = useMemo(
    () => buildMonthGrid(viewMonth.year, viewMonth.month, todayStr),
    [viewMonth, todayStr]
  );

  const bookedDates = useMemo(() => {
    const set = new Set<string>();
    for (const b of bookings) {
      const d = new Date(b.check_in + "T00:00:00");
      const co = new Date(b.check_out + "T00:00:00");
      while (d < co) {
        set.add(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }
    }
    return set;
  }, [bookings]);

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
    const sorted = [...confirmed].sort((x, y) =>
      x.check_in === y.check_in
        ? x.check_out.localeCompare(y.check_out)
        : x.check_in.localeCompare(y.check_in)
    );
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].check_in >= sorted[i].check_out) continue;
        if (!(sorted[i].check_in < sorted[j].check_out && sorted[j].check_in < sorted[i].check_out)) continue;
        if (sorted[i].check_out === sorted[j].check_in || sorted[j].check_out === sorted[i].check_in) continue;
        ids.add(sorted[i].id);
        ids.add(sorted[j].id);
      }
    }
    return { conflictDates: dates, conflictBookingIds: ids };
  }, [bookings]);

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

  const segments = useMemo(
    () => buildBarSegments(bookings, days, conflictBookingIds, followerIds, predecessorIds, todayStr),
    [bookings, days, conflictBookingIds, followerIds, predecessorIds, todayStr]
  );

  // Measure actual cell height so we can position absolute-positioned
  // bars precisely on top of the grid rows.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [cellH, setCellH] = useState(0);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const cell = el.querySelector("[data-cell]");
      if (cell) setCellH(cell.getBoundingClientRect().height);
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-white" data-property={propertyId}>
      {/* Sticky weekday headers */}
      <div
        className="sticky top-0 z-[5] grid grid-cols-7 bg-white"
        style={{ borderBottom: "1px solid var(--dry-sand)" }}
      >
        {DAY_LABELS_LONG.map((label, i) => (
          <div
            key={`${label}-${i}`}
            className="py-3 text-center text-[11px] font-semibold uppercase tracking-[0.04em]"
            style={{ color: "var(--tideline)" }}
          >
            <span className="sm:hidden">{DAY_LABELS_SHORT[i]}</span>
            <span className="hidden sm:inline">{label}</span>
          </div>
        ))}
      </div>

      <div ref={gridRef} className="relative">
        <div className="grid grid-cols-7 relative" style={{ gap: `${GAP}px` }}>
          {days.map((day, i) => {
            const rate = rates.get(day.date);
            const isAvail = rate?.is_available !== false;
            const rawRate = rate?.applied_rate ?? rate?.base_rate ?? null;
            const isBooked = bookedDates.has(day.date);
            const isConflict = conflictDates.has(day.date);
            const isSelected = selectedDate === day.date;

            const lastCol = i % 7 === 6;
            const lastRow = Math.floor(i / 7) === Math.floor((days.length - 1) / 7);

            return (
              <div
                key={`${day.date}-${i}`}
                data-cell
                onClick={() => {
                  if (!day.inMonth) return;
                  onDateClick(day.date, rate ?? null);
                }}
                className="relative cursor-pointer transition-colors flex flex-col"
                style={{
                  aspectRatio: "1 / 0.85",
                  padding: "8px 10px",
                  borderRight: lastCol ? "none" : "1px solid rgba(237,231,219,0.5)",
                  borderBottom: lastRow ? "none" : "1px solid rgba(237,231,219,0.5)",
                  backgroundColor: isConflict
                    ? "rgba(196,64,64,0.06)"
                    : isSelected
                    ? "rgba(196,154,90,0.06)"
                    : "transparent",
                  boxShadow: isSelected ? "inset 0 0 0 2px var(--golden)" : undefined,
                  opacity: day.inMonth ? 1 : 0.25,
                  zIndex: isSelected ? 2 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isSelected && day.inMonth) e.currentTarget.style.backgroundColor = "rgba(196,154,90,0.03)";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = isConflict ? "rgba(196,64,64,0.06)" : "transparent";
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  {day.isToday ? (
                    <span
                      className="inline-flex items-center justify-center rounded-full text-white font-semibold"
                      style={{
                        backgroundColor: "#FF385C",
                        width: 24,
                        height: 24,
                        fontSize: 12,
                        marginLeft: -2,
                        marginTop: -2,
                      }}
                    >
                      {day.dayNum}
                    </span>
                  ) : (
                    <span
                      className="text-[13px] font-semibold leading-none pt-[1px]"
                      style={{ color: "var(--coastal)" }}
                    >
                      {day.dayNum}
                    </span>
                  )}
                  {isConflict && (
                    <span
                      className="inline-flex items-center justify-center rounded-full text-white text-[8px] font-bold"
                      style={{ backgroundColor: "var(--coral-reef)", width: 14, height: 14 }}
                    >
                      !
                    </span>
                  )}
                </div>
                {!isBooked && !day.isPast && rawRate !== null && isAvail && (
                  <span
                    className="text-[12px] font-medium mt-0.5"
                    style={{ color: "var(--tideline)" }}
                  >
                    ${rawRate}
                  </span>
                )}
              </div>
            );
          })}

          {/* Booking bars — absolutely positioned atop the cell grid */}
          {segments.map((seg, si) => {
            const cellSpan = seg.floatEnd - seg.floatStart;
            const left = `calc(100% / 7 * ${seg.floatStart})`;
            const width = `calc(100% / 7 * ${cellSpan})`;

            const BAR_H = 30;
            const LANE_GAP = 2;
            const laneOffset = seg.lane * (BAR_H + LANE_GAP);
            // Anchor bars at the top of the cell with a small inset
            const top = cellH > 0 ? `${seg.row * cellH + 28 + laneOffset}px` : "28px";

            const platformKey = platformKeyFrom(seg.booking.platform);
            const platform = platformKey ? PLATFORMS[platformKey] : null;

            const label = formatBookingLabel(seg.booking.guest_name, platformKey);
            const guests = seg.booking.num_guests ?? null;
            const showText = cellSpan >= 1.2;

            const rL = seg.capLeft ? "8px" : "0";
            const rR = seg.capRight ? "8px" : "0";
            const conflictOverlay = seg.conflict
              ? "repeating-linear-gradient(45deg, rgba(196,64,64,0.55) 0 6px, rgba(196,64,64,0) 6px 12px)"
              : undefined;

            return (
              <div
                key={`${seg.booking.id}-${seg.row}-${si}`}
                className="absolute flex items-center overflow-hidden whitespace-nowrap cursor-pointer"
                style={{
                  left,
                  width,
                  top,
                  height: BAR_H,
                  padding: "0 8px",
                  gap: 6,
                  backgroundColor: "var(--bar-dark)",
                  backgroundImage: conflictOverlay,
                  borderRadius: `${rL} ${rR} ${rR} ${rL}`,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  zIndex: seg.conflict ? 30 : 20 + seg.lane,
                  border: seg.conflict ? "2px solid var(--coral-reef)" : "none",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                  opacity: seg.isPast ? 0.6 : 1,
                  transition: "transform 0.15s ease-out, filter 0.15s ease-out",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.filter = "brightness(1.15)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.zIndex = "40";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = "";
                  e.currentTarget.style.transform = "";
                  e.currentTarget.style.zIndex = String(seg.conflict ? 30 : 20 + seg.lane);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onBookingClick(seg.booking);
                }}
                title={`${label}${guests ? ` · ${guests}` : ""} — ${seg.nights} night${seg.nights !== 1 ? "s" : ""}${seg.conflict ? " · Overbooking" : ""}`}
              >
                {seg.capLeft && platform && (
                  <div
                    className="flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden"
                    style={{ width: 20, height: 20, backgroundColor: platform.color }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={platform.iconWhite}
                      alt={platform.name}
                      style={{ width: 12, height: 12 }}
                    />
                  </div>
                )}
                {showText && (
                  <span className="truncate">
                    {label}
                    {guests ? ` · ${guests}` : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { MONTH_NAMES };
