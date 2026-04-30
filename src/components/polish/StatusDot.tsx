"use client";

import { type CSSProperties } from "react";

type Tone = "ok" | "warn" | "alert" | "muted";

interface StatusDotProps {
  tone: Tone;
  size?: number;
  halo?: boolean;
  title?: string;
  style?: CSSProperties;
}

const COLOR: Record<Tone, string> = {
  ok: "var(--lagoon)",
  warn: "var(--amber-tide)",
  alert: "var(--coral-reef)",
  muted: "rgba(61, 107, 82, 0.4)",
};

const HALO: Record<Tone, string> = {
  ok: "rgba(26, 122, 90, 0.16)",
  warn: "rgba(212, 150, 11, 0.16)",
  alert: "rgba(196, 64, 64, 0.16)",
  muted: "rgba(61, 107, 82, 0.12)",
};

export default function StatusDot({ tone, size = 7, halo = false, title, style }: StatusDotProps) {
  return (
    <span
      role={title ? "status" : undefined}
      title={title}
      aria-label={title}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: COLOR[tone],
        boxShadow: halo ? `0 0 0 3px ${HALO[tone]}` : undefined,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
