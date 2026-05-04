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
 *   memory_write_pending — a write_memory_fact proposal landed; agent_artifacts
 *                          row is in state='emitted' (M6 D35 fork)
 *   memory_write_saved  — host approved a memory_write proposal; the
 *                          memory_facts row is committed (M6 post-approval)
 *   done                — assistant turn finished cleanly (end_turn or max_tokens)
 *   error               — turn-level fatal error reserved for unrecoverable
 *                          failures (network, malformed model response).
 *                          Per-tool failures use tool_call_failed instead.
 *   refusal             — model declined to ground; structured fallback
 *
 * The 4th forward-looking event from M5 — `action_proposed` — stays
 * deferred to M7 (non-memory action types). Reducer's exhaustive
 * check still fails for it, forcing M7 to address.
 */

import { z } from "zod";

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
  z.object({
    type: z.literal("memory_write_pending"),
    artifact_id: z.string(),
    audit_log_id: z.string(),
    proposed_payload: z.object({
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
    }),
    supersedes: z.string().optional(),
  }),
  z.object({
    type: z.literal("memory_write_saved"),
    artifact_id: z.string(),
    audit_log_id: z.string(),
    memory_fact_id: z.string(),
    superseded_memory_fact_id: z.string().nullable().optional(),
  }),
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
