/**
 * Characterization tests for POST /api/calendar/rates/apply.
 *
 * Written BEFORE the H3.3 migration (push loop → applyOtaRestrictions) as the
 * safety net per the brief: they pin the route's OBSERVABLE behavior (gate,
 * response shape, the calendar_rates write, the Channex push) so the refactor is
 * proven behavior-preserving on the success paths.
 *
 * applyOtaRestrictions runs FOR REAL post-migration (it's the whole point); only
 * Channex + the locks + the gate are mocked. A non-BDC channel (ABB) avoids the
 * safe-restrictions read in the success-path assertions.
 */

import { POST } from "../route";
import { NextRequest } from "next/server";
import { mockSupabaseClient, mockSupabaseQuery } from "@/__tests__/helpers/supabase";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/supabase/service");
jest.mock("@/lib/channex/client");
jest.mock("@/lib/concurrency/locks");
jest.mock("@/lib/channex/calendar-push-gate");

import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import { acquireLock, releaseLock } from "@/lib/concurrency/locks";
import {
  isCalendarPushEnabled,
  isBdcChannelCode,
  CALENDAR_PUSH_DISABLED_MESSAGE,
} from "@/lib/channex/calendar-push-gate";

const HOST = "00000000-0000-0000-0000-0000000aa001";
const PROP = "11111111-1111-1111-1111-1111111aa001";
const CPX = "channex-prop-1";
const RP_ABB = "rp-abb-1";

function augmentWrites(chain: Record<string, unknown>): { upsert: jest.Mock; delete: jest.Mock } {
  const writeThen = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  const upsert = jest.fn(() => ({ then: writeThen }));
  const del = jest.fn(() => chain);
  chain.upsert = upsert;
  chain.delete = del;
  return { upsert, delete: del };
}

function buildRequest(body: Record<string, unknown>): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

function setup(opts: { channels?: Array<{ channel_code: string; channel_name: string; settings: { rate_plan_id?: string } | null; status: string }> }) {
  const channels = opts.channels ?? [
    { channel_code: "ABB", channel_name: "Airbnb", settings: { rate_plan_id: RP_ABB }, status: "active" },
  ];
  const supabase = mockSupabaseClient();
  mockSupabaseQuery(supabase, "properties", { data: { id: PROP, channex_property_id: CPX }, error: null });
  mockSupabaseQuery(supabase, "property_channels", { data: channels, error: null });
  mockSupabaseQuery(supabase, "calendar_rates", { data: [], error: null });
  const calWrites = augmentWrites(supabase.__fromMocks.get("calendar_rates")!);

  const channex = {
    updateRestrictions: jest.fn((batch: Array<Record<string, unknown>>) => {
      void batch;
      return Promise.resolve({ data: {} });
    }),
    getRestrictionsBucketed: jest.fn(async () => ({ [RP_ABB]: {} })),
  };

  (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: HOST } });
  (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);
  (isCalendarPushEnabled as jest.Mock).mockReturnValue(true);
  (isBdcChannelCode as jest.Mock).mockImplementation((c: string) => c === "BDC");
  (acquireLock as jest.Mock).mockResolvedValue(true);
  (releaseLock as jest.Mock).mockResolvedValue(undefined);
  (createChannexClient as jest.Mock).mockReturnValue(channex);
  (createServiceClient as jest.Mock).mockReturnValue(supabase);

  return { supabase, channex, calWrites };
}

beforeEach(() => jest.clearAllMocks());

test("gate OFF → 503, no push", async () => {
  setup({});
  (isCalendarPushEnabled as jest.Mock).mockReturnValue(false);
  const res = await POST(buildRequest({ property_id: PROP, date: "2026-07-01", mode: "platform", channel_code: "ABB", rate: 180, idempotency_key: "k1" }));
  expect(res.status).toBe(503);
  const body = await res.json();
  expect(body.error).toBe(CALENDAR_PUSH_DISABLED_MESSAGE);
});

test("platform mode (non-BDC): pushes ABB in cents + upserts the override row", async () => {
  const { channex, calWrites } = setup({});
  const res = await POST(buildRequest({ property_id: PROP, date: "2026-07-01", mode: "platform", channel_code: "ABB", rate: 180, idempotency_key: "k2" }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.channels_pushed).toEqual(["ABB"]);
  // pushed to Channex in cents on the ABB rate plan
  const pushed = channex.updateRestrictions.mock.calls[0][0] as Array<{ rate: number; rate_plan_id: string }>;
  expect(pushed[0].rate).toBe(18000);
  expect(pushed[0].rate_plan_id).toBe(RP_ABB);
  // override row upserted for the ABB channel
  expect(calWrites.upsert).toHaveBeenCalled();
  const upsertArg = calWrites.upsert.mock.calls[0][0] as Array<{ channel_code: string; applied_rate: number }>;
  expect(upsertArg[0].channel_code).toBe("ABB");
  expect(upsertArg[0].applied_rate).toBe(180);
});

test("master mode: upserts the base (channel_code NULL) row", async () => {
  const { calWrites } = setup({});
  const res = await POST(buildRequest({ property_id: PROP, date: "2026-07-01", mode: "master", rate: 200, idempotency_key: "k3" }));
  expect(res.status).toBe(200);
  // the base-row upsert is the FIRST calendar_rates upsert in master mode
  const baseUpsert = calWrites.upsert.mock.calls.find(
    (c) => Array.isArray(c[0]) && (c[0] as Array<{ channel_code: string | null }>)[0]?.channel_code === null,
  );
  expect(baseUpsert).toBeDefined();
});
