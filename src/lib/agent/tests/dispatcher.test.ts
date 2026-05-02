import { z } from "zod";
import {
  registerTool,
  dispatchToolCall,
  getRegisteredTools,
  getToolsForAnthropicSDK,
  _resetRegistryForTests,
} from "../dispatcher";
import { _resetStakesRegistryForTests } from "@/lib/action-substrate/stakes-registry";
import type { Tool, ToolHandlerContext } from "../types";

jest.mock("@/lib/action-substrate/audit-writer");
jest.mock("@/lib/action-substrate/request-action");

import { writeAuditLog, updateAuditOutcome } from "@/lib/action-substrate/audit-writer";
import { requestAction } from "@/lib/action-substrate/request-action";

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";
const FAKE_LOG_ID = "11111111-1111-1111-1111-111111111111";
const FAKE_CREATED_AT = "2026-05-02T07:30:00+00:00";

const ctx: ToolHandlerContext = {
  host: { id: HOST_ID },
  conversation_id: "conv-1",
  turn_id: "turn-1",
};

function makeFakeReadTool<TIn, TOut>(overrides: {
  name?: string;
  inputSchema?: z.ZodType<TIn>;
  outputSchema?: z.ZodType<TOut>;
  handler?: (i: TIn, c: ToolHandlerContext) => Promise<TOut>;
} = {}): Tool<TIn, TOut> {
  return {
    name: overrides.name ?? "fake_read",
    description: "Fake read tool for testing.",
    inputSchema: (overrides.inputSchema ?? z.object({ q: z.string() })) as z.ZodType<TIn>,
    outputSchema: (overrides.outputSchema ?? z.object({ result: z.string() })) as z.ZodType<TOut>,
    requiresGate: false,
    handler: overrides.handler ?? (async () => ({ result: "ok" }) as TOut),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  _resetRegistryForTests();
  _resetStakesRegistryForTests();
  (writeAuditLog as jest.Mock).mockResolvedValue({
    audit_log_id: FAKE_LOG_ID,
    created_at: FAKE_CREATED_AT,
  });
  (updateAuditOutcome as jest.Mock).mockResolvedValue(undefined);
});

describe("registerTool", () => {
  test("registers a fresh tool", () => {
    registerTool(makeFakeReadTool({ name: "tool_a" }));
    expect(getRegisteredTools().map((t) => t.name)).toEqual(["tool_a"]);
  });

  test("throws on duplicate name", () => {
    registerTool(makeFakeReadTool({ name: "tool_dup" }));
    expect(() =>
      registerTool(makeFakeReadTool({ name: "tool_dup" })),
    ).toThrow(/already registered/);
  });

  test("throws when requiresGate=true but stakesClass is missing", () => {
    expect(() =>
      registerTool({
        ...makeFakeReadTool({ name: "bad_gated" }),
        requiresGate: true,
      }),
    ).toThrow(/no stakesClass/);
  });

  test("self-registers stakes entry for gated tools", () => {
    registerTool({
      ...makeFakeReadTool({ name: "gated_tool" }),
      requiresGate: true,
      stakesClass: "low",
    });
    // Verified indirectly by calling dispatchToolCall and observing
    // requestAction being invoked (covered in gate tests below).
    expect(getRegisteredTools().map((t) => t.name)).toContain("gated_tool");
  });
});

describe("dispatchToolCall — happy path (read tool)", () => {
  test("validates input, runs handler, writes audit, returns ok=true", async () => {
    const handler = jest.fn().mockResolvedValue({ result: "expected" });
    registerTool(
      makeFakeReadTool({
        name: "happy",
        inputSchema: z.object({ q: z.string() }),
        outputSchema: z.object({ result: z.string() }),
        handler,
      }),
    );

    const out = await dispatchToolCall("happy", { q: "hello" }, ctx);

    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value).toEqual({ result: "expected" });
      expect(out.audit_log_id).toBe(FAKE_LOG_ID);
    }

    expect(handler).toHaveBeenCalledWith({ q: "hello" }, ctx);
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    expect(updateAuditOutcome).toHaveBeenCalledWith(
      FAKE_LOG_ID,
      "succeeded",
      expect.objectContaining({ latency_ms: expect.any(Number) }),
    );

    const auditRow = (writeAuditLog as jest.Mock).mock.calls[0][0];
    expect(auditRow.action_type).toBe("happy");
    expect(auditRow.source).toBe("agent_tool");
    expect(auditRow.actor_kind).toBe("agent");
    expect(auditRow.autonomy_level).toBe("silent");
    expect(auditRow.outcome).toBe("pending");
    expect(auditRow.context.tool_name).toBe("happy");
    expect(auditRow.context.conversation_id).toBe("conv-1");
    expect(auditRow.stakes_class).toBe("low");
  });
});

describe("dispatchToolCall — error paths", () => {
  test("tool_not_found", async () => {
    const out = await dispatchToolCall("nonexistent", {}, ctx);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe("tool_not_found");
      expect(out.error.message).toMatch(/not registered/);
    }
    expect(out.audit_log_id).toBeNull();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  test("input_validation_failed", async () => {
    registerTool(
      makeFakeReadTool({
        name: "strict",
        inputSchema: z.object({ q: z.string().min(3) }),
      }),
    );

    const out = await dispatchToolCall("strict", { q: "ab" }, ctx);

    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe("input_validation_failed");
      expect(out.error.details).toBeDefined();
    }
    expect(out.audit_log_id).toBeNull();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  test("handler_threw — audit row resolved to failed", async () => {
    registerTool(
      makeFakeReadTool({
        name: "throws",
        handler: async () => {
          throw new Error("kaboom");
        },
      }),
    );

    const out = await dispatchToolCall("throws", { q: "hi" }, ctx);

    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe("handler_threw");
      expect(out.error.message).toBe("kaboom");
    }
    expect(out.audit_log_id).toBe(FAKE_LOG_ID);
    expect(updateAuditOutcome).toHaveBeenCalledWith(
      FAKE_LOG_ID,
      "failed",
      expect.objectContaining({
        latency_ms: expect.any(Number),
        error_message: expect.stringMatching(/^handler_threw: kaboom/),
      }),
    );
  });

  test("output_validation_failed — audit row resolved to failed", async () => {
    registerTool(
      makeFakeReadTool({
        name: "bad_output",
        outputSchema: z.object({ result: z.string() }),
        handler: async () => ({ wrong: 42 }) as unknown as { result: string },
      }),
    );

    const out = await dispatchToolCall("bad_output", { q: "hi" }, ctx);

    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe("output_validation_failed");
    }
    expect(updateAuditOutcome).toHaveBeenCalledWith(
      FAKE_LOG_ID,
      "failed",
      expect.objectContaining({
        error_message: expect.stringMatching(/^output_validation_failed/),
      }),
    );
  });
});

describe("dispatchToolCall — gated tool path", () => {
  test("substrate returns mode='allow' → handler runs, audit resolved to succeeded", async () => {
    (requestAction as jest.Mock).mockResolvedValue({
      mode: "allow",
      reason: "low-stakes silent allow",
      audit_metadata: {
        audit_log_id: FAKE_LOG_ID,
        autonomy_level: "silent",
        actor_kind: "agent",
        stakes_class: "low",
        created_at: FAKE_CREATED_AT,
      },
    });

    const handler = jest.fn().mockResolvedValue({ result: "via gate" });
    registerTool({
      ...makeFakeReadTool({
        name: "gated_low",
        inputSchema: z.object({ q: z.string() }),
        outputSchema: z.object({ result: z.string() }),
        handler,
      }),
      requiresGate: true,
      stakesClass: "low",
    });

    const out = await dispatchToolCall("gated_low", { q: "go" }, ctx);

    expect(requestAction).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
    expect(out.ok).toBe(true);
    expect(updateAuditOutcome).toHaveBeenCalledWith(
      FAKE_LOG_ID,
      "succeeded",
      expect.any(Object),
    );
  });

  test("substrate returns mode='require_confirmation' → no handler, audit resolved to failed, error kind 'confirmation_required'", async () => {
    (requestAction as jest.Mock).mockResolvedValue({
      mode: "require_confirmation",
      reason: "Action 'gated_med' is medium-stakes; substrate requires explicit host confirmation.",
      audit_metadata: {
        audit_log_id: FAKE_LOG_ID,
        autonomy_level: "blocked",
        actor_kind: "agent",
        stakes_class: "medium",
        created_at: FAKE_CREATED_AT,
      },
    });

    const handler = jest.fn();
    registerTool({
      ...makeFakeReadTool({
        name: "gated_med",
        handler,
      }),
      requiresGate: true,
      stakesClass: "medium",
    });

    const out = await dispatchToolCall("gated_med", { q: "go" }, ctx);

    expect(handler).not.toHaveBeenCalled();
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe("confirmation_required");
      expect(out.error.message).toMatch(/medium-stakes/);
    }
    expect(out.audit_log_id).toBe(FAKE_LOG_ID);
    expect(updateAuditOutcome).toHaveBeenCalledWith(
      FAKE_LOG_ID,
      "failed",
      expect.objectContaining({
        error_message: expect.stringMatching(/^gate_confirmation_required/),
      }),
    );
  });
});

describe("getToolsForAnthropicSDK", () => {
  test("returns name + description + JSON-Schema input_schema for each tool", () => {
    registerTool(
      makeFakeReadTool({
        name: "first",
        inputSchema: z.object({
          query: z.string().describe("search text"),
          limit: z.number().int().optional(),
        }),
      }),
    );
    registerTool(makeFakeReadTool({ name: "second" }));

    const tools = getToolsForAnthropicSDK();
    expect(tools).toHaveLength(2);

    const first = tools.find((t) => t.name === "first")!;
    expect(first.description).toBe("Fake read tool for testing.");
    expect(first.input_schema.type).toBe("object");
    expect(first.input_schema.properties).toBeDefined();
    expect((first.input_schema.properties as Record<string, unknown>).query).toBeDefined();
  });

  test("throws if a tool's schema is not z.object()", () => {
    registerTool(
      makeFakeReadTool({
        name: "bad_schema",
        inputSchema: z.string(),
      }),
    );
    expect(() => getToolsForAnthropicSDK()).toThrow(/type='object'/);
  });
});

describe("_resetRegistryForTests", () => {
  test("clears the registry", () => {
    registerTool(makeFakeReadTool({ name: "ephemeral" }));
    expect(getRegisteredTools()).toHaveLength(1);
    _resetRegistryForTests();
    expect(getRegisteredTools()).toHaveLength(0);
  });
});
