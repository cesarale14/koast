"use client";

const platformColors: Record<string, string> = {
  airbnb: "#FF5A5F",
  vrbo: "#3B5998",
  booking_com: "#003580",
  booking: "#003580",
  direct: "#10B981",
};

export interface BookingBarData {
  id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  platform: string;
  total_price: number | null;
  num_guests: number | null;
  guest_email: string | null;
  guest_phone: string | null;
  status: string;
  notes: string | null;
  property_id: string;
}

interface BookingBarProps {
  booking: BookingBarData;
  startCol: number;
  span: number;
  onClick: (booking: BookingBarData) => void;
}

export default function BookingBar({ booking, startCol, span, onClick }: BookingBarProps) {
  const color = platformColors[booking.platform] ?? "#6B7280";
  const nights = (() => {
    const ci = Date.UTC(+booking.check_in.slice(0,4), +booking.check_in.slice(5,7)-1, +booking.check_in.slice(8,10));
    const co = Date.UTC(+booking.check_out.slice(0,4), +booking.check_out.slice(5,7)-1, +booking.check_out.slice(8,10));
    return Math.round((co - ci) / 86400000);
  })();
  const firstName = booking.guest_name?.split(" ")[0] ?? "Guest";

  // Airbnb-style positioning:
  // Start at 50% of check-in cell (afternoon arrival)
  // End at 50% of check-out cell (morning departure)
  const cellWidth = 80;
  const barLeft = startCol * cellWidth + cellWidth / 2;
  const barWidth = span * cellWidth;

  return (
    <div
      className="absolute top-1 bottom-1 cursor-pointer flex items-center gap-1.5 px-2.5 text-white text-xs font-medium rounded-lg shadow-sm hover:shadow-md hover:brightness-110 transition-all overflow-hidden whitespace-nowrap z-10"
      style={{
        left: `${barLeft}px`,
        width: `${Math.max(barWidth - 2, 20)}px`,
        backgroundColor: color,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(booking);
      }}
      title={`${booking.guest_name} · ${nights} night${nights !== 1 ? "s" : ""} · ${booking.platform}`}
    >
      <span className="truncate">{firstName}</span>
      <span className="text-white/70 text-[10px] flex-shrink-0">{nights}n</span>
    </div>
  );
}
