/**
 * Generic LLM-judge runner tests — M12 Phase B (J3 LLM-judge runtime).
 *
 * Mocks @anthropic-ai/sdk to verify:
 *   - Happy path: parse valid JSON → JudgeResult shape
 *   - Parse failure: malformed JSON → conservative fail with judge_parse_error
 *   - INFRASTRUCTURE-ERROR fail-open: timeout/5xx/network throws caught
 *     → verdict='fail' + details.infrastructure_error=true (Phase B STOP §3.2)
 *   - skipJudgeResult helper shape
 *
 * Per CLAUDE.md Known Gaps J3 binding contract: fail-open is valid only
 * while host-approval gates the send path. The infrastructure-error path
 * MUST never throw to the caller; the runner catches all runtime errors
 * and returns a JudgeResult with the infrastructure_error flag.
 */

import Anthropic from "@anthropic-ai/sdk";

jest.mock("@anthropic-ai/sdk", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: jest.fn() },
    })),
  };
});

const mockCreate = jest.fn();
const mockAnthropic = Anthropic as unknown as jest.Mock;
mockAnthropic.mockImplementation(() => ({
  messages: { create: mockCreate },
}));

import { invokeLLMJudge, skipJudgeResult } from "@/lib/agent/judge/llm-judge";

function makeHaikuResponse(rawText: string) {
  return { content: [{ type: "text" as const, text: rawText }] };
}

beforeEach(() => {
  mockCreate.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("invokeLLMJudge — happy path", () => {
  test("parses valid pass JSON into JudgeResult", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"concrete_object_paired","confidence":0.9}',
      ),
    );
    const r = await invokeLLMJudge({
      judge_id: "ensure_verb_chain",
      system_prompt: "test prompt",
      user_message: "test message",
      audience: "host-to-guest",
      details_extra: { detected_verb: "ensure" },
    });
    expect(r.judge_id).toBe("ensure_verb_chain");
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("concrete_object_paired");
    expect(r.confidence).toBe(0.9);
    expect(r.details).toMatchObject({
      detected_verb: "ensure",
      audience: "host-to-guest",
      judged: true,
    });
  });

  test("parses valid fail JSON into JudgeResult", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"abstract_object_paired","confidence":0.85}',
      ),
    );
    const r = await invokeLLMJudge({
      judge_id: "ensure_verb_chain",
      system_prompt: "test prompt",
      user_message: "test message",
      audience: "host-to-guest",
    });
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("abstract_object_paired");
    expect(r.confidence).toBe(0.85);
  });

  test("strips ```json``` fences if Haiku wraps despite instructions", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '```json\n{"verdict":"pass","reason":"ok","confidence":0.7}\n```',
      ),
    );
    const r = await invokeLLMJudge({
      judge_id: "ensure_verb_chain",
      system_prompt: "test",
      user_message: "test",
      audience: "host-to-guest",
    });
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("ok");
  });
});

describe("invokeLLMJudge — parse failure fallback", () => {
  test("malformed JSON → conservative fail with judge_parse_error", async () => {
    mockCreate.mockResolvedValueOnce(makeHaikuResponse("not json at all"));
    const r = await invokeLLMJudge({
      judge_id: "ensure_verb_chain",
      system_prompt: "test",
      user_message: "test",
      audience: "host-to-guest",
    });
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("judge_parse_error");
    expect(r.confidence).toBe(0.5);
    expect(r.details).toMatchObject({ parse_error: true });
  });

  test("missing required field (no verdict) → parse fail", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse('{"reason":"missing_verdict","confidence":0.5}'),
    );
    const r = await invokeLLMJudge({
      judge_id: "ensure_verb_chain",
      system_prompt: "test",
      user_message: "test",
      audience: "host-to-guest",
    });
    expect(r.reason).toBe("judge_parse_error");
  });

  test("invalid verdict value → parse fail", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse('{"verdict":"maybe","reason":"x","confidence":0.5}'),
    );
    const r = await invokeLLMJudge({
      judge_id: "ensure_verb_chain",
      system_prompt: "test",
      user_message: "test",
      audience: "host-to-guest",
    });
    expect(r.reason).toBe("judge_parse_error");
  });
});

describe("invokeLLMJudge — INFRASTRUCTURE-ERROR fail-open (Phase B STOP §3.2)", () => {
  test("timeout error → fail-open with infrastructure_error flag", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Request timed out"));
    const r = await invokeLLMJudge({
      judge_id: "ensure_verb_chain",
      system_prompt: "test",
      user_message: "test",
      audience: "host-to-guest",
    });
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("judge_infrastructure_error");
    expect(r.confidence).toBe(0.0);
    expect(r.details).toMatchObject({ infrastructure_error: true });
    expect((r.details as Record<string, unknown>).error_message).toMatch(/timed out/);
  });

  test("5xx-class error → fail-open with infrastructure_error flag", async () => {
    mockCreate.mockRejectedValueOnce(new Error("503 Service Unavailable"));
    const r = await invokeLLMJudge({
      judge_id: "ensure_verb_chain",
      system_prompt: "test",
      user_message: "test",
      audience: "host-to-guest",
    });
    expect(r.reason).toBe("judge_infrastructure_error");
    expect(r.details).toMatchObject({ infrastructure_error: true });
  });

  test("network error → fail-open with infrastructure_error flag", async () => {
    mockCreate.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const r = await invokeLLMJudge({
      judge_id: "ensure_verb_chain",
      system_prompt: "test",
      user_message: "test",
      audience: "host-to-guest",
    });
    expect(r.reason).toBe("judge_infrastructure_error");
  });

  test("non-Error throw (string) handled cleanly", async () => {
    mockCreate.mockRejectedValueOnce("plain string error");
    const r = await invokeLLMJudge({
      judge_id: "ensure_verb_chain",
      system_prompt: "test",
      user_message: "test",
      audience: "host-to-guest",
    });
    expect(r.reason).toBe("judge_infrastructure_error");
    expect((r.details as Record<string, unknown>).error_message).toBe("plain string error");
  });
});

describe("invokeLLMJudge — setup error", () => {
  test("missing ANTHROPIC_API_KEY throws (setup error, NOT runtime fail-open)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      invokeLLMJudge({
        judge_id: "ensure_verb_chain",
        system_prompt: "test",
        user_message: "test",
        audience: "host-to-guest",
      }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe("skipJudgeResult — helper shape", () => {
  test("returns verdict='pass' + skipped=true", () => {
    const r = skipJudgeResult(
      "ensure_verb_chain",
      "host-to-guest",
      "no_verb_chain",
      { extra: "context" },
    );
    expect(r.judge_id).toBe("ensure_verb_chain");
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("no_verb_chain");
    expect(r.confidence).toBe(1.0);
    expect(r.details).toMatchObject({
      extra: "context",
      audience: "host-to-guest",
      skipped: true,
    });
  });
});
