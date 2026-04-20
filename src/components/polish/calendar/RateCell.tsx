"use client";

/**
 * RateCell — inline editable rate input used by the Calendar sidebar's
 * Pricing tab (per-platform rate rows + master rate). Keeps its own
 * state while editing; commits via onCommit on Enter/blur. The
 * `flashOnSave` prop triggers a brief golden background flash after
 * a successful commit.
 *
 * Styling: box-shadow on focus (NOT a border) to avoid layout shift.
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  value: number | null;
  placeholder?: string;
  onCommit: (next: number) => Promise<void> | void;
  onCancel?: () => void;
  disabled?: boolean;
  prefix?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  onArrowBoundary?: (direction: "left" | "right") => void;
  size?: "sm" | "md";
}

export default function RateCell({
  value,
  placeholder = "—",
  onCommit,
  onCancel,
  disabled,
  prefix = "$",
  ariaLabel,
  autoFocus,
  onArrowBoundary,
  size = "md",
}: Props) {
  const [draft, setDraft] = useState<string>(value != null ? String(value) : "");
  const [focused, setFocused] = useState(false);
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!focused) setDraft(value != null ? String(value) : "");
  }, [value, focused]);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  const commit = async () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraft(value != null ? String(value) : "");
      return;
    }
    if (parsed === value) return;
    await onCommit(parsed);
    setFlash(true);
    setTimeout(() => setFlash(false), 400);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setDraft(value != null ? String(value) : "");
      onCancel?.();
      inputRef.current?.blur();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
      inputRef.current?.blur();
      return;
    }
    const el = inputRef.current;
    if (!el || !onArrowBoundary) return;
    if (e.key === "ArrowRight" && el.selectionStart === el.value.length) {
      e.preventDefault();
      void commit();
      onArrowBoundary("right");
    } else if (e.key === "ArrowLeft" && el.selectionStart === 0) {
      e.preventDefault();
      void commit();
      onArrowBoundary("left");
    }
  };

  const height = size === "sm" ? 28 : 34;
  const fontSize = size === "sm" ? 13 : 15;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height,
        padding: "0 10px",
        background: flash ? "rgba(196,154,90,0.18)" : "#fff",
        borderRadius: 8,
        border: "1px solid var(--dry-sand)",
        boxShadow: focused ? "inset 0 0 0 1.5px var(--golden)" : "none",
        transition: "background-color 180ms ease, box-shadow 180ms ease",
        minWidth: 92,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {prefix && (
        <span style={{ fontSize, color: "var(--tideline)" }}>{prefix}</span>
      )}
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          void commit();
        }}
        onKeyDown={onKey}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        style={{
          flex: 1,
          minWidth: 0,
          border: 0,
          outline: 0,
          background: "transparent",
          fontFamily: "inherit",
          fontSize,
          fontWeight: 600,
          color: "var(--coastal)",
          fontVariantNumeric: "tabular-nums",
        }}
      />
    </div>
  );
}
