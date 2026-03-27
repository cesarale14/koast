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
}

export default function DateCell({
  date,
  rate,
  isToday,
  onClick,
  isSelected,
  onDragStart,
  onDragEnter,
}: DateCellProps) {
  const isAvailable = rate?.is_available !== false;
  const displayRate = rate?.applied_rate ?? rate?.base_rate ?? null;

  return (
    <div
      className={`w-[80px] h-full border-r border-neutral-100 flex items-center justify-center cursor-pointer transition-colors select-none ${
        isSelected
          ? "bg-brand-50 ring-1 ring-inset ring-brand-300"
          : isAvailable
          ? "bg-neutral-0 hover:bg-neutral-50"
          : "bg-neutral-100 hover:bg-neutral-150"
      } ${isToday ? "ring-1 ring-inset ring-brand-400" : ""}`}
      onClick={() => onClick(date, rate)}
      onMouseDown={() => onDragStart(date)}
      onMouseEnter={() => onDragEnter(date)}
    >
      {displayRate !== null ? (
        <span
          className={`text-[11px] font-mono font-medium ${
            isAvailable ? "text-neutral-600" : "text-neutral-400 line-through"
          }`}
        >
          ${displayRate}
        </span>
      ) : (
        <span className="text-[11px] text-neutral-300">—</span>
      )}
    </div>
  );
}
