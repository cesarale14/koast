"use client";

/**
 * TodaySuggests — the "Koast suggests" surface on the Today home (P2.3). Self-
 * fetches the host's PENDING proposals and renders each as a trench-framed
 * ProposalCard (which self-labels "Koast suggests"). Renders nothing when there
 * are none — so it's dormant until the agent's hands (P3) or a host/worker
 * creates proposals, then lights up with no layout churn.
 *
 * Refreshes the list whenever a card resolves (approve/dismiss) so executed/
 * dismissed proposals drop off.
 */

import { useCallback, useEffect, useState } from "react";
import { ProposalCard } from "@/components/proposals/ProposalCard";
import type { NormalizedProposal } from "@/lib/proposals/server";

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
