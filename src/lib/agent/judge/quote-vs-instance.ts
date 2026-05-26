/**
 * J3-v / J3-vi quote-vs-instance classifier — M12 Phase D activated stub
 * (deferred_voice_doctrine_self_scan + deferred_constitution_prompt_quote_vs_instance
 * — homomorphic shared classifier).
 *
 * CI-time (NOT runtime) — scans AUTHORED files for per-match quote-vs-
 * instance classification. The v1 regex catalog at PHASE_F_SHIP cannot
 * distinguish banned-phrase QUOTATION (legitimate pedagogy / cited as
 * banned example) from inline DECLARATIVE USE (real violation). The
 * LLM judge can.
 *
 * Architecture per M12 Phase D STOP §3.4-§3.5:
 *   - Input: a regex-matched phrase + ±50-char surrounding context from
 *     an authored file (voice-doctrine.md OR constitution prompts).
 *   - Output: JudgeResult — verdict='pass' if QUOTE (typographically
 *     marked, named-as-banned, pedagogical example); verdict='fail' if
 *     DECLARATIVE USE (used as a direct claim or output instance).
 *   - Two target classes share the same shape: "doctrine" (the voice-
 *     doctrine.md doc) and "constitution" (constitution-prompt files
 *     like build-voice-prompt.ts + agent/system-prompt.ts).
 *
 * Activation surface: invoked from scripts/voice-scan-doctrine.ts and
 * scripts/voice-scan-constitution.ts (NPM scripts), NOT from
 * applyOutputJudges runtime dispatch.
 *
 * Audience: not runtime/audience-bound at all. CI-time targets are
 * authored files; the audience semantics don't apply. The classifier
 * accepts a target_class for prompt specialization and a judge_id for
 * envelope-correctness, but does not route on Audience.
 */

import type { JudgeResult } from "@/lib/agent/patterns/judge-types";
import { invokeLLMJudge } from "@/lib/agent/judge/llm-judge";

/** Discriminator target class. Determines which pedagogical context the
 * judge expects (doctrine docs cite banned phrases as catalog entries;
 * constitution prompts cite them as negative-example training). The
 * classifier reuses the same shape — quote vs declarative use — but
 * names the target class so the judge prompt can specialize. */
export type QuoteVsInstanceTarget = "doctrine" | "constitution";

/** Judge ID for v + vi — mirrors the JudgeId enum at
 * src/lib/agent/patterns/judge-types.ts (reserved at Phase B Q8). */
export type QuoteVsInstanceJudgeId =
  | "voice_doctrine_self_scan"
  | "constitution_prompt_quote_vs_instance";

export const QUOTE_VS_INSTANCE_SYSTEM_PROMPT_DOCTRINE = `You are a "quote vs declarative use" classifier for Koast's voice-doctrine self-scan (M12 Phase D v).

The voice-doctrine.md document catalogs banned phrases by name as part of its pedagogical content — the doctrine TEACHES the doctrine. A regex match on a banned phrase in the doctrine text is either:

QUOTE / PEDAGOGY (verdict "pass"):
- Surrounded by quotation marks: "the phrase 'great question' is banned"
- Named as banned: "the phrase great question is banned" / "phrases like great question signal sycophancy"
- Inside a negative-example block: "Don't write: great question. Write the work instead."
- Cited in declarative naming structure: "Banned construction: great question"

DECLARATIVE USE (verdict "fail"):
- Used as a real claim in the doctrine's own prose: "Great question. The doctrine specifies..."
- Appears in declarative position without pedagogical framing
- The phrase is being USED, not CITED

Decision: examine the matched phrase + the ±50 char surrounding context. Is the phrase being CITED (pedagogical context: quote marks, named-as-banned, inside an example block) or USED (declarative prose without pedagogical framing)?

Return ONLY a valid JSON object. No prose, no preamble, no markdown fences.

Schema:
{"verdict": "pass" | "fail", "reason": "quote_context" | "pedagogical_naming" | "negative_example_block" | "declarative_use" | "<short snake_case reason>", "confidence": 0.0 to 1.0}

confidence calibration:
- 0.9-1.0: clear signal (clearly quoted OR clearly declarative)
- 0.6-0.8: defensible read
- 0.4-0.5: borderline; default conservatively to "fail" (declarative use is the anti-pattern; conservative-on-fuzzy-cases protects doctrine integrity)`;

export const QUOTE_VS_INSTANCE_SYSTEM_PROMPT_CONSTITUTION = `You are a "quote vs declarative use" classifier for Koast's constitution-prompt self-scan (M12 Phase D vi).

Constitution prompt files (build-voice-prompt.ts, agent/system-prompt.ts) cite banned phrases by name as negative-example pedagogy to TRAIN the LLM to avoid them. A regex match on a banned phrase in these files is either:

QUOTE / PEDAGOGY (verdict "pass"):
- Inside a template-string list of banned exemplars: 'avoid phrases like "great question"'
- Named as a negative example in instruction text: 'never write "rest assured"'
- Quoted in pedagogical position: 'phrases such as "happy to help" are corporate-voice violations'
- Cited inside a don't-write list

DECLARATIVE USE (verdict "fail"):
- Appears as a real instruction the LLM is trained to FOLLOW: 'great question — here is the answer'
- Used as actual prompt-text the LLM will see and emit
- Not in pedagogical framing

Decision: examine the matched phrase + ±50 char surrounding context. Is the phrase being CITED (pedagogical: in a negative-example list, named, quoted as banned) or USED (real prompt-text appearing in declarative position the LLM will produce)?

Return ONLY a valid JSON object. No prose, no preamble, no markdown fences.

Schema:
{"verdict": "pass" | "fail", "reason": "quote_context" | "pedagogical_naming" | "negative_example_block" | "declarative_use" | "<short snake_case reason>", "confidence": 0.0 to 1.0}

confidence calibration:
- 0.9-1.0: clear signal
- 0.6-0.8: defensible read
- 0.4-0.5: borderline; default conservatively to "fail" (declarative use in a constitution prompt is the anti-pattern)`;

function buildUserMessage(
  matchedPhrase: string,
  contextSnippet: string,
): string {
  return `Matched phrase: "${matchedPhrase}"

Context (±50 chars):
"""
${contextSnippet}
"""`;
}

/**
 * Invoke the quote-vs-instance judge. CI-time; one invocation per
 * regex match. NOT audience-routed (CI-time targets are authored files).
 *
 * Per CI-time activation surface (per Phase D STOP §3.4-§3.5):
 *   - Caller (script) supplies (matchedPhrase, contextSnippet, targetClass)
 *   - Classifier specializes prompt per targetClass ("doctrine" or "constitution")
 *   - Returns JudgeResult; envelope_correctness is judge_id set per
 *     `targetClass → judgeId` mapping at the call site.
 *
 * The classifier inherits the v2.8 §6.21 [LIVE] fail-open
 * INFRASTRUCTURE-ERROR contract from invokeLLMJudge: timeouts /
 * 5xx / parse failures return verdict='fail' + infrastructure_error=true.
 */
export async function judgeQuoteVsInstance(args: {
  matchedPhrase: string;
  contextSnippet: string;
  targetClass: QuoteVsInstanceTarget;
  judgeId: QuoteVsInstanceJudgeId;
}): Promise<JudgeResult> {
  const { matchedPhrase, contextSnippet, targetClass, judgeId } = args;

  const systemPrompt =
    targetClass === "doctrine"
      ? QUOTE_VS_INSTANCE_SYSTEM_PROMPT_DOCTRINE
      : QUOTE_VS_INSTANCE_SYSTEM_PROMPT_CONSTITUTION;

  // CI-time judges set audience to host-to-guest as a stable envelope
  // value; the judge prompt is not audience-routed (the target is
  // authored files, not LLM output to a real audience).
  return invokeLLMJudge({
    judge_id: judgeId,
    system_prompt: systemPrompt,
    user_message: buildUserMessage(matchedPhrase, contextSnippet),
    audience: "host-to-guest",
    details_extra: {
      matched_phrase: matchedPhrase,
      target_class: targetClass,
    },
  });
}
