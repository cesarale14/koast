/**
 * J1 output-filter unit tests — M10 Phase B STEP 5.
 *
 * Coverage matrix per phase-b-ultraplan §7.1: audience × voiceMode ×
 * emoji-input permutations + boundary cases (ZWJ + skin-tone) +
 * stripped_count accuracy + §7.6 completeness meta-test.
 *
 * 12 behavior tests + 1 completeness meta-test = 13 new tests; 665 → 678.
 */

import { applyEmojiPolicy } from "@/lib/voice/output-filter";
import type { JudgeId } from "@/lib/agent/patterns/judge-types";

describe("applyEmojiPolicy — koast-to-host (zero policy)", () => {
  test("0 emoji → pass no_emoji_found; no stripping", () => {
    const r = applyEmojiPolicy("Hello host.", "koast-to-host", "neutral");
    expect(r.filtered_text).toBe("Hello host.");
    expect(r.stripped_count).toBe(0);
    expect(r.judge_result.verdict).toBe("pass");
    expect(r.judge_result.reason).toBe("no_emoji_found");
    expect(r.judge_result.judge_id).toBe("emoji_policy");
    expect(r.judge_result.confidence).toBe(1.0);
  });

  test("1 emoji → fail stripped_to_policy; emoji removed", () => {
    const r = applyEmojiPolicy("Done 👍", "koast-to-host", "neutral");
    expect(r.filtered_text).toBe("Done ");
    expect(r.stripped_count).toBe(1);
    expect(r.judge_result.verdict).toBe("fail");
    expect(r.judge_result.reason).toBe("stripped_to_policy");
  });

  test("multiple emoji → fail; all stripped", () => {
    const r = applyEmojiPolicy("🎉 launch 🚀 ship 🎯", "koast-to-host", "neutral");
    expect(r.filtered_text).toBe(" launch  ship ");
    expect(r.stripped_count).toBe(3);
    expect(r.judge_result.verdict).toBe("fail");
  });

  test("mid-text emoji → fail; non-emoji content preserved", () => {
    const r = applyEmojiPolicy(
      "The 🔥 rate update applied.",
      "koast-to-host",
      "learned", // koast-to-host policy is zero regardless of voiceMode
    );
    expect(r.filtered_text).toBe("The  rate update applied.");
    expect(r.stripped_count).toBe(1);
    expect(r.judge_result.verdict).toBe("fail");
  });
});

describe("applyEmojiPolicy — host-to-guest neutral (Mode 2 minimal policy)", () => {
  test("0 emoji → pass no_emoji_found", () => {
    const r = applyEmojiPolicy(
      "Check-in is at 4pm.",
      "host-to-guest",
      "neutral",
    );
    expect(r.stripped_count).toBe(0);
    expect(r.judge_result.verdict).toBe("pass");
    expect(r.judge_result.reason).toBe("no_emoji_found");
  });

  test("1 emoji → pass within_policy; emoji preserved", () => {
    const r = applyEmojiPolicy(
      "Welcome 👋 to the property.",
      "host-to-guest",
      "neutral",
    );
    expect(r.filtered_text).toBe("Welcome 👋 to the property.");
    expect(r.stripped_count).toBe(0);
    expect(r.judge_result.verdict).toBe("pass");
    expect(r.judge_result.reason).toBe("within_policy");
  });

  test("2 emoji → fail; first kept, second stripped", () => {
    const r = applyEmojiPolicy(
      "Welcome 👋 enjoy 🌴",
      "host-to-guest",
      "neutral",
    );
    expect(r.filtered_text).toBe("Welcome 👋 enjoy ");
    expect(r.stripped_count).toBe(1);
    expect(r.judge_result.verdict).toBe("fail");
    expect(r.judge_result.reason).toBe("stripped_to_policy");
  });
});

describe("applyEmojiPolicy — host-to-guest learned (Mode 1, Q1-c collapse)", () => {
  // Phase B Q1-c: Mode 1 collapses to Mode 2 minimal policy. These tests
  // document the parity; if Mode 1 ever diverges (post-v2.8 emoji_frequency
  // signal), these tests guard the collapse intent.

  test("1-emoji passes within_policy AND 2-emoji strips beyond 1 (parity with neutral at both)", () => {
    const one = applyEmojiPolicy(
      "Heading over now 👋",
      "host-to-guest",
      "learned",
    );
    expect(one.stripped_count).toBe(0);
    expect(one.judge_result.verdict).toBe("pass");
    expect(one.judge_result.reason).toBe("within_policy");

    const two = applyEmojiPolicy(
      "Coffee ☕ ready, towels 🛁 in closet",
      "host-to-guest",
      "learned",
    );
    expect(two.stripped_count).toBe(1);
    expect(two.judge_result.verdict).toBe("fail");
    expect(two.judge_result.reason).toBe("stripped_to_policy");
  });
});

describe("applyEmojiPolicy — boundary cases", () => {
  test("empty text → pass no_emoji_found", () => {
    const r = applyEmojiPolicy("", "koast-to-host", "neutral");
    expect(r.filtered_text).toBe("");
    expect(r.stripped_count).toBe(0);
    expect(r.judge_result.verdict).toBe("pass");
    expect(r.judge_result.reason).toBe("no_emoji_found");
  });

  test("text with only emoji — koast-to-host strips all; host-to-guest keeps first", () => {
    const koast = applyEmojiPolicy("😀😀😀", "koast-to-host", "neutral");
    expect(koast.filtered_text).toBe("");
    expect(koast.stripped_count).toBe(3);

    const guest = applyEmojiPolicy("😀😀😀", "host-to-guest", "neutral");
    expect(guest.filtered_text).toBe("😀");
    expect(guest.stripped_count).toBe(2);
  });

  test("multi-codepoint emoji (ZWJ + skin-tone) counted as single graphemes", () => {
    // 👨‍👩‍👧 is a ZWJ sequence (3 pictographic codepoints joined by ZWJ);
    // 👋🏼 is a skin-tone modifier sequence (2 pictographic codepoints).
    // Both are single visual graphemes via Intl.Segmenter and must be
    // counted as one emoji each — not 3 and 2 respectively.
    const zwj = applyEmojiPolicy("Family 👨‍👩‍👧 here", "koast-to-host", "neutral");
    expect(zwj.stripped_count).toBe(1);
    expect(zwj.filtered_text).toBe("Family  here");

    const tone = applyEmojiPolicy("Wave 👋🏼!", "koast-to-host", "neutral");
    expect(tone.stripped_count).toBe(1);
    expect(tone.filtered_text).toBe("Wave !");

    // host-to-guest minimal allowance: 1 ZWJ emoji passes within policy.
    const guestZwj = applyEmojiPolicy("Hi 👨‍👩‍👧", "host-to-guest", "neutral");
    expect(guestZwj.stripped_count).toBe(0);
    expect(guestZwj.judge_result.verdict).toBe("pass");
    expect(guestZwj.judge_result.reason).toBe("within_policy");
  });

  test("details record carries policy + counts", () => {
    const r = applyEmojiPolicy("🎉 🎉 🎉", "host-to-guest", "neutral");
    expect(r.judge_result.details).toEqual({
      policy: "minimal",
      stripped_count: 2,
      original_emoji_count: 3,
    });
  });
});

describe("§7.6 completeness meta-test", () => {
  // Compile-time exhaustive: Record<JudgeId, true> forces a key per
  // JudgeId union value. When STEP 7 adds 'exclamation_cap' to JudgeId,
  // tsc will fail this map until the new key + its fixture-set entry are
  // added in the same PR. That's the same-PR-fixture enforcement §6.10
  // codifies.
  const JUDGE_ID_FIXTURES_PRESENT: Record<JudgeId, true> = {
    emoji_policy: true,
  };

  test("every JudgeId enum value has ≥1 fixture in this suite", () => {
    const known = Object.keys(JUDGE_ID_FIXTURES_PRESENT) as JudgeId[];
    expect(known.length).toBeGreaterThan(0);
    for (const id of known) {
      expect(JUDGE_ID_FIXTURES_PRESENT[id]).toBe(true);
    }
  });
});
