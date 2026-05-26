/**
 * J3-v / J3-vi quote-vs-instance judge — adversarial tests
 * M12 Phase D (deferred_voice_doctrine_self_scan +
 * deferred_constitution_prompt_quote_vs_instance — homomorphic shared
 * classifier).
 *
 * Two-sided adversarial discipline per v2.8 §3.5.D [CANON] (D54):
 * 4 FALSE-PASS variants (judge MUST catch declarative use) +
 * 3 FALSE-POSITIVE angles (judge MUST NOT block legitimate pedagogical
 * quotation). Tests run against BOTH target classes (doctrine + constitution)
 * to verify the shared classifier's discriminator holds across both
 * specializations.
 *
 * CI-time activation surface — no audience-routing.
 *
 * The judge is mocked at the @anthropic-ai/sdk module boundary.
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

import { judgeQuoteVsInstance } from "@/lib/agent/judge/quote-vs-instance";

function makeHaikuResponse(rawText: string) {
  return { content: [{ type: "text" as const, text: rawText }] };
}

beforeEach(() => {
  mockCreate.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

// ============================================================================
// FALSE-PASS SET (4 variants — judge MUST verdict='fail' on declarative use)
// Each tests a different declarative-use context (in-prose, in-list-item,
// in-table-cell, in-bullet-explanation).
// ============================================================================

describe("FALSE-PASS — judge MUST verdict='fail' on declarative-use", () => {
  test("Variant 1 (doctrine target; in-prose declarative use): MUST catch", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"declarative_use","confidence":0.95}',
      ),
    );
    const r = await judgeQuoteVsInstance({
      matchedPhrase: "great question",
      contextSnippet:
        "Great question. The doctrine specifies how to validate the host's competence...",
      targetClass: "doctrine",
      judgeId: "voice_doctrine_self_scan",
    });
    expect(r.judge_id).toBe("voice_doctrine_self_scan");
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("declarative_use");
  });

  test("Variant 2 (doctrine target; in-list-item declarative use): MUST catch", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"declarative_use","confidence":0.88}',
      ),
    );
    const r = await judgeQuoteVsInstance({
      matchedPhrase: "rest assured",
      contextSnippet:
        "- Rest assured, the doctrine maintains its position on this issue.",
      targetClass: "doctrine",
      judgeId: "voice_doctrine_self_scan",
    });
    expect(r.verdict).toBe("fail");
  });

  test("Variant 3 (constitution target; declarative in template-string): MUST catch", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"declarative_use","confidence":0.9}',
      ),
    );
    const r = await judgeQuoteVsInstance({
      matchedPhrase: "happy to help",
      contextSnippet:
        'const ASSISTANT_REPLY = `Happy to help with the booking. The check-in time is...`;',
      targetClass: "constitution",
      judgeId: "constitution_prompt_quote_vs_instance",
    });
    expect(r.judge_id).toBe("constitution_prompt_quote_vs_instance");
    expect(r.verdict).toBe("fail");
  });

  test("Variant 4 (constitution target; declarative in instruction-list): MUST catch", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"declarative_use","confidence":0.85}',
      ),
    );
    const r = await judgeQuoteVsInstance({
      matchedPhrase: "I hope this message finds you well",
      contextSnippet:
        "When responding to guest inquiries, I hope this message finds you well introductions are preferred.",
      targetClass: "constitution",
      judgeId: "constitution_prompt_quote_vs_instance",
    });
    expect(r.verdict).toBe("fail");
  });
});

// ============================================================================
// FALSE-POSITIVE SET (3 angles — judge MUST verdict='pass' on legitimate
// pedagogical quotation across both target classes)
// ============================================================================

describe("FALSE-POSITIVE — judge MUST verdict='pass' on legitimate quote/pedagogy", () => {
  test("Angle 1 (doctrine target; quote-marked phrase): MUST pass", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"quote_context","confidence":0.95}',
      ),
    );
    const r = await judgeQuoteVsInstance({
      matchedPhrase: "great question",
      contextSnippet:
        "...the phrase 'great question' is banned because it validates the host's competence...",
      targetClass: "doctrine",
      judgeId: "voice_doctrine_self_scan",
    });
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("quote_context");
  });

  test("Angle 2 (doctrine target; named-as-banned pedagogy): MUST pass", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"pedagogical_naming","confidence":0.9}',
      ),
    );
    const r = await judgeQuoteVsInstance({
      matchedPhrase: "happy to help",
      contextSnippet:
        '...phrases like "happy to help" signal corporate voice and should be replaced...',
      targetClass: "doctrine",
      judgeId: "voice_doctrine_self_scan",
    });
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("pedagogical_naming");
  });

  test("Angle 3 (constitution target; inside negative-example block): MUST pass", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"negative_example_block","confidence":0.92}',
      ),
    );
    const r = await judgeQuoteVsInstance({
      matchedPhrase: "rest assured",
      contextSnippet:
        'Never write phrases like "rest assured" — they signal AI voice. Write the work instead.',
      targetClass: "constitution",
      judgeId: "constitution_prompt_quote_vs_instance",
    });
    expect(r.verdict).toBe("pass");
    expect(r.reason).toBe("negative_example_block");
  });
});

// ============================================================================
// SHARED CLASSIFIER — verify target_class routes to correct system prompt
// ============================================================================

describe("quote-vs-instance — target_class specialization", () => {
  test("doctrine target uses doctrine-specialized system prompt", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"quote_context","confidence":0.9}',
      ),
    );
    await judgeQuoteVsInstance({
      matchedPhrase: "test",
      contextSnippet: "test context",
      targetClass: "doctrine",
      judgeId: "voice_doctrine_self_scan",
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0][0] as { system: string };
    expect(call.system).toMatch(/voice-doctrine self-scan/i);
  });

  test("constitution target uses constitution-specialized system prompt", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"pass","reason":"quote_context","confidence":0.9}',
      ),
    );
    await judgeQuoteVsInstance({
      matchedPhrase: "test",
      contextSnippet: "test context",
      targetClass: "constitution",
      judgeId: "constitution_prompt_quote_vs_instance",
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0][0] as { system: string };
    expect(call.system).toMatch(/constitution-prompt self-scan/i);
  });
});

// ============================================================================
// INFRASTRUCTURE-ERROR fail-open coverage (v2.8 §6.21 [LIVE] contract)
// ============================================================================

describe("quote-vs-instance — INFRASTRUCTURE-ERROR fail-open", () => {
  test("Haiku timeout → fail-open with infrastructure_error flag", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Request timed out"));
    const r = await judgeQuoteVsInstance({
      matchedPhrase: "great question",
      contextSnippet: "context...",
      targetClass: "doctrine",
      judgeId: "voice_doctrine_self_scan",
    });
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("judge_infrastructure_error");
    expect((r.details as Record<string, unknown>).infrastructure_error).toBe(true);
  });
});

// ============================================================================
// ENVELOPE-PRESENCE substrate guard — judge_id correctness per target
// ============================================================================

describe("quote-vs-instance — ENVELOPE-PRESENCE substrate guard", () => {
  test("doctrine target → judge_id='voice_doctrine_self_scan'", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"declarative_use","confidence":0.9}',
      ),
    );
    const r = await judgeQuoteVsInstance({
      matchedPhrase: "great question",
      contextSnippet: "context",
      targetClass: "doctrine",
      judgeId: "voice_doctrine_self_scan",
    });
    expect(r.judge_id).toBe("voice_doctrine_self_scan");
    expect(r).toHaveProperty("verdict");
    expect(r).toHaveProperty("reason");
    expect(r).toHaveProperty("confidence");
  });

  test("constitution target → judge_id='constitution_prompt_quote_vs_instance'", async () => {
    mockCreate.mockResolvedValueOnce(
      makeHaikuResponse(
        '{"verdict":"fail","reason":"declarative_use","confidence":0.9}',
      ),
    );
    const r = await judgeQuoteVsInstance({
      matchedPhrase: "great question",
      contextSnippet: "context",
      targetClass: "constitution",
      judgeId: "constitution_prompt_quote_vs_instance",
    });
    expect(r.judge_id).toBe("constitution_prompt_quote_vs_instance");
  });
});

// ============================================================================
// SCAN SCRIPT integration — voice-scan-doctrine.ts (J3-v activation)
// ============================================================================

describe("voice-scan-constitution — script integration (J3-vi activation; homomorphic with v)", () => {
  test("scanConstitutionText returns declarative-use violations + skips quotes", async () => {
    // Constitution prompt mock content: one in negative-example block (PASS),
    // one in declarative position (FAIL).
    const fakeConstitution = `// VOICE_DOCTRINE_SUMMARY
export const VOICE_PROMPT = \`
  Never write phrases like "rest assured" — they signal AI voice.
  Use specific assurances instead.

  Rest assured, the system will handle the booking automatically.
\`;
`;

    mockCreate
      .mockResolvedValueOnce(
        makeHaikuResponse(
          '{"verdict":"pass","reason":"negative_example_block","confidence":0.92}',
        ),
      )
      .mockResolvedValueOnce(
        makeHaikuResponse(
          '{"verdict":"fail","reason":"declarative_use","confidence":0.95}',
        ),
      );

    const { scanConstitutionText } = await import(
      "@/../scripts/voice-scan-constitution"
    );
    const violations = await scanConstitutionText(
      fakeConstitution,
      "src/lib/voice/build-voice-prompt.ts",
    );

    expect(violations.length).toBe(1);
    expect(violations[0].matchedPhrase).toMatch(/rest assured/i);
    expect(violations[0].verdict).toBe("fail");
    expect(violations[0].reason).toBe("declarative_use");
    expect(violations[0].patternId).toBe("ai_rest_assured");
  });
});

describe("voice-scan-doctrine — script integration (J3-v activation)", () => {
  test("scanDoctrineText returns declarative-use violations + skips quotes", async () => {
    // Mixed doctrine content: one quote context (PASS), one declarative (FAIL)
    const fakeDoctrine = `# Doctrine
Section: sycophancy theater.
The phrase "great question" is banned because it validates the host's competence.
Great question. The doctrine teaches the work.
`;

    // Two regex matches expected: one in quote context (PASS), one declarative (FAIL).
    // Set Haiku responses for the 2 matches in order.
    mockCreate
      .mockResolvedValueOnce(
        makeHaikuResponse(
          '{"verdict":"pass","reason":"quote_context","confidence":0.95}',
        ),
      )
      .mockResolvedValueOnce(
        makeHaikuResponse(
          '{"verdict":"fail","reason":"declarative_use","confidence":0.95}',
        ),
      );

    const { scanDoctrineText } = await import("@/../scripts/voice-scan-doctrine");
    const violations = await scanDoctrineText(fakeDoctrine, "/fake/doctrine.md");

    expect(violations.length).toBe(1);
    expect(violations[0].matchedPhrase).toMatch(/great question/i);
    expect(violations[0].verdict).toBe("fail");
    expect(violations[0].reason).toBe("declarative_use");
    expect(violations[0].patternId).toBe("sycophancy_great_question");
  });
});
