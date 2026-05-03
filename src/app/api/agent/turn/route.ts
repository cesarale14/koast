/**
 * POST /api/agent/turn
 *
 * Stream a single agent turn. Request body is JSON:
 *   { conversation_id: string|null, message: string, ui_context?: ... }
 * Response is SSE: text/event-stream of AgentStreamEvent values.
 *
 * Design doc references: §2 (request flow), §3 (streaming contract).
 *
 * The route is thin:
 *   1. Authenticate the host via getAuthenticatedUser() (host-level;
 *      no property ownership check — the agent operates across the
 *      host's whole portfolio, with optional ui_context hints inside
 *      the body for property-specific resolution).
 *   2. Zod-validate the request body.
 *   3. Call runAgentTurn() which returns an AsyncGenerator of typed
 *      AgentStreamEvent values.
 *   4. Build a ReadableStream that pulls from the generator,
 *      serializes each event to SSE wire format, and enqueues the
 *      bytes to the response stream.
 *   5. Wrap in makeSseResponse() to return.
 *
 * Tools are registered at module-load time by importing
 * @/lib/agent/tools — that module's import side-effect populates
 * the dispatcher registry with read_memory.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { runAgentTurn } from "@/lib/agent/loop";
import { makeSseResponse, serializeSseEvent } from "@/lib/agent/sse";

// Side-effect import: registers read_memory with the dispatcher.
import "@/lib/agent/tools";

const RequestSchema = z.object({
  conversation_id: z.string().uuid().nullable(),
  message: z.string().min(1).max(8000),
  ui_context: z
    .object({
      active_route: z.string().optional(),
      active_property_id: z.string().uuid().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  // 1. Auth
  const { user } = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Body validation
  let parsed;
  try {
    const body = await request.json();
    parsed = RequestSchema.safeParse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  const { conversation_id, message, ui_context } = parsed.data;

  // 3-5. Stream the agent turn as SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runAgentTurn({
          host: { id: user.id },
          conversation_id,
          user_message_text: message,
          ui_context,
        })) {
          if (request.signal.aborted) {
            // Client disconnected; stop emitting (loop's in-flight
            // tools complete per design doc §2.5)
            break;
          }
          controller.enqueue(encoder.encode(serializeSseEvent(event)));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[api:agent:turn] Stream error:", message);
        const errorEvent = serializeSseEvent({
          type: "error",
          code: "stream_error",
          message,
          recoverable: false,
        });
        controller.enqueue(encoder.encode(errorEvent));
      } finally {
        controller.close();
      }
    },
  });

  return makeSseResponse(stream);
}
