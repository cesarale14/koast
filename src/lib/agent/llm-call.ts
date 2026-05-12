/**
 * callLLMWithEnvelope — F3 substrate (M9 Phase B).
 *
 * Wraps Anthropic SDK single-shot text-completion calls in an
 * AgentTextOutput envelope (D22) with structural Zod validation and
 * the locked failure path: repair retry + fall-through to error.
 *
 * Phase B scope: 4 generator sites (messaging.ts:generateDraft + 3
 * review-generation functions) per Path A sign-off. Site 5 (agent
 * loop in src/lib/agent/loop.ts) is structurally distinct (streaming,
 * multi-turn, tool-use) and OUT of scope — its chat-text path is
 * covered separately by A5/D27 in Phase D.
 *
 * D26 status: this wrapper is the option-α (generic wrapper)
 * candidate. Site 1's implementation surfaces whether the wrapper
 * shape fits cleanly across the 4 sites or whether per-site Zod (β)
 * is more natural. D26 locks after Site 1 observation; v2.2 captures
 * the lock before Site 2 implementation begins.
 *
 * Failure path (locked per Phase B sign-off):
 *   1. Call LLM
 *   2. Build envelope from extracted text + caller-provided metadata
 *   3. Validate envelope via Zod
 *   4. If validation fails → repair retry with corrective prompt
 *      (default 1 attempt; configurable)
 *   5. If still failing → throw LLMSchemaError (fall-through)
 *
 * Voice doctrine integration: F3 enforces STRUCTURAL output only.
 * Tonal regression (voice doctrine §5 anti-patterns) is D24 territory
 * (Phase F shape regex CI). F3 doesn't pre-empt Phase F substrate.
 */

import type Anthropic from "@anthropic-ai/sdk";
import {
  AgentTextOutputSchema,
  type AgentTextOutput,
} from "./schemas/agent-text-output";

export class LLMSchemaError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastValidationIssues?: string,
  ) {
    super(message);
    this.name = "LLMSchemaError";
  }
}

export interface LLMCallParams {
  client: Anthropic;
  model: string;
  max_tokens: number;
  /**
   * Optional system prompt. Site 2's private-note call (and any future
   * site that prompts entirely via messages) omits this; everywhere
   * else passes a system string.
   */
  system?: string;
  messages: Anthropic.MessageParam[];
}

export interface CallWithEnvelopeOptions {
  /**
   * Construct the envelope from the LLM's raw text. Caller-provided
   * metadata (confidence, source_attribution, sufficiency_signal,
   * hedge) is encoded here; the wrapper validates the result against
   * AgentTextOutputSchema.
   */
  buildEnvelope: (text: string) => AgentTextOutput;

  /**
   * Max repair retries on schema-validation failure. Default 1
   * (one repair attempt after the initial call). Set to 0 to disable
   * repair retry entirely (fall-through immediately on first failure).
   */
  repairAttempts?: number;

  /**
   * Corrective prompt appended on repair retry. Default is a generic
   * "please provide a complete response" message. Sites with stronger
   * structural expectations can override with site-specific guidance.
   */
  repairPrompt?: string;
}

const DEFAULT_REPAIR_PROMPT =
  "Your previous response was empty or did not match the required output shape. Please provide a complete, on-topic response.";

/**
 * Extract the first text block from an Anthropic Message response.
 * Returns empty string if no text block found (which then fails
 * AgentTextOutputSchema's min(1) on content → triggers repair retry).
 */
function extractText(response: Anthropic.Message): string {
  const textBlock = response.content.find((b) => b.type === "text");
  // Anthropic SDK types: TextBlock has a .text string field.
  return textBlock && "text" in textBlock ? textBlock.text : "";
}

export async function callLLMWithEnvelope(
  params: LLMCallParams,
  options: CallWithEnvelopeOptions,
): Promise<AgentTextOutput> {
  const { client, model, max_tokens, system, messages } = params;
  const {
    buildEnvelope,
    repairAttempts = 1,
    repairPrompt = DEFAULT_REPAIR_PROMPT,
  } = options;

  let lastResponseText = "";
  let lastValidationIssues: string | undefined;
  const totalAttempts = 1 + repairAttempts;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const attemptMessages: Anthropic.MessageParam[] =
      attempt === 0
        ? messages
        : [
            ...messages,
            {
              role: "assistant",
              content: lastResponseText || "(empty)",
            },
            { role: "user", content: repairPrompt },
          ];

    const response = await client.messages.create({
      model,
      max_tokens,
      ...(system != null ? { system } : {}),
      messages: attemptMessages,
    });

    const text = extractText(response);
    lastResponseText = text;

    const envelope = buildEnvelope(text);
    const result = AgentTextOutputSchema.safeParse(envelope);
    if (result.success) {
      return result.data;
    }

    lastValidationIssues = result.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
  }

  // All attempts exhausted — fall-through to error (locked per Phase B sign-off).
  throw new LLMSchemaError(
    `LLM output did not match AgentTextOutput envelope after ${totalAttempts} attempt(s)`,
    totalAttempts,
    lastValidationIssues,
  );
}
