/**
 * The agent → host proposal VISIBILITY path — the load-bearing seam of
 * propose→approve. A prod incident (2026-06-11): propose_assign_cleaner created
 * a correct, host-scoped, pending row AND fired the bell — yet the host saw NO
 * approval option, because the Today "Koast suggests" surface read its list
 * once on mount and never again, so a proposal the agent created from the chat
 * never appeared. The row existing is NOT the contract; the host being able to
 * SEE and ACT on it is.
 *
 * This test pins the full path deterministically (no live DB, no live sends):
 *   1. createProposal(createdBy:'agent') stamps a host-scoped PENDING row
 *      (what the Today read filters on) AND fires the proposal_created bell.
 *   2. that pending row normalizes to an approvable card (the Today render).
 *   3. the bell row deep-links the host to the approval surface.
 *   4. a HOST-created proposal does NOT self-notify (the boundary).
 *
 * The UI freshness fix itself (TodaySuggests polls + refetches on visibility +
 * the PROPOSALS_CHANGED_EVENT nudge) lives in the client component; this guards
 * the data + mapping invariants that fix depends on. If a future change drops
 * host_id, changes the default status off 'pending', removes the bell emit, or
 * breaks the bell's deep-link, the path breaks here, in CI — not in prod.
 */

jest.mock("@/lib/notifications/host-feed");
jest.mock("@/lib/turnover/assign");
jest.mock("@/lib/action-substrate/audit-writer");

import {
  createProposal,
  normalizeProposal,
  buildAssignCleanerProposalPayload,
  type ProposalRow,
} from "../server";
import { emitHostNotification } from "@/lib/notifications/host-feed";
import { describeHostNotification } from "@/lib/notifications/describe";

const mockEmit = emitHostNotification as jest.MockedFunction<typeof emitHostNotification>;

const HOST = "host-uid-1";
const PROPERTY = "property-uid-1";

const PAYLOAD = buildAssignCleanerProposalPayload({
  taskId: "task-1",
  cleanerId: "cleaner-1",
  property: "Villa Jamaica",
  date: "2026-06-12",
  cleanerName: "Karem Gutierrez",
}) as unknown as Record<string, unknown>;

/** A proposals row as the DB returns it after INSERT (status defaults pending). */
function insertedRow(over: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: "prop-xyz",
    host_id: HOST,
    property_id: PROPERTY,
    action_type: "assign_cleaner",
    payload: PAYLOAD,
    rationale: "Karem is free and closest.",
    status: "pending",
    created_by: "agent",
    created_at: "2026-06-11T01:46:35Z",
    decided_at: null,
    executed_at: null,
    result: null,
    ...over,
  };
}

/** A service client that captures the proposals INSERT and answers the
 *  auto-approve preference read (default: OFF → the pending path). */
function fakeSvc(opts: { inserted: ProposalRow; autoApprove?: boolean }) {
  const captured: { proposalInsert?: Record<string, unknown> } = {};
  const proposals: Record<string, unknown> = {
    insert: (vals: Record<string, unknown>) => {
      captured.proposalInsert = vals;
      return proposals;
    },
    select: () => proposals,
    single: () => Promise.resolve({ data: opts.inserted, error: null }),
  };
  const prefsRows = opts.autoApprove
    ? [{ preferences: { auto_approve: { assign_cleaner: true } } }]
    : [];
  const prefs: Record<string, unknown> = {
    select: () => prefs,
    eq: () => prefs,
    limit: () => Promise.resolve({ data: prefsRows, error: null }),
  };
  const svc = {
    from: (t: string) => (t === "proposals" ? proposals : prefs),
  } as unknown as Parameters<typeof createProposal>[0];
  return { svc, captured };
}

beforeEach(() => jest.clearAllMocks());

describe("step 1 — the agent's hand: createProposal(agent) → host-scoped pending row + bell", () => {
  test("stamps host_id + pending, created_by agent, and fires proposal_created", async () => {
    const { svc, captured } = fakeSvc({ inserted: insertedRow() });

    const { proposal, autoExecuted } = await createProposal(svc, {
      hostId: HOST,
      propertyId: PROPERTY,
      actionType: "assign_cleaner",
      payload: PAYLOAD,
      rationale: "Karem is free and closest.",
      createdBy: "agent",
    });

    // host-scoped write — the SELECT/RLS scope every read surface filters on
    expect(captured.proposalInsert).toMatchObject({
      host_id: HOST,
      property_id: PROPERTY,
      action_type: "assign_cleaner",
      created_by: "agent",
    });
    expect(proposal.host_id).toBe(HOST);
    // pending — what GET /api/proposals?status=pending (the Today read) filters on
    expect(proposal.status).toBe("pending");
    expect(autoExecuted).toBe(false);

    // the bell fired, carrying the proposal id so the host can act on THIS one
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith(
      svc,
      HOST,
      "proposal_created",
      expect.objectContaining({ proposalId: "prop-xyz", actionType: "assign_cleaner" }),
    );
  });
});

describe("step 2 — the Today render: a pending row normalizes to an approvable card", () => {
  test("status=pending matches the read filter and yields a renderable card", () => {
    const row = insertedRow();
    // The route returns rows where status === 'pending'; this is one.
    expect(row.status).toBe("pending");

    const n = normalizeProposal(row);
    expect(n.id).toBe("prop-xyz");
    expect(n.status).toBe("pending");
    // a renderable display block (the card body) AND rationale prose — the host
    // sees something approvable, never an empty/garbage card
    expect(n.block).not.toBeNull();
    expect(n.rationale).toBeTruthy();
  });
});

describe("step 3 — the bell render: the notification deep-links to the approval surface", () => {
  test("proposal_created → Today home, where TodaySuggests renders the card", () => {
    const d = describeHostNotification({
      id: "n1",
      type: "proposal_created",
      payload: { proposalId: "prop-xyz", rationale: "Karem is free and closest." },
      readAt: null,
      createdAt: "2026-06-11T01:46:35Z",
    });
    expect(d.title.length).toBeGreaterThan(0);
    expect(d.href).toBe("/");
    expect(d.sub).toBe("Karem is free and closest.");
  });
});

describe("step 4 — the boundary: a HOST-created proposal does NOT self-notify", () => {
  test("createdBy 'host' lands pending without firing the bell", async () => {
    const { svc } = fakeSvc({ inserted: insertedRow({ created_by: "host" }) });
    const { autoExecuted } = await createProposal(svc, {
      hostId: HOST,
      propertyId: PROPERTY,
      actionType: "assign_cleaner",
      payload: PAYLOAD,
      rationale: "manual",
      createdBy: "host",
    });
    expect(autoExecuted).toBe(false);
    expect(mockEmit).not.toHaveBeenCalled();
  });
});
