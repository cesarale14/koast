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
 * Color law (design pass Q1): deep teal --coastal/--koast-trench = proposing
 * (the frame) AND commit (the Approve — sober, white-text-safe, "you meant
 * this"), NOT the bright --lume cyan. Gold appears only on a money delta inside
 * the block (a rate RAISE = found money). lagoon = done, coral = error.
 */

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { ProposalCardView } from "./ProposalCardView";
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

  // The PROPOSALS-lane wrapper: owns state + the fetch handlers (approve hits the
  // atomic-claim route — UNCHANGED by the presentational extract), renders the
  // ONE canonical ProposalCardView.
  return (
    <ProposalCardView
      block={block}
      rationale={proposal.rationale}
      editing={editing}
      draft={draft}
      onDraftChange={setDraft}
      onSaveEdit={saveEdit}
      onCancelEdit={() => { setEditing(false); setError(null); }}
      savingEdit={savingEdit}
      done={done}
      error={error}
      canApprove={canApprove}
      onApprove={approve}
      canEdit={canEdit}
      onEdit={startEdit}
      onDismiss={dismiss}
      busy={busy}
      notApprovableNote="Channel changes are turned off — turn them on in Settings to approve this."
    />
  );
}
