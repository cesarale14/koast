/**
 * J3-iv-a filler judge — M12 Phase D activated stub
 * (deferred_5_7_filler transition to runtime_active).
 *
 * Voice doctrine §5.7 "Filler": words like "really", "very", "just",
 * "actually", "basically", "honestly", "literally" read as canned filler
 * when they ADD NO INFORMATION and could be removed without changing
 * meaning or tone. The SAME words are LEGITIMATE when used for
 * (a) EMPHASIS (intensifying a genuine claim), (b) SOFTENING (politeness
 * register), or (c) SPECIFICATION (modifying a quantitative/qualitative
 * dimension). The judge classifies the candidate word's role
 * contextually.
 *
 * Architecture per M12 Phase D STOP §3.1 (boundary defensible with
 * asymmetric-default PASS on borderline):
 *   - Pre-filter: regex detects the 7 candidate filler words.
 *     No match → skip judge → verdict='pass' (no anti-pattern present).
 *   - LLM judge: when pre-filter matches, Haiku classifies whether the
 *     candidate word is filler (removable without changing meaning or
 *     tone) or legitimate (emphasis / softening / specification).
 *   - Annotate-only fail-behavior per host-to-guest precedent (J2/J3-iii/J4).
 *
 * Asymmetric default (operator-binding for §5.7 specifically):
 *   - Borderline cases default to PASS. Real hosts use "really" / "just" /
 *     "very" for legitimate emphasis; over-blocking is the higher cost
 *     than missing some filler instances.
 *
 * Audience scope: HOST-TO-GUEST only at Phase D (§5.7 doctrine framing).
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
export const FILLER_MIN_LENGTH = 20;

/** Pre-filter that triggers the judge invocation. Detects the 7 canonical
 * filler-candidate words:
 *   - really, very, just, actually, basically, honestly, literally
 * Case-insensitive, word-boundary-anchored. The judge then decides whether
 * the word is filler or legitimate; the regex only filters when no
 * candidate is present at all. */
const FILLER_WORD_PATTERN =
  /\b(really|very|just|actually|basically|honestly|literally)\b/i;

export const FILLER_SYSTEM_PROMPT = `You are a "filler word" classifier for Koast's voice doctrine §5.7.

The doctrine flags "really", "very", "just", "actually", "basically", "honestly", "literally" as filler ANTI-PATTERNS when they ADD NO INFORMATION and could be removed without changing meaning OR tone. The SAME words are LEGITIMATE when used for one of three roles:

  (a) EMPHASIS — intensifying a genuine claim ("Really sorry about the lockbox" — without "really", sincerity register drops)
  (b) SOFTENING — politeness register ("Just confirming the check-in time is 4pm" — without "just", the message reads curt)
  (c) SPECIFICATION — modifying a quantitative/qualitative dimension ("Very early check-ins are sometimes possible" — "very early" means before noon, vs "early" meaning before 4pm)

Your job: given a host message draft, decide whether the candidate filler word (if present) is FILLER (removable without changing meaning or tone, verdict "fail") or LEGITIMATE (emphasis/softening/specification, verdict "pass"). If no candidate is present, return verdict "pass" with reason "no_filler".

ASYMMETRIC DEFAULT — when the judgment is borderline (the word might be filler or might be legitimate softening/emphasis), DEFAULT TO PASS. Real hosts use these words for legitimate register; over-blocking authentic voice is the worse failure mode than missing an occasional filler instance.

Test for each candidate: imagine removing the word. Does the message still convey the same INFORMATION and the same TONE? If yes → filler (FAIL). If no (information OR tone changes) → legitimate (PASS).

Return ONLY a valid JSON object. No prose, no preamble, no markdown fences.

Schema:
{"verdict": "pass" | "fail", "reason": "no_information_added" | "legitimate_emphasis" | "legitimate_softening" | "legitimate_specification" | "no_filler" | "<short snake_case reason>", "confidence": 0.0 to 1.0}

confidence calibration:
- 0.9-1.0: clear signal (clearly filler OR clearly legitimate)
- 0.6-0.8: defensible read with some judgment
- 0.4-0.5: borderline; default conservatively to PASS (asymmetric-default per §5.7 over-block aversion)`;

function buildUserMessage(text: string, detectedWord: string | null): string {
  return `Detected candidate: ${detectedWord ?? "none"}

Response:
"""
${text}
"""`;
}

/**
 * Invoke the filler judge. Per pre-filter:
 *   - Empty / short text → skipJudgeResult ('skipped_short_text')
 *   - No filler-candidate word detected → skipJudgeResult ('no_filler')
 *   - Candidate detected → Haiku LLM judge
 *
 * Audience scope: returns 'pass' / skip for koast-to-host at Phase D.
 * Doctrine §5.7 framing applies to guest-facing language.
 */
export async function judgeFiller(
  text: string,
  audience: Audience,
): Promise<JudgeResult> {
  // Audience scope: §5.7 is host-to-guest at Phase D
  if (audience !== "host-to-guest") {
    return skipJudgeResult(
      "filler",
      audience,
      "audience_out_of_scope",
    );
  }

  // Skip-condition: empty / too short
  if (text.trim().length < FILLER_MIN_LENGTH) {
    return skipJudgeResult(
      "filler",
      audience,
      "skipped_short_text",
      { text_length: text.length },
    );
  }

  // Pre-filter: filler-candidate detection
  const wordMatch = text.match(FILLER_WORD_PATTERN);
  if (!wordMatch) {
    return skipJudgeResult(
      "filler",
      audience,
      "no_filler",
    );
  }

  const detectedWord = wordMatch[1];

  return invokeLLMJudge({
    judge_id: "filler",
    system_prompt: FILLER_SYSTEM_PROMPT,
    user_message: buildUserMessage(text, detectedWord),
    audience,
    details_extra: { detected_word: detectedWord },
  });
}
