/**
 * Tests for revertRatePush lib — M11 Phase C item 1 (M2; D17d disposition).
 *
 * Mocks supabase service client + channex client at module boundary.
 * Exercises the outcome paths surfaced via RevertOutcome:
 *   - audit_row_not_found (audit lookup misses)
 *   - ownership_mismatch (audit row belongs to a different host)
 *   - not_pricing_apply (audit row is some other action_type)
 *   - already_reverted (context.reverted_at already set)
 *   - non_revertable (prior_state empty or missing)
 *   - succeeded (happy path with successful Channex push)
 *
 * Each path uses a discriminating mock supabase: from('agent_audit_log')
 * returns a different builder than from('properties') etc. Pattern
 * matches audit-writer.test.ts.
 */

import { revertRatePush } from "../revert";

jest.mock("@/lib/supabase/service");
jest.mock("@/lib/channex/client");
jest.mock("@/lib/channex/calendar-push-gate", () => ({
  isBdcChannelCode: (c: string) => c.toUpperCase() === "BDC",
  CALENDAR_PUSH_DISABLED_MESSAGE: "disabled",
  isCalendarPushEnabled: () => true,
}));
// Avoid the real buildSafeBdcRestrictions in tests — it requires a deep
// channex mock. The lib calls it inside the BDC branch; mock it to
// return an empty plan + entries_to_push so the push loop is a no-op
// unless we override per-test.
jest.mock("@/lib/channex/safe-restrictions", () => {
  const actual = jest.requireActual("@/lib/channex/safe-restrictions");
  return {
    ...actual,
    buildSafeBdcRestrictions: jest.fn(),
    toChannexRestrictionValues: jest.fn(),
  };
});

import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import {
  buildSafeBdcRestrictions,
  toChannexRestrictionValues,
} from "@/lib/channex/safe-restrictions";

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";
const OTHER_HOST_ID = "00000000-0000-0000-0000-000000000bbb";
const AUDIT_LOG_ID = "11111111-1111-1111-1111-111111111111";
const REVERT_AUDIT_ID = "22222222-2222-2222-2222-222222222222";
const PROPERTY_ID = "33333333-3333-3333-3333-333333333333";
const CHANNEX_PROP_ID = "ch-prop-xyz";
const RATE_PLAN_BDC = "rate-plan-bdc";

interface MockBuilder {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  eq: jest.Mock;
  maybeSingle: jest.Mock;
  single: jest.Mock;
}

function makeBuilder(opts: {
  selectResult?: { data: unknown; error: unknown };
  insertResult?: { data: unknown; error: unknown };
  updateResult?: { error: unknown };
}): MockBuilder {
  const b: MockBuilder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(() =>
      Promise.resolve(opts.selectResult ?? { data: null, error: null }),
    ),
    single: jest.fn(() =>
      Promise.resolve(opts.insertResult ?? { data: null, error: null }),
    ),
  };
  // Make .update().eq() resolve to the update result (no .then chain needed).
  const updateEq = jest.fn(() =>
    Promise.resolve(opts.updateResult ?? { error: null }),
  );
  b.update.mockReturnValue({ eq: updateEq });
  return b;
}

function makeSupabaseRouter(builders: Record<string, MockBuilder>) {
  return {
    from: jest.fn((table: string) => {
      const b = builders[table];
      if (!b) throw new Error(`Unexpected from(${table})`);
      return b;
    }),
  };
}

function makeChannexMock() {
  return {
    updateRestrictions: jest.fn().mockResolvedValue({}),
    getRestrictionsBucketed: jest.fn().mockResolvedValue({}),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("revertRatePush — outcome paths", () => {
  test("audit_row_not_found when audit lookup returns no row", async () => {
    const auditBuilder = makeBuilder({
      selectResult: { data: null, error: null },
    });
    (createServiceClient as jest.Mock).mockReturnValue(
      makeSupabaseRouter({ agent_audit_log: auditBuilder }),
    );
    (createChannexClient as jest.Mock).mockReturnValue(makeChannexMock());

    const result = await revertRatePush({
      audit_log_id: AUDIT_LOG_ID,
      host_id: HOST_ID,
    });
    expect(result.outcome).toBe("audit_row_not_found");
    expect(result.revert_audit_log_id).toBeNull();
    expect(result.restored_count).toBe(0);
  });

  test("ownership_mismatch when audit row belongs to a different host", async () => {
    const auditBuilder = makeBuilder({
      selectResult: {
        data: {
          id: AUDIT_LOG_ID,
          host_id: OTHER_HOST_ID,
          action_type: "pricing_apply",
          payload: { prior_state: [{ date: "2026-06-01", channel: "BDC", rate: 200, min_stay_arrival: null }] },
          context: null,
        },
        error: null,
      },
    });
    (createServiceClient as jest.Mock).mockReturnValue(
      makeSupabaseRouter({ agent_audit_log: auditBuilder }),
    );
    (createChannexClient as jest.Mock).mockReturnValue(makeChannexMock());

    const result = await revertRatePush({
      audit_log_id: AUDIT_LOG_ID,
      host_id: HOST_ID,
    });
    expect(result.outcome).toBe("ownership_mismatch");
  });

  test("not_pricing_apply when audit row is a different action_type", async () => {
    const auditBuilder = makeBuilder({
      selectResult: {
        data: {
          id: AUDIT_LOG_ID,
          host_id: HOST_ID,
          action_type: "write_memory_fact",
          payload: {},
          context: null,
        },
        error: null,
      },
    });
    (createServiceClient as jest.Mock).mockReturnValue(
      makeSupabaseRouter({ agent_audit_log: auditBuilder }),
    );
    (createChannexClient as jest.Mock).mockReturnValue(makeChannexMock());

    const result = await revertRatePush({
      audit_log_id: AUDIT_LOG_ID,
      host_id: HOST_ID,
    });
    expect(result.outcome).toBe("not_pricing_apply");
  });

  test("already_reverted when context.reverted_at is already set", async () => {
    const auditBuilder = makeBuilder({
      selectResult: {
        data: {
          id: AUDIT_LOG_ID,
          host_id: HOST_ID,
          action_type: "pricing_apply",
          payload: { prior_state: [{ date: "2026-06-01", channel: "BDC", rate: 200, min_stay_arrival: null }] },
          context: { reverted_at: "2026-05-25T07:00:00Z", reverted_by_audit_log_id: REVERT_AUDIT_ID },
        },
        error: null,
      },
    });
    (createServiceClient as jest.Mock).mockReturnValue(
      makeSupabaseRouter({ agent_audit_log: auditBuilder }),
    );
    (createChannexClient as jest.Mock).mockReturnValue(makeChannexMock());

    const result = await revertRatePush({
      audit_log_id: AUDIT_LOG_ID,
      host_id: HOST_ID,
    });
    expect(result.outcome).toBe("already_reverted");
  });

  test("non_revertable when prior_state is empty", async () => {
    const auditBuilder = makeBuilder({
      selectResult: {
        data: {
          id: AUDIT_LOG_ID,
          host_id: HOST_ID,
          action_type: "pricing_apply",
          payload: { prior_state: [], property_id: PROPERTY_ID },
          context: null,
        },
        error: null,
      },
    });
    (createServiceClient as jest.Mock).mockReturnValue(
      makeSupabaseRouter({ agent_audit_log: auditBuilder }),
    );
    (createChannexClient as jest.Mock).mockReturnValue(makeChannexMock());

    const result = await revertRatePush({
      audit_log_id: AUDIT_LOG_ID,
      host_id: HOST_ID,
    });
    expect(result.outcome).toBe("non_revertable");
  });

  test("non_revertable when property_id missing from payload", async () => {
    const auditBuilder = makeBuilder({
      selectResult: {
        data: {
          id: AUDIT_LOG_ID,
          host_id: HOST_ID,
          action_type: "pricing_apply",
          payload: {
            prior_state: [{ date: "2026-06-01", channel: "BDC", rate: 200, min_stay_arrival: null }],
            // property_id absent
          },
          context: null,
        },
        error: null,
      },
    });
    (createServiceClient as jest.Mock).mockReturnValue(
      makeSupabaseRouter({ agent_audit_log: auditBuilder }),
    );
    (createChannexClient as jest.Mock).mockReturnValue(makeChannexMock());

    const result = await revertRatePush({
      audit_log_id: AUDIT_LOG_ID,
      host_id: HOST_ID,
    });
    expect(result.outcome).toBe("non_revertable");
  });

  test("no_property_channex_link when property has no channex_property_id", async () => {
    const auditBuilder = makeBuilder({
      selectResult: {
        data: {
          id: AUDIT_LOG_ID,
          host_id: HOST_ID,
          action_type: "pricing_apply",
          payload: {
            prior_state: [{ date: "2026-06-01", channel: "BDC", rate: 200, min_stay_arrival: null }],
            property_id: PROPERTY_ID,
          },
          context: null,
        },
        error: null,
      },
    });
    const propertiesBuilder = makeBuilder({
      selectResult: { data: { channex_property_id: null }, error: null },
    });
    (createServiceClient as jest.Mock).mockReturnValue(
      makeSupabaseRouter({
        agent_audit_log: auditBuilder,
        properties: propertiesBuilder,
      }),
    );
    (createChannexClient as jest.Mock).mockReturnValue(makeChannexMock());

    const result = await revertRatePush({
      audit_log_id: AUDIT_LOG_ID,
      host_id: HOST_ID,
    });
    expect(result.outcome).toBe("no_property_channex_link");
  });

  test("succeeded happy path: BDC push restores prior rate", async () => {
    const PRIOR = { date: "2026-06-01", channel: "BDC", rate: 200, min_stay_arrival: null };
    const auditRow = {
      id: AUDIT_LOG_ID,
      host_id: HOST_ID,
      action_type: "pricing_apply",
      payload: { prior_state: [PRIOR], property_id: PROPERTY_ID },
      context: null,
    };

    // agent_audit_log table: first .select returns auditRow; .insert returns REVERT_AUDIT_ID
    const auditBuilder = makeBuilder({
      selectResult: { data: auditRow, error: null },
      insertResult: { data: { id: REVERT_AUDIT_ID }, error: null },
    });

    const propertiesBuilder = makeBuilder({
      selectResult: { data: { channex_property_id: CHANNEX_PROP_ID }, error: null },
    });

    // property_channels: select+eq+eq returns the rate plan link array.
    // Lib uses .eq().eq() chain then awaits (no maybeSingle); so the
    // last eq needs to resolve. We override .eq to return a thenable.
    const channelsBuilder: MockBuilder = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn(),
      maybeSingle: jest.fn(),
      single: jest.fn(),
    };
    // First eq returns self; second eq resolves with data
    channelsBuilder.eq
      .mockReturnValueOnce({ eq: () => Promise.resolve({
        data: [{ channel_code: "BDC", settings: { rate_plan_id: RATE_PLAN_BDC }, status: "active" }],
        error: null,
      }) });

    (createServiceClient as jest.Mock).mockReturnValue(
      makeSupabaseRouter({
        agent_audit_log: auditBuilder,
        properties: propertiesBuilder,
        property_channels: channelsBuilder,
      }),
    );

    const channex = makeChannexMock();
    (createChannexClient as jest.Mock).mockReturnValue(channex);

    // buildSafeBdcRestrictions returns a plan with one entry_to_push; the
    // lib then calls toChannexRestrictionValues which we mock too.
    (buildSafeBdcRestrictions as jest.Mock).mockResolvedValue({
      entries_to_push: [{ date: "2026-06-01", rate: 200 }],
      dates_to_open: [],
      dates_to_close: [],
      rate_changes: [],
      min_stay_changes: [],
      skipped_fields: [],
      bdc_state_fetched_at: "2026-05-25T08:00:00Z",
    });
    (toChannexRestrictionValues as jest.Mock).mockReturnValue([
      {
        property_id: CHANNEX_PROP_ID,
        rate_plan_id: RATE_PLAN_BDC,
        date_from: "2026-06-01",
        date_to: "2026-06-01",
        rate: 20000,
      },
    ]);

    const result = await revertRatePush({
      audit_log_id: AUDIT_LOG_ID,
      host_id: HOST_ID,
    });

    expect(result.outcome).toBe("succeeded");
    expect(result.restored_count).toBe(1);
    expect(result.restored[0]).toEqual(PRIOR);
    expect(result.revert_audit_log_id).toBe(REVERT_AUDIT_ID);
    expect(channex.updateRestrictions).toHaveBeenCalledTimes(1);
  });
});
