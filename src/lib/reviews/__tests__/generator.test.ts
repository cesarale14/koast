/**
 * Tests for Sites 2-4 (reviews/generator.ts) — M9 Phase B F3.
 *
 * Verifies:
 *   - Backward compatibility: legacy return shapes preserved (Option B
 *     migration; envelopes flow internally, downstream sees the same shape).
 *   - Q-B3 resolution: Site 2 makes TWO wrapper calls (two envelopes,
 *     one per SDK call).
 *   - Per-site envelope heuristics: confidence + output_grounding
 *     track the deterministic-from-context inputs each site has.
 *   - Site 4 hedge: SET when private feedback flags issues; ABSENT
 *     otherwise.
 *   - Q-B4: bias rules stay at prompt-level. Tests verify ENVELOPE
 *     shape, not banned-phrase detection.
 */

import {
  generateGuestReview,
  generateReviewResponse,
  generateGuestReviewFromIncoming,
} from "../generator";

jest.mock("@/lib/agent/llm-call");
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
};

const BOOKING = {
  guest_name: "Sarah Mitchell",
  check_in: "2026-05-01",
  check_out: "2026-05-05",
  platform: "airbnb",
};

const RULE_RICH = {
  tone: "warm",
  target_keywords: ["clean", "location"],
};

const RULE_BARE = {
  tone: "",
  target_keywords: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

// ---- Site 2: generateGuestReview (2 wrapper calls per Q-B3) ----

describe("generateGuestReview — Site 2 (Q-B3: two envelopes per call)", () => {
  beforeEach(() => {
    (callLLMWithEnvelope as jest.Mock)
      .mockResolvedValueOnce({
        content: "Sarah was a thoughtful guest who kept the place spotless.",
        confidence: "confirmed",
        source_attribution: [],
        output_grounding: "rich",
      })
      .mockResolvedValueOnce({
        content: "Thanks for taking such good care of Villa Jamaica!",
        confidence: "active_guess",
        source_attribution: [],
        output_grounding: "sparse",
      });
  });

  test("backward-compat: returns ReviewResult shape; two wrapper calls (one per SDK call)", async () => {
    const result = await generateGuestReview(BOOKING, PROPERTY, RULE_RICH);

    expect(result.review_text).toBe(
      "Sarah was a thoughtful guest who kept the place spotless.",
    );
    expect(result.private_note).toBe(
      "Thanks for taking such good care of Villa Jamaica!",
    );
    expect(result.recommended).toBe(true);
    expect(callLLMWithEnvelope).toHaveBeenCalledTimes(2);
  });

  test("first-call envelope: rich rule + named guest → confirmed/rich", async () => {
    await generateGuestReview(BOOKING, PROPERTY, RULE_RICH);

    const firstCallOpts = (callLLMWithEnvelope as jest.Mock).mock.calls[0][1];
    const envelope = firstCallOpts.buildEnvelope("test text");
    expect(envelope.confidence).toBe("confirmed");
    expect(envelope.output_grounding).toBe("rich");
    expect(envelope.source_attribution).toEqual([]);
  });

  test("first-call envelope: bare rule + no guest name → active_guess/empty", async () => {
    const bareBooking = { ...BOOKING, guest_name: null };
    await generateGuestReview(bareBooking, PROPERTY, RULE_BARE);

    const firstCallOpts = (callLLMWithEnvelope as jest.Mock).mock.calls[0][1];
    const envelope = firstCallOpts.buildEnvelope("test text");
    expect(envelope.confidence).toBe("active_guess");
    expect(envelope.output_grounding).toBe("empty");
  });

  test("second-call envelope: private note is active_guess + sparse regardless of rule", async () => {
    await generateGuestReview(BOOKING, PROPERTY, RULE_RICH);

    const secondCallOpts = (callLLMWithEnvelope as jest.Mock).mock.calls[1][1];
    const envelope = secondCallOpts.buildEnvelope("Thanks!");
    expect(envelope.confidence).toBe("active_guess");
    expect(envelope.output_grounding).toBe("sparse");
  });
});

// ---- Site 3: generateReviewResponse ----

describe("generateReviewResponse — Site 3", () => {
  beforeEach(() => {
    (callLLMWithEnvelope as jest.Mock).mockResolvedValue({
      content: "Thanks for the kind words, Sarah!",
      confidence: "confirmed",
      source_attribution: [],
      output_grounding: "rich",
    });
  });

  test("backward-compat: returns ResponseResult shape", async () => {
    const result = await generateReviewResponse(
      "Loved the place!",
      5,
      BOOKING,
      PROPERTY,
      RULE_RICH,
    );
    expect(result.response_text).toBe("Thanks for the kind words, Sarah!");
    expect(callLLMWithEnvelope).toHaveBeenCalledTimes(1);
  });

  test("envelope: incoming text + rating both present → confirmed/rich", async () => {
    await generateReviewResponse("Loved it", 5, BOOKING, PROPERTY, RULE_RICH);

    const opts = (callLLMWithEnvelope as jest.Mock).mock.calls[0][1];
    const envelope = opts.buildEnvelope("test response");
    expect(envelope.confidence).toBe("confirmed");
    expect(envelope.output_grounding).toBe("rich");
  });

  test("envelope: empty incoming text → high_inference/sparse", async () => {
    await generateReviewResponse("", 5, BOOKING, PROPERTY, RULE_RICH);

    const opts = (callLLMWithEnvelope as jest.Mock).mock.calls[0][1];
    const envelope = opts.buildEnvelope("test response");
    expect(envelope.confidence).toBe("high_inference");
    expect(envelope.output_grounding).toBe("sparse");
  });
});

// ---- Site 4: generateGuestReviewFromIncoming ----

describe("generateGuestReviewFromIncoming — Site 4", () => {
  beforeEach(() => {
    (callLLMWithEnvelope as jest.Mock).mockResolvedValue({
      content: "  Communicated clearly and respected the space.  ",
      confidence: "confirmed",
      source_attribution: [],
      output_grounding: "rich",
    });
  });

  test("backward-compat: returns { public_review_draft } and trims content", async () => {
    const result = await generateGuestReviewFromIncoming({
      incoming_text: "Great stay!",
      incoming_rating: 5,
      private_feedback: null,
      guest_name: "Sarah",
      property_name: "Villa Jamaica",
      nights: 4,
    });
    expect(result.public_review_draft).toBe(
      "Communicated clearly and respected the space.",
    );
  });

  test("envelope hedge: SET when private feedback flags issues", async () => {
    await generateGuestReviewFromIncoming({
      incoming_text: "Place was fine.",
      incoming_rating: 3,
      private_feedback: "Left the kitchen messy.",
      guest_name: "Sarah",
      property_name: "Villa Jamaica",
      nights: 4,
    });

    const opts = (callLLMWithEnvelope as jest.Mock).mock.calls[0][1];
    const envelope = opts.buildEnvelope("test review");
    expect(envelope.hedge).toBe(
      "private feedback flagged issues during stay; drafted with measured tone",
    );
  });

  test("envelope hedge: ABSENT when no private feedback", async () => {
    await generateGuestReviewFromIncoming({
      incoming_text: "Great stay!",
      incoming_rating: 5,
      private_feedback: null,
      guest_name: "Sarah",
      property_name: "Villa Jamaica",
      nights: 4,
    });

    const opts = (callLLMWithEnvelope as jest.Mock).mock.calls[0][1];
    const envelope = opts.buildEnvelope("test review");
    expect(envelope.hedge).toBeUndefined();
  });
});
