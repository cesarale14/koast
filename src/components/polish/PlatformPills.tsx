"use client";

/**
 * PlatformPills — small 22x22 pill row showing which channels a
 * property is synced to. Non-interactive in this session. Uses the
 * canonical platform SVGs under /public/icons/platforms/ via
 * src/lib/platforms.ts (DESIGN_SYSTEM.md rule: never approximate
 * logos with custom glyphs).
 */

import Image from "next/image";
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
  const isEmpty = ordered.length === 0;

  if (isEmpty) {
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
    <div role="list" style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {ordered.map((p) => {
        const config = PLATFORMS[TO_PLATFORM_KEY[p]];
        return (
          <span
            key={p}
            role="listitem"
            aria-label={`Connected on ${config.name}`}
            title={config.name}
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: "1px solid var(--dry-sand)",
              background: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 5,
              transition: "border-color 180ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLSpanElement).style.borderColor = "var(--driftwood)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLSpanElement).style.borderColor = "var(--dry-sand)";
            }}
          >
            <Image src={config.icon} alt="" width={18} height={18} />
          </span>
        );
      })}
    </div>
  );
}
