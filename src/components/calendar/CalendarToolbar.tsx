"use client";

interface CalendarToolbarProps {
  viewMode: "timeline" | "monthly";
  onViewChange: (mode: "timeline" | "monthly") => void;
  startDate: Date;
  endDate: Date;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  properties: { id: string; name: string }[];
  selectedPropertyId: string | null;
  onPropertyChange: (id: string | null) => void;
  showAllOption: boolean;
}

function formatRange(start: Date, end: Date): string {
  const s = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const e = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${s} — ${e}`;
}

export default function CalendarToolbar({
  viewMode,
  onViewChange,
  startDate,
  endDate,
  onToday,
  onPrev,
  onNext,
  properties,
  selectedPropertyId,
  onPropertyChange,
  showAllOption,
}: CalendarToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
      {/* Left: view toggle — hidden on mobile (monthly only) */}
      <div className="hidden md:flex bg-neutral-100 rounded-lg p-0.5">
        {(["timeline", "monthly"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => onViewChange(mode)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
              viewMode === mode
                ? "bg-neutral-0 text-neutral-800 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Center: navigation */}
      <div className="flex items-center gap-2">
        {viewMode === "timeline" && (
          <button
            onClick={onPrev}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <button
          onClick={onToday}
          className="px-3 py-1.5 text-sm font-medium text-neutral-600 bg-neutral-0 border border-[var(--border)] rounded-lg hover:bg-neutral-50 transition-colors"
        >
          Today
        </button>
        {viewMode === "timeline" && (
          <>
            <button
              onClick={onNext}
              className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <span className="text-sm font-medium text-neutral-700 ml-1">
              {formatRange(startDate, endDate)}
            </span>
          </>
        )}
      </div>

      {/* Right: property selector — hidden on desktop for monthly (panel handles it) */}
      <select
        value={selectedPropertyId ?? ""}
        onChange={(e) => onPropertyChange(e.target.value || null)}
        className={`h-9 px-3 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors ${
          !showAllOption ? "md:hidden" : ""
        }`}
      >
        {showAllOption && <option value="">All Properties</option>}
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
