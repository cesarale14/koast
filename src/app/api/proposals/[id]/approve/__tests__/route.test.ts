/**
 * /api/proposals/[id]/approve — at-most-once via the ATOMIC CLAIM.
 *
 * Pins the claim-once contract on the PROPOSALS lane (the artifact lane's
 * at-most-once is covered by api/agent/artifact route.test.ts's 409-on-terminal).
 * This is the backend guarantee behind Q-B's single-card proof #2: the
 * presentational ProposalCardView extract is frontend-only and CANNOT touch this
 * route, so the double-tap-safe property holds through the refactor.
 *
 * The claim is a single conditional UPDATE that only matches a pending|failed row
 * owned by this host. A second concurrent approve finds the row already moved out
 * of pending|failed → claims nothing → 409. Exactly one execution.
 */

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/supabase/service");
jest.mock("@/lib/proposals/server", () => ({
  __esModule: true,
  executeProposal: jest.fn().mockResolvedValue({ ok: true, summary: { done: true } }),
  finalizeProposalAfterExecute: jest
    .fn()
    .mockResolvedValue({ id: "p1", status: "executed" }),
  normalizeProposal: jest.fn((r: { id: string; status: string }) => ({ id: r.id, status: r.status })),
}));

import { POST } from "../route";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

const mockAuth = getAuthenticatedUser as jest.Mock;
const mockSvc = createServiceClient as jest.Mock;

let lastClaimIn: [string, unknown[]] | null = null;

function makeSvc({ claimRows, existingRows }: { claimRows: unknown[]; existingRows?: unknown[] }) {
  // First .from("proposals") → the atomic claim (update→eq→eq→in→select).
  const claimBuilder: Record<string, unknown> = {
    update: () => claimBuilder,
    eq: () => claimBuilder,
    in: (col: string, vals: unknown[]) => {
      lastClaimIn = [col, vals];
      return claimBuilder;
    },
    select: () => Promise.resolve({ data: claimRows, error: null }),
  };
  // Second .from("proposals") → disambiguation (select→eq→eq→limit).
  const selBuilder: Record<string, unknown> = {
    select: () => selBuilder,
    eq: () => selBuilder,
    limit: () => Promise.resolve({ data: existingRows ?? [], error: null }),
  };
  let n = 0;
  return { from: () => (n++ === 0 ? claimBuilder : selBuilder) };
}

beforeEach(() => {
  jest.clearAllMocks();
  lastClaimIn = null;
  mockAuth.mockResolvedValue({ user: { id: "h1" } });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = {} as any;
const ctx = { params: { id: "p1" } };

test("claim succeeds (pending row) → executes once, 200 ok:true", async () => {
  mockSvc.mockReturnValue(makeSvc({ claimRows: [{ id: "p1", host_id: "h1", status: "approved" }] }));
  const res = await POST(req, ctx);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  // The claim is approve-EXCLUSIVE: only pending|failed can be claimed, so an
  // already-approved/executed row is structurally un-reclaimable.
  expect(lastClaimIn).toEqual(["status", ["pending", "failed"]]);
});

test("second concurrent approve (row already claimed) → claims nothing → 409, no execution", async () => {
  const { executeProposal } = jest.requireMock("@/lib/proposals/server");
  mockSvc.mockReturnValue(
    makeSvc({ claimRows: [], existingRows: [{ id: "p1", status: "approved" }] }),
  );
  const res = await POST(req, ctx);
  expect(res.status).toBe(409);
  const body = await res.json();
  expect(body.error).toMatch(/already approved/i);
  // The loser of the claim NEVER executes — at-most-once.
  expect(executeProposal).not.toHaveBeenCalled();
});

test("claim finds no row + not owned/not found → 404", async () => {
  mockSvc.mockReturnValue(makeSvc({ claimRows: [], existingRows: [] }));
  const res = await POST(req, ctx);
  expect(res.status).toBe(404);
});

test("unauthenticated → 401, never touches the claim", async () => {
  mockAuth.mockResolvedValue({ user: null });
  const res = await POST(req, ctx);
  expect(res.status).toBe(401);
  expect(mockSvc).not.toHaveBeenCalled();
});
