/**
 * POST /api/proposals/[id]/approve — host approves a proposal; it executes
 * through the named internal action (the SAME lib fn the manual UI uses), an
 * agent_audit_log row is written, and the proposal transitions to executed /
 * failed. A failed execution stays actionable (re-approvable) — it returns 200
 * with ok:false so the card can render the error without losing the action.
 *
 * At-most-once execution: the proposal is ATOMICALLY CLAIMED (pending|failed →
 * approved) via a conditional UPDATE before executing, so a double-click /
 * client retry / racing approve fails the claim (→ 409) and execution runs
 * exactly once. "This call IS the gate": host auth + ownership (host_id) are
 * enforced in the claim itself.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  executeProposal,
  finalizeProposalAfterExecute,
  normalizeProposal,
  type ProposalRow,
} from "@/lib/proposals/server";

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = createServiceClient();

    // Atomic claim — only a pending/failed proposal owned by this host can be
    // claimed (status → approved). Two concurrent approves: only one claims a
    // row; the loser sees no row and 409s. 'failed' is claimable so it stays
    // actionable (re-approve retries).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: claimedRows } = await (svc.from("proposals") as any)
      .update({ status: "approved", decided_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("host_id", user.id)
      .in("status", ["pending", "failed"])
      .select();
    const proposal = ((claimedRows ?? []) as ProposalRow[])[0];

    if (!proposal) {
      // Claim failed — disambiguate not-found/not-owned vs already resolved/in-flight.
      const { data: existing } = await svc
        .from("proposals")
        .select("id, status")
        .eq("id", params.id)
        .eq("host_id", user.id)
        .limit(1);
      const row = ((existing ?? []) as { id: string; status: string }[])[0];
      if (!row) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
      return NextResponse.json({ error: `Proposal already ${row.status}` }, { status: 409 });
    }

    const exec = await executeProposal(svc, { proposal, hostId: user.id });
    const finalized = await finalizeProposalAfterExecute(svc, proposal.id, exec, user.id);
    const normalized = finalized ? normalizeProposal(finalized) : null;

    if (!exec.ok) {
      // Execution failed-but-recorded — request succeeded, action didn't. The
      // card shows the error and stays actionable (status is now 'failed').
      return NextResponse.json({ ok: false, error: exec.error, proposal: normalized });
    }
    return NextResponse.json({ ok: true, proposal: normalized });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
