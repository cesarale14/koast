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
jest.mock("@/lib/action-substrate/artifact-writer");

import { writeAuditLog, updateAuditOutcome } from "@/lib/action-substrate/audit-writer";
import { requestAction } from "@/lib/action-substrate/request-action";
import { writeArtifact } from "@/lib/action-substrate/artifact-writer";

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";
const FAKE_LOG_ID = "11111111-1111-1111-1111-111111111111";
const FAKE_ARTIFACT_ID = "22222222-2222-2222-2222-222222222222";
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
  (writeArtifact as jest.Mock).mockResolvedValue({
    artifact_id: FAKE_ARTIFACT_ID,
    created_at: FAKE_CREATED_AT,
  });
});

const proposalOutputSchema = z.object({
  artifact_id: z.string(),
  audit_log_id: z.string(),
  outcome: z.literal("pending"),
});

function makeFakeGatedTool<TIn = { q: string }>(overrides: {
  name?: string;
  stakesClass?: "low" | "medium" | "high";
  artifactKind?: string;
  inputSchema?: z.ZodType<TIn>;
  outputSchema?: z.ZodType<unknown>;
  buildProposalOutput?: Tool<TIn, unknown>["buildProposalOutput"];
  handler?: (i: TIn, c: ToolHandlerContext) => Promise<unknown>;
} = {}): Tool<TIn, unknown> {
  return {
    name: overrides.name ?? "fake_gated",
    description: "Fake gated tool for testing.",
    inputSchema: (overrides.inputSchema ?? z.object({ q: z.string() })) as z.ZodType<TIn>,
    outputSchema: (overrides.outputSchema ?? proposalOutputSchema) as z.ZodType<unknown>,
    requiresGate: true,
    stakesClass: overrides.stakesClass ?? "medium",
    artifactKind: overrides.artifactKind ?? "fake_kind",
    buildProposalOutput:
      overrides.buildProposalOutput ??
      ((_input, _ctx, refs) => ({
        artifact_id: refs.artifact_id,
        audit_log_id: refs.audit_log_id,
        outcome: "pending" as const,
      })),
    handler: overrides.handler ?? (async () => ({ unused: true })),
  };
}

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

  test("throws when requiresGate=true but buildProposalOutput is missing (M6 D35)", () => {
    expect(() =>
      registerTool({
        ...makeFakeReadTool({ name: "missing_proposal_builder" }),
        requiresGate: true,
        stakesClass: "medium",
        artifactKind: "fake_kind",
        // buildProposalOutput intentionally omitted
      }),
    ).toThrow(/no buildProposalOutput/);
  });

  test("throws when requiresGate=true but artifactKind is missing (M6 D35)", () => {
    expect(() =>
      registerTool({
        ...makeFakeReadTool({ name: "missing_artifact_kind" }),
        requiresGate: true,
        stakesClass: "medium",
        buildProposalOutput: () => ({}),
        // artifactKind intentionally omitted
      }),
    ).toThrow(/no artifactKind/);
  });

  test("self-registers stakes entry for gated tools", () => {
    registerTool(makeFakeGatedTool({ name: "gated_tool", stakesClass: "low" }));
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

    const handler = jest.fn().mockResolvedValue({
      artifact_id: FAKE_ARTIFACT_ID,
      audit_log_id: FAKE_LOG_ID,
      outcome: "pending" as const,
    });
    registerTool(
      makeFakeGatedTool({
        name: "gated_low",
        stakesClass: "low",
        handler,
      }),
    );

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

  test("substrate returns mode='block' → no handler, audit resolved to failed, error kind 'gate_blocked'", async () => {
    (requestAction as jest.Mock).mockResolvedValue({
      mode: "block",
      reason: "policy_block: example reason",
      audit_metadata: {
        audit_log_id: FAKE_LOG_ID,
        autonomy_level: "blocked",
        actor_kind: "agent",
        stakes_class: "high",
        created_at: FAKE_CREATED_AT,
      },
    });

    const handler = jest.fn();
    const buildProposalOutput = jest.fn();
    registerTool(
      makeFakeGatedTool({
        name: "gated_blocked",
        stakesClass: "high",
        handler,
        buildProposalOutput,
      }),
    );

    const out = await dispatchToolCall("gated_blocked", { q: "go" }, ctx);

    expect(handler).not.toHaveBeenCalled();
    expect(buildProposalOutput).not.toHaveBeenCalled();
    expect(writeArtifact).not.toHaveBeenCalled();
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe("gate_blocked");
      expect(out.error.message).toMatch(/policy_block/);
    }
    expect(updateAuditOutcome).toHaveBeenCalledWith(
      FAKE_LOG_ID,
      "failed",
      expect.objectContaining({
        error_message: expect.stringMatching(/^gate_blocked/),
      }),
    );
  });

  test("substrate returns mode='require_confirmation' (D35 fork) → ok=true, agent_artifacts row written, audit row STAYS pending, handler NOT invoked", async () => {
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
    const buildProposalOutput = jest.fn((_input, _ctx, refs) => ({
      artifact_id: refs.artifact_id,
      audit_log_id: refs.audit_log_id,
      outcome: "pending" as const,
    }));

    registerTool(
      makeFakeGatedTool({
        name: "gated_med",
        stakesClass: "medium",
        artifactKind: "fake_kind",
        handler,
        buildProposalOutput,
      }),
    );

    const out = await dispatchToolCall("gated_med", { q: "go" }, ctx);

    // Handler stays untouched at proposal time.
    expect(handler).not.toHaveBeenCalled();
    // Artifact row written with the substrate's audit_log_id paired ref.
    expect(writeArtifact).toHaveBeenCalledTimes(1);
    const writeCall = (writeArtifact as jest.Mock).mock.calls[0][0];
    expect(writeCall.audit_log_id).toBe(FAKE_LOG_ID);
    expect(writeCall.kind).toBe("fake_kind");
    expect(writeCall.conversation_id).toBe("conv-1");
    expect(writeCall.turn_id).toBe("turn-1");
    expect(writeCall.payload).toEqual({ q: "go" });
    expect(writeCall.supersedes).toBeUndefined();
    // Proposal output synthesized.
    expect(buildProposalOutput).toHaveBeenCalledWith(
      { q: "go" },
      ctx,
      { artifact_id: FAKE_ARTIFACT_ID, audit_log_id: FAKE_LOG_ID },
    );
    // Constructive success.
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value).toEqual({
        artifact_id: FAKE_ARTIFACT_ID,
        audit_log_id: FAKE_LOG_ID,
        outcome: "pending",
      });
      expect(out.audit_log_id).toBe(FAKE_LOG_ID);
    }
    // CRITICAL: audit row stays 'pending'. Post-approval flow flips it.
    expect(updateAuditOutcome).not.toHaveBeenCalled();
  });

  test("require_confirmation propagates supersedes from input to writeArtifact", async () => {
    (requestAction as jest.Mock).mockResolvedValue({
      mode: "require_confirmation",
      reason: "medium-stakes",
      audit_metadata: {
        audit_log_id: FAKE_LOG_ID,
        autonomy_level: "blocked",
        actor_kind: "agent",
        stakes_class: "medium",
        created_at: FAKE_CREATED_AT,
      },
    });

    const PRIOR_ARTIFACT_ID = "33333333-3333-3333-3333-333333333333";

    registerTool(
      makeFakeGatedTool({
        name: "gated_supersede",
        inputSchema: z.object({ q: z.string(), supersedes: z.string().optional() }),
      }),
    );

    await dispatchToolCall(
      "gated_supersede",
      { q: "corrected", supersedes: PRIOR_ARTIFACT_ID },
      ctx,
    );

    expect(writeArtifact).toHaveBeenCalledTimes(1);
    const writeCall = (writeArtifact as jest.Mock).mock.calls[0][0];
    expect(writeCall.supersedes).toBe(PRIOR_ARTIFACT_ID);
  });

  test("require_confirmation: writeArtifact throws → audit resolved failed, ToolError returned", async () => {
    (requestAction as jest.Mock).mockResolvedValue({
      mode: "require_confirmation",
      reason: "medium-stakes",
      audit_metadata: {
        audit_log_id: FAKE_LOG_ID,
        autonomy_level: "blocked",
        actor_kind: "agent",
        stakes_class: "medium",
        created_at: FAKE_CREATED_AT,
      },
    });
    (writeArtifact as jest.Mock).mockRejectedValue(new Error("artifact insert failed"));

    registerTool(makeFakeGatedTool({ name: "gated_artifact_fail" }));

    const out = await dispatchToolCall("gated_artifact_fail", { q: "go" }, ctx);

    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe("handler_threw");
      expect(out.error.message).toMatch(/artifact insert failed/);
    }
    expect(updateAuditOutcome).toHaveBeenCalledWith(
      FAKE_LOG_ID,
      "failed",
      expect.objectContaining({
        error_message: expect.stringMatching(/^artifact_write_failed/),
      }),
    );
  });

  test("require_confirmation: buildProposalOutput returns invalid output → audit resolved failed, ToolError 'output_validation_failed'", async () => {
    (requestAction as jest.Mock).mockResolvedValue({
      mode: "require_confirmation",
      reason: "medium-stakes",
      audit_metadata: {
        audit_log_id: FAKE_LOG_ID,
        autonomy_level: "blocked",
        actor_kind: "agent",
        stakes_class: "medium",
        created_at: FAKE_CREATED_AT,
      },
    });

    registerTool(
      makeFakeGatedTool({
        name: "gated_bad_proposal",
        // Returns wrong shape — fails the proposalOutputSchema parse.
        buildProposalOutput: () => ({ wrong: "shape" }) as unknown as Record<string, unknown>,
      }),
    );

    const out = await dispatchToolCall("gated_bad_proposal", { q: "go" }, ctx);

    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe("output_validation_failed");
    }
    expect(updateAuditOutcome).toHaveBeenCalledWith(
      FAKE_LOG_ID,
      "failed",
      expect.objectContaining({
        error_message: expect.stringMatching(/^proposal_output_invalid/),
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
