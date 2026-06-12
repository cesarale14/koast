/**
 * POST /api/webhooks/stripe (P5) — signature verify + idempotent atomic claim +
 * rollback-on-failure. Stripe + the DB + the sync mapper are mocked.
 */

jest.mock("@/lib/billing/stripe");
jest.mock("@/lib/supabase/service");
jest.mock("@/lib/billing/sync");

import { POST } from "../route";
import { getStripe, isBillingEnabled } from "@/lib/billing/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { syncSubscriptionToDb } from "@/lib/billing/sync";

const mockSync = syncSubscriptionToDb as jest.MockedFunction<typeof syncSubscriptionToDb>;

function req(body: string, sig = "sig"): import("next/server").NextRequest {
  return {
    text: async () => body,
    headers: { get: (h: string) => (h === "stripe-signature" ? sig : null) },
  } as unknown as import("next/server").NextRequest;
}

function stripeMock(opts: { construct?: () => unknown; retrieveStatus?: string }) {
  return {
    webhooks: {
      constructEvent: jest.fn(() => {
        if (opts.construct) return opts.construct();
        throw new Error("not configured");
      }),
    },
    subscriptions: { retrieve: jest.fn(async () => ({ id: "sub_1", status: opts.retrieveStatus ?? "active" })) },
  };
}

function svcMock(claimError: { code?: string } | null) {
  const calls = { deleted: false };
  const events = {
    insert: jest.fn(async () => ({ error: claimError })),
    delete: () => ({ eq: async () => { calls.deleted = true; return { error: null }; } }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = { from: (t: string) => (t === "stripe_events" ? events : {}) } as any;
  return { client, events, calls };
}

beforeEach(() => {
  jest.clearAllMocks();
  (isBillingEnabled as jest.Mock).mockReturnValue(true);
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  mockSync.mockResolvedValue({ ok: true, userId: "u1", tier: "pro", comped: false });
});
afterAll(() => { delete process.env.STRIPE_WEBHOOK_SECRET; });

test("billing OFF → 200 ignored, no verify", async () => {
  (isBillingEnabled as jest.Mock).mockReturnValue(false);
  (getStripe as jest.Mock).mockReturnValue(null);
  const res = await POST(req("{}"));
  expect(res.status).toBe(200);
  expect((await res.json()).ignored).toBe("billing_disabled");
});

test("bad signature → 400, no DB write", async () => {
  const stripe = stripeMock({}); // constructEvent throws
  (getStripe as jest.Mock).mockReturnValue(stripe);
  const { client } = svcMock(null);
  (createServiceClient as jest.Mock).mockReturnValue(client);
  const res = await POST(req("{}", "bad"));
  expect(res.status).toBe(400);
});

test("valid first delivery → claim + sync + 200", async () => {
  const event = { id: "evt_1", type: "customer.subscription.updated", data: { object: { id: "sub_1", customer: "cus_1", status: "active" } } };
  const stripe = stripeMock({ construct: () => event });
  (getStripe as jest.Mock).mockReturnValue(stripe);
  const { client, events } = svcMock(null);
  (createServiceClient as jest.Mock).mockReturnValue(client);

  const res = await POST(req(JSON.stringify(event)));
  expect(res.status).toBe(200);
  expect(events.insert).toHaveBeenCalledWith({ id: "evt_1", type: "customer.subscription.updated" });
  expect(mockSync).toHaveBeenCalledTimes(1);
});

test("duplicate delivery (unique violation) → 200 skip, sync NOT called", async () => {
  const event = { id: "evt_1", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } };
  const stripe = stripeMock({ construct: () => event });
  (getStripe as jest.Mock).mockReturnValue(stripe);
  const { client } = svcMock({ code: "23505" }); // claim conflict
  (createServiceClient as jest.Mock).mockReturnValue(client);

  const res = await POST(req(JSON.stringify(event)));
  expect(res.status).toBe(200);
  expect((await res.json()).duplicate).toBe(true);
  expect(mockSync).not.toHaveBeenCalled();
});

test("handler failure → claim rolled back + 500 (Stripe retries)", async () => {
  const event = { id: "evt_1", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } };
  const stripe = stripeMock({ construct: () => event });
  (getStripe as jest.Mock).mockReturnValue(stripe);
  const { client, calls } = svcMock(null);
  (createServiceClient as jest.Mock).mockReturnValue(client);
  mockSync.mockRejectedValue(new Error("db down"));

  const res = await POST(req(JSON.stringify(event)));
  expect(res.status).toBe(500);
  expect(calls.deleted).toBe(true); // claim rolled back so the retry reprocesses
});
