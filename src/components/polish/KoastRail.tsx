"use client";

import { useEffect, type ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

type Variant = "light" | "dark";

interface KoastRailProps {
  open: boolean;
  onToggle: () => void;
  header?: ReactNode;
  children: ReactNode;
  width?: number;
  variant?: Variant;
  // Toggle keyboard binding. Desktop Calendar uses cmd+/; embedded
  // rails without shortcut expectations can disable it.
  keyboardToggle?: boolean;
}

export function KoastRail({
  open,
  onToggle,
  header,
  children,
  width = 360,
  variant = "light",
  keyboardToggle = true,
}: KoastRailProps) {
  useEffect(() => {
    if (!keyboardToggle) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        onToggle();
      } else if (e.key === "Escape" && open) {
        onToggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggle, open, keyboardToggle]);

  const isDark = variant === "dark";
  const bg = isDark ? "var(--coastal)" : "#fff";
  const borderColor = isDark ? "rgba(247,243,236,0.1)" : "#E5E2DC";
  const toggleColor = isDark ? "rgba(247,243,236,0.7)" : "var(--tideline)";

  return (
    <aside
      style={{
        width: open ? width : 0,
        flexShrink: 0,
        background: bg,
        borderLeft: open ? `1px solid ${borderColor}` : "none",
        transition: "width 220ms cubic-bezier(0.4,0,0.2,1)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
      aria-hidden={!open}
    >
      <div style={{ width, display: "flex", flexDirection: "column", height: "100%" }}>
        <header
          style={{
            height: 52,
            flexShrink: 0,
            borderBottom: `1px solid ${borderColor}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
          }}
        >
          <div style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{header}</div>
          <button
            type="button"
            onClick={onToggle}
            aria-label={open ? "Close rail" : "Open rail"}
            title={keyboardToggle ? "Toggle rail (cmd+/)" : "Toggle rail"}
            style={{
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: toggleColor,
              cursor: "pointer",
              borderRadius: 7,
              transition: "background-color 180ms cubic-bezier(0.4,0,0.2,1)",
            }}
          >
            {open ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </header>
        <div style={{ flex: 1, overflowY: "auto" }}>{children}</div>
      </div>
    </aside>
  );
}

export default KoastRail;
