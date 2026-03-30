"use client";

export interface RateData {
  base_rate: number | null;
  suggested_rate: number | null;
  applied_rate: number | null;
  min_stay: number;
  is_available: boolean;
  rate_source: string;
}

interface DateCellProps {
  date: string;
  rate: RateData | null;
  isToday: boolean;
  onClick: (date: string, rate: RateData | null) => void;
  isSelected: boolean;
  onDragStart: (date: string) => void;
  onDragEnter: (date: string) => void;
  /** "full" = no booking, "checkin" = right half booked, "checkout" = left half booked */
  coverage?: "full" | "checkin" | "checkout";
  /** Event affecting this date */
  event?: { name: string; impact: number } | null;
  /** Whether this is a gap night (1-2 nights between bookings) */
  isGap?: boolean;
}

export default function DateCell({
  date,
  rate,
  isToday,
  onClick,
  isSelected,
  onDragStart,
  onDragEnter,
  coverage = "full",
  event,
  isGap,
}: DateCellProps) {
  const isAvailable = rate?.is_available !== false;
  const displayRate = rate?.applied_rate ?? rate?.base_rate ?? null;

  // Rate comparison coloring
  let rateColorClass = isAvailable ? "text-neutral-500" : "text-neutral-400 line-through";
  if (isAvailable && rate?.applied_rate && rate?.suggested_rate) {
    const diff = Math.abs(rate.suggested_rate - rate.applied_rate) / rate.applied_rate;
    if (diff > 0.08) {
      rateColorClass = rate.suggested_rate > rate.applied_rate ? "text-emerald-600" : "text-red-500";
    }
  }

  return (
    <div
      className={`w-[80px] h-full border-r border-neutral-100 relative cursor-pointer transition-colors select-none ${
        isSelected
          ? "bg-brand-50 ring-1 ring-inset ring-brand-300"
          : isGap
            ? "bg-amber-50"
            : isAvailable
              ? "bg-neutral-0 hover:bg-neutral-50"
              : "bg-neutral-100"
      } ${isToday ? "ring-1 ring-inset ring-brand-400" : ""}`}
      onClick={() => onClick(date, rate)}
      onMouseDown={() => onDragStart(date)}
      onMouseEnter={() => onDragEnter(date)}
    >
      {displayRate !== null && (
        <span
          className={`absolute top-1 text-[10px] font-mono font-medium ${rateColorClass} ${
            coverage === "checkout" ? "right-1" : coverage === "checkin" ? "left-1" : "right-1"
          }`}
        >
          ${displayRate}
        </span>
      )}
      {/* Event dot */}
      {event && (
        <span
          className={`absolute bottom-1 left-1 w-1.5 h-1.5 rounded-full ${
            event.impact > 0.6 ? "bg-red-400" : event.impact > 0.3 ? "bg-amber-400" : "bg-neutral-300"
          }`}
          title={event.name}
        />
      )}
      {/* Gap indicator */}
      {isGap && (
        <span
          className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400 ring-1 ring-amber-200"
          title="Gap night"
        />
      )}
    </div>
  );
}
