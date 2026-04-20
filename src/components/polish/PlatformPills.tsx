"use client";

/**
 * PlatformPills — the unified brand-colored-tile row shown on property
 * cards (Dashboard + Properties list converging on the same visual).
 *
 * Spec Correction 33: 22×22 tile, 6px radius, brand color at 75%
 * alpha bg, 1px white inset border (20% alpha), 12×12 white-
 * silhouette logo centered, 8-digit-hex alpha bumps to 85% on hover.
 * No scale, no shadow — the popover that lands in Session 7 owns the
 * interactive visual.
 *
 * Logo + color sourced from src/lib/platforms.ts (DESIGN_SYSTEM.md
 * Section 8: platform logos + colors live there, never hardcoded).
 */

import Image from "next/image";
import { useState } from "react";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";

export type ConnectedPlatform = "airbnb" | "booking" | "direct";

const ORDER: ConnectedPlatform[] = ["airbnb", "booking", "direct"];

// Map the Dashboard card enum to the canonical PLATFORMS key.
const TO_PLATFORM_KEY: Record<ConnectedPlatform, PlatformKey> = {
  airbnb: "airbnb",
  booking: "booking_com",
  direct: "direct",
};

interface PlatformPillsProps {
  platforms: ConnectedPlatform[] | null | undefined;
}

export default function PlatformPills({ platforms }: PlatformPillsProps) {
  const ordered = (platforms ?? [])
    .filter((p, i, arr) => arr.indexOf(p) === i)
    .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

  if (ordered.length === 0) {
    return (
      <span
        style={{
          fontSize: 11,
          fontStyle: "italic",
          color: "var(--tideline)",
          padding: "3px 10px",
          borderRadius: 999,
          border: "1px solid var(--dry-sand)",
          background: "#fff",
          display: "inline-block",
        }}
      >
        No channels
      </span>
    );
  }

  return (
    <div role="list" style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {ordered.map((p) => (
        <PlatformTile key={p} platform={p} />
      ))}
    </div>
  );
}

function PlatformTile({ platform }: { platform: ConnectedPlatform }) {
  const config = PLATFORMS[TO_PLATFORM_KEY[platform]];
  const [hover, setHover] = useState(false);
  // 75%/85% alpha on the brand tile color. 8-digit hex is the same
  // pattern used by the inline Properties-list JSX (`${color}bf`),
  // keeping both surfaces byte-for-byte identical.
  const bg = `${config.tileColor}${hover ? "d9" : "bf"}`;
  return (
    <span
      role="listitem"
      aria-label={`Connected on ${config.name}`}
      title={config.name}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        backgroundColor: bg,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.2)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background-color 180ms ease",
      }}
    >
      <Image src={config.iconWhite} alt="" width={12} height={12} />
    </span>
  );
}
