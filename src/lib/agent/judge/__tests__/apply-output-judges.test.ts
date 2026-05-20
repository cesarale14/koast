/**
 * apply-output-judges route-integration tests — M10 Phase B STEP 6.
 *
 * STEP 4 adjustment 1: closes the J1-applied-at-route coverage gap by
 * exercising the shared helper that all 4 host-to-guest routes call.
 * Helper-level assertions cover the contract that routes depend on
 * (filtered text + envelope.judge_results carrying emoji_policy entry).
 *
 * 5 tests; 678 → 683.
 */

import { applyOutputJudges } from "@/lib/agent/judge/apply-output-judges";
import type { AgentTextOutput } from "@/lib/agent/schemas/agent-text-output";

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

describe("applyOutputJudges — route-integration contract", () => {
  test("host-to-guest neutral: 2-emoji input strips beyond 1 and envelope carries judge_result", () => {
    const text = "Welcome 👋 enjoy 🌴";
    const env = baseEnvelope(text);
    const { finalText, envelope } = applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
    );
    expect(finalText).toBe("Welcome 👋 enjoy ");
    expect(envelope.judge_results).toHaveLength(1);
    const jr = envelope.judge_results![0];
    expect(jr.judge_id).toBe("emoji_policy");
    expect(jr.verdict).toBe("fail");
    expect(jr.reason).toBe("stripped_to_policy");
  });

  test("koast-to-host: zero-policy strips all emoji (helper supports audience even though /api/agent/turn deferred)", () => {
    const text = "Rate update 🔥 applied 🚀";
    const env = baseEnvelope(text);
    const { finalText, envelope } = applyOutputJudges(
      text,
      "koast-to-host",
      "neutral",
      env,
    );
    expect(finalText).toBe("Rate update  applied ");
    expect(envelope.judge_results![0].verdict).toBe("fail");
    expect(envelope.judge_results![0].reason).toBe("stripped_to_policy");
    expect(envelope.judge_results![0].details).toMatchObject({ policy: "zero" });
  });

  test("judge_results appends to existing envelope judge_results without overwriting", () => {
    const text = "Hi 👋 there";
    const priorJudge = {
      judge_id: "emoji_policy" as const,
      verdict: "pass" as const,
      reason: "prior_run",
      confidence: 1.0,
    };
    const env = baseEnvelope(text, { judge_results: [priorJudge] });
    const { envelope } = applyOutputJudges(text, "host-to-guest", "neutral", env);
    expect(envelope.judge_results).toHaveLength(2);
    expect(envelope.judge_results![0]).toEqual(priorJudge);
    expect(envelope.judge_results![1].judge_id).toBe("emoji_policy");
  });

  test("clean text (no emoji) passes through with verdict=pass and no_emoji_found", () => {
    const text = "Check-in is at 4pm.";
    const env = baseEnvelope(text);
    const { finalText, envelope } = applyOutputJudges(
      text,
      "host-to-guest",
      "neutral",
      env,
    );
    expect(finalText).toBe(text);
    expect(envelope.judge_results![0].verdict).toBe("pass");
    expect(envelope.judge_results![0].reason).toBe("no_emoji_found");
  });

  test("route-shape contract: helper returns finalText + envelope (other envelope fields preserved)", () => {
    const text = "Hello 👋";
    const env = baseEnvelope(text, {
      confidence: "high_inference",
      output_grounding: "sparse",
      hedge: "based on the last 30 days",
      source_attribution: [{ type: "memory_fact", id: "fact-1" }],
    });
    const result = applyOutputJudges(text, "host-to-guest", "learned", env);
    // Contract: every original envelope field round-trips; new judge_results appended.
    expect(result.envelope.confidence).toBe("high_inference");
    expect(result.envelope.output_grounding).toBe("sparse");
    expect(result.envelope.hedge).toBe("based on the last 30 days");
    expect(result.envelope.source_attribution).toEqual([
      { type: "memory_fact", id: "fact-1" },
    ]);
    expect(result.envelope.judge_results).toHaveLength(1);
    expect(typeof result.finalText).toBe("string");
  });
});
