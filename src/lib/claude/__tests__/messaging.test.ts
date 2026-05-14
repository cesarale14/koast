/**
 * Tests for generateDraft — M9 Phase B Site 1.
 *
 * Verifies:
 *   - Backward compatibility: signature stays Promise<string>; callers
 *     see legacy shape (Option B migration).
 *   - F3 envelope construction: confidence + output_grounding track
 *     property-details presence per Phase B's deterministic-from-context
 *     heuristics (Phase C replaces with D23 catalog).
 *   - Wrapper params: model, max_tokens, message assembly.
 */

import { generateDraft } from "../messaging";

jest.mock("@/lib/agent/llm-call");
// Stub the Anthropic SDK constructor — generateDraft instantiates one
// internally; the wrapper is jest-mocked so the actual SDK is unused.
jest.mock("@anthropic-ai/sdk", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: jest.fn() },
    })),
  };
});

import { callLLMWithEnvelope } from "@/lib/agent/llm-call";

const PROPERTY = {
  name: "Villa Jamaica",
  city: "Tampa",
  bedrooms: 2,
  bathrooms: 2,
  max_guests: 6,
};

const FULL_DETAILS = {
  wifi_network: "VillaJamaica",
  wifi_password: "guest-pw",
  door_code: "1234",
  checkin_time: "3:00 PM",
  checkout_time: "11:00 AM",
  parking_instructions: "Driveway available",
  house_rules: null,
  special_instructions: null,
};

const PARTIAL_DETAILS = {
  wifi_network: "VillaJamaica",
  wifi_password: "guest-pw",
  door_code: null,
  checkin_time: null,
  checkout_time: null,
  parking_instructions: null,
  house_rules: null,
  special_instructions: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";
  (callLLMWithEnvelope as jest.Mock).mockResolvedValue({
    content: "Hi! Wifi is in the welcome packet.",
    confidence: "confirmed",
    source_attribution: [],
    output_grounding: "rich",
  });
});

describe("generateDraft — Phase C parallel return shape (D22 Option II)", () => {
  test("returns { content, envelope } — content from envelope.content, envelope surfaced alongside", async () => {
    const result = await generateDraft(PROPERTY, null, [], "test", null);
    expect(result.content).toBe("Hi! Wifi is in the welcome packet.");
    expect(result.envelope).toMatchObject({
      content: "Hi! Wifi is in the welcome packet.",
      confidence: "confirmed",
      output_grounding: "rich",
    });
  });
});

describe("generateDraft — envelope construction heuristics", () => {
  test("full property details → confirmed + rich", async () => {
    await generateDraft(PROPERTY, null, [], "what time is checkin?", FULL_DETAILS);

    const wrapperCall = (callLLMWithEnvelope as jest.Mock).mock.calls[0];
    const envelope = wrapperCall[1].buildEnvelope("draft text");

    expect(envelope.confidence).toBe("confirmed");
    expect(envelope.output_grounding).toBe("rich");
    expect(envelope.source_attribution).toEqual([]);
    expect(envelope.content).toBe("draft text");
  });

  test("partial property details → high_inference + sparse", async () => {
    await generateDraft(PROPERTY, null, [], "wifi?", PARTIAL_DETAILS);

    const wrapperCall = (callLLMWithEnvelope as jest.Mock).mock.calls[0];
    const envelope = wrapperCall[1].buildEnvelope("text");

    expect(envelope.confidence).toBe("high_inference");
    expect(envelope.output_grounding).toBe("sparse");
  });

  test("no property details → active_guess + empty", async () => {
    await generateDraft(PROPERTY, null, [], "any tips?", null);

    const wrapperCall = (callLLMWithEnvelope as jest.Mock).mock.calls[0];
    const envelope = wrapperCall[1].buildEnvelope("text");

    expect(envelope.confidence).toBe("active_guess");
    expect(envelope.output_grounding).toBe("empty");
  });
});

describe("generateDraft — wrapper params", () => {
  test("appends latest message to conversation history; uses correct model + max_tokens", async () => {
    const history = [
      { role: "user" as const, content: "first msg" },
      { role: "assistant" as const, content: "first reply" },
    ];
    await generateDraft(PROPERTY, null, history, "latest from guest", FULL_DETAILS);

    const wrapperCall = (callLLMWithEnvelope as jest.Mock).mock.calls[0];
    const params = wrapperCall[0];

    expect(params.model).toBe("claude-sonnet-4-20250514");
    expect(params.max_tokens).toBe(300);
    expect(params.messages).toHaveLength(3);
    expect(params.messages[0]).toEqual({ role: "user", content: "first msg" });
    expect(params.messages[2]).toEqual({
      role: "user",
      content: "latest from guest",
    });
  });
});
