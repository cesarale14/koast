"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

interface KoastSelectedCellProps {
  selected: boolean;
  children: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
  ariaLabel?: string;
  hoverable?: boolean;
}

export function KoastSelectedCell({ selected, children, style, onClick, ariaLabel, hoverable = true }: KoastSelectedCellProps) {
  const [hover, setHover] = useState(false);
  const showHover = hoverable && hover && !selected;
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={ariaLabel}
      aria-selected={selected}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        position: "relative",
        cursor: onClick ? "pointer" : undefined,
        transform: selected ? "translateY(-1px)" : "translateY(0)",
        transition:
          "transform 180ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 180ms cubic-bezier(0.4,0,0.2,1), background-color 180ms cubic-bezier(0.4,0,0.2,1)",
        backgroundColor: showHover ? "rgba(23,57,42,0.04)" : "transparent",
        boxShadow: selected
          ? "inset 0 0 0 2px var(--lagoon), 0 4px 12px rgba(26,122,90,0.12)"
          : showHover
          ? "inset 0 0 0 1px rgba(23,57,42,0.1)"
          : "inset 0 0 0 2px transparent",
        borderRadius: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default KoastSelectedCell;
