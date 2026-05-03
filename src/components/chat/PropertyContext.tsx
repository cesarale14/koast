"use client";

import { useEffect, useRef } from "react";
import styles from "./ChatShell.module.css";

export type PropertyRef = {
  /** Resolved name, e.g. "Seabreeze Loft". When undefined, renders the placeholder. */
  name: string;
  /** Optional meta line, e.g. "Pacific Beach · 2 br". */
  meta?: string;
};

export type PropertyOption = {
  id: string;
  name: string;
  /** "Tampa · 2 br" — short meta line, may be empty. */
  meta: string;
};

export type PropertyContextProps = {
  /** Currently-selected property (drives the trigger pill). */
  property?: PropertyRef;
  /** All host properties for the dropdown. Empty array hides the chev / disables open. */
  options?: PropertyOption[];
  /** Selected id (drives the highlighted row). */
  selectedId?: string | null;
  /** Open/close handlers. The parent owns the open state so it can react to outside clicks. */
  open?: boolean;
  onToggleOpen?: () => void;
  onClose?: () => void;
  onSelect?: (id: string) => void;
};

/**
 * PropertyContext — the topbar property pill + dropdown panel.
 *
 * D18 (post-smoke): the dropdown panel is now in M5 scope, not deferred.
 * Without it the chat shell can't surface ui_context.active_property_id,
 * which makes read_memory unreachable from the chat surface (the
 * agent's memory tool is the product's primary differentiator).
 *
 * Behavior:
 *   - Trigger button toggles open via onToggleOpen
 *   - Panel renders below the trigger; quiet hairline border, no shadow
 *   - Click an option → onSelect(id) + onClose
 *   - Click outside or press Escape → onClose
 *   - When `options` is empty, the trigger renders but doesn't open
 *     (no panel; no chev affordance change in v1)
 */
export function PropertyContext({
  property,
  options = [],
  selectedId,
  open = false,
  onToggleOpen,
  onClose,
  onSelect,
}: PropertyContextProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Outside-click + Escape close. Only attach when open to avoid
  // global listeners on every render.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (e.target instanceof Node && !wrapRef.current.contains(e.target)) {
        onClose?.();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  const triggerDisabled = options.length === 0;

  return (
    <div className={styles["ctx-wrap"]} ref={wrapRef}>
      <button
        type="button"
        className={styles.ctx}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={triggerDisabled ? undefined : onToggleOpen}
      >
        <span className={styles["ctx-pill"]} />
        <span className={styles["ctx-name"]}>
          {property?.name ?? "Pick a property…"}
        </span>
        {property?.meta && (
          <span className={styles["ctx-meta"]}>· {property.meta}</span>
        )}
        <span className={styles["ctx-chev"]}>▾</span>
      </button>
      {open && (
        <div className={styles["ctx-panel"]} role="listbox">
          {options.length === 0 ? (
            <div className={styles["ctx-panel-empty"]}>
              No properties yet. Add one from /properties to ground the agent.
            </div>
          ) : (
            options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={o.id === selectedId}
                data-active={o.id === selectedId ? "true" : undefined}
                className={styles["ctx-option"]}
                onClick={() => {
                  onSelect?.(o.id);
                  onClose?.();
                }}
              >
                <span className={styles["ctx-option-name"]}>{o.name}</span>
                {o.meta && (
                  <span className={styles["ctx-option-meta"]}>{o.meta}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
