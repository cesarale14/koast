/**
 * Characterization tests for POST /api/channels/rates/[propertyId].
 *
 * Written BEFORE the H3.3 migration (push loop → applyOtaRestrictions) as the
 * safety net. They pin the route's OBSERVABLE behavior — gate, the calendar_rates
 * override upsert, the Channex push (cents), and the response (ok / pushed /
 * push_error / per_date / bdc_plan), the last two consumed by CalendarSidebar +
 * PerChannelRateEditor. applyOtaRestrictions runs FOR REAL post-migration; only
 * Channex + the gate are mocked.
 *
 * property_channels is read TWO ways here: the route resolves the single channel
 * link via .maybeSingle() (an object), while the writer reads all active channels
 * via the thenable (an array) — so the mock chain returns the object on
 * maybeSingle AND [object] on then.
 */

import { POST } from "../route";
import { NextRequest } from "next/server";
import { mockSupabaseClient, mockSupabaseQuery } from "@/__tests__/helpers/supabase";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/supabase/service");
jest.mock("@/lib/channex/client");
jest.mock("@/lib/channex/calendar-push-gate");

import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import { isCalendarPushEnabled, isBdcChannelCode, CALENDAR_PUSH_DISABLED_MESSAGE } from "@/lib/channex/calendar-push-gate";

const HOST = "00000000-0000-0000-0000-0000000aa001";
const PROP = "11111111-1111-1111-1111-1111111aa001";
const CPX = "channex-prop-1";
const RP_ABB = "rp-abb-1";

function augmentWrites(chain: Record<string, unknown>): { upsert: jest.Mock } {
  const writeThen = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  const upsert = jest.fn(() => ({ then: writeThen }));
  chain.upsert = upsert;
  return { upsert };
}

function buildRequest(body: Record<string, unknown>): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

function setup(link: { channel_code: string; settings: { rate_plan_id?: string } | null; status: string }) {
  const supabase = mockSupabaseClient();
  mockSupabaseQuery(supabase, "properties", { data: { id: PROP, channex_property_id: CPX }, error: null });

  // Custom property_channels chain: object on maybeSingle (route), [object] on then (writer).
  const linkObj = { channex_channel_id: "ch-1", ...link };
  const pc: Record<string, unknown> = {
    select: () => pc,
    eq: () => pc,
    in: () => pc,
    maybeSingle: async () => ({ data: linkObj, error: null }),
    then: (r: (v: { data: unknown }) => unknown) => r({ data: [linkObj] }),
  };
  supabase.__fromMocks.set("property_channels", pc as never);

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
  (createChannexClient as jest.Mock).mockReturnValue(channex);
  (createServiceClient as jest.Mock).mockReturnValue(supabase);

  return { supabase, channex, calWrites };
}

beforeEach(() => jest.clearAllMocks());

test("BDC gate OFF → 503 (Airbnb saves still work)", async () => {
  setup({ channel_code: "BDC", settings: { rate_plan_id: "rp-bdc" }, status: "active" });
  (isCalendarPushEnabled as jest.Mock).mockReturnValue(false);
  const res = await POST(buildRequest({ date_from: "2026-07-01", date_to: "2026-07-01", channel_code: "BDC", rate: 200 }), { params: { propertyId: PROP } });
  expect(res.status).toBe(503);
  const body = await res.json();
  expect(body.error).toContain(CALENDAR_PUSH_DISABLED_MESSAGE);
});

test("non-BDC (ABB) single date: pushes in cents, upserts override, per_date ok", async () => {
  const { channex, calWrites } = setup({ channel_code: "ABB", settings: { rate_plan_id: RP_ABB }, status: "active" });
  const res = await POST(
    buildRequest({ dates: ["2026-07-01"], channel_code: "ABB", rate: 185 }),
    { params: { propertyId: PROP } },
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.pushed).toBe(true);
  expect(body.push_error).toBeNull();
  expect(body.channel_code).toBe("ABB");
  expect(body.rate_plan_id).toBe(RP_ABB);
  expect(body.per_date).toEqual([{ date: "2026-07-01", status: "ok" }]);
  expect(body.bdc_plan).toBeNull();
  // pushed to Channex in cents on the ABB rate plan
  const pushed = channex.updateRestrictions.mock.calls[0][0] as Array<{ rate: number; rate_plan_id: string }>;
  expect(pushed[0].rate).toBe(18500);
  expect(pushed[0].rate_plan_id).toBe(RP_ABB);
  // override row upserted
  expect(calWrites.upsert).toHaveBeenCalled();
  const upsertArg = calWrites.upsert.mock.calls[0][0] as Array<{ channel_code: string; applied_rate: number }>;
  expect(upsertArg[0].channel_code).toBe("ABB");
  expect(upsertArg[0].applied_rate).toBe(185);
});

test("a Channex failure surfaces as push_error + per_date failed (override still saved)", async () => {
  const { channex } = setup({ channel_code: "ABB", settings: { rate_plan_id: RP_ABB }, status: "active" });
  channex.updateRestrictions.mockImplementation(() => Promise.reject(new Error("channex 422")));
  const res = await POST(
    buildRequest({ dates: ["2026-07-01"], channel_code: "ABB", rate: 185 }),
    { params: { propertyId: PROP } },
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.pushed).toBe(false);
  expect(body.push_error).toMatch(/channex 422/);
  expect(body.per_date).toEqual([{ date: "2026-07-01", status: "failed", error: expect.stringMatching(/channex 422/) }]);
});
