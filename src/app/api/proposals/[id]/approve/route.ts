/**
 * POST /api/proposals/[id]/approve — host approves a proposal; it executes
 * through the named internal action (the SAME lib fn the manual UI uses), an
 * agent_audit_log row is written, and the proposal transitions to executed /
 * failed. A failed execution stays actionable (re-approvable) — it returns 200
 * with ok:false so the card can render the error without losing the action.
 *
 * "This call IS the gate": host auth + ownership (host_id) are re-checked here.
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
    const { data: rows } = await svc
      .from("proposals")
      .select("*")
      .eq("id", params.id)
      .eq("host_id", user.id)
      .limit(1);
    const proposal = ((rows ?? []) as ProposalRow[])[0];
    if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    // Terminal states can't be re-approved. 'failed' is NOT terminal — it stays
    // actionable, so a re-approve retries.
    if (proposal.status === "executed" || proposal.status === "dismissed") {
      return NextResponse.json(
        { error: `Proposal already ${proposal.status}` },
        { status: 409 },
      );
    }

    const exec = await executeProposal(svc, { proposal, hostId: user.id });
    const finalized = await finalizeProposalAfterExecute(svc, proposal.id, exec);
    const normalized = finalized ? normalizeProposal(finalized) : null;

    if (!exec.ok) {
      // Execution failed-but-recorded — request succeeded, action didn't. The
      // card shows the error and stays actionable.
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
