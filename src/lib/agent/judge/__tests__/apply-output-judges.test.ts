/**
 * apply-output-judges route-integration tests.
 *
 * STEP 6 (5 tests): J1 orchestration + envelope contract; STEP 8 wraps
 *   judgeExclamationCap into the helper, so the STEP 6 assertions now
 *   verify J1's contribution while J2 is mocked to a deterministic pass
 *   (the default-pass mock keeps the J1-focused assertions clean).
 * STEP 8 (+3 tests): J1+J2 composition with explicit J2 mocking.
 *
 * Total: 8 tests.
 */

// Mock J2 hybrid before importing applyOutputJudges (which uses it).
jest.mock("@/lib/agent/judge/exclamation-cap", () => ({
  __esModule: true,
  judgeExclamationCap: jest.fn(),
}));

import { applyOutputJudges } from "@/lib/agent/judge/apply-output-judges";
import { judgeExclamationCap } from "@/lib/agent/judge/exclamation-cap";
import type { AgentTextOutput } from "@/lib/agent/schemas/agent-text-output";

const mockJudgeExclamationCap = judgeExclamationCap as jest.MockedFunction<
  typeof judgeExclamationCap
>;

const J2_PASS_DEFAULT = {
  judge_id: "exclamation_cap" as const,
  verdict: "pass" as const,
  reason: "count_under_cap",
  confidence: 1.0,
  details: { count: 0, cap: 3, audience: "host-to-guest" as const },
};

beforeEach(() => {
  // Default J2 mock = deterministic pass so STEP 6 J1-focused tests stay
  // green. Individual STEP 8 tests override per-test.
  mockJudgeExclamationCap.mockReset();
  mockJudgeExclamationCap.mockResolvedValue(J2_PASS_DEFAULT);
});

function baseEnvelope(
  content: string,
  overrides: Partial<AgentTextOutput> = {},
): AgentTextOutput {
  return {
    content,
    confidence: "confirmed",
    source_attribution: [],
    ...overrides,
  };
}

describe("applyOutputJudges — route-integration contract (STEP 6 J1)", () => {
  test("host-to-guest neutral: 2-emoji input strips beyond 1 and envelope carries J1 judge_result", async () => {
    const text = "Welcome 👋 enjoy 🌴";
    const env = baseEnvelope(text);
    const { finalText, envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
    );
    expect(finalText).toBe("Welcome 👋 enjoy ");
    // STEP 8: envelope now carries both J1 + J2 results.
    expect(envelope.judge_results).toHaveLength(2);
    const j1Result = envelope.judge_results!.find((r) => r.judge_id === "emoji_policy")!;
    expect(j1Result.verdict).toBe("fail");
    expect(j1Result.reason).toBe("stripped_to_policy");
  });

  test("koast-to-host: zero-policy strips all emoji (helper supports audience even though /api/agent/turn deferred)", async () => {
    const text = "Rate update 🔥 applied 🚀";
    const env = baseEnvelope(text);
    const { finalText, envelope } = await applyOutputJudges(
      text,
      "koast-to-host",
      "neutral",
      env,
    );
    expect(finalText).toBe("Rate update  applied ");
    const j1Result = envelope.judge_results!.find((r) => r.judge_id === "emoji_policy")!;
    expect(j1Result.verdict).toBe("fail");
    expect(j1Result.reason).toBe("stripped_to_policy");
    expect(j1Result.details).toMatchObject({ policy: "zero" });
  });

  test("judge_results appends to existing envelope judge_results without overwriting", async () => {
    const text = "Hi 👋 there";
    const priorJudge = {
      judge_id: "emoji_policy" as const,
      verdict: "pass" as const,
      reason: "prior_run",
      confidence: 1.0,
    };
    const env = baseEnvelope(text, { judge_results: [priorJudge] });
    const { envelope } = await applyOutputJudges(text, "host-to-guest", "neutral", env);
    // 1 prior + 1 new J1 + 1 J2 mock = 3
    expect(envelope.judge_results).toHaveLength(3);
    expect(envelope.judge_results![0]).toEqual(priorJudge);
  });

  test("clean text (no emoji) passes through with J1 verdict=pass and no_emoji_found", async () => {
    const text = "Check-in is at 4pm.";
    const env = baseEnvelope(text);
    const { finalText, envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
    );
    expect(finalText).toBe(text);
    const j1Result = envelope.judge_results!.find((r) => r.judge_id === "emoji_policy")!;
    expect(j1Result.verdict).toBe("pass");
    expect(j1Result.reason).toBe("no_emoji_found");
  });

  test("route-shape contract: helper returns finalText + envelope (other envelope fields preserved)", async () => {
    const text = "Hello 👋";
    const env = baseEnvelope(text, {
      confidence: "high_inference",
      output_grounding: "sparse",
      hedge: "based on the last 30 days",
      source_attribution: [{ type: "memory_fact", id: "fact-1" }],
    });
    const result = await applyOutputJudges(text, "host-to-guest", "learned", env);
    expect(result.envelope.confidence).toBe("high_inference");
    expect(result.envelope.output_grounding).toBe("sparse");
    expect(result.envelope.hedge).toBe("based on the last 30 days");
    expect(result.envelope.source_attribution).toEqual([
      { type: "memory_fact", id: "fact-1" },
    ]);
    // J1 (emoji_policy) + J2 (exclamation_cap mock) = 2 results.
    expect(result.envelope.judge_results).toHaveLength(2);
    expect(typeof result.finalText).toBe("string");
  });
});

describe("applyOutputJudges — STEP 8 J1+J2 composition", () => {
  test("host-to-guest: both J1 + J2 applied; envelope has 2 judge_results in order", async () => {
    const text = "Welcome! Coffee in kitchen!";
    const env = baseEnvelope(text);
    const { envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
    );
    expect(envelope.judge_results).toHaveLength(2);
    expect(envelope.judge_results![0].judge_id).toBe("emoji_policy");
    expect(envelope.judge_results![1].judge_id).toBe("exclamation_cap");
    expect(mockJudgeExclamationCap).toHaveBeenCalledTimes(1);
  });

  test("host-to-guest J2 fail (mocked) → annotate-only: text UNCHANGED from J1 filter; envelope flags fail (Q3)", async () => {
    mockJudgeExclamationCap.mockResolvedValueOnce({
      judge_id: "exclamation_cap",
      verdict: "fail",
      reason: "theatrical_overuse",
      confidence: 0.8,
      details: { count: 5, cap: 3, audience: "host-to-guest", judged: true },
    });
    const text = "Hi! Hi! Hi! Hi! Hi!";
    const env = baseEnvelope(text);
    const { finalText, envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
    );
    // Q3 annotate-only: text UNCHANGED by J2; J1 had no emoji to strip so
    // the text passes through unchanged.
    expect(finalText).toBe(text);
    const j2Result = envelope.judge_results!.find((r) => r.judge_id === "exclamation_cap")!;
    expect(j2Result.verdict).toBe("fail");
    expect(j2Result.reason).toBe("theatrical_overuse");
  });

  test("host-to-guest J2 pass (mocked rescue) → envelope flags pass; J1 filter still applied to text", async () => {
    mockJudgeExclamationCap.mockResolvedValueOnce({
      judge_id: "exclamation_cap",
      verdict: "pass",
      reason: "genuine_milestone",
      confidence: 0.95,
      details: { count: 4, cap: 3, audience: "host-to-guest", judged: true },
    });
    const text = "Booked 👋! Welcome! Cheers! Enjoy!";
    const env = baseEnvelope(text);
    const { finalText, envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
    );
    // J1 strips beyond 1 emoji (host-to-guest minimal); J2 mock receives
    // J1's filtered text. Final text reflects J1's filter.
    expect(finalText).toBe("Booked 👋! Welcome! Cheers! Enjoy!");
    const j2Result = envelope.judge_results!.find((r) => r.judge_id === "exclamation_cap")!;
    expect(j2Result.verdict).toBe("pass");
    expect(j2Result.reason).toBe("genuine_milestone");
    expect(mockJudgeExclamationCap).toHaveBeenCalledWith(
      // J2 sees the post-J1 text (no emoji to strip in this example since 1 emoji = within minimal allowance)
      "Booked 👋! Welcome! Cheers! Enjoy!",
      "host-to-guest",
    );
  });
});
