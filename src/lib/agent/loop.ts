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
  classifyAccumulatedText,
  upgradeStopReasonRefusal,
} from "./post-stream-classifier";
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
 * Type guard for the dispatcher fork's proposal-time output (D35).
 * Used in the loop to gate emission of `action_proposed` SSE events for
 * gated tools (write_memory_fact in M6, propose_guest_message in M7+).
 * Defensive: guards against future schema drift; the dispatcher's
 * outputSchema validation already ran before we get here.
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
  /**
   * M8 Phase D P4: when the pre-dispatch publisher-category classifier
   * matches at propose_guest_message, the round emits a refusal_envelope
   * event and skips dispatch. The envelope is surfaced here so the outer
   * runAgentTurn() can persist it on the assistant turn and finalize.
   */
  refusalEnvelope?: import("./refusal-envelope").RefusalEnvelope;
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
  // P4: set when the pre-dispatch classifier matches; surfaced in
  // RoundResult so runAgentTurn() can finalize the refusal-shaped turn.
  // M9 Phase D: also set by the post-stream classifier (A4 chat-text
  // substrate-catch) per D27 Option ε.
  let roundRefusalEnvelope:
    | import("./refusal-envelope").RefusalEnvelope
    | undefined;

  // M9 Phase D A4 (D27 Option ε): post-stream refusal classifier.
  // Catches generic LLM-refusal phrases ("I can't help with that",
  // "As an AI…", apology-prefixed refusals) in the assembled assistant
  // text BEFORE we branch on stop_reason. Fires regardless of stop_reason
  // — tool_use turns can have refusal voice in the pre-tool preamble,
  // end_turn / refusal turns have it in the response text.
  //
  // Pattern catalog: src/lib/agent/refusal-patterns.ts (shared with Phase F
  // D24 CI shape regex when that ships; same source).
  const postStreamResult = classifyAccumulatedText(accumulatedText);
  if (postStreamResult?.kind === "refusal") {
    yield {
      type: "refusal_envelope",
      envelope: postStreamResult.envelope,
    };
    roundRefusalEnvelope = postStreamResult.envelope;
    return {
      events: [],
      finalMessage,
      accumulatedText,
      toolCallRecords,
      auditIds,
      refusalEnvelope: roundRefusalEnvelope,
    };
  }

  if (finalMessage.stop_reason === "tool_use") {
    for (const block of finalMessage.content) {
      if (block.type !== "tool_use") continue;

      const inputObj = (block.input ?? {}) as Record<string, unknown>;

      // M8 Phase D P4: pre-dispatch publisher-category classifier at
      // propose_guest_message. If the model's drafted message_text
      // matches one of the three §2.3.4 categories (legal correspondence,
      // regulatory submission, substantive licensed-professional comm),
      // emit a refusal_envelope event in lieu of dispatching the tool.
      // The classifier is the substrate failsafe; the system prompt +
      // tool description steer the model to redirect via chat instead
      // of calling the tool in the first place (defense-in-depth per
      // P4 sign-off Decision 1).
      if (block.name === "propose_guest_message") {
        const messageText =
          typeof (inputObj as { message_text?: unknown }).message_text === "string"
            ? ((inputObj as { message_text: string }).message_text)
            : "";
        const { classifyPublisherCategory, detectLicensedProfessionalTerm } =
          await import("./refusal-classifier");
        const category = classifyPublisherCategory(messageText);
        if (category !== null) {
          const {
            envelopeForPublisherCategory,
            buildLicensedProfessionalRefusal,
          } = await import("./refusal-envelope");
          const envelope =
            category === "licensed_professional"
              ? buildLicensedProfessionalRefusal(
                  detectLicensedProfessionalTerm(messageText),
                )
              : envelopeForPublisherCategory(category);
          yield {
            type: "refusal_envelope",
            envelope,
          };
          roundRefusalEnvelope = envelope;
          // Refusal closes the turn; do not dispatch any further tool
          // calls in this round. The model's other tool_use blocks (if
          // any) for this turn are skipped — refusing one tool call
          // refuses the turn.
          break;
        }

        // M8 Phase F C3 (D9): pre-dispatch required-capability check.
        // Runs AFTER P4 publisher-category — P4 hard-refuses (close);
        // C3 host-input-needs (open). If the property is missing wifi
        // creds / door code / parking / property_type, emit a
        // host_input_needed envelope and break dispatch. Booking →
        // property resolution lives behind this intercept; a M9 cache
        // is a forward-tracked perf candidate.
        const bookingId =
          typeof (inputObj as { booking_id?: unknown }).booking_id === "string"
            ? ((inputObj as { booking_id: string }).booking_id)
            : null;
        if (bookingId) {
          const supabaseRC = createServiceClient();
          const { data: bookingRow, error: bookingErr } = await supabaseRC
            .from("bookings")
            .select("property_id")
            .eq("id", bookingId)
            .maybeSingle();
          if (!bookingErr && bookingRow?.property_id) {
            const { checkRequiredCapabilities, buildMultiMissingEnvelopeText } =
              await import("./required-capabilities");
            try {
              const result = await checkRequiredCapabilities(
                supabaseRC,
                bookingRow.property_id as string,
              );
              if (!result.satisfied) {
                const text = buildMultiMissingEnvelopeText(result.missing);
                const envelope = {
                  kind: "host_input_needed" as const,
                  reason: text.reason,
                  missing_inputs: text.missing_inputs,
                  suggested_inputs: text.suggested_inputs,
                };
                yield {
                  type: "refusal_envelope",
                  envelope,
                };
                roundRefusalEnvelope = envelope;
                break;
              }
            } catch (err) {
              // Defensive: don't break dispatch on lookup error;
              // logging signals the diagnostic path without blocking
              // the model's tool call. Smoke gate verifies the
              // happy-path; a hard error here is M9 telemetry candidate.
              console.warn(
                `[loop] C3 required-capability check skipped: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
        }
      }

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

        // D35 fork side-channel (M6 + M7 D39): when a gated tool's
        // proposal returns successfully, the dispatcher already wrote
        // the agent_artifacts row. Emit `action_proposed` so the chat
        // shell can render the inline artifact. The action_kind
        // discriminator carries the tool's payload shape.
        if (isProposalOutput(result.value)) {
          if (block.name === "write_memory_fact") {
            const memoryInput = inputObj as {
              property_id: string;
              sub_entity_type: string;
              attribute: string;
              fact_value: unknown;
              confidence?: number;
              source: string;
              supersedes?: string;
              supersedes_memory_fact_id?: string;
              citation?: { source_text?: string; reasoning?: string };
            };
            yield {
              type: "action_proposed",
              action_kind: "memory_write",
              artifact_id: result.value.artifact_id,
              audit_log_id: result.value.audit_log_id,
              proposed_payload: memoryInput,
              supersedes:
                typeof (inputObj as { supersedes?: unknown }).supersedes === "string"
                  ? ((inputObj as { supersedes?: string }).supersedes as string)
                  : undefined,
            };
          } else if (block.name === "propose_guest_message") {
            const guestInput = inputObj as {
              booking_id: string;
              message_text: string;
            };
            yield {
              type: "action_proposed",
              action_kind: "guest_message",
              artifact_id: result.value.artifact_id,
              audit_log_id: result.value.audit_log_id,
              proposed_payload: {
                booking_id: guestInput.booking_id,
                message_text: guestInput.message_text,
              },
            };
          }
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
    refusalEnvelope: roundRefusalEnvelope,
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

  // M8 Phase F C3 (D11): per-turn minimal sufficiency rollup.
  // Computed once per turn; passed into buildSystemPrompt so the model
  // can surface the completion milestone once when sufficiency first
  // hits 'rich'. Defensive on errors — sufficiency failure shouldn't
  // block the turn; fall through to no-snapshot. createServiceClient
  // is also inside the try because it throws when service-role env is
  // unset (test environments / local-dev without secrets).
  let supabaseForSufficiency: ReturnType<typeof createServiceClient> | null = null;
  let sufficiencyContext:
    | NonNullable<Parameters<typeof buildSystemPrompt>[0]>["sufficiency"]
    | undefined;
  try {
    supabaseForSufficiency = createServiceClient();
    const { classifySufficiency } = await import("./sufficiency");
    const { readOnboardingCompletionOfferedAt: readOffered } = await import("./onboarding-state");
    const classification = await classifySufficiency(supabaseForSufficiency, input.host.id);
    const offeredAt = await readOffered(
      supabaseForSufficiency,
      input.host.id,
    );
    sufficiencyContext = {
      level: classification.level,
      rich_properties: classification.rollup.rich_properties,
      total_properties: classification.rollup.properties,
      completion_offered_at: offeredAt,
    };
  } catch (err) {
    console.warn(
      `[loop] C3 sufficiency snapshot skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Step 4: system prompt + tools.
  const systemPrompt = buildSystemPrompt({
    host: input.host,
    sufficiency: sufficiencyContext,
  });
  const tools = getToolsForAnthropicSDK();

  const accumulatedText: string[] = [];
  const collectedToolCalls: ToolCallRecord[] = [];
  const collectedAuditIds: string[] = [];
  let lastFinalMessage: Anthropic.Message | null = null;

  let round = 0;
  let turnError: { code: string; message: string; recoverable: boolean } | null = null;
  let refusalReason: { reason: string; suggested_next_step: string | null } | null = null;
  // M8 Phase D P4: structured refusal envelope (RefusalEnvelope shape).
  // Set by the pre-dispatch classifier at propose_guest_message when a
  // §2.3.4 publisher category matches. Persisted on the assistant turn's
  // JSONB `refusal` column alongside the legacy {reason, suggested_next_step}
  // path; turnReducer discriminates on the `kind` field at hydration.
  let refusalEnvelope: import("./refusal-envelope").RefusalEnvelope | null = null;

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

    // M8 Phase D P4: pre-dispatch refusal short-circuits the round.
    // The envelope was already yielded as a refusal_envelope event; we
    // capture it for persistence and break out of the round loop so
    // finalizeTurn writes it to the JSONB column.
    if (roundResult.refusalEnvelope) {
      refusalEnvelope = roundResult.refusalEnvelope;
      break;
    }

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
      // M9 Phase D G8-D3: upgrade the generic refusal event to an
      // envelope-shaped emission via post-stream-classifier. v2.0 D27
      // framing assumed this branch already used the M8 F4 envelope
      // substrate; audit revealed it predates F4 and emits a generic
      // event. v2.4 closes the gap.
      const upgraded = upgradeStopReasonRefusal(roundResult.accumulatedText);
      yield { type: "refusal_envelope", envelope: upgraded };
      refusalEnvelope = upgraded;
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

  // M8 Phase F C3 (D11): first-time 'rich' transition writes the
  // onboarding_completion_offered_at fact so future turns see it set
  // and the prompt suppresses re-surfacing. M9 Phase D A6-2 hardens
  // the fact-write with retry-with-backoff + non-swallowing failure
  // logging — M8 wrapped this in silent try/catch + console.warn,
  // which let the fact-write fail silently and re-ask the model next
  // turn. A6-3 + retries ensure the substrate guard actually holds.
  if (
    sufficiencyContext &&
    supabaseForSufficiency &&
    sufficiencyContext.level === "rich" &&
    sufficiencyContext.completion_offered_at === null
  ) {
    const MAX_WRITE_ATTEMPTS = 3;
    let writeAttempts = 0;
    let writeError: Error | null = null;
    const { writeOnboardingFact } = await import("./onboarding-state");
    while (writeAttempts < MAX_WRITE_ATTEMPTS) {
      try {
        await writeOnboardingFact(
          supabaseForSufficiency,
          input.host.id,
          "onboarding_completion_offered_at",
          new Date().toISOString(),
        );
        writeError = null;
        break;
      } catch (err) {
        writeError = err instanceof Error ? err : new Error(String(err));
        writeAttempts += 1;
        if (writeAttempts < MAX_WRITE_ATTEMPTS) {
          // Exponential backoff: 100ms, 200ms (cap at 2 retries).
          await new Promise((resolve) =>
            setTimeout(resolve, 100 * Math.pow(2, writeAttempts - 1)),
          );
        }
      }
    }
    if (writeError) {
      // A6-2: surface the failure non-silently. M10 candidate: write
      // to agent_audit_log with kind='a6_fact_write_failed' so the
      // failure is visible in the audit feed. For Phase D, error-level
      // log is the substrate event (not console.warn — that's
      // M8 swallowing behavior A6-2 replaces).
      console.error(
        `[loop] A6-2 onboarding-offered write FAILED after ${MAX_WRITE_ATTEMPTS} attempts: ${writeError.message}`,
      );
    }
  }

  // M9 Phase D A6-1: cross-round completion-message duplicate detection.
  // The post-stream classifier (runOneRound) catches refusal patterns
  // per-round; here we look across rounds for the canonical completion
  // sentence appearing multiple times in the assembled text. Detection-
  // only at Phase D — truncation is M10 candidate (text-mangling has
  // real risk of cutting mid-sentence; M10 designs the truncation
  // boundary). Phase D logs the event; A6-2 fact-write guards the
  // cross-turn case.
  const crossRoundCompletionCheck = classifyAccumulatedText(
    accumulatedText.join(""),
  );
  if (crossRoundCompletionCheck?.kind === "completion_duplicate") {
    console.warn(
      `[loop] A6-1 in-turn completion-message duplicate detected: pattern=${crossRoundCompletionCheck.pattern_id} occurrences=${crossRoundCompletionCheck.occurrences}`,
    );
  }

  // Finalize the pre-inserted assistant stub with the loop's outputs.
  const finalText = accumulatedText.join("");
  await finalizeTurn({
    turn_id: assistantTurn.id,
    content_text: finalText.length > 0 ? finalText : null,
    tool_calls: collectedToolCalls.length > 0 ? collectedToolCalls : null,
    refusal: refusalEnvelope
      ? (refusalEnvelope as unknown as Record<string, unknown>)
      : refusalReason
        ? { reason: refusalReason.reason }
        : null,
    input_tokens: lastFinalMessage?.usage.input_tokens ?? null,
    output_tokens: lastFinalMessage?.usage.output_tokens ?? null,
    cache_read_tokens: lastFinalMessage?.usage.cache_read_input_tokens ?? null,
  });
  const persistedAssistant = assistantTurn;

  // M9 Phase D G8-D3: legacy refusalReason yield removed.
  // stop_reason='refusal' branch now emits envelope via
  // upgradeStopReasonRefusal at the round-loop break point; the
  // refusalReason variable is retained on the assistant turn's
  // JSONB column for backward-compat hydration but no caller sets
  // it anymore. The unconditional envelope-or-done path below
  // handles the unified flow.

  if (refusalEnvelope) {
    yield {
      type: "done",
      turn_id: persistedAssistant.id,
      audit_ids: collectedAuditIds,
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
