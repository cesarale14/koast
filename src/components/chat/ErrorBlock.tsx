"use client";

import styles from "./ChatShell.module.css";

export type ErrorBlockKind = "connection" | "server" | "rate_limit";

export type ErrorBlockProps = {
  /** Variant — drives wording, not chrome (all variants share .err styles). */
  kind: ErrorBlockKind;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
};

export function ErrorBlock({ kind, message, onRetry, onDismiss }: ErrorBlockProps) {
  // kind currently only drives the inline text the host passes; chrome is uniform.
  // (state 10's markup is `<span class="err" role="status">`; we mirror that.)
  void kind;
  return (
    <span className={styles.err} role="status">
      <span className={styles.dot} />
      <span>{message}</span>
      {(onRetry || onDismiss) && (
        <span className={styles["err-actions"]}>
          {onRetry && (
            <button
              type="button"
              className={`${styles.btn} ${styles["btn-warn"]}`}
              onClick={onRetry}
            >
              Retry
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              className={`${styles.btn} ${styles["btn-ghost"]}`}
              onClick={onDismiss}
            >
              Dismiss
            </button>
          )}
        </span>
      )}
    </span>
  );
}
