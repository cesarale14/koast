"use client";

/**
 * GuestMessageProposal — inline confirmation that Koast wants to send
 * a guest message via Channex on the host's behalf. M7 D43.
 *
 * Four states (mirrors agent_artifacts lifecycle + audit-outcome
 * derivation per M7 §11 amendment):
 *   - pending: shows the drafted message_text. Approve / Edit / Discard.
 *   - edited:  shows the host's edited_text with "edited by host"
 *              subtitle. Approve / Discard (no Edit — single edit
 *              per artifact, CF #37).
 *   - sent:    shows the final text + "Sent · {channel}" pill. No
 *              actions. Channex acknowledged.
 *   - failed:  shows the (drafted or edited) text + error block +
 *              Try again. Substrate state stays 'emitted' on Channex
 *              failure (§6 amendment); UI derives 'failed' from
 *              commit_metadata.last_error presence.
 *
 * Inline edit affordance (D38): Edit click toggles a textarea
 * pre-filled with the current text. Save triggers onSaveEdit(newText).
 * Component-local state for the textarea; the host's edited_text
 * persists via the parent's POST to /api/agent/artifact action='edit'.
 *
 * Visual treatment mirrors MemoryArtifact's quiet card pattern, with
 * a distinct .guest-message class for free-text rendering vs the
 * structured key/val pills MemoryArtifact uses.
 */

import { useState } from "react";
import styles from "./ChatShell.module.css";

export type GuestMessageProposalState = "pending" | "edited" | "sent" | "failed";

export type GuestMessageProposalProps = {
  state: GuestMessageProposalState;
  /** The agent's original draft (always shown in audit / for fallback). */
  messageText: string;
  /** The host's edit, when state='edited' or 'sent' after an edit. */
  editedText?: string;
  /** Resolved channel from read_guest_thread (airbnb / booking_com / vrbo / direct). */
  channel?: string;
  /** Filled when state='sent'. */
  channexMessageId?: string;
  /** Filled when state='failed' (commit_metadata.last_error.message). */
  errorMessage?: string;
  /** pending/edited only — fires Approve. */
  onApprove?: () => void;
  /** pending only — toggles the inline edit textarea. */
  onEdit?: () => void;
  /** pending/edited only — fires Discard. */
  onDiscard?: () => void;
  /** failed only — fires Try-again (re-POSTs approve). */
  onRetry?: () => void;
  /** Edit-mode only — fires when Save is clicked inside the textarea. */
  onSaveEdit?: (newText: string) => void;
};

function channelLabel(channel: string | undefined): string | null {
  if (!channel) return null;
  if (channel === "airbnb") return "Airbnb";
  if (channel === "booking_com") return "Booking.com";
  if (channel === "vrbo") return "Vrbo";
  if (channel === "direct") return "direct";
  return channel;
}

function eyebrow(state: GuestMessageProposalState, channel: string | undefined): string {
  const channelText = channelLabel(channel);
  const stateText =
    state === "pending"
      ? "pending review"
      : state === "edited"
        ? "edited"
        : state === "sent"
          ? "sent"
          : "send failed";
  return channelText
    ? `guest message · ${stateText} · ${channelText}`
    : `guest message · ${stateText}`;
}

export function GuestMessageProposal({
  state,
  messageText,
  editedText,
  channel,
  errorMessage,
  onApprove,
  onEdit,
  onDiscard,
  onRetry,
  onSaveEdit,
}: GuestMessageProposalProps) {
  const [editing, setEditing] = useState(false);
  const [draftEdit, setDraftEdit] = useState(editedText ?? messageText);

  // The text the host sees as the "current" body — edited if a host
  // edit is in commit_metadata, otherwise the agent's original draft.
  const visibleText = editedText ?? messageText;

  const eyebrowText = eyebrow(state, channel);

  const handleEditClick = () => {
    setEditing(true);
    setDraftEdit(visibleText);
    onEdit?.();
  };

  const handleSaveEdit = () => {
    const trimmed = draftEdit.trim();
    if (trimmed.length === 0) return; // ignore empty saves; host can Discard
    onSaveEdit?.(trimmed);
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setDraftEdit(visibleText);
  };

  return (
    <div className={styles["guest-message"]}>
      <span className={styles["guest-message-label"]}>{eyebrowText}</span>

      {editing && state === "pending" ? (
        <div className={styles["guest-message-edit"]}>
          <textarea
            className={styles["guest-message-textarea"]}
            value={draftEdit}
            onChange={(e) => setDraftEdit(e.target.value)}
            rows={4}
            maxLength={5000}
            aria-label="Edit guest message draft"
          />
          <div className={styles["guest-message-actions"]}>
            <button
              type="button"
              className={`${styles.btn} ${styles["btn-primary"]}`}
              onClick={handleSaveEdit}
            >
              Save
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles["btn-ghost"]}`}
              onClick={handleCancelEdit}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles["guest-message-text"]}>{visibleText}</div>

          {state === "edited" && (
            <span className={styles["guest-message-edited-by-host"]}>
              edited by host
            </span>
          )}

          {state === "pending" && (
            <div className={styles["guest-message-actions"]}>
              {onApprove && (
                <button
                  type="button"
                  className={`${styles.btn} ${styles["btn-primary"]}`}
                  onClick={onApprove}
                >
                  Approve
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  className={`${styles.btn} ${styles["btn-secondary"]}`}
                  onClick={handleEditClick}
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

          {state === "edited" && (
            <div className={styles["guest-message-actions"]}>
              {onApprove && (
                <button
                  type="button"
                  className={`${styles.btn} ${styles["btn-primary"]}`}
                  onClick={onApprove}
                >
                  Approve
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

          {state === "sent" && (
            <div className={styles["guest-message-sent"]}>
              <span className={styles.check}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    d="M5 12l5 5 9-12"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              {channelLabel(channel) ? `Sent · ${channelLabel(channel)}` : "Sent"}
            </div>
          )}

          {state === "failed" && (
            <div className={styles["guest-message-failed"]}>
              {errorMessage && <em>{errorMessage}</em>}
              <div className={styles["guest-message-actions"]}>
                {onRetry && (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles["btn-secondary"]}`}
                    onClick={onRetry}
                  >
                    Try again
                  </button>
                )}
                {/* Non-transient failures (character limit, OTA policy
                    rejection) re-fail on retry; Discard gives the host
                    an exit path. The route's discard handler accepts
                    state='emitted' with commit_metadata.last_error
                    populated — last_error doesn't affect discard. */}
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
