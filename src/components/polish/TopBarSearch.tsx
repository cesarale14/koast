"use client";

/**
 * TopBarSearch — centered pill in the Dashboard top bar that triggers
 * the CommandPalette overlay. It is a <button>, not an <input>. The
 * ⌘K shortcut lives inside CommandPalette itself so it works even
 * when this trigger is hidden (mobile).
 */

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { OPEN_EVENT } from "./CommandPalette";

const HIDE_BELOW = 900;

export default function TopBarSearch() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const apply = () => setVisible(window.innerWidth >= HIDE_BELOW);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT))}
      aria-label="Open search"
      className="koast-topbar-search"
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 10,
        position: "relative",
        minWidth: 0,
        maxWidth: 440,
        margin: "0 auto",
        height: 36,
        padding: "0 14px",
        borderRadius: 999,
        border: "1px solid transparent",
        background: "rgba(235,231,223,0.5)",
        color: "var(--coastal)",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 13,
        fontWeight: 400,
        textAlign: "left",
        transition: "background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
      }}
    >
      <Search size={16} style={{ color: "var(--tideline)", opacity: 0.6, flexShrink: 0 }} />
      <span style={{ flex: 1, color: "var(--tideline)", opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        Search properties, guests, messages…
      </span>
      <kbd
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "2px 6px",
          borderRadius: 4,
          background: "rgba(61,107,82,0.1)",
          color: "var(--tideline)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 10,
          letterSpacing: "0.02em",
          flexShrink: 0,
        }}
      >
        ⌘K
      </kbd>
      <style jsx>{`
        .koast-topbar-search:focus-visible {
          outline: none;
          background: #fff;
          border-color: var(--dry-sand);
          box-shadow: 0 0 0 3px rgba(196, 154, 90, 0.08);
        }
      `}</style>
    </button>
  );
}
