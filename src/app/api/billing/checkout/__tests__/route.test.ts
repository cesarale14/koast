/**
 * POST /api/billing/checkout (P5) — inert-safe, comped-aware Checkout Session.
 * Stripe + auth + DB + resolveAccess mocked; no real Stripe.
 */

jest.mock("@/lib/billing/stripe");
jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/supabase/service");
jest.mock("@/lib/billing/plan");

import { POST } from "../route";
import { getStripe, getProPriceId, isBillingEnabled } from "@/lib/billing/stripe";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveAccess } from "@/lib/billing/plan";

const mockResolve = resolveAccess as jest.MockedFunction<typeof resolveAccess>;

function svcMock(customerId: string | null) {
  // One object backs from("user_subscriptions") for the select (maybeSingle),
  // the INSERT (no row yet), and the UPDATE (row exists) persist paths.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub: any = {
    select: () => sub,
    eq: () => sub,
    maybeSingle: async () => ({ data: customerId ? { stripe_customer_id: customerId } : null }),
    insert: jest.fn(async () => ({ error: null })),
    update: jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) })),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => sub, __sub: sub } as any;
}

function stripeMock() {
  return {
    customers: { create: jest.fn(async () => ({ id: "cus_new" })) },
    checkout: {
      sessions: {
        create: jest.fn((opts: Record<string, unknown>) => {
          void opts;
          return Promise.resolve({ url: "https://checkout.stripe/x" });
        }),
      },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (isBillingEnabled as jest.Mock).mockReturnValue(true);
  (getProPriceId as jest.Mock).mockReturnValue("price_pro");
  (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: "u1", email: "h@x.com" } });
  mockResolve.mockResolvedValue({ proAccess: false, plan: "free", source: "default", status: null, comped: false, currentPeriodEnd: null, cancelAtPeriodEnd: false, billingEnabled: true });
});



test("billing not configured → 503", async () => {
  (isBillingEnabled as jest.Mock).mockReturnValue(false);
  (getStripe as jest.Mock).mockReturnValue(null);
  const res = await POST();
  expect(res.status).toBe(503);
});

test("comped host → 409 (already Pro, no checkout)", async () => {
  (getStripe as jest.Mock).mockReturnValue(stripeMock());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockResolve.mockResolvedValue({ comped: true } as any);
  (createServiceClient as jest.Mock).mockReturnValue(svcMock("cus_1"));
  const res = await POST();
  expect(res.status).toBe(409);
});

test("happy path: creates customer (none yet) + checkout session → url", async () => {
  const stripe = stripeMock();
  (getStripe as jest.Mock).mockReturnValue(stripe);
  const svc = svcMock(null);
  (createServiceClient as jest.Mock).mockReturnValue(svc);

  const res = await POST();
  expect(res.status).toBe(200);
  expect((await res.json()).url).toBe("https://checkout.stripe/x");
  expect(stripe.customers.create).toHaveBeenCalled();
  // The customer→user mapping row is created carrying the NOT-NULL tier
  // ('free') + the new customer id, so the webhook can later flip the plan.
  expect(svc.__sub.insert).toHaveBeenCalledWith(
    expect.objectContaining({ user_id: "u1", tier: "free", stripe_customer_id: "cus_new" }),
  );
  // trial wired
  const sessionArg = stripe.checkout.sessions.create.mock.calls[0][0] as { subscription_data: { trial_period_days: number }; line_items: Array<{ price: string }> };
  expect(sessionArg.subscription_data.trial_period_days).toBe(14);
  expect(sessionArg.line_items[0].price).toBe("price_pro");
});

test("persist failure → 500, checkout session NOT opened (never charge an unmappable customer)", async () => {
  const stripe = stripeMock();
  (getStripe as jest.Mock).mockReturnValue(stripe);
  const svc = svcMock(null);
  svc.__sub.insert = jest.fn(async () => ({ error: { message: 'null value in column "tier"' } }));
  (createServiceClient as jest.Mock).mockReturnValue(svc);

  const res = await POST();
  expect(res.status).toBe(500);
  // Aborted before opening the session — the A5 bug (charge a customer we
  // can't map back) is structurally prevented.
  expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
});

test("existing customer → reuses it, no customers.create", async () => {
  const stripe = stripeMock();
  (getStripe as jest.Mock).mockReturnValue(stripe);
  (createServiceClient as jest.Mock).mockReturnValue(svcMock("cus_existing"));
  const res = await POST();
  expect(res.status).toBe(200);
  expect(stripe.customers.create).not.toHaveBeenCalled();
});
