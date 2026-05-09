/**
 * Server-Sent Events transport for the agent loop. Defines:
 *
 *   - The discriminated union of agent stream event types.
 *   - The Zod schema for runtime validation at both emit and consume.
 *   - `serializeSseEvent()` which formats events as SSE wire bytes.
 *   - `makeSseResponse()` which wraps a ReadableStream as a Next.js
 *     Response with the right headers.
 *
 * The event type union is the authoritative contract between the
 * server (which emits) and the future frontend (which consumes via
 * fetch + ReadableStream reader). Both ends Zod-validate; mismatches
 * are caught at parse time on the frontend.
 *
 * v1 event types (per design doc §3.2):
 *   turn_started        — first event, signals new assistant turn beginning
 *   token               — text delta from the model
 *   tool_call_started   — tool invocation began (with host-readable summary)
 *   tool_call_completed — tool returned (success + result summary)
 *   tool_call_failed    — tool failed; carries the structured error taxonomy (M6 D28)
 *   action_proposed     — a gated tool's proposal landed; agent_artifacts row in
 *                          state='emitted'. Discriminated on action_kind:
 *                            * memory_write   — write_memory_fact (M6 substrate)
 *                            * guest_message  — propose_guest_message (M7)
 *   action_completed    — host approved a proposal; substrate executed it.
 *                          Discriminated on action_kind with kind-specific fields:
 *                            * memory_write   — memory_facts row committed
 *                            * guest_message  — Channex send acknowledged
 *   done                — assistant turn finished cleanly (end_turn or max_tokens)
 *   error               — turn-level fatal error reserved for unrecoverable
 *                          failures (network, malformed model response).
 *                          Per-tool failures use tool_call_failed instead.
 *                          Post-approval execution failures (Channex send rejected)
 *                          surface as `error` with a code='channex_send_failed' so
 *                          the chat shell can render the GuestMessageProposal
 *                          'failed' visual; substrate keeps artifact state='emitted'
 *                          + commit_metadata.last_error so Try-again re-runs the
 *                          handler.
 *   refusal             — model declined to ground; structured fallback
 *
 * D39 history: M5 declared `action_proposed` as a forward-looking event.
 * M6 promoted `tool_call_failed`, `memory_write_pending`, `memory_write_saved`
 * into the active schema. M7 canonicalizes the action-proposal events:
 * `memory_write_pending` → `action_proposed{action_kind:'memory_write'}` and
 * `memory_write_saved` → `action_completed{action_kind:'memory_write'}`.
 * `propose_guest_message` activates the new `action_kind='guest_message'`
 * branch. No forward-looking events remain; M8+ tools introduce their own
 * placeholders following the same pattern.
 */

import { z } from "zod";

// Action-kind-specific payload schemas. Reused by the AgentStreamEventSchema
// nested discriminated union below. Memory-write payload preserves the 8
// fields M6 emitted under `memory_write_pending` verbatim — the rename is
// wire-shape only.
const MemoryWriteProposedPayloadSchema = z.object({
  property_id: z.string(),
  sub_entity_type: z.string(),
  attribute: z.string(),
  fact_value: z.unknown(),
  confidence: z.number().optional(),
  source: z.string(),
  supersedes: z.string().optional(),
  supersedes_memory_fact_id: z.string().optional(),
  citation: z
    .object({
      source_text: z.string().optional(),
      reasoning: z.string().optional(),
    })
    .optional(),
});

const GuestMessageProposedPayloadSchema = z.object({
  booking_id: z.string(),
  message_text: z.string(),
});

// action_proposed — nested discriminator on action_kind narrows the payload.
const ActionProposedSchema = z.discriminatedUnion("action_kind", [
  z.object({
    type: z.literal("action_proposed"),
    action_kind: z.literal("memory_write"),
    artifact_id: z.string(),
    audit_log_id: z.string(),
    proposed_payload: MemoryWriteProposedPayloadSchema,
    supersedes: z.string().optional(),
  }),
  z.object({
    type: z.literal("action_proposed"),
    action_kind: z.literal("guest_message"),
    artifact_id: z.string(),
    audit_log_id: z.string(),
    proposed_payload: GuestMessageProposedPayloadSchema,
  }),
]);

// action_completed — nested discriminator carries kind-specific commit refs.
const ActionCompletedSchema = z.discriminatedUnion("action_kind", [
  z.object({
    type: z.literal("action_completed"),
    action_kind: z.literal("memory_write"),
    artifact_id: z.string(),
    audit_log_id: z.string(),
    memory_fact_id: z.string(),
    superseded_memory_fact_id: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal("action_completed"),
    action_kind: z.literal("guest_message"),
    artifact_id: z.string(),
    audit_log_id: z.string(),
    channex_message_id: z.string(),
  }),
]);

export const AgentStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("turn_started"),
    conversation_id: z.string(),
  }),
  z.object({
    type: z.literal("token"),
    delta: z.string(),
  }),
  z.object({
    type: z.literal("tool_call_started"),
    tool_use_id: z.string(),
    tool_name: z.string(),
    input_summary: z.string(),
  }),
  z.object({
    type: z.literal("tool_call_completed"),
    tool_use_id: z.string(),
    success: z.boolean(),
    result_summary: z.string(),
  }),
  z.object({
    type: z.literal("tool_call_failed"),
    tool_use_id: z.string(),
    tool_name: z.string(),
    error: z.object({
      kind: z.enum([
        "validation",
        "authorization",
        "constraint",
        "conflict",
        "transient",
        "unknown",
      ]),
      message: z.string(),
      retryable: z.boolean(),
    }),
    latency_ms: z.number().int().nonnegative(),
  }),
  ActionProposedSchema,
  ActionCompletedSchema,
  z.object({
    type: z.literal("done"),
    turn_id: z.string(),
    audit_ids: z.array(z.string()),
  }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
  }),
  z.object({
    type: z.literal("refusal"),
    reason: z.string(),
    suggested_next_step: z.string().nullable(),
  }),
  // M8 Phase D F4 + P4: structured refusal envelope. Distinct from
  // the M5 `refusal` event above — that one carries Anthropic's
  // stop_reason='refusal' surface (model-emitted safety voice). This
  // one carries the F4 RefusalEnvelope shape, generated by P4's
  // pre-dispatch classifier at propose_guest_message for the three
  // §2.3.4 publisher categories. Coexistence per Decision 4.
  z.object({
    type: z.literal("refusal_envelope"),
    envelope: z.object({
      kind: z.enum(["hard_refusal", "soft_refusal", "host_input_needed"]),
      reason: z.string(),
      alternative_path: z.string().optional(),
      override_available: z.boolean().optional(),
      missing_inputs: z.array(z.string()).optional(),
      suggested_inputs: z.array(z.string()).optional(),
    }),
  }),
]);

export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;

/**
 * Serialize an agent stream event into SSE wire format. Each event
 * is `data: <json>\n\n` per the SSE protocol.
 */
export function serializeSseEvent(event: AgentStreamEvent): string {
  // Validate at emit so a malformed event in code is caught early.
  AgentStreamEventSchema.parse(event);
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Build a Next.js streaming Response from a ReadableStream. Sets
 * SSE-appropriate headers and disables proxy/edge buffering.
 */
export function makeSseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx, Vercel edge proxy).
      "X-Accel-Buffering": "no",
    },
  });
}
