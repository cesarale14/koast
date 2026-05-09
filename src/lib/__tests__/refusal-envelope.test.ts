/**
 * Pure-helper unit tests for F4 RefusalEnvelope (M8 Phase D).
 * Renderer tests blocked by Round-2 #1 (RTL/jsdom not in deps).
 */

import {
  buildLicensedProfessionalRefusal,
  envelopeForPublisherCategory,
  isRefusalEnvelope,
  LEGAL_CORRESPONDENCE_REFUSAL,
  REGULATORY_SUBMISSION_REFUSAL,
  type RefusalEnvelope,
} from "../agent/refusal-envelope";

describe("isRefusalEnvelope — type guard", () => {
  test("accepts a valid hard_refusal", () => {
    expect(isRefusalEnvelope(LEGAL_CORRESPONDENCE_REFUSAL)).toBe(true);
  });

  test("accepts soft_refusal and host_input_needed kinds", () => {
    expect(
      isRefusalEnvelope({ kind: "soft_refusal", reason: "test" }),
    ).toBe(true);
    expect(
      isRefusalEnvelope({ kind: "host_input_needed", reason: "test" }),
    ).toBe(true);
  });

  test("rejects null / non-object", () => {
    expect(isRefusalEnvelope(null)).toBe(false);
    expect(isRefusalEnvelope(undefined)).toBe(false);
    expect(isRefusalEnvelope("string")).toBe(false);
  });

  test("rejects unknown kind", () => {
    expect(isRefusalEnvelope({ kind: "policy_block", reason: "x" })).toBe(
      false,
    );
  });

  test("rejects missing or empty reason", () => {
    expect(isRefusalEnvelope({ kind: "hard_refusal" })).toBe(false);
    expect(isRefusalEnvelope({ kind: "hard_refusal", reason: "" })).toBe(
      false,
    );
  });
});

describe("locked envelope content — voice doctrine compliance", () => {
  test("legal correspondence refusal — kind, override, alternative path", () => {
    expect(LEGAL_CORRESPONDENCE_REFUSAL.kind).toBe("hard_refusal");
    expect(LEGAL_CORRESPONDENCE_REFUSAL.override_available).toBe(false);
    expect(LEGAL_CORRESPONDENCE_REFUSAL.alternative_path).toBeDefined();
    // Doctrine §4.3 banned anti-patterns absent
    expect(LEGAL_CORRESPONDENCE_REFUSAL.reason).not.toMatch(/I'm sorry/i);
    expect(LEGAL_CORRESPONDENCE_REFUSAL.reason).not.toMatch(
      /unfortunately/i,
    );
    expect(LEGAL_CORRESPONDENCE_REFUSAL.reason).not.toMatch(
      /as an AI/i,
    );
  });

  test("regulatory submission refusal — same shape", () => {
    expect(REGULATORY_SUBMISSION_REFUSAL.kind).toBe("hard_refusal");
    expect(REGULATORY_SUBMISSION_REFUSAL.override_available).toBe(false);
    expect(REGULATORY_SUBMISSION_REFUSAL.alternative_path).toBeDefined();
    expect(REGULATORY_SUBMISSION_REFUSAL.reason).not.toMatch(/I cannot/i);
  });
});

describe("buildLicensedProfessionalRefusal — Category 3 §2.3.4 substitution", () => {
  test("default 'advisor' when classifier can't disambiguate", () => {
    const env = buildLicensedProfessionalRefusal();
    expect(env.kind).toBe("hard_refusal");
    expect(env.override_available).toBe(false);
    expect(env.reason).toContain("your advisor");
  });

  test("'lawyer' substitution", () => {
    const env = buildLicensedProfessionalRefusal("lawyer");
    expect(env.reason).toContain("your lawyer");
    expect(env.reason).not.toContain("your advisor");
  });

  test("'CPA' substitution", () => {
    const env = buildLicensedProfessionalRefusal("CPA");
    expect(env.reason).toContain("your CPA");
  });

  test("anchored to §2.3.4 canonical sentence shape", () => {
    const env = buildLicensedProfessionalRefusal("CPA");
    expect(env.reason).toContain(
      "should come directly from you to your",
    );
  });
});

describe("envelopeForPublisherCategory", () => {
  test("'legal' returns LEGAL_CORRESPONDENCE_REFUSAL", () => {
    expect(envelopeForPublisherCategory("legal")).toBe(
      LEGAL_CORRESPONDENCE_REFUSAL,
    );
  });

  test("'regulatory' returns REGULATORY_SUBMISSION_REFUSAL", () => {
    expect(envelopeForPublisherCategory("regulatory")).toBe(
      REGULATORY_SUBMISSION_REFUSAL,
    );
  });

  test("'licensed_professional' returns advisor-default Category 3 envelope", () => {
    const env = envelopeForPublisherCategory("licensed_professional");
    expect(env.kind).toBe("hard_refusal");
    expect(env.reason).toContain("your advisor");
  });

  test("all three locked envelopes pass isRefusalEnvelope guard", () => {
    const cats = ["legal", "regulatory", "licensed_professional"] as const;
    for (const cat of cats) {
      const env: RefusalEnvelope = envelopeForPublisherCategory(cat);
      expect(isRefusalEnvelope(env)).toBe(true);
    }
  });
});
