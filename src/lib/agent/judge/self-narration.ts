/**
 * J3-iv-b self-narration judge — M12 Phase D activated stub
 * (deferred_5_8_self_narration transition to runtime_active).
 *
 * Voice doctrine §5.8 "Self-narration": "I'll help you with..." /
 * "Let me help you with..." / "I'm here to help with..." / "Happy to
 * help with..." patterns read as canned theater when the follow-through
 * is GENERIC (no concrete action named). The same patterns are LEGITIMATE
 * when the follow-through is SPECIFIC (concrete action named in the same
 * message). The judge classifies follow-through specificity semantically.
 *
 * Architecture per M12 Phase D STOP §3.2 (boundary defensible; cleanest of
 * the runtime trio):
 *   - Pre-filter: regex detects the 4 self-narration verb chains.
 *     No match → skip judge → verdict='pass' (no anti-pattern present).
 *   - LLM judge: when pre-filter matches, Haiku classifies whether the
 *     follow-through is generic (no concrete action) or specific (named
 *     action).
 *   - Annotate-only fail-behavior per host-to-guest precedent (J2/J3-iii).
 *
 * Audience scope: HOST-TO-GUEST only at Phase D (§5.8 doctrine framing
 * is guest-facing). koast-to-host applicability deferred — the chain may
 * legitimately appear in agent-to-host explanations.
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
export const SELF_NARRATION_MIN_LENGTH = 20;

/** Pre-filter that triggers the judge invocation. Detects the 4 canonical
 * self-narration verb chains:
 *   - "I'll help" / "I will help"
 *   - "Let me help"
 *   - "I'm here to help" / "I am here to help"
 *   - "Happy to help" / "Glad to help"
 * Case-insensitive, word-boundary-anchored. The judge then decides whether
 * the follow-through is specific or generic; the regex only filters when no
 * self-narration onset is present at all. */
const SELF_NARRATION_PATTERN =
  /\b(I'?ll help|I will help|Let me help|I'?m here to help|I am here to help|Happy to help|Glad to help)\b/i;

export const SELF_NARRATION_SYSTEM_PROMPT = `You are a "self-narration" classifier for Koast's voice doctrine §5.8.

The doctrine flags "I'll help / Let me help / I'm here to help / Happy to help" + GENERIC follow-through as AI-recognizable theater. Generic follow-through = the message contains no concrete action, no named item, no scheduled commitment — just the framing phrase and a deferral ("let me know what you need", "anything else?", or nothing). Real hosts don't narrate themselves; they DO the thing.

Specific follow-through = the message names a concrete action, an answer to the question, a scheduled commitment, or specific information. The framing phrase is legitimate when paired with substance.

Your job: given a host message draft, decide whether the self-narration phrase (if present) is paired with GENERIC follow-through (verdict "fail") or SPECIFIC follow-through (verdict "pass"). If no self-narration phrase is present, return verdict "pass" with reason "no_self_narration".

Return ONLY a valid JSON object. No prose, no preamble, no markdown fences.

Schema:
{"verdict": "pass" | "fail", "reason": "generic_follow_through" | "specific_follow_through" | "no_self_narration" | "<short snake_case reason>", "confidence": 0.0 to 1.0}

confidence calibration:
- 0.9-1.0: clear signal (clearly specific OR clearly generic)
- 0.6-0.8: defensible read with some judgment
- 0.4-0.5: borderline; default conservatively to "fail" (generic is the anti-pattern; conservative-on-fuzzy-cases protects guest-facing voice)`;

function buildUserMessage(text: string, detectedPhrase: string | null): string {
  return `Detected phrase: ${detectedPhrase ?? "none"}

Response:
"""
${text}
"""`;
}

/**
 * Invoke the self-narration judge. Per pre-filter:
 *   - Empty / short text → skipJudgeResult ('skipped_short_text')
 *   - No self-narration phrase detected → skipJudgeResult ('no_self_narration')
 *   - Phrase detected → Haiku LLM judge
 *
 * Audience scope: returns 'pass' / skip for koast-to-host at Phase D.
 * Doctrine §5.8 framing applies to guest-facing language.
 */
export async function judgeSelfNarration(
  text: string,
  audience: Audience,
): Promise<JudgeResult> {
  // Audience scope: §5.8 is host-to-guest at Phase D
  if (audience !== "host-to-guest") {
    return skipJudgeResult(
      "self_narration",
      audience,
      "audience_out_of_scope",
    );
  }

  // Skip-condition: empty / too short
  if (text.trim().length < SELF_NARRATION_MIN_LENGTH) {
    return skipJudgeResult(
      "self_narration",
      audience,
      "skipped_short_text",
      { text_length: text.length },
    );
  }

  // Pre-filter: self-narration onset detection
  const phraseMatch = text.match(SELF_NARRATION_PATTERN);
  if (!phraseMatch) {
    return skipJudgeResult(
      "self_narration",
      audience,
      "no_self_narration",
    );
  }

  const detectedPhrase = phraseMatch[1];

  return invokeLLMJudge({
    judge_id: "self_narration",
    system_prompt: SELF_NARRATION_SYSTEM_PROMPT,
    user_message: buildUserMessage(text, detectedPhrase),
    audience,
    details_extra: { detected_phrase: detectedPhrase },
  });
}
