"use client";

import { type HTMLAttributes } from "react";

type Variant = "hero" | "selected" | "inline" | "quiet" | "struck";

interface KoastRateProps extends HTMLAttributes<HTMLSpanElement> {
  value: number | null | undefined;
  variant?: Variant;
  delta?: number | null;
  currency?: string;
}

const variantMap: Record<Variant, { size: number; weight: number; color: string; lineHeight: string; tracking: string; opacity?: number; strike?: boolean }> = {
  hero: { size: 48, weight: 700, color: "var(--coastal)", lineHeight: "1.15", tracking: "-0.02em" },
  selected: { size: 32, weight: 600, color: "var(--coastal)", lineHeight: "1.15", tracking: "-0.02em" },
  inline: { size: 14, weight: 500, color: "var(--coastal)", lineHeight: "1.3", tracking: "0" },
  quiet: { size: 14, weight: 400, color: "var(--tideline)", lineHeight: "1.3", tracking: "0" },
  struck: { size: 14, weight: 400, color: "var(--tideline)", lineHeight: "1.3", tracking: "0", opacity: 0.6, strike: true },
};

function fmt(n: number | null | undefined, currency: string): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${currency}${Math.round(n)}`;
}

export function KoastRate({ value, variant = "inline", delta, currency = "$", className = "", style, ...rest }: KoastRateProps) {
  const v = variantMap[variant];
  return (
    <span className={`inline-flex items-baseline gap-2 ${className}`} {...rest}>
      <span
        style={{
          fontSize: v.size,
          fontWeight: v.weight,
          color: v.color,
          lineHeight: v.lineHeight,
          letterSpacing: v.tracking,
          fontVariantNumeric: "tabular-nums",
          opacity: v.opacity,
          textDecoration: v.strike ? "line-through" : undefined,
          ...style,
        }}
      >
        {fmt(value, currency)}
      </span>
      {delta !== undefined && delta !== null && delta !== 0 && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: delta > 0 ? "var(--golden)" : "var(--tideline)",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.005em",
          }}
        >
          {delta > 0 ? "▲" : "▼"} {currency}{Math.abs(Math.round(delta))}
        </span>
      )}
    </span>
  );
}

export default KoastRate;
