/**
 * P4 — pure-helper tests for classifyPublisherCategory (M8 Phase D).
 *
 * Edge case anchors locked at P4 sign-off Decision 5:
 *   - Cat 3 substantive professional → REFUSE
 *   - Cat 1 lawsuit-threat-from-guest → DRAFT (not refuse)
 *   - Cat 2 city-noise-complaint → DRAFT (not refuse) unless regulatory
 *   - Routine cancellation policy → DRAFT (not refuse)
 *
 * Conservative narrow keyword sets per Decision 5; M9 evaluates real-
 * traffic miss rates and may tighten.
 */

import {
  classifyPublisherCategory,
  detectLicensedProfessionalTerm,
} from "../agent/refusal-classifier";

describe("classifyPublisherCategory — Category 1 (legal correspondence)", () => {
  test("small-claims-court demand letter → 'legal'", () => {
    expect(
      classifyPublisherCategory(
        "Hi, regarding your small-claims-court demand: we're prepared to discuss settlement.",
      ),
    ).toBe("legal");
  });

  test("attorney's demand letter → 'legal'", () => {
    expect(
      classifyPublisherCategory(
        "Per your attorney's demand letter received 5/1, we will respond formally.",
      ),
    ).toBe("legal");
  });

  test("subpoena response → 'legal'", () => {
    expect(
      classifyPublisherCategory(
        "Acknowledging receipt of the subpoena issued by the court.",
      ),
    ).toBe("legal");
  });

  test("'reply to my lawyer about case' → 'legal'", () => {
    expect(
      classifyPublisherCategory(
        "Reply to my lawyer about the dispute case status.",
      ),
    ).toBe("legal");
  });

  test("cease-and-desist response → 'legal'", () => {
    expect(
      classifyPublisherCategory(
        "Following your cease and desist notice, we have removed the listing.",
      ),
    ).toBe("legal");
  });
});

describe("classifyPublisherCategory — Category 2 (regulatory submissions)", () => {
  test("STR registration filing → 'regulatory'", () => {
    expect(
      classifyPublisherCategory(
        "Submitting our STR registration renewal as required by the city.",
      ),
    ).toBe("regulatory");
  });

  test("occupancy tax filing → 'regulatory'", () => {
    expect(
      classifyPublisherCategory(
        "Attached is our quarterly occupancy tax filing for review.",
      ),
    ).toBe("regulatory");
  });

  test("compliance audit response → 'regulatory'", () => {
    expect(
      classifyPublisherCategory(
        "Response to the compliance audit notice dated April 15.",
      ),
    ).toBe("regulatory");
  });

  test("zoning appeal → 'regulatory'", () => {
    expect(
      classifyPublisherCategory(
        "Filing this zoning appeal against the variance denial.",
      ),
    ).toBe("regulatory");
  });
});

describe("classifyPublisherCategory — Category 3 (licensed professional)", () => {
  test("'reply to my CPA about depreciation method' → 'licensed_professional'", () => {
    expect(
      classifyPublisherCategory(
        "Reply to my CPA's question about depreciation method for the new HVAC.",
      ),
    ).toBe("licensed_professional");
  });

  test("'draft a message to my accountant about cost basis' → 'licensed_professional'", () => {
    expect(
      classifyPublisherCategory(
        "Draft a message to my accountant about cost basis adjustments.",
      ),
    ).toBe("licensed_professional");
  });

  test("'reply to my financial advisor regarding the tax strategy' → 'licensed_professional'", () => {
    expect(
      classifyPublisherCategory(
        "Reply to my financial advisor regarding the tax strategy proposal.",
      ),
    ).toBe("licensed_professional");
  });

  test("§2.3.4 logistics carve-out: 'forward this invoice to my CPA' → null (DRAFT)", () => {
    expect(
      classifyPublisherCategory(
        "Forward this invoice to my CPA for the file.",
      ),
    ).toBeNull();
  });
});

describe("classifyPublisherCategory — boundary edge cases (locked at sign-off)", () => {
  test("Edge case 2 — guest threatening lawsuit → null (DRAFT, voice §4.2)", () => {
    // §2.3.4 names *active formal* legal matter, not threats. Voice
    // §4.2 has the canonical example showing Koast still drafts here.
    expect(
      classifyPublisherCategory(
        "Hey — I understand you're upset and threatening a lawsuit if we don't refund. I want to make this right.",
      ),
    ).toBeNull();
  });

  test("Edge case 3 — city noise complaint forwarded → null (DRAFT)", () => {
    // Neighbor relations, not regulatory submission.
    expect(
      classifyPublisherCategory(
        "Thanks for forwarding the neighbor's noise complaint from the city. We'll address it with our cleaning team.",
      ),
    ).toBeNull();
  });

  test("Edge case 3.b — but city compliance filing → 'regulatory'", () => {
    // If the same surface adds compliance/filing language, it crosses
    // into Category 2.
    expect(
      classifyPublisherCategory(
        "Here is our STR compliance filing in response to the noise-related compliance audit.",
      ),
    ).toBe("regulatory");
  });

  test("Edge case 4 — routine cancellation policy explanation → null (DRAFT)", () => {
    expect(
      classifyPublisherCategory(
        "Help me explain the booking cancellation policy — they cancelled within 48 hours so a 50% refund applies.",
      ),
    ).toBeNull();
  });
});

describe("classifyPublisherCategory — control cases (no false positives)", () => {
  test("welcome message → null", () => {
    expect(
      classifyPublisherCategory(
        "Welcome to Villa Jamaica! Check-in is at 4pm. Front door code is 4828. Wifi: ZORRO1123.",
      ),
    ).toBeNull();
  });

  test("rate inquiry → null", () => {
    expect(
      classifyPublisherCategory(
        "For a 3-night stay over July 4th weekend, the rate is $245/night.",
      ),
    ).toBeNull();
  });

  test("benign mention of 'lawsuit' (history reference) → null", () => {
    expect(
      classifyPublisherCategory(
        "Like that supply-and-demand pricing model — works without a lawsuit ever filed.",
      ),
    ).toBeNull();
  });

  test("empty string → null", () => {
    expect(classifyPublisherCategory("")).toBeNull();
    expect(classifyPublisherCategory("   ")).toBeNull();
  });
});

describe("detectLicensedProfessionalTerm — §2.3.4 substitution helper", () => {
  test("'lawyer' surfaced", () => {
    expect(
      detectLicensedProfessionalTerm("Reply to my lawyer about the case"),
    ).toBe("lawyer");
  });

  test("'attorney' maps to 'lawyer'", () => {
    expect(
      detectLicensedProfessionalTerm("Tell my attorney about the demand"),
    ).toBe("lawyer");
  });

  test("'CPA' surfaced", () => {
    expect(
      detectLicensedProfessionalTerm(
        "Reply to my CPA about depreciation",
      ),
    ).toBe("CPA");
  });

  test("'accountant' maps to 'CPA'", () => {
    expect(
      detectLicensedProfessionalTerm(
        "Reply to my accountant about cost basis",
      ),
    ).toBe("CPA");
  });

  test("financial advisor → default 'advisor'", () => {
    expect(
      detectLicensedProfessionalTerm(
        "Reply to my financial advisor about the strategy",
      ),
    ).toBe("advisor");
  });

  test("no professional named → 'advisor' default", () => {
    expect(detectLicensedProfessionalTerm("hello world")).toBe("advisor");
  });
});
