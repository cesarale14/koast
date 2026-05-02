/**
 * Memory write helper. Demonstrates the canonical action substrate
 * pattern: gate the action via `requestAction`, perform the side
 * effect, then resolve the audit row's outcome via
 * `updateAuditOutcome`.
 *
 * Caller contract (matches `read.ts`): the caller authenticates the
 * host and passes the host id explicitly. This handler trusts its
 * `host` argument and uses service-role to write; defense-in-depth
 * comes from the explicit `host_id` on the inserted row.
 *
 * Provenance JSONB shape (mirrors `pricing_rules.inferred_from` per
 * BELIEF_3_MEMORY_INVENTORY commitments):
 *   {
 *     conversation_id: "...",
 *     turn_id: "...",
 *     artifact_id: "...",
 *     source_message_text?: "...",   // optional snippet
 *     learned_at_iso: "..."          // wall-clock at write
 *   }
 */

import { createServiceClient } from "@/lib/supabase/service";
import type {
  MemoryFactEntityType,
  MemoryFactSource,
  MemoryFactSubEntityType,
} from "@/lib/db/schema";
import { requestAction, type RequestActionAuditMetadata } from "@/lib/action-substrate/request-action";
import { updateAuditOutcome } from "@/lib/action-substrate/audit-writer";

export interface MemoryWriteFact {
  entity_type: MemoryFactEntityType;
  entity_id: string;
  sub_entity_type?: MemoryFactSubEntityType;
  sub_entity_id?: string;
  guest_id?: string;
  attribute: string;
  value: unknown;
  source: MemoryFactSource;
  confidence: number;
}

export interface MemoryWriteContext {
  conversation_id: string;
  turn_id: string;
  artifact_id: string;
  source_message_text?: string;
}

export type MemoryWriteMode = "committed" | "blocked" | "failed";

export interface MemoryWriteResult {
  mode: MemoryWriteMode;
  fact_id: string | null;
  reason: string;
  audit_metadata: RequestActionAuditMetadata;
}

export interface WriteMemoryFactInput {
  host: { id: string };
  fact: MemoryWriteFact;
  conversation_context: MemoryWriteContext;
}

function buildLearnedFrom(ctx: MemoryWriteContext): Record<string, unknown> {
  const out: Record<string, unknown> = {
    conversation_id: ctx.conversation_id,
    turn_id: ctx.turn_id,
    artifact_id: ctx.artifact_id,
    learned_at_iso: new Date().toISOString(),
  };
  if (ctx.source_message_text !== undefined) {
    out.source_message_text = ctx.source_message_text;
  }
  return out;
}

interface MemoryFactInsertRow {
  host_id: string;
  entity_type: MemoryFactEntityType;
  entity_id: string;
  sub_entity_type: MemoryFactSubEntityType | null;
  sub_entity_id: string | null;
  guest_id: string | null;
  attribute: string;
  value: unknown;
  source: MemoryFactSource;
  confidence: number;
  learned_from: Record<string, unknown>;
}

export async function writeMemoryFact(
  input: WriteMemoryFactInput,
): Promise<MemoryWriteResult> {
  const startedAt = Date.now();

  // Step 1: gate the action through the substrate. Always fires —
  // even for the artifact-bypass path, this writes the audit row
  // with outcome='pending' which we resolve at the end.
  const gate = await requestAction({
    host_id: input.host.id,
    action_type: "memory_fact_write",
    payload: {
      entity_type: input.fact.entity_type,
      entity_id: input.fact.entity_id,
      sub_entity_type: input.fact.sub_entity_type ?? null,
      sub_entity_id: input.fact.sub_entity_id ?? null,
      guest_id: input.fact.guest_id ?? null,
      attribute: input.fact.attribute,
      value: input.fact.value,
      source: input.fact.source,
      confidence: input.fact.confidence,
    },
    source: "agent_artifact",
    actor_id: null,
    context: { artifact_id: input.conversation_context.artifact_id },
  });

  if (gate.mode !== "allow") {
    // Substrate refused the action. Resolve the audit row so it
    // doesn't sit at 'pending' forever. The substrate's autonomy_level
    // already reflects 'blocked' for require_confirmation paths.
    await updateAuditOutcome(gate.audit_metadata.audit_log_id, "failed", {
      latency_ms: Date.now() - startedAt,
      error_message: `gate_blocked: ${gate.reason}`,
    });
    return {
      mode: "blocked",
      fact_id: null,
      reason: gate.reason,
      audit_metadata: gate.audit_metadata,
    };
  }

  // Step 2: perform the INSERT. Use service-role + explicit host_id
  // (matches read.ts pattern; see file header).
  const supabase = createServiceClient();
  const row: MemoryFactInsertRow = {
    host_id: input.host.id,
    entity_type: input.fact.entity_type,
    entity_id: input.fact.entity_id,
    sub_entity_type: input.fact.sub_entity_type ?? null,
    sub_entity_id: input.fact.sub_entity_id ?? null,
    guest_id: input.fact.guest_id ?? null,
    attribute: input.fact.attribute,
    value: input.fact.value,
    source: input.fact.source,
    confidence: input.fact.confidence,
    learned_from: buildLearnedFrom(input.conversation_context),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("memory_facts") as any)
    .insert(row)
    .select("id")
    .single();

  if (error || !data) {
    await updateAuditOutcome(gate.audit_metadata.audit_log_id, "failed", {
      latency_ms: Date.now() - startedAt,
      error_message: `insert_failed: ${error?.message ?? "no row returned"}`,
    });
    return {
      mode: "failed",
      fact_id: null,
      reason: `Memory fact insert failed: ${error?.message ?? "no row returned"}`,
      audit_metadata: gate.audit_metadata,
    };
  }

  // Step 3: resolve the audit row to succeeded.
  await updateAuditOutcome(gate.audit_metadata.audit_log_id, "succeeded", {
    latency_ms: Date.now() - startedAt,
  });

  return {
    mode: "committed",
    fact_id: data.id as string,
    reason: gate.reason,
    audit_metadata: gate.audit_metadata,
  };
}
