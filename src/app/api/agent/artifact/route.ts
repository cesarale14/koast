/**
 * POST /api/agent/artifact
 *
 * Host-action endpoint for resolving gated artifacts. Three actions:
 *
 *   { audit_id, action: 'approve' } →
 *     Looks up agent_artifacts by audit_log_id, dispatches to the
 *     post-approval handler by kind, runs the side effect:
 *       - 'property_knowledge_confirmation' → INSERT into memory_facts
 *         via writeMemoryFactHandler (M6)
 *       - 'guest_message_proposal' → channexSendMessage + messages
 *         upsert via proposeGuestMessageHandler (M7)
 *     Returns SSE stream with `action_completed` (with action_kind=
 *     'memory_write' for M6, or 'guest_message' for M7) plus 'done'.
 *
 *     M7 §6 failure encoding for guest_message: ChannexSendError keeps
 *     artifact state='emitted', writes commit_metadata.last_error,
 *     flips audit outcome→'failed', emits `error` SSE with code=
 *     'channex_send_failed'. Try-again re-POSTs and re-runs the
 *     handler from a clean audit-pending lifecycle.
 *
 *   { audit_id, action: 'edit', edited_text } →   M7 D38
 *     State must be 'emitted' (single edit per artifact, CF #37).
 *     Updates agent_artifacts.payload to add edited_text alongside
 *     the original message_text (preserves the agent's draft for
 *     audit), flips state to 'edited' (non-terminal — committed_at
 *     stays NULL). Returns plain JSON.
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
import { proposeGuestMessageHandler } from "@/lib/action-substrate/handlers/propose-guest-message";
import { updateArtifactState } from "@/lib/action-substrate/artifact-writer";
import { updateAuditOutcome } from "@/lib/action-substrate/audit-writer";
import { makeSseResponse, serializeSseEvent } from "@/lib/agent/sse";
import { ChannexSendError } from "@/lib/channex/messages";
import { ColdSendUnsupportedError } from "@/lib/action-substrate/handlers/errors";

// Side-effect import: registers tools and stakes entries (M6 D24
// raise: write_memory_fact stakes='medium'; M7 D38: propose_guest_message
// stakes='medium', editable=true).
import "@/lib/agent/tools";

const RequestSchema = z.discriminatedUnion("action", [
  z.object({ audit_id: z.string().uuid(), action: z.literal("approve") }),
  z.object({ audit_id: z.string().uuid(), action: z.literal("discard") }),
  z.object({
    audit_id: z.string().uuid(),
    action: z.literal("edit"),
    edited_text: z.string().min(1).max(5000),
  }),
]);

interface ArtifactRow {
  id: string;
  audit_log_id: string;
  kind: string;
  payload: Record<string, unknown>;
  state: string;
  conversation_id: string;
  turn_id: string;
  commit_metadata: Record<string, unknown> | null;
}

/**
 * Look up the agent_artifacts row by its paired audit_log_id (M6.2 FK).
 * Verifies the artifact's conversation belongs to the authenticated
 * host. Approve and edit paths accept state='emitted' OR 'edited'
 * (M7 D38 — host edited the draft, then approves). Terminal states
 * ('confirmed', 'dismissed', 'superseded') are refused with 409.
 */
async function resolveArtifact(
  auditLogId: string,
  hostId: string,
): Promise<ArtifactRow> {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const artifactBuilder = supabase.from("agent_artifacts") as any;
  const { data: artifact, error } = await artifactBuilder
    .select(
      "id, audit_log_id, kind, payload, state, conversation_id, turn_id, commit_metadata",
    )
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

  // Approve / edit paths both require an actionable state. M6 only
  // accepted 'emitted'; M7 widens to also accept 'edited' so a host
  // can approve a draft they've edited. The per-action state guards
  // (edit-only-when-emitted, etc.) live at the call site below.
  if (artifact.state !== "emitted" && artifact.state !== "edited") {
    throw new Error(
      `[artifact] Artifact ${artifact.id} is in state='${artifact.state}', not 'emitted' or 'edited'. Cannot re-resolve.`,
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
  const { audit_id } = parsed.data;
  const action = parsed.data.action;

  // 3. Resolve the artifact + ownership check.
  let artifact: ArtifactRow;
  try {
    artifact = await resolveArtifact(audit_id, user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Distinguish ownership/not-found from already-resolved.
    const status = /not 'emitted' or 'edited'/.test(message) ? 409 : 404;
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

  // 4b. Edit path (M7 D38): single edit per artifact for v1 (CF #37).
  // State MUST be 'emitted' — re-editing an already-edited artifact is
  // out of scope. Direct supabase update preserves committed_at=NULL
  // (updateArtifactState would stamp it for any non-emitted state).
  if (action === "edit") {
    if (artifact.state !== "emitted") {
      return NextResponse.json(
        {
          error: `Artifact ${artifact.id} is in state='${artifact.state}'; edit is only supported on state='emitted'.`,
        },
        { status: 409 },
      );
    }

    try {
      const supabase = createServiceClient();
      const updatedPayload = {
        ...artifact.payload,
        edited_text: parsed.data.edited_text,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase.from("agent_artifacts") as any)
        .update({ state: "edited", payload: updatedPayload })
        .eq("id", artifact.id);

      if (updateError) {
        return NextResponse.json(
          { error: `Edit failed: ${updateError.message}` },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        state: "edited",
        edited_text: parsed.data.edited_text,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // 4c. Approve path: dispatch via action handler registry, stream
  // the completed event + done as SSE.
  const dispatchStart = Date.now();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Pre-execute audit flip (M7): keeps the audit lifecycle clean
        // per attempt. If a prior attempt left outcome='failed' (e.g.
        // §6 ChannexSendError followed by host's Try-again), reset to
        // 'pending' before the handler runs. Idempotent for already-
        // pending rows. CF #41 — separate retry-attempts table is
        // deferred; same audit row is reused across attempts for v1.
        await updateAuditOutcome(audit_id, "pending");

        if (artifact.kind === "property_knowledge_confirmation") {
          // M6 path — unchanged. Memory write failures fall through to
          // the outer catch and trigger the M6 dismissed pattern.
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

          await updateArtifactState(artifact.id, "confirmed", {
            commit_metadata: {
              memory_fact_id: handlerResult.memory_fact_id,
              superseded_memory_fact_id: handlerResult.superseded_memory_fact_id,
            },
          });
          await updateAuditOutcome(audit_id, "succeeded", {
            latency_ms: Date.now() - dispatchStart,
          });

          controller.enqueue(
            encoder.encode(
              serializeSseEvent({
                type: "action_completed",
                action_kind: "memory_write",
                artifact_id: artifact.id,
                audit_log_id: audit_id,
                memory_fact_id: handlerResult.memory_fact_id,
                superseded_memory_fact_id: handlerResult.superseded_memory_fact_id,
              }),
            ),
          );
        } else if (artifact.kind === "guest_message_proposal") {
          // M7 path with §6 failure encoding for ChannexSendError.
          const guestPayload = artifact.payload as {
            booking_id: string;
            message_text: string;
            edited_text?: string;
          };

          try {
            const handlerResult = await proposeGuestMessageHandler({
              host_id: user.id,
              conversation_id: artifact.conversation_id,
              turn_id: artifact.turn_id,
              artifact_id: artifact.id,
              payload: guestPayload,
              commit_metadata: artifact.commit_metadata as
                | {
                    channex_message_id?: string;
                    message_id?: string;
                    last_error?: { message: string; channex_status?: number };
                  }
                | undefined,
            });

            await updateArtifactState(artifact.id, "confirmed", {
              commit_metadata: {
                channex_message_id: handlerResult.channex_message_id,
                message_id: handlerResult.message_id,
                channel: handlerResult.channel,
              },
            });
            await updateAuditOutcome(audit_id, "succeeded", {
              latency_ms: Date.now() - dispatchStart,
            });

            controller.enqueue(
              encoder.encode(
                serializeSseEvent({
                  type: "action_completed",
                  action_kind: "guest_message",
                  artifact_id: artifact.id,
                  audit_log_id: audit_id,
                  channex_message_id: handlerResult.channex_message_id,
                }),
              ),
            );
          } catch (guestErr) {
            // §6 amendment: ChannexSendError AND ColdSendUnsupportedError
            // both route through the same encoding (state stays 'emitted',
            // audit outcome='failed', commit_metadata.last_error
            // populated, error SSE) but with distinct SSE error codes
            // so the chat shell can differentiate cause:
            //   - ChannexSendError         → code='channex_send_failed'
            //                                channex_status=<HTTP code>
            //   - ColdSendUnsupportedError → code='cold_send_unsupported'
            //                                channex_status=null (Channex
            //                                wasn't reached) + gate
            //                                identifier captured.
            // Other errors (ownership, booking missing, db upsert hiccup
            // post-Channex-200) re-throw to the outer catch — M6
            // dismissed pattern.
            const isChannexFailure = guestErr instanceof ChannexSendError;
            const isColdSendUnsupported = guestErr instanceof ColdSendUnsupportedError;
            if (isChannexFailure || isColdSendUnsupported) {
              const supabase = createServiceClient();
              const lastError: {
                message: string;
                channex_status: number | null;
                attempted_at: string;
                gate?: string;
              } = {
                message: (guestErr as Error).message,
                channex_status: isChannexFailure ? guestErr.status : null,
                attempted_at: new Date().toISOString(),
              };
              if (isColdSendUnsupported) {
                lastError.gate = guestErr.gate;
              }
              const mergedMetadata = {
                ...(artifact.commit_metadata ?? {}),
                last_error: lastError,
              };
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase.from("agent_artifacts") as any)
                .update({ commit_metadata: mergedMetadata })
                .eq("id", artifact.id)
                .then((res: { error: { message: string } | null }) => {
                  if (res.error) {
                    console.warn(
                      `[artifact] last_error update failed (non-fatal): ${res.error.message}`,
                    );
                  }
                });

              await updateAuditOutcome(audit_id, "failed", {
                latency_ms: Date.now() - dispatchStart,
                error_message: (guestErr as Error).message,
              });

              controller.enqueue(
                encoder.encode(
                  serializeSseEvent({
                    type: "error",
                    code: isChannexFailure
                      ? "channex_send_failed"
                      : "cold_send_unsupported",
                    message: (guestErr as Error).message,
                    recoverable: isChannexFailure
                      ? true
                      : (guestErr as ColdSendUnsupportedError).recoverable,
                  }),
                ),
              );
              // Skip done — the error event closes the visible flow.
              return;
            }
            // Non-§6 errors re-throw to the outer catch — M6 dismissed.
            throw guestErr;
          }
        } else {
          throw new Error(
            `[artifact] Unknown artifact kind: ${artifact.kind}.`,
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
        // M6 outer-catch behavior: artifact dismissed (unrecoverable),
        // audit failed. M7 §6 failure encoding for guest_message takes
        // the inner-catch path above and never reaches here.
        await updateAuditOutcome(audit_id, "failed", {
          latency_ms: Date.now() - dispatchStart,
          error_message: `post_approval_failed: ${message}`,
        }).catch(() => {});
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
