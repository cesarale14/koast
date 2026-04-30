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

interface BookingSpan {
  startIdx: number;
  endIdx: number;
  guestName: string;
}

const platformColor = "var(--coastal)";

/** Group consecutive booked days with same guest into spans */
function getBookingSpans(days: PropertyWeek["days"]): BookingSpan[] {
  const spans: BookingSpan[] = [];
  let current: BookingSpan | null = null;

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (day.status === "booked" && day.guestName) {
      if (current && current.guestName === day.guestName) {
        current.endIdx = i;
      } else {
        if (current) spans.push(current);
        current = { startIdx: i, endIdx: i, guestName: day.guestName };
      }
    } else {
      if (current) { spans.push(current); current = null; }
    }
  }
  if (current) spans.push(current);
  return spans;
}

export default function WeekCalendar({ days, properties }: WeekCalendarProps) {
  if (properties.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-neutral-400 text-sm">
        Add properties to see your weekly availability.
      </div>
    );
  }

  const colCount = days.length;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Day headers */}
        <div className="grid gap-0 mb-2" style={{ gridTemplateColumns: `140px repeat(${colCount}, 1fr)` }}>
          <div />
          {days.map((d) => (
            <div
              key={d.date}
              className={`text-center text-xs py-1 ${
                d.isToday ? "text-coastal font-semibold" : "text-neutral-400"
              }`}
            >
              <div>{d.dayLabel}</div>
              <div className={`text-lg font-semibold ${d.isToday ? "text-coastal" : "text-neutral-700"}`}>
                {d.dayNum}
              </div>
            </div>
          ))}
        </div>

        {/* Property rows with continuous booking bars */}
        {properties.map((prop) => {
          const spans = getBookingSpans(prop.days);

          return (
            <div
              key={prop.propertyId}
              className="grid gap-0 mb-1 relative"
              style={{
                gridTemplateColumns: `140px repeat(${colCount}, 1fr)`,
                height: "36px",
              }}
            >
              <div className="text-sm font-medium text-neutral-700 truncate flex items-center">
                {prop.propertyName}
              </div>

              {/* Background cells */}
              {prop.days.map((day) => (
                <div
                  key={day.date}
                  className={`h-full rounded-sm ${
                    day.status === "blocked" ? "bg-neutral-100" : "bg-neutral-50"
                  }`}
                  title={day.guestName ? `${day.guestName}` : day.status}
                />
              ))}

              {/* Booking spans overlaid */}
              {spans.map((span, si) => {
                // Calculate position relative to grid
                // Column 0 = property name, booking columns start at 1
                const colStart = span.startIdx + 2; // +2 because grid is 1-indexed and first col is name
                const colSpan = span.endIdx - span.startIdx + 1;
                const firstName = span.guestName.split(" ")[0];

                return (
                  <div
                    key={si}
                    className="absolute flex items-center px-2 text-white text-[10px] font-medium rounded-md overflow-hidden whitespace-nowrap"
                    style={{
                      gridColumn: `${colStart} / span ${colSpan}`,
                      // Position using CSS calc based on grid
                      left: `calc(140px + ${(span.startIdx * 100) / colCount}% * (100% - 140px) / 100%)`,
                      width: `calc(${(colSpan * 100) / colCount}% * (100% - 140px) / 100%)`,
                      top: "4px",
                      bottom: "4px",
                      backgroundColor: platformColor,
                    }}
                  >
                    <span className="truncate">{firstName}</span>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Legend */}
        <div className="flex gap-4 mt-3 pt-3 border-t border-neutral-100">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: platformColor }} />
            <span className="text-xs text-neutral-500">Booked</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-neutral-50" />
            <span className="text-xs text-neutral-500">Open</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-neutral-100" />
            <span className="text-xs text-neutral-500">Blocked</span>
          </div>
        </div>
      </div>
    </div>
  );
}
