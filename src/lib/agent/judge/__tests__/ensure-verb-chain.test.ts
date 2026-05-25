/**
 * J3 ensure-verb-chain judge — adversarial tests
 * M12 Phase B (deferred_5_6_ensure_verb_chain runtime-active).
 *
 * Two-sided adversarial discipline per Phase B STOP §4.1 (operator catch #3
 * msg 3456 rebalance): 4 FALSE-PASS variants (load-bearing safety side) +
 * 3 FALSE-POSITIVE angles. Plus pre-filter / skip-condition tests and
 * audience-scope test.
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

import { judgeEnsureVerbChain } from "@/lib/agent/judge/ensure-verb-chain";

function makeHaikuResponse(rawText: string) {
  return { content: [{ type: "text" as const, text: rawText }] };
}

beforeEach(() => {
  mockCreate.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

// ============================================================================
// FALSE-PASS SET (load-bearing safety side — 4 variants per Phase B STOP §4.1)
// A judge that misses the anti-pattern fails the WORK of guest-safety.
// Multi-flavor coverage tests judge generalization, not memorization of one
// phrasing.
// ============================================================================

describe("FALSE-PASS — judge MUST verdict='fail' on abstract-object verb-chains", () => {
  test("Variant 1 (ensure + 'wonderful stay'): MUST catch", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"abstract_object_paired","confidence":0.9}',
      ),
    );
    const r = await judgeEnsureVerbChain(
      "Hi Sarah! I'll ensure you have a wonderful stay at our place.",
      "host-to-guest",
    );
    expect(r.judge_id).toBe("ensure_verb_chain");
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("abstract_object_paired");
    expect((r.details as Record<string, unknown>).detected_verb).toMatch(/ensure/i);
  });

  test("Variant 2 (promise + 'amazing time'): MUST catch — verb generalization", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"abstract_object_paired","confidence":0.85}',
      ),
    );
    const r = await judgeEnsureVerbChain(
      "Welcome! I promise you'll have an amazing time.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("fail");
    expect((r.details as Record<string, unknown>).detected_verb).toMatch(/promise/i);
  });

  test("Variant 3 (guarantee + 'perfect experience'): MUST catch — verb generalization", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"abstract_object_paired","confidence":0.88}',
      ),
    );
    const r = await judgeEnsureVerbChain(
      "Looking forward to having you. I'll guarantee the perfect experience.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("fail");
    expect((r.details as Record<string, unknown>).detected_verb).toMatch(/guarantee/i);
  });

  test("Variant 4 (ensure + extended abstract): MUST catch — phrasing generalization", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"abstract_object_paired","confidence":0.82}',
      ),
    );
    const r = await judgeEnsureVerbChain(
      "I'll ensure your visit is everything you've hoped for.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("fail");
  });
});

// ============================================================================
// FALSE-POSITIVE SET — judge MUST verdict='pass' on legitimate verb-chains
// (3 angles): concrete-object / concrete-action / no-ensure-verb.
// A judge that blocks everything is "safe" and useless.
// ============================================================================

describe("FALSE-POSITIVE — judge MUST verdict='pass' on legitimate phrasing", () => {
  test("Angle 1 — concrete-object ensure: MUST pass", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"concrete_object_paired","confidence":0.92}',
      ),
    );
    const r = await judgeEnsureVerbChain(
      "Hi Marcus, I'll ensure the wifi password is in the welcome packet.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("concrete_object_paired");
  });

  test("Angle 2 — concrete-action ensure: MUST pass", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"concrete_object_paired","confidence":0.88}',
      ),
    );
    const r = await judgeEnsureVerbChain(
      "I'll ensure the cleaner arrives by 11am on your check-in day.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
  });

  test("Angle 3 — no ensure/promise/guarantee verb: SKIP (pre-filter); verdict='pass'", async () => {
    // No verb detected → pre-filter skip; LLM NOT invoked.
    const r = await judgeEnsureVerbChain(
      "Welcome! Looking forward to having you.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("no_verb_chain");
    expect((r.details as Record<string, unknown>).skipped).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ============================================================================
// PRE-FILTER / SKIP-CONDITION tests
// ============================================================================

describe("ensure-verb-chain — pre-filter / skip-condition behavior", () => {
  test("empty text: skip judge (no LLM call)", async () => {
    const r = await judgeEnsureVerbChain("", "host-to-guest");
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("skipped_short_text");
    expect((r.details as Record<string, unknown>).skipped).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("short text (under threshold): skip judge", async () => {
    const r = await judgeEnsureVerbChain("ensure yes", "host-to-guest");
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("skipped_short_text");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("audience='koast-to-host': skip judge (audience scope; Phase B host-to-guest only)", async () => {
    const r = await judgeEnsureVerbChain(
      "I'll ensure you have a wonderful experience working with us.",
      "koast-to-host",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("audience_out_of_scope");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("text length above threshold + no ensure verb: pre-filter skip", async () => {
    const r = await judgeEnsureVerbChain(
      "Hi Sarah, looking forward to having you stay at our place this weekend.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("no_verb_chain");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ============================================================================
// INFRASTRUCTURE-ERROR fail-open coverage (Phase B STOP §3.2)
// ============================================================================

describe("ensure-verb-chain — INFRASTRUCTURE-ERROR fail-open", () => {
  test("Haiku timeout → fail-open with infrastructure_error flag", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Request timed out"));
    const r = await judgeEnsureVerbChain(
      "I'll ensure you have a wonderful stay.",
      "host-to-guest",
    );
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("judge_infrastructure_error");
    expect((r.details as Record<string, unknown>).infrastructure_error).toBe(true);
  });
});

// ============================================================================
// ENVELOPE-PRESENCE substrate guard (Q11 sign-off; substrate-side)
// Render-visibility (PendingDraftBubble) is Phase D test scope.
// ============================================================================

describe("ensure-verb-chain — ENVELOPE-PRESENCE substrate guard (Q11)", () => {
  test("JudgeResult shape includes judge_id='ensure_verb_chain' for envelope inclusion", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"abstract_object_paired","confidence":0.9}',
      ),
    );
    const r = await judgeEnsureVerbChain(
      "I'll ensure you have a wonderful stay.",
      "host-to-guest",
    );
    // The result must carry judge_id so envelope.judge_results can store
    // it AND PendingDraftBubble.tsx:60 generic dispatch can find it via
    // verdict==='fail' iteration.
    expect(r.judge_id).toBe("ensure_verb_chain");
    expect(r).toHaveProperty("verdict");
    expect(r).toHaveProperty("reason");
    expect(r).toHaveProperty("confidence");
  });
});
