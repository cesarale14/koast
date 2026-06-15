/**
 * OTA proposal actions (P3.2 HARD-FLOOR) — the registry execute paths + the
 * executable gate. Proves the EXECUTION-IMPOSSIBLE-WHILE-OFF contract at the
 * proposal layer (belts 1+2) and that each OTA op builds the correct per-date
 * restriction for the shared dispatch. applyOtaRestrictions is mocked (its own
 * suite covers the Channex side); here we assert the action→dispatch wiring.
 */

jest.mock("@/lib/channex/ota-apply");
jest.mock("@/lib/action-substrate/audit-writer");

import {
  executeProposal,
  normalizeProposal,
  type ProposalRow,
} from "../server";
import { applyOtaRestrictions } from "@/lib/channex/ota-apply";
import { writeAuditLog } from "@/lib/action-substrate/audit-writer";

const mockApply = applyOtaRestrictions as jest.MockedFunction<typeof applyOtaRestrictions>;
const mockAudit = writeAuditLog as jest.MockedFunction<typeof writeAuditLog>;

const HOST = "host-1";
const svc = {} as Parameters<typeof executeProposal>[0];

function otaRow(action_type: string, action: Record<string, unknown>): ProposalRow {
  return {
    id: "p1",
    host_id: HOST,
    property_id: "prop-1",
    action_type,
    payload: { block: {}, action },
    rationale: "r",
    status: "pending",
    created_by: "agent",
    created_at: "2026-06-11T00:00:00Z",
    decided_at: null,
    executed_at: null,
    result: null,
  };
}

const prevFlag = process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH;
beforeEach(() => {
  jest.clearAllMocks();
  mockAudit.mockResolvedValue({ audit_log_id: "a", created_at: "t" });
  mockApply.mockResolvedValue({
    ok: true,
    pushedChannels: ["BDC"],
    failedChannels: [],
    skipped: [],
    successByDate: new Map(),
    failedByDate: new Map(),
    targets: [{ channel_code: "BDC", rate_plan_id: "rp" }],
    bdcPlans: [],
    priorStateByChannel: new Map(),
  });
  process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = "true";
});
afterAll(() => {
  if (prevFlag === undefined) delete process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH;
  else process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = prevFlag;
});

describe("belt 2 — executeProposal refuses OTA actions while the gate is off", () => {
  test.each(["block_dates", "adjust_price", "set_min_stay"])(
    "%s with gate OFF → ok:false, dispatch NOT called",
    async (actionType) => {
      process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = ""; // off
      const action =
        actionType === "adjust_price"
          ? { propertyId: "prop-1", dates: ["2026-07-01"], rate: 200 }
          : actionType === "set_min_stay"
            ? { propertyId: "prop-1", dates: ["2026-07-01"], minStay: 3 }
            : { propertyId: "prop-1", dates: ["2026-07-01"] };
      const r = await executeProposal(svc, { proposal: otaRow(actionType, action), hostId: HOST });
      expect(r.ok).toBe(false);
      expect(mockApply).not.toHaveBeenCalled();
    },
  );
});

describe("OTA op → per-date restriction wiring (gate on)", () => {
  test("block_dates builds availability=0 per date", async () => {
    await executeProposal(svc, {
      proposal: otaRow("block_dates", { propertyId: "prop-1", dates: ["2026-07-01", "2026-07-02"] }),
      hostId: HOST,
    });
    expect(mockApply).toHaveBeenCalledTimes(1);
    const [, opts] = mockApply.mock.calls[0];
    expect(opts.propertyId).toBe("prop-1");
    expect(opts.perDate.get("2026-07-01")).toEqual({ availability: 0 });
    expect(opts.perDate.get("2026-07-02")).toEqual({ availability: 0 });
  });

  test("adjust_price builds rate (+ availability:1/stop_sell:false no-ops)", async () => {
    await executeProposal(svc, {
      proposal: otaRow("adjust_price", { propertyId: "prop-1", dates: ["2026-07-01"], rate: 250 }),
      hostId: HOST,
    });
    const [, opts] = mockApply.mock.calls[0];
    expect(opts.perDate.get("2026-07-01")).toEqual({ rate: 250, availability: 1, stop_sell: false });
  });

  test("adjust_price RECORDS pricing_performance on push success (A4 outcome-flywheel gap)", async () => {
    mockApply.mockResolvedValue({
      ok: true, pushedChannels: ["BDC", "ABB"], failedChannels: [], skipped: [],
      successByDate: new Map(), failedByDate: new Map(),
      targets: [{ channel_code: "BDC", rate_plan_id: "rp" }], bdcPlans: [], priorStateByChannel: new Map(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upserts: Array<{ rows: any[]; opts: any }> = [];
    const perfSvc = {
      from: (table: string) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upsert: (rows: any[], opts: any) => {
          if (table === "pricing_performance") upserts.push({ rows, opts });
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as Parameters<typeof executeProposal>[0];

    await executeProposal(perfSvc, {
      proposal: otaRow("adjust_price", { propertyId: "prop-1", dates: ["2026-07-01", "2026-07-02"], rate: 250 }),
      hostId: HOST,
    });
    expect(upserts).toHaveLength(1);
    expect(upserts[0].opts.onConflict).toBe("property_id,date");
    expect(upserts[0].rows.map((r) => r.date)).toEqual(["2026-07-01", "2026-07-02"]);
    const row = upserts[0].rows[0];
    expect(row.property_id).toBe("prop-1");
    expect(row.suggested_rate).toBe(250);
    expect(row.applied_rate).toBe(250);
    expect(row.booked).toBe(false);
    expect(row.channels_pushed).toEqual(["booking_com", "airbnb"]); // BDC/ABB → slugs
  });

  test("block_dates does NOT write pricing_performance (no rate to record)", async () => {
    const upserts: unknown[] = [];
    const perfSvc = {
      from: (table: string) => ({
        upsert: (rows: unknown) => {
          if (table === "pricing_performance") upserts.push(rows);
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as Parameters<typeof executeProposal>[0];
    await executeProposal(perfSvc, {
      proposal: otaRow("block_dates", { propertyId: "prop-1", dates: ["2026-07-01"] }),
      hostId: HOST,
    });
    expect(upserts).toHaveLength(0);
  });

  test("set_min_stay builds min_stay_arrival per date", async () => {
    await executeProposal(svc, {
      proposal: otaRow("set_min_stay", { propertyId: "prop-1", dates: ["2026-07-01"], minStay: 3 }),
      hostId: HOST,
    });
    const [, opts] = mockApply.mock.calls[0];
    expect(opts.perDate.get("2026-07-01")).toEqual({ min_stay_arrival: 3 });
  });

  test("adjust_price with a missing rate → ok:false, dispatch NOT called", async () => {
    const r = await executeProposal(svc, {
      proposal: otaRow("adjust_price", { propertyId: "prop-1", dates: ["2026-07-01"] }),
      hostId: HOST,
    });
    expect(r.ok).toBe(false);
    expect(mockApply).not.toHaveBeenCalled();
  });

  test("a dispatch refusal surfaces as a failed execute + failed audit", async () => {
    mockApply.mockResolvedValue({
      ok: false,
      pushedChannels: [],
      failedChannels: [],
      skipped: [{ channel_code: "ABB", reason: "non_bdc_availability_unwrapped" }],
      successByDate: new Map(),
      failedByDate: new Map(),
      targets: [{ channel_code: "ABB", rate_plan_id: "rp" }],
      bdcPlans: [],
      priorStateByChannel: new Map(),
      refusedReason: undefined,
    });
    const r = await executeProposal(svc, {
      proposal: otaRow("block_dates", { propertyId: "prop-1", dates: ["2026-07-01"] }),
      hostId: HOST,
    });
    expect(r.ok).toBe(false);
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed", stakes_class: "high" }));
  });
});

describe("belt 1 — normalizeProposal.executable reflects the OTA gate", () => {
  test("OTA action: executable=false when the gate is off, otaTouching=true", () => {
    process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = "";
    const n = normalizeProposal(otaRow("block_dates", { propertyId: "prop-1", dates: ["2026-07-01"] }));
    expect(n.otaTouching).toBe(true);
    expect(n.executable).toBe(false);
  });

  test("OTA action: executable=true when the gate is on", () => {
    process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = "true";
    const n = normalizeProposal(otaRow("adjust_price", { propertyId: "prop-1", dates: ["2026-07-01"], rate: 200 }));
    expect(n.executable).toBe(true);
  });

  test("non-OTA action (assign_cleaner): always executable, otaTouching=false", () => {
    process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = "";
    const n = normalizeProposal(otaRow("assign_cleaner", { taskId: "t", cleanerId: "c" }));
    expect(n.otaTouching).toBe(false);
    expect(n.executable).toBe(true);
  });

  test("unknown action_type: never executable", () => {
    const n = normalizeProposal(otaRow("launch_rockets", {}));
    expect(n.executable).toBe(false);
    expect(n.otaTouching).toBe(false);
  });
});
