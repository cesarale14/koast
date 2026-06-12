/**
 * updatePricingRule (P4.1) — the extracted single-writer behind the
 * update_pricing_rule proposal action. Proves: partial patch merge + re-validation
 * of the CHECK invariant (min<=base<=max) against the MERGED row, source='host_set',
 * the no-op + missing-row + ownership refusals. verifyPropertyOwnership is mocked
 * (its own surface is tested elsewhere); here we assert the merge/validate/write.
 */

jest.mock("@/lib/auth/api-auth");

import { updatePricingRule, validatePricingBounds } from "../update-rule";
import { verifyPropertyOwnership } from "@/lib/auth/api-auth";

const mockOwn = verifyPropertyOwnership as jest.MockedFunction<typeof verifyPropertyOwnership>;
const HOST = "host-1";
const PROP = "prop-1";

type Row = { base_rate: number; min_rate: number; max_rate: number } | null;

function fakeSvc(existing: Row, capture: { update?: Record<string, unknown> } = {}) {
  const rules = {
    select: () => rules,
    eq: () => rules,
    maybeSingle: async () => ({ data: existing, error: null }),
    // update(...).eq(...) is awaited for { error }
    update: (payload: Record<string, unknown>) => {
      capture.update = payload;
      return { eq: async () => ({ error: null }) };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (t: string) => (t === "pricing_rules" ? rules : {}) } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOwn.mockResolvedValue(true);
});

describe("validatePricingBounds", () => {
  it("accepts min<=base<=max", () => {
    expect(validatePricingBounds({ base_rate: 218, min_rate: 181, max_rate: 260 })).toBeNull();
  });
  it("rejects min>base", () => {
    expect(validatePricingBounds({ base_rate: 218, min_rate: 250, max_rate: 260 })).toMatch(/min_rate.*≤.*base_rate/);
  });
  it("rejects max<base", () => {
    expect(validatePricingBounds({ base_rate: 218, min_rate: 181, max_rate: 200 })).toMatch(/max_rate.*≥.*base_rate/);
  });
});

describe("updatePricingRule", () => {
  it("raises max_rate (the P4.1 case): host_set, merged bounds, changed summary", async () => {
    const cap: { update?: Record<string, unknown> } = {};
    const svc = fakeSvc({ base_rate: 218, min_rate: 181, max_rate: 230 }, cap);
    const r = await updatePricingRule(svc, { propertyId: PROP, hostId: HOST, patch: { max_rate: 260 } });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.summary.changed).toEqual([{ field: "max_rate", from: 230, to: 260 }]);
    expect(r.summary.max_rate).toBe(260);
    expect(r.summary.base_rate).toBe(218);
    expect(cap.update?.source).toBe("host_set");
    expect(cap.update?.max_rate).toBe(260);
    expect(cap.update?.updated_at).toBeDefined();
  });

  it("rejects a patch that breaks the merged invariant (min raised above base)", async () => {
    const svc = fakeSvc({ base_rate: 218, min_rate: 181, max_rate: 230 });
    const r = await updatePricingRule(svc, { propertyId: PROP, hostId: HOST, patch: { min_rate: 250 } });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected fail");
    expect(r.error).toMatch(/min_rate.*≤.*base_rate/);
  });

  it("refuses when no pricing_rules row exists", async () => {
    const svc = fakeSvc(null);
    const r = await updatePricingRule(svc, { propertyId: PROP, hostId: HOST, patch: { max_rate: 260 } });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected fail");
    expect(r.error).toMatch(/no pricing rules yet/i);
  });

  it("no-op when the value already equals current", async () => {
    const svc = fakeSvc({ base_rate: 218, min_rate: 181, max_rate: 230 });
    const r = await updatePricingRule(svc, { propertyId: PROP, hostId: HOST, patch: { max_rate: 230 } });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected fail");
    expect(r.error).toMatch(/already the current value/i);
  });

  it("refuses on ownership failure (defense-in-depth)", async () => {
    mockOwn.mockResolvedValue(false);
    const svc = fakeSvc({ base_rate: 218, min_rate: 181, max_rate: 230 });
    const r = await updatePricingRule(svc, { propertyId: PROP, hostId: HOST, patch: { max_rate: 260 } });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected fail");
    expect(r.error).toMatch(/isn't yours/);
  });

  it("rejects a non-positive value", async () => {
    const svc = fakeSvc({ base_rate: 218, min_rate: 181, max_rate: 230 });
    const r = await updatePricingRule(svc, { propertyId: PROP, hostId: HOST, patch: { max_rate: -5 } });
    expect(r.ok).toBe(false);
  });
});
