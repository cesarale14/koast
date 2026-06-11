jest.mock("@/lib/turnover/assign");
jest.mock("@/lib/action-substrate/audit-writer");

import {
  buildAssignCleanerProposalPayload,
  normalizeProposal,
  getProposalActionMeta,
  isOtaWriteEnabled,
  executeProposal,
  finalizeProposalAfterExecute,
  type ProposalRow,
} from "../server";
import { assignCleaner } from "@/lib/turnover/assign";
import { writeAuditLog } from "@/lib/action-substrate/audit-writer";

const mockAssign = assignCleaner as jest.MockedFunction<typeof assignCleaner>;
const mockAudit = writeAuditLog as jest.MockedFunction<typeof writeAuditLog>;

const HOST = "host-1";

function row(overrides: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: "prop-1",
    host_id: HOST,
    property_id: "p1",
    action_type: "assign_cleaner",
    payload: { block: { kind: "turnover", data: { property: "Villa", date: "2026-06-12", status: "pending", cleanerName: null } }, action: { taskId: "t1", cleanerId: "c1" } },
    rationale: "Karem is free and closest.",
    status: "pending",
    created_by: "agent",
    created_at: "2026-06-10T12:00:00Z",
    decided_at: null,
    executed_at: null,
    result: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAudit.mockResolvedValue({ audit_log_id: "a", created_at: "t" });
});

describe("buildAssignCleanerProposalPayload", () => {
  test("packs an id-lean turnover block + the execution action", () => {
    const p = buildAssignCleanerProposalPayload({
      taskId: "t1",
      cleanerId: "c1",
      property: "Villa Jamaica",
      date: "2026-06-12",
      cleanerName: "Karem Gutierrez",
    });
    expect(p.block).toEqual({
      kind: "turnover",
      data: { property: "Villa Jamaica", date: "2026-06-12", status: "pending", cleanerName: "Karem Gutierrez" },
    });
    expect(p.action).toEqual({ taskId: "t1", cleanerId: "c1" });
    // The display block carries NO entity ids.
    expect(JSON.stringify(p.block)).not.toContain("t1");
    expect(JSON.stringify(p.block)).not.toContain("c1");
  });
});

describe("normalizeProposal", () => {
  test("extracts the display block + camelCases the row", () => {
    const n = normalizeProposal(row());
    expect(n).toMatchObject({
      id: "prop-1",
      propertyId: "p1",
      actionType: "assign_cleaner",
      rationale: "Karem is free and closest.",
      status: "pending",
    });
    expect(n.block).toEqual({ kind: "turnover", data: { property: "Villa", date: "2026-06-12", status: "pending", cleanerName: null } });
  });

  test("null block when payload has none", () => {
    expect(normalizeProposal(row({ payload: {} })).block).toBeNull();
  });

  test("drops a malformed block (validate-on-read → prose stands, no 'Invalid Date')", () => {
    // A KNOWN kind with bad data must be dropped, not rendered as garbage.
    const n = normalizeProposal(row({ payload: { block: { kind: "turnover", data: {} } } }));
    expect(n.block).toBeNull();
  });

  test("strips an injected entity id from a valid block (no-ids invariant)", () => {
    const n = normalizeProposal(
      row({
        payload: {
          block: {
            kind: "turnover",
            data: { property: "Villa", date: "2026-06-12", status: "pending", cleanerName: null, taskId: "leak" },
          },
        },
      }),
    );
    expect(n.block).not.toBeNull();
    expect(JSON.stringify(n.block)).not.toContain("leak");
  });
});

describe("getProposalActionMeta", () => {
  test("exposes assign_cleaner as a non-OTA action with a label", () => {
    const meta = getProposalActionMeta();
    const assign = meta.find((m) => m.actionType === "assign_cleaner");
    expect(assign).toBeDefined();
    expect(assign?.otaTouching).toBe(false);
    expect(assign?.label.length).toBeGreaterThan(0);
  });
});

describe("isOtaWriteEnabled", () => {
  const prev = process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH;
  afterEach(() => {
    if (prev === undefined) delete process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH;
    else process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = prev;
  });
  test("off by default + fail-closed on '1'; on ONLY for the documented 'true' (R-5)", () => {
    delete process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH;
    expect(isOtaWriteEnabled()).toBe(false);
    // R-5: unified with the route guard (isCalendarPushEnabled, "true"-only).
    // "1" used to enable the proposal side while every route 503'd — now both
    // fail closed on it. See gate-divergence.test.ts for the full matrix.
    process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = "1";
    expect(isOtaWriteEnabled()).toBe(false);
    process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = "true";
    expect(isOtaWriteEnabled()).toBe(true);
  });
});

describe("executeProposal", () => {
  const svc = {} as Parameters<typeof executeProposal>[0];

  test("dispatches assign_cleaner through the shared lib fn + writes a succeeded audit", async () => {
    mockAssign.mockResolvedValue({ ok: true, cleanerName: "Karem", propertyName: "Villa", push: null });
    const r = await executeProposal(svc, { proposal: row(), hostId: HOST });
    expect(r.ok).toBe(true);
    expect(mockAssign).toHaveBeenCalledWith(svc, { taskId: "t1", cleanerId: "c1", hostId: HOST });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action_type: "assign_cleaner",
        actor_kind: "host",
        source: "frontend_api",
        autonomy_level: "confirmed",
        outcome: "succeeded",
        stakes_class: "medium",
      }),
    );
  });

  test("fails (no dispatch) on an unknown action_type", async () => {
    const r = await executeProposal(svc, { proposal: row({ action_type: "launch_rockets" }), hostId: HOST });
    expect(r).toMatchObject({ ok: false });
    expect(mockAssign).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  test("fails + writes a failed audit when the payload is missing action fields", async () => {
    const r = await executeProposal(svc, { proposal: row({ payload: { block: {} } }), hostId: HOST });
    expect(r.ok).toBe(false);
    expect(mockAssign).not.toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed" }));
  });

  test("propagates an execution failure + writes a failed audit", async () => {
    mockAssign.mockResolvedValue({ ok: false, code: "already_started", error: "in progress" });
    const r = await executeProposal(svc, { proposal: row(), hostId: HOST });
    expect(r).toMatchObject({ ok: false, error: "in progress" });
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed" }));
  });
});

describe("finalizeProposalAfterExecute", () => {
  function svcReturning(updatedRow: ProposalRow) {
    const builder: Record<string, unknown> = {
      update: () => builder,
      eq: () => builder,
      select: () => builder,
      single: () => Promise.resolve({ data: updatedRow, error: null }),
    };
    return { from: () => builder } as unknown as Parameters<typeof finalizeProposalAfterExecute>[0];
  }

  test("writes executed terminal state on success", async () => {
    const out = await finalizeProposalAfterExecute(
      svcReturning(row({ status: "executed" })),
      "prop-1",
      { ok: true, summary: { cleaner_name: "Karem" } },
      HOST,
    );
    expect(out?.status).toBe("executed");
  });

  test("writes failed terminal state on failure", async () => {
    const out = await finalizeProposalAfterExecute(
      svcReturning(row({ status: "failed" })),
      "prop-1",
      { ok: false, error: "boom" },
      HOST,
    );
    expect(out?.status).toBe("failed");
  });
});
