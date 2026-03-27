"use client";

interface CalendarToolbarProps {
  startDate: Date;
  endDate: Date;
  properties: { id: string; name: string }[];
  selectedPropertyId: string | null;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPropertyFilter: (id: string | null) => void;
}

function formatRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const s = start.toLocaleDateString("en-US", opts);
  const e = end.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${s} — ${e}`;
}

export default function CalendarToolbar({
  startDate,
  endDate,
  properties,
  selectedPropertyId,
  onToday,
  onPrev,
  onNext,
  onPropertyFilter,
}: CalendarToolbarProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onToday}
          className="px-3 py-1.5 text-sm font-medium text-neutral-600 bg-neutral-0 border border-[var(--border)] rounded-lg hover:bg-neutral-50 transition-colors"
        >
          Today
        </button>
        <button
          onClick={onPrev}
          className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={onNext}
          className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <span className="text-sm font-medium text-neutral-700 ml-2">
          {formatRange(startDate, endDate)}
        </span>
      </div>

      <select
        value={selectedPropertyId ?? ""}
        onChange={(e) => onPropertyFilter(e.target.value || null)}
        className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-600"
      >
        <option value="">All Properties</option>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
