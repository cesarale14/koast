"use client";

interface DaySlot {
  date: string;
  dayLabel: string;
  dayNum: number;
  isToday: boolean;
}

interface PropertyWeek {
  propertyId: string;
  propertyName: string;
  days: {
    date: string;
    status: "booked" | "available" | "blocked";
    guestName?: string;
  }[];
}

interface WeekCalendarProps {
  days: DaySlot[];
  properties: PropertyWeek[];
}

const statusColors = {
  booked: "bg-brand-500",
  available: "bg-brand-300",
  blocked: "bg-neutral-200",
};

const statusLabels = {
  booked: "Booked",
  available: "Open",
  blocked: "Blocked",
};

export default function WeekCalendar({ days, properties }: WeekCalendarProps) {
  if (properties.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-neutral-400 text-sm">
        Add properties to see your weekly availability.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Day headers */}
        <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: `140px repeat(${days.length}, 1fr)` }}>
          <div />
          {days.map((d) => (
            <div
              key={d.date}
              className={`text-center text-xs ${
                d.isToday ? "text-brand-500 font-semibold" : "text-neutral-400"
              }`}
            >
              <div>{d.dayLabel}</div>
              <div className={`text-lg font-semibold ${d.isToday ? "text-brand-500" : "text-neutral-700"}`}>
                {d.dayNum}
              </div>
            </div>
          ))}
        </div>

        {/* Property rows */}
        {properties.map((prop) => (
          <div
            key={prop.propertyId}
            className="grid gap-1 mb-1"
            style={{ gridTemplateColumns: `140px repeat(${days.length}, 1fr)` }}
          >
            <div className="text-sm font-medium text-neutral-700 truncate flex items-center">
              {prop.propertyName}
            </div>
            {prop.days.map((day) => (
              <div
                key={day.date}
                className={`h-8 rounded ${statusColors[day.status]} flex items-center justify-center`}
                title={day.guestName ? `${day.guestName} — ${statusLabels[day.status]}` : statusLabels[day.status]}
              >
                {day.status === "booked" && day.guestName && (
                  <span className="text-[10px] text-white font-medium truncate px-1">
                    {day.guestName.split(" ")[0]}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}

        {/* Legend */}
        <div className="flex gap-4 mt-3 pt-3 border-t border-neutral-100">
          {(["booked", "available", "blocked"] as const).map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded ${statusColors[s]}`} />
              <span className="text-xs text-neutral-500">{statusLabels[s]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
