/**
 * Type contracts for the agent loop's tool dispatcher (Milestone 3).
 *
 * The Tool<TInput, TOutput> type is the canonical declaration shape
 * for any callable the model can invoke. Tools are registered via
 * `registerTool()` (dispatcher.ts) and looked up by name when the
 * model emits a `tool_use` content block.
 *
 * Schema discipline: every tool declares Zod schemas for both input
 * and output. The dispatcher Zod-parses the model's emitted input
 * (catching shape drift the model occasionally produces) and validates
 * the handler's return value before passing back (catching handler
 * bugs early). The Zod input schema is also converted to JSON Schema
 * via `z.toJSONSchema()` for the Anthropic SDK's `tools` array.
 *
 * Audit discipline: every tool dispatch produces exactly one
 * `agent_audit_log` row. For non-gated (`requiresGate: false`) tools,
 * the dispatcher writes the row directly via `writeAuditLog()`. For
 * gated tools, the dispatcher delegates to `requestAction()` (which
 * writes the row internally with `outcome='pending'`) and then
 * resolves via `updateAuditOutcome()`. Both patterns end with one
 * row in `agent_audit_log` reflecting the dispatch.
 */

import type { z } from "zod";
import type { StakesClass } from "@/lib/action-substrate/stakes-registry";

export type { StakesClass };

/**
 * Ambient context provided to every tool handler. Lean by design:
 * tools that need DB access call `createServiceClient()` themselves
 * (matches the M2 memory-handlers pattern). Future expansion is
 * additive — adding a field here is a small change visible to all
 * tools at once.
 */
export interface ToolHandlerContext {
  host: { id: string };
  conversation_id: string;
  turn_id: string;
}

export interface Tool<TInput, TOutput> {
  /** Stable identifier shown to the model. snake_case. */
  name: string;
  /**
   * One-paragraph description shown to the model in the tools
   * manifest. Orient around WHEN to call this tool (the host's
   * specific question maps to which entity_type / entity_id), not
   * just WHAT the tool does technically.
   */
  description: string;
  /** Zod input validator. Anthropic SDK input_schema derived via z.toJSONSchema(). */
  inputSchema: z.ZodType<TInput>;
  /** Zod output validator. Catches handler bugs before model sees output. */
  outputSchema: z.ZodType<TOutput>;
  /**
   * If true, the tool's dispatch goes through the action substrate's
   * gating logic (requestAction). If false, the dispatcher allows
   * the call and writes its own audit row directly.
   */
  requiresGate: boolean;
  /** Required when requiresGate=true; ignored otherwise. */
  stakesClass?: StakesClass;
  handler: (input: TInput, context: ToolHandlerContext) => Promise<TOutput>;
}

export type ToolErrorKind =
  | "tool_not_found"
  | "input_validation_failed"
  | "gate_blocked"
  | "confirmation_required"
  | "output_validation_failed"
  | "handler_threw";

export interface ToolError {
  kind: ToolErrorKind;
  /** Human-readable; appropriate to surface to the model in tool_result.content. */
  message: string;
  /** Debugging metadata; NOT returned to the model. */
  details?: unknown;
}

export type ToolCallResult<TOutput = unknown> =
  | { ok: true; value: TOutput; audit_log_id: string }
  | { ok: false; error: ToolError; audit_log_id: string | null };

/** Anthropic SDK Tool param shape. Built by getToolsForAnthropicSDK(). */
export interface AnthropicToolParam {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    [k: string]: unknown;
  };
}
