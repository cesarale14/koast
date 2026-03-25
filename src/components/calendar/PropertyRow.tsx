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
}: PropertyRowProps) {
  // Only render visible date cells
  const visibleDates = dates.slice(visibleStart, visibleEnd);

  return (
    <div className="flex border-b border-gray-100 h-10">
      {/* Date cells container */}
      <div className="relative flex" style={{ width: `${dates.length * 80}px` }}>
        {/* Render visible date cells */}
        {visibleDates.map((date, i) => {
          const absIdx = visibleStart + i;
          // Check if this date is covered by a booking
          const hasBooking = bookings.some(
            (b) => date >= b.check_in && date < b.check_out
          );
          if (hasBooking) {
            return (
              <div
                key={date}
                className="w-[80px] h-full border-r border-gray-100 flex-shrink-0"
                style={{ position: "absolute", left: `${absIdx * 80}px` }}
              />
            );
          }
          return (
            <div
              key={date}
              style={{ position: "absolute", left: `${absIdx * 80}px`, width: "80px", height: "100%" }}
            >
              <DateCell
                date={date}
                rate={rates.get(date) ?? null}
                isToday={date === todayStr}
                onClick={(d, r) => onDateClick(property.id, d, r)}
                isSelected={selectedDates.has(date)}
                onDragStart={(d) => onDragStart(property.id, d)}
                onDragEnter={(d) => onDragEnter(property.id, d)}
              />
            </div>
          );
        })}

        {/* Booking bars */}
        {bookings.map((booking) => {
          const startIdx = Math.max(
            0,
            dates.findIndex((d) => d === booking.check_in)
          );
          const endDate = booking.check_out;
          let endIdx = dates.findIndex((d) => d >= endDate);
          if (endIdx === -1) endIdx = dates.length;
          const span = endIdx - startIdx;

          if (span <= 0) return null;
          // Only render if booking overlaps visible range
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
