"use client";

/**
 * ProposalCard (P2.3) — "the system is proposing." Trench-deep frame
 * (var(--koast-trench), the color reserved EXCLUSIVELY for proposing) +
 * rationale + the payload's display block rendered through the P2.2 registry +
 * Approve / Dismiss.
 *
 * Approve POSTs to /api/proposals/[id]/approve, which executes through the SAME
 * named internal action the manual UI uses + writes an audit row. A failed
 * execution stays actionable — the error shows and Approve re-enables. Dismiss
 * closes with zero side effects.
 *
 * Color law: trench = proposing (frame), lume = interactive (Approve), lagoon =
 * done, coral = error. No new hues.
 */

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Block } from "@/components/chat/blocks/registry";
import { useToast } from "@/components/ui/Toast";
import type { NormalizedProposal } from "@/lib/proposals/server";
import type { ProposalStatus } from "@/lib/db/schema";

export function ProposalCard({
  proposal,
  onResolved,
  refetchOnFocus = false,
}: {
  proposal: NormalizedProposal;
  onResolved?: () => void;
  /**
   * P6.5 — when true (the inline chat usage), refetch this proposal's current
   * status on window focus/visibility so a decision made elsewhere (Today/bell)
   * reflects here. TodaySuggests does its own list-level refetch, so it leaves
   * this off to avoid double-fetching.
   */
  refetchOnFocus?: boolean;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<null | "approve" | "dismiss">(null);
  const [status, setStatus] = useState<ProposalStatus>(proposal.status);
  const [error, setError] = useState<string | null>(
    proposal.status === "failed" ? ((proposal.result?.error as string) ?? null) : null,
  );
  // P6.5 — local block override so an edit reflects immediately on the card.
  const [block, setBlock] = useState(proposal.block);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Edit-before-approve applies ONLY to a pending guest-reply draft. The EDITED
  // text becomes what sends (the /edit route re-runs the voice judges + audit-logs).
  const guestReplyText =
    block && block.kind === "guest_reply" ? (block.data.messageText as string) : null;
  const canEdit =
    proposal.actionType === "send_guest_reply" &&
    status === "pending" &&
    guestReplyText !== null;

  function startEdit() {
    setDraft(guestReplyText ?? "");
    setEditing(true);
    setError(null);
  }

  async function saveEdit() {
    if (draft.trim().length === 0) return;
    setSavingEdit(true);
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageText: draft }),
      });
      const d = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || (d as { ok?: boolean }).ok === false) {
        setError((d as { error?: string }).error ?? "Couldn't save the edit");
        setSavingEdit(false);
        return;
      }
      // Reflect the re-judged text the server stored (J1 may have filtered emoji).
      const updated = (d as { proposal?: NormalizedProposal }).proposal;
      if (updated?.block) setBlock(updated.block);
      setEditing(false);
    } catch {
      setError("Network error");
    }
    setSavingEdit(false);
  }

  // P6.5 — consistency refetch (inline chat usage): if this proposal is decided
  // in Today/bell while still showing here, reflect it on focus/visibility.
  useEffect(() => {
    if (!refetchOnFocus || status !== "pending") return;
    let cancelled = false;
    const refetch = async () => {
      try {
        const res = await fetch(`/api/proposals?id=${proposal.id}`);
        if (!res.ok) return;
        const d = (await res.json()) as { proposals?: NormalizedProposal[] };
        const fresh = d.proposals?.[0];
        if (!cancelled && fresh && fresh.status !== status) {
          setStatus(fresh.status);
          if (fresh.block) setBlock(fresh.block);
        }
      } catch {
        /* best-effort */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refetchOnFocus, status, proposal.id]);

  if (status === "dismissed") return null;

  async function approve() {
    setBusy("approve");
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/approve`, { method: "POST" });
      const d = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        setError((d as { error?: string }).error ?? "Approve failed");
        setBusy(null);
        return;
      }
      if ((d as { ok?: boolean }).ok === false) {
        setError((d as { error?: string }).error ?? "Action failed");
        setStatus("failed");
        setBusy(null);
        return;
      }
      setStatus("executed");
      toast("Done", "success");
      onResolved?.();
    } catch {
      setError("Network error");
    }
    setBusy(null);
  }

  async function dismiss() {
    setBusy("dismiss");
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/dismiss`, { method: "POST" });
      if (res.ok) {
        setStatus("dismissed");
        onResolved?.();
        return;
      }
    } catch {
      /* fall through */
    }
    setBusy(null);
  }

  const done = status === "executed";
  // Belt 1 of the OTA execution-impossibility: when the action isn't executable
  // (an OTA write while the gate is off), Approve is hidden — Dismiss stays live.
  // executable is computed server-side (getProposalActionDef + the unified gate).
  const canApprove = proposal.executable !== false;

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

      {proposal.rationale && (
        <div style={{ color: "var(--deep-sea)", fontSize: 14, lineHeight: 1.5 }}>
          {proposal.rationale}
        </div>
      )}

      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
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
              onClick={saveEdit}
              disabled={savingEdit || draft.trim().length === 0}
              style={{ fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "var(--lume)", color: "var(--deep-sea)", opacity: savingEdit ? 0.7 : 1 }}
            >
              {savingEdit ? "Saving…" : "Save edit"}
            </button>
            <button
              onClick={() => { setEditing(false); setError(null); }}
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

      {error && <div style={{ color: "var(--coral-reef)", fontSize: 13 }}>{error}</div>}

      {done ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--lagoon)", fontSize: 14, fontWeight: 600 }}>
          <Check size={16} strokeWidth={2.2} />
          Done
        </div>
      ) : editing ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {!canApprove && (
            <div style={{ color: "var(--tideline)", fontSize: 12.5 }}>
              Channel changes are turned off — turn them on in Settings to approve this.
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            {canApprove && (
              <button
                onClick={approve}
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
                  background: "var(--lume)",
                  color: "var(--deep-sea)",
                  opacity: busy === "approve" ? 0.7 : 1,
                }}
              >
                <Check size={15} strokeWidth={2.2} />
                {busy === "approve" ? "Approving…" : error ? "Try again" : "Approve"}
              </button>
            )}
            {canEdit && (
              <button
                onClick={startEdit}
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
            <button
              onClick={dismiss}
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
          </div>
        </div>
      )}
    </div>
  );
}
