/**
 * γ shape primitives for the judge subsystem — M10 Phase B STEP 5/6
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
 *
 * STEP 6 addition: JudgeResultSchema (Zod) so AgentTextOutput envelope
 * can compose JudgeResult under the same Zod validation lane that D22
 * uses for the rest of the envelope.
 */

import { z } from "zod";

/** Verdict of a judge run. Deterministic judges (e.g. J1 emoji_policy)
 * always return confidence=1.0; LLM-based judges (e.g. J2 exclamation_cap)
 * return calibrated confidence ∈ [0, 1]. */
export type JudgeVerdict = "pass" | "fail";

/** SHIP catalog. Strict union ensures judge_id is type-checked at
 * call-sites; misspellings caught at compile time. STEP 5 ships
 * emoji_policy (J1); STEP 7 adds exclamation_cap (J2 deterministic
 * count-prefilter); STEP 8 wires Haiku semantic rescue under the same
 * judge_id. v2.8 expands per Decision (d) partial scope iii-vi roadmap. */
export type JudgeId = "emoji_policy" | "exclamation_cap";

/** Audience axis (orthogonal to voice_mode per phase-b-ultraplan §2.1).
 * Determined per-route, not per-host. Shared across all judges that
 * compose policy on audience. */
export type Audience = "koast-to-host" | "host-to-guest";

/** Zod schema for JudgeResult — composed into AgentTextOutputSchema at
 *  src/lib/agent/schemas/agent-text-output.ts. Schema mirrors the
 *  JudgeResult interface; both stay in lock-step as JudgeId expands. */
export const JudgeResultSchema = z.object({
  // STEP 7 widens from STEP 6's z.literal('emoji_policy') now that the
  // catalog has ≥2 entries — Zod's z.enum tuple-arity requirement is now
  // satisfied (cf. STEP 6 phase-b-step6 commit body sidestep note).
  judge_id: z.enum(["emoji_policy", "exclamation_cap"]),
  verdict: z.union([z.literal("pass"), z.literal("fail")]),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
  details: z.record(z.string(), z.unknown()).optional(),
});

/** Judge-result envelope payload. Attaches to AgentTextOutput.judge_results
 * (extension in STEP 6 envelope schema). */
export type JudgeResult = z.infer<typeof JudgeResultSchema>;
