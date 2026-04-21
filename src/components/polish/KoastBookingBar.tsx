"use client";

import Image from "next/image";
import { useState, type CSSProperties, type MouseEvent } from "react";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";

// New (Apr 21) API modeled on Airbnb's multicalendar mechanic:
//   - `borderRadius` drives the pill cap shape (both/left/right/none).
//   - `hasSeam` adds a 1.33px solid white left border where this pill
//     sits on top of a preceding pill's tail (same-day turnover).
// The old `position` prop is preserved as an alias that maps to the
// new shapes so existing callers (Calendar's WeekRow) can transition
// incrementally.

type Position = "standalone" | "start" | "middle" | "end";
type BarBorderRadius = "both" | "left" | "right" | "none";

// Alpha-baked platform backgrounds (per master plan principle 2).
const BAR_RGBA: Record<PlatformKey, { default: string; hover: string; selected: string }> = {
  airbnb: {
    default: "rgba(255, 56, 92, 0.70)",
    hover: "rgba(255, 56, 92, 0.85)",
    selected: "rgba(255, 56, 92, 0.95)",
  },
  booking_com: {
    default: "rgba(0, 53, 128, 0.70)",
    hover: "rgba(0, 53, 128, 0.85)",
    selected: "rgba(0, 53, 128, 0.95)",
  },
  direct: {
    default: "rgba(196, 154, 90, 0.70)",
    hover: "rgba(196, 154, 90, 0.85)",
    selected: "rgba(196, 154, 90, 0.95)",
  },
};

interface KoastBookingBarProps {
  platform: PlatformKey;
  guest: string | null;
  checkIn: string;
  checkOut: string;
  /** Legacy prop preserved for inline mockups / non-calendar callers. */
  position?: Position;
  /** Preferred — matches Calendar segment's shape exactly. */
  borderRadius?: BarBorderRadius;
  /** When true, add the 1.33px white left border (turnover seam). */
  hasSeam?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  selected?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Compact = mobile rendering (tighter padding, smaller icon). */
  compact?: boolean;
}

function positionToRadius(position: Position): BarBorderRadius {
  switch (position) {
    case "standalone":
      return "both";
    case "start":
      return "left";
    case "middle":
      return "none";
    case "end":
      return "right";
  }
}

function radiusCss(shape: BarBorderRadius): string {
  switch (shape) {
    case "both":
      return "100px";
    case "left":
      return "100px 0 0 100px";
    case "right":
      return "0 100px 100px 0";
    case "none":
      return "0";
  }
}

function firstAndInitial(name: string | null): string {
  if (!name) return "Guest";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "Guest";
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return last ? `${first} ${last}.` : first;
}

const SUBTLE_BORDER = "1px solid rgba(255,255,255,0.18)";

export function KoastBookingBar({
  platform,
  guest,
  checkIn,
  checkOut,
  position,
  borderRadius: borderRadiusProp,
  hasSeam = false,
  onClick,
  selected,
  className = "",
  style,
  compact = false,
}: KoastBookingBarProps) {
  const shape: BarBorderRadius = borderRadiusProp ?? (position ? positionToRadius(position) : "both");
  const config = PLATFORMS[platform];
  const showLabel = shape === "left" || shape === "both";
  const label = firstAndInitial(guest);
  const title = `${config.name} · ${label} · ${checkIn} → ${checkOut}`;
  const hPad = compact ? 10 : 14;
  const [hover, setHover] = useState(false);
  const tones = BAR_RGBA[platform];
  const background = selected ? tones.selected : hover ? tones.hover : tones.default;

  // Subtle border on every non-flat, non-seam edge. Flat edges (where
  // the pill continues into another cell) stay borderless; the seam
  // overrides the left border with a hard white hairline.
  const hasLeftRound = shape === "both" || shape === "right";
  const hasRightRound = shape === "both" || shape === "left";
  const borderLeft = hasSeam
    ? "1.33px solid #ffffff"
    : hasLeftRound
    ? SUBTLE_BORDER
    : "none";
  const borderRight = hasRightRound ? SUBTLE_BORDER : "none";

  const iconSize = compact ? 20 : 34;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      aria-label={title}
      className={`koast-booking-bar ${className}`}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: radiusCss(shape),
        background,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: `0 ${hPad}px`,
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "-0.005em",
        cursor: "pointer",
        border: "none",
        borderTop: SUBTLE_BORDER,
        borderBottom: SUBTLE_BORDER,
        borderLeft,
        borderRight,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        transition: "background-color 180ms cubic-bezier(0.4,0,0.2,1)",
        boxShadow: "none",
        ...style,
      }}
    >
      {showLabel && (
        <>
          <span
            aria-hidden
            style={{
              width: iconSize,
              height: iconSize,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Image
              src={config.iconWhite}
              alt=""
              width={Math.round(iconSize * 0.55)}
              height={Math.round(iconSize * 0.55)}
            />
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        </>
      )}
    </button>
  );
}

export default KoastBookingBar;
