import { writeAuditLog, updateAuditOutcome } from "../audit-writer";

// Mock the service-role Supabase client at the module boundary so
// tests don't hit a real DB. The mock exposes a chainable builder
// matching the supabase-js API surface used by audit-writer.

jest.mock("@/lib/supabase/service");

import { createServiceClient } from "@/lib/supabase/service";

interface MockBuilder {
  insert: jest.Mock;
  update: jest.Mock;
  select: jest.Mock;
  single: jest.Mock;
  eq: jest.Mock;
}

function makeBuilder(opts: {
  insertResult?: { data?: unknown; error?: { message: string } | null };
  updateResult?: { error?: { message: string } | null };
  selectResult?: { data?: unknown; error?: { message: string } | null };
}): MockBuilder {
  const builder: MockBuilder = {
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn(),
    eq: jest.fn().mockReturnThis(),
  };
  // .insert(...).select(...).single() — single returns insertResult
  // .update(...).eq(...) — returns updateResult directly (await on chain)
  // .select(...).eq(...).single() — single returns selectResult

  builder.single.mockImplementation(() => {
    return Promise.resolve(
      opts.selectResult ?? opts.insertResult ?? { data: null, error: null },
    );
  });

  return builder;
}

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";
const FAKE_LOG_ID = "11111111-1111-1111-1111-111111111111";
const FAKE_CREATED_AT = "2026-05-02T06:30:00+00:00";

describe("writeAuditLog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("inserts a row with the resolved actor_kind, autonomy_level, and pending outcome", async () => {
    const insertBuilder = makeBuilder({
      insertResult: {
        data: { id: FAKE_LOG_ID, created_at: FAKE_CREATED_AT },
        error: null,
      },
    });
    const supabase = { from: jest.fn().mockReturnValue(insertBuilder) };
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    const result = await writeAuditLog({
      host_id: HOST_ID,
      action_type: "memory_fact_write",
      payload: { fact_attribute: "wifi_password" },
      source: "agent_artifact",
      actor_kind: "agent",
      actor_id: null,
      autonomy_level: "confirmed",
      outcome: "pending",
      context: { artifact_id: "abc" },
      stakes_class: "low",
    });

    expect(result).toEqual({
      audit_log_id: FAKE_LOG_ID,
      created_at: FAKE_CREATED_AT,
    });
    expect(supabase.from).toHaveBeenCalledWith("agent_audit_log");
    expect(insertBuilder.insert).toHaveBeenCalledTimes(1);

    const inserted = insertBuilder.insert.mock.calls[0][0];
    expect(inserted.host_id).toBe(HOST_ID);
    expect(inserted.action_type).toBe("memory_fact_write");
    expect(inserted.source).toBe("agent_artifact");
    expect(inserted.outcome).toBe("pending");
    expect(inserted.autonomy_level).toBe("confirmed");
    expect(inserted.actor_kind).toBe("agent");
    // stakes_class merged into context
    expect(inserted.context).toEqual({ artifact_id: "abc", stakes_class: "low" });
  });

  test("merges stakes_class into context when context is null", async () => {
    const insertBuilder = makeBuilder({
      insertResult: { data: { id: FAKE_LOG_ID, created_at: FAKE_CREATED_AT } },
    });
    const supabase = { from: jest.fn().mockReturnValue(insertBuilder) };
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await writeAuditLog({
      host_id: HOST_ID,
      action_type: "memory_fact_write",
      payload: {},
      source: "frontend_api",
      actor_kind: "host",
      actor_id: HOST_ID,
      autonomy_level: "silent",
      outcome: "pending",
      context: null,
      stakes_class: "low",
    });

    const inserted = insertBuilder.insert.mock.calls[0][0];
    expect(inserted.context).toEqual({ stakes_class: "low" });
  });

  test("throws when the insert returns an error", async () => {
    const insertBuilder = makeBuilder({
      insertResult: { data: null, error: { message: "permission denied" } },
    });
    const supabase = { from: jest.fn().mockReturnValue(insertBuilder) };
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await expect(
      writeAuditLog({
        host_id: HOST_ID,
        action_type: "memory_fact_write",
        payload: {},
        source: "frontend_api",
        actor_kind: "host",
        actor_id: HOST_ID,
        autonomy_level: "silent",
        outcome: "pending",
        context: null,
        stakes_class: "low",
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("updateAuditOutcome", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("updates outcome to 'succeeded' with optional latency_ms", async () => {
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };
    const supabase = { from: jest.fn().mockReturnValue(updateBuilder) };
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await updateAuditOutcome(FAKE_LOG_ID, "succeeded", { latency_ms: 42 });

    expect(updateBuilder.update).toHaveBeenCalledWith({
      outcome: "succeeded",
      latency_ms: 42,
    });
    expect(updateBuilder.eq).toHaveBeenCalledWith("id", FAKE_LOG_ID);
  });

  test("when error_message is provided, fetches existing context and merges", async () => {
    let call = 0;
    const eq = jest.fn().mockImplementation(() => {
      // eq is called twice on different builders; we route the second
      // to the update path. Since we use a single from() per call, the
      // pattern is: from('agent_audit_log').select('context').eq().single()
      // then from('agent_audit_log').update({...}).eq()
      return updateBuilder;
    });
    const single = jest.fn().mockResolvedValue({
      data: { context: { stakes_class: "low", artifact_id: "abc" } },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single }) });
    const update = jest.fn().mockReturnValue({ eq });

    const fetchBuilder = { select };
    const updateBuilder = { update, eq: jest.fn().mockResolvedValue({ error: null }) };

    const fromCalls: Record<string, unknown>[] = [];
    const supabase = {
      from: jest.fn().mockImplementation(() => {
        call += 1;
        return call === 1 ? fetchBuilder : updateBuilder;
      }),
    };
    fromCalls.push(supabase);
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await updateAuditOutcome(FAKE_LOG_ID, "failed", {
      error_message: "DB write failed",
      latency_ms: 100,
    });

    expect(supabase.from).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenCalledWith("context");
    expect(updateBuilder.update).toHaveBeenCalledWith({
      outcome: "failed",
      latency_ms: 100,
      context: {
        stakes_class: "low",
        artifact_id: "abc",
        error_message: "DB write failed",
      },
    });
  });

  test("throws when the update returns an error", async () => {
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: { message: "row not found" } }),
    };
    const supabase = { from: jest.fn().mockReturnValue(updateBuilder) };
    (createServiceClient as jest.Mock).mockReturnValue(supabase);

    await expect(
      updateAuditOutcome(FAKE_LOG_ID, "succeeded"),
    ).rejects.toThrow(/row not found/);
  });
});
