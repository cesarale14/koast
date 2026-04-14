"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface CalendarToolbarProps {
  monthLabel: string;
  yearLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export default function CalendarToolbar({
  monthLabel,
  yearLabel,
  onPrev,
  onNext,
  onToday,
}: CalendarToolbarProps) {
  return (
    <div
      className="flex-shrink-0 px-6 py-[18px] flex items-center justify-between bg-white"
      style={{ borderBottom: "1px solid var(--dry-sand)" }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onPrev}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-shore"
          style={{ border: "1px solid var(--dry-sand)", color: "var(--coastal)" }}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <div
          className="text-[22px] font-bold"
          style={{ color: "var(--coastal)", minWidth: 180 }}
        >
          {monthLabel}{" "}
          <span style={{ color: "var(--tideline)", fontWeight: 500 }}>{yearLabel}</span>
        </div>
        <button
          onClick={onNext}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-shore"
          style={{ border: "1px solid var(--dry-sand)", color: "var(--coastal)" }}
          aria-label="Next month"
        >
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>
      <button
        onClick={onToday}
        className="px-[14px] py-[6px] rounded-full text-xs font-semibold transition-colors hover:bg-shore"
        style={{ border: "1px solid var(--dry-sand)", backgroundColor: "#fff", color: "var(--coastal)" }}
      >
        Today
      </button>
    </div>
  );
}
