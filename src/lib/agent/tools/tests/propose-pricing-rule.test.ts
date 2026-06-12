/**
 * propose_update_pricing_rule (P4.1) — the agent's host-gated proposal to change
 * a property's pricing guardrails. Proves: property resolution + refusal-over-
 * guessing, propose-time validation (refuse a patch that breaks min<=base<=max
 * BEFORE creating a proposal), the no-op + missing-rules refusals, and the exact
 * action payload + rule_change block stored. createProposal is mocked.
 */

jest.mock("@/lib/supabase/service");
jest.mock("@/lib/proposals/server");

import { proposeUpdatePricingRuleTool } from "../propose-pricing-rule";
import { createServiceClient } from "@/lib/supabase/service";
import { createProposal } from "@/lib/proposals/server";

const mockCreate = createProposal as jest.MockedFunction<typeof createProposal>;
const HOST = "host-1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { host: { id: HOST } } as any;

function fakeSvc(opts: {
  properties?: Array<{ id: string; name: string }>;
  rulesRow?: { base_rate: number; min_rate: number; max_rate: number } | null;
}) {
  const properties = opts.properties ?? [{ id: "prop-1", name: "Villa Jamaica" }];
  const props = { select: () => props, eq: () => props, then: (r: (v: { data: unknown }) => unknown) => r({ data: properties }) };
  const rules = {
    select: () => rules,
    eq: () => rules,
    maybeSingle: async () => ({ data: opts.rulesRow ?? null }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (t: string) => (t === "properties" ? props : t === "pricing_rules" ? rules : {}) } as any;
}

function setSvc(opts: Parameters<typeof fakeSvc>[0]) {
  (createServiceClient as jest.Mock).mockReturnValue(fakeSvc(opts));
}

const VILLA = { base_rate: 218, min_rate: 181, max_rate: 230 };

beforeEach(() => {
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreate.mockResolvedValue({ proposal: { id: "prop-xyz" } as any, autoExecuted: false });
});

describe("refusal over guessing", () => {
  test("no property match → created:false, createProposal not called", async () => {
    setSvc({ properties: [{ id: "prop-1", name: "Villa Jamaica" }] });
    const r = await proposeUpdatePricingRuleTool.handler(
      { property: "Beach House", field: "max_rate", value: 260, rationale: "x" },
      ctx,
    );
    expect(r.created).toBe(false);
    expect(r.reason).toMatch(/No property matches/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("property with no pricing_rules row → created:false", async () => {
    setSvc({ rulesRow: null });
    const r = await proposeUpdatePricingRuleTool.handler(
      { property: "Villa Jamaica", field: "max_rate", value: 260, rationale: "x" },
      ctx,
    );
    expect(r.created).toBe(false);
    expect(r.reason).toMatch(/no pricing rules yet/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("propose_update_pricing_rule — the P4.1 ceiling raise", () => {
  test("raises max_rate: creates an update_pricing_rule proposal with patch + rule_change block", async () => {
    setSvc({ rulesRow: VILLA });
    const r = await proposeUpdatePricingRuleTool.handler(
      { property: "Villa Jamaica", field: "max_rate", value: 260, rationale: "comps floor $238 > your $230" },
      ctx,
    );
    expect(r.created).toBe(true);
    const arg = mockCreate.mock.calls[0][1];
    expect(arg.actionType).toBe("update_pricing_rule");
    expect(arg.createdBy).toBe("agent");
    expect((arg.payload as { action: { propertyId: string; patch: Record<string, number> } }).action).toEqual({
      propertyId: "prop-1",
      patch: { max_rate: 260 },
    });
    const block = (arg.payload as { block: { kind: string; data: { field: string; oldValue: number; newValue: number } } }).block;
    expect(block.kind).toBe("rule_change");
    expect(block.data.field).toBe("max_rate");
    expect(block.data.oldValue).toBe(230);
    expect(block.data.newValue).toBe(260);
  });

  test("pre-validates: a min_rate above base is refused at PROPOSE time (no proposal)", async () => {
    setSvc({ rulesRow: VILLA });
    const r = await proposeUpdatePricingRuleTool.handler(
      { property: "Villa Jamaica", field: "min_rate", value: 250, rationale: "x" },
      ctx,
    );
    expect(r.created).toBe(false);
    expect(r.reason).toMatch(/min_rate.*≤.*base_rate/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("no-op (value already current) → created:false", async () => {
    setSvc({ rulesRow: VILLA });
    const r = await proposeUpdatePricingRuleTool.handler(
      { property: "Villa Jamaica", field: "max_rate", value: 230, rationale: "x" },
      ctx,
    );
    expect(r.created).toBe(false);
    expect(r.reason).toMatch(/already \$230/);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
