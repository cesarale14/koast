/**
 * POST /api/proposals/[id]/dismiss — host dismisses a proposal. Closes it with
 * ZERO side effects (status=dismissed, decided_at set). Host auth + ownership
 * re-checked here.
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
    const { data: rows } = await svc
      .from("proposals")
      .select("id, status")
      .eq("id", params.id)
      .eq("host_id", user.id)
      .limit(1);
    const proposal = ((rows ?? []) as Pick<ProposalRow, "id" | "status">[])[0];
    if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    if (proposal.status === "executed" || proposal.status === "dismissed") {
      return NextResponse.json({ error: `Proposal already ${proposal.status}` }, { status: 409 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (svc.from("proposals") as any)
      .update({ status: "dismissed", decided_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("host_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ dismissed: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
