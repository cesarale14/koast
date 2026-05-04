"use client";

/**
 * MemoryArtifact — quiet inline confirmation that Koast wants to/has
 * deposited a fact into the host's memory.
 *
 * Four states (M6 D35 + lifecycle expansion):
 *   - pending:    small KoastMark + "memory · pending review" eyebrow,
 *                 key/val fact spans, Save/Edit/Discard actions
 *   - saved:      "memory · settled", check pill + "Saved · N layers settled"
 *   - superseded: "memory · superseded" eyebrow, dimmed fact spans, no actions
 *                 (the host already saved a corrected version downstream)
 *   - failed:     "memory · save failed" eyebrow, fact spans, retry hint
 *                 (post-approval handler errored; resolution surface for the host)
 *
 * Wired to live data in M6 step 15 — preview routes still work via the
 * same prop shape (M5's two-state minimum stays intact; the new states
 * are additive). Parent turn's KoastMark milestone animation fires
 * when state transitions pending → saved (M6 D33, CF15 visual completion).
 */

import styles from "./ChatShell.module.css";
import { KoastMark } from "./KoastMark";

export type FactSpan =
  | { kind: "key"; text: string }
  | { kind: "val"; text: string };

export type MemoryArtifactProps = {
  state: "pending" | "saved" | "superseded" | "failed";
  /** Alternating key/val spans — keys are dim, vals are accent-deep mono pills. */
  fact: FactSpan[];
  /** Pending-only — fires "Save". */
  onSave?: () => void;
  /** Pending-only — fires "Edit". */
  onEdit?: () => void;
  /** Pending-only — fires "Discard". */
  onDiscard?: () => void;
  /** Saved-only — count of memory layers settled (defaults to 1 in copy). */
  layersSettled?: number;
  /** Failed-only — error message surfaced inline beneath the fact. */
  errorMessage?: string;
  /** Failed-only — fires "Try again". */
  onRetry?: () => void;
};

export function MemoryArtifact({
  state,
  fact,
  onSave,
  onEdit,
  onDiscard,
  layersSettled = 1,
  errorMessage,
  onRetry,
}: MemoryArtifactProps) {
  const eyebrowText =
    state === "pending"
      ? "memory · pending review"
      : state === "saved"
        ? "memory · settled"
        : state === "superseded"
          ? "memory · superseded"
          : "memory · save failed";
  const layersCopy =
    layersSettled === 1 ? "1 layer settled" : `${layersSettled} layers settled`;
  return (
    <div className={styles.memory}>
      <span className={styles["memory-label"]}>
        <KoastMark size={11} state="idle" />
        {eyebrowText}
      </span>
      <div className={styles["memory-fact"]}>
        {fact.map((span, i) => (
          <span
            key={i}
            className={span.kind === "key" ? styles.key : styles.val}
          >
            {span.text}
          </span>
        ))}
      </div>
      {state === "pending" && (
        <div className={styles["memory-actions"]}>
          {onSave && (
            <button
              type="button"
              className={`${styles.btn} ${styles["btn-primary"]}`}
              onClick={onSave}
            >
              Save
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              className={`${styles.btn} ${styles["btn-secondary"]}`}
              onClick={onEdit}
            >
              Edit
            </button>
          )}
          {onDiscard && (
            <button
              type="button"
              className={`${styles.btn} ${styles["btn-ghost"]}`}
              onClick={onDiscard}
            >
              Discard
            </button>
          )}
        </div>
      )}
      {state === "saved" && (
        <div className={styles["memory-saved"]}>
          <span className={styles.check}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                d="M5 12l5 5 9-12"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          Saved · {layersCopy}
        </div>
      )}
      {state === "superseded" && (
        <div className={styles["memory-superseded"]}>
          <em>This proposal was replaced by a corrected version.</em>
        </div>
      )}
      {state === "failed" && (
        <div className={styles["memory-failed"]}>
          {errorMessage && <em>{errorMessage}</em>}
          {onRetry && (
            <button
              type="button"
              className={`${styles.btn} ${styles["btn-secondary"]}`}
              onClick={onRetry}
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
