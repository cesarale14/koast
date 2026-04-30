"use client";

import { forwardRef, type HTMLAttributes } from "react";

type Variant = "default" | "elevated" | "quiet" | "dark";

interface KoastCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  padding?: number;
}

function styleFor(variant: Variant, padding?: number): React.CSSProperties {
  const p = padding ?? (variant === "elevated" ? 24 : 20);
  switch (variant) {
    case "default":
      return { background: "#fff", padding: p };
    case "elevated":
      return {
        background: "#fff",
        border: "1px solid var(--hairline)",
        borderRadius: 16,
        padding: p,
      };
    case "quiet":
      return { background: "#FAFAF7", borderRadius: 12, padding: p };
    case "dark":
      return {
        background: "var(--coastal)",
        color: "var(--shore)",
        borderRadius: 16,
        padding: p,
        position: "relative",
        overflow: "hidden",
      };
  }
}

export const KoastCard = forwardRef<HTMLDivElement, KoastCardProps>(function KoastCard(
  { variant = "default", padding, className = "", style, children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={className}
      style={{ ...styleFor(variant, padding), ...style }}
      {...rest}
    >
      {children}
    </div>
  );
});

export default KoastCard;
