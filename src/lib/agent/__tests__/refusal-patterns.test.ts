/**
 * Tests for refusal + completion-duplicate pattern catalog — M9 Phase D
 * substrate foundation.
 *
 * Verifies pattern matching (positive + negative cases per entry) and
 * the findAllMatches / findFirstMatch helpers.
 */

import {
  REFUSAL_PATTERNS,
  COMPLETION_DUPLICATE_PATTERNS,
  findFirstMatch,
  findAllMatches,
} from "../refusal-patterns";

describe("REFUSAL_PATTERNS — coverage", () => {
  test("each entry has a stable id and a parseable regex", () => {
    expect(REFUSAL_PATTERNS.length).toBeGreaterThan(0);
    for (const entry of REFUSAL_PATTERNS) {
      expect(entry.id).toMatch(/^[a-z][a-z0-9_]+$/);
      expect(() => new RegExp(entry.pattern, "gim")).not.toThrow();
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  test("cant_help_with_that matches model-safety voice variants", () => {
    const m = findFirstMatch("I can't help with that, sorry.", REFUSAL_PATTERNS);
    expect(m?.entry.id).toBe("cant_help_with_that");
    expect(m?.entry.kind).toBe("hard_refusal");
  });

  test("im_sorry_cant matches apology-prefixed refusal", () => {
    const m = findFirstMatch(
      "I'm sorry, but I can't share that information.",
      REFUSAL_PATTERNS,
    );
    expect(m?.entry.id).toBe("im_sorry_cant");
    expect(m?.entry.kind).toBe("soft_refusal");
  });

  test("as_an_ai matches model self-disclosure (Voice doctrine §1.3)", () => {
    const m = findFirstMatch("As an AI, I should mention…", REFUSAL_PATTERNS);
    expect(m?.entry.id).toBe("as_an_ai");
    expect(m?.entry.kind).toBe("hard_refusal");
  });

  test("clean text does not match any refusal pattern", () => {
    expect(
      findFirstMatch(
        "Saturday's empty 8 days out — want me to drop the rate to $215?",
        REFUSAL_PATTERNS,
      ),
    ).toBeNull();
  });

  test("does not match 'I can help' (false-positive guard)", () => {
    expect(
      findFirstMatch("I can help you draft that response.", REFUSAL_PATTERNS),
    ).toBeNull();
  });
});

describe("COMPLETION_DUPLICATE_PATTERNS", () => {
  test("matches canonical completion phrase", () => {
    const m = findFirstMatch(
      "I think I have enough to start drafting check-in messages.",
      COMPLETION_DUPLICATE_PATTERNS,
    );
    expect(m?.entry.id).toBe("enough_to_draft");
  });

  test("matches the secondary 'take something off your plate' signature", () => {
    const m = findFirstMatch(
      "Want me to take something off your plate?",
      COMPLETION_DUPLICATE_PATTERNS,
    );
    expect(m?.entry.id).toBe("take_something_off_your_plate");
  });

  test("findAllMatches counts duplicate occurrences in same text", () => {
    const duplicated =
      "I have enough to start. Anything else? I think I have enough to draft.";
    const all = findAllMatches(duplicated, COMPLETION_DUPLICATE_PATTERNS);
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  test("single occurrence returns length 1 (not duplicate)", () => {
    const single = "I think I have enough to start; what's first?";
    const all = findAllMatches(single, COMPLETION_DUPLICATE_PATTERNS);
    expect(all.length).toBe(1);
  });
});

describe("findAllMatches — ordering + safety", () => {
  test("returns matches sorted by index", () => {
    const text =
      "I'm sorry, but I can't share that. As an AI, I should clarify.";
    const all = findAllMatches(text, REFUSAL_PATTERNS);
    expect(all.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < all.length; i++) {
      expect(all[i].index).toBeGreaterThanOrEqual(all[i - 1].index);
    }
  });

  test("does not loop forever on zero-length match shapes", () => {
    // Pattern catalog entries are bounded; this regression-guard verifies
    // the helper's safety check (regex.lastIndex += 1 on stuck position).
    const all = findAllMatches("clean text", REFUSAL_PATTERNS);
    expect(all).toEqual([]);
  });
});
