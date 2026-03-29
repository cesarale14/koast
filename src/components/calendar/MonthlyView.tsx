"use client";

import { useMemo } from "react";
import type { BookingBarData } from "./BookingBar";
import type { RateData } from "./DateCell";

const platformColors: Record<string, string> = {
  airbnb: "#FF5A5F",
  vrbo: "#3B5998",
  booking_com: "#003580",
  booking: "#003580",
  direct: "#10B981",
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

interface MonthlyViewProps {
  propertyId: string;
  year: number;
  month: number;
  bookings: BookingBarData[];
  rates: Map<string, RateData>;
  todayStr: string;
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

  // Monday-based DOW (0=Mon, 6=Sun)
  let dow = first.getDay() - 1;
  if (dow < 0) dow = 6;

  const weeks: DayInfo[][] = [];
  let week: DayInfo[] = [];

  // Leading days from previous month
  const prevLast = new Date(year, month, 0);
  for (let i = dow - 1; i >= 0; i--) {
    const d = prevLast.getDate() - i;
    const date = toDateStr(prevLast.getFullYear(), prevLast.getMonth(), d);
    week.push({
      date,
      dayNum: d,
      isCurrentMonth: false,
      isToday: date === todayStr,
      isWeekend: week.length >= 5,
    });
  }

  // Current month days
  for (let d = 1; d <= last.getDate(); d++) {
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    const date = toDateStr(year, month, d);
    week.push({
      date,
      dayNum: d,
      isCurrentMonth: true,
      isToday: date === todayStr,
      isWeekend: week.length >= 5,
    });
  }

  // Trailing days from next month
  let nd = 1;
  const nm = month === 11 ? 0 : month + 1;
  const ny = month === 11 ? year + 1 : year;
  while (week.length < 7) {
    const date = toDateStr(ny, nm, nd);
    week.push({
      date,
      dayNum: nd,
      isCurrentMonth: false,
      isToday: date === todayStr,
      isWeekend: week.length >= 5,
    });
    nd++;
  }
  weeks.push(week);

  return weeks;
}

function getBookingSegments(
  bookings: BookingBarData[],
  weeks: DayInfo[][],
): BookingSegment[] {
  const dateToPos = new Map<string, { row: number; col: number }>();
  weeks.forEach((w, row) =>
    w.forEach((d, col) => dateToPos.set(d.date, { row, col })),
  );

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
      const sc = row === startPos.row ? startPos.col : 0;
      const ec = row === endPos.row ? endPos.col : 6;

      segments.push({
        booking,
        startCol: sc,
        endCol: ec,
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
  year,
  month,
  bookings,
  rates,
  todayStr,
  onBookingClick,
  onDateClick,
}: MonthlyViewProps) {
  const weeks = useMemo(
    () => getMonthWeeks(year, month, todayStr),
    [year, month, todayStr],
  );
  const segments = useMemo(
    () => getBookingSegments(bookings, weeks),
    [bookings, weeks],
  );

  const isDateBooked = (date: string): boolean =>
    bookings.some((b) => date >= b.check_in && date < b.check_out);

  return (
    <div className="bg-neutral-0 rounded-lg border border-[var(--border)] overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-neutral-100">
        {DAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={`py-3 text-center text-xs font-medium uppercase tracking-wider ${
              i >= 5 ? "text-neutral-400 bg-neutral-25" : "text-neutral-500"
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((week, weekIdx) => {
        const rowSegments = segments.filter((s) => s.row === weekIdx);

        return (
          <div
            key={weekIdx}
            className="relative grid grid-cols-7 border-b border-neutral-100 last:border-b-0"
          >
            {/* Day cells */}
            {week.map((day) => {
              const rate = rates.get(day.date);
              const isAvailable = rate?.is_available !== false;
              const displayRate =
                rate?.applied_rate ?? rate?.base_rate ?? null;
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
                    if (!booked) {
                      onDateClick(propertyId, day.date, rate ?? null);
                    }
                  }}
                  style={
                    isBlocked
                      ? {
                          backgroundImage:
                            "repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(0,0,0,0.03) 3px, rgba(0,0,0,0.04) 4px)",
                        }
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
                      <span
                        className={`text-xs font-mono ${
                          isAvailable
                            ? "text-neutral-400"
                            : "text-neutral-300 line-through"
                        }`}
                      >
                        ${displayRate}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Booking bar segments */}
            {rowSegments.map((seg, segIdx) => {
              const cellPct = 100 / 7;
              let left = seg.startCol * cellPct;
              let width = (seg.endCol - seg.startCol + 1) * cellPct;

              if (seg.isStart) {
                left += cellPct / 2;
                width -= cellPct / 2;
              }
              if (seg.isEnd) {
                width -= cellPct / 2;
              }

              if (width <= 0) return null;

              const color =
                platformColors[seg.booking.platform] ?? "#6B7280";
              const firstName =
                seg.booking.guest_name?.split(" ")[0] ?? "Guest";
              const nights = (() => {
                const ci = Date.UTC(
                  +seg.booking.check_in.slice(0, 4),
                  +seg.booking.check_in.slice(5, 7) - 1,
                  +seg.booking.check_in.slice(8, 10),
                );
                const co = Date.UTC(
                  +seg.booking.check_out.slice(0, 4),
                  +seg.booking.check_out.slice(5, 7) - 1,
                  +seg.booking.check_out.slice(8, 10),
                );
                return Math.round((co - ci) / 86400000);
              })();

              return (
                <div
                  key={`${seg.booking.id}-${seg.row}-${segIdx}`}
                  className="absolute flex items-center gap-1 px-2 text-white text-xs font-medium overflow-hidden whitespace-nowrap cursor-pointer hover:brightness-110 hover:shadow-md transition-all z-10"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    top: "36px",
                    height: "28px",
                    backgroundColor: color,
                    borderRadius: `${seg.isStart ? "6px" : "0"} ${seg.isEnd ? "6px" : "0"} ${seg.isEnd ? "6px" : "0"} ${seg.isStart ? "6px" : "0"}`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onBookingClick(seg.booking);
                  }}
                  title={`${seg.booking.guest_name} · ${nights} night${nights !== 1 ? "s" : ""} · ${seg.booking.platform}`}
                >
                  <span className="truncate">{firstName}</span>
                  {seg.isStart && width > 10 && (
                    <span className="text-white/70 text-[10px] flex-shrink-0">
                      {nights}n
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
}
