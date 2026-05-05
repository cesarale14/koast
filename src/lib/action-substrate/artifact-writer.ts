/**
 * Writes (and updates) rows in `agent_artifacts`. Every gated tool's
 * proposal-time call produces one artifact row; the row's `state` is
 * the host-facing lifecycle of the proposal:
 *
 *   emitted    → the agent has proposed; awaiting host response
 *   confirmed  → host clicked Save with no edits; post-approval handler ran
 *   edited     → host modified the payload then saved; post-approval handler ran
 *   dismissed  → host rejected without action
 *   superseded → a later artifact corrects this one (M6 lifecycle expansion)
 *
 * Counterpart to audit-writer.ts: agent_artifacts is the lifecycle
 * surface (host-facing proposal state machine), agent_audit_log is the
 * execution-accountability ledger (succeeded/failed/pending of the
 * action attempt). The two tables pair via the audit_log_id FK
 * (M6 migration 20260504020000); JSONB context.artifact_id continues to
 * be written by the substrate as a defensive secondary lookup for
 * back-compat with M2's bypass code path.
 *
 * Caller contract: this module trusts its inputs. The caller —
 * dispatcher.ts in the require_confirmation branch (D35) — is
 * responsible for carrying the host's identity, the conversation/turn
 * scope, and the audit_log_id from the substrate's gate response.
 *
 * Uses the service-role Supabase client because agent_artifacts RLS
 * is SELECT-only for authenticated users; INSERT/UPDATE require
 * service-role auth.
 */

import { createServiceClient } from "@/lib/supabase/service";

export type AgentArtifactState =
  | "emitted"
  | "confirmed"
  | "edited"
  | "dismissed"
  | "superseded";

export interface WriteArtifactInput {
  conversation_id: string;
  turn_id: string;
  /** Matches the artifact registry kind. M6's first gated tool emits 'property_knowledge_confirmation'. */
  kind: string;
  /** Structured payload the agent proposed. Shape varies by kind; validated by the registry's Zod schema at emit and read time. */
  payload: Record<string, unknown>;
  /** Paired ref to the audit row recorded for this proposal attempt (FK added in M6.2). */
  audit_log_id: string;
  /** When this artifact corrects a prior pending or saved artifact, the prior artifact's id. */
  supersedes?: string;
}

export interface WriteArtifactResult {
  artifact_id: string;
  created_at: string;
}

interface ArtifactInsertRow {
  conversation_id: string;
  turn_id: string;
  kind: string;
  payload: Record<string, unknown>;
  audit_log_id: string;
  supersedes: string | null;
  // state, created_at, updated_at default at the DB layer (state='emitted' default).
}

/**
 * Write a new artifact row in state='emitted'. Returns the new artifact id.
 *
 * If `supersedes` is set, ALSO marks the prior artifact's state to
 * 'superseded' atomically (best-effort post-insert update; if the
 * prior row is missing or the update fails, the new artifact still
 * persists — the substrate's cascade is optimistic, with the new row
 * being the authoritative lifecycle state).
 */
export async function writeArtifact(
  input: WriteArtifactInput,
): Promise<WriteArtifactResult> {
  const supabase = createServiceClient();

  const row: ArtifactInsertRow = {
    conversation_id: input.conversation_id,
    turn_id: input.turn_id,
    kind: input.kind,
    payload: input.payload,
    audit_log_id: input.audit_log_id,
    supersedes: input.supersedes ?? null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("agent_artifacts") as any)
    .insert(row)
    .select("id, created_at")
    .single();

  if (error || !data) {
    throw new Error(
      `[artifact-writer] Failed to insert artifact: ${error?.message ?? "no row returned"}`,
    );
  }

  // Cascade: mark the prior artifact superseded. Non-fatal if the prior
  // is missing — the new row's `supersedes` column already records the
  // chain, so a stale prior won't break correctness.
  if (input.supersedes) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: cascadeError } = await (supabase.from("agent_artifacts") as any)
      .update({ state: "superseded" })
      .eq("id", input.supersedes);

    if (cascadeError) {
      console.warn(
        `[artifact-writer] Cascade to mark ${input.supersedes} superseded failed (non-fatal): ${cascadeError.message}`,
      );
    }
  }

  return {
    artifact_id: data.id as string,
    created_at: data.created_at as string,
  };
}

export interface UpdateArtifactStateOptions {
  /** Per-kind structured metadata about the resolution; merged into commit_metadata JSONB. */
  commit_metadata?: Record<string, unknown>;
}

/**
 * Resolve an artifact's lifecycle state. Called by the post-approval
 * path (host clicked Save → state='confirmed' or 'edited') or the
 * discard path (host clicked Discard → state='dismissed').
 *
 * The state CHECK constraint enforces the allowed values; passing an
 * unsupported state surfaces as a Postgres error.
 */
export async function updateArtifactState(
  artifactId: string,
  state: AgentArtifactState,
  options: UpdateArtifactStateOptions = {},
): Promise<void> {
  const supabase = createServiceClient();

  const update: Record<string, unknown> = {
    state,
    // 'emitted' and 'edited' are non-terminal lifecycle states —
    // committed_at stays NULL until the host approves/dismisses. M7
    // §6 amendment: a guest_message artifact whose Channex send failed
    // also stays state='emitted' (with commit_metadata.last_error set),
    // so its committed_at must remain NULL too. Terminal states
    // (confirmed, dismissed, superseded) stamp committed_at.
    committed_at:
      state === "emitted" || state === "edited"
        ? null
        : new Date().toISOString(),
  };

  if (options.commit_metadata !== undefined) {
    update.commit_metadata = options.commit_metadata;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("agent_artifacts") as any)
    .update(update)
    .eq("id", artifactId);

  if (error) {
    throw new Error(
      `[artifact-writer] Failed to update state for ${artifactId} → ${state}: ${error.message}`,
    );
  }
}
