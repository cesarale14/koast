/**
 * GET  /api/proposals?status=&property_id=  — list the host's proposals.
 * POST /api/proposals                        — create a proposal for an owned property.
 *
 * Host-scoped: reads/writes go via the service client but are filtered to the
 * authenticated host (and, for create, gated on property ownership). The
 * proposals table's RLS is SELECT-only host_id=auth.uid(); these routes are the
 * write path.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  createProposal,
  getProposalActionDef,
  normalizeProposal,
  type ProposalRow,
} from "@/lib/proposals/server";

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const propertyId = url.searchParams.get("property_id");
    const id = url.searchParams.get("id"); // P6.5: single-proposal refetch (inline card)

    const svc = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = svc
      .from("proposals")
      .select("*")
      .eq("host_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (status) q = q.eq("status", status);
    if (propertyId) q = q.eq("property_id", propertyId);
    if (id) q = q.eq("id", id);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const proposals = ((data ?? []) as ProposalRow[]).map(normalizeProposal);
    return NextResponse.json({ proposals });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { propertyId, actionType, payload, rationale } = (body ?? {}) as {
      propertyId?: string;
      actionType?: string;
      payload?: Record<string, unknown>;
      rationale?: string;
    };
    if (!propertyId || !actionType || !payload) {
      return NextResponse.json(
        { error: "propertyId, actionType and payload are required" },
        { status: 400 },
      );
    }
    if (!getProposalActionDef(actionType)) {
      return NextResponse.json({ error: `Unknown action_type '${actionType}'` }, { status: 400 });
    }

    const svc = createServiceClient();
    // Ownership gate — the host must own the target property.
    const { data: propRows } = await svc
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .eq("user_id", user.id)
      .limit(1);
    if (!propRows || propRows.length === 0) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const { proposal, autoExecuted } = await createProposal(svc, {
      hostId: user.id,
      propertyId,
      actionType,
      payload,
      rationale: rationale ?? null,
      createdBy: "host",
    });

    return NextResponse.json({ proposal: normalizeProposal(proposal), autoExecuted });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
