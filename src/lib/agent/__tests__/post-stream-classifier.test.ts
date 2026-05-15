/**
 * Tests for post-stream-classifier — M9 Phase D substrate.
 *
 * Coverage:
 *   - classifyAccumulatedText: refusal short-circuit, completion-duplicate
 *     detection threshold, null for clean text
 *   - upgradeStopReasonRefusal: default hard_refusal, pattern-kind upgrade
 *     to soft_refusal when apology-prefix matches
 */

import {
  classifyAccumulatedText,
  upgradeStopReasonRefusal,
} from "../post-stream-classifier";

describe("classifyAccumulatedText — refusal path", () => {
  test("returns refusal result with substituted envelope on hard pattern match", () => {
    const result = classifyAccumulatedText("I can't help with that, sorry.");
    expect(result?.kind).toBe("refusal");
    if (result?.kind === "refusal") {
      expect(result.envelope.kind).toBe("hard_refusal");
      expect(result.pattern_id).toBe("cant_help_with_that");
      expect(result.matched_text.toLowerCase()).toContain("can");
      expect(result.envelope.reason.length).toBeGreaterThan(0);
    }
  });

  test("soft_refusal pattern produces soft_refusal envelope", () => {
    const result = classifyAccumulatedText(
      "I'm sorry, but I can't share that information.",
    );
    expect(result?.kind).toBe("refusal");
    if (result?.kind === "refusal") {
      expect(result.envelope.kind).toBe("soft_refusal");
      expect(result.envelope.override_available).toBe(true);
    }
  });

  test("short-circuits on first match (refusal beats completion check)", () => {
    const result = classifyAccumulatedText(
      "I can't help with that. I think I have enough to draft.",
    );
    expect(result?.kind).toBe("refusal");
  });
});

describe("classifyAccumulatedText — completion-duplicate path", () => {
  test("returns completion_duplicate when pattern matches ≥ 2 times", () => {
    const result = classifyAccumulatedText(
      "I have enough to start drafting. Anything else? I think I have enough to draft today.",
    );
    expect(result?.kind).toBe("completion_duplicate");
    if (result?.kind === "completion_duplicate") {
      expect(result.occurrences).toBeGreaterThanOrEqual(2);
      expect(result.pattern_id).toBe("enough_to_draft");
    }
  });

  test("single completion occurrence does NOT trigger duplicate", () => {
    const result = classifyAccumulatedText(
      "I think I have enough to start; what's first?",
    );
    expect(result).toBeNull();
  });

  test("aggregate completion patterns hitting twice triggers duplicate", () => {
    // One match on enough_to_draft + one match on take_something_off_your_plate
    // sums to 2 across the catalog → duplicate detected.
    const result = classifyAccumulatedText(
      "I think I have enough to start. Want me to take something off your plate?",
    );
    expect(result?.kind).toBe("completion_duplicate");
  });
});

describe("classifyAccumulatedText — null path", () => {
  test("clean assistant text returns null", () => {
    expect(
      classifyAccumulatedText(
        "Saturday's empty 8 days out — want me to drop the rate to $215?",
      ),
    ).toBeNull();
  });

  test("empty string returns null", () => {
    expect(classifyAccumulatedText("")).toBeNull();
  });
});

describe("upgradeStopReasonRefusal — G8-D3 closure", () => {
  test("default hard_refusal when no specific pattern matches", () => {
    const env = upgradeStopReasonRefusal("[refused-with-no-text-clue]");
    expect(env.kind).toBe("hard_refusal");
    expect(env.override_available).toBe(false);
  });

  test("upgrades to soft_refusal when apology pattern present", () => {
    const env = upgradeStopReasonRefusal(
      "I'm sorry, but I can't proceed with that.",
    );
    expect(env.kind).toBe("soft_refusal");
    expect(env.override_available).toBe(true);
  });

  test("hard pattern keeps hard_refusal", () => {
    const env = upgradeStopReasonRefusal("As an AI, I should decline.");
    expect(env.kind).toBe("hard_refusal");
  });
});
