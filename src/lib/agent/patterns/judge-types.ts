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
 * judge_id. v2.8 expands per Decision (d) partial scope iii-vi roadmap.
 *
 * M12 Phase B J3 expansion (Q8 sign-off): full iii-vi enum added upfront
 * to prevent Phase D rollout enum-grow churn. Only ensure_verb_chain is
 * RUNTIME-ACTIVE at Phase B ship; the other 5 are reserved IDs whose
 * runtime activation happens during Phase D iii-vi rollout. Reserved IDs
 * preserve type-checking consistency across the dispatch + Zod schema
 * boundary without requiring per-stub-activation enum amendment. */
export type JudgeId =
  | "emoji_policy"               // J1 (M10 Phase B; emoji-strip output-filter)
  | "exclamation_cap"            // J2 (M10 Phase B; count-prefilter + Haiku rescue)
  | "ensure_verb_chain"          // J3 iii (M12 Phase B ACTIVATED — §5.6 verb-chain)
  | "filler"                     // J3 iv-a reserved (Phase D iii-vi rollout)
  | "self_narration"             // J3 iv-b reserved
  | "performative_thoroughness"  // J3 iv-c reserved
  | "voice_doctrine_self_scan"   // J3 v reserved
  | "constitution_prompt_quote_vs_instance";  // J3 vi reserved

/** Audience axis (orthogonal to voice_mode per phase-b-ultraplan §2.1).
 * Determined per-route, not per-host. Shared across all judges that
 * compose policy on audience. */
export type Audience = "koast-to-host" | "host-to-guest";

/** Zod schema for JudgeResult — composed into AgentTextOutputSchema at
 *  src/lib/agent/schemas/agent-text-output.ts. Schema mirrors the
 *  JudgeResult interface; both stay in lock-step as JudgeId expands. */
export const JudgeResultSchema = z.object({
  // M12 Phase B (J3): enum widened to full 8-ID catalog. ensure_verb_chain
  // is runtime-active at Phase B; filler / self_narration /
  // performative_thoroughness / voice_doctrine_self_scan /
  // constitution_prompt_quote_vs_instance are reserved IDs awaiting
  // Phase D iii-vi rollout (Q8 sign-off — upfront enum prevents churn).
  judge_id: z.enum([
    "emoji_policy",
    "exclamation_cap",
    "ensure_verb_chain",
    "filler",
    "self_narration",
    "performative_thoroughness",
    "voice_doctrine_self_scan",
    "constitution_prompt_quote_vs_instance",
  ]),
  verdict: z.union([z.literal("pass"), z.literal("fail")]),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
  details: z.record(z.string(), z.unknown()).optional(),
});

/** Judge-result envelope payload. Attaches to AgentTextOutput.judge_results
 * (extension in STEP 6 envelope schema). */
export type JudgeResult = z.infer<typeof JudgeResultSchema>;
