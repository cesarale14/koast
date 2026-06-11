/**
 * GET /api/proposals — the Today "Koast suggests" read surface. This is the
 * query the prod incident (2026-06-11) put under suspicion ("the Today query is
 * filtering wrong"). The diagnosis cleared it, and this pins it so it stays
 * cleared:
 *
 *   1. an AGENT-created pending proposal owned by the host IS returned (it must
 *      SURFACE, not just exist as a row) — and normalizes to a renderable card.
 *   2. the query scopes to the authenticated host (host_id = user.id) and the
 *      requested status — the host-isolation + pending filter the surface needs.
 *   3. the query does NOT filter by created_by — an agent proposal is as visible
 *      as a host/worker one. (A future `.eq("created_by", …)` here would re-open
 *      the incident: agent proposals would silently vanish from Today. This
 *      fails first, in CI.)
 *
 * Node-only (no DB, no React): mock auth + a chainable service query that
 * records its .eq() filters.
 */

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/supabase/service");

import { GET } from "../route";
import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

const HOST_ID = "00000000-0000-0000-0000-0000000000aa";

/** An agent-created pending proposals row, as the DB returns it. */
const AGENT_ROW = {
  id: "prop-agent-1",
  host_id: HOST_ID,
  property_id: "prop-uid",
  action_type: "assign_cleaner",
  payload: {
    block: {
      kind: "turnover",
      data: { property: "Villa Jamaica", date: "2026-06-12", status: "pending", cleanerName: "Karem" },
    },
    action: { taskId: "t1", cleanerId: "c1" },
  },
  rationale: "Karem is free and closest.",
  status: "pending",
  created_by: "agent",
  created_at: "2026-06-11T01:46:35Z",
  decided_at: null,
  executed_at: null,
  result: null,
};

/** A chainable, thenable proposals query that records every .eq(col,val). */
function fakeSvc(rows: unknown[]) {
  const eqCalls: [string, unknown][] = [];
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    eq: (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return builder;
    },
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  };
  const svc = { from: () => builder } as unknown as ReturnType<typeof createServiceClient>;
  return { svc, eqCalls };
}

function req(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/proposals${qs}`);
}

beforeEach(() => jest.clearAllMocks());

describe("GET /api/proposals — the Today suggests read", () => {
  test("unauthed → 401", async () => {
    (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: null });
    const res = await GET(req("?status=pending"));
    expect(res.status).toBe(401);
  });

  test("returns the AGENT-created pending proposal, normalized to a card", async () => {
    (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: HOST_ID } });
    const { svc } = fakeSvc([AGENT_ROW]);
    (createServiceClient as jest.Mock).mockReturnValue(svc);

    const res = await GET(req("?status=pending"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.proposals).toHaveLength(1);
    // surfaces as an approvable card: id + status + a renderable block
    expect(body.proposals[0]).toMatchObject({ id: "prop-agent-1", status: "pending" });
    expect(body.proposals[0].block).not.toBeNull();
  });

  test("scopes to the authenticated host + requested status", async () => {
    (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: HOST_ID } });
    const { svc, eqCalls } = fakeSvc([AGENT_ROW]);
    (createServiceClient as jest.Mock).mockReturnValue(svc);

    await GET(req("?status=pending"));
    expect(eqCalls).toContainEqual(["host_id", HOST_ID]);
    expect(eqCalls).toContainEqual(["status", "pending"]);
  });

  test("does NOT filter by created_by — agent proposals are as visible as host ones", async () => {
    (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: HOST_ID } });
    const { svc, eqCalls } = fakeSvc([AGENT_ROW]);
    (createServiceClient as jest.Mock).mockReturnValue(svc);

    await GET(req("?status=pending"));
    expect(eqCalls.map(([col]) => col)).not.toContain("created_by");
  });
});
