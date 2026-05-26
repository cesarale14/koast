/**
 * J3-iv-b self-narration judge — adversarial tests
 * M12 Phase D (deferred_5_8_self_narration runtime-active).
 *
 * Two-sided adversarial discipline per v2.8 §3.5.D [CANON] (D54):
 * 4 FALSE-PASS variants (judge MUST catch generic follow-through) +
 * 3 FALSE-POSITIVE angles (judge MUST NOT block specific follow-through).
 * Plus pre-filter / skip-condition tests and audience-scope test.
 *
 * The judge is mocked at the @anthropic-ai/sdk module boundary; tests
 * verify the dispatch + verdict propagation deterministically. Real
 * Haiku integration coverage stays in *.integration.test.ts (env-gated;
 * NOT in this suite).
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

import { judgeSelfNarration } from "@/lib/agent/judge/self-narration";

function makeHaikuResponse(rawText: string) {
  return { content: [{ type: "text" as const, text: rawText }] };
}

beforeEach(() => {
  mockCreate.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

// ============================================================================
// FALSE-PASS SET (load-bearing safety side — 4 variants per §3.5.D CANON)
// A judge that misses the anti-pattern fails the WORK of guest-safety.
// Multi-flavor coverage tests judge generalization across the 4 canonical
// self-narration verb chains.
// ============================================================================

describe("FALSE-PASS — judge MUST verdict='fail' on generic follow-through", () => {
  test("Variant 1 (I'll help + generic): MUST catch", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"generic_follow_through","confidence":0.9}',
      ),
    );
    const r = await judgeSelfNarration(
      "Hi Sarah! I'll help you with that. Let me know what you need.",
      "host-to-guest",
    );
    expect(r.judge_id).toBe("self_narration");
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("generic_follow_through");
    expect((r.details as Record<string, unknown>).detected_phrase).toMatch(/I'll help/i);
  });

  test("Variant 2 (Let me help + generic): MUST catch — phrase generalization", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"generic_follow_through","confidence":0.85}',
      ),
    );
    const r = await judgeSelfNarration(
      "Welcome! Let me help you with anything you need during your stay.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("fail");
    expect((r.details as Record<string, unknown>).detected_phrase).toMatch(/Let me help/i);
  });

  test("Variant 3 (I'm here to help + generic): MUST catch", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"generic_follow_through","confidence":0.88}',
      ),
    );
    const r = await judgeSelfNarration(
      "Looking forward to having you. I'm here to help with anything that comes up.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("fail");
    expect((r.details as Record<string, unknown>).detected_phrase).toMatch(/I'm here to help/i);
  });

  test("Variant 4 (Happy to help + no follow-through): MUST catch", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"generic_follow_through","confidence":0.82}',
      ),
    );
    const r = await judgeSelfNarration(
      "Thanks for the message. Happy to help! Reach out if you need anything.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("fail");
    expect((r.details as Record<string, unknown>).detected_phrase).toMatch(/Happy to help/i);
  });
});

// ============================================================================
// FALSE-POSITIVE SET — judge MUST verdict='pass' on specific follow-through
// (3 angles): WiFi/info-answer / scheduled-action / questioning-back.
// A judge that blocks every self-narration phrase over-blocks legitimate use.
// ============================================================================

describe("FALSE-POSITIVE — judge MUST verdict='pass' on specific follow-through", () => {
  test("Angle 1 — I'll help + named information answer: MUST pass", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"specific_follow_through","confidence":0.92}',
      ),
    );
    const r = await judgeSelfNarration(
      "I'll help you with the WiFi — the network name is BeachHouse-2G, password sandwave2024.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("specific_follow_through");
  });

  test("Angle 2 — Let me help + scheduled action with time: MUST pass", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"specific_follow_through","confidence":0.88}',
      ),
    );
    const r = await judgeSelfNarration(
      "Let me help with the early check-in — yes, 2pm works. I'll have the cleaner finish by 1:30.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
  });

  test("Angle 3 — Happy to help + questioning-back for specificity: MUST pass", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"specific_follow_through","confidence":0.85}',
      ),
    );
    const r = await judgeSelfNarration(
      "Happy to help with the booking — which dates were you considering and how many guests?",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
  });
});

// ============================================================================
// PRE-FILTER / SKIP-CONDITION tests
// ============================================================================

describe("self-narration — pre-filter / skip-condition behavior", () => {
  test("empty text: skip judge (no LLM call)", async () => {
    const r = await judgeSelfNarration("", "host-to-guest");
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("skipped_short_text");
    expect((r.details as Record<string, unknown>).skipped).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("short text (under threshold): skip judge", async () => {
    const r = await judgeSelfNarration("I'll help.", "host-to-guest");
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("skipped_short_text");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("audience='koast-to-host': skip judge (audience scope; Phase D host-to-guest only)", async () => {
    const r = await judgeSelfNarration(
      "I'll help you draft a response to the late-checkout request.",
      "koast-to-host",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("audience_out_of_scope");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("text length above threshold + no self-narration phrase: pre-filter skip", async () => {
    const r = await judgeSelfNarration(
      "Hi Sarah, looking forward to having you stay at our place this weekend.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("no_self_narration");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ============================================================================
// INFRASTRUCTURE-ERROR fail-open coverage (v2.8 §6.21 [LIVE] contract)
// ============================================================================

describe("self-narration — INFRASTRUCTURE-ERROR fail-open", () => {
  test("Haiku timeout → fail-open with infrastructure_error flag", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Request timed out"));
    const r = await judgeSelfNarration(
      "I'll help you with the WiFi question — password is sandwave2024.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("judge_infrastructure_error");
    expect((r.details as Record<string, unknown>).infrastructure_error).toBe(true);
  });
});

// ============================================================================
// ENVELOPE-PRESENCE substrate guard (Phase D iii-vi rollout per Phase B Q11)
// ============================================================================

describe("self-narration — ENVELOPE-PRESENCE substrate guard", () => {
  test("JudgeResult shape includes judge_id='self_narration' for envelope inclusion", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"generic_follow_through","confidence":0.9}',
      ),
    );
    const r = await judgeSelfNarration(
      "I'll help you with that. Let me know if you need anything else.",
      "host-to-guest",
    );
    // The result must carry judge_id so envelope.judge_results can store
    // it AND PendingDraftBubble.tsx:60 generic dispatch can find it via
    // verdict==='fail' iteration.
    expect(r.judge_id).toBe("self_narration");
    expect(r).toHaveProperty("verdict");
    expect(r).toHaveProperty("reason");
    expect(r).toHaveProperty("confidence");
  });
});
