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
  const sub = {
    select: () => sub, eq: () => sub,
    maybeSingle: async () => ({ data: customerId ? { stripe_customer_id: customerId } : null }),
    upsert: jest.fn(async () => ({ error: null })),
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
  // trial wired
  const sessionArg = stripe.checkout.sessions.create.mock.calls[0][0] as { subscription_data: { trial_period_days: number }; line_items: Array<{ price: string }> };
  expect(sessionArg.subscription_data.trial_period_days).toBe(14);
  expect(sessionArg.line_items[0].price).toBe("price_pro");
});

test("existing customer → reuses it, no customers.create", async () => {
  const stripe = stripeMock();
  (getStripe as jest.Mock).mockReturnValue(stripe);
  (createServiceClient as jest.Mock).mockReturnValue(svcMock("cus_existing"));
  const res = await POST();
  expect(res.status).toBe(200);
  expect(stripe.customers.create).not.toHaveBeenCalled();
});
