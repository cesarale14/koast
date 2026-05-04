/**
 * Post-approval handler for write_memory_fact.
 *
 * Runs when the host clicks Save (or Edit-then-Save) on a
 * MemoryArtifact rendering a write_memory_fact proposal. The
 * /api/agent/artifact endpoint resolves the artifact row by audit_id
 * (paired FK on agent_artifacts.audit_log_id), validates the host's
 * ownership, then dispatches here with the artifact's payload.
 *
 * The handler:
 *   1. Validates the host owns the property referenced in the payload.
 *   2. Inserts the new memory_facts row via M2's writeMemoryFact (which
 *      goes through the substrate bypass: source='agent_artifact' +
 *      context.artifact_id → mode='allow', no second gate).
 *   3. If supersedes_memory_fact_id is set, marks the prior memory_facts
 *      row status='superseded' + superseded_by=<new fact id>. The
 *      caller (artifact endpoint) handles updating agent_artifacts.state
 *      separately via updateArtifactState.
 *
 * Returns the new memory_fact_id and the resolved audit_metadata.
 *
 * Distinct from src/lib/agent/tools/write-memory-fact.ts (the tool
 * definition that runs at proposal time via the dispatcher fork). The
 * tool's `handler` is intentionally a guard that throws — D35
 * separates proposal from execution at the dispatcher boundary, and
 * post-approval execution lives here.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { writeMemoryFact } from "@/lib/memory/write";
import type {
  MemoryFactSource,
  MemoryFactSubEntityType,
} from "@/lib/db/schema";

export interface WriteMemoryFactHandlerInput {
  host_id: string;
  conversation_id: string;
  turn_id: string;
  artifact_id: string;
  /**
   * The artifact's payload — matches the write_memory_fact tool's
   * inputSchema in src/lib/agent/tools/write-memory-fact.ts. The
   * caller (artifact endpoint) is responsible for parsing this against
   * the schema before invoking the handler; this module trusts the
   * shape.
   */
  payload: {
    property_id: string;
    sub_entity_type: MemoryFactSubEntityType;
    attribute: string;
    fact_value: unknown;
    confidence?: number;
    source: MemoryFactSource;
    supersedes?: string;
    supersedes_memory_fact_id?: string;
    citation?: { source_text?: string; reasoning?: string };
  };
}

export interface WriteMemoryFactHandlerResult {
  memory_fact_id: string;
  superseded_memory_fact_id: string | null;
}

/**
 * Defensive ownership check — verify the authenticated host owns the
 * property referenced by the payload. The artifact's own row already
 * passed RLS at lookup time (agent_artifacts policy gates by
 * conversation ownership), but the property reference inside the
 * payload is JSONB and not enforced by FK. Keep the explicit check
 * close to the side effect.
 */
async function assertHostOwnsProperty(
  hostId: string,
  propertyId: string,
): Promise<void> {
  const supabase = createServiceClient();
  // properties.user_id is the ownership column (M1 schema). Memory
  // facts use host_id (different convention; M2 named the FK from
  // memory_facts → auth.users that way). The "host_id" parameter
  // name here matches memory_facts; we query properties.user_id and
  // compare against the same auth.users id.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("properties") as any)
    .select("id, user_id")
    .eq("id", propertyId)
    .single();

  if (error || !data) {
    throw new Error(
      `[handler:write_memory_fact] Property ${propertyId} not found: ${error?.message ?? "no row"}`,
    );
  }
  if (data.user_id !== hostId) {
    throw new Error(
      `[handler:write_memory_fact] Host ${hostId} does not own property ${propertyId}.`,
    );
  }
}

export async function writeMemoryFactHandler(
  input: WriteMemoryFactHandlerInput,
): Promise<WriteMemoryFactHandlerResult> {
  await assertHostOwnsProperty(input.host_id, input.payload.property_id);

  // Step 1: insert via the M2 writeMemoryFact pipeline. This routes
  // through the substrate's bypass path (source='agent_artifact' +
  // context.artifact_id → mode='allow', no second gate). The audit
  // row for THIS execution is a separate row from the proposal-time
  // audit row — the proposal row stays 'pending' on agent_audit_log
  // (the artifact endpoint flips it to 'succeeded' or 'failed' once
  // this handler resolves; see /api/agent/artifact route handler).
  const writeResult = await writeMemoryFact({
    host: { id: input.host_id },
    fact: {
      entity_type: "property",
      entity_id: input.payload.property_id,
      sub_entity_type: input.payload.sub_entity_type,
      attribute: input.payload.attribute,
      value: input.payload.fact_value,
      source: input.payload.source,
      confidence: input.payload.confidence ?? 1.0,
    },
    conversation_context: {
      conversation_id: input.conversation_id,
      turn_id: input.turn_id,
      artifact_id: input.artifact_id,
      source_message_text: input.payload.citation?.source_text,
    },
  });

  if (writeResult.mode !== "committed" || !writeResult.fact_id) {
    throw new Error(
      `[handler:write_memory_fact] Memory write failed: mode=${writeResult.mode}, reason=${writeResult.reason}`,
    );
  }

  const newFactId = writeResult.fact_id;
  let supersededFactId: string | null = null;

  // Step 2: if this is a correction of a previously-saved memory_fact,
  // update the prior row to status='superseded' + superseded_by=
  // <new fact id>. memory_facts has the columns from M1; we just write
  // into them.
  if (input.payload.supersedes_memory_fact_id) {
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: priorError } = await (supabase.from("memory_facts") as any)
      .update({ status: "superseded", superseded_by: newFactId })
      .eq("id", input.payload.supersedes_memory_fact_id)
      .eq("host_id", input.host_id);

    if (priorError) {
      // Non-fatal: the new fact is committed; the supersession update
      // failed. Log and continue — surface the partial outcome to the
      // caller so they can decide how to render.
      console.warn(
        `[handler:write_memory_fact] Supersession update failed for ${input.payload.supersedes_memory_fact_id} (non-fatal): ${priorError.message}`,
      );
    } else {
      supersededFactId = input.payload.supersedes_memory_fact_id;
    }
  }

  return {
    memory_fact_id: newFactId,
    superseded_memory_fact_id: supersededFactId,
  };
}
