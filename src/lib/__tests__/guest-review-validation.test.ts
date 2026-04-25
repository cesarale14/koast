import { validateGuestReviewPayload } from "@/lib/reviews/guest-review-validation";

const validBase = () => ({
  scores: [
    { category: "cleanliness", rating: 5 },
    { category: "communication", rating: 5 },
    { category: "respect_house_rules", rating: 5 },
  ],
  public_review: "Lovely guest, communicated clearly and left the place spotless. Would happily host again.",
  is_reviewee_recommended: true,
});

describe("validateGuestReviewPayload", () => {
  test("accepts a fully-valid payload", () => {
    const r = validateGuestReviewPayload(validBase());
    expect(r.ok).toBe(true);
  });

  test("rejects unknown category", () => {
    const r = validateGuestReviewPayload({
      ...validBase(),
      scores: [
        { category: "INVALID_PROBE_xyz", rating: 5 },
        { category: "communication", rating: 5 },
        { category: "respect_house_rules", rating: 5 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.field === "scores.category")).toBe(true);
      expect(r.errors.some((e) => /missing rating for "cleanliness"/i.test(e.message))).toBe(true);
    }
  });

  test("rejects rating outside 1–5", () => {
    const r = validateGuestReviewPayload({
      ...validBase(),
      scores: [
        { category: "cleanliness", rating: 99 },
        { category: "communication", rating: 5 },
        { category: "respect_house_rules", rating: 5 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /must be integer 1-5/.test(e.message))).toBe(true);
    }
  });

  test("rejects non-integer ratings", () => {
    const r = validateGuestReviewPayload({
      ...validBase(),
      scores: [
        { category: "cleanliness", rating: 4.5 },
        { category: "communication", rating: 5 },
        { category: "respect_house_rules", rating: 5 },
      ],
    });
    expect(r.ok).toBe(false);
  });

  test("rejects public_review under 50 chars", () => {
    const r = validateGuestReviewPayload({ ...validBase(), public_review: "too short" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.field === "public_review")).toBe(true);
    }
  });

  test("rejects public_review over 1000 chars", () => {
    const r = validateGuestReviewPayload({
      ...validBase(),
      public_review: "x".repeat(1001),
    });
    expect(r.ok).toBe(false);
  });

  test("rejects missing categories", () => {
    const r = validateGuestReviewPayload({
      ...validBase(),
      scores: [
        { category: "cleanliness", rating: 5 },
        { category: "communication", rating: 5 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /missing rating for "respect_house_rules"/i.test(e.message))).toBe(true);
    }
  });

  test("rejects missing is_reviewee_recommended", () => {
    const payload = validBase() as Record<string, unknown>;
    delete payload.is_reviewee_recommended;
    const r = validateGuestReviewPayload(payload);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.field === "is_reviewee_recommended")).toBe(true);
    }
  });

  test("rejects duplicate categories", () => {
    const r = validateGuestReviewPayload({
      ...validBase(),
      scores: [
        { category: "cleanliness", rating: 5 },
        { category: "cleanliness", rating: 4 },
        { category: "communication", rating: 5 },
        { category: "respect_house_rules", rating: 5 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /duplicate/i.test(e.message))).toBe(true);
    }
  });

  test("accepts optional private_review when valid", () => {
    const r = validateGuestReviewPayload({ ...validBase(), private_review: "Optional note." });
    expect(r.ok).toBe(true);
  });

  test("rejects private_review over 1000 chars", () => {
    const r = validateGuestReviewPayload({
      ...validBase(),
      private_review: "x".repeat(1001),
    });
    expect(r.ok).toBe(false);
  });
});
