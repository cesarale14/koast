/**
 * syncSubscriptionToDb (P5) — projects a Stripe subscription onto user_subscriptions.
 * Proves: resolve-by-customer, status→tier mapping, the captured Stripe fields, and
 * the load-bearing invariant that a COMPED row is never downgraded.
 */

import { syncSubscriptionToDb } from "../sync";

type Captured = { update?: Record<string, unknown>; eqUser?: string };

function svc(row: { user_id: string; comped: boolean } | null, cap: Captured = {}) {
  const sub = {
    select: () => sub,
    eq: () => sub,
    maybeSingle: async () => ({ data: row }),
    update: (payload: Record<string, unknown>) => {
      cap.update = payload;
      return { eq: async (_c: string, v: string) => { cap.eqUser = v; return { error: null }; } };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => sub } as any;
}

// Minimal Stripe.Subscription shape the mapper reads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeSub(opts: { status: string; cancel?: boolean; trialEnd?: number; cpe?: number; price?: string }): any {
  return {
    id: "sub_123",
    customer: "cus_1",
    status: opts.status,
    cancel_at_period_end: opts.cancel ?? false,
    trial_end: opts.trialEnd ?? null,
    current_period_end: opts.cpe ?? 1_800_000_000,
    items: { data: [{ price: { id: opts.price ?? "price_pro" }, current_period_end: opts.cpe ?? 1_800_000_000 }] },
  };
}

test("no matching customer row → ok:false (acked, not retried)", async () => {
  const r = await syncSubscriptionToDb(svc(null), fakeSub({ status: "active" }));
  expect(r.ok).toBe(false);
});

test("active subscription → tier 'pro' + captured fields", async () => {
  const cap: Captured = {};
  const r = await syncSubscriptionToDb(svc({ user_id: "u1", comped: false }, cap), fakeSub({ status: "active", price: "price_pro" }));
  expect(r.ok).toBe(true);
  expect(cap.update?.tier).toBe("pro");
  expect(cap.update?.status).toBe("active");
  expect(cap.update?.stripe_subscription_id).toBe("sub_123");
  expect(cap.update?.price_id).toBe("price_pro");
  expect(cap.eqUser).toBe("u1");
});

test("canceled subscription → tier 'free'", async () => {
  const cap: Captured = {};
  await syncSubscriptionToDb(svc({ user_id: "u1", comped: false }, cap), fakeSub({ status: "canceled" }));
  expect(cap.update?.tier).toBe("free");
  expect(cap.update?.status).toBe("canceled");
});

test("COMPED row is NEVER downgraded — Stripe fields recorded, tier untouched", async () => {
  const cap: Captured = {};
  const r = await syncSubscriptionToDb(svc({ user_id: "owner", comped: true }, cap), fakeSub({ status: "canceled" }));
  expect(r.ok).toBe(true);
  // status recorded for reality, but tier NOT written (stays comped/business).
  expect(cap.update?.status).toBe("canceled");
  expect(cap.update).not.toHaveProperty("tier");
});

test("trialing → pro + trial_end captured", async () => {
  const cap: Captured = {};
  await syncSubscriptionToDb(svc({ user_id: "u1", comped: false }, cap), fakeSub({ status: "trialing", trialEnd: 1_790_000_000 }));
  expect(cap.update?.tier).toBe("pro");
  expect(cap.update?.trial_end).toBe(new Date(1_790_000_000 * 1000).toISOString());
});
