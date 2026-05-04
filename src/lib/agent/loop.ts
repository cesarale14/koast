/**
 * Agent loop orchestrator. Streams an assistant turn end-to-end:
 *
 *   1. Get/create conversation (M2 conversation.ts)
 *   2. Persist the user turn
 *   3. Reconstruct history → Anthropic.MessageParam[]
 *   4. Build system prompt + Anthropic tools array (M3 dispatcher)
 *   5. LOOP (cap = 5 rounds):
 *      a. Open client.messages.stream()
 *      b. Forward text deltas as 'token' events
 *      c. await stream.finalMessage() to get assembled message
 *      d. If stop_reason === 'tool_use':
 *         - Dispatch each tool_use via M3's dispatchToolCall
 *         - Emit 'tool_call_started' / 'tool_call_completed' events
 *         - Build tool_result content blocks; append to history
 *         - round++; if round > 5: emit 'error' (round_cap_exceeded), break
 *      e. Else (end_turn / max_tokens / stop_sequence / pause_turn):
 *         - Persist assistant turn (text + tool_calls JSONB)
 *         - Emit 'done', break
 *      f. If stream throws OR refusal stop reason:
 *         - Emit 'error' or 'refusal'; user turn already persisted;
 *           skip assistant persistence per design doc §2.5 atomicity.
 *
 * Yields AgentStreamEvent values via async generator. The route
 * handler (Phase 4) consumes the iterator and writes each
 * serialized event to the SSE response stream.
 *
 * Caller contract: same as M2/M3 — caller authenticates the host
 * and passes host.id explicitly.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  getOrCreateConversation,
  persistTurn,
  insertTurn,
  finalizeTurn,
  reconstructHistory,
  type AgentHost,
  type ToolCallRecord,
} from "./conversation";
import { buildSystemPrompt } from "./system-prompt";
import {
  dispatchToolCall,
  getToolsForAnthropicSDK,
} from "./dispatcher";
import type { AgentStreamEvent } from "./sse";
import type { ToolHandlerContext } from "./types";
import { classifyError } from "./error-classifier";
import { createServiceClient } from "@/lib/supabase/service";

const MODEL_ID = "claude-sonnet-4-5-20250929";
const MAX_TOKENS = 4096;
const ROUND_CAP = 5;

/**
 * Type guard for the write_memory_fact tool's proposal-time output
 * (D35 fork). Used in the loop to gate emission of memory_write_pending
 * SSE events. Defensive: guards against future schema drift; the
 * dispatcher's outputSchema validation already ran before we get here.
 */
function isProposalOutput(
  value: unknown,
): value is { artifact_id: string; audit_log_id: string; outcome: "pending" } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { artifact_id?: unknown }).artifact_id === "string" &&
    typeof (value as { audit_log_id?: unknown }).audit_log_id === "string" &&
    (value as { outcome?: unknown }).outcome === "pending"
  );
}

export interface RunAgentTurnInput {
  host: AgentHost;
  /** null to start a new conversation. */
  conversation_id: string | null;
  user_message_text: string;
  /**
   * D19 — ui_context hints from the chat shell. Only `active_property_id`
   * is consumed in M5; future hints (active_route, etc.) extend this shape.
   * Server-side ownership is verified before any context is injected; an
   * unauthorized id is logged at warn and silently dropped from the turn.
   */
  ui_context?: { active_property_id?: string };
}

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("[loop] ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey });
}

/**
 * Build a host-readable one-liner from a tool's input. Surfaced in
 * the chat as a transient indicator (e.g., "Looking up wifi for
 * Villa Jamaica..."). v1 keeps it generic per tool name.
 */
/**
 * D19 — build the active-context preamble that gets prepended to the
 * latest user message at SDK-call time. Wording is locked in the
 * conventions doc and tested for shape — do not edit casually; the
 * model's tool-call behavior is sensitive to the framing.
 */
export function buildActivePropertyPreamble(args: {
  name: string;
  id: string;
}): string {
  return `[active context — provided by the host's UI]
active_property = "${args.name}"
active_property_id = ${args.id}
use this id for read_memory tool calls.
if the host's message references a different property by name, ask them to select that property in the UI rather than guessing its id.

`;
}

/**
 * D19 — server-side resolution of `ui_context.active_property_id` to a
 * property record owned by the host. Returns the (name, id) tuple on
 * success, null when the id is missing/unowned/not found. The null
 * path triggers a single warn log and a silent drop from the turn —
 * permissive on UX (stale sessionStorage, deleted property) while
 * giving an audit signal for genuine spoof attempts.
 */
export async function resolveActiveProperty(
  hostId: string,
  ui_context?: RunAgentTurnInput["ui_context"],
): Promise<{ id: string; name: string } | null> {
  const id = ui_context?.active_property_id;
  if (!id) return null;

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromBuilder = supabase.from("properties") as any;
  const { data, error } = await fromBuilder
    .select("id, name, user_id")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.warn(
      `[loop] unauthorized active_property_id attempted: host=${hostId} requested=${id} (lookup_failed: ${error?.message ?? "no row"})`,
    );
    return null;
  }
  if (data.user_id !== hostId) {
    console.warn(
      `[loop] unauthorized active_property_id attempted: host=${hostId} requested=${id}`,
    );
    return null;
  }
  return { id: data.id, name: data.name };
}

/**
 * D19 — return a copy of `messages` with the preamble prepended to the
 * LAST user message's text content. Synthetic tool_result user messages
 * (content is a ContentBlockParam[]) are skipped; only the most recent
 * plain-text user message receives the preamble. The original array is
 * not mutated; this output is consumed only by the SDK call, never
 * persisted, never re-read by `reconstructHistory`.
 */
export function prependActiveContextToLastUserMessage(
  messages: Anthropic.MessageParam[],
  preamble: string,
): Anthropic.MessageParam[] {
  if (preamble.length === 0) return messages;
  const out = [...messages];
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") {
      out[i] = { role: "user", content: preamble + m.content };
      return out;
    }
    // Synthetic tool_result message — skip and look further back for
    // the actual host-typed user message.
  }
  return out;
}

function summarizeToolInput(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "read_memory") {
    const sub = input.sub_entity_type as string | undefined;
    const attr = input.attribute as string | undefined;
    if (sub && attr) return `Looking up ${sub}/${attr} from memory...`;
    if (sub) return `Looking up ${sub} from memory...`;
    if (attr) return `Looking up ${attr} from memory...`;
    return `Reading memory for this property...`;
  }
  return `Calling ${toolName}...`;
}

/**
 * Build a host-readable summary from a tool's result.
 */
function summarizeToolResult(
  toolName: string,
  result: { ok: boolean; value?: unknown; errorMessage?: string },
): string {
  if (!result.ok) {
    return `${toolName} failed: ${result.errorMessage ?? "unknown error"}`;
  }
  if (toolName === "read_memory") {
    const v = result.value as { facts?: unknown[]; data_sufficiency?: { fact_count?: number } } | undefined;
    const count = v?.data_sufficiency?.fact_count ?? v?.facts?.length ?? 0;
    if (count === 0) return "No facts on file.";
    if (count === 1) return "Found 1 fact.";
    return `Found ${count} facts.`;
  }
  return `${toolName} succeeded.`;
}

interface RoundResult {
  events: AgentStreamEvent[];
  /** Anthropic's assembled assistant Message. */
  finalMessage: Anthropic.Message;
  /** Text emitted in this round (for persistence). */
  accumulatedText: string;
  /** Tool calls dispatched during this round, ready for tool_calls JSONB. */
  toolCallRecords: ToolCallRecord[];
  /** Audit log IDs collected for the eventual 'done' event. */
  auditIds: string[];
}

/**
 * Run a single round of the loop: open a stream, forward text as
 * tokens, dispatch tools, return what was emitted + accumulated.
 *
 * Note: the round itself doesn't decide whether to continue — the
 * outer runAgentTurn() reads finalMessage.stop_reason to decide.
 */
async function* runOneRound(
  client: Anthropic,
  systemPrompt: string,
  tools: ReturnType<typeof getToolsForAnthropicSDK>,
  history: Anthropic.MessageParam[],
  toolContext: ToolHandlerContext,
): AsyncGenerator<AgentStreamEvent, RoundResult, void> {
  const stream = client.messages.stream({
    model: MODEL_ID,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    tools,
    messages: history,
  });

  let accumulatedText = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      accumulatedText += event.delta.text;
      yield { type: "token", delta: event.delta.text };
    }
    // tool_use input deltas are merged by the SDK; we get the full
    // tool_use block from finalMessage() below. No per-delta handling.
  }

  const finalMessage = await stream.finalMessage();

  const toolCallRecords: ToolCallRecord[] = [];
  const auditIds: string[] = [];

  if (finalMessage.stop_reason === "tool_use") {
    for (const block of finalMessage.content) {
      if (block.type !== "tool_use") continue;

      const inputObj = (block.input ?? {}) as Record<string, unknown>;
      const dispatchStart = Date.now();
      yield {
        type: "tool_call_started",
        tool_use_id: block.id,
        tool_name: block.name,
        input_summary: summarizeToolInput(block.name, inputObj),
      };

      const result = await dispatchToolCall(block.name, inputObj, toolContext);
      const latencyMs = Date.now() - dispatchStart;

      const success = result.ok;

      if (success) {
        const summary = summarizeToolResult(block.name, {
          ok: true,
          value: result.value,
          errorMessage: undefined,
        });
        yield {
          type: "tool_call_completed",
          tool_use_id: block.id,
          success: true,
          result_summary: summary,
        };

        // M6 D35 fork side-channel: when write_memory_fact's proposal
        // returns successfully, the dispatcher already wrote the
        // agent_artifacts row. Emit memory_write_pending so the chat
        // shell can render the inline MemoryArtifact.
        if (block.name === "write_memory_fact" && isProposalOutput(result.value)) {
          yield {
            type: "memory_write_pending",
            artifact_id: result.value.artifact_id,
            audit_log_id: result.value.audit_log_id,
            proposed_payload: inputObj as {
              property_id: string;
              sub_entity_type: string;
              attribute: string;
              fact_value: unknown;
              confidence?: number;
              source: string;
              supersedes?: string;
              supersedes_memory_fact_id?: string;
              citation?: { source_text?: string; reasoning?: string };
            },
            supersedes:
              typeof (inputObj as { supersedes?: unknown }).supersedes === "string"
                ? ((inputObj as { supersedes?: string }).supersedes as string)
                : undefined,
          };
        }
      } else {
        // M6 D28: emit tool_call_failed with structured error taxonomy.
        // The dispatcher's ToolError already classifies certain kinds
        // (gate_blocked, input_validation_failed, etc.); the
        // error-classifier widens via message-pattern matching for
        // anything else (handler_threw → classifier inspects the
        // underlying error message).
        const classified = classifyError(new Error(result.error.message));
        yield {
          type: "tool_call_failed",
          tool_use_id: block.id,
          tool_name: block.name,
          error: {
            kind: classified.kind,
            message: result.error.message,
            retryable: classified.retryable,
          },
          latency_ms: latencyMs,
        };
      }

      // Build the tool_result content (JSON serialized for the model)
      const toolResultContent = success
        ? JSON.stringify(result.value)
        : `Error: ${result.error.kind}: ${result.error.message}`;

      toolCallRecords.push({
        tool_use_id: block.id,
        tool_name: block.name,
        input: inputObj,
        result: {
          content: toolResultContent,
          is_error: !success,
        },
        audit_log_id: result.audit_log_id ?? "",
      });

      if (result.audit_log_id) {
        auditIds.push(result.audit_log_id);
      }
    }
  }

  return {
    events: [],
    finalMessage,
    accumulatedText,
    toolCallRecords,
    auditIds,
  };
}

/**
 * Main entry point. Yields AgentStreamEvent values for the entire
 * turn. Handles persistence + atomicity per design doc §2.5.
 */
export async function* runAgentTurn(
  input: RunAgentTurnInput,
): AsyncGenerator<AgentStreamEvent, void, void> {
  const client = getAnthropicClient();

  // Step 1+2: get/create conversation, persist user turn, pre-insert
  // assistant stub so dispatcher's writeArtifact has a real turn_id
  // to FK-reference at agent_artifacts.turn_id (M6 turn_id-ordering
  // fix; per Cesar's "lock Option A" in the smoke-failure post).

  const conversation = await getOrCreateConversation(input.host, input.conversation_id);

  // M6 M6.3: resolve property scope ONCE per turn. Used for both
  // active_property_id persistence on every agent_turns row (closes
  // M5 CF D-F2) and the D19 active-context preamble injection.
  const activeProperty = await resolveActiveProperty(input.host.id, input.ui_context);
  const activePropertyId = activeProperty?.id ?? null;

  // User turn: single-shot persist (content is fully known at request time).
  await persistTurn({
    conversation_id: conversation.id,
    role: "user",
    content_text: input.user_message_text,
    active_property_id: activePropertyId,
  });

  // Assistant stub: insert NOW so the dispatcher can pass a real
  // turn_id through ToolHandlerContext to writeArtifact during the
  // SDK roundtrip. finalizeTurn lands at the end with content +
  // tool_calls + refusal + tokens.
  const assistantTurn = await insertTurn({
    conversation_id: conversation.id,
    role: "assistant",
    active_property_id: activePropertyId,
    model_id: MODEL_ID,
  });

  yield { type: "turn_started", conversation_id: conversation.id };

  // Step 3: reconstruct full history (includes the user turn just persisted).
  const history = await reconstructHistory(conversation.id);

  // Step 3.5 (D19): use the property resolved at step 1+2 to inject
  // the active-context preamble into the LAST user message in the
  // SDK-call messages array. The preamble is NEVER persisted — agent_turns
  // keeps the host's verbatim text. Unauthorized ids logged at warn
  // when resolveActiveProperty returned null for a non-empty input.
  const seedMessages: Anthropic.MessageParam[] = activeProperty
    ? prependActiveContextToLastUserMessage(
        history,
        buildActivePropertyPreamble({ name: activeProperty.name, id: activeProperty.id }),
      )
    : history;

  // Step 4: system prompt + tools.
  const systemPrompt = buildSystemPrompt({ host: input.host });
  const tools = getToolsForAnthropicSDK();

  const accumulatedText: string[] = [];
  const collectedToolCalls: ToolCallRecord[] = [];
  const collectedAuditIds: string[] = [];
  let lastFinalMessage: Anthropic.Message | null = null;

  let round = 0;
  let turnError: { code: string; message: string; recoverable: boolean } | null = null;
  let refusalReason: { reason: string; suggested_next_step: string | null } | null = null;

  let history_with_results: Anthropic.MessageParam[] = seedMessages;

  while (round < ROUND_CAP) {
    round += 1;

    let roundResult: RoundResult;
    try {
      const gen = runOneRound(
        client,
        systemPrompt,
        tools,
        history_with_results,
        {
          host: input.host,
          conversation_id: conversation.id,
          turn_id: assistantTurn.id, // M6 fix: real UUID from the
          // pre-inserted assistant stub. Used by dispatcher's D35
          // require_confirmation fork → writeArtifact's
          // agent_artifacts.turn_id NOT NULL FK.
        },
      );

      // Drain the inner generator's events
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const next = await gen.next();
        if (next.done) {
          roundResult = next.value;
          break;
        }
        yield next.value;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      turnError = { code: "anthropic_sdk_error", message, recoverable: true };
      console.error("[loop] SDK error mid-stream:", message);
      break;
    }

    lastFinalMessage = roundResult.finalMessage;

    // Accumulate text from this round
    if (roundResult.accumulatedText) {
      accumulatedText.push(roundResult.accumulatedText);
    }
    collectedToolCalls.push(...roundResult.toolCallRecords);
    collectedAuditIds.push(...roundResult.auditIds);

    const stopReason = roundResult.finalMessage.stop_reason;

    if (stopReason === "tool_use") {
      // Append assistant message + tool_result user message to history
      history_with_results = [
        ...history_with_results,
        {
          role: "assistant",
          content: roundResult.finalMessage.content,
        },
        {
          role: "user",
          content: roundResult.toolCallRecords.map((tc) => ({
            type: "tool_result" as const,
            tool_use_id: tc.tool_use_id,
            content: tc.result.content,
            is_error: tc.result.is_error,
          })),
        },
      ];
      // Loop continues to next round.
      if (round >= ROUND_CAP) {
        turnError = {
          code: "round_cap_exceeded",
          message: `Agent loop exceeded the ${ROUND_CAP}-round cap on tool use without resolving.`,
          recoverable: false,
        };
        break;
      }
      continue;
    }

    if (stopReason === "refusal") {
      refusalReason = {
        reason: "Model emitted a refusal stop reason.",
        suggested_next_step: null,
      };
      break;
    }

    // end_turn, max_tokens, stop_sequence, pause_turn → done.
    break;
  }

  // Atomicity per design doc §2.5: persist assistant turn ONLY if
  // no SDK error occurred. Round-cap, refusal, and end_turn all
  // produce a turn worth persisting.
  if (turnError && turnError.code === "anthropic_sdk_error") {
    yield { type: "error", ...turnError };
    return;
  }

  // Finalize the pre-inserted assistant stub with the loop's outputs.
  const finalText = accumulatedText.join("");
  await finalizeTurn({
    turn_id: assistantTurn.id,
    content_text: finalText.length > 0 ? finalText : null,
    tool_calls: collectedToolCalls.length > 0 ? collectedToolCalls : null,
    refusal: refusalReason ? { reason: refusalReason.reason } : null,
    input_tokens: lastFinalMessage?.usage.input_tokens ?? null,
    output_tokens: lastFinalMessage?.usage.output_tokens ?? null,
    cache_read_tokens: lastFinalMessage?.usage.cache_read_input_tokens ?? null,
  });
  const persistedAssistant = assistantTurn;

  if (refusalReason) {
    yield {
      type: "refusal",
      reason: refusalReason.reason,
      suggested_next_step: refusalReason.suggested_next_step,
    };
    return;
  }

  if (turnError) {
    yield { type: "error", ...turnError };
    return;
  }

  yield {
    type: "done",
    turn_id: persistedAssistant.id,
    audit_ids: collectedAuditIds,
  };
}
