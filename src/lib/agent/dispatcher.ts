/**
 * The agent loop's tool dispatcher.
 *
 * Responsibilities:
 *   1. Hold the in-memory tool registry (one Tool per tool.name).
 *   2. Validate tool input via the Tool's Zod inputSchema.
 *   3. Gate the dispatch via the action substrate when
 *      `requiresGate: true`.
 *   4. Execute the Tool's handler with the validated input + context.
 *   5. Validate the handler's output via the Tool's Zod outputSchema.
 *   6. Write exactly one agent_audit_log row per dispatch (plus one
 *      agent_artifacts row when the substrate gates the call into the
 *      require_confirmation branch — M6 D35).
 *   7. Return a typed ToolCallResult for the agent loop server (M4)
 *      to translate into an Anthropic ToolResultBlockParam.
 *
 * Audit-write patterns based on `requiresGate`:
 *
 *   Read tools (requiresGate=false):
 *     - Dispatcher calls `writeAuditLog()` directly with
 *       outcome='pending' before invoking the handler.
 *     - On handler resolution: dispatcher calls
 *       `updateAuditOutcome(audit_log_id, 'succeeded'|'failed', ...)`.
 *
 *   Gated tools (requiresGate=true):
 *     - Dispatcher calls `requestAction()` which writes the audit row
 *       with outcome='pending' AND consults gating logic.
 *     - mode='allow': dispatcher invokes the handler, then calls
 *       updateAuditOutcome on resolution. (Used when an action is
 *       routed through the substrate's bypass path — source=
 *       'agent_artifact'.)
 *     - mode='block': dispatcher marks the audit row 'failed' with
 *       reason 'gate_blocked' and returns a ToolError.
 *     - mode='require_confirmation' (M6 D35 fork): dispatcher treats
 *       this as constructive success — the audit row stays 'pending'
 *       (post-approval flow flips it to 'succeeded' or 'failed' when
 *       the host responds), the dispatcher writes a paired
 *       agent_artifacts row in state='emitted', synthesizes the
 *       proposal output via tool.buildProposalOutput, validates the
 *       output against the tool's outputSchema, and returns ok=true.
 *       The tool's `handler` is NOT invoked at proposal time.
 *
 * The dispatcher always returns a ToolCallResult that carries the
 * audit_log_id (or null in the rare case where audit writing itself
 * failed before the handler could run).
 */

import { z } from "zod";
import type {
  AnthropicToolParam,
  Tool,
  ToolCallResult,
  ToolError,
  ToolHandlerContext,
} from "./types";
import {
  writeAuditLog,
  updateAuditOutcome,
} from "@/lib/action-substrate/audit-writer";
import { writeArtifact } from "@/lib/action-substrate/artifact-writer";
import { requestAction } from "@/lib/action-substrate/request-action";
import { registerStakesEntry } from "@/lib/action-substrate/stakes-registry";

const registry: Map<string, Tool<unknown, unknown>> = new Map();

export function registerTool<TInput, TOutput>(tool: Tool<TInput, TOutput>): void {
  if (registry.has(tool.name)) {
    throw new Error(
      `[dispatcher] Tool '${tool.name}' is already registered. Tool names must be unique.`,
    );
  }
  if (tool.requiresGate && tool.stakesClass === undefined) {
    throw new Error(
      `[dispatcher] Tool '${tool.name}' has requiresGate=true but no stakesClass. Gated tools must declare a stakesClass.`,
    );
  }
  if (tool.requiresGate && tool.buildProposalOutput === undefined) {
    throw new Error(
      `[dispatcher] Tool '${tool.name}' has requiresGate=true but no buildProposalOutput. Gated tools must declare buildProposalOutput so the dispatcher's require_confirmation fork (D35) can synthesize a proposal-time output.`,
    );
  }
  if (tool.requiresGate && (tool.artifactKind === undefined || tool.artifactKind.length === 0)) {
    throw new Error(
      `[dispatcher] Tool '${tool.name}' has requiresGate=true but no artifactKind. Gated tools must declare artifactKind so the dispatcher knows what to write into agent_artifacts.kind at proposal time.`,
    );
  }

  // Self-register the tool's stakes entry when gated. registerStakesEntry
  // throws if a different stakes class is claimed for the same name —
  // catches bugs where two registrations diverge.
  if (tool.requiresGate && tool.stakesClass !== undefined) {
    registerStakesEntry(tool.name, tool.stakesClass);
  }

  registry.set(tool.name, tool as Tool<unknown, unknown>);
  console.log(
    `[dispatcher] Registered tool '${tool.name}' (gated=${tool.requiresGate}${tool.requiresGate ? `, stakes=${tool.stakesClass}` : ""}).`,
  );
}

export function getRegisteredTools(): readonly Tool<unknown, unknown>[] {
  return Array.from(registry.values());
}

/**
 * Convert the registry to the Anthropic SDK's Tool[] shape. M4 (agent
 * loop server) calls this to populate the `tools` parameter of the
 * Messages API request.
 */
export function getToolsForAnthropicSDK(): AnthropicToolParam[] {
  return getRegisteredTools().map((tool) => {
    const schema = z.toJSONSchema(tool.inputSchema, {
      target: "draft-2020-12",
    }) as { type?: string; [k: string]: unknown };

    // Anthropic's input_schema must have type='object' as the root.
    // For tools whose Zod schema is z.object(), type='object' falls
    // out naturally. Defensive: surface a clear error if a tool
    // declared a non-object schema.
    if (schema.type !== "object") {
      throw new Error(
        `[dispatcher] Tool '${tool.name}' input schema is not z.object(); Anthropic requires type='object' input_schema.`,
      );
    }

    return {
      name: tool.name,
      description: tool.description,
      input_schema: schema as AnthropicToolParam["input_schema"],
    };
  });
}

/**
 * Test-only: clear the in-memory tool registry. Underscore prefix
 * signals don't-use-in-runtime. Tests call this in `beforeEach()` to
 * achieve per-test isolation.
 */
export function _resetRegistryForTests(): void {
  registry.clear();
}

interface AuditWriteShape {
  host_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  source: "agent_tool";
  actor_kind: "agent";
  actor_id: null;
  autonomy_level: "silent";
  outcome: "pending";
  context: Record<string, unknown>;
  stakes_class: import("@/lib/action-substrate/stakes-registry").StakesClass;
}

/**
 * Build the audit row for a non-gated (read) tool dispatch. Centralized
 * so the call shape stays consistent.
 */
function buildReadToolAuditPayload(
  tool: Tool<unknown, unknown>,
  validatedInput: unknown,
  context: ToolHandlerContext,
): AuditWriteShape {
  return {
    host_id: context.host.id,
    action_type: tool.name,
    payload: validatedInput as Record<string, unknown>,
    source: "agent_tool",
    actor_kind: "agent",
    actor_id: null,
    autonomy_level: "silent",
    outcome: "pending",
    context: {
      tool_name: tool.name,
      conversation_id: context.conversation_id,
      turn_id: context.turn_id,
    },
    stakes_class: "low",
  };
}

function makeError(kind: ToolError["kind"], message: string, details?: unknown): ToolError {
  return { kind, message, details };
}

export async function dispatchToolCall(
  name: string,
  rawInput: unknown,
  context: ToolHandlerContext,
): Promise<ToolCallResult> {
  const startedAt = Date.now();

  // 1. Lookup
  const tool = registry.get(name);
  if (!tool) {
    return {
      ok: false,
      error: makeError("tool_not_found", `Tool '${name}' is not registered.`),
      audit_log_id: null,
    };
  }

  // 2. Input validation
  const inputParse = tool.inputSchema.safeParse(rawInput);
  if (!inputParse.success) {
    console.error(
      `[tool:${tool.name}] Input validation failed:`,
      inputParse.error.issues,
    );
    return {
      ok: false,
      error: makeError(
        "input_validation_failed",
        `Input did not match schema for tool '${tool.name}': ${inputParse.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`,
        inputParse.error.issues,
      ),
      audit_log_id: null,
    };
  }
  const validatedInput = inputParse.data;

  // 3. Gate (or directly write audit for read tools)
  let auditLogId: string;
  let gatedMode: "allow" | "blocked" | "require_confirmation" = "allow";
  let gatedReason = "";

  if (tool.requiresGate) {
    const gate = await requestAction({
      host_id: context.host.id,
      action_type: tool.name,
      payload: validatedInput as Record<string, unknown>,
      source: "agent_tool",
      actor_id: null,
      context: {
        tool_name: tool.name,
        conversation_id: context.conversation_id,
        turn_id: context.turn_id,
      },
    });
    auditLogId = gate.audit_metadata.audit_log_id;
    if (gate.mode !== "allow") {
      gatedMode = gate.mode === "block" ? "blocked" : "require_confirmation";
      gatedReason = gate.reason;
    }
  } else {
    const audit = await writeAuditLog(
      buildReadToolAuditPayload(tool, validatedInput, context),
    );
    auditLogId = audit.audit_log_id;
  }

  // 3b. Substrate refused with mode='block' — preserve M3-vintage
  // behavior: mark audit failed, return ToolError.
  if (gatedMode === "blocked") {
    await updateAuditOutcome(auditLogId, "failed", {
      latency_ms: Date.now() - startedAt,
      error_message: `gate_blocked: ${gatedReason}`,
    });
    return {
      ok: false,
      error: makeError("gate_blocked", gatedReason),
      audit_log_id: auditLogId,
    };
  }

  // 3c. Substrate refused with mode='require_confirmation' (D35 fork) —
  // treat as constructive success. The audit row stays 'pending' (the
  // post-approval flow flips it when the host responds via the
  // /api/agent/artifact endpoint). Write a paired agent_artifacts row
  // in state='emitted' and synthesize the proposal output via the
  // tool's buildProposalOutput. The tool's handler is NOT invoked.
  if (gatedMode === "require_confirmation") {
    // Registration enforced these are present for gated tools, but TS
    // narrows from the optional declaration in the Tool interface.
    if (!tool.buildProposalOutput || !tool.artifactKind) {
      // Defensive — registration should have prevented this.
      await updateAuditOutcome(auditLogId, "failed", {
        latency_ms: Date.now() - startedAt,
        error_message: `dispatcher_misconfigured: gated tool '${tool.name}' missing buildProposalOutput or artifactKind`,
      });
      return {
        ok: false,
        error: makeError(
          "handler_threw",
          `Gated tool '${tool.name}' is missing buildProposalOutput / artifactKind. Registration should have caught this.`,
        ),
        audit_log_id: auditLogId,
      };
    }

    // CONVENTION (PE — applies to every gated tool): if a gated tool's
    // inputSchema declares a `supersedes: string` field, the dispatcher
    // propagates that value to the agent_artifacts.supersedes column so
    // the lifecycle-layer correction-chain cascade fires (artifact-
    // writer.ts marks the prior artifact state='superseded'). Tools
    // whose semantics don't include corrections simply omit the field
    // from their inputSchema; this branch becomes a no-op.
    let artifactId: string;
    try {
      const written = await writeArtifact({
        conversation_id: context.conversation_id,
        turn_id: context.turn_id,
        kind: tool.artifactKind,
        payload: validatedInput as Record<string, unknown>,
        audit_log_id: auditLogId,
        supersedes:
          typeof (validatedInput as { supersedes?: unknown })?.supersedes === "string"
            ? ((validatedInput as { supersedes?: string }).supersedes as string)
            : undefined,
      });
      artifactId = written.artifact_id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[tool:${tool.name}] writeArtifact threw:`, message);
      await updateAuditOutcome(auditLogId, "failed", {
        latency_ms: Date.now() - startedAt,
        error_message: `artifact_write_failed: ${message}`,
      });
      return {
        ok: false,
        error: makeError("handler_threw", message, err instanceof Error ? err.stack : undefined),
        audit_log_id: auditLogId,
      };
    }

    const proposalOutput = tool.buildProposalOutput(validatedInput, context, {
      artifact_id: artifactId,
      audit_log_id: auditLogId,
    });

    const proposalParse = tool.outputSchema.safeParse(proposalOutput);
    if (!proposalParse.success) {
      console.error(
        `[tool:${tool.name}] buildProposalOutput produced invalid output:`,
        proposalParse.error.issues,
      );
      await updateAuditOutcome(auditLogId, "failed", {
        latency_ms: Date.now() - startedAt,
        error_message: `proposal_output_invalid: ${proposalParse.error.issues.map((i) => i.message).join("; ")}`,
      });
      return {
        ok: false,
        error: makeError(
          "output_validation_failed",
          `buildProposalOutput for '${tool.name}' did not match outputSchema: ${proposalParse.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`,
          proposalParse.error.issues,
        ),
        audit_log_id: auditLogId,
      };
    }

    // Audit row intentionally stays outcome='pending'. The post-approval
    // flow (host approves → /api/agent/artifact route → handler runs)
    // flips it to 'succeeded' or 'failed' once the action executes.
    console.log(
      `[dispatcher] Tool '${tool.name}' gated to require_confirmation; artifact ${artifactId} emitted in ${Date.now() - startedAt}ms.`,
    );

    return {
      ok: true,
      value: proposalParse.data,
      audit_log_id: auditLogId,
    };
  }

  // 4. Handler execution
  let handlerOutput: unknown;
  try {
    handlerOutput = await tool.handler(validatedInput, context);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tool:${tool.name}] Handler threw:`, message);
    await updateAuditOutcome(auditLogId, "failed", {
      latency_ms: Date.now() - startedAt,
      error_message: `handler_threw: ${message}`,
    });
    return {
      ok: false,
      error: makeError("handler_threw", message, err instanceof Error ? err.stack : undefined),
      audit_log_id: auditLogId,
    };
  }

  // 5. Output validation
  const outputParse = tool.outputSchema.safeParse(handlerOutput);
  if (!outputParse.success) {
    console.error(
      `[tool:${tool.name}] Output validation failed:`,
      outputParse.error.issues,
    );
    await updateAuditOutcome(auditLogId, "failed", {
      latency_ms: Date.now() - startedAt,
      error_message: `output_validation_failed: ${outputParse.error.issues.map((i) => i.message).join("; ")}`,
    });
    return {
      ok: false,
      error: makeError(
        "output_validation_failed",
        `Output did not match schema for tool '${tool.name}': ${outputParse.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`,
        outputParse.error.issues,
      ),
      audit_log_id: auditLogId,
    };
  }

  // 6. Resolve audit + return
  await updateAuditOutcome(auditLogId, "succeeded", {
    latency_ms: Date.now() - startedAt,
  });
  console.log(`[dispatcher] Tool '${tool.name}' succeeded in ${Date.now() - startedAt}ms.`);

  return {
    ok: true,
    value: outputParse.data,
    audit_log_id: auditLogId,
  };
}
