"use client";

/**
 * GuestMessageProposal — the in-flight ARTIFACT-lane guest message (M7 D43),
 * now rendered through the ONE canonical ProposalCardView + GuestReplyBlock
 * (design pass Phase 2b single-card reconciliation). So an artifact-lane guest
 * message is pixel-identical to a proposals-lane send_guest_reply card — only
 * the backend wiring differs underneath (this lane's handlers POST to
 * /api/agent/artifact; the proposals lane POSTs to /api/proposals). The
 * presentational unification does NOT touch either approve path — the artifact
 * route's at-most-once (409 on a terminal artifact) and the proposals route's
 * atomic claim are both unchanged.
 *
 * Four states (agent_artifacts lifecycle): pending (Approve/Edit/Dismiss),
 * edited (Approve/Dismiss + "edited by you"), sent (Done), failed (Try again /
 * Dismiss). Inline edit (D38) is component-local; Save fires onSaveEdit.
 */

import { useState } from "react";
import { ProposalCardView } from "@/components/proposals/ProposalCardView";
import type { BlockData } from "@/components/chat/blocks/types";

export type GuestMessageProposalState = "pending" | "edited" | "sent" | "failed";

export type GuestMessageProposalProps = {
  state: GuestMessageProposalState;
  /** The agent's original draft. */
  messageText: string;
  /** The host's edit, when state='edited' or 'sent' after an edit. */
  editedText?: string;
  /** Resolved channel (airbnb / booking_com / vrbo / direct). Drives the block's
   *  channel chip; omitted → no chip (graceful when not yet resolved). */
  channel?: string;
  /** Filled when state='sent' (back-compat; not displayed — the chip carries channel). */
  channexMessageId?: string;
  /** Filled when state='failed' (commit_metadata.last_error.message). */
  errorMessage?: string;
  /** P2b — for the unified GuestReplyBlock; ChatClient passes when resolvable. */
  guestName?: string | null;
  propertyName?: string | null;
  firstContact?: boolean;
  /** pending/edited only — fires Approve. */
  onApprove?: () => void;
  /** pending only — present ⇒ the Edit affordance shows. */
  onEdit?: () => void;
  /** pending/edited/failed only — fires Discard. */
  onDiscard?: () => void;
  /** failed only — fires Try-again (re-POSTs approve). */
  onRetry?: () => void;
  /** Edit-mode only — fires when Save is clicked. */
  onSaveEdit?: (newText: string) => void;
};

export function GuestMessageProposal({
  state,
  messageText,
  editedText,
  channel,
  errorMessage,
  guestName,
  propertyName,
  firstContact,
  onApprove,
  onEdit,
  onDiscard,
  onRetry,
  onSaveEdit,
}: GuestMessageProposalProps) {
  const visibleText = editedText ?? messageText;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(visibleText);

  const block: BlockData = {
    kind: "guest_reply",
    data: {
      channel: channel ?? "",
      guestName: guestName ?? null,
      propertyName: propertyName ?? null,
      messageText: visibleText,
      firstContact,
    },
  };

  const startEdit = () => {
    setDraft(visibleText);
    setEditing(true);
    onEdit?.();
  };
  const saveEdit = () => {
    const t = draft.trim();
    if (!t) return;
    onSaveEdit?.(t);
    setEditing(false);
  };
  const cancelEdit = () => {
    setDraft(visibleText);
    setEditing(false);
  };

  if (state === "sent") {
    return <ProposalCardView block={block} done />;
  }

  const isFailed = state === "failed";
  return (
    <ProposalCardView
      block={block}
      editing={editing && state === "pending"}
      draft={draft}
      onDraftChange={setDraft}
      onSaveEdit={saveEdit}
      onCancelEdit={cancelEdit}
      editedByHost={state === "edited"}
      error={isFailed ? (errorMessage ?? "Send failed") : null}
      canApprove
      onApprove={isFailed ? onRetry : onApprove}
      canEdit={state === "pending" && !!onEdit}
      onEdit={startEdit}
      onDismiss={onDiscard}
      busy={null}
    />
  );
}
