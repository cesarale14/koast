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
}: DateCellProps) {
  const isAvailable = rate?.is_available !== false;
  const displayRate = rate?.applied_rate ?? rate?.base_rate ?? null;

  return (
    <div
      className={`w-[80px] h-full border-r border-neutral-100 relative cursor-pointer transition-colors select-none ${
        isSelected
          ? "bg-brand-50 ring-1 ring-inset ring-brand-300"
          : isAvailable
          ? "bg-neutral-0 hover:bg-neutral-50"
          : "bg-neutral-100"
      } ${isToday ? "ring-1 ring-inset ring-brand-400" : ""}`}
      onClick={() => onClick(date, rate)}
      onMouseDown={() => onDragStart(date)}
      onMouseEnter={() => onDragEnter(date)}
    >
      {/* Rate display positioned based on coverage */}
      {displayRate !== null && (
        <span
          className={`absolute top-0.5 text-[10px] font-mono font-medium ${
            isAvailable ? "text-neutral-500" : "text-neutral-400 line-through"
          } ${
            coverage === "checkout" ? "right-1" : coverage === "checkin" ? "left-1" : "right-1"
          }`}
        >
          ${displayRate}
        </span>
      )}
    </div>
  );
}
