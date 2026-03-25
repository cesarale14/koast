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
          className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Today
        </button>
        <button
          onClick={onPrev}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={onNext}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <span className="text-sm font-medium text-gray-700 ml-2">
          {formatRange(startDate, endDate)}
        </span>
      </div>

      <select
        value={selectedPropertyId ?? ""}
        onChange={(e) => onPropertyFilter(e.target.value || null)}
        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-600"
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
