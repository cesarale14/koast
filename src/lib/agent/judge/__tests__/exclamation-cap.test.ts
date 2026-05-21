/**
 * J2 exclamation-cap deterministic-only tests — M10 Phase B STEP 7.
 *
 * STEP 7 covers count-prefilter logic. STEP 8 adds mocked-LLM tests for
 * the Haiku semantic rescue path in this same file (extends test count).
 *
 * 6 tests; 683 → 689.
 */

import {
  countExclamations,
  judgeExclamationCapDeterministic,
  MODE_CAPS,
} from "@/lib/agent/judge/exclamation-cap";

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
