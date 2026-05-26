/**
 * J3-iv-c performative-thoroughness judge — adversarial tests
 * M12 Phase D (deferred_5_9_performative_thoroughness runtime-active).
 *
 * REFINED ADVERSARIAL DISCIPLINE per operator msg 3475: this judge ships
 * with 4 FP × 6 FPos (3 multi-info + 3 context-specific warmth) — the
 * FPos side is LOADED with the high-risk class because operator-binding
 * asymmetric cost says over-block of authentic warmth is the WORST
 * failure mode for THIS judge specifically.
 *
 * Discriminator: GENERIC INTERCHANGEABLE vs CONTEXT-SPECIFIC. NOT
 * "informational vs not". Authentic relational warmth (named guest /
 * property / occasion / situation) is CONTEXT-SPECIFIC and PASSES even
 * though non-informational.
 *
 * The judge is mocked at the @anthropic-ai/sdk module boundary; tests
 * verify the dispatch + verdict propagation deterministically.
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

import { judgePerformativeThoroughness } from "@/lib/agent/judge/performative-thoroughness";

function makeHaikuResponse(rawText: string) {
  return { content: [{ type: "text" as const, text: rawText }] };
}

beforeEach(() => {
  mockCreate.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

// ============================================================================
// FALSE-PASS SET (4 variants — judge MUST catch generic-interchangeable padding)
// Each tests a different canonical generic-interchangeable phrase pattern.
// ============================================================================

describe("FALSE-PASS — judge MUST verdict='fail' on generic-interchangeable padding", () => {
  test("Variant 1 (thanks-for-reaching-out + appreciate-your-question + let-me-help + wonderful-stay)", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"generic_interchangeable_padding","confidence":0.95}',
      ),
    );
    const r = await judgePerformativeThoroughness(
      "Hi Sarah! Thanks so much for reaching out. I really appreciate your question about the WiFi. Let me help you with that. The WiFi name is BeachHouse-2G and the password is sandwave2024. Please let me know if you need anything else. Have a wonderful stay!",
      "host-to-guest",
    );
    expect(r.judge_id).toBe("performative_thoroughness");
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("generic_interchangeable_padding");
  });

  test("Variant 2 (happy-to-help + dont-hesitate-to-reach-out)", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"generic_interchangeable_padding","confidence":0.88}',
      ),
    );
    const r = await judgePerformativeThoroughness(
      "Happy to help! Pool opens 8am, towels in the cabana. Don't hesitate to reach out if you need anything else!",
      "host-to-guest",
    );
    expect(r.verdict).toBe("fail");
  });

  test("Variant 3 (we-are-so-excited + cant-wait-to-have-you + wishing-wonderful-stay)", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"generic_interchangeable_padding","confidence":0.9}',
      ),
    );
    const r = await judgePerformativeThoroughness(
      "We're so excited to have you! Can't wait to have you stay at our place. Check-in is 4pm. Wishing you a wonderful stay!",
      "host-to-guest",
    );
    expect(r.verdict).toBe("fail");
  });

  test("Variant 4 (please-let-me-know-anything + thanks-for-choosing + welcome-aboard)", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"generic_interchangeable_padding","confidence":0.85}',
      ),
    );
    const r = await judgePerformativeThoroughness(
      "Welcome aboard! Thanks so much for choosing us. The lockbox code is 4127. Please let me know if you need anything at all during your stay. Looking forward to having you!",
      "host-to-guest",
    );
    expect(r.verdict).toBe("fail");
  });
});

// ============================================================================
// FALSE-POSITIVE SET — 3 angles of MULTI-INFO + 3 angles of CONTEXT-SPECIFIC
// WARMTH (operator msg 3475 refinement; warmth side is the high-risk class).
// A judge that over-blocks authentic warmth homogenizes host voice.
// ============================================================================

describe("FALSE-POSITIVE multi-info — judge MUST verdict='pass' on multi-info content", () => {
  test("Angle 1 — multi-instruction check-in info: MUST pass", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"informational_content","confidence":0.92}',
      ),
    );
    const r = await judgePerformativeThoroughness(
      "Check-in is 4pm. The lockbox code is 4127. WiFi name is BeachHouse-2G, password sandwave2024. Park in the driveway, not the street. Towels are in the linen closet.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("informational_content");
  });

  test("Angle 2 — multi-question response: MUST pass (greeting + multi-info)", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"informational_content","confidence":0.88}',
      ),
    );
    const r = await judgePerformativeThoroughness(
      "Hi Sarah — yes, late check-in works (text me 30 min out). The pool heats up by 3pm. There's a Publix 2 miles north on Dale Mabry.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
  });

  test("Angle 3 — multi-issue resolution (apology + action + remediation): MUST pass", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"informational_content","confidence":0.9}',
      ),
    );
    const r = await judgePerformativeThoroughness(
      "Sorry about the AC failing today. The technician arrives at 2pm. I've credited your account $50 for the inconvenience and adjusted your check-out to 1pm tomorrow.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
  });
});

// ============================================================================
// FALSE-POSITIVE WARMTH — CONTEXT-SPECIFIC AUTHENTIC RELATIONAL WARMTH
// (operator msg 3475 binding refinement; this is the previously-missing class).
// Tests the discriminator: would this sentence be IDENTICAL in a message to a
// different guest about a different property?
// ============================================================================

describe("FALSE-POSITIVE warmth — judge MUST verdict='pass' on context-specific warmth", () => {
  test("Angle 1 — named-occasion warmth (jazz festival): MUST pass", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"context_specific_warmth","confidence":0.92}',
      ),
    );
    const r = await judgePerformativeThoroughness(
      "Hi Sarah — can't wait to host you for the jazz festival! Check-in is 4pm. Code is 4127. The pool gets gorgeous at sunset.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("context_specific_warmth");
  });

  test("Angle 2 — named-guest-recurring warmth (Welcome back): MUST pass", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"context_specific_warmth","confidence":0.9}',
      ),
    );
    const r = await judgePerformativeThoroughness(
      "Welcome back, Marcus! Lockbox is 4127. The neighborhood coffee shop you liked last time just opened a Sunday brunch.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
  });

  test("Angle 3 — location/season-specific commentary: MUST pass", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"context_specific_warmth","confidence":0.88}',
      ),
    );
    const r = await judgePerformativeThoroughness(
      "Tampa in November is the best — you picked a great week. Check-in is 4pm. Forecast looks gorgeous, low 80s every day.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
  });
});

// ============================================================================
// PRE-FILTER / SKIP-CONDITION tests
// ============================================================================

describe("performative-thoroughness — pre-filter / skip-condition behavior", () => {
  test("empty text: skip judge (no LLM call)", async () => {
    const r = await judgePerformativeThoroughness("", "host-to-guest");
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("skipped_short_text");
    expect((r.details as Record<string, unknown>).skipped).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("short text (under threshold): skip judge", async () => {
    const r = await judgePerformativeThoroughness(
      "Code is 4127.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("skipped_short_text");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("single-sentence response: PASS skip (nothing to flag)", async () => {
    const r = await judgePerformativeThoroughness(
      "Check-in is 4pm and the lockbox code is 4127 on the front door.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("single_sentence");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("audience='koast-to-host': skip judge (audience scope; Phase D host-to-guest only)", async () => {
    const r = await judgePerformativeThoroughness(
      "Here's the pricing recommendation summary. Confidence is high based on the comp set. Let me know if you want details.",
      "koast-to-host",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("audience_out_of_scope");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ============================================================================
// INFRASTRUCTURE-ERROR fail-open coverage (v2.8 §6.21 [LIVE] contract)
// ============================================================================

describe("performative-thoroughness — INFRASTRUCTURE-ERROR fail-open", () => {
  test("Haiku timeout → fail-open with infrastructure_error flag", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Request timed out"));
    const r = await judgePerformativeThoroughness(
      "Hi Sarah! Thanks for the message. The WiFi password is sandwave2024. Have a wonderful stay!",
      "host-to-guest",
    );
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("judge_infrastructure_error");
    expect((r.details as Record<string, unknown>).infrastructure_error).toBe(true);
  });
});

// ============================================================================
// ENVELOPE-PRESENCE substrate guard
// ============================================================================

describe("performative-thoroughness — ENVELOPE-PRESENCE substrate guard", () => {
  test("JudgeResult shape includes judge_id='performative_thoroughness' for envelope inclusion", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"generic_interchangeable_padding","confidence":0.9}',
      ),
    );
    const r = await judgePerformativeThoroughness(
      "Happy to help! The code is 4127. Don't hesitate to reach out if you need anything.",
      "host-to-guest",
    );
    expect(r.judge_id).toBe("performative_thoroughness");
    expect(r).toHaveProperty("verdict");
    expect(r).toHaveProperty("reason");
    expect(r).toHaveProperty("confidence");
  });
});
