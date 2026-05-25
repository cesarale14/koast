/**
 * Generic LLM-judge runner — M12 Phase B (J3 LLM-judge runtime).
 *
 * Extracted from exclamation-cap-llm.ts (J2 Haiku invocation precedent).
 * The runner is judge-agnostic: callers supply the judge_id, system prompt,
 * and user-message shape; the runner handles Anthropic SDK invocation,
 * output parsing, and the FAIL-OPEN INFRASTRUCTURE-ERROR contract.
 *
 * FAIL-OPEN INFRASTRUCTURE-ERROR (per M12 Phase B STOP §3.2 + msg 3456 catch #2):
 * judge-infra failures (timeout, 5xx, network, malformed parse) return a
 * JudgeResult with verdict='fail' + a structured infrastructure_error flag
 * in details. The call-site keeps the text unchanged (annotate-only) per
 * the J2 precedent. The envelope carries the flag for downstream review.
 *
 * BINDING CONTRACT (per CLAUDE.md Known Gaps J3 fail-open binding contract):
 * the fail-open default is VALID ONLY while host-approval gates the send
 * path. Any auto-send call-site must flip fail-mode via the per-call-site
 * policy-override hook in apply-output-judges.ts BEFORE auto-send activates.
 * The hook is substrate-for-the-contract.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  Audience,
  JudgeId,
  JudgeResult,
  JudgeVerdict,
} from "@/lib/agent/patterns/judge-types";

export const LLM_JUDGE_DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export interface ParsedLLMJudgeOutput {
  verdict: JudgeVerdict;
  reason: string;
  confidence: number;
}

export interface InvokeLLMJudgeInput {
  /** JudgeId attached to the returned JudgeResult.judge_id field. */
  judge_id: JudgeId;
  /** Anti-pattern-specific system prompt instructing the model how to classify. */
  system_prompt: string;
  /** Anti-pattern-specific user-message body. The runner sets role:'user' + content. */
  user_message: string;
  /** Audience attaches to details for downstream filtering. */
  audience: Audience;
  /** Optional details merged into the returned JudgeResult.details (e.g. detected verb). */
  details_extra?: Record<string, unknown>;
  /** Optional Haiku model override (defaults to LLM_JUDGE_DEFAULT_MODEL). */
  model?: string;
  /** Optional max_tokens override (defaults to 200; sufficient for JSON-only response). */
  max_tokens?: number;
}

/** Strip ```json ...``` or ``` ...``` fences if Haiku wraps despite instructions. */
function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseLLMJudgeOutput(raw: string): ParsedLLMJudgeOutput | null {
  try {
    const parsed = JSON.parse(stripFences(raw)) as Partial<ParsedLLMJudgeOutput>;
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
 * Invoke a generic LLM judge with the supplied prompt + user-message and
 * return a JudgeResult ready to attach to envelope.judge_results.
 *
 * Three result paths:
 *   1. Happy path — Haiku returns valid JSON → parsed verdict in JudgeResult
 *   2. Parse failure — conservative fail with reason='judge_parse_error', confidence=0.5
 *   3. Infrastructure error (timeout/5xx/network) — fail-open with
 *      reason='judge_infrastructure_error', confidence=0.0, details.infrastructure_error=true
 *
 * Throws ONLY on missing API key (setup error, not runtime). All runtime
 * exceptions caught → infrastructure-error JudgeResult.
 */
export async function invokeLLMJudge(
  input: InvokeLLMJudgeInput,
): Promise<JudgeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  let raw = "";
  try {
    const response = await client.messages.create({
      model: input.model ?? LLM_JUDGE_DEFAULT_MODEL,
      max_tokens: input.max_tokens ?? 200,
      system: input.system_prompt,
      messages: [{ role: "user", content: input.user_message }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    raw = textBlock && "text" in textBlock ? textBlock.text : "";
  } catch (err) {
    // FAIL-OPEN INFRASTRUCTURE-ERROR per M12 Phase B STOP §3.2.
    // Caller's annotate-only behavior keeps the text shipping; the
    // envelope carries the infrastructure-error flag for downstream
    // review. Binding contract: VALID ONLY while host-approval gates
    // the send path (per CLAUDE.md Known Gaps J3 binding contract).
    const message = err instanceof Error ? err.message : String(err);
    return {
      judge_id: input.judge_id,
      verdict: "fail",
      reason: "judge_infrastructure_error",
      confidence: 0.0,
      details: {
        ...input.details_extra,
        audience: input.audience,
        infrastructure_error: true,
        error_message: message,
      },
    };
  }

  const parsed = parseLLMJudgeOutput(raw);

  if (parsed === null) {
    return {
      judge_id: input.judge_id,
      verdict: "fail",
      reason: "judge_parse_error",
      confidence: 0.5,
      details: {
        ...input.details_extra,
        audience: input.audience,
        parse_error: true,
        raw,
      },
    };
  }

  return {
    judge_id: input.judge_id,
    verdict: parsed.verdict,
    reason: parsed.reason,
    confidence: parsed.confidence,
    details: {
      ...input.details_extra,
      audience: input.audience,
      judged: true,
    },
  };
}

/**
 * Build a standard JudgeResult representing a skipped judge (skip-condition
 * met; no LLM call made). Verdict='pass' since "skipped" means no policy
 * violation can be asserted. Caller uses this when content fails pre-filter
 * heuristics (empty, too short, anti-pattern absent).
 */
export function skipJudgeResult(
  judge_id: JudgeId,
  audience: Audience,
  reason: string,
  details_extra?: Record<string, unknown>,
): JudgeResult {
  return {
    judge_id,
    verdict: "pass",
    reason,
    confidence: 1.0,
    details: {
      ...details_extra,
      audience,
      skipped: true,
    },
  };
}
