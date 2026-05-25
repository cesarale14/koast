/**
 * J3 ensure-verb-chain judge — M12 Phase B activated stub
 * (deferred_5_6_ensure_verb_chain transition to runtime_active).
 *
 * Voice doctrine §5.6 "AI-recognizable — ensure verb chain": ensure /
 * promise / guarantee + abstract-object phrasing reads as canned
 * (e.g., "I'll ensure you have a wonderful stay"). Same verbs paired
 * with concrete objects read as legitimate ("I'll ensure the wifi
 * password is in the welcome packet"). The judge classifies the
 * verb-object pairing semantically.
 *
 * Architecture per M12 Phase B STOP:
 *   - Pre-filter: regex detects ensure/promise/guarantee verbs.
 *     No match → skip judge → verdict='pass' (no anti-pattern present).
 *   - LLM judge: when pre-filter matches, Haiku classifies the object
 *     concreteness.
 *   - Annotate-only fail-behavior per host-to-guest precedent (J2).
 *
 * Audience scope: HOST-TO-GUEST only at Phase B (§5.6 doctrine framing
 * is guest-facing). koast-to-host applicability deferred — the verb
 * chain may legitimately appear in agent-to-host explanations.
 */

import type {
  Audience,
  JudgeResult,
} from "@/lib/agent/patterns/judge-types";
import {
  invokeLLMJudge,
  skipJudgeResult,
} from "@/lib/agent/judge/llm-judge";

/** Skip-condition threshold: text below this length never invokes LLM. */
export const ENSURE_VERB_CHAIN_MIN_LENGTH = 20;

/** Pre-filter verbs that trigger the judge invocation. Detection is
 * case-insensitive, word-boundary-anchored to avoid catching "promised"
 * inside larger words. The judge then decides verb-OBJECT-concreteness;
 * the regex only filters when no verb is present at all. */
const ENSURE_VERB_PATTERN = /\b(ensure|ensuring|ensured|promise|promised|promising|guarantee|guaranteed|guaranteeing)\b/i;

export const ENSURE_VERB_CHAIN_SYSTEM_PROMPT = `You are an "ensure verb chain" classifier for Koast's voice doctrine §5.6.

The doctrine flags "ensure / promise / guarantee + ABSTRACT object" as AI-recognizable language. Abstract objects (wonderful stay, perfect experience, amazing memories, everything you've hoped for) read as canned and performative — the AI-style filler that real hosts wouldn't write. CONCRETE objects (wifi password, cleaner arrival time, parking instructions, the door code) read as legitimate and specific.

Your job: given a host message draft, decide whether the ensure / promise / guarantee verb chain (if present) is paired with an ABSTRACT object (verdict "fail") or a CONCRETE object (verdict "pass"). If no such verb chain is present, return verdict "pass" with reason "no_verb_chain".

Return ONLY a valid JSON object. No prose, no preamble, no markdown fences.

Schema:
{"verdict": "pass" | "fail", "reason": "abstract_object_paired" | "concrete_object_paired" | "no_verb_chain" | "<short snake_case reason>", "confidence": 0.0 to 1.0}

confidence calibration:
- 0.9-1.0: clear signal (clearly abstract OR clearly concrete)
- 0.6-0.8: defensible read with some judgment
- 0.4-0.5: borderline; default conservatively to "fail" (abstract is the anti-pattern; conservative-on-fuzzy-cases protects guest-facing voice)`;

function buildUserMessage(text: string, detectedVerb: string | null): string {
  return `Detected verb: ${detectedVerb ?? "none"}

Response:
"""
${text}
"""`;
}

/**
 * Invoke the ensure-verb-chain judge. Per pre-filter:
 *   - Empty / short text → skipJudgeResult ('skipped_short_text')
 *   - No ensure/promise/guarantee verb detected → skipJudgeResult ('no_verb_chain')
 *   - Verb detected → Haiku LLM judge
 *
 * Audience scope: returns 'pass' / skip for koast-to-host at Phase B.
 * Doctrine §5.6 framing applies to guest-facing language; koast-to-host
 * activation deferred (per Phase B STOP scope).
 */
export async function judgeEnsureVerbChain(
  text: string,
  audience: Audience,
): Promise<JudgeResult> {
  // Audience scope: §5.6 is host-to-guest at Phase B
  if (audience !== "host-to-guest") {
    return skipJudgeResult(
      "ensure_verb_chain",
      audience,
      "audience_out_of_scope",
    );
  }

  // Skip-condition: empty / too short
  if (text.trim().length < ENSURE_VERB_CHAIN_MIN_LENGTH) {
    return skipJudgeResult(
      "ensure_verb_chain",
      audience,
      "skipped_short_text",
      { text_length: text.length },
    );
  }

  // Pre-filter: verb-presence detection
  const verbMatch = text.match(ENSURE_VERB_PATTERN);
  if (!verbMatch) {
    return skipJudgeResult(
      "ensure_verb_chain",
      audience,
      "no_verb_chain",
    );
  }

  const detectedVerb = verbMatch[1];

  return invokeLLMJudge({
    judge_id: "ensure_verb_chain",
    system_prompt: ENSURE_VERB_CHAIN_SYSTEM_PROMPT,
    user_message: buildUserMessage(text, detectedVerb),
    audience,
    details_extra: { detected_verb: detectedVerb },
  });
}
