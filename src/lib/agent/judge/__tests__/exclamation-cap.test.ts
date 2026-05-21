/**
 * J2 exclamation-cap tests.
 *
 * STEP 7 covers count-prefilter (deterministic). STEP 8 adds hybrid
 * composition tests against the async judgeExclamationCap wrapper, with
 * invokeHaikuJudge mocked at the module boundary to verify count<=cap
 * skips the LLM call.
 *
 * STEP 7 ships 6 tests; STEP 8 adds 4 hybrid tests; total: 10.
 */

// Mock the LLM module BEFORE importing exclamation-cap.ts (which imports
// invokeHaikuJudge transitively).
jest.mock("@/lib/agent/judge/exclamation-cap-llm", () => ({
  __esModule: true,
  invokeHaikuJudge: jest.fn(),
}));

import {
  countExclamations,
  judgeExclamationCap,
  judgeExclamationCapDeterministic,
  MODE_CAPS,
} from "@/lib/agent/judge/exclamation-cap";
import { invokeHaikuJudge } from "@/lib/agent/judge/exclamation-cap-llm";

const mockInvokeHaikuJudge = invokeHaikuJudge as jest.MockedFunction<
  typeof invokeHaikuJudge
>;

describe("judgeExclamationCapDeterministic — boundary at cap", () => {
  test("host-to-guest 3 exclamations is exactly at cap → pass count_under_cap", () => {
    const text = "Welcome! Coffee in kitchen! Door code under the mat!";
    const r = judgeExclamationCapDeterministic(text, "host-to-guest");
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("count_under_cap");
    expect(r.details).toMatchObject({ count: 3, cap: 3, audience: "host-to-guest" });
  });

  test("host-to-guest 4 exclamations exceeds cap → fail pending semantic review", () => {
    const text = "Hi! Welcome! Door code 1234! Have a great stay!";
    const r = judgeExclamationCapDeterministic(text, "host-to-guest");
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("count_exceeds_cap_pending_semantic_review");
    expect(r.details).toMatchObject({ count: 4, cap: 3 });
    expect(r.confidence).toBe(1.0);
  });
});

describe("judgeExclamationCapDeterministic — koast-to-host cap 1", () => {
  test("count 1 at cap → pass count_under_cap", () => {
    const text = "Done — new pricing applied!";
    const r = judgeExclamationCapDeterministic(text, "koast-to-host");
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("count_under_cap");
    expect(r.details).toMatchObject({ count: 1, cap: 1 });
  });

  test("count 2 exceeds cap → fail pending semantic review", () => {
    const text = "Done! Pricing pushed!";
    const r = judgeExclamationCapDeterministic(text, "koast-to-host");
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("count_exceeds_cap_pending_semantic_review");
    expect(r.details).toMatchObject({ count: 2, cap: 1 });
  });
});

describe("countExclamations accuracy", () => {
  test("consecutive bangs, quoted bangs, and empty text all counted plainly", () => {
    expect(countExclamations("")).toBe(0);
    expect(countExclamations("no bang here.")).toBe(0);
    expect(countExclamations("Wait!!!")).toBe(3);
    expect(countExclamations('She said "wow!" and left.')).toBe(1);
    expect(countExclamations("a!b!c!")).toBe(3);
  });
});

describe("MODE_CAPS resolution", () => {
  test("MODE_CAPS exposes koast-to-host=1 and host-to-guest=3 (locked Phase B values per D34/J2-f + Q2)", () => {
    expect(MODE_CAPS["koast-to-host"]).toBe(1);
    expect(MODE_CAPS["host-to-guest"]).toBe(3);
  });
});

describe("judgeExclamationCap — STEP 8 async hybrid composition", () => {
  beforeEach(() => {
    mockInvokeHaikuJudge.mockReset();
  });

  test("count under cap → deterministic pass; Haiku mock NOT called (sync-fast path)", async () => {
    const r = await judgeExclamationCap("Welcome! Enjoy.", "host-to-guest");
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("count_under_cap");
    expect(r.confidence).toBe(1.0);
    expect(mockInvokeHaikuJudge).not.toHaveBeenCalled();
  });

  test("count exactly at cap → deterministic pass; Haiku NOT called (boundary)", async () => {
    const r = await judgeExclamationCap(
      "Welcome! Coffee! Door code in chat!",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("count_under_cap");
    expect(mockInvokeHaikuJudge).not.toHaveBeenCalled();
  });

  test("count over cap → Haiku invoked; verdict propagates from mock", async () => {
    mockInvokeHaikuJudge.mockResolvedValueOnce({
      judge_id: "exclamation_cap",
      verdict: "pass",
      reason: "genuine_milestone",
      confidence: 0.9,
      details: { count: 4, cap: 3, audience: "host-to-guest", judged: true },
    });
    const r = await judgeExclamationCap(
      "Yay! Welcome! Have fun! Cheers!",
      "host-to-guest",
    );
    expect(mockInvokeHaikuJudge).toHaveBeenCalledTimes(1);
    expect(mockInvokeHaikuJudge).toHaveBeenCalledWith(
      "Yay! Welcome! Have fun! Cheers!",
      "host-to-guest",
      4,
      3,
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("genuine_milestone");
    expect(r.confidence).toBe(0.9);
  });

  test("count over cap with Haiku fail-verdict propagates fail (text would be annotated by helper, not stripped)", async () => {
    mockInvokeHaikuJudge.mockResolvedValueOnce({
      judge_id: "exclamation_cap",
      verdict: "fail",
      reason: "theatrical_overuse",
      confidence: 0.8,
      details: { count: 5, cap: 3, audience: "host-to-guest", judged: true },
    });
    const r = await judgeExclamationCap(
      "Hi! Hi! Hi! Hi! Hi!",
      "host-to-guest",
    );
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("theatrical_overuse");
  });
});
