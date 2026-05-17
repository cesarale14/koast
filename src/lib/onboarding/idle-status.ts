/**
 * Shared eligibility helper for /api/onboarding/idle-status.
 *
 * Single source of truth for the idle-state computation. Lifted from
 * the inline GET handler body during M9 Phase G E1 split (HTTP-semantic
 * discipline: GET pure-read, POST ack+writes — see route.ts + M8 Phase G
 * mark-seen precedent).
 *
 * Pure read. No writes from this module. Callers (GET / POST handlers)
 * perform the side-effect writes based on the returned state.
 *
 * Thresholds (locked, same as pre-split route):
 *   REENGAGE_HOURS = 24       — banner surfaces at 24h+ idle
 *   SILENT_COMPLETE_HOURS = 48 — silently mark onboarding complete at 48h+
 *   REENGAGE_COOLDOWN_HOURS = 7 * 24 — 7-day cooldown after a re-engagement
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { readOnboardingFact } from "@/lib/agent/onboarding-state";
import { classifySufficiency } from "@/lib/agent/sufficiency";

export const REENGAGE_HOURS = 24;
export const SILENT_COMPLETE_HOURS = 48;
export const REENGAGE_COOLDOWN_HOURS = 24 * 7;

export interface IdleStatusComputation {
  /** Hours since the most recent agent_turn, or null if host has none. */
  hours_since_last_turn: number | null;
  /** Banner-surface flag: 24h+ idle AND non-rich sufficiency AND no active cooldown AND not already marked complete. */
  should_reengage: boolean;
  /** Silent-complete flag: 48h+ idle AND non-rich sufficiency AND not already marked complete. */
  should_silent_complete: boolean;
  /** 7-day post-reengagement cooldown active. */
  reengagement_cooldown_active: boolean;
  /** Already-set marked-complete timestamp, or null. POST early-returns on this. */
  markedCompleteAt: string | null;
}

/**
 * Compute idle-status for a host. Pure read; performs no writes.
 *
 * Returns a state computation the caller uses for either:
 *   - GET: serialize the 4 visible fields back to the client
 *   - POST: drive conditional writeOnboardingFact calls
 */
export async function computeIdleStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  hostId: string,
): Promise<IdleStatusComputation> {
  const { data: lastTurn, error: turnErr } = await supabase
    .from("agent_turns")
    .select("created_at, agent_conversations!inner(host_id)")
    .eq("agent_conversations.host_id", hostId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (turnErr) {
    throw new Error(`agent_turns lookup failed: ${turnErr.message}`);
  }

  // No turns ever → no idle state.
  if (!lastTurn?.created_at) {
    return {
      hours_since_last_turn: null,
      should_reengage: false,
      should_silent_complete: false,
      reengagement_cooldown_active: false,
      markedCompleteAt: null,
    };
  }

  const ageMs = Date.now() - new Date(lastTurn.created_at as string).getTime();
  const hours = ageMs / (60 * 60 * 1000);

  // Active window — skip the heavier lookups.
  if (hours < REENGAGE_HOURS) {
    return {
      hours_since_last_turn: hours,
      should_reengage: false,
      should_silent_complete: false,
      reengagement_cooldown_active: false,
      markedCompleteAt: null,
    };
  }

  const [classification, reengagedAt, markedCompleteAt] = await Promise.all([
    classifySufficiency(supabase, hostId),
    readOnboardingFact(supabase, hostId, "onboarding_idle_reengaged_at"),
    readOnboardingFact(supabase, hostId, "onboarding_marked_complete_at"),
  ]);

  // Already silently completed → terminal state; no reengage, no silent-complete.
  if (markedCompleteAt) {
    return {
      hours_since_last_turn: hours,
      should_reengage: false,
      should_silent_complete: false,
      reengagement_cooldown_active: false,
      markedCompleteAt,
    };
  }

  const silentEligible =
    hours >= SILENT_COMPLETE_HOURS && classification.level !== "rich";

  // 7-day cooldown after the last re-engagement.
  let cooldownActive = false;
  if (reengagedAt) {
    const cooldownAgeHours =
      (Date.now() - new Date(reengagedAt).getTime()) / (60 * 60 * 1000);
    cooldownActive = cooldownAgeHours < REENGAGE_COOLDOWN_HOURS;
  }

  // Re-engage window: 24h ≤ hours, sufficiency not rich, no cooldown active,
  // and silent-complete hasn't already taken precedence at 48h+.
  // (Pre-split route gave silent-complete precedence by returning before the
  // reengage path; preserve that by setting should_reengage=false when
  // silentEligible is true.)
  const shouldReengage =
    !silentEligible && !cooldownActive && classification.level !== "rich";

  return {
    hours_since_last_turn: hours,
    should_reengage: shouldReengage,
    should_silent_complete: silentEligible,
    reengagement_cooldown_active: cooldownActive,
    markedCompleteAt: null,
  };
}
