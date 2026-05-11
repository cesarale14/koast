/**
 * Onboarding milestone state (M8 C3 / D11).
 *
 * Three host-scoped memory_facts track conversational-onboarding
 * lifecycle without requiring a new table or column:
 *
 *   onboarding_completion_offered_at — set when the loop first sees
 *     sufficiency='rich' for the host. Used to suppress repeat surfacing
 *     of the completion sentence across conversations.
 *
 *   onboarding_idle_reengaged_at — set when the chat surface's lazy
 *     idle-detection fires a soft re-engagement. 7-day cooldown lives
 *     here; the surface checks this before re-engaging.
 *
 *   onboarding_marked_complete_at — set when 48h of total idle has
 *     elapsed without the host returning to chat. Silent close.
 *
 * Each fact is written via the substrate's direct memory_facts insert
 * (NOT the gated write_memory_fact tool) — these are observed-state
 * markers, not host-taught knowledge. source='observed' keeps the
 * provenance honest.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type OnboardingFactAttribute =
  | "onboarding_completion_offered_at"
  | "onboarding_idle_reengaged_at"
  | "onboarding_marked_complete_at";

interface MemoryFactRow {
  value: unknown;
  learned_at: string;
}

function coerceIsoTimestamp(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.value === "string") return obj.value;
    if (typeof obj.timestamp === "string") return obj.timestamp;
  }
  return null;
}

/**
 * Read the most-recent host-scoped onboarding milestone fact value as
 * an ISO timestamp, or null when no fact exists. Uses entity_type='host',
 * entity_id=hostId, attribute=<onboarding fact name>, status='active'.
 */
export async function readOnboardingFact(
  supabase: SupabaseClient,
  hostId: string,
  attribute: OnboardingFactAttribute,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("memory_facts")
    .select("value, learned_at")
    .eq("host_id", hostId)
    .eq("entity_type", "host")
    .eq("entity_id", hostId)
    .eq("attribute", attribute)
    .eq("status", "active")
    .order("learned_at", { ascending: false })
    .limit(1)
    .maybeSingle<MemoryFactRow>();
  if (error) {
    throw new Error(`onboarding fact lookup failed: ${error.message}`);
  }
  if (!data) return null;
  return coerceIsoTimestamp(data.value) ?? data.learned_at ?? null;
}

/** Convenience for the loop's sufficiency-snapshot wiring. */
export function readOnboardingCompletionOfferedAt(
  supabase: SupabaseClient,
  hostId: string,
): Promise<string | null> {
  return readOnboardingFact(supabase, hostId, "onboarding_completion_offered_at");
}

/**
 * Write or upsert the onboarding-milestone fact. Idempotent: if a row
 * for this (hostId, attribute, status='active') already exists, leave
 * it. Caller is responsible for the "first time only" semantics; this
 * helper just guarantees no duplicate active rows pile up.
 */
export async function writeOnboardingFact(
  supabase: SupabaseClient,
  hostId: string,
  attribute: OnboardingFactAttribute,
  isoTimestamp: string,
): Promise<void> {
  // Idempotency: check first, insert second. The race window between
  // check and insert is acceptable because the values are timestamps
  // and the column is a soft marker.
  const existing = await readOnboardingFact(supabase, hostId, attribute);
  if (existing) return;
  const { error } = await supabase.from("memory_facts").insert({
    host_id: hostId,
    entity_type: "host",
    entity_id: hostId,
    sub_entity_type: null,
    attribute,
    value: { value: isoTimestamp },
    source: "observed",
    confidence: 1.0,
    learned_from: { surface: "agent_loop", milestone: attribute },
    status: "active",
  });
  if (error) {
    throw new Error(`onboarding fact write failed: ${error.message}`);
  }
}
