"use client";

import { type HTMLAttributes, type ReactNode } from "react";

type Variant = "neutral" | "success" | "warning" | "danger" | "koast";

interface KoastChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  iconLeft?: ReactNode;
}

function styleFor(variant: Variant): React.CSSProperties {
  switch (variant) {
    case "neutral":
      return { border: "1px solid #E5E2DC", color: "var(--tideline)", background: "#fff" };
    case "success":
      return { color: "var(--lagoon)", background: "rgba(26,122,90,0.1)" };
    case "warning":
      return { color: "var(--amber-tide)", background: "rgba(212,150,11,0.1)" };
    case "danger":
      return { color: "var(--coral-reef)", background: "rgba(196,64,64,0.1)" };
    case "koast":
      return { color: "var(--golden)", background: "rgba(196,154,90,0.1)" };
  }
}

export function KoastChip({ variant = "neutral", iconLeft, style, className = "", children, ...rest }: KoastChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 font-semibold ${className}`}
      style={{
        height: 24,
        fontSize: 12,
        borderRadius: 999,
        letterSpacing: "-0.005em",
        ...styleFor(variant),
        ...style,
      }}
      {...rest}
    >
      {iconLeft && <span className="inline-flex items-center justify-center" style={{ width: 12, height: 12 }}>{iconLeft}</span>}
      {children}
    </span>
  );
}

export default KoastChip;
