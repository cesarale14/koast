/**
 * Schema tests for AgentTextOutput — M9 Phase B F3 substrate (D22).
 */

import {
  AgentTextOutputSchema,
  SourceRefSchema,
} from "../agent-text-output";

describe("AgentTextOutputSchema", () => {
  test("valid minimal envelope passes (required fields only)", () => {
    const result = AgentTextOutputSchema.safeParse({
      content: "hi there",
      confidence: "confirmed",
      source_attribution: [],
    });
    expect(result.success).toBe(true);
  });

  test("valid envelope with all optional fields passes", () => {
    const result = AgentTextOutputSchema.safeParse({
      content: "Saturday's empty 8 days out",
      confidence: "high_inference",
      source_attribution: [
        { type: "memory_fact", id: "uuid-1", label: "Villa Jamaica wifi" },
      ],
      hedge: "based on the last 30 days",
      output_grounding: "rich",
    });
    expect(result.success).toBe(true);
  });

  test("empty content fails (min 1 char)", () => {
    const result = AgentTextOutputSchema.safeParse({
      content: "",
      confidence: "confirmed",
      source_attribution: [],
    });
    expect(result.success).toBe(false);
  });

  test("invalid confidence enum fails", () => {
    const result = AgentTextOutputSchema.safeParse({
      content: "hi",
      confidence: "very_confident",
      source_attribution: [],
    });
    expect(result.success).toBe(false);
  });

  test("source_attribution is required (must be array, not omitted)", () => {
    const result = AgentTextOutputSchema.safeParse({
      content: "hi",
      confidence: "confirmed",
    });
    expect(result.success).toBe(false);
  });
});

describe("SourceRefSchema", () => {
  test("requires non-empty type + id", () => {
    expect(
      SourceRefSchema.safeParse({ type: "memory_fact", id: "uuid-1" }).success,
    ).toBe(true);
    expect(SourceRefSchema.safeParse({ type: "", id: "x" }).success).toBe(false);
    expect(SourceRefSchema.safeParse({ type: "memory_fact" }).success).toBe(false);
  });

  test("label is optional", () => {
    const result = SourceRefSchema.safeParse({
      type: "memory_fact",
      id: "uuid-1",
    });
    expect(result.success).toBe(true);
    expect(result.data?.label).toBeUndefined();
  });
});
