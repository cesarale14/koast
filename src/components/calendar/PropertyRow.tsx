"use client";

import DateCell, { type RateData } from "./DateCell";
import BookingBar, { type BookingBarData } from "./BookingBar";

interface PropertyRowProps {
  property: { id: string; name: string };
  dates: string[];
  bookings: BookingBarData[];
  rates: Map<string, RateData>;
  todayStr: string;
  visibleStart: number;
  visibleEnd: number;
  selectedDates: Set<string>;
  onBookingClick: (booking: BookingBarData) => void;
  onDateClick: (propertyId: string, date: string, rate: RateData | null) => void;
  onDragStart: (propertyId: string, date: string) => void;
  onDragEnter: (propertyId: string, date: string) => void;
  events?: Map<string, { name: string; impact: number }>;
  gaps?: Set<string>;
}

const CELL = 80;
// Airbnb-style partial-cell offsets. Non-turnover check-in starts at 50%
// of the cell (afternoon 3pm arrival visual); non-turnover checkout ends
// at 40% of the cell (11am departure visual). On a turnover day the
// outgoing bar runs to 50% and the incoming bar starts at 40%, creating
// a 10% overlap seam in the middle of the cell.
const CHECKIN_OFFSET = 0.5;
const CHECKOUT_EXT = 0.4;
const TURNOVER_CHECKIN_OFFSET = 0.4;
const TURNOVER_CHECKOUT_EXT = 0.5;

export default function PropertyRow({
  property,
  dates,
  bookings,
  rates,
  todayStr,
  visibleStart,
  visibleEnd,
  selectedDates,
  onBookingClick,
  onDateClick,
  onDragStart,
  onDragEnter,
  events,
  gaps,
}: PropertyRowProps) {
  const visibleDates = dates.slice(visibleStart, visibleEnd);

  // Turnover detection: a booking has a "follower" if another booking
  // checks in on its checkout date. Mirror set for predecessors.
  const followerIds = new Set<string>();
  const predecessorIds = new Set<string>();
  const byCheckIn = new Map<string, BookingBarData>();
  for (const b of bookings) {
    if (!byCheckIn.has(b.check_in)) byCheckIn.set(b.check_in, b);
  }
  for (const b of bookings) {
    const next = byCheckIn.get(b.check_out);
    if (next && next.id !== b.id) {
      followerIds.add(b.id);
      predecessorIds.add(next.id);
    }
  }

  const getCoverage = (date: string): "full" | "checkin" | "checkout" | "turnover" | "booked" => {
    let isCheckIn = false;
    let isCheckOut = false;
    for (const b of bookings) {
      if (date > b.check_in && date < b.check_out) return "booked";
      if (date === b.check_in) isCheckIn = true;
      if (date === b.check_out) isCheckOut = true;
    }
    if (isCheckIn && isCheckOut) return "turnover";
    if (isCheckIn) return "checkin";
    if (isCheckOut) return "checkout";
    return "full";
  };

  return (
    <div className="flex border-b border-neutral-100 h-16">
      <div className="relative flex" style={{ width: `${dates.length * 80}px` }}>
        {/* Date cells — visible range only */}
        {visibleDates.map((date, i) => {
          const absIdx = visibleStart + i;
          const coverage = getCoverage(date);

          // Middle booked nights and turnover days are covered by the
          // booking bars themselves — render an empty cell so the bar
          // visuals land on a clean background.
          if (coverage === "booked" || coverage === "turnover") {
            return (
              <div
                key={date}
                className="w-[80px] h-full border-r border-neutral-100 flex-shrink-0"
                style={{ position: "absolute", left: `${absIdx * 80}px` }}
              />
            );
          }

          return (
            <div
              key={date}
              style={{
                position: "absolute",
                left: `${absIdx * 80}px`,
                width: "80px",
                height: "100%",
              }}
            >
              <DateCell
                date={date}
                rate={rates.get(date) ?? null}
                isToday={date === todayStr}
                onClick={(d, r) => onDateClick(property.id, d, r)}
                isSelected={selectedDates.has(date)}
                onDragStart={(d) => onDragStart(property.id, d)}
                onDragEnter={(d) => onDragEnter(property.id, d)}
                coverage={coverage}
                event={events?.get(date) ?? null}
                isGap={gaps?.has(date)}
              />
            </div>
          );
        })}

        {/* Booking bars */}
        {bookings.map((booking) => {
          const startIdx = Math.max(
            0,
            dates.findIndex((d) => d === booking.check_in),
          );
          const endDate = booking.check_out;
          let endIdx = dates.findIndex((d) => d >= endDate);
          if (endIdx === -1) endIdx = dates.length;
          const nights = endIdx - startIdx;

          if (nights <= 0) return null;
          if (startIdx >= visibleEnd || endIdx <= visibleStart) return null;

          const hasFollower = followerIds.has(booking.id);
          const hasPredecessor = predecessorIds.has(booking.id);
          const leftOffsetCells = hasPredecessor ? TURNOVER_CHECKIN_OFFSET : CHECKIN_OFFSET;
          const rightExtCells = hasFollower ? TURNOVER_CHECKOUT_EXT : CHECKOUT_EXT;

          const left = (startIdx + leftOffsetCells) * CELL;
          const width = (nights + rightExtCells - leftOffsetCells) * CELL - 2;

          return (
            <BookingBar
              key={booking.id}
              booking={booking}
              left={left}
              width={width}
              hasFollower={hasFollower}
              hasPredecessor={hasPredecessor}
              onClick={onBookingClick}
            />
          );
        })}
      </div>
    </div>
  );
}
