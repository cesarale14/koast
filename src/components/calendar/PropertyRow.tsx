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

          if (coverage === "booked") {
            return (
              <div
                key={date}
                className="w-[80px] h-full border-r border-neutral-100 flex-shrink-0"
                style={{ position: "absolute", left: `${absIdx * 80}px` }}
              />
            );
          }

          if (coverage === "turnover") {
            return (
              <div
                key={date}
                className="w-[80px] h-full border-r border-neutral-100 flex-shrink-0 relative overflow-hidden"
                style={{ position: "absolute", left: `${absIdx * 80}px` }}
              >
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(135deg, transparent 48%, var(--neutral-300) 48%, var(--neutral-300) 52%, transparent 52%)",
                  }}
                />
              </div>
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
          const span = endIdx - startIdx;

          if (span <= 0) return null;
          if (startIdx >= visibleEnd || startIdx + span <= visibleStart) return null;

          return (
            <BookingBar
              key={booking.id}
              booking={booking}
              startCol={startIdx}
              span={span}
              onClick={onBookingClick}
            />
          );
        })}
      </div>
    </div>
  );
}
