/**
 * Official platform logos as inline SVGs.
 * Airbnb: Real Bélo (rausch) symbol from official brand assets
 * Booking.com: Official B. mark
 * VRBO: Official V mark
 */

const SIZES = { sm: 16, md: 24, lg: 32, xl: 40 } as const;
type Size = keyof typeof SIZES;

interface PlatformLogoProps {
  platform: string;
  size?: Size;
  className?: string;
  showLabel?: boolean;
}

/** Official Airbnb Bélo (rausch) symbol — extracted from brand SVG */
function AirbnbIcon({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 92 100" fill="#FF5A5F" xmlns="http://www.w3.org/2000/svg">
      <path d="M91.5,71c-0.5-1.2-1-2.5-1.5-3.6c-0.8-1.8-1.6-3.5-2.3-5.1l-0.1-0.1c-6.9-15-14.3-30.2-22.1-45.2l-0.3-0.6c-0.8-1.5-1.6-3.1-2.4-4.7c-1-1.8-2-3.7-3.6-5.5C56,2.2,51.4,0,46.5,0c-5,0-9.5,2.2-12.8,6c-1.5,1.8-2.6,3.7-3.6,5.5c-0.8,1.6-1.6,3.2-2.4,4.7l-0.3,0.6C19.7,31.8,12.2,47,5.3,62l-0.1,0.2c-0.7,1.6-1.5,3.3-2.3,5.1c-0.5,1.1-1,2.3-1.5,3.6c-1.3,3.7-1.7,7.2-1.2,10.8c1.1,7.5,6.1,13.8,13,16.6c2.6,1.1,5.3,1.6,8.1,1.6c0.8,0,1.8-0.1,2.6-0.2c3.3-0.4,6.7-1.5,10-3.4c4.1-2.3,8-5.6,12.4-10.4c4.4,4.8,8.4,8.1,12.4,10.4c3.3,1.9,6.7,3,10,3.4c0.8,0.1,1.8,0.2,2.6,0.2c2.8,0,5.6-0.5,8.1-1.6c7-2.8,11.9-9.2,13-16.6C93.2,78.2,92.8,74.7,91.5,71z M46.4,76.2c-5.4-6.8-8.9-13.2-10.1-18.6c-0.5-2.3-0.6-4.3-0.3-6.1c0.2-1.6,0.8-3,1.6-4.2c1.9-2.7,5.1-4.4,8.8-4.4c3.7,0,7,1.6,8.8,4.4c0.8,1.2,1.4,2.6,1.6,4.2c0.3,1.8,0.2,3.9-0.3,6.1C55.3,62.9,51.8,69.3,46.4,76.2z M86.3,80.9c-0.7,5.2-4.2,9.7-9.1,11.7c-2.4,1-5,1.3-7.6,1c-2.5-0.3-5-1.1-7.6-2.6c-3.6-2-7.2-5.1-11.4-9.7c6.6-8.1,10.6-15.5,12.1-22.1c0.7-3.1,0.8-5.9,0.5-8.5c-0.4-2.5-1.3-4.8-2.7-6.8c-3.1-4.5-8.3-7.1-14.1-7.1s-11,2.7-14.1,7.1c-1.4,2-2.3,4.3-2.7,6.8c-0.4,2.6-0.3,5.5,0.5,8.5c1.5,6.6,5.6,14.1,12.1,22.2c-4.1,4.6-7.8,7.7-11.4,9.7c-2.6,1.5-5.1,2.3-7.6,2.6c-2.7,0.3-5.3-0.1-7.6-1c-4.9-2-8.4-6.5-9.1-11.7c-0.3-2.5-0.1-5,0.9-7.8c0.3-1,0.8-2,1.3-3.2c0.7-1.6,1.5-3.3,2.3-5l0.1-0.2c6.9-14.9,14.3-30.1,22-44.9l0.3-0.6c0.8-1.5,1.6-3.1,2.4-4.6c0.8-1.6,1.7-3.1,2.8-4.4c2.1-2.4,4.9-3.7,8-3.7c3.1,0,5.9,1.3,8,3.7c1.1,1.3,2,2.8,2.8,4.4c0.8,1.5,1.6,3.1,2.4,4.6l0.3,0.6C67.7,34.8,75.1,50,82,64.9L82,65c0.8,1.6,1.5,3.4,2.3,5c0.5,1.2,1,2.2,1.3,3.2C86.4,75.8,86.7,78.3,86.3,80.9z"/>
    </svg>
  );
}

/** Booking.com "B." mark */
function BookingIcon({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="4" fill="#003580"/>
      <text x="5" y="18" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="16" fill="white">B.</text>
    </svg>
  );
}

/** VRBO — decorative serif "Vrbo" on blue. Matches the App Store icon style */
function VrboIcon({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="vrboGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4C7CEF"/>
          <stop offset="100%" stopColor="#1A4FD8"/>
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#vrboGrad)"/>
      <text x="16" y="22" fill="white" fontSize="14" fontWeight="700" fontFamily="Georgia,'Times New Roman',serif" textAnchor="middle" fontStyle="italic" letterSpacing="-0.5">Vrbo</text>
    </svg>
  );
}

const LABEL: Record<string, string> = {
  airbnb: "Airbnb", booking_com: "Booking.com", vrbo: "VRBO",
  ABB: "Airbnb", BDC: "Booking.com", VRBO: "VRBO",
};

const LABEL_COLOR: Record<string, string> = {
  airbnb: "text-[#FF5A5F]", booking_com: "text-[#003580]", vrbo: "text-[#0B4DA2]",
  ABB: "text-[#FF5A5F]", BDC: "text-[#003580]", VRBO: "text-[#0B4DA2]",
};

function resolve(platform: string) {
  const p = platform.toLowerCase();
  return {
    isAirbnb: p === "airbnb" || p === "abb",
    isBooking: p === "booking_com" || p === "booking.com" || p === "bdc",
    isVrbo: p === "vrbo" || p === "homeaway",
  };
}

export default function PlatformLogo({ platform, size = "md", className = "", showLabel = false }: PlatformLogoProps) {
  const s = SIZES[size];
  const { isAirbnb, isBooking, isVrbo } = resolve(platform);

  return (
    <span className={`inline-flex items-center gap-1.5 shrink-0 ${className}`}>
      {isAirbnb && <AirbnbIcon s={s} />}
      {isBooking && <BookingIcon s={s} />}
      {isVrbo && <VrboIcon s={s} />}
      {!isAirbnb && !isBooking && !isVrbo && (
        <span className="inline-flex items-center justify-center bg-neutral-200 text-neutral-500 font-bold rounded"
          style={{ width: s, height: s, fontSize: s * 0.5 }}>{platform.charAt(0).toUpperCase()}</span>
      )}
      {showLabel && <span className={`text-xs font-medium ${LABEL_COLOR[platform] ?? "text-neutral-600"}`}>{LABEL[platform] ?? platform}</span>}
    </span>
  );
}

/** Badge variant — logo + label in a light pill */
export function PlatformBadge({ platform, className = "" }: { platform: string; className?: string }) {
  const { isAirbnb, isBooking, isVrbo } = resolve(platform);
  const bg = isAirbnb ? "bg-red-50" : isBooking ? "bg-blue-50" : isVrbo ? "bg-indigo-50" : "bg-neutral-100";

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${bg} ${className}`}>
      <PlatformLogo platform={platform} size="sm" />
      <span className={`text-[10px] font-medium ${LABEL_COLOR[platform] ?? "text-neutral-600"}`}>
        {LABEL[platform] ?? platform}
      </span>
    </span>
  );
}
