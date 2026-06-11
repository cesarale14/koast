/**
 * POST /api/proposals/[id]/dismiss — host dismisses a proposal. Closes it with
 * ZERO side effects (status=dismissed, decided_at set). Host auth + ownership
 * re-checked here.
 *
 * At-most-once + approved-EXCLUSIVE: the dismiss is an ATOMIC CLAIM mirroring
 * /approve — a single conditional UPDATE that only matches a pending|failed row
 * owned by this host. This REFUSES to dismiss an in-flight 'approved' proposal
 * (whose Channex send may already be on the wire) — racing the finalize write
 * there could mislabel a message that WAS sent to the guest as 'dismissed'
 * (= "no send happened") on the brand-critical surface. 'approved' / 'executed'
 * are also un-claimable → 409.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import type { ProposalRow } from "@/lib/proposals/server";

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = createServiceClient();

    // Atomic claim — only a pending/failed proposal owned by this host dismisses.
    // A concurrent approve (which moves the row to 'approved') makes this claim
    // match nothing → 409, instead of racing the in-flight send's finalize.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: claimedRows } = await (svc.from("proposals") as any)
      .update({ status: "dismissed", decided_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("host_id", user.id)
      .in("status", ["pending", "failed"])
      .select();
    const claimed = ((claimedRows ?? []) as Pick<ProposalRow, "id" | "status">[])[0];
    if (claimed) return NextResponse.json({ dismissed: true });

    // Claim failed — disambiguate not-found/not-owned vs already-resolved/in-flight.
    const { data: existing } = await svc
      .from("proposals")
      .select("id, status")
      .eq("id", params.id)
      .eq("host_id", user.id)
      .limit(1);
    const row = ((existing ?? []) as Pick<ProposalRow, "id" | "status">[])[0];
    if (!row) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    return NextResponse.json({ error: `Proposal already ${row.status}` }, { status: 409 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
