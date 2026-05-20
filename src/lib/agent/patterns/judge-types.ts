/**
 * γ shape primitives for the judge subsystem — M10 Phase B STEP 5
 * (§6.10 extraction methodology).
 *
 * Parallel to Phase F PatternEntry/PatternMatch (regex catalog) at
 * src/lib/agent/patterns/types.ts. Judge primitives describe judge-output
 * RESULTS, not regex matches. Separate domain; parallel modules per §6.10
 * separate-domain principle.
 *
 * JudgeId is enum-grows-per-step. STEP 5 ships emoji_policy (J1). STEP 7
 * extends with exclamation_cap (J2). v2.8 expands further per Decision (d)
 * partial scope iii-vi roadmap.
 */

/** Verdict of a judge run. Deterministic judges (e.g. J1 emoji_policy)
 * always return confidence=1.0; LLM-based judges (e.g. J2 exclamation_cap)
 * return calibrated confidence ∈ [0, 1]. */
export type JudgeVerdict = "pass" | "fail";

/** SHIP catalog. Strict union ensures judge_id is type-checked at
 * call-sites; misspellings caught at compile time. */
export type JudgeId = "emoji_policy";

/** Audience axis (orthogonal to voice_mode per phase-b-ultraplan §2.1).
 * Determined per-route, not per-host. Shared across all judges that
 * compose policy on audience. */
export type Audience = "koast-to-host" | "host-to-guest";

/** Judge-result envelope payload. Attaches to AgentTextOutput.judge_results
 * (extension in STEP 6 envelope schema). */
export interface JudgeResult {
  judge_id: JudgeId;
  verdict: JudgeVerdict;
  /** Stable reason code — e.g. 'no_emoji_found', 'within_policy',
   *  'stripped_to_policy', 'count_under_cap', 'theatrical_overuse'. */
  reason: string;
  /** 0..1. Deterministic judges = 1.0; LLM-based judges = calibrated. */
  confidence: number;
  /** Optional judge-specific metadata for envelope consumers. */
  details?: Record<string, unknown>;
}
