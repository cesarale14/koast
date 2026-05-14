/**
 * Tests for D23 per-generator-call sufficiency catalog (M9 Phase C).
 *
 * Each catalog entry's evaluate function is unit-tested independently.
 * The shared `gradient3` pattern is exercised across entries; the
 * site-specific shapes (private_note constant; Site 4's grounding-only,
 * hedge separate) are verified per-site.
 */

import {
  generateDraftThreshold,
  generateGuestReviewThreshold,
  generatePrivateNoteThreshold,
  generateReviewResponseThreshold,
  generateGuestReviewFromIncomingThreshold,
} from "../sufficiency-catalog";

describe("generateDraftThreshold (Site 1)", () => {
  test("all 4 details present → confirmed/rich", () => {
    expect(
      generateDraftThreshold.evaluate({
        details: {
          wifi_network: "wifi",
          door_code: "1234",
          parking_instructions: "driveway",
          checkin_time: "3pm",
        },
      }),
    ).toEqual({ confidence: "confirmed", output_grounding: "rich" });
  });

  test("partial details (1-3 present) → high_inference/sparse", () => {
    expect(
      generateDraftThreshold.evaluate({
        details: {
          wifi_network: "wifi",
          door_code: null,
          parking_instructions: null,
          checkin_time: null,
        },
      }),
    ).toEqual({ confidence: "high_inference", output_grounding: "sparse" });
  });

  test("no details (null) → active_guess/empty", () => {
    expect(generateDraftThreshold.evaluate({ details: null })).toEqual({
      confidence: "active_guess",
      output_grounding: "empty",
    });
  });

  test("treats empty strings as missing", () => {
    expect(
      generateDraftThreshold.evaluate({
        details: {
          wifi_network: "",
          door_code: "",
          parking_instructions: "",
          checkin_time: "",
        },
      }),
    ).toEqual({ confidence: "active_guess", output_grounding: "empty" });
  });
});

describe("generateGuestReviewThreshold (Site 2 review_text)", () => {
  test("all 3 axes present → confirmed/rich", () => {
    expect(
      generateGuestReviewThreshold.evaluate({
        rule: { tone: "warm", target_keywords: ["clean"] },
        booking: { guest_name: "Sarah" },
      }),
    ).toEqual({ confidence: "confirmed", output_grounding: "rich" });
  });

  test("missing all axes → active_guess/empty", () => {
    expect(
      generateGuestReviewThreshold.evaluate({
        rule: { tone: "", target_keywords: [] },
        booking: { guest_name: null },
      }),
    ).toEqual({ confidence: "active_guess", output_grounding: "empty" });
  });

  test("partial axes → high_inference/sparse", () => {
    expect(
      generateGuestReviewThreshold.evaluate({
        rule: { tone: "warm", target_keywords: [] },
        booking: { guest_name: null },
      }),
    ).toEqual({ confidence: "high_inference", output_grounding: "sparse" });
  });
});

describe("generatePrivateNoteThreshold (Site 2 private_note)", () => {
  test("constant active_guess/sparse regardless of inputs", () => {
    expect(generatePrivateNoteThreshold.evaluate({})).toEqual({
      confidence: "active_guess",
      output_grounding: "sparse",
    });
  });
});

describe("generateReviewResponseThreshold (Site 3)", () => {
  test("text + rating both present → confirmed/rich", () => {
    expect(
      generateReviewResponseThreshold.evaluate({
        incomingText: "Great stay!",
        incomingRating: 5,
      }),
    ).toEqual({ confidence: "confirmed", output_grounding: "rich" });
  });

  test("empty text only → high_inference/sparse (rating still present)", () => {
    expect(
      generateReviewResponseThreshold.evaluate({
        incomingText: "",
        incomingRating: 5,
      }),
    ).toEqual({ confidence: "high_inference", output_grounding: "sparse" });
  });

  test("neither → active_guess/empty", () => {
    expect(
      generateReviewResponseThreshold.evaluate({
        incomingText: "",
        incomingRating: Number.NaN,
      }),
    ).toEqual({ confidence: "active_guess", output_grounding: "empty" });
  });
});

describe("generateGuestReviewFromIncomingThreshold (Site 4)", () => {
  test("text + rating both present → confirmed/rich", () => {
    expect(
      generateGuestReviewFromIncomingThreshold.evaluate({
        incoming_text: "Loved it",
        incoming_rating: 5,
      }),
    ).toEqual({ confidence: "confirmed", output_grounding: "rich" });
  });

  test("text only (no rating) → high_inference/sparse", () => {
    expect(
      generateGuestReviewFromIncomingThreshold.evaluate({
        incoming_text: "Fine.",
        incoming_rating: null,
      }),
    ).toEqual({ confidence: "high_inference", output_grounding: "sparse" });
  });

  test("neither → active_guess/empty", () => {
    expect(
      generateGuestReviewFromIncomingThreshold.evaluate({
        incoming_text: null,
        incoming_rating: null,
      }),
    ).toEqual({ confidence: "active_guess", output_grounding: "empty" });
  });
});
