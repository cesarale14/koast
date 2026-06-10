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

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Block } from "@/components/chat/blocks/registry";
import { useToast } from "@/components/ui/Toast";
import type { NormalizedProposal } from "@/lib/proposals/server";
import type { ProposalStatus } from "@/lib/db/schema";

export function ProposalCard({
  proposal,
  onResolved,
}: {
  proposal: NormalizedProposal;
  onResolved?: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<null | "approve" | "dismiss">(null);
  const [status, setStatus] = useState<ProposalStatus>(proposal.status);
  const [error, setError] = useState<string | null>(
    proposal.status === "failed" ? ((proposal.result?.error as string) ?? null) : null,
  );

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

      {proposal.block && <Block block={proposal.block} />}

      {error && <div style={{ color: "var(--coral-reef)", fontSize: 13 }}>{error}</div>}

      {done ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--lagoon)", fontSize: 14, fontWeight: 600 }}>
          <Check size={16} strokeWidth={2.2} />
          Done
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
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
      )}
    </div>
  );
}
