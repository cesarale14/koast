"use client";

/**
 * MemoryArtifact — quiet inline confirmation that Koast wants to/has
 * deposited a fact into the host's memory.
 *
 * Two states (per components.md, state file 14):
 *   - pending:  small KoastMark + "memory · pending review" eyebrow,
 *               key/val fact spans, Save/Edit/Discard actions
 *   - saved:    same eyebrow text reads "memory · settled", check pill +
 *               "Saved · N layers settled" replaces the actions
 *
 * The parent turn's KoastMark milestone animation is the parent's
 * responsibility (D-FORWARD-EVENTS — the substrate doesn't yet emit
 * memory_write_saved; preview routes can simulate). Visual milestone
 * deposit is CF15 — state machine works, full visual is M6 polish.
 *
 * D-PREVIEW-ROUTES — only reachable via the preview routes in M5
 * since memory_write_pending / memory_write_saved aren't M4-emitted.
 */

import styles from "./ChatShell.module.css";
import { KoastMark } from "./KoastMark";

export type FactSpan =
  | { kind: "key"; text: string }
  | { kind: "val"; text: string };

export type MemoryArtifactProps = {
  state: "pending" | "saved";
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
};

export function MemoryArtifact({
  state,
  fact,
  onSave,
  onEdit,
  onDiscard,
  layersSettled = 1,
}: MemoryArtifactProps) {
  const eyebrowText = state === "pending" ? "memory · pending review" : "memory · settled";
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
      {state === "pending" ? (
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
      ) : (
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
    </div>
  );
}
