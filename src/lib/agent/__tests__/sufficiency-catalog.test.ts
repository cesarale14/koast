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

// Site 2 (generateGuestReviewThreshold + generatePrivateNoteThreshold)
// describe blocks removed M11 Phase A item 3 — catalog entries deleted
// as cascade of generateGuestReview function removal (superseded by
// counter-flow Site path; pre-two-sided-model artifact).

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
