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
 * v1 event types (per design doc §3.2, minus 'artifact' which M7 adds):
 *   turn_started        — first event, signals new assistant turn beginning
 *   token               — text delta from the model
 *   tool_call_started   — tool invocation began (with host-readable summary)
 *   tool_call_completed — tool returned (success + result summary)
 *   done                — assistant turn finished cleanly (end_turn or max_tokens)
 *   error               — recoverable or fatal error; client decides retry
 *   refusal             — model declined to ground; structured fallback
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
