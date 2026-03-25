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
  const nights = Math.round(
    (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / 86400000
  );
  const firstName = booking.guest_name?.split(" ")[0] ?? "Guest";

  return (
    <div
      className="absolute top-1 bottom-1 cursor-pointer flex items-center px-2 text-white text-xs font-medium rounded-md shadow-sm hover:shadow-md transition-shadow overflow-hidden whitespace-nowrap z-10"
      style={{
        left: `${startCol * 80}px`,
        width: `${span * 80 - 4}px`,
        backgroundColor: color,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(booking);
      }}
      title={`${booking.guest_name} · ${nights}n · ${booking.platform}`}
    >
      <span className="truncate">
        {firstName} · {nights}n
      </span>
    </div>
  );
}
