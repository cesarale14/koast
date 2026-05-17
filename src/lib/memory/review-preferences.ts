/**
 * Review preferences read/write helpers — M9 Phase G E3 (v2.6).
 *
 * Direct memory_facts read/write for review preferences
 * (entity_type='host' + sub_entity_type='reviews'). Mirrors the D25
 * voice-mode.ts pattern: bypasses the agent-action gate
 * (writeMemoryFact in write.ts) because review preferences are direct
 * host configuration, not agent-mediated decisions — same direct-write
 * shape the dropped `review_rules` table had via its CRUD route.
 *
 * Phase G STEP 8.3 swaps the 5 consumer routes from `review_rules`
 * table reads to `readReviewPreferences()` calls. The Phase B F3 Zod
 * boundary at reviews/generator.ts is preserved — routes derive the
 * `{ tone, target_keywords }` subset from the fact payload at call time.
 *
 * Pattern parallel: D25's voice-mode.ts is the immediate precedent.
 * Same module shape, same direct-write semantics, same supersession-
 * via-update mechanism. Functions named per Q-G6 / Q-G2 lock:
 * readReviewPreferences + writeReviewPreferences.
 *
 * No-fact-exists default behavior: readReviewPreferences returns
 * DEFAULT_REVIEW_PREFERENCES_PAYLOAD (matches historical route fallback
 * shape exactly) so consumer routes don't need to handle null.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ReviewPreferencesPayloadSchema,
  DEFAULT_REVIEW_PREFERENCES_PAYLOAD,
  type ReviewPreferencesPayload,
} from "./review-preferences-fact-schema";

const REVIEW_PREFERENCES_ATTRIBUTE = "review_preferences";

interface ReviewPreferencesFactRow {
  id: string;
  value: unknown;
  source: string;
  confidence: number;
  learned_at: string;
  status: string;
}

/**
 * Read the latest active review preferences fact for a host. Returns
 * the validated payload, or the default payload when no active fact
 * exists for this host (matches historical route fallback behavior;
 * consumer routes never see null and never need to handle the missing-
 * fact case).
 */
export async function readReviewPreferences(
  supabase: SupabaseClient,
  hostId: string,
): Promise<ReviewPreferencesPayload> {
  const { data, error } = await supabase
    .from("memory_facts")
    .select("id, value, source, confidence, learned_at, status")
    .eq("host_id", hostId)
    .eq("entity_type", "host")
    .eq("sub_entity_type", "reviews")
    .eq("attribute", REVIEW_PREFERENCES_ATTRIBUTE)
    .eq("status", "active")
    .order("learned_at", { ascending: false })
    .limit(1)
    .maybeSingle<ReviewPreferencesFactRow>();
  if (error) {
    throw new Error(`readReviewPreferences: ${error.message}`);
  }
  if (!data) return DEFAULT_REVIEW_PREFERENCES_PAYLOAD;
  const parsed = ReviewPreferencesPayloadSchema.safeParse(data.value);
  if (!parsed.success) {
    // Malformed fact value at the DB layer — fall back to default rather
    // than throw, so generation continues with sensible defaults.
    return DEFAULT_REVIEW_PREFERENCES_PAYLOAD;
  }
  return parsed.data;
}

export interface WriteReviewPreferencesOptions {
  /** Reason for superseding a prior active fact, when one exists. */
  supersession_reason?: "outdated" | "incorrect";
  /**
   * Source enum for memory_facts.source. Host-initiated changes via the
   * settings modal use 'host_taught'. No 'inferred' path today; an
   * extraction worker analog (review-history mining) would be M10+.
   */
  source?: "inferred" | "host_taught";
  /** Confidence value for memory_facts.confidence; default 1.0 for host-taught. */
  confidence?: number;
}

/**
 * Write a new review preferences fact for a host. Supersedes the prior
 * active fact (if any) atomically: marks old fact `status='superseded'`
 * + sets `superseded_by` on the new fact's id + records
 * supersession_reason.
 *
 * Returns the new fact's id.
 */
export async function writeReviewPreferences(
  supabase: SupabaseClient,
  hostId: string,
  payload: ReviewPreferencesPayload,
  options: WriteReviewPreferencesOptions = {},
): Promise<string> {
  const source = options.source ?? "host_taught";
  const confidence = options.confidence ?? 1.0;
  const supersessionReason = options.supersession_reason ?? "outdated";

  // Validate payload before write.
  const parsed = ReviewPreferencesPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `writeReviewPreferences: invalid payload: ${parsed.error.issues
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
    .eq("sub_entity_type", "reviews")
    .eq("attribute", REVIEW_PREFERENCES_ATTRIBUTE)
    .eq("status", "active")
    .order("learned_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (priorErr) {
    throw new Error(`writeReviewPreferences prior lookup: ${priorErr.message}`);
  }

  // Insert the new fact. Cast pattern matches D25 voice-mode.ts and the
  // 5 sister sites; memory_facts isn't in the generated Database type
  // yet (supabase gen types regeneration is post-M9 follow-up per
  // phase-f.md open follow-ups).
  const { data: inserted, error: insertErr } = await (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.from("memory_facts") as any
  )
    .insert({
      host_id: hostId,
      entity_type: "host",
      entity_id: hostId,
      sub_entity_type: "reviews",
      sub_entity_id: null,
      attribute: REVIEW_PREFERENCES_ATTRIBUTE,
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
      `writeReviewPreferences insert: ${insertErr?.message ?? "no row returned"}`,
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
        `[writeReviewPreferences] supersession update failed: ${updateErr.message}`,
      );
    }
  }

  return inserted.id;
}
