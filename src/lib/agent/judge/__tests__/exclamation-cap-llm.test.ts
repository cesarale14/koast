/**
 * J2 Haiku semantic judge — mocked @anthropic-ai/sdk tests.
 * M10 Phase B STEP 8.
 *
 * Real Haiku calls are STEP 9 integration smoke (env-gated, separate file).
 * These tests verify the parse + classify + parse-error fallback logic
 * deterministically against a fully mocked SDK.
 *
 * 10 tests.
 */

import Anthropic from "@anthropic-ai/sdk";

// Mirror the messaging.test.ts mock pattern.
jest.mock("@anthropic-ai/sdk", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: jest.fn() },
    })),
  };
});

// Capture the singleton create mock so each test can program its return.
const mockCreate = jest.fn();
const mockAnthropic = Anthropic as unknown as jest.Mock;
mockAnthropic.mockImplementation(() => ({
  messages: { create: mockCreate },
}));

import {
  invokeHaikuJudge,
  EXCLAMATION_JUDGE_MODEL,
  EXCLAMATION_JUDGE_SYSTEM_PROMPT,
} from "@/lib/agent/judge/exclamation-cap-llm";

function makeHaikuResponse(rawText: string) {
  return {
    content: [{ type: "text" as const, text: rawText }],
  };
}

beforeEach(() => {
  mockCreate.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("invokeHaikuJudge — verdict propagation", () => {
  test("mock Haiku verdict='pass' (genuine_milestone) → JudgeResult verdict='pass'", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"genuine_milestone","confidence":0.9}',
      ),
    );
    const r = await invokeHaikuJudge("Wow! What a stay! Truly!", "host-to-guest", 4, 3);
    expect(r.judge_id).toBe("exclamation_cap");
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("genuine_milestone");
    expect(r.confidence).toBe(0.9);
    expect(r.details).toMatchObject({ count: 4, cap: 3, audience: "host-to-guest", judged: true });
  });

  test("mock Haiku verdict='fail' (theatrical_overuse) → JudgeResult verdict='fail'", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"theatrical_overuse","confidence":0.85}',
      ),
    );
    const r = await invokeHaikuJudge("So excited! Yay! Great!", "host-to-guest", 4, 3);
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("theatrical_overuse");
    expect(r.confidence).toBe(0.85);
  });
});

describe("invokeHaikuJudge — confidence parsing", () => {
  test("low confidence (0.4) propagates", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"borderline_chipper","confidence":0.4}',
      ),
    );
    const r = await invokeHaikuJudge("Hi! Hi! Hi!", "host-to-guest", 4, 3);
    expect(r.confidence).toBe(0.4);
  });

  test("max confidence (1.0) propagates", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"clear_milestone","confidence":1.0}',
      ),
    );
    const r = await invokeHaikuJudge("Booking confirmed! Welcome!", "host-to-guest", 4, 3);
    expect(r.confidence).toBe(1.0);
  });
});

describe("invokeHaikuJudge — reason passthrough", () => {
  test("custom reason string round-trips", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"performative_emphasis","confidence":0.7}',
      ),
    );
    const r = await invokeHaikuJudge("Sure! Sure! Sure! Sure!", "host-to-guest", 4, 3);
    expect(r.reason).toBe("performative_emphasis");
  });
});

describe("invokeHaikuJudge — fence stripping", () => {
  test("JSON wrapped in ```json fences is unwrapped and parsed", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '```json\n{"verdict":"pass","reason":"genuine_milestone","confidence":0.8}\n```',
      ),
    );
    const r = await invokeHaikuJudge("Welcome! Enjoy! Cheers!", "host-to-guest", 4, 3);
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("genuine_milestone");
  });

  test("JSON wrapped in bare ``` fences is unwrapped and parsed", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '```\n{"verdict":"fail","reason":"theatrical_overuse","confidence":0.7}\n```',
      ),
    );
    const r = await invokeHaikuJudge("Yay! Yay! Yay! Yay!", "host-to-guest", 4, 3);
    expect(r.verdict).toBe("fail");
  });
});

describe("invokeHaikuJudge — conservative parse-error fallback", () => {
  test("malformed JSON → fail with judge_parse_error, confidence 0.5", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse('{"verdict": "pass", reason: missing_quotes}'),
    );
    const r = await invokeHaikuJudge("test text", "host-to-guest", 4, 3);
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("judge_parse_error");
    expect(r.confidence).toBe(0.5);
    expect(r.details).toMatchObject({ parse_error: true });
  });

  test("empty/non-JSON response → fail with judge_parse_error", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse("Sorry, I cannot classify this response."),
    );
    const r = await invokeHaikuJudge("test text", "host-to-guest", 4, 3);
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("judge_parse_error");
    expect(r.confidence).toBe(0.5);
  });
});

describe("invokeHaikuJudge — prompt construction", () => {
  test("system prompt + user message carry audience / count / cap / text into the call", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"genuine_milestone","confidence":0.9}',
      ),
    );
    await invokeHaikuJudge("Booked! Welcome!", "koast-to-host", 2, 1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const args = mockCreate.mock.calls[0][0];
    expect(args.model).toBe(EXCLAMATION_JUDGE_MODEL);
    expect(args.system).toBe(EXCLAMATION_JUDGE_SYSTEM_PROMPT);
    expect(args.messages).toHaveLength(1);
    const userContent = args.messages[0].content as string;
    expect(userContent).toContain("Audience: koast-to-host");
    expect(userContent).toContain("Cap: 1");
    expect(userContent).toContain("Count: 2");
    expect(userContent).toContain("Booked! Welcome!");
  });
});
