/**
 * Writes (and updates) rows in `agent_audit_log`. Every action that
 * passes through `requestAction()` produces one audit row; the row is
 * inserted with `outcome='pending'` at gate time and updated to
 * `'succeeded'` or `'failed'` by the caller after the side effect
 * resolves.
 *
 * Caller contract: this module trusts its inputs (host_id, action_type,
 * etc.). The caller — typically a route handler — is responsible for
 * authenticating the host and verifying the host owns the resources
 * referenced in the payload before invoking. Defense-in-depth comes
 * from the table's RLS (SELECT-only for authenticated users) plus
 * the host_id column on every row.
 *
 * Uses the service-role Supabase client because the table's RLS
 * policy is SELECT-only — INSERT/UPDATE require service-role auth.
 */

import { createServiceClient } from "@/lib/supabase/service";
import type {
  AgentAuditLogActorKind,
  AgentAuditLogAutonomyLevel,
  AgentAuditLogOutcome,
  AgentAuditLogSource,
} from "@/lib/db/schema";
import type { ActionType, StakesClass } from "./stakes-registry";

export interface WriteAuditLogInput {
  host_id: string;
  action_type: ActionType;
  payload: Record<string, unknown>;
  source: AgentAuditLogSource;
  actor_kind: AgentAuditLogActorKind;
  actor_id: string | null;
  autonomy_level: AgentAuditLogAutonomyLevel;
  outcome: AgentAuditLogOutcome;
  context: Record<string, unknown> | null;
  /** stakes_class is captured in `context.stakes_class` for downstream queries. */
  stakes_class: StakesClass;
  confidence?: number | null;
  latency_ms?: number | null;
}

export interface WriteAuditLogResult {
  audit_log_id: string;
  created_at: string;
}

interface AuditLogInsertRow {
  host_id: string;
  action_type: ActionType;
  payload: Record<string, unknown>;
  source: AgentAuditLogSource;
  actor_kind: AgentAuditLogActorKind;
  actor_id: string | null;
  autonomy_level: AgentAuditLogAutonomyLevel;
  outcome: AgentAuditLogOutcome;
  context: Record<string, unknown>;
  confidence?: number | null;
  latency_ms?: number | null;
}

export async function writeAuditLog(
  input: WriteAuditLogInput,
): Promise<WriteAuditLogResult> {
  const supabase = createServiceClient();

  const row: AuditLogInsertRow = {
    host_id: input.host_id,
    action_type: input.action_type,
    payload: input.payload,
    source: input.source,
    actor_kind: input.actor_kind,
    actor_id: input.actor_id,
    autonomy_level: input.autonomy_level,
    outcome: input.outcome,
    context: { ...(input.context ?? {}), stakes_class: input.stakes_class },
    confidence: input.confidence ?? null,
    latency_ms: input.latency_ms ?? null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("agent_audit_log") as any)
    .insert(row)
    .select("id, created_at")
    .single();

  if (error || !data) {
    throw new Error(
      `[audit-writer] Failed to insert audit log: ${error?.message ?? "no row returned"}`,
    );
  }

  return {
    audit_log_id: data.id as string,
    created_at: data.created_at as string,
  };
}

export interface UpdateAuditOutcomeOptions {
  /** Wall-clock latency from gate to resolution, in milliseconds. */
  latency_ms?: number;
  /** Optional error message captured in `context.error_message` on failure. */
  error_message?: string;
}

/**
 * Resolve a pending audit row's outcome. Called by the action's
 * caller after the side effect has resolved (succeeded/failed).
 *
 * Idempotent against repeated calls with the same outcome — the row
 * is just updated. If the row doesn't exist (deleted), the call
 * surfaces the error rather than silently no-op'ing.
 */
export async function updateAuditOutcome(
  auditLogId: string,
  outcome: AgentAuditLogOutcome,
  options: UpdateAuditOutcomeOptions = {},
): Promise<void> {
  const supabase = createServiceClient();

  const update: Record<string, unknown> = { outcome };

  if (options.latency_ms !== undefined) {
    update.latency_ms = options.latency_ms;
  }

  if (options.error_message !== undefined) {
    // Merge error_message into context. Fetch existing context first to
    // preserve `stakes_class` etc.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromBuilder = supabase.from("agent_audit_log") as any;
    const { data: row, error: fetchError } = await fromBuilder
      .select("context")
      .eq("id", auditLogId)
      .single();

    if (fetchError || !row) {
      throw new Error(
        `[audit-writer] Cannot update outcome: row ${auditLogId} not found (${fetchError?.message ?? "no row"})`,
      );
    }

    update.context = {
      ...(row.context ?? {}),
      error_message: options.error_message,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("agent_audit_log") as any)
    .update(update)
    .eq("id", auditLogId);

  if (error) {
    throw new Error(
      `[audit-writer] Failed to update outcome for ${auditLogId}: ${error.message}`,
    );
  }
}
