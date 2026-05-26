/**
 * applyOutputJudges — shared judge orchestrator. M10 Phase B STEP 6.
 *
 * Single extension point for judge application at route boundaries. Routes
 * call this helper post-generation; the helper composes the available
 * judges and returns the final text + augmented envelope. STEP 8 extends
 * this with J2 (exclamation cap) without re-touching the 4 host-to-guest
 * route call-sites.
 *
 * Architecture refinement of phase-b-ultraplan §4.1: inline-per-route was
 * the original pattern; STEP 6 refines to shared-helper so STEP 8 has a
 * single extension point. Captured for phase-b.md per ultraplan §14 lineage.
 *
 * Scope at STEP 6:
 *   - J1 emoji policy (applyEmojiPolicy from src/lib/voice/output-filter.ts)
 *
 * Deferred at STEP 6:
 *   - Koast-to-host streaming integration (/api/agent/turn SSE path) per
 *     G8-B1 — runAgentTurn() streams typed events; J1 per-chunk requires
 *     dedicated streaming-judge design; deferred to v2.8.
 *   - J2 exclamation cap (STEP 7-8).
 */

import { applyEmojiPolicy } from "@/lib/voice/output-filter";
import { judgeExclamationCap } from "@/lib/agent/judge/exclamation-cap";
import { judgeEnsureVerbChain } from "@/lib/agent/judge/ensure-verb-chain";
import { judgeSelfNarration } from "@/lib/agent/judge/self-narration";
import { judgeFiller } from "@/lib/agent/judge/filler";
import type {
  Audience,
  JudgeId,
  JudgeResult,
} from "@/lib/agent/patterns/judge-types";
import type { AgentTextOutput } from "@/lib/agent/schemas/agent-text-output";
import type { VoiceMode } from "@/lib/voice/output-filter";

export interface ApplyOutputJudgesResult {
  finalText: string;
  envelope: AgentTextOutput;
}

/**
 * Per-call-site policy override hook — M12 Phase B substrate-for-the-contract
 * (see CLAUDE.md Known Gaps J3 fail-open binding contract).
 *
 * At v1 ALL call-sites use the default ANNOTATE-ONLY behavior; the override
 * is substrate-only (deferred consumer). The hook becomes load-bearing
 * when any auto-send call-site activates (messaging_executor; auto-approve
 * UI mode) — that activation MUST flip fail-mode via this override to
 * fail-closed-or-stricter BEFORE the auto-send goes live. Without the
 * flip, the judge becomes the only gate between bad output and the guest,
 * and FAIL-OPEN becomes dangerous.
 *
 * skip_judges: omit specific judges entirely for this call-site invocation
 *   (returns no JudgeResult; envelope.judge_results omits the entry).
 *
 * fail_mode_override: future hook for FAIL-CLOSED activation. NOT consumed
 *   at v1; the field exists so the type signature is stable when a
 *   consumer flips a call-site to fail-closed.
 */
export interface JudgePolicyOverride {
  skip_judges?: JudgeId[];
  fail_mode_override?: Partial<Record<JudgeId, "annotate" | "block">>;
}

/**
 * Run the available output judges against the generated text and return
 * the post-filter text + envelope augmented with judge_results. Existing
 * `baseEnvelope.judge_results` entries are preserved (appended, never
 * overwritten).
 *
 * STEP 8: async. J1 (sync, deterministic emoji filter) runs first; J2
 * (async hybrid count-prefilter + Haiku rescue) runs on J1's filtered
 * text. Both judge results append to envelope.judge_results.
 *
 * Fail-behavior (Q3 host-to-guest annotate-only):
 *   - J2 verdict='fail' → text UNCHANGED; envelope flags the verdict.
 *     The flag is functionally inert pending UI consumption (see
 *     ultraplan §14.3).
 *   - koast-to-host J2 fail-behavior (strip-excess) + route wiring
 *     deferred to v2.8 streaming-judge bundle per G8-B1. Phase B
 *     callers are all host-to-guest, so annotate-only covers every
 *     live call-site.
 */
export async function applyOutputJudges(
  text: string,
  audience: Audience,
  voiceMode: VoiceMode,
  baseEnvelope: AgentTextOutput,
  policyOverride?: JudgePolicyOverride,
): Promise<ApplyOutputJudgesResult> {
  const skipSet = new Set<JudgeId>(policyOverride?.skip_judges ?? []);

  // J1 — emoji output-filter (M10 Phase B STEP 5)
  const j1 = applyEmojiPolicy(text, audience, voiceMode);

  // J2 — exclamation cap (M10 Phase B STEP 7-8). Runs against J1's filtered
  // text (post-emoji-strip). count_under_cap path deterministic-sync;
  // count>cap invokes Haiku (sync-on-borderline per J2-c).
  const j2 = skipSet.has("exclamation_cap")
    ? null
    : await judgeExclamationCap(j1.filtered_text, audience);

  // J3 — ensure-verb-chain (M12 Phase B; activated stub iii). Pre-filter
  // detects ensure/promise/guarantee verbs; skip if absent. LLM-judge on
  // detected → classify abstract vs concrete object pairing. Runs against
  // J1's filtered text (post-emoji-strip) so the judge sees the final
  // shipping text shape.
  //
  // FAIL-OPEN INFRASTRUCTURE-ERROR (per Phase B STOP §3.2): timeouts /
  // 5xx / parse failures return a JudgeResult with verdict='fail' +
  // details.infrastructure_error=true. Text ships unchanged; envelope
  // carries the flag. Binding contract per CLAUDE.md Known Gaps.
  const j3 = skipSet.has("ensure_verb_chain")
    ? null
    : await judgeEnsureVerbChain(j1.filtered_text, audience);

  // J3-iv-b — self-narration (M12 Phase D; activated stub iv-b). Pre-filter
  // detects the 4 canonical self-narration verb chains (I'll help / Let me
  // help / I'm here to help / Happy to help). LLM judge classifies follow-
  // through specificity (generic theater vs specific concrete action).
  // Same FAIL-OPEN contract + ANNOTATE-ONLY behavior as J3-iii.
  const j4 = skipSet.has("self_narration")
    ? null
    : await judgeSelfNarration(j1.filtered_text, audience);

  // J3-iv-a — filler (M12 Phase D; activated stub iv-a). Pre-filter detects
  // the 7 canonical filler-candidate words (really/very/just/actually/
  // basically/honestly/literally). LLM judge classifies role
  // (filler-no-info-added vs legitimate emphasis/softening/specification).
  // ASYMMETRIC DEFAULT: borderline cases default to PASS per §5.7 over-block
  // aversion (real hosts use these words for legitimate register).
  const j5 = skipSet.has("filler")
    ? null
    : await judgeFiller(j1.filtered_text, audience);

  const judge_results: JudgeResult[] = [
    ...(baseEnvelope.judge_results ?? []),
    j1.judge_result,
    ...(j2 ? [j2] : []),
    ...(j3 ? [j3] : []),
    ...(j4 ? [j4] : []),
    ...(j5 ? [j5] : []),
  ];

  // ANNOTATE-ONLY fail-behavior uniform across J1/J2/J3 at v1: text
  // UNCHANGED whether any judge passes or fails. Envelope carries
  // verdicts; UI surfaces via PendingDraftBubble.tsx:60 generic dispatch
  // (judge-id-agnostic find for verdict='fail').
  return {
    finalText: j1.filtered_text,
    envelope: { ...baseEnvelope, judge_results },
  };
}
