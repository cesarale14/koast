/**
 * resolveAccess (P5) — the plan-resolution matrix. The single source of "does this
 * host have Pro right now?". Billing-enabled is toggled via STRIPE_SECRET_KEY.
 */

import { resolveAccess } from "../plan";

function svcWith(row: Record<string, unknown> | null) {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row }) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => chain } as any;
}

const KEY = "STRIPE_SECRET_KEY";
const prev = process.env[KEY];
afterEach(() => {
  if (prev === undefined) delete process.env[KEY];
  else process.env[KEY] = prev;
});

describe("billing OFF (no Stripe env) — INERT, everyone has access", () => {
  test("proAccess true for everyone, billingEnabled false, no DB read needed", async () => {
    delete process.env[KEY];
    // svc that would throw if read — proves the short-circuit happens first.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = { from: () => { throw new Error("should not read"); } } as any;
    const r = await resolveAccess(svc, "u1");
    expect(r.proAccess).toBe(true);
    expect(r.billingEnabled).toBe(false);
    expect(r.source).toBe("billing_disabled");
  });
});

describe("billing ON — derived from the row", () => {
  beforeEach(() => { process.env[KEY] = "sk_test_x"; });

  test("comped → Pro (owner / dogfood / A-rig)", async () => {
    const r = await resolveAccess(svcWith({ comped: true, status: null }), "owner");
    expect(r.proAccess).toBe(true);
    expect(r.plan).toBe("pro");
    expect(r.source).toBe("comped");
  });

  test.each(["active", "trialing"])("status %s → Pro", async (status) => {
    const r = await resolveAccess(svcWith({ comped: false, status }), "u");
    expect(r.proAccess).toBe(true);
    expect(r.plan).toBe("pro");
    expect(r.source).toBe("stripe");
  });

  test.each(["canceled", "past_due", "unpaid", "incomplete"])("status %s → Free", async (status) => {
    const r = await resolveAccess(svcWith({ comped: false, status }), "u");
    expect(r.proAccess).toBe(false);
    expect(r.plan).toBe("free");
  });

  test("no subscription row → Free", async () => {
    const r = await resolveAccess(svcWith(null), "u");
    expect(r.proAccess).toBe(false);
    expect(r.plan).toBe("free");
    expect(r.source).toBe("default");
  });

  test("comped beats a canceled status (never downgrades)", async () => {
    const r = await resolveAccess(svcWith({ comped: true, status: "canceled" }), "owner");
    expect(r.proAccess).toBe(true);
    expect(r.source).toBe("comped");
  });
});
