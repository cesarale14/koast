"use client";

/**
 * TopBarSearch — centered pill search input in the Dashboard top bar.
 *
 * Cmd/Ctrl+K focuses from anywhere on the page. Hidden below 900px
 * (mobile gets an icon-button expansion in a future session). Typing
 * is accepted but submitting does nothing until a global search
 * endpoint exists.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

const HIDE_BELOW = 900;

export default function TopBarSearch() {
  const ref = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const apply = () => setVisible(window.innerWidth >= HIDE_BELOW);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const onSubmit = useCallback((e: React.FormEvent) => {
    // TODO(search): wire to global search handler when backend search
    // endpoint exists. Stub: submit is a no-op for now.
    e.preventDefault();
  }, []);

  if (!visible) return null;

  const showHint = !focused && value.length === 0;

  return (
    <form
      onSubmit={onSubmit}
      style={{
        flex: 1,
        display: "flex",
        justifyContent: "center",
        minWidth: 0,
        maxWidth: 440,
        margin: "0 auto",
      }}
    >
      <label
        style={{
          position: "relative",
          display: "block",
          width: "100%",
        }}
      >
        <Search
          size={16}
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--tideline)",
            opacity: 0.6,
            pointerEvents: "none",
          }}
        />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search properties, guests, messages…"
          aria-label="Search"
          style={{
            width: "100%",
            height: 36,
            padding: "10px 52px 10px 42px",
            borderRadius: 999,
            border: `1px solid ${focused ? "var(--dry-sand)" : "transparent"}`,
            background: focused ? "#fff" : "rgba(235,231,223,0.5)",
            color: "var(--coastal)",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 400,
            outline: "none",
            boxShadow: focused ? "0 0 0 3px rgba(196,154,90,0.08)" : "none",
            transition:
              "background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
          }}
        />
        {showHint && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              padding: "2px 6px",
              borderRadius: 4,
              background: "rgba(61,107,82,0.1)",
              color: "var(--tideline)",
              fontSize: 10,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              letterSpacing: "0.02em",
              pointerEvents: "none",
              transition: "opacity 160ms ease",
            }}
          >
            ⌘K
          </span>
        )}
      </label>
    </form>
  );
}
