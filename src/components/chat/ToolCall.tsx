"use client";

import type { ReactNode } from "react";
import styles from "./ChatShell.module.css";

export type ToolCallState = "in-flight" | "completed" | "failed";

export type ToolCallProps = {
  /** Tool name, rendered in mono. */
  name: string;
  /** Param map rendered as "key=value · key=value" (dim). */
  params?: Record<string, string>;
  state: ToolCallState;
  /** Shown in tabular-nums when state='completed' or 'failed'. */
  durationMs?: number;
  /** Whether the expanded panel below the row is shown. */
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** Body of the expanded panel. Caller pre-formats. */
  resultBody?: ReactNode;
};

/**
 * ToolCall — inline tool invocation row.
 *
 * Three rendered forms (same DOM node, different classes per design contract):
 *   in-flight  → spinning icon + "resolving" + pulse dot
 *   completed  → static icon + "{ms}ms" + chevron
 *   failed     → static icon + "failed" (warn-tinted via the parent .tool styles)
 *
 * On `tool_call_completed`, the consumer should mutate the same component
 * instance from in-flight → completed (NOT remove + re-insert). React keys
 * keep the DOM node stable, which preserves layout and avoids a flash.
 */
function formatParams(params: Record<string, string> | undefined): ReactNode {
  if (!params) return null;
  const entries = Object.entries(params);
  if (entries.length === 0) return null;
  return (
    <span className={styles["tool-arg"]}>
      <span className={styles.sep}>·</span>{" "}
      {entries.map(([k, v], i) => (
        <span key={k}>
          {i > 0 && <span className={styles.sep}> · </span>}
          {k}=<strong>{v}</strong>
        </span>
      ))}
    </span>
  );
}

export function ToolCall({
  name,
  params,
  state,
  durationMs,
  expanded,
  onToggleExpand,
  resultBody,
}: ToolCallProps) {
  const cls =
    state === "in-flight"
      ? `${styles.tool} ${styles["in-flight"]}`
      : styles.tool;
  const dur =
    state === "in-flight"
      ? "resolving"
      : state === "failed"
      ? "failed"
      : durationMs != null
      ? `${durationMs}ms`
      : "";
  const isInteractive = state === "completed";
  return (
    <>
      <button
        type="button"
        className={cls}
        aria-expanded={expanded ?? false}
        aria-disabled={!isInteractive ? true : undefined}
        onClick={isInteractive ? onToggleExpand : undefined}
      >
        <span className={styles["tool-icon"]}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              d="M14 7l-5 10M9 7l-3 5 3 5M15 7l3 5-3 5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className={styles["tool-name"]}>{name}</span>
        {formatParams(params)}
        {dur && <span className={styles["tool-dur"]}>{dur}</span>}
        {state === "in-flight" && (
          <span className={styles.pulse} aria-hidden="true" />
        )}
        {state === "completed" && (
          <span className={styles["tool-chev"]}>{expanded ? "▴" : "▾"}</span>
        )}
      </button>
      {expanded && resultBody && (
        <div className={styles["tool-expanded"]}>
          <div className={styles["tool-expanded-head"]}>
            <span className={styles["tool-icon"]}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  d="M14 7l-5 10M9 7l-3 5 3 5M15 7l3 5-3 5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className={styles["tool-name"]}>{name}</span>
          </div>
          <div className={styles["tool-expanded-body"]}>{resultBody}</div>
        </div>
      )}
    </>
  );
}
