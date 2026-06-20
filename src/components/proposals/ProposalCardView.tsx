"use client";

/**
 * ProposalCardView (design pass Phase 2b — single proposal rendering) — the ONE
 * canonical "Koast suggests" card, presentational ONLY. Both proposal entry
 * points render through this exact component so a proposal looks identical
 * regardless of lane:
 *   - the PROPOSALS lane (ProposalCard → /api/proposals)
 *   - the ARTIFACT lane (GuestMessageProposal → /api/agent/artifact)
 *
 * It owns NO state and NO fetch — the lane wrapper owns the approve/edit/dismiss
 * logic and passes data + handlers in. This is the load-bearing separation: the
 * presentational split CANNOT touch either lane's at-most-once approve path
 * (the atomic claim lives in the backend route, not here). Same trench frame,
 * "Koast suggests" eyebrow, deep-teal commit, lagoon-done, coral-error.
 */

import { Check, X } from "lucide-react";
import { Block } from "@/components/chat/blocks/registry";
import type { BlockData } from "@/components/chat/blocks/types";

export type ProposalCardViewProps = {
  /** The display block (rendered through the P2.2 registry). */
  block?: BlockData | null;
  rationale?: string | null;

  // ── edit mode (guest-reply / guest-message lanes) ──────────────────────────
  editing?: boolean;
  draft?: string;
  onDraftChange?: (v: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  savingEdit?: boolean;

  // ── terminal / status ──────────────────────────────────────────────────────
  /** Executed (proposals) / sent (artifact) → the quiet "Done" state. */
  done?: boolean;
  error?: string | null;
  /** Artifact lane: the host edited the draft before approving. */
  editedByHost?: boolean;

  // ── actions (pending) ───────────────────────────────────────────────────────
  /** False hides Approve (OTA write while the gate is off); Dismiss stays live. */
  canApprove?: boolean;
  onApprove?: () => void;
  canEdit?: boolean;
  onEdit?: () => void;
  onDismiss?: () => void;
  /** Which action is in-flight — disables both buttons (the frontend half of
   *  double-tap safety; the backend atomic claim is the real guarantee). */
  busy?: "approve" | "dismiss" | null;
  /** Shown above the actions when !canApprove (e.g. OTA changes turned off). */
  notApprovableNote?: string | null;
};

export function ProposalCardView({
  block,
  rationale,
  editing = false,
  draft = "",
  onDraftChange,
  onSaveEdit,
  onCancelEdit,
  savingEdit = false,
  done = false,
  error,
  editedByHost = false,
  canApprove = true,
  onApprove,
  canEdit = false,
  onEdit,
  onDismiss,
  busy = null,
  notApprovableNote,
}: ProposalCardViewProps) {
  return (
    <div
      data-testid="proposal-card"
      style={{
        border: "1px solid var(--hairline)",
        borderLeftWidth: 4,
        borderLeftColor: "var(--koast-trench)",
        borderRadius: 12,
        background: "var(--shore)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--koast-trench)",
        }}
      >
        Koast suggests
      </div>

      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            value={draft}
            onChange={(e) => onDraftChange?.(e.target.value)}
            rows={5}
            autoFocus
            style={{
              width: "100%",
              fontSize: 14,
              lineHeight: 1.5,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--hairline)",
              resize: "vertical",
              fontFamily: "inherit",
              color: "var(--deep-sea)",
              background: "white",
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onSaveEdit}
              disabled={savingEdit || draft.trim().length === 0}
              style={{ fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "var(--coastal)", color: "#fff", opacity: savingEdit ? 0.7 : 1 }}
            >
              {savingEdit ? "Saving…" : "Save edit"}
            </button>
            <button
              onClick={onCancelEdit}
              disabled={savingEdit}
              style={{ fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--hairline)", cursor: "pointer", background: "white", color: "var(--tideline)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        block && <Block block={block} />
      )}

      {rationale && !editing && (
        <div style={{ color: "var(--tideline)", fontSize: 13.5, lineHeight: 1.5 }}>
          {rationale}
        </div>
      )}

      {editedByHost && !editing && (
        <div style={{ color: "var(--tideline)", fontSize: 12, fontStyle: "italic" }}>
          edited by you
        </div>
      )}

      {error && <div style={{ color: "var(--coral-reef)", fontSize: 13 }}>{error}</div>}

      {done ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--lagoon)", fontSize: 14, fontWeight: 600 }}>
          <Check size={16} strokeWidth={2.2} />
          Done
        </div>
      ) : editing ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {!canApprove && notApprovableNote && (
            <div style={{ color: "var(--tideline)", fontSize: 12.5 }}>{notApprovableNote}</div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            {canApprove && onApprove && (
              <button
                onClick={onApprove}
                disabled={busy !== null}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  cursor: busy ? "default" : "pointer",
                  background: "var(--coastal)",
                  color: "#fff",
                  opacity: busy === "approve" ? 0.7 : 1,
                }}
              >
                <Check size={15} strokeWidth={2.2} />
                {busy === "approve" ? "Approving…" : error ? "Try again" : "Approve"}
              </button>
            )}
            {canEdit && onEdit && (
              <button
                onClick={onEdit}
                disabled={busy !== null}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--hairline)",
                  cursor: busy ? "default" : "pointer",
                  background: "white",
                  color: "var(--tideline)",
                }}
              >
                Edit
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                disabled={busy !== null}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--hairline)",
                  cursor: busy ? "default" : "pointer",
                  background: "white",
                  color: "var(--tideline)",
                }}
              >
                <X size={15} strokeWidth={2} />
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
