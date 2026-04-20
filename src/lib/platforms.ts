// Canonical platform icon + color config. All components MUST read from this
// file — never hardcode `/icons/platforms/...` paths or platform brand colors
// in components. See DESIGN_SYSTEM.md Section 8.

export const PLATFORMS = {
  airbnb: {
    name: "Airbnb",
    color: "#FF385C",
    colorLight: "rgba(255,56,92,0.1)",
    // tileColor backs the 22×22 brand-colored tile used on Dashboard
    // + Properties cards. For Airbnb + Booking.com it matches `color`;
    // for Direct we override to Koast deep-sea (the 'Direct' tile is
    // a Koast moment, not a golden-accent surface — see Spec Correction 33).
    tileColor: "#FF385C",
    icon: "/icons/platforms/airbnb.svg",
    iconWhite: "/icons/platforms/airbnb-white.svg",
    tile: "/icons/platforms/airbnb-tile.svg",
  },
  booking_com: {
    name: "Booking.com",
    color: "#003580",
    colorLight: "rgba(0,53,128,0.1)",
    tileColor: "#003580",
    icon: "/icons/platforms/booking-com.svg",
    iconWhite: "/icons/platforms/booking-com-white.svg",
    tile: "/icons/platforms/booking-com-tile.svg",
  },
  // VRBO intentionally omitted — no properties use it today, and the
  // brand SVG assets are not in public/icons/platforms/. Re-add when
  // the real logo set lands. platformKeyFrom still accepts "HMA"/"vrbo"
  // aliases and returns null so DB rows with those codes don't crash.
  direct: {
    name: "Direct",
    color: "#c49a5a",
    colorLight: "rgba(196,154,90,0.1)",
    tileColor: "#132e20",
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
  if (c === "vrbo" || c === "hma") return null; // VRBO dropped from PLATFORMS; alias still accepted, returns null
  if (c === "direct" || c === "koast") return "direct";
  return null;
}
