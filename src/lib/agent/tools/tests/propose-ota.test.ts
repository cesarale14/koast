/**
 * OTA propose tools (P3.2 HARD-FLOOR) — propose_block_dates / propose_adjust_price
 * / propose_set_min_stay. Proves: property resolution + refusal-over-guessing, the
 * exact action payload + calendar_change block each tool stores, and the
 * adjust_price WHIPLASH bound (the model's raw rate is clamped against pricing_rules
 * BEFORE it reaches a proposal). createProposal is mocked (its own suite covers the
 * lane); here we assert the propose→createProposal wiring + the clamp math.
 */

jest.mock("@/lib/supabase/service");
jest.mock("@/lib/proposals/server");

import {
  proposeBlockDatesTool,
  proposeAdjustPriceTool,
  proposeSetMinStayTool,
} from "../propose-ota";
import { createServiceClient } from "@/lib/supabase/service";
import { createProposal } from "@/lib/proposals/server";

const mockCreate = createProposal as jest.MockedFunction<typeof createProposal>;
const HOST = "host-1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { host: { id: HOST } } as any;

function fakeSvc(opts: {
  properties?: Array<{ id: string; name: string }>;
  rulesRow?: Record<string, unknown> | null;
  lastRate?: number | null;
}) {
  const properties = opts.properties ?? [{ id: "prop-1", name: "Villa Jamaica" }];
  const props = { select: () => props, eq: () => props, then: (r: (v: { data: unknown }) => unknown) => r({ data: properties }) };
  const rules = { select: () => rules, eq: () => rules, maybeSingle: async () => ({ data: opts.rulesRow ?? null }) };
  const cal = {
    select: () => cal, eq: () => cal, is: () => cal, not: () => cal, order: () => cal, limit: () => cal,
    maybeSingle: async () => ({ data: opts.lastRate != null ? { applied_rate: opts.lastRate } : null }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (t: string) => (t === "properties" ? props : t === "pricing_rules" ? rules : t === "calendar_rates" ? cal : {}) } as any;
}

function setSvc(opts: Parameters<typeof fakeSvc>[0]) {
  (createServiceClient as jest.Mock).mockReturnValue(fakeSvc(opts));
}

beforeEach(() => {
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreate.mockResolvedValue({ proposal: { id: "prop-xyz" } as any, autoExecuted: false });
});

describe("refusal over guessing", () => {
  test("no property match → created:false, createProposal not called", async () => {
    setSvc({ properties: [{ id: "prop-1", name: "Villa Jamaica" }] });
    const r = await proposeBlockDatesTool.handler(
      { property: "Beach House", dates: ["2026-07-01"], rationale: "x" },
      ctx,
    );
    expect(r.created).toBe(false);
    expect(r.reason).toMatch(/No property matches/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("ambiguous property → created:false", async () => {
    setSvc({ properties: [{ id: "p1", name: "Villa One" }, { id: "p2", name: "Villa Two" }] });
    const r = await proposeBlockDatesTool.handler(
      { property: "Villa", dates: ["2026-07-01"], rationale: "x" },
      ctx,
    );
    expect(r.created).toBe(false);
    expect(r.reason).toMatch(/more than one/);
  });
});

describe("propose_block_dates", () => {
  test("creates a block_dates proposal with availability-block intent + calendar_change block", async () => {
    setSvc({});
    const r = await proposeBlockDatesTool.handler(
      { property: "Villa Jamaica", dates: ["2026-07-01", "2026-07-02"], rationale: "owner stay" },
      ctx,
    );
    expect(r.created).toBe(true);
    const arg = mockCreate.mock.calls[0][1];
    expect(arg.actionType).toBe("block_dates");
    expect(arg.createdBy).toBe("agent");
    expect((arg.payload as { action: { dates: string[]; propertyId: string; channel: null } }).action).toEqual({
      propertyId: "prop-1",
      dates: ["2026-07-01", "2026-07-02"],
      channel: null,
    });
    const block = (arg.payload as { block: { kind: string; data: { change: string; dateCount: number } } }).block;
    expect(block.kind).toBe("calendar_change");
    expect(block.data.change).toBe("block");
    expect(block.data.dateCount).toBe(2);
  });
});

describe("propose_adjust_price — whiplash bound", () => {
  const rules = {
    base_rate: 150, min_rate: 50, max_rate: 1000, channel_markups: {},
    max_daily_delta_pct: 0.25, comp_floor_pct: 0.85, auto_apply: false,
  };

  test("in-bounds rate is proposed unchanged (no clamped_to)", async () => {
    setSvc({ rulesRow: rules, lastRate: 190 }); // 200 within [50,1000] and within 25% of 190
    const r = await proposeAdjustPriceTool.handler(
      { property: "Villa Jamaica", dates: ["2026-07-01"], rate: 200, rationale: "weekend" },
      ctx,
    );
    expect(r.created).toBe(true);
    expect(r.clamped_to).toBeUndefined();
    expect((mockCreate.mock.calls[0][1].payload as { action: { rate: number } }).action.rate).toBe(200);
  });

  test("rate above max_rate is clamped DOWN to the max before it reaches the proposal", async () => {
    setSvc({ rulesRow: rules, lastRate: null }); // no prior rate → daily-delta skipped, max clamp applies
    const r = await proposeAdjustPriceTool.handler(
      { property: "Villa Jamaica", dates: ["2026-07-01"], rate: 5000, rationale: "spike" },
      ctx,
    );
    expect(r.clamped_to).toBe(1000);
    expect((mockCreate.mock.calls[0][1].payload as { action: { rate: number } }).action.rate).toBe(1000);
    expect(mockCreate.mock.calls[0][1].rationale).toMatch(/bounded to \$1000/);
  });

  test("daily-delta clamps toward the current rate (whiplash)", async () => {
    setSvc({ rulesRow: rules, lastRate: 100 }); // cap 25% → 200 clamps to 125
    const r = await proposeAdjustPriceTool.handler(
      { property: "Villa Jamaica", dates: ["2026-07-01"], rate: 200, rationale: "jump" },
      ctx,
    );
    expect(r.clamped_to).toBe(125);
    expect((mockCreate.mock.calls[0][1].payload as { action: { rate: number } }).action.rate).toBe(125);
  });
});

describe("propose_set_min_stay", () => {
  test("creates a set_min_stay proposal carrying minStay", async () => {
    setSvc({});
    const r = await proposeSetMinStayTool.handler(
      { property: "Villa Jamaica", dates: ["2026-07-04"], min_stay: 3, rationale: "holiday" },
      ctx,
    );
    expect(r.created).toBe(true);
    const arg = mockCreate.mock.calls[0][1];
    expect(arg.actionType).toBe("set_min_stay");
    expect((arg.payload as { action: { minStay: number } }).action.minStay).toBe(3);
    const block = (arg.payload as { block: { data: { change: string; value: number } } }).block;
    expect(block.data.change).toBe("min_stay");
    expect(block.data.value).toBe(3);
  });
});
