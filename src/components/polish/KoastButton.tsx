"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

type Size = "sm" | "md" | "lg";
type Variant = "primary" | "secondary" | "ghost" | "danger";

interface KoastButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  variant?: Variant;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
}

const heightBySize: Record<Size, number> = { sm: 30, md: 36, lg: 42 };
const padBySize: Record<Size, string> = { sm: "px-3", md: "px-4", lg: "px-5" };
const fontBySize: Record<Size, string> = { sm: "text-[12px]", md: "text-[13px]", lg: "text-[14px]" };

function styleFor(variant: Variant): React.CSSProperties {
  switch (variant) {
    case "primary":
      return { background: "var(--coastal)", color: "var(--shore)", border: "1px solid var(--coastal)" };
    case "secondary":
      return { background: "#fff", color: "var(--coastal)", border: "1px solid var(--coastal)" };
    case "ghost":
      return { background: "transparent", color: "var(--tideline)", border: "1px solid transparent" };
    case "danger":
      return { background: "var(--coral-reef)", color: "var(--shore)", border: "1px solid var(--coral-reef)" };
  }
}

export const KoastButton = forwardRef<HTMLButtonElement, KoastButtonProps>(function KoastButton(
  { size = "md", variant = "primary", iconLeft, iconRight, loading, children, disabled, style, className = "", ...rest },
  ref
) {
  const h = heightBySize[size];
  const base = styleFor(variant);
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      disabled={isDisabled}
      data-variant={variant}
      className={`koast-btn inline-flex items-center justify-center gap-2 font-semibold rounded-[10px] ${padBySize[size]} ${fontBySize[size]} ${className}`}
      style={{
        height: h,
        transition: "background-color 180ms cubic-bezier(0.4,0,0.2,1), color 180ms cubic-bezier(0.4,0,0.2,1), border-color 180ms cubic-bezier(0.4,0,0.2,1), transform 180ms cubic-bezier(0.34,1.56,0.64,1)",
        opacity: isDisabled ? 0.55 : 1,
        cursor: isDisabled ? "not-allowed" : "pointer",
        letterSpacing: "-0.005em",
        ...base,
        ...style,
      }}
      {...rest}
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : iconLeft ? (
        <span className="inline-flex items-center justify-center" style={{ width: 16, height: 16 }}>
          {iconLeft}
        </span>
      ) : null}
      {children && <span>{children}</span>}
      {iconRight && !loading && (
        <span className="inline-flex items-center justify-center" style={{ width: 16, height: 16 }}>
          {iconRight}
        </span>
      )}
    </button>
  );
});

export default KoastButton;
