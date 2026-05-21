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
import type {
  Audience,
  JudgeResult,
} from "@/lib/agent/patterns/judge-types";
import type { AgentTextOutput } from "@/lib/agent/schemas/agent-text-output";
import type { VoiceMode } from "@/lib/voice/output-filter";

export interface ApplyOutputJudgesResult {
  finalText: string;
  envelope: AgentTextOutput;
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
): Promise<ApplyOutputJudgesResult> {
  const j1 = applyEmojiPolicy(text, audience, voiceMode);

  // STEP 8: J2 runs against J1's filtered text (post-emoji-strip).
  // count_under_cap path is deterministic-sync; only count>cap invokes
  // Haiku (sync-on-borderline per J2-c).
  const j2 = await judgeExclamationCap(j1.filtered_text, audience);

  const judge_results: JudgeResult[] = [
    ...(baseEnvelope.judge_results ?? []),
    j1.judge_result,
    j2,
  ];

  // Host-to-guest annotate-only: text unchanged whether J2 passes or fails.
  // koast-to-host strip-excess deferred v2.8 with streaming-judge (G8-B1).
  return {
    finalText: j1.filtered_text,
    envelope: { ...baseEnvelope, judge_results },
  };
}
