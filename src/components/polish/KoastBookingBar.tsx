"use client";

import Image from "next/image";
import { type CSSProperties, type MouseEvent } from "react";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";

type Position = "standalone" | "start" | "middle" | "end";

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
}: KoastBookingBarProps) {
  const config = PLATFORMS[platform];
  const showLabel = position === "start" || position === "standalone";
  const label = firstAndInitial(guest);
  const title = `${config.name} · ${label} · ${checkIn} → ${checkOut}`;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`koast-booking-bar ${className}`}
      style={{
        width: "100%",
        height: 48,
        borderRadius: radiusFor(position),
        background: config.color,
        opacity: selected ? 0.95 : 0.7,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: showLabel ? "0 14px" : "0 10px",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "-0.005em",
        cursor: "pointer",
        border: "none",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        transition:
          "opacity 180ms cubic-bezier(0.4,0,0.2,1), transform 180ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 180ms cubic-bezier(0.4,0,0.2,1)",
        boxShadow: selected ? "0 4px 14px rgba(19,46,32,0.2)" : "none",
        ...style,
      }}
    >
      {showLabel && (
        <>
          <Image src={config.iconWhite} alt="" width={14} height={14} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        </>
      )}
    </button>
  );
}

export default KoastBookingBar;
