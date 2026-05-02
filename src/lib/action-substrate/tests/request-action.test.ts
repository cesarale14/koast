import { requestAction } from "../request-action";

// Mock writeAuditLog so the test stays isolated from the audit-writer
// implementation. We assert that requestAction calls writeAuditLog
// with the right shape; audit-writer's tests cover its own behavior.
jest.mock("../audit-writer", () => ({
  writeAuditLog: jest.fn(),
}));

import { writeAuditLog } from "../audit-writer";

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";
const FAKE_LOG_ID = "11111111-1111-1111-1111-111111111111";
const FAKE_CREATED_AT = "2026-05-02T06:30:00+00:00";

describe("requestAction — agent_artifact bypass", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (writeAuditLog as jest.Mock).mockResolvedValue({
      audit_log_id: FAKE_LOG_ID,
      created_at: FAKE_CREATED_AT,
    });
  });

  test("source='agent_artifact' with valid artifact_id → mode='allow' / autonomy='confirmed'", async () => {
    const result = await requestAction({
      host_id: HOST_ID,
      action_type: "memory_fact_write",
      payload: { fact_attribute: "wifi_password" },
      source: "agent_artifact",
      actor_id: null,
      context: { artifact_id: "art-123" },
    });

    expect(result.mode).toBe("allow");
    expect(result.audit_metadata.autonomy_level).toBe("confirmed");
    expect(result.audit_metadata.actor_kind).toBe("agent");
    expect(result.audit_metadata.stakes_class).toBe("low");
    expect(result.audit_metadata.audit_log_id).toBe(FAKE_LOG_ID);
    expect(result.reason).toMatch(/Host confirmation routed through artifact art-123/);
  });

  test("source='agent_artifact' WITHOUT artifact_id → falls through to stakes-based logic", async () => {
    const result = await requestAction({
      host_id: HOST_ID,
      action_type: "memory_fact_write",
      payload: {},
      source: "agent_artifact",
      actor_id: null,
      context: null,
    });

    // Without bypass: low stakes → allow / silent
    expect(result.mode).toBe("allow");
    expect(result.audit_metadata.autonomy_level).toBe("silent");
    expect(result.audit_metadata.actor_kind).toBe("agent");
  });

  test("source='agent_artifact' with empty-string artifact_id → no bypass", async () => {
    const result = await requestAction({
      host_id: HOST_ID,
      action_type: "memory_fact_write",
      payload: {},
      source: "agent_artifact",
      actor_id: null,
      context: { artifact_id: "" },
    });

    expect(result.audit_metadata.autonomy_level).toBe("silent");
  });
});

describe("requestAction — stakes-based logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (writeAuditLog as jest.Mock).mockResolvedValue({
      audit_log_id: FAKE_LOG_ID,
      created_at: FAKE_CREATED_AT,
    });
  });

  test("low stakes (memory_fact_write) from frontend_api → allow / silent", async () => {
    const result = await requestAction({
      host_id: HOST_ID,
      action_type: "memory_fact_write",
      payload: {},
      source: "frontend_api",
      actor_id: HOST_ID,
      context: null,
    });

    expect(result.mode).toBe("allow");
    expect(result.audit_metadata.autonomy_level).toBe("silent");
    expect(result.audit_metadata.actor_kind).toBe("host");
  });

  test("low stakes from worker → allow / silent / actor_kind='worker'", async () => {
    const result = await requestAction({
      host_id: HOST_ID,
      action_type: "memory_fact_write",
      payload: {},
      source: "worker",
      actor_id: null,
      context: null,
    });

    expect(result.mode).toBe("allow");
    expect(result.audit_metadata.autonomy_level).toBe("silent");
    expect(result.audit_metadata.actor_kind).toBe("worker");
  });

  test("low stakes from agent_tool → allow / silent / actor_kind='agent'", async () => {
    const result = await requestAction({
      host_id: HOST_ID,
      action_type: "memory_fact_write",
      payload: {},
      source: "agent_tool",
      actor_id: null,
      context: null,
    });

    expect(result.audit_metadata.actor_kind).toBe("agent");
  });
});

describe("requestAction — audit row written with correct shape", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (writeAuditLog as jest.Mock).mockResolvedValue({
      audit_log_id: FAKE_LOG_ID,
      created_at: FAKE_CREATED_AT,
    });
  });

  test("writes one audit row per call with outcome='pending'", async () => {
    await requestAction({
      host_id: HOST_ID,
      action_type: "memory_fact_write",
      payload: { foo: "bar" },
      source: "agent_artifact",
      actor_id: null,
      context: { artifact_id: "art-123" },
    });

    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    const arg = (writeAuditLog as jest.Mock).mock.calls[0][0];
    expect(arg.outcome).toBe("pending");
    expect(arg.host_id).toBe(HOST_ID);
    expect(arg.action_type).toBe("memory_fact_write");
    expect(arg.source).toBe("agent_artifact");
    expect(arg.actor_kind).toBe("agent");
    expect(arg.autonomy_level).toBe("confirmed");
    expect(arg.stakes_class).toBe("low");
    expect(arg.payload).toEqual({ foo: "bar" });
    expect(arg.context).toEqual({ artifact_id: "art-123" });
  });

  test("propagates errors from writeAuditLog", async () => {
    (writeAuditLog as jest.Mock).mockRejectedValue(new Error("DB unavailable"));

    await expect(
      requestAction({
        host_id: HOST_ID,
        action_type: "memory_fact_write",
        payload: {},
        source: "frontend_api",
        actor_id: HOST_ID,
        context: null,
      }),
    ).rejects.toThrow(/DB unavailable/);
  });
});
