/**
 * Voice mode read/write helpers — M9 Phase E D25 (v2.5).
 *
 * Direct memory_facts read/write for voice_mode (entity_type='host' +
 * sub_entity_type='voice'). Bypasses the agent-action substrate gate
 * (writeMemoryFact in write.ts) because voice extraction is a
 * system-initiated background job — not host-facing, not gated, not
 * audit-logged through agent_audit_log.
 *
 * Pattern parallels M8 Phase F `onboarding-state.ts` direct-write helpers
 * for `onboarding_completion_offered_at` — substrate-level state-write
 * without agent-action accounting.
 *
 * Phase E scope:
 *   - readVoiceMode(supabase, hostId): returns latest active voice fact
 *     payload (or null if no voice fact exists yet for this host)
 *   - writeVoiceMode(supabase, hostId, payload): writes new voice fact
 *     with supersession of prior active fact (if any). Supersession
 *     reason locked per call site (extraction-worker uses 'outdated';
 *     host-correction via Memory tab uses 'incorrect').
 *
 * v2.5 §6 M10 inheritance: event-driven invocation, separate drafts
 * table, vocabulary signature depth, generative Mode 1, component test
 * infrastructure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  VoiceFactPayloadSchema,
  type VoiceFactPayload,
} from "./voice-fact-schema";

const VOICE_ATTRIBUTE = "voice_mode";

interface VoiceFactRow {
  id: string;
  value: unknown;
  source: string;
  confidence: number;
  learned_at: string;
  status: string;
}

/**
 * Read the latest active voice fact for a host.
 *
 * Returns the validated payload, or null if no active voice fact
 * exists. Sites 1-4 call this at generation time + pass result to
 * `buildVoicePrompt` (B2 (a) locked); UI Memory tab voice section
 * reads same fact for rendering.
 */
export async function readVoiceMode(
  supabase: SupabaseClient,
  hostId: string,
): Promise<VoiceFactPayload | null> {
  const { data, error } = await supabase
    .from("memory_facts")
    .select("id, value, source, confidence, learned_at, status")
    .eq("host_id", hostId)
    .eq("entity_type", "host")
    .eq("sub_entity_type", "voice")
    .eq("attribute", VOICE_ATTRIBUTE)
    .eq("status", "active")
    .order("learned_at", { ascending: false })
    .limit(1)
    .maybeSingle<VoiceFactRow>();
  if (error) {
    throw new Error(`readVoiceMode: ${error.message}`);
  }
  if (!data) return null;
  const parsed = VoiceFactPayloadSchema.safeParse(data.value);
  if (!parsed.success) {
    // Malformed fact value at the DB layer — surface as null rather than
    // throw, so generation continues with neutral context. M10 candidate:
    // audit-log invalid fact for trust-inspection.
    return null;
  }
  return parsed.data;
}

export interface WriteVoiceModeOptions {
  /** Reason for superseding a prior active fact, when one exists. */
  supersession_reason?: "outdated" | "incorrect";
  /**
   * Source enum for memory_facts.source. Voice extraction worker uses
   * 'inferred'; host-correction surfaces use 'host_taught'.
   */
  source?: "inferred" | "host_taught";
  /** Confidence value for memory_facts.confidence; default 0.8 for inferred. */
  confidence?: number;
}

/**
 * Write a new voice fact for a host. Supersedes the prior active fact
 * (if any) atomically: marks old fact `status='superseded'` + sets
 * `superseded_by` on the new fact's id + records supersession_reason.
 *
 * Returns the new fact's id.
 */
export async function writeVoiceMode(
  supabase: SupabaseClient,
  hostId: string,
  payload: VoiceFactPayload,
  options: WriteVoiceModeOptions = {},
): Promise<string> {
  const source = options.source ?? "inferred";
  const confidence = options.confidence ?? 0.8;
  const supersessionReason = options.supersession_reason ?? "outdated";

  // Validate payload before write.
  const parsed = VoiceFactPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `writeVoiceMode: invalid payload: ${parsed.error.issues
        .map((i) => i.message)
        .join("; ")}`,
    );
  }

  // Find the prior active fact (if any) — supersession target.
  const { data: prior, error: priorErr } = await supabase
    .from("memory_facts")
    .select("id")
    .eq("host_id", hostId)
    .eq("entity_type", "host")
    .eq("sub_entity_type", "voice")
    .eq("attribute", VOICE_ATTRIBUTE)
    .eq("status", "active")
    .order("learned_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (priorErr) {
    throw new Error(`writeVoiceMode prior lookup: ${priorErr.message}`);
  }

  // Insert the new fact.
  const { data: inserted, error: insertErr } = await (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.from("memory_facts") as any
  )
    .insert({
      host_id: hostId,
      entity_type: "host",
      entity_id: hostId,
      sub_entity_type: "voice",
      sub_entity_id: null,
      attribute: VOICE_ATTRIBUTE,
      value: payload,
      source,
      confidence,
      learned_from: {},
      status: "active",
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    throw new Error(
      `writeVoiceMode insert: ${insertErr?.message ?? "no row returned"}`,
    );
  }

  // Atomically supersede the prior fact (if any).
  if (prior) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase.from("memory_facts") as any)
      .update({
        status: "superseded",
        superseded_by: inserted.id,
        supersession_reason: supersessionReason,
      })
      .eq("id", prior.id);
    if (updateErr) {
      // Best-effort: log but don't fail the write. The new active fact
      // is in place; the prior fact's superseded-state can be repaired
      // by a follow-up job if drift occurs.
      console.warn(
        `[writeVoiceMode] supersession update failed: ${updateErr.message}`,
      );
    }
  }

  return inserted.id;
}
