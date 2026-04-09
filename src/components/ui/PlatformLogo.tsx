/**
 * Real platform logos as inline SVGs — Airbnb Bélo, Booking.com B., VRBO V.
 * Usage: <PlatformLogo platform="airbnb" size="md" />
 */

const SIZES = { sm: 16, md: 24, lg: 32, xl: 40 } as const;
type Size = keyof typeof SIZES;

interface PlatformLogoProps {
  platform: string;
  size?: Size;
  className?: string;
  showLabel?: boolean;
}

/** Official Airbnb Bélo (rausch) symbol */
function AirbnbIcon({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 30 32" fill="#FF5A5F" xmlns="http://www.w3.org/2000/svg">
      <path d="M29.24 22.68c-.16-.39-.31-.8-.47-1.15-.13-.28-.25-.58-.38-.87l-.03-.06c-1.09-2.48-2.29-5.03-3.56-7.58-.17-.34-.35-.67-.52-1-.86-1.59-1.76-3.13-2.69-4.56a23.2 23.2 0 00-2.19-2.91A6.62 6.62 0 0014.7 2c-1.97 0-3.72.99-4.71 2.55a23.2 23.2 0 00-2.19 2.91c-.93 1.43-1.83 2.97-2.69 4.56-.17.33-.35.66-.52 1-1.27 2.55-2.47 5.1-3.56 7.58l-.03.06c-.13.29-.25.59-.38.87-.16.35-.31.76-.47 1.15-.33.87-.51 1.7-.51 2.52 0 1.85.72 3.48 2.05 4.58 1.18.98 2.67 1.5 4.32 1.5.33 0 .67-.03 1.02-.09a13.77 13.77 0 002.86-.81c1.33-.53 2.62-1.27 3.93-2.26a25.86 25.86 0 003.88-3.65 25.86 25.86 0 003.88 3.65c1.31.99 2.6 1.73 3.93 2.26.97.38 1.93.66 2.86.81.35.06.69.09 1.02.09 1.65 0 3.14-.52 4.32-1.5 1.33-1.1 2.05-2.73 2.05-4.58 0-.82-.18-1.65-.51-2.52zm-14.55 2.3a22.9 22.9 0 01-3.39-3.24c-1.16-1.36-2.05-2.73-2.55-3.94a6.25 6.25 0 01-.44-2.2c0-1.38.49-2.48 1.38-3.12.63-.45 1.37-.62 2.07-.48.96.19 1.73.83 2.26 1.47.3.36.56.73.77 1.06.21-.33.47-.7.77-1.06.53-.64 1.3-1.28 2.26-1.47.7-.14 1.44.03 2.07.48.89.64 1.38 1.74 1.38 3.12 0 .78-.15 1.52-.44 2.2-.5 1.21-1.39 2.58-2.55 3.94a22.9 22.9 0 01-3.39 3.24l-.1.08-.1-.08z"/>
    </svg>
  );
}

/** Booking.com official B. mark */
function BookingIcon({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#003580"/>
      <path d="M8 8h5.2c1.5 0 2.7.3 3.5 1 .7.6 1.1 1.4 1.1 2.4 0 .7-.2 1.3-.6 1.8-.4.5-.9.8-1.6 1v.1c.9.1 1.5.5 2 1 .5.6.7 1.3.7 2.1 0 1.1-.4 2-1.2 2.6-.8.7-1.9 1-3.2 1H8V8zm3 5.5h2.1c.7 0 1.2-.1 1.5-.4.3-.3.5-.7.5-1.2 0-.5-.2-.8-.5-1.1-.3-.2-.8-.4-1.5-.4H11v3.1zm0 5.9h2.4c.7 0 1.3-.2 1.7-.5.4-.3.5-.7.5-1.3 0-.5-.2-.9-.5-1.2-.4-.3-.9-.4-1.7-.4H11v3.4zM20.5 21.3c0-.5.4-.9.9-.9s.9.4.9.9-.4.9-.9.9-.9-.4-.9-.9z" fill="white"/>
    </svg>
  );
}

/** VRBO mark */
function VrboIcon({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#3C60FF"/>
      <path d="M7 10h3.2l2.8 8.5h.1L15.9 10h3.1l-4.6 12h-2.8L7 10zm11.8 0H22l1.7 8.5h.1L25.5 10h2.5l-3.2 12h-2.8L18.8 10z" fill="white"/>
    </svg>
  );
}

const LABEL: Record<string, string> = {
  airbnb: "Airbnb", booking_com: "Booking.com", vrbo: "VRBO",
  ABB: "Airbnb", BDC: "Booking.com", VRBO: "VRBO",
};

const LABEL_COLOR: Record<string, string> = {
  airbnb: "text-[#FF5A5F]", booking_com: "text-[#003580]", vrbo: "text-[#3C60FF]",
  ABB: "text-[#FF5A5F]", BDC: "text-[#003580]", VRBO: "text-[#3C60FF]",
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
