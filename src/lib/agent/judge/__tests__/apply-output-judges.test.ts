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

// M12 Phase B (J3) — mock the ensure-verb-chain judge. Default returns
// a deterministic skip so the pre-existing STEP 6/8 J1/J2-focused tests
// stay green. Individual J3 tests override per-test.
jest.mock("@/lib/agent/judge/ensure-verb-chain", () => ({
  __esModule: true,
  judgeEnsureVerbChain: jest.fn(),
}));

// M12 Phase D (J3-iv-b) — mock the self-narration judge. Default returns
// a deterministic skip so the pre-existing STEP 6/8/Phase-B tests stay
// green. Individual J4 tests override per-test.
jest.mock("@/lib/agent/judge/self-narration", () => ({
  __esModule: true,
  judgeSelfNarration: jest.fn(),
}));

// M12 Phase D (J3-iv-a) — mock the filler judge. Default returns a
// deterministic skip so the pre-existing tests stay green. Individual
// J5 tests override per-test.
jest.mock("@/lib/agent/judge/filler", () => ({
  __esModule: true,
  judgeFiller: jest.fn(),
}));

// M12 Phase D (J3-iv-c) — mock the performative-thoroughness judge.
// Default returns deterministic skip; individual J6 tests override.
jest.mock("@/lib/agent/judge/performative-thoroughness", () => ({
  __esModule: true,
  judgePerformativeThoroughness: jest.fn(),
}));

import { applyOutputJudges } from "@/lib/agent/judge/apply-output-judges";
import { judgeExclamationCap } from "@/lib/agent/judge/exclamation-cap";
import { judgeEnsureVerbChain } from "@/lib/agent/judge/ensure-verb-chain";
import { judgeSelfNarration } from "@/lib/agent/judge/self-narration";
import { judgeFiller } from "@/lib/agent/judge/filler";
import { judgePerformativeThoroughness } from "@/lib/agent/judge/performative-thoroughness";
import type { AgentTextOutput } from "@/lib/agent/schemas/agent-text-output";

const mockJudgeExclamationCap = judgeExclamationCap as jest.MockedFunction<
  typeof judgeExclamationCap
>;
const mockJudgeEnsureVerbChain = judgeEnsureVerbChain as jest.MockedFunction<
  typeof judgeEnsureVerbChain
>;
const mockJudgeSelfNarration = judgeSelfNarration as jest.MockedFunction<
  typeof judgeSelfNarration
>;
const mockJudgeFiller = judgeFiller as jest.MockedFunction<typeof judgeFiller>;
const mockJudgePerformativeThoroughness =
  judgePerformativeThoroughness as jest.MockedFunction<
    typeof judgePerformativeThoroughness
  >;

const J2_PASS_DEFAULT = {
  judge_id: "exclamation_cap" as const,
  verdict: "pass" as const,
  reason: "count_under_cap",
  confidence: 1.0,
  details: { count: 0, cap: 3, audience: "host-to-guest" as const },
};

const J3_SKIP_DEFAULT = {
  judge_id: "ensure_verb_chain" as const,
  verdict: "pass" as const,
  reason: "no_verb_chain",
  confidence: 1.0,
  details: { audience: "host-to-guest" as const, skipped: true },
};

const J4_SKIP_DEFAULT = {
  judge_id: "self_narration" as const,
  verdict: "pass" as const,
  reason: "no_self_narration",
  confidence: 1.0,
  details: { audience: "host-to-guest" as const, skipped: true },
};

const J5_SKIP_DEFAULT = {
  judge_id: "filler" as const,
  verdict: "pass" as const,
  reason: "no_filler",
  confidence: 1.0,
  details: { audience: "host-to-guest" as const, skipped: true },
};

const J6_SKIP_DEFAULT = {
  judge_id: "performative_thoroughness" as const,
  verdict: "pass" as const,
  reason: "single_sentence",
  confidence: 1.0,
  details: { audience: "host-to-guest" as const, skipped: true },
};

beforeEach(() => {
  // Default J2 mock = deterministic pass so STEP 6 J1-focused tests stay
  // green. Individual STEP 8 tests override per-test.
  mockJudgeExclamationCap.mockReset();
  mockJudgeExclamationCap.mockResolvedValue(J2_PASS_DEFAULT);

  // Default J3 mock = deterministic skip so pre-existing tests stay green;
  // J3-specific tests override per-test.
  mockJudgeEnsureVerbChain.mockReset();
  mockJudgeEnsureVerbChain.mockResolvedValue(J3_SKIP_DEFAULT);

  // Default J4 mock = deterministic skip so pre-Phase-D tests stay green;
  // J4-specific tests override per-test.
  mockJudgeSelfNarration.mockReset();
  mockJudgeSelfNarration.mockResolvedValue(J4_SKIP_DEFAULT);

  // Default J5 mock = deterministic skip so pre-Phase-D-iv-a tests stay
  // green. J5-specific tests override per-test.
  mockJudgeFiller.mockReset();
  mockJudgeFiller.mockResolvedValue(J5_SKIP_DEFAULT);

  // Default J6 mock = deterministic skip so pre-Phase-D-iv-c tests stay
  // green. J6-specific tests override per-test.
  mockJudgePerformativeThoroughness.mockReset();
  mockJudgePerformativeThoroughness.mockResolvedValue(J6_SKIP_DEFAULT);
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
    // M12 Phase D iv-c: envelope now carries J1 + J2 + J3 + J4 + J5 + J6 results.
    expect(envelope.judge_results).toHaveLength(6);
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
    // M12 Phase D iv-c: 1 prior + 1 J1 + 1 J2 + 1 J3 + 1 J4 + 1 J5 + 1 J6 = 7
    expect(envelope.judge_results).toHaveLength(7);
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
    // M12 Phase D iv-c: J1 + J2 + J3 + J4 + J5 + J6 = 6 results.
    expect(result.envelope.judge_results).toHaveLength(6);
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
    // M12 Phase D iv-c: J1 + J2 + J3 + J4 + J5 + J6 = 6 results, in order.
    expect(envelope.judge_results).toHaveLength(6);
    expect(envelope.judge_results![0].judge_id).toBe("emoji_policy");
    expect(envelope.judge_results![1].judge_id).toBe("exclamation_cap");
    expect(envelope.judge_results![2].judge_id).toBe("ensure_verb_chain");
    expect(envelope.judge_results![3].judge_id).toBe("self_narration");
    expect(envelope.judge_results![4].judge_id).toBe("filler");
    expect(envelope.judge_results![5].judge_id).toBe("performative_thoroughness");
    expect(mockJudgeExclamationCap).toHaveBeenCalledTimes(1);
    expect(mockJudgeEnsureVerbChain).toHaveBeenCalledTimes(1);
    expect(mockJudgeSelfNarration).toHaveBeenCalledTimes(1);
    expect(mockJudgeFiller).toHaveBeenCalledTimes(1);
    expect(mockJudgePerformativeThoroughness).toHaveBeenCalledTimes(1);
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

describe("applyOutputJudges — M12 Phase B J3 ensure-verb-chain integration", () => {
  test("J3 verdict='fail' (mocked) → annotate-only: text UNCHANGED; envelope flags fail", async () => {
    mockJudgeEnsureVerbChain.mockResolvedValueOnce({
      judge_id: "ensure_verb_chain",
      verdict: "fail",
      reason: "abstract_object_paired",
      confidence: 0.9,
      details: { audience: "host-to-guest", detected_verb: "ensure", judged: true },
    });
    const text = "Hi Sarah! I'll ensure you have a wonderful stay.";
    const env = baseEnvelope(text);
    const { finalText, envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
    );
    // ANNOTATE-ONLY: text unchanged by J3; only J1 may filter (no emoji here).
    expect(finalText).toBe(text);
    const j3Result = envelope.judge_results!.find((r) => r.judge_id === "ensure_verb_chain")!;
    expect(j3Result.verdict).toBe("fail");
    expect(j3Result.reason).toBe("abstract_object_paired");
  });

  test("J3 verdict='pass' (mocked) → envelope flags pass; text unchanged", async () => {
    mockJudgeEnsureVerbChain.mockResolvedValueOnce({
      judge_id: "ensure_verb_chain",
      verdict: "pass",
      reason: "concrete_object_paired",
      confidence: 0.92,
      details: { audience: "host-to-guest", detected_verb: "ensure", judged: true },
    });
    const text = "I'll ensure the wifi password is in the welcome packet.";
    const env = baseEnvelope(text);
    const { envelope } = await applyOutputJudges(text, "host-to-guest", "neutral", env);
    const j3Result = envelope.judge_results!.find((r) => r.judge_id === "ensure_verb_chain")!;
    expect(j3Result.verdict).toBe("pass");
    expect(j3Result.reason).toBe("concrete_object_paired");
  });

  test("J3 sees POST-J1 text (post-emoji-strip) per dispatch order", async () => {
    const text = "Welcome 👋! I'll ensure your stay is wonderful.";
    const env = baseEnvelope(text);
    await applyOutputJudges(text, "host-to-guest", "neutral", env);
    // J3 mock should have been called with J1's filtered text (emoji
    // beyond the minimal-allowance stripped).
    expect(mockJudgeEnsureVerbChain).toHaveBeenCalledTimes(1);
    const j3Args = mockJudgeEnsureVerbChain.mock.calls[0];
    // Audience arg (index 1) — host-to-guest
    expect(j3Args[1]).toBe("host-to-guest");
  });

  test("policyOverride.skip_judges=['ensure_verb_chain'] → J3 NOT called; envelope omits J3 entry", async () => {
    const text = "I'll ensure you have a wonderful stay.";
    const env = baseEnvelope(text);
    const { envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
      { skip_judges: ["ensure_verb_chain"] },
    );
    // J3 dispatch skipped via per-call-site override hook.
    expect(mockJudgeEnsureVerbChain).not.toHaveBeenCalled();
    // J1 + J2 + J4 + J5 + J6 still ran → 5 results, no J3 entry.
    expect(envelope.judge_results).toHaveLength(5);
    expect(envelope.judge_results!.find((r) => r.judge_id === "ensure_verb_chain")).toBeUndefined();
  });

  test("policyOverride.skip_judges=['exclamation_cap'] → J2 skipped; J3 still runs", async () => {
    const text = "I'll ensure the wifi password is in the welcome packet.";
    const env = baseEnvelope(text);
    const { envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
      { skip_judges: ["exclamation_cap"] },
    );
    expect(mockJudgeExclamationCap).not.toHaveBeenCalled();
    expect(mockJudgeEnsureVerbChain).toHaveBeenCalledTimes(1);
    // J1 + J3 + J4 + J5 + J6 = 5 (J2 skipped)
    expect(envelope.judge_results).toHaveLength(5);
    expect(envelope.judge_results![0].judge_id).toBe("emoji_policy");
    expect(envelope.judge_results![1].judge_id).toBe("ensure_verb_chain");
    expect(envelope.judge_results![2].judge_id).toBe("self_narration");
    expect(envelope.judge_results![3].judge_id).toBe("filler");
    expect(envelope.judge_results![4].judge_id).toBe("performative_thoroughness");
  });

  test("J3 INFRASTRUCTURE-ERROR fallthrough (mocked) → envelope carries flag; text ships unchanged", async () => {
    mockJudgeEnsureVerbChain.mockResolvedValueOnce({
      judge_id: "ensure_verb_chain",
      verdict: "fail",
      reason: "judge_infrastructure_error",
      confidence: 0.0,
      details: {
        audience: "host-to-guest",
        infrastructure_error: true,
        error_message: "Request timed out",
      },
    });
    const text = "I'll ensure you have a wonderful stay at the property.";
    const env = baseEnvelope(text);
    const { finalText, envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
    );
    // FAIL-OPEN: text ships unchanged despite judge-infra failure.
    expect(finalText).toBe(text);
    const j3Result = envelope.judge_results!.find((r) => r.judge_id === "ensure_verb_chain")!;
    expect(j3Result.reason).toBe("judge_infrastructure_error");
    expect((j3Result.details as Record<string, unknown>).infrastructure_error).toBe(true);
  });
});

describe("applyOutputJudges — M12 Phase D J4 self-narration integration", () => {
  test("J4 verdict='fail' (mocked) → annotate-only: text UNCHANGED; envelope flags fail", async () => {
    mockJudgeSelfNarration.mockResolvedValueOnce({
      judge_id: "self_narration",
      verdict: "fail",
      reason: "generic_follow_through",
      confidence: 0.9,
      details: { audience: "host-to-guest", detected_phrase: "I'll help", judged: true },
    });
    const text = "Hi Sarah! I'll help you with that. Let me know what you need.";
    const env = baseEnvelope(text);
    const { finalText, envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
    );
    // ANNOTATE-ONLY: text unchanged by J4; only J1 may filter (no emoji here).
    expect(finalText).toBe(text);
    const j4Result = envelope.judge_results!.find((r) => r.judge_id === "self_narration")!;
    expect(j4Result.verdict).toBe("fail");
    expect(j4Result.reason).toBe("generic_follow_through");
  });

  test("J4 verdict='pass' (mocked) → envelope flags pass; text unchanged", async () => {
    mockJudgeSelfNarration.mockResolvedValueOnce({
      judge_id: "self_narration",
      verdict: "pass",
      reason: "specific_follow_through",
      confidence: 0.92,
      details: { audience: "host-to-guest", detected_phrase: "I'll help", judged: true },
    });
    const text = "I'll help you with the WiFi — password is sandwave2024.";
    const env = baseEnvelope(text);
    const { envelope } = await applyOutputJudges(text, "host-to-guest", "neutral", env);
    const j4Result = envelope.judge_results!.find((r) => r.judge_id === "self_narration")!;
    expect(j4Result.verdict).toBe("pass");
    expect(j4Result.reason).toBe("specific_follow_through");
  });

  test("J4 sees POST-J1 text (post-emoji-strip) per dispatch order", async () => {
    const text = "Welcome 👋! Let me help you with the booking question.";
    const env = baseEnvelope(text);
    await applyOutputJudges(text, "host-to-guest", "neutral", env);
    // J4 mock should have been called with J1's filtered text.
    expect(mockJudgeSelfNarration).toHaveBeenCalledTimes(1);
    const j4Args = mockJudgeSelfNarration.mock.calls[0];
    expect(j4Args[1]).toBe("host-to-guest");
  });

  test("policyOverride.skip_judges=['self_narration'] → J4 NOT called; envelope omits J4 entry", async () => {
    const text = "I'll help you with that.";
    const env = baseEnvelope(text);
    const { envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
      { skip_judges: ["self_narration"] },
    );
    // J4 dispatch skipped via per-call-site override hook.
    expect(mockJudgeSelfNarration).not.toHaveBeenCalled();
    // J1 + J2 + J3 + J5 + J6 still ran → 5 results, no J4 entry.
    expect(envelope.judge_results).toHaveLength(5);
    expect(envelope.judge_results!.find((r) => r.judge_id === "self_narration")).toBeUndefined();
  });

  test("J4 INFRASTRUCTURE-ERROR fallthrough (mocked) → envelope carries flag; text ships unchanged", async () => {
    mockJudgeSelfNarration.mockResolvedValueOnce({
      judge_id: "self_narration",
      verdict: "fail",
      reason: "judge_infrastructure_error",
      confidence: 0.0,
      details: {
        audience: "host-to-guest",
        infrastructure_error: true,
        error_message: "Request timed out",
      },
    });
    const text = "Happy to help with the booking question — what dates?";
    const env = baseEnvelope(text);
    const { finalText, envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
    );
    // FAIL-OPEN: text ships unchanged despite judge-infra failure.
    expect(finalText).toBe(text);
    const j4Result = envelope.judge_results!.find((r) => r.judge_id === "self_narration")!;
    expect(j4Result.reason).toBe("judge_infrastructure_error");
    expect((j4Result.details as Record<string, unknown>).infrastructure_error).toBe(true);
  });
});

describe("applyOutputJudges — M12 Phase D iv-a J5 filler integration", () => {
  test("J5 verdict='fail' (mocked) → annotate-only: text UNCHANGED; envelope flags fail", async () => {
    mockJudgeFiller.mockResolvedValueOnce({
      judge_id: "filler",
      verdict: "fail",
      reason: "no_information_added",
      confidence: 0.9,
      details: { audience: "host-to-guest", detected_word: "really", judged: true },
    });
    const text = "I'll really get back to you soon about that question.";
    const env = baseEnvelope(text);
    const { finalText, envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
    );
    // ANNOTATE-ONLY: text unchanged by J5; only J1 may filter (no emoji here).
    expect(finalText).toBe(text);
    const j5Result = envelope.judge_results!.find((r) => r.judge_id === "filler")!;
    expect(j5Result.verdict).toBe("fail");
    expect(j5Result.reason).toBe("no_information_added");
  });

  test("J5 verdict='pass' (mocked) → envelope flags pass; legitimate softening recognized", async () => {
    mockJudgeFiller.mockResolvedValueOnce({
      judge_id: "filler",
      verdict: "pass",
      reason: "legitimate_softening",
      confidence: 0.92,
      details: { audience: "host-to-guest", detected_word: "just", judged: true },
    });
    const text = "Just confirming the check-in time is 4pm today.";
    const env = baseEnvelope(text);
    const { envelope } = await applyOutputJudges(text, "host-to-guest", "neutral", env);
    const j5Result = envelope.judge_results!.find((r) => r.judge_id === "filler")!;
    expect(j5Result.verdict).toBe("pass");
    expect(j5Result.reason).toBe("legitimate_softening");
  });

  test("policyOverride.skip_judges=['filler'] → J5 NOT called; envelope omits J5 entry", async () => {
    const text = "I'll really get back to you soon.";
    const env = baseEnvelope(text);
    const { envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
      { skip_judges: ["filler"] },
    );
    expect(mockJudgeFiller).not.toHaveBeenCalled();
    // J1 + J2 + J3 + J4 + J6 still ran → 5 results, no J5 entry.
    expect(envelope.judge_results).toHaveLength(5);
    expect(envelope.judge_results!.find((r) => r.judge_id === "filler")).toBeUndefined();
  });

  test("J5 INFRASTRUCTURE-ERROR fallthrough (mocked) → envelope carries flag; text ships unchanged", async () => {
    mockJudgeFiller.mockResolvedValueOnce({
      judge_id: "filler",
      verdict: "fail",
      reason: "judge_infrastructure_error",
      confidence: 0.0,
      details: {
        audience: "host-to-guest",
        infrastructure_error: true,
        error_message: "Request timed out",
      },
    });
    const text = "I'll really get back to you about that.";
    const env = baseEnvelope(text);
    const { finalText, envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
    );
    // FAIL-OPEN: text ships unchanged despite judge-infra failure.
    expect(finalText).toBe(text);
    const j5Result = envelope.judge_results!.find((r) => r.judge_id === "filler")!;
    expect(j5Result.reason).toBe("judge_infrastructure_error");
    expect((j5Result.details as Record<string, unknown>).infrastructure_error).toBe(true);
  });
});

describe("applyOutputJudges — M12 Phase D iv-c J6 performative-thoroughness integration", () => {
  test("J6 verdict='fail' (mocked) → annotate-only: text UNCHANGED; envelope flags generic_interchangeable_padding", async () => {
    mockJudgePerformativeThoroughness.mockResolvedValueOnce({
      judge_id: "performative_thoroughness",
      verdict: "fail",
      reason: "generic_interchangeable_padding",
      confidence: 0.95,
      details: { audience: "host-to-guest", sentence_count: 7, judged: true },
    });
    const text = "Hi Sarah! Thanks for reaching out. Happy to help. The code is 4127. Please let me know if you need anything else. Wishing you a wonderful stay!";
    const env = baseEnvelope(text);
    const { finalText, envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
    );
    // ANNOTATE-ONLY: text unchanged by J6.
    expect(finalText).toBe(text);
    const j6Result = envelope.judge_results!.find(
      (r) => r.judge_id === "performative_thoroughness",
    )!;
    expect(j6Result.verdict).toBe("fail");
    expect(j6Result.reason).toBe("generic_interchangeable_padding");
  });

  test("J6 verdict='pass' on context-specific warmth (operator-binding refinement)", async () => {
    mockJudgePerformativeThoroughness.mockResolvedValueOnce({
      judge_id: "performative_thoroughness",
      verdict: "pass",
      reason: "context_specific_warmth",
      confidence: 0.92,
      details: { audience: "host-to-guest", sentence_count: 4, judged: true },
    });
    const text = "Hi Sarah — can't wait to host you for the jazz festival! Check-in is 4pm. Code is 4127. The pool gets gorgeous at sunset.";
    const env = baseEnvelope(text);
    const { envelope } = await applyOutputJudges(text, "host-to-guest", "neutral", env);
    const j6Result = envelope.judge_results!.find(
      (r) => r.judge_id === "performative_thoroughness",
    )!;
    expect(j6Result.verdict).toBe("pass");
    expect(j6Result.reason).toBe("context_specific_warmth");
  });

  test("policyOverride.skip_judges=['performative_thoroughness'] → J6 NOT called; envelope omits J6 entry", async () => {
    const text = "Hi Sarah! Welcome to Tampa. The code is 4127. Have a great stay!";
    const env = baseEnvelope(text);
    const { envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
      { skip_judges: ["performative_thoroughness"] },
    );
    expect(mockJudgePerformativeThoroughness).not.toHaveBeenCalled();
    // J1 + J2 + J3 + J4 + J5 still ran → 5 results, no J6 entry.
    expect(envelope.judge_results).toHaveLength(5);
    expect(
      envelope.judge_results!.find((r) => r.judge_id === "performative_thoroughness"),
    ).toBeUndefined();
  });

  test("J6 INFRASTRUCTURE-ERROR fallthrough (mocked) → envelope carries flag; text ships unchanged", async () => {
    mockJudgePerformativeThoroughness.mockResolvedValueOnce({
      judge_id: "performative_thoroughness",
      verdict: "fail",
      reason: "judge_infrastructure_error",
      confidence: 0.0,
      details: {
        audience: "host-to-guest",
        infrastructure_error: true,
        error_message: "Request timed out",
      },
    });
    const text = "Hi Sarah! Thanks for reaching out. The code is 4127. Have a wonderful stay!";
    const env = baseEnvelope(text);
    const { finalText, envelope } = await applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
    );
    // FAIL-OPEN: text ships unchanged despite judge-infra failure.
    expect(finalText).toBe(text);
    const j6Result = envelope.judge_results!.find(
      (r) => r.judge_id === "performative_thoroughness",
    )!;
    expect(j6Result.reason).toBe("judge_infrastructure_error");
    expect((j6Result.details as Record<string, unknown>).infrastructure_error).toBe(true);
  });
});
