"use client";

import { type HTMLAttributes } from "react";

type Variant = "hero" | "selected" | "inline" | "quiet" | "struck";
type Tone = "light" | "dark";

interface KoastRateProps extends HTMLAttributes<HTMLSpanElement> {
  value: number | null | undefined;
  variant?: Variant;
  delta?: number | null;
  currency?: string;
  tone?: Tone;
}

interface VariantSpec {
  size: number;
  weight: number;
  color: string;
  lineHeight: string;
  tracking: string;
  opacity?: number;
  strike?: boolean;
}

function variantSpec(variant: Variant, tone: Tone): VariantSpec {
  const primary = tone === "dark" ? "var(--shore)" : "var(--coastal)";
  const quiet = tone === "dark" ? "rgba(247,243,236,0.72)" : "var(--tideline)";
  switch (variant) {
    case "hero":
      return { size: 48, weight: 700, color: primary, lineHeight: "1.15", tracking: "-0.02em" };
    case "selected":
      return { size: 32, weight: 600, color: primary, lineHeight: "1.15", tracking: "-0.02em" };
    case "inline":
      return { size: 14, weight: 500, color: primary, lineHeight: "1.3", tracking: "0" };
    case "quiet":
      return { size: 14, weight: 400, color: quiet, lineHeight: "1.3", tracking: "0" };
    case "struck":
      return { size: 14, weight: 400, color: quiet, lineHeight: "1.3", tracking: "0", opacity: 0.6, strike: true };
  }
}

const NUMBER_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function fmt(n: number | null | undefined, currency: string): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${currency}${NUMBER_FMT.format(Math.round(n))}`;
}

// Spec (master plan principle 4): color encodes semantic, never fear.
// Positive delta = Koast-initiated upside = gold + up-triangle.
// Negative delta = "ease to stay competitive" = quiet tideline + quiet
// down-triangle. Zero = em-dash in the quiet color. Never red.
function renderDelta(delta: number, currency: string, tone: Tone) {
  const quiet = tone === "dark" ? "rgba(247,243,236,0.72)" : "var(--tideline)";
  const baseStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.005em",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };
  if (delta === 0) {
    return <span style={{ ...baseStyle, color: quiet }}>—</span>;
  }
  const mag = NUMBER_FMT.format(Math.abs(Math.round(delta)));
  if (delta > 0) {
    return (
      <span style={{ ...baseStyle, color: "var(--golden)" }}>
        <span style={{ fontSize: 10, lineHeight: 1 }}>▲</span>
        {currency}{mag}
      </span>
    );
  }
  return (
    <span style={{ ...baseStyle, color: quiet }}>
      <span style={{ fontSize: 10, lineHeight: 1, opacity: 0.8 }}>▼</span>
      {currency}{mag}
    </span>
  );
}

export function KoastRate({
  value,
  variant = "inline",
  delta,
  currency = "$",
  tone = "light",
  className = "",
  style,
  ...rest
}: KoastRateProps) {
  const v = variantSpec(variant, tone);
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
      {delta !== undefined && delta !== null && renderDelta(delta, currency, tone)}
    </span>
  );
}

export default KoastRate;
