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
      className={`w-[80px] h-full border-r border-gray-100 flex items-center justify-center cursor-pointer transition-colors select-none ${
        isSelected
          ? "bg-blue-50 ring-1 ring-inset ring-blue-300"
          : isAvailable
          ? "bg-emerald-50/40 hover:bg-emerald-50"
          : "bg-gray-100 hover:bg-gray-150"
      } ${isToday ? "ring-1 ring-inset ring-blue-400" : ""}`}
      onClick={() => onClick(date, rate)}
      onMouseDown={() => onDragStart(date)}
      onMouseEnter={() => onDragEnter(date)}
    >
      {displayRate !== null ? (
        <span
          className={`text-[11px] font-medium ${
            isAvailable ? "text-gray-500" : "text-gray-400 line-through"
          }`}
        >
          ${displayRate}
        </span>
      ) : (
        <span className="text-[11px] text-gray-300">—</span>
      )}
    </div>
  );
}
