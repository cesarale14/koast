// Canonical platform icon + color config. All components MUST read from this
// file — never hardcode `/icons/platforms/...` paths or platform brand colors
// in components. See DESIGN_SYSTEM.md Section 8.

export const PLATFORMS = {
  airbnb: {
    name: "Airbnb",
    color: "#FF385C",
    colorLight: "rgba(255,56,92,0.1)",
    icon: "/icons/platforms/airbnb.svg",
    iconWhite: "/icons/platforms/airbnb-white.svg",
    tile: "/icons/platforms/airbnb-tile.svg",
  },
  booking_com: {
    name: "Booking.com",
    color: "#003580",
    colorLight: "rgba(0,53,128,0.1)",
    icon: "/icons/platforms/booking-com.svg",
    iconWhite: "/icons/platforms/booking-com-white.svg",
    tile: "/icons/platforms/booking-com-tile.svg",
  },
  vrbo: {
    name: "VRBO",
    color: "#3145F5",
    colorLight: "rgba(49,69,245,0.1)",
    icon: "/icons/platforms/vrbo.svg",
    iconWhite: "/icons/platforms/vrbo-white.svg",
    tile: "/icons/platforms/vrbo-tile.svg",
  },
  direct: {
    name: "Direct",
    color: "#c49a5a",
    colorLight: "rgba(196,154,90,0.1)",
    icon: "/icons/platforms/koast-tile.svg",
    iconWhite: "/icons/platforms/koast-tile.svg",
    tile: "/icons/platforms/koast-tile.svg",
  },
} as const;

export type PlatformKey = keyof typeof PLATFORMS;

// Normalizes the many platform identifiers used across Channex, iCal, and
// legacy DB rows (ABB, BDC, "booking", etc) into the canonical PlatformKey.
export function platformKeyFrom(code: string | null | undefined): PlatformKey | null {
  if (!code) return null;
  const c = code.toLowerCase().trim();
  if (c === "airbnb" || c === "abb") return "airbnb";
  if (c === "booking_com" || c === "booking-com" || c === "booking.com" || c === "booking" || c === "bdc") return "booking_com";
  if (c === "vrbo" || c === "hma") return "vrbo";
  if (c === "direct" || c === "koast") return "direct";
  return null;
}
