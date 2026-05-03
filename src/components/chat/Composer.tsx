"use client";

/**
 * Composer — the chat input bar.
 *
 * Four states (per components.md):
 *   empty    — placeholder visible, send disabled
 *   typing   — content + .is-focus border + send active
 *   sending  — textarea disabled, send shows spinner
 *   blocked  — textarea disabled, send disabled (during stream)
 *
 * Keyboard: ⌘/Ctrl+Enter submits. Enter inserts a newline (textarea default).
 * Esc on a blocked composer cancels streaming — the parent wires the handler
 * to whatever cancel mechanism is in use (typically useAgentTurn().cancel).
 */

import { type KeyboardEvent } from "react";
import styles from "./ChatShell.module.css";

export type ComposerState = "empty" | "typing" | "sending" | "blocked";

export type ComposerProps = {
  state: ComposerState;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Optional: invoked on Esc when state==='blocked'. */
  onEscape?: () => void;
};

const DEFAULT_PLACEHOLDER = "Ask Koast about a guest, a price, a turnover…";

export function Composer({
  state,
  value,
  placeholder = DEFAULT_PLACEHOLDER,
  onChange,
  onSubmit,
  onEscape,
}: ComposerProps) {
  const isDisabled = state === "blocked" || state === "sending";
  const sendDisabled = state === "empty" || isDisabled;
  const containerCls = isDisabled
    ? `${styles.composer} ${styles["is-disabled"]}`
    : styles.composer;

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!sendDisabled) onSubmit();
      return;
    }
    if (e.key === "Escape" && state === "blocked" && onEscape) {
      e.preventDefault();
      onEscape();
    }
  }

  return (
    <div className={containerCls}>
      <textarea
        className={styles["composer-input"]}
        rows={1}
        placeholder={placeholder}
        value={value}
        disabled={isDisabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className={styles["composer-foot"]}>
        <div className={styles["composer-tools"]}>
          <button type="button" className={styles["icon-btn"]} aria-label="Attach">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                d="M21 12.5l-8.6 8.6a5 5 0 0 1-7.1-7.1L13 5.4a3.5 3.5 0 1 1 5 5L9.4 19"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button type="button" className={styles["icon-btn"]} aria-label="Switch property">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M3 11.5L12 4l9 7.5M5 10v9h14v-9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className={styles["composer-send"]}>
          <span className={styles["composer-hint"]}>⌘↵ to send</span>
          <button
            type="button"
            className={styles["send-btn"]}
            aria-label="Send"
            disabled={sendDisabled}
            onClick={onSubmit}
          >
            {state === "sending" ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="9" strokeDasharray="14 7" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
