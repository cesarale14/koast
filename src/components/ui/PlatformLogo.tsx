/**
 * Inline SVG platform logos — never break from external URL changes.
 * Usage: <PlatformLogo platform="airbnb" size="md" />
 */

const SIZES = { sm: 16, md: 24, lg: 32 } as const;
type Size = keyof typeof SIZES;

interface PlatformLogoProps {
  platform: string;
  size?: Size;
  className?: string;
  showLabel?: boolean;
}

function AirbnbIcon({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 1C7.716 1 1 7.716 1 16s6.716 15 15 15 15-6.716 15-15S24.284 1 16 1z" fill="#FF5A5F"/>
      <path d="M16.004 20.486c-1.236-1.588-1.982-3.162-2.24-4.274a5.18 5.18 0 01-.128-1.274c0-1.162.442-2.148 1.208-2.704.584-.422 1.256-.548 1.81-.388.752.216 1.298.87 1.576 1.444.278-.574.824-1.228 1.576-1.444.554-.16 1.228-.034 1.81.388.766.556 1.208 1.542 1.208 2.704 0 .448-.046.864-.128 1.274-.258 1.112-1.004 2.686-2.24 4.274-.796 1.022-1.604 1.892-2.226 2.514-.622-.622-1.43-1.492-2.226-2.514zm6.782-6.652c0-1.67-.642-3.076-1.76-3.884-.77-.556-1.718-.748-2.634-.532-.62.146-1.166.462-1.61.844a4.748 4.748 0 00-.778.87 4.748 4.748 0 00-.778-.87c-.444-.382-.99-.698-1.61-.844-.916-.216-1.864-.024-2.634.532-1.118.808-1.76 2.214-1.76 3.884 0 .578.06 1.126.172 1.644.318 1.384 1.178 3.174 2.562 4.952 1.122 1.444 2.254 2.572 2.8 3.076l.038.036.05.046c.164.152.386.236.614.236.266 0 .494-.112.656-.27l.044-.042.046-.044c.544-.502 1.674-1.628 2.796-3.07 1.384-1.778 2.244-3.568 2.562-4.952.112-.506.172-1.054.172-1.632z" fill="white"/>
    </svg>
  );
}

function BookingIcon({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#003580"/>
      <text x="6" y="23" fill="white" fontSize="18" fontWeight="bold" fontFamily="Arial, sans-serif">B.</text>
    </svg>
  );
}

function VrboIcon({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#6B5CE7"/>
      <text x="5" y="23" fill="white" fontSize="18" fontWeight="bold" fontFamily="Arial, sans-serif">V</text>
    </svg>
  );
}

const LABEL: Record<string, string> = {
  airbnb: "Airbnb",
  booking_com: "Booking.com",
  vrbo: "VRBO",
  ABB: "Airbnb",
  BDC: "Booking.com",
  VRBO: "VRBO",
};

const LABEL_COLOR: Record<string, string> = {
  airbnb: "text-[#FF5A5F]",
  booking_com: "text-[#003580]",
  vrbo: "text-[#6B5CE7]",
  ABB: "text-[#FF5A5F]",
  BDC: "text-[#003580]",
  VRBO: "text-[#6B5CE7]",
};

export default function PlatformLogo({ platform, size = "md", className = "", showLabel = false }: PlatformLogoProps) {
  const s = SIZES[size];
  const p = platform.toLowerCase();
  const isAirbnb = p === "airbnb" || p === "abb";
  const isBooking = p === "booking_com" || p === "booking.com" || p === "bdc";
  const isVrbo = p === "vrbo" || p === "homeaway";

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {isAirbnb && <AirbnbIcon s={s} />}
      {isBooking && <BookingIcon s={s} />}
      {isVrbo && <VrboIcon s={s} />}
      {!isAirbnb && !isBooking && !isVrbo && (
        <span className="inline-flex items-center justify-center bg-neutral-200 text-neutral-500 font-bold rounded"
          style={{ width: s, height: s, fontSize: s * 0.5 }}>
          {platform.charAt(0).toUpperCase()}
        </span>
      )}
      {showLabel && <span className={`text-xs font-medium ${LABEL_COLOR[platform] ?? "text-neutral-600"}`}>{LABEL[platform] ?? platform}</span>}
    </span>
  );
}

/** Badge variant — logo + label in a light pill */
export function PlatformBadge({ platform, className = "" }: { platform: string; className?: string }) {
  const p = platform.toLowerCase();
  const isAirbnb = p === "airbnb" || p === "abb";
  const isBooking = p === "booking_com" || p === "bdc";
  const isVrbo = p === "vrbo";
  const bg = isAirbnb ? "bg-red-50" : isBooking ? "bg-blue-50" : isVrbo ? "bg-purple-50" : "bg-neutral-100";

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${bg} ${className}`}>
      <PlatformLogo platform={platform} size="sm" />
      <span className={`text-[10px] font-medium ${LABEL_COLOR[platform] ?? "text-neutral-600"}`}>
        {LABEL[platform] ?? platform}
      </span>
    </span>
  );
}
