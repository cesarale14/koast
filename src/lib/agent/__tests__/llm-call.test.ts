/**
 * Tests for callLLMWithEnvelope — M9 Phase B F3 substrate.
 *
 * Coverage: happy path + repair retry success + repair retry custom
 * prompt + repairAttempts=0 disables retry + fall-through to error
 * after exhausted attempts + LLMSchemaError carries attempts + issues.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { callLLMWithEnvelope, LLMSchemaError } from "../llm-call";
import type { AgentTextOutput } from "../schemas/agent-text-output";

function makeAnthropicMock(textResponses: string[]) {
  let callIndex = 0;
  const create = jest.fn().mockImplementation(async () => {
    const text = textResponses[Math.min(callIndex, textResponses.length - 1)];
    callIndex++;
    return {
      content: [{ type: "text", text }],
    } as unknown as Anthropic.Message;
  });
  return {
    client: { messages: { create } } as unknown as Anthropic,
    create,
  };
}

const baseParams = (client: Anthropic) => ({
  client,
  model: "claude-sonnet-4-20250514",
  max_tokens: 300,
  system: "test system prompt",
  messages: [{ role: "user" as const, content: "hi" }],
});

const buildEnvelopeFromText = (text: string): AgentTextOutput => ({
  content: text,
  confidence: "confirmed",
  source_attribution: [],
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("callLLMWithEnvelope — happy path", () => {
  test("returns envelope on first attempt success", async () => {
    const { client, create } = makeAnthropicMock(["this is a draft reply"]);
    const result = await callLLMWithEnvelope(baseParams(client), {
      buildEnvelope: buildEnvelopeFromText,
    });
    expect(result).toEqual({
      content: "this is a draft reply",
      confidence: "confirmed",
      source_attribution: [],
    });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("callLLMWithEnvelope — repair retry", () => {
  test("retries once on empty content; succeeds on retry", async () => {
    const { client, create } = makeAnthropicMock(["", "valid retry text"]);
    const result = await callLLMWithEnvelope(baseParams(client), {
      buildEnvelope: buildEnvelopeFromText,
    });
    expect(result.content).toBe("valid retry text");
    expect(create).toHaveBeenCalledTimes(2);

    // Second call appended the repair-prompt turn after the previous
    // (empty) assistant response.
    const secondCallArgs = create.mock.calls[1]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(secondCallArgs.messages.length).toBeGreaterThan(2);
    const finalTurn =
      secondCallArgs.messages[secondCallArgs.messages.length - 1];
    expect(finalTurn?.role).toBe("user");
  });

  test("uses custom repairPrompt when supplied", async () => {
    const { client, create } = makeAnthropicMock(["", "ok"]);
    await callLLMWithEnvelope(baseParams(client), {
      buildEnvelope: buildEnvelopeFromText,
      repairPrompt: "Site-specific repair instruction.",
    });
    const secondCallArgs = create.mock.calls[1]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const finalTurn =
      secondCallArgs.messages[secondCallArgs.messages.length - 1];
    expect(finalTurn?.content).toBe("Site-specific repair instruction.");
  });

  test("repairAttempts=0 disables retry; throws on first failure", async () => {
    const { client, create } = makeAnthropicMock([""]);
    await expect(
      callLLMWithEnvelope(baseParams(client), {
        buildEnvelope: buildEnvelopeFromText,
        repairAttempts: 0,
      }),
    ).rejects.toThrow(LLMSchemaError);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("callLLMWithEnvelope — fall-through to error", () => {
  test("throws LLMSchemaError after exhausted attempts (default 1 repair)", async () => {
    const { client, create } = makeAnthropicMock(["", ""]);
    await expect(
      callLLMWithEnvelope(baseParams(client), {
        buildEnvelope: buildEnvelopeFromText,
      }),
    ).rejects.toThrow(LLMSchemaError);
    expect(create).toHaveBeenCalledTimes(2);
  });

  test("LLMSchemaError carries attempts + lastValidationIssues", async () => {
    const { client } = makeAnthropicMock(["", ""]);
    try {
      await callLLMWithEnvelope(baseParams(client), {
        buildEnvelope: buildEnvelopeFromText,
      });
      throw new Error("expected LLMSchemaError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LLMSchemaError);
      const llmErr = err as LLMSchemaError;
      expect(llmErr.attempts).toBe(2);
      expect(llmErr.lastValidationIssues).toContain("content");
    }
  });
});
