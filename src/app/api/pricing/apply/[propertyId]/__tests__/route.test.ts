/**
 * Tests for the M9 Phase G E2 agent_audit_log INSERT — the only new
 * substrate this phase adds to the apply route. Coverage scope:
 *
 *   1. success-path INSERT fires (≥1 rec applied, no batch failures)
 *   2. pure-failure no INSERT (0 recs applied, all batches failed)
 *   3. partial-failure INSERT with payload.partial_failure flag
 *
 * Strategy: mock all of the route's module-boundary collaborators
 * (auth, channex, concurrency locks, calendar-push-gate, safe-restrictions)
 * and the Supabase service client (via the shared helper). Tests assert
 * on the agent_audit_log insert call shape; the rest of the route's
 * pricing pipeline is incidentally exercised but not the assertion
 * surface.
 *
 * Non-BDC channel (ABB) used in every test to avoid the safe-restrictions
 * helper path — it adds noise without adding coverage for the audit-log
 * INSERT (which fires regardless of channel type).
 */

import { POST } from "../route";
import { NextRequest } from "next/server";
import {
  mockSupabaseClient,
  mockSupabaseQuery,
} from "@/__tests__/helpers/supabase";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/supabase/service");
jest.mock("@/lib/channex/client");
jest.mock("@/lib/concurrency/locks");
jest.mock("@/lib/channex/calendar-push-gate");
jest.mock("@/lib/channex/safe-restrictions");

import {
  getAuthenticatedUser,
  verifyPropertyOwnership,
} from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import { acquireLock, releaseLock } from "@/lib/concurrency/locks";
import {
  isCalendarPushEnabled,
  isBdcChannelCode,
  CALENDAR_PUSH_DISABLED_MESSAGE,
} from "@/lib/channex/calendar-push-gate";

const HOST_ID = "00000000-0000-0000-0000-0000000aa001";
const PROPERTY_ID = "11111111-1111-1111-1111-1111111aa001";
const CHANNEX_PROPERTY_ID = "channex-prop-1";
const RATE_PLAN_ID = "rate-plan-abb-1";
const REC_ID_1 = "rec-uuid-001";
const IDEMPOTENCY_KEY = "test-idempotency-key";

type ChannexMock = {
  updateRestrictions: jest.Mock;
};

function buildRequest(body: Record<string, unknown>): NextRequest {
  // NextRequest accepts a Request; provide minimal mock with JSON body.
  return new NextRequest("http://localhost/api/pricing/apply/test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// The shared supabase helper covers reads (.select/.eq/.maybeSingle/etc.)
// but not writes. The apply route uses .insert / .upsert / .update. Augment
// the chain for each table the route writes to, returning a thenable that
// resolves to { data: null, error: null }. The .update chain returns the
// chain so .in() can follow.
function augmentWritesOnChain(
  chain: Record<string, unknown> & { then?: unknown },
): jest.Mock {
  const writeResult = { data: null, error: null };
  const writeThen = (resolve: (v: unknown) => void) => resolve(writeResult);
  const insertMock = jest.fn(() => ({ then: writeThen }));
  const upsertMock = jest.fn(() => ({ then: writeThen }));
  // .update(...) returns chain (so .in can follow); chain itself is
  // thenable from the helper.
  const updateMock = jest.fn(() => chain);
  chain.insert = insertMock;
  chain.upsert = upsertMock;
  chain.update = updateMock;
  return insertMock;
}

function setupCommonMocks(opts: {
  recs: Array<{ id: string; date: string; suggested_rate: number }>;
  channexImpl: ChannexMock;
}) {
  // Auth: host owns the property.
  (getAuthenticatedUser as jest.Mock).mockResolvedValue({
    user: { id: HOST_ID },
  });
  (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);

  // Calendar push gate: enabled; ABB is not BDC.
  (isCalendarPushEnabled as jest.Mock).mockReturnValue(true);
  (isBdcChannelCode as jest.Mock).mockImplementation((c: string) => c === "BDC");

  // Concurrency lock: acquired.
  (acquireLock as jest.Mock).mockResolvedValue(true);
  (releaseLock as jest.Mock).mockResolvedValue(undefined);

  // Channex client.
  (createChannexClient as jest.Mock).mockReturnValue(opts.channexImpl);

  // Supabase service client with the queries the route makes in order.
  const supabase = mockSupabaseClient();
  mockSupabaseQuery(supabase, "properties", {
    data: { id: PROPERTY_ID, channex_property_id: CHANNEX_PROPERTY_ID },
    error: null,
  });
  mockSupabaseQuery(supabase, "property_channels", {
    data: [
      {
        channel_code: "ABB",
        channel_name: "Airbnb",
        settings: { rate_plan_id: RATE_PLAN_ID },
        status: "active",
      },
    ],
    error: null,
  });
  mockSupabaseQuery(supabase, "pricing_recommendations", {
    data: opts.recs,
    error: null,
  });
  mockSupabaseQuery(supabase, "calendar_rates", { data: null, error: null });
  mockSupabaseQuery(supabase, "pricing_performance", { data: null, error: null });
  mockSupabaseQuery(supabase, "agent_audit_log", { data: null, error: null });
  // Augment write methods on the chains the route writes to.
  augmentWritesOnChain(supabase.__fromMocks.get("calendar_rates")!);
  augmentWritesOnChain(supabase.__fromMocks.get("pricing_performance")!);
  augmentWritesOnChain(supabase.__fromMocks.get("pricing_recommendations")!);
  augmentWritesOnChain(supabase.__fromMocks.get("agent_audit_log")!);
  (createServiceClient as jest.Mock).mockReturnValue(supabase);

  return supabase;
}

describe("POST /api/pricing/apply — M9 Phase G E2 agent_audit_log INSERT", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("success path: INSERT fires with expected shape (≥1 rec applied, no failures)", async () => {
    const channex: ChannexMock = {
      updateRestrictions: jest.fn().mockResolvedValue(undefined),
    };
    const supabase = setupCommonMocks({
      recs: [{ id: REC_ID_1, date: "2026-06-01", suggested_rate: 200 }],
      channexImpl: channex,
    });

    const req = buildRequest({
      recommendation_ids: [REC_ID_1],
      idempotency_key: IDEMPOTENCY_KEY,
    });
    const res = await POST(req, { params: { propertyId: PROPERTY_ID } });
    expect(res.status).toBe(200);

    const auditChain = supabase.__fromMocks.get("agent_audit_log")!;
    // The insert method isn't on the default chain (it's writes-shape);
    // the route calls .insert(...) which is added dynamically. Our helper's
    // chain doesn't define .insert, so we have to inspect the from() call
    // pattern: from('agent_audit_log') was called, and the returned chain
    // received an insert. The shared helper doesn't model writes; we
    // verify via the from() spy.
    expect(supabase.from).toHaveBeenCalledWith("agent_audit_log");
    // The insert call itself shape-asserts via the chain. The shared
    // helper passes through writes; we capture the insert via a separate
    // spy attached below.
    expect((auditChain as unknown as { insert?: jest.Mock }).insert).toBeDefined();
    const insertCall = (auditChain as unknown as { insert: jest.Mock }).insert.mock.calls[0]?.[0];
    expect(insertCall).toBeDefined();
    expect(insertCall.host_id).toBe(HOST_ID);
    expect(insertCall.action_type).toBe("pricing_apply");
    expect(insertCall.source).toBe("frontend_api");
    expect(insertCall.actor_kind).toBe("host");
    expect(insertCall.actor_id).toBe(HOST_ID);
    expect(insertCall.autonomy_level).toBe("confirmed");
    expect(insertCall.outcome).toBe("succeeded");
    expect(insertCall.payload.property_id).toBe(PROPERTY_ID);
    expect(insertCall.payload.applied_count).toBe(1);
    expect(insertCall.payload.channels_pushed).toEqual(["airbnb"]);
    expect(insertCall.payload.recommendation_ids).toEqual([REC_ID_1]);
    expect(insertCall.payload.partial_failure).toBeUndefined();
    expect(insertCall.context.idempotency_key).toBe(IDEMPOTENCY_KEY);
    expect(insertCall.context.target_channels).toEqual(["ABB"]);
  });

  test("pure-failure: no INSERT fires (0 recs applied, all batches failed)", async () => {
    const channex: ChannexMock = {
      updateRestrictions: jest.fn().mockRejectedValue(new Error("channex_down")),
    };
    const supabase = setupCommonMocks({
      recs: [{ id: REC_ID_1, date: "2026-06-01", suggested_rate: 200 }],
      channexImpl: channex,
    });

    const req = buildRequest({
      recommendation_ids: [REC_ID_1],
      idempotency_key: IDEMPOTENCY_KEY,
    });
    const res = await POST(req, { params: { propertyId: PROPERTY_ID } });
    // 207 because failed_batches > 0; applied_count = 0.
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.applied_count).toBe(0);
    expect(body.partial_failure).toBe(true);

    // No INSERT into agent_audit_log on pure-failure. The mock chain is
    // pre-configured by setupCommonMocks (so the insert jest.fn() exists
    // on the chain), but the route code conditionally calls .insert only
    // when appliedRecIds.length > 0. Assert the mock was never invoked.
    const auditChain = supabase.__fromMocks.get("agent_audit_log")!;
    const insertMock = (auditChain as unknown as { insert: jest.Mock }).insert;
    expect(insertMock).not.toHaveBeenCalled();
  });

  test("partial-failure: INSERT fires with payload.partial_failure flag", async () => {
    // 2 recs in 1 batch (200-batch limit means both go in same call). To
    // produce a partial failure across the audit-log assertion (≥1
    // applied + ≥1 failed), we need at least 2 channels OR 2 batches.
    // Simplest: 2 channels, one succeeds and one throws.
    const channex: ChannexMock = {
      updateRestrictions: jest.fn(),
    };
    let callCount = 0;
    channex.updateRestrictions.mockImplementation(async () => {
      callCount++;
      if (callCount === 2) throw new Error("vrbo_5xx");
    });

    const supabase = mockSupabaseClient();
    mockSupabaseQuery(supabase, "properties", {
      data: { id: PROPERTY_ID, channex_property_id: CHANNEX_PROPERTY_ID },
      error: null,
    });
    mockSupabaseQuery(supabase, "property_channels", {
      data: [
        {
          channel_code: "ABB",
          channel_name: "Airbnb",
          settings: { rate_plan_id: RATE_PLAN_ID },
          status: "active",
        },
        {
          channel_code: "VRBO",
          channel_name: "Vrbo",
          settings: { rate_plan_id: "rate-plan-vrbo-1" },
          status: "active",
        },
      ],
      error: null,
    });
    mockSupabaseQuery(supabase, "pricing_recommendations", {
      data: [{ id: REC_ID_1, date: "2026-06-01", suggested_rate: 200 }],
      error: null,
    });
    mockSupabaseQuery(supabase, "calendar_rates", { data: null, error: null });
    mockSupabaseQuery(supabase, "pricing_performance", { data: null, error: null });
    mockSupabaseQuery(supabase, "agent_audit_log", { data: null, error: null });
    augmentWritesOnChain(supabase.__fromMocks.get("calendar_rates")!);
    augmentWritesOnChain(supabase.__fromMocks.get("pricing_performance")!);
    augmentWritesOnChain(supabase.__fromMocks.get("pricing_recommendations")!);
    augmentWritesOnChain(supabase.__fromMocks.get("agent_audit_log")!);

    (getAuthenticatedUser as jest.Mock).mockResolvedValue({
      user: { id: HOST_ID },
    });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);
    (isCalendarPushEnabled as jest.Mock).mockReturnValue(true);
    (isBdcChannelCode as jest.Mock).mockImplementation((c: string) => c === "BDC");
    (acquireLock as jest.Mock).mockResolvedValue(true);
    (releaseLock as jest.Mock).mockResolvedValue(undefined);
    (createChannexClient as jest.Mock).mockReturnValue(channex);
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    const req = buildRequest({
      recommendation_ids: [REC_ID_1],
      idempotency_key: IDEMPOTENCY_KEY,
    });
    const res = await POST(req, { params: { propertyId: PROPERTY_ID } });
    expect(res.status).toBe(207);

    const auditChain = supabase.__fromMocks.get("agent_audit_log")!;
    const insertCall = (auditChain as unknown as { insert: jest.Mock }).insert.mock.calls[0]?.[0];
    expect(insertCall).toBeDefined();
    expect(insertCall.payload.partial_failure).toBe(true);
    expect(insertCall.payload.failed_batches.length).toBeGreaterThan(0);
    expect(insertCall.payload.applied_count).toBe(1);
    // Successful channel only (ABB); VRBO failed.
    expect(insertCall.payload.channels_pushed).toEqual(["airbnb"]);
  });
});

// The CALENDAR_PUSH_DISABLED_MESSAGE export is unused in the body but
// imported above to satisfy the gate module's full surface mock.
void CALENDAR_PUSH_DISABLED_MESSAGE;
