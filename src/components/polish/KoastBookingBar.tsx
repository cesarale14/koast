"use client";

import Image from "next/image";
import { useState, type CSSProperties, type MouseEvent } from "react";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";

type Position = "standalone" | "start" | "middle" | "end";

// Alpha-baked platform backgrounds (per master plan principle 2).
// Keep element opacity untouched so the white label/logo stay crisp —
// bake the alpha into the background color instead.
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
  position: Position;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  selected?: boolean;
  className?: string;
  style?: CSSProperties;
  // Compact = mobile: no logo chip, tighter cap padding, smaller logo.
  compact?: boolean;
}

const RADIUS_START = 100;
const RADIUS_CONTINUE = 33;

function radiusFor(position: Position): string {
  switch (position) {
    case "standalone":
      return `${RADIUS_START}px`;
    case "start":
      return `${RADIUS_START}px ${RADIUS_CONTINUE}px ${RADIUS_CONTINUE}px ${RADIUS_START}px`;
    case "middle":
      return `${RADIUS_CONTINUE}px`;
    case "end":
      return `${RADIUS_CONTINUE}px ${RADIUS_START}px ${RADIUS_START}px ${RADIUS_CONTINUE}px`;
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

export function KoastBookingBar({
  platform,
  guest,
  checkIn,
  checkOut,
  position,
  onClick,
  selected,
  className = "",
  style,
  compact = false,
}: KoastBookingBarProps) {
  const config = PLATFORMS[platform];
  const showLabel = position === "start" || position === "standalone";
  const label = firstAndInitial(guest);
  const title = `${config.name} · ${label} · ${checkIn} → ${checkOut}`;
  // Desktop: 100px-radius cap on 48px-height bar renders a 24px semicircle;
  // inset content well past it so the logo sits in the pill's straight
  // portion. Mobile: shorter bar, tighter inset, no chip wrapper.
  const leftPad = compact
    ? position === "start" || position === "standalone" ? 14 : 8
    : position === "start" || position === "standalone" ? 56 : 12;
  const rightPad = compact
    ? position === "end" || position === "standalone" ? 14 : 8
    : position === "end" || position === "standalone" ? 56 : 12;
  const [hover, setHover] = useState(false);
  const tones = BAR_RGBA[platform];
  const background = selected ? tones.selected : hover ? tones.hover : tones.default;
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
        height: 48,
        borderRadius: radiusFor(position),
        background,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: `0 ${rightPad}px 0 ${leftPad}px`,
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "-0.005em",
        cursor: "pointer",
        border: "none",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        transition:
          "background-color 180ms cubic-bezier(0.4,0,0.2,1), transform 180ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 180ms cubic-bezier(0.4,0,0.2,1)",
        boxShadow: selected ? "0 4px 14px rgba(19,46,32,0.2)" : "none",
        ...style,
      }}
    >
      {showLabel && (
        <>
          {compact ? (
            <Image src={config.iconWhite} alt="" width={12} height={12} style={{ flexShrink: 0 }} />
          ) : (
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.22)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Image src={config.iconWhite} alt="" width={14} height={14} />
            </span>
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        </>
      )}
    </button>
  );
}

export default KoastBookingBar;
