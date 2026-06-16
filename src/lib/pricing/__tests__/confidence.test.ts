import { isLowConfidenceRec } from "../confidence";

/**
 * P7 guardrail: a rec is low-confidence when the comp set is insufficient
 * (competitor confidence 0) — so the surfaces label it as an early estimate.
 * Fallback comps (confidence 0.5) are NOT low-confidence.
 */
describe("isLowConfidenceRec", () => {
  it("true when the competitor signal has confidence 0 (insufficient/unknown comps)", () => {
    expect(
      isLowConfidenceRec({ competitor: { score: 0, weight: 0.2, confidence: 0 } }),
    ).toBe(true);
  });

  it("true when a comp_floor guardrail tripped for comp_set_insufficient", () => {
    expect(
      isLowConfidenceRec({
        clamps: { guardrail_trips: [{ guardrail: "comp_floor", skipped_reason: "comp_set_insufficient" }] },
      }),
    ).toBe(true);
  });

  it("false for fallback comps (confidence 0.5 is medium, not low)", () => {
    expect(
      isLowConfidenceRec({ competitor: { score: 0.1, weight: 0.2, confidence: 0.5 } }),
    ).toBe(false);
  });

  it("false for precise comps (confidence 1.0 / omitted)", () => {
    expect(isLowConfidenceRec({ competitor: { score: 0.2, weight: 0.2, confidence: 1 } })).toBe(false);
    expect(isLowConfidenceRec({ competitor: { score: 0.2, weight: 0.2 } })).toBe(false);
  });

  it("false for null / non-object / empty", () => {
    expect(isLowConfidenceRec(null)).toBe(false);
    expect(isLowConfidenceRec(undefined)).toBe(false);
    expect(isLowConfidenceRec({})).toBe(false);
  });

  it("real new-property reason_signals shape → low-confidence", () => {
    // the exact shape the validator wrote for the fresh Free/iCal property
    expect(
      isLowConfidenceRec({
        competitor: { score: 0, reason: "No comp data available", weight: 0.2, confidence: 0 },
        clamps: {
          guardrail_trips: [{ guardrail: "comp_floor", skipped_reason: "comp_set_insufficient" }],
          raw_engine_suggestion: 140.38,
        },
        seasonality: { score: -0.25, weight: 0.15 },
      }),
    ).toBe(true);
  });
});
