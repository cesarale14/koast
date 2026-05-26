/**
 * J3-iv-c performative-thoroughness judge — M12 Phase D activated stub
 * (deferred_5_9_performative_thoroughness transition to runtime_active).
 *
 * Voice doctrine §5.9 "Performative thoroughness": multi-paragraph
 * responses padded with GENERIC INTERCHANGEABLE boilerplate-of-helpfulness
 * — phrases that could appear verbatim in any message to any guest about
 * any property ("happy to help!", "don't hesitate to reach out",
 * "wishing you a wonderful stay") — are AI-recognizable theater. The
 * judge distinguishes generic-interchangeable padding from CONTEXT-
 * SPECIFIC content (names the guest, property, occasion, or actual
 * situation).
 *
 * BOUNDARY REFINEMENT at sign-off (operator msg 3475 binding): the
 * discriminator is GENERIC INTERCHANGEABLE vs CONTEXT-SPECIFIC. NOT
 * "informational vs non-informational". Authentic relational warmth
 * ("can't wait to host you for the jazz festival", "Welcome back,
 * Marcus") is non-informational but is CONTEXT-SPECIFIC — it IS the
 * authentic host voice Koast's voice system exists to preserve.
 * Stripping it would homogenize host voice and work AGAINST the voice-
 * extraction substrate. Asymmetric cost: over-block of warmth is the
 * WORST failure mode; missing some padding is the lesser cost.
 *
 * Architecture per M12 Phase D STOP §3.3.refined:
 *   - Pre-filter: skip single-sentence responses (PASS — nothing to flag)
 *     + skip below threshold length.
 *   - LLM judge: identify generic-interchangeable sentences; pass when
 *     all non-informational content is context-specific or when only
 *     a single conventional opener/closer is generic.
 *   - Annotate-only fail-behavior per host-to-guest precedent.
 *   - Asymmetric-default PASS on borderline.
 *
 * Audience scope: HOST-TO-GUEST only at Phase D (§5.9 doctrine framing).
 */

import type {
  Audience,
  JudgeResult,
} from "@/lib/agent/patterns/judge-types";
import {
  invokeLLMJudge,
  skipJudgeResult,
} from "@/lib/agent/judge/llm-judge";

/** Skip-condition threshold: text below this length never invokes LLM.
 * Performative-thoroughness requires multi-sentence/paragraph length to
 * exist as an anti-pattern; raise threshold above the other Phase D stubs. */
export const PERFORMATIVE_THOROUGHNESS_MIN_LENGTH = 60;

/** Skip-condition: pre-filter on sentence count. A single-sentence
 * response cannot be performative-thoroughness; skip without invoking
 * LLM. Sentence detection is approximate (sentence-ending punctuation
 * not preceded by common abbreviations) but the threshold is generous
 * enough that single-sentence messages won't trip it. */
function countSentences(text: string): number {
  // Strip trailing whitespace then count sentence-ending punctuation.
  // The judge LLM does the actual semantic count; this pre-filter only
  // guards against the trivial single-sentence case.
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  const endings = trimmed.match(/[.!?]+(?:\s|$)/g);
  return endings ? endings.length : 1;
}

export const PERFORMATIVE_THOROUGHNESS_SYSTEM_PROMPT = `You are a "performative thoroughness" classifier for Koast's voice doctrine §5.9.

The doctrine flags MULTI-SENTENCE host messages padded with GENERIC INTERCHANGEABLE boilerplate-of-helpfulness — sentences that could appear verbatim in any message to any guest about any property. These are AI-recognizable theater.

The DISCRIMINATOR (this is the boundary):

GENERIC INTERCHANGEABLE (FAIL-eligible) — would this sentence be IDENTICAL if sent to a different guest about a different property in a different situation? Examples that are clearly generic:
- "Happy to help!"
- "Don't hesitate to reach out if you need anything"
- "Wishing you a wonderful stay"
- "Thanks so much for reaching out"
- "Let me help you with that"
- "Please let me know if you need anything else"
- "I really appreciate your question"

CONTEXT-SPECIFIC (PASS even when non-informational) — names the GUEST, the PROPERTY, the OCCASION, the SEASON, the SITUATION, the actual context. AUTHENTIC RELATIONAL WARMTH belongs HERE; it is what real hosts write. Examples that are clearly context-specific:
- "Can't wait to host you for the jazz festival" (names occasion)
- "Welcome back, Marcus" (names guest + history)
- "Tampa in November is the best" (names location + season)
- "The pool gets gorgeous at sunset" (names property feature)
- "You picked a great week — forecast looks low 80s" (names context)
- "Sorry about the AC failing today" (names actual situation)

DECISION RULE:
1. If the response is a SINGLE SENTENCE → PASS (nothing to flag).
2. For each NON-INFORMATIONAL sentence (not conveying check-in info / access codes / property details / answers to specific questions): apply the IDENTICAL-ACROSS-GUESTS test.
3. If MULTIPLE sentences are GENERIC INTERCHANGEABLE (could be verbatim in any host message) AND they EXCEED a single conventional opener or closer → FAIL.
4. If every non-informational sentence is CONTEXT-SPECIFIC (authentic warmth: names guest / property / occasion / situation) → PASS, even though non-informational.
5. If informational content carries the message and only a single conventional opener/closer is generic → PASS.

ASYMMETRIC DEFAULT — when borderline (ambiguous whether warmth is context-specific or generic), DEFAULT TO PASS. Authentic host warmth is exactly what Koast's voice system exists to preserve; over-blocking it homogenizes host voice and works against voice-extraction. Missing some padding is the lesser cost.

Return ONLY a valid JSON object. No prose, no preamble, no markdown fences.

Schema:
{"verdict": "pass" | "fail", "reason": "generic_interchangeable_padding" | "context_specific_warmth" | "informational_content" | "single_sentence" | "<short snake_case reason>", "confidence": 0.0 to 1.0}

confidence calibration:
- 0.9-1.0: clear signal (clearly performative OR clearly authentic)
- 0.6-0.8: defensible read with some judgment
- 0.4-0.5: borderline; default conservatively to PASS (asymmetric-default per §5.9 over-block aversion)`;

function buildUserMessage(text: string, sentenceCount: number): string {
  return `Sentence count (approximate): ${sentenceCount}

Response:
"""
${text}
"""`;
}

/**
 * Invoke the performative-thoroughness judge. Per pre-filter:
 *   - Empty / short text → skipJudgeResult ('skipped_short_text')
 *   - Single-sentence text → skipJudgeResult ('single_sentence')
 *   - Multi-sentence text → Haiku LLM judge with the generic/context-
 *     specific discriminator
 *
 * Audience scope: returns 'pass' / skip for koast-to-host at Phase D.
 * Doctrine §5.9 framing applies to guest-facing language.
 */
export async function judgePerformativeThoroughness(
  text: string,
  audience: Audience,
): Promise<JudgeResult> {
  // Audience scope: §5.9 is host-to-guest at Phase D
  if (audience !== "host-to-guest") {
    return skipJudgeResult(
      "performative_thoroughness",
      audience,
      "audience_out_of_scope",
    );
  }

  // Skip-condition: empty / too short
  if (text.trim().length < PERFORMATIVE_THOROUGHNESS_MIN_LENGTH) {
    return skipJudgeResult(
      "performative_thoroughness",
      audience,
      "skipped_short_text",
      { text_length: text.length },
    );
  }

  // Pre-filter: skip single-sentence responses
  const sentenceCount = countSentences(text);
  if (sentenceCount <= 1) {
    return skipJudgeResult(
      "performative_thoroughness",
      audience,
      "single_sentence",
      { sentence_count: sentenceCount },
    );
  }

  return invokeLLMJudge({
    judge_id: "performative_thoroughness",
    system_prompt: PERFORMATIVE_THOROUGHNESS_SYSTEM_PROMPT,
    user_message: buildUserMessage(text, sentenceCount),
    audience,
    details_extra: { sentence_count: sentenceCount },
  });
}
