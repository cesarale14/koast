/**
 * POST /api/billing/portal (P5) — inert-safe Customer Portal session.
 */

jest.mock("@/lib/billing/stripe");
jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/supabase/service");

import { POST } from "../route";
import { getStripe, isBillingEnabled } from "@/lib/billing/stripe";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

function svcMock(customerId: string | null) {
  const sub = { select: () => sub, eq: () => sub, maybeSingle: async () => ({ data: customerId ? { stripe_customer_id: customerId } : null }) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => sub } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  (isBillingEnabled as jest.Mock).mockReturnValue(true);
  (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: "u1" } });
});



test("billing not configured → 503", async () => {
  (isBillingEnabled as jest.Mock).mockReturnValue(false);
  (getStripe as jest.Mock).mockReturnValue(null);
  expect((await POST()).status).toBe(503);
});

test("no Stripe customer yet → 409", async () => {
  (getStripe as jest.Mock).mockReturnValue({ billingPortal: { sessions: { create: jest.fn() } } });
  (createServiceClient as jest.Mock).mockReturnValue(svcMock(null));
  expect((await POST()).status).toBe(409);
});

test("happy path → portal url", async () => {
  const stripe = { billingPortal: { sessions: { create: jest.fn(async () => ({ url: "https://portal.stripe/x" })) } } };
  (getStripe as jest.Mock).mockReturnValue(stripe);
  (createServiceClient as jest.Mock).mockReturnValue(svcMock("cus_1"));
  const res = await POST();
  expect(res.status).toBe(200);
  expect((await res.json()).url).toBe("https://portal.stripe/x");
});
