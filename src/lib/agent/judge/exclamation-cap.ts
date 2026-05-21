/**
 * J2 exclamation cap — §6.9 sub-item (ii). M10 Phase B STEP 7.
 *
 * STEP 7 ships the DETERMINISTIC count-prefilter substrate only. No LLM
 * call; no route wiring. STEP 8 replaces the count>cap branch with a
 * Haiku semantic judge (genuine-milestone-vs-theater) and wires J2 into
 * applyOutputJudges at the shared helper.
 *
 * Cap model (1D per-audience refinement of ultraplan §5 2D sketch for
 * Phase B locked values):
 *   - koast-to-host = 1 (D34/J2-f). Route wiring deferred to v2.8 per
 *     G8-B1 (streaming SSE; /api/agent/turn requires streaming-judge
 *     design). Cap is defined here so STEP 8 can reuse the resolver
 *     even though the host-to-host route doesn't apply it yet.
 *   - host-to-guest = 3 (Q2 default). Per-voiceMode tuning (neutral vs
 *     learned different caps) deferred to v2.8.
 */

import type {
  Audience,
  JudgeResult,
} from "@/lib/agent/patterns/judge-types";

/** Per-audience exclamation cap. STEP 8 reuses for Haiku rescue path. */
export const MODE_CAPS: Record<Audience, number> = {
  "koast-to-host": 1,
  "host-to-guest": 3,
};

/** Count visible exclamation marks in the text. Plain ! count; no
 *  semantic distinction between sentence-terminating and other uses
 *  at this layer — the semantic judgment (genuine-milestone-vs-theater)
 *  lives in STEP 8's Haiku rescue path when count > cap. */
export function countExclamations(text: string): number {
  return (text.match(/!/g) ?? []).length;
}

/**
 * Deterministic exclamation-cap judge (STEP 7 substrate; pre-Haiku).
 *
 *   - count <= cap → pass with reason='count_under_cap'
 *   - count > cap  → fail with reason='count_exceeds_cap_pending_semantic_review'
 *
 * STEP 8 replaces the count>cap branch: invoke Haiku judge with the
 * candidate text + audience + cap + count; on Haiku verdict='pass'
 * (genuine milestone), the J2 result becomes pass with reason citing
 * the semantic rationale; on Haiku verdict='fail' (theatrical), the J2
 * result stays fail and applyOutputJudges applies the fail-behavior
 * per audience (strip-excess for koast-to-host; envelope annotation
 * for host-to-guest).
 */
export function judgeExclamationCapDeterministic(
  text: string,
  audience: Audience,
): JudgeResult {
  const cap = MODE_CAPS[audience];
  const count = countExclamations(text);
  if (count <= cap) {
    return {
      judge_id: "exclamation_cap",
      verdict: "pass",
      reason: "count_under_cap",
      confidence: 1.0,
      details: { count, cap, audience },
    };
  }
  return {
    judge_id: "exclamation_cap",
    verdict: "fail",
    reason: "count_exceeds_cap_pending_semantic_review",
    confidence: 1.0,
    details: { count, cap, audience },
  };
}
