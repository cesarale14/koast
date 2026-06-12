/**
 * requireProAccess / hasProAccess (P5) — the server-side gate. INERT when billing
 * is off; throws PlanGateError for a free host when billing is on; passes for
 * comped + active/trialing.
 */

import { requireProAccess, hasProAccess, PlanGateError } from "../gate";

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

describe("requireProAccess", () => {
  test("billing OFF → inert (no throw), no DB read", async () => {
    delete process.env[KEY];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = { from: () => { throw new Error("should not read"); } } as any;
    await expect(requireProAccess(svc, "u")).resolves.toBeUndefined();
  });

  test("billing ON + free host → throws PlanGateError (402)", async () => {
    process.env[KEY] = "sk_test_x";
    await expect(requireProAccess(svcWith({ comped: false, status: "canceled" }), "u")).rejects.toBeInstanceOf(PlanGateError);
    try {
      await requireProAccess(svcWith(null), "u");
    } catch (e) {
      expect((e as PlanGateError).httpStatus).toBe(402);
    }
  });

  test("billing ON + comped → passes", async () => {
    process.env[KEY] = "sk_test_x";
    await expect(requireProAccess(svcWith({ comped: true, status: null }), "owner")).resolves.toBeUndefined();
  });

  test("billing ON + active → passes", async () => {
    process.env[KEY] = "sk_test_x";
    await expect(requireProAccess(svcWith({ comped: false, status: "active" }), "u")).resolves.toBeUndefined();
  });
});

describe("hasProAccess", () => {
  test("billing OFF → true", async () => {
    delete process.env[KEY];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await hasProAccess({ from: () => { throw new Error("nope"); } } as any, "u")).toBe(true);
  });
  test("billing ON + free → false; + pro → true", async () => {
    process.env[KEY] = "sk_test_x";
    expect(await hasProAccess(svcWith(null), "u")).toBe(false);
    expect(await hasProAccess(svcWith({ comped: false, status: "trialing" }), "u")).toBe(true);
  });
});
