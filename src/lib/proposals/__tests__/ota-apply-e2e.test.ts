/**
 * P4.3 — the approved-proposal → OTA push chain proven END-TO-END, dark.
 *
 * The existing suites each prove ONE layer in isolation (ota-actions mocks the
 * writer; ota-apply tests the writer without executeProposal; propose-ota proves
 * the propose-time whiplash clamp). This suite wires the WHOLE chain together with
 * ONLY Channex + the audit-writer mocked — applyOtaRestrictions and
 * buildSafeBdcRestrictions run FOR REAL — so a regression in the seam (executeProposal
 * no longer dispatching, the perDate shape drifting, the gate no longer short-
 * circuiting, safe-restrictions no longer guarding) is caught here, not in prod.
 *
 * Chain: executeProposal(adjust_price) → executeOtaOp → applyOtaRestrictions
 *        → buildSafeBdcRestrictions (BDC ±10% clobber band) → channex.updateRestrictions.
 *
 * The 3-belt execution-impossibility WHILE THE GATE IS OFF is re-asserted as the
 * load-bearing invariant: with the flag off, NOTHING reaches Channex.
 *
 * NOTE: applyOtaRestrictions + buildSafeBdcRestrictions are deliberately NOT
 * mocked here (that's the whole point); only createChannexClient + writeAuditLog are.
 */

jest.mock("@/lib/channex/client");
jest.mock("@/lib/action-substrate/audit-writer");

import { executeProposal, type ProposalRow } from "../server";
import { createChannexClient } from "@/lib/channex/client";
import { writeAuditLog } from "@/lib/action-substrate/audit-writer";

const mockCreateChannex = createChannexClient as jest.MockedFunction<typeof createChannexClient>;
const mockAudit = writeAuditLog as jest.MockedFunction<typeof writeAuditLog>;

const HOST = "host-1";
const CPX = "cpx-1";
const RATE_PLAN_BDC = "rp-bdc";

type BdcDateState = { rate?: string; availability?: number; stop_sell?: boolean; min_stay_arrival?: number };

function mockChannex(bdcState: Record<string, BdcDateState>) {
  const updateRestrictions = jest.fn((batch: Array<Record<string, unknown>>) => {
    void batch;
    return Promise.resolve({ data: {} });
  });
  const getRestrictionsBucketed = jest.fn(async () => ({ [RATE_PLAN_BDC]: bdcState }));
  return { updateRestrictions, getRestrictionsBucketed };
}

function mockSvc() {
  const propRow = { id: "prop-1", channex_property_id: CPX };
  const props = { select: () => props, eq: () => props, maybeSingle: async () => ({ data: propRow }) };
  const channels = [{ channel_code: "BDC", settings: { rate_plan_id: RATE_PLAN_BDC }, status: "active" }];
  const chans = {
    select: () => chans,
    eq: () => chans,
    then: (resolve: (v: { data: unknown }) => unknown) => resolve({ data: channels }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (t: string) => (t === "properties" ? props : t === "property_channels" ? chans : {}) } as any;
}

function adjustPriceProposal(rate: number, dates: string[] = ["2026-07-01"]): ProposalRow {
  return {
    id: "p1",
    host_id: HOST,
    property_id: "prop-1",
    action_type: "adjust_price",
    // payload.action.rate is the ALREADY-whiplash-bounded value (propose-time clamp).
    payload: { block: {}, action: { propertyId: "prop-1", dates, rate } },
    rationale: "r",
    status: "pending",
    created_by: "agent",
    created_at: "2026-06-12T00:00:00Z",
    decided_at: null,
    executed_at: null,
    result: null,
  };
}

const prevFlag = process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH;
beforeEach(() => {
  jest.clearAllMocks();
  mockAudit.mockResolvedValue({ audit_log_id: "a", created_at: "t" });
});
afterAll(() => {
  if (prevFlag === undefined) delete process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH;
  else process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = prevFlag;
});

describe("P4.3 — 3-belt impossibility intact WHILE OFF (end-to-end)", () => {
  test("gate OFF: executeProposal refuses, NOTHING reaches Channex", async () => {
    process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = ""; // off
    const channex = mockChannex({ "2026-07-01": { rate: "200.00", availability: 1 } });
    mockCreateChannex.mockReturnValue(channex as never);

    const r = await executeProposal(mockSvc(), { proposal: adjustPriceProposal(210), hostId: HOST });

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected refusal");
    expect(r.error).toMatch(/disabled/i);
    // belt 2 short-circuits BEFORE the writer — createChannexClient never even
    // runs, AND no execution is attempted so no audit row is written (a refused
    // OTA action while-off is a non-event, not a failed action).
    expect(mockCreateChannex).not.toHaveBeenCalled();
    expect(channex.updateRestrictions).not.toHaveBeenCalled();
    expect(channex.getRestrictionsBucketed).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("P4.3 — full chain WHEN ON (mocked Channex), safe-restrictions still guards", () => {
  beforeEach(() => {
    process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = "true";
  });

  test("in-band rate flows executeProposal → writer → safe-restrictions → Channex (cents)", async () => {
    // current BDC rate 200; proposal 210 = +5%, inside the safe ±10% band.
    const channex = mockChannex({ "2026-07-01": { rate: "200.00", availability: 1, stop_sell: false } });
    mockCreateChannex.mockReturnValue(channex as never);

    const r = await executeProposal(mockSvc(), { proposal: adjustPriceProposal(210), hostId: HOST });

    expect(r.ok).toBe(true);
    // safe-restrictions read the current BDC state (proves the real helper ran)...
    expect(channex.getRestrictionsBucketed).toHaveBeenCalledTimes(1);
    // ...and pushed exactly the bounded rate, in cents, on the BDC rate plan.
    const pushed = channex.updateRestrictions.mock.calls[0][0] as Array<{ rate: number; rate_plan_id: string; stop_sell?: unknown }>;
    expect(pushed[0].rate).toBe(21000);
    expect(pushed[0].rate_plan_id).toBe(RATE_PLAN_BDC);
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "succeeded" }));
  });

  test("safe-restrictions DROPS an out-of-band proposal rate → nothing pushed (clobber guard)", async () => {
    // current BDC rate 200; proposal 260 = +30%, OUTSIDE the safe ±10% band. Even
    // though it reached execute, the BDC clobber guard refuses to push it.
    const channex = mockChannex({ "2026-07-01": { rate: "200.00", availability: 1, stop_sell: false } });
    mockCreateChannex.mockReturnValue(channex as never);

    const r = await executeProposal(mockSvc(), { proposal: adjustPriceProposal(260), hostId: HOST });

    expect(r.ok).toBe(false);
    expect(channex.updateRestrictions).not.toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed" }));
  });

  test("a block never emits stop_sell on BDC, even through the full chain", async () => {
    const channex = mockChannex({ "2026-07-01": { rate: "200.00", availability: 1, stop_sell: false, min_stay_arrival: 1 } });
    mockCreateChannex.mockReturnValue(channex as never);

    const blockProposal: ProposalRow = {
      ...adjustPriceProposal(0),
      action_type: "block_dates",
      payload: { block: {}, action: { propertyId: "prop-1", dates: ["2026-07-01"] } },
    };
    const r = await executeProposal(mockSvc(), { proposal: blockProposal, hostId: HOST });

    expect(r.ok).toBe(true);
    const pushed = channex.updateRestrictions.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(pushed[0].availability).toBe(0);
    expect(pushed[0]).not.toHaveProperty("stop_sell");
  });
});
