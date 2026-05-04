/**
 * POST /api/agent/artifact
 *
 * Host-action endpoint for memory_artifact resolutions (and, in future
 * milestones, every other gated artifact kind). Two actions:
 *
 *   { audit_id, action: 'approve' } →
 *     Looks up agent_artifacts by audit_log_id, dispatches to the
 *     action handler registry by kind, runs the post-approval handler
 *     (which performs the actual side effect — INSERT into memory_facts
 *     for write_memory_fact). Returns SSE stream containing
 *     memory_write_saved (or analogous saved event for future kinds)
 *     plus 'done'. Substrate flips agent_audit_log.outcome='succeeded'
 *     and agent_artifacts.state='confirmed'.
 *
 *   { audit_id, action: 'discard' } →
 *     No side effect; updates agent_artifacts.state='dismissed' and
 *     agent_audit_log.outcome='failed' (with error_message='dismissed_by_host').
 *     Returns plain JSON { success: true }.
 *
 * D30 — separate route from /api/agent/turn so the host-action surface
 * doesn't leak into the model's turn lifecycle. The artifact endpoint
 * is a direct-action path; the turn endpoint is the model loop.
 *
 * Auth: same getAuthenticatedUser pattern as M4 routes. Ownership
 * verified by joining agent_artifacts → agent_conversations.host_id.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { writeMemoryFactHandler } from "@/lib/action-substrate/handlers/write-memory-fact";
import { updateArtifactState } from "@/lib/action-substrate/artifact-writer";
import { updateAuditOutcome } from "@/lib/action-substrate/audit-writer";
import { makeSseResponse, serializeSseEvent } from "@/lib/agent/sse";

// Side-effect import: registers tools and stakes entries (M6 D24
// raise: write_memory_fact stakes='medium').
import "@/lib/agent/tools";

const RequestSchema = z.object({
  audit_id: z.string().uuid(),
  action: z.enum(["approve", "discard"]),
});

interface ArtifactRow {
  id: string;
  audit_log_id: string;
  kind: string;
  payload: Record<string, unknown>;
  state: string;
  conversation_id: string;
  turn_id: string;
}

/**
 * Look up the agent_artifacts row by its paired audit_log_id (M6.2 FK).
 * Verifies the artifact's conversation belongs to the authenticated
 * host, and that the artifact is still in state='emitted' (idempotency:
 * a dispatched artifact can't be re-resolved).
 */
async function resolveArtifact(
  auditLogId: string,
  hostId: string,
): Promise<ArtifactRow> {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const artifactBuilder = supabase.from("agent_artifacts") as any;
  const { data: artifact, error } = await artifactBuilder
    .select("id, audit_log_id, kind, payload, state, conversation_id, turn_id")
    .eq("audit_log_id", auditLogId)
    .single();

  if (error || !artifact) {
    throw new Error(
      `[artifact] No artifact found for audit_log_id=${auditLogId}: ${error?.message ?? "no row"}`,
    );
  }

  // Ownership check via conversations table (agent_artifacts policy
  // already enforces this at SELECT, but the service client bypasses
  // RLS — the explicit check is the defense-in-depth layer).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convBuilder = supabase.from("agent_conversations") as any;
  const { data: conv, error: convError } = await convBuilder
    .select("host_id")
    .eq("id", artifact.conversation_id)
    .single();

  if (convError || !conv) {
    throw new Error(
      `[artifact] Cannot fetch conversation ${artifact.conversation_id}: ${convError?.message ?? "no row"}`,
    );
  }
  if (conv.host_id !== hostId) {
    throw new Error(
      `[artifact] Host ${hostId} does not own conversation ${artifact.conversation_id}.`,
    );
  }

  if (artifact.state !== "emitted") {
    throw new Error(
      `[artifact] Artifact ${artifact.id} is in state='${artifact.state}', not 'emitted'. Cannot re-resolve.`,
    );
  }

  return artifact as ArtifactRow;
}

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
  const { audit_id, action } = parsed.data;

  // 3. Resolve the artifact + ownership check.
  let artifact: ArtifactRow;
  try {
    artifact = await resolveArtifact(audit_id, user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Distinguish ownership/not-found from already-resolved.
    const status = /not 'emitted'/.test(message) ? 409 : 404;
    return NextResponse.json({ error: message }, { status });
  }

  // 4a. Discard path: simple state update, JSON response.
  //
  // Sentinel convention (carry-forward §27): error_message='dismissed_by_host'
  // distinguishes host-side dismissal from real execution failure on
  // outcome='failed' audit rows. The audit log's outcome enum is
  // ('succeeded', 'failed', 'pending') per M1; there's no 'cancelled'
  // value yet. Future audit-log surfaces should filter on this
  // sentinel when reporting real execution failures (don't show
  // dismissals as failures in operations dashboards).
  if (action === "discard") {
    try {
      await updateArtifactState(artifact.id, "dismissed");
      await updateAuditOutcome(audit_id, "failed", {
        error_message: "dismissed_by_host",
      });
      return NextResponse.json({ success: true, state: "dismissed" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // 4b. Approve path: dispatch via action handler registry, stream
  // the saved event + done as SSE.
  const dispatchStart = Date.now();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (artifact.kind === "property_knowledge_confirmation") {
          // Cast through the tool's input shape; the proposal-time
          // dispatcher has already validated this against the tool's
          // inputSchema, so the runtime shape is trustworthy.
          const payload = artifact.payload as {
            property_id: string;
            sub_entity_type:
              | "front_door"
              | "lock"
              | "parking"
              | "wifi"
              | "hvac"
              | "kitchen_appliances";
            attribute: string;
            fact_value: unknown;
            confidence?: number;
            source: "host_taught" | "inferred" | "observed";
            supersedes?: string;
            supersedes_memory_fact_id?: string;
            citation?: { source_text?: string; reasoning?: string };
          };

          const handlerResult = await writeMemoryFactHandler({
            host_id: user.id,
            conversation_id: artifact.conversation_id,
            turn_id: artifact.turn_id,
            artifact_id: artifact.id,
            payload,
          });

          // Update lifecycle: artifact → confirmed; audit → succeeded.
          await updateArtifactState(artifact.id, "confirmed", {
            commit_metadata: {
              memory_fact_id: handlerResult.memory_fact_id,
              superseded_memory_fact_id: handlerResult.superseded_memory_fact_id,
            },
          });
          await updateAuditOutcome(audit_id, "succeeded", {
            latency_ms: Date.now() - dispatchStart,
          });

          // Emit the saved event.
          controller.enqueue(
            encoder.encode(
              serializeSseEvent({
                type: "memory_write_saved",
                artifact_id: artifact.id,
                audit_log_id: audit_id,
                memory_fact_id: handlerResult.memory_fact_id,
                superseded_memory_fact_id: handlerResult.superseded_memory_fact_id,
              }),
            ),
          );
        } else {
          throw new Error(
            `[artifact] Unknown artifact kind: ${artifact.kind}. M6 supports only property_knowledge_confirmation.`,
          );
        }

        // Final done event so the client closes the reader cleanly.
        controller.enqueue(
          encoder.encode(
            serializeSseEvent({
              type: "done",
              turn_id: artifact.turn_id,
              audit_ids: [audit_id],
            }),
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Mark the audit + artifact as failed; client receives error event.
        await updateAuditOutcome(audit_id, "failed", {
          latency_ms: Date.now() - dispatchStart,
          error_message: `post_approval_failed: ${message}`,
        }).catch(() => {});
        // Best-effort artifact state update; if it fails, log and continue.
        await updateArtifactState(artifact.id, "dismissed", {
          commit_metadata: { error_message: message },
        }).catch((e) => console.warn("[artifact] state update failed:", e));

        controller.enqueue(
          encoder.encode(
            serializeSseEvent({
              type: "error",
              code: "post_approval_failed",
              message,
              recoverable: false,
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return makeSseResponse(stream);
}
