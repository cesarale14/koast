"use client";

interface EventBadgeProps {
  name: string;
  impact: number; // 0-1
  date?: string;
  venue?: string;
  attendance?: number;
  compact?: boolean;
}

export default function EventBadge({ name, impact, date, venue, attendance, compact }: EventBadgeProps) {
  const bg = impact >= 0.6 ? "bg-red-50 text-red-700 border-red-200"
    : impact >= 0.3 ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-neutral-50 text-neutral-600 border-neutral-200";

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border ${bg}`}>
        <span>🏟</span>
        <span className="truncate max-w-[120px]">{name}</span>
      </span>
    );
  }

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${bg}`}>
      <span className="text-lg flex-shrink-0">🏟</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs opacity-75">
          {date && <span>{new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
          {venue && <span>· {venue}</span>}
          {attendance && attendance > 0 && <span>· {(attendance / 1000).toFixed(0)}K</span>}
          <span>· Impact: {Math.round(impact * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
