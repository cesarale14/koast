"use client";

import PlatformLogo from "@/components/ui/PlatformLogo";

const platformColors: Record<string, string> = {
  airbnb: "#FF5A5F",
  vrbo: "#3B5998",
  booking_com: "var(--booking-com)",
  booking: "var(--booking-com)",
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
  left: number;
  width: number;
  hasFollower?: boolean;
  hasPredecessor?: boolean;
  onClick: (booking: BookingBarData) => void;
}

export default function BookingBar({ booking, left, width, hasFollower, hasPredecessor, onClick }: BookingBarProps) {
  const color = platformColors[booking.platform] ?? "#6B7280";
  const nights = (() => {
    const ci = Date.UTC(+booking.check_in.slice(0, 4), +booking.check_in.slice(5, 7) - 1, +booking.check_in.slice(8, 10));
    const co = Date.UTC(+booking.check_out.slice(0, 4), +booking.check_out.slice(5, 7) - 1, +booking.check_out.slice(8, 10));
    return Math.round((co - ci) / 86400000);
  })();
  const rawName = booking.guest_name?.split(" ")[0] ?? "";
  const firstName = rawName && rawName !== "Airbnb" && rawName !== "Guest" ? rawName : "Booked";

  return (
    <div
      className="absolute cursor-pointer flex items-center gap-1.5 px-2.5 text-white text-xs font-medium shadow-sm hover:shadow-md hover:brightness-110 transition-all overflow-hidden whitespace-nowrap z-10"
      style={{
        left: `${left}px`,
        width: `${Math.max(width, 20)}px`,
        top: "18px",
        height: "28px",
        backgroundColor: color,
        borderTopLeftRadius: "14px",
        borderBottomLeftRadius: "14px",
        borderTopRightRadius: "14px",
        borderBottomRightRadius: "14px",
        // Slight opacity on the checkout tail when no follower — morning
        // checkout visual. When there's a follower (turnover), keep full
        // opacity so the two bars blend cleanly at the overlap seam.
        opacity: hasFollower ? 1 : 0.95,
        // Let a turnover check-in / non-turnover checkout visually separate
        // via a subtle inner shadow on the meeting edge.
        boxShadow: hasPredecessor
          ? "inset 2px 0 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.15)"
          : "0 1px 2px rgba(0,0,0,0.15)",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(booking);
      }}
      title={`${booking.guest_name} · ${nights} night${nights !== 1 ? "s" : ""} · ${booking.platform}`}
    >
      <span className="inline-flex items-center justify-center bg-white rounded-full flex-shrink-0" style={{ width: 18, height: 18 }}>
        <PlatformLogo platform={booking.platform} size="sm" />
      </span>
      <span className="truncate">{firstName}</span>
      <span className="text-white/70 text-[10px] flex-shrink-0">{nights}n</span>
    </div>
  );
}
