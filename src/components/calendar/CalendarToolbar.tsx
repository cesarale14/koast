"use client";

interface CalendarToolbarProps {
  onToday: () => void;
  properties: { id: string; name: string }[];
  selectedPropertyId: string | null;
  onPropertyChange: (id: string | null) => void;
}

export default function CalendarToolbar({
  onToday,
  properties,
  selectedPropertyId,
  onPropertyChange,
}: CalendarToolbarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white flex-shrink-0">
      {/* Left: title */}
      <h1 className="text-sm font-bold text-neutral-800">Calendar</h1>

      {/* Center: today button */}
      <button
        onClick={onToday}
        className="px-2.5 py-1 text-xs font-medium text-neutral-600 bg-white border border-gray-200 rounded-lg hover:bg-neutral-50 transition-colors"
      >
        Today
      </button>

      {/* Right: property selector (mobile only — desktop sidebar handles it) */}
      <select
        value={selectedPropertyId ?? ""}
        onChange={(e) => onPropertyChange(e.target.value || null)}
        className="md:hidden h-8 px-2.5 text-xs border border-gray-200 rounded-lg bg-white text-neutral-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors"
      >
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {/* Desktop: invisible spacer for centering */}
      <div className="hidden md:block w-[1px]" />
    </div>
  );
}
