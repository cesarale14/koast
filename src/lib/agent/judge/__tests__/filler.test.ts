/**
 * J3-iv-a filler judge — adversarial tests
 * M12 Phase D (deferred_5_7_filler runtime-active).
 *
 * Two-sided adversarial discipline per v2.8 §3.5.D [CANON] (D54):
 * 4 FALSE-PASS variants (judge MUST catch filler) + 3 FALSE-POSITIVE
 * angles (judge MUST NOT block legitimate emphasis/softening/
 * specification). Plus pre-filter / skip-condition tests, audience-scope
 * test, INFRASTRUCTURE-ERROR fail-open, and envelope-presence guard.
 *
 * Asymmetric-default discipline: §5.7 borderline cases default to PASS
 * per the operator-binding over-block aversion for authentic host voice.
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

import { judgeFiller } from "@/lib/agent/judge/filler";

function makeHaikuResponse(rawText: string) {
  return { content: [{ type: "text" as const, text: rawText }] };
}

beforeEach(() => {
  mockCreate.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

// ============================================================================
// FALSE-PASS SET (4 variants — judge MUST catch genuine filler)
// Each tests a different candidate word in a removable position.
// ============================================================================

describe("FALSE-PASS — judge MUST verdict='fail' on removable filler", () => {
  test("Variant 1 (really + removable): MUST catch", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"no_information_added","confidence":0.9}',
      ),
    );
    const r = await judgeFiller(
      "I'll really get back to you soon about that question.",
      "host-to-guest",
    );
    expect(r.judge_id).toBe("filler");
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("no_information_added");
    expect((r.details as Record<string, unknown>).detected_word).toMatch(/really/i);
  });

  test("Variant 2 (very + removable): MUST catch — word generalization", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"no_information_added","confidence":0.85}',
      ),
    );
    const r = await judgeFiller(
      "We're very excited about hosting you next week.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("fail");
    expect((r.details as Record<string, unknown>).detected_word).toMatch(/very/i);
  });

  test("Variant 3 (just + removable): MUST catch", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"no_information_added","confidence":0.82}',
      ),
    );
    const r = await judgeFiller(
      "I'll just send you the WiFi password in a separate message.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("fail");
    expect((r.details as Record<string, unknown>).detected_word).toMatch(/just/i);
  });

  test("Variant 4 (actually + removable): MUST catch", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"no_information_added","confidence":0.88}',
      ),
    );
    const r = await judgeFiller(
      "The check-in is actually at 4pm — see you then.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("fail");
    expect((r.details as Record<string, unknown>).detected_word).toMatch(/actually/i);
  });
});

// ============================================================================
// FALSE-POSITIVE SET (3 angles — judge MUST pass legitimate use)
// Tests the 3 legitimate roles: emphasis / softening / specification.
// Over-blocking these damages authentic host voice.
// ============================================================================

describe("FALSE-POSITIVE — judge MUST verdict='pass' on legitimate use", () => {
  test("Angle 1 — SOFTENING (just + politeness register): MUST pass", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"legitimate_softening","confidence":0.92}',
      ),
    );
    const r = await judgeFiller(
      "Just confirming the check-in time is 4pm today.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("legitimate_softening");
  });

  test("Angle 2 — EMPHASIS (really + sincerity intensification): MUST pass", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"legitimate_emphasis","confidence":0.88}',
      ),
    );
    const r = await judgeFiller(
      "Really sorry about the lockbox issue — fixed it now.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("legitimate_emphasis");
  });

  test("Angle 3 — SPECIFICATION (very + quantitative modification): MUST pass", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"legitimate_specification","confidence":0.85}',
      ),
    );
    const r = await judgeFiller(
      "Very early check-ins (before noon) are sometimes possible.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("legitimate_specification");
  });
});

// ============================================================================
// PRE-FILTER / SKIP-CONDITION tests
// ============================================================================

describe("filler — pre-filter / skip-condition behavior", () => {
  test("empty text: skip judge (no LLM call)", async () => {
    const r = await judgeFiller("", "host-to-guest");
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("skipped_short_text");
    expect((r.details as Record<string, unknown>).skipped).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("short text (under threshold): skip judge", async () => {
    const r = await judgeFiller("just yes", "host-to-guest");
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("skipped_short_text");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("audience='koast-to-host': skip judge (audience scope; Phase D host-to-guest only)", async () => {
    const r = await judgeFiller(
      "I'll really need to check the pricing rules before applying.",
      "koast-to-host",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("audience_out_of_scope");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("text length above threshold + no filler candidate: pre-filter skip", async () => {
    const r = await judgeFiller(
      "Hi Sarah, the check-in time is 4pm and the lockbox code is 4127.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("no_filler");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ============================================================================
// INFRASTRUCTURE-ERROR fail-open coverage (v2.8 §6.21 [LIVE] contract)
// ============================================================================

describe("filler — INFRASTRUCTURE-ERROR fail-open", () => {
  test("Haiku timeout → fail-open with infrastructure_error flag", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Request timed out"));
    const r = await judgeFiller(
      "I'll really get back to you soon about the request.",
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

describe("filler — ENVELOPE-PRESENCE substrate guard", () => {
  test("JudgeResult shape includes judge_id='filler' for envelope inclusion", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"no_information_added","confidence":0.9}',
      ),
    );
    const r = await judgeFiller(
      "I'll really get back to you about that question.",
      "host-to-guest",
    );
    expect(r.judge_id).toBe("filler");
    expect(r).toHaveProperty("verdict");
    expect(r).toHaveProperty("reason");
    expect(r).toHaveProperty("confidence");
  });
});
