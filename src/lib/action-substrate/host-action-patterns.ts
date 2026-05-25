/**
 * Host action patterns — M11 Phase B item 1 (F8 substrate).
 *
 * Writes one row to `host_action_patterns` per terminal-state transition
 * on an agent artifact (host confirms / edits-then-approves / dismisses).
 * Phase 2+ calibration logic READS this table to graduate well-trodden
 * patterns from 'require_confirmation' to 'silent' autonomy.
 *
 * v1 writes only — per agent-loop-v1-design.md §7.3 + msg 3416 Q5
 * sign-off: substrate-without-immediate-behavior-change. The reader
 * (`readPatternsForHost`) is included for Phase 2-readiness but has
 * no v1 consumer.
 *
 * Caller contract: same as audit-writer.ts. Trusts inputs; assumes the
 * route has authenticated the host. Uses service-role client (RLS
 * policy is SELECT-only for authenticated; INSERT requires service-role).
 */

import { createServiceClient } from "@/lib/supabase/service";
import type { HostActionPatternOutcome } from "@/lib/db/schema";
import type { ActionType } from "./stakes-registry";

export interface RecordHostActionPatternInput {
  host_id: string;
  action_type: ActionType;
  outcome: HostActionPatternOutcome;
  /** Light fingerprint of payload for pattern matching. Free-form at v1;
   *  Phase 2+ consumers may define per-action-type schemas. */
  payload_summary?: Record<string, unknown>;
  /** Optional lineage FK to the originating agent_audit_log row. Nullable
   *  per §7.3 + STOP §4.1; agent_audit_log may have ON DELETE SET NULL. */
  agent_audit_log_id?: string | null;
}

export interface RecordHostActionPatternResult {
  pattern_id: string;
  created_at: string;
}

interface HostActionPatternInsertRow {
  host_id: string;
  action_type: ActionType;
  outcome: HostActionPatternOutcome;
  payload_summary: Record<string, unknown>;
  agent_audit_log_id: string | null;
}

/**
 * Insert a host_action_patterns row capturing the outcome of an
 * agent-proposed action. Returns the new row's id + created_at; throws
 * on insert failure (caller decides whether to swallow or surface).
 */
export async function recordHostActionPattern(
  input: RecordHostActionPatternInput,
): Promise<RecordHostActionPatternResult> {
  const supabase = createServiceClient();

  const row: HostActionPatternInsertRow = {
    host_id: input.host_id,
    action_type: input.action_type,
    outcome: input.outcome,
    payload_summary: input.payload_summary ?? {},
    agent_audit_log_id: input.agent_audit_log_id ?? null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("host_action_patterns") as any)
    .insert(row)
    .select("id, created_at")
    .single();

  if (error || !data) {
    throw new Error(
      `[host-action-patterns] Failed to insert pattern: ${error?.message ?? "no row returned"}`,
    );
  }

  return {
    pattern_id: data.id as string,
    created_at: data.created_at as string,
  };
}

export interface PatternRow {
  id: string;
  host_id: string;
  action_type: string;
  outcome: HostActionPatternOutcome;
  payload_summary: Record<string, unknown>;
  agent_audit_log_id: string | null;
  created_at: string;
}

/**
 * Read recent patterns for a host, ordered by created_at DESC. Phase
 * 2-ready reader stub — UNUSED at v1. Phase 2 calibration logic consumes
 * this to decide whether to graduate well-trodden patterns to silent
 * autonomy.
 *
 * Uses service-role client (Phase 2 consumers are typically server-side
 * substrate code; RLS already permits host self-reads but service-role
 * is the consistent caller path).
 */
export async function readPatternsForHost(
  hostId: string,
  actionType: ActionType,
  limit = 50,
): Promise<PatternRow[]> {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("host_action_patterns") as any)
    .select("id, host_id, action_type, outcome, payload_summary, agent_audit_log_id, created_at")
    .eq("host_id", hostId)
    .eq("action_type", actionType)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(
      `[host-action-patterns] Failed to read patterns: ${error.message}`,
    );
  }

  return (data ?? []) as PatternRow[];
}
