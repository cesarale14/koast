"use client";

import { type CSSProperties } from "react";

type Size = "sm" | "md";

interface Option {
  value: string;
  label: string;
}

interface KoastSegmentedControlProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  size?: Size;
  ariaLabel?: string;
}

const SIZE: Record<Size, { height: number; padX: number; fontSize: number }> = {
  sm: { height: 30, padX: 12, fontSize: 12 },
  md: { height: 36, padX: 18, fontSize: 13 },
};

// Segmented pill toggle — same pattern as PropertyDetail's tab strip
// (Session 2.8). Binary/ternary choices; reuse instead of building
// bespoke pill groups.
export default function KoastSegmentedControl({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
}: KoastSegmentedControlProps) {
  const s = SIZE[size];
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 4,
        borderRadius: 999,
        background: "var(--shore-soft)",
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            style={buttonStyle(active, s)}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.background = "rgba(23,57,42,0.04)";
                e.currentTarget.style.color = "var(--coastal)";
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--tideline)";
              }
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function buttonStyle(active: boolean, s: { height: number; padX: number; fontSize: number }): CSSProperties {
  return {
    height: s.height,
    padding: `0 ${s.padX}px`,
    borderRadius: 999,
    border: "none",
    background: active ? "#fff" : "transparent",
    color: active ? "var(--coastal)" : "var(--tideline)",
    fontSize: s.fontSize,
    fontWeight: active ? 600 : 500,
    letterSpacing: "-0.005em",
    cursor: "pointer",
    boxShadow: active ? "0 1px 3px rgba(19,46,32,0.08)" : "none",
    transition:
      "background-color 160ms cubic-bezier(0.4,0,0.2,1), color 160ms cubic-bezier(0.4,0,0.2,1), box-shadow 160ms cubic-bezier(0.4,0,0.2,1)",
  };
}
