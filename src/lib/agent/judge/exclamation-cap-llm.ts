/**
 * Haiku semantic judge for the exclamation-cap rescue path — M10 Phase B STEP 8.
 *
 * Separate file from src/lib/agent/judge/exclamation-cap.ts to keep a
 * clean mock boundary: deterministic prefilter lives in the sync module;
 * LLM call lives here. Tests mock @anthropic-ai/sdk directly and verify
 * the count<=cap path never reaches this module.
 *
 * §7.9 D24 voice-scan scope (verified at STEP 8 §8.1):
 *   - PROMPT_BEARING_FILES is a hard-coded 2-file list (no globs);
 *     this judge file is NOT in scope.
 *   - CONSTITUTION_PROMPTS is the deferred list for negative-example
 *     pedagogy (voice/build-voice-prompt.ts + agent/system-prompt.ts);
 *     this judge prompt is structurally distinct: it's a CLASSIFIER
 *     prompt, not a call-site or constitution prompt. It doesn't teach
 *     the doctrine to a generator; it asks a judge model to classify
 *     an already-generated response. Out of both scopes.
 *   - The judge prompt below does NOT quote banned phrases verbatim;
 *     no quote-vs-instance ambiguity. v2.8 §7.9 amendment may codify
 *     "judge prompts" as a third file class with its own scan policy.
 *
 * Output schema (locked Q8-b conservative-JSON strategy):
 *   { "verdict": "pass" | "fail",
 *     "reason": "genuine_milestone" | "theatrical_overuse" | <other concise>,
 *     "confidence": <0..1> }
 *
 * Parse failure (malformed JSON, missing fields, parse exception):
 *   conservative fail with reason='judge_parse_error', confidence=0.5.
 *   Annotate-only fail-behavior (Q3) means the route still ships the
 *   text; the envelope flags the parse failure for downstream review.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  Audience,
  JudgeResult,
  JudgeVerdict,
} from "@/lib/agent/patterns/judge-types";

export const EXCLAMATION_JUDGE_MODEL = "claude-haiku-4-5-20251001";

export const EXCLAMATION_JUDGE_SYSTEM_PROMPT = `You are an exclamation-cap classifier for Koast's voice-doctrine enforcement.

Koast's voice doctrine permits a small number of exclamation marks per response, calibrated by audience:
- koast-to-host: max 1 (only for genuine milestone moments worth marking)
- host-to-guest: max 3 (warm but not effusive)

The response below exceeds the cap. Your job: decide whether the count is justified by genuine milestone moments (verdict "pass") or whether the exclamations are theatrical / performative / chipper register (verdict "fail").

Return ONLY a valid JSON object. No prose, no preamble, no markdown fences.
Schema:
{"verdict": "pass" | "fail", "reason": "genuine_milestone" | "theatrical_overuse" | "<short snake_case reason>", "confidence": 0.0 to 1.0}

confidence calibration:
- 0.9-1.0: clear signal one way or the other
- 0.6-0.8: defensible read with some judgment
- 0.4-0.5: borderline; default conservatively to "fail" if unsure`;

function buildUserMessage(
  text: string,
  audience: Audience,
  count: number,
  cap: number,
): string {
  return `Audience: ${audience}
Cap: ${cap}
Count: ${count}

Response:
"""
${text}
"""`;
}

/** Strip ```json ...``` or ``` ...``` fences if Haiku wraps despite instructions. */
function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1].trim() : trimmed;
}

interface ParsedJudgeOutput {
  verdict: JudgeVerdict;
  reason: string;
  confidence: number;
}

function parseHaikuOutput(raw: string): ParsedJudgeOutput | null {
  try {
    const parsed = JSON.parse(stripFences(raw)) as Partial<ParsedJudgeOutput>;
    if (
      (parsed.verdict === "pass" || parsed.verdict === "fail") &&
      typeof parsed.reason === "string" &&
      parsed.reason.length > 0 &&
      typeof parsed.confidence === "number" &&
      parsed.confidence >= 0 &&
      parsed.confidence <= 1
    ) {
      return {
        verdict: parsed.verdict,
        reason: parsed.reason,
        confidence: parsed.confidence,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Invoke the Haiku judge on a count-exceeding response. Returns a
 * JudgeResult ready to attach to envelope.judge_results.
 *
 * On parse failure: conservative fail (verdict='fail', reason='judge_parse_error',
 * confidence=0.5). The route's annotate-only fail-behavior (Q3) means
 * the text still ships; the envelope carries the parse-error flag.
 */
export async function invokeHaikuJudge(
  text: string,
  audience: Audience,
  count: number,
  cap: number,
): Promise<JudgeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: EXCLAMATION_JUDGE_MODEL,
    max_tokens: 200,
    system: EXCLAMATION_JUDGE_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildUserMessage(text, audience, count, cap) },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "";
  const parsed = parseHaikuOutput(raw);

  if (parsed === null) {
    return {
      judge_id: "exclamation_cap",
      verdict: "fail",
      reason: "judge_parse_error",
      confidence: 0.5,
      details: { count, cap, audience, parse_error: true, raw },
    };
  }

  return {
    judge_id: "exclamation_cap",
    verdict: parsed.verdict,
    reason: parsed.reason,
    confidence: parsed.confidence,
    details: { count, cap, audience, judged: true },
  };
}
