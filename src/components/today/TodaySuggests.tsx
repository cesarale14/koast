"use client";

/**
 * TodaySuggests — the "Koast suggests" surface on the Today home (P2.3). Self-
 * fetches the host's PENDING proposals and renders each as a trench-framed
 * ProposalCard (which self-labels "Koast suggests"). Renders nothing when there
 * are none — so it's dormant until the agent's hands (P3) or a host/worker
 * creates proposals, then lights up with no layout churn.
 *
 * STAYS FRESH (root-cause fix): the agent creates a proposal from ANOTHER
 * surface (the chat) — so a mount-only read froze this list and the new card
 * never appeared on an already-open Today home (the proposal was in the DB and
 * the bell, but invisible here). Three refresh triggers, mirroring the bell:
 *   - poll on an interval (an eventual ceiling, even on a staring host),
 *   - refetch when the tab/surface becomes visible or regains focus (instant on
 *     return from the chat),
 *   - a same-document nudge event the bell fires on a proposal deep-link
 *     (instant when the host taps "Koast has a suggestion" while already on "/").
 * Plus the existing onResolved refetch so approved/dismissed cards drop off.
 */

import { useCallback, useEffect, useState } from "react";
import { ProposalCard } from "@/components/proposals/ProposalCard";
import { PROPOSALS_CHANGED_EVENT } from "@/lib/notifications/describe";
import type { NormalizedProposal } from "@/lib/proposals/server";

const POLL_MS = 60_000;

export function TodaySuggests() {
  const [proposals, setProposals] = useState<NormalizedProposal[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/proposals?status=pending");
      const d = await res.json().catch(() => ({}));
      setProposals(Array.isArray(d?.proposals) ? (d.proposals as NormalizedProposal[]) : []);
    } catch {
      setProposals([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    const onNudge = () => load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener(PROPOSALS_CHANGED_EVENT, onNudge);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(PROPOSALS_CHANGED_EVENT, onNudge);
    };
  }, [load]);

  if (!loaded || proposals.length === 0) return null;

  return (
    <section style={{ marginTop: 40 }} data-testid="today-suggests">
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {proposals.map((p) => (
          <li key={p.id}>
            <ProposalCard proposal={p} onResolved={load} />
          </li>
        ))}
      </ul>
    </section>
  );
}
