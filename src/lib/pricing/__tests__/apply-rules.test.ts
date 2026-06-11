import { applyPricingRules, type PricingRulesRow } from "../apply-rules";

// Villa Jamaica's real inferred config: the comp floor (compSetP25×0.85 = 237.575)
// EXCEEDS the inferred max_rate of 230 — the P4.1 case.
const VILLA_RULES: PricingRulesRow = {
  base_rate: 218,
  min_rate: 181,
  max_rate: 230,
  channel_markups: {},
  max_daily_delta_pct: 0.227,
  comp_floor_pct: 0.85,
  auto_apply: false,
};
const COMP_P25 = 279.5; // → floor 237.575 > max 230

function run(suggestedRate: number, overrides: Partial<Parameters<typeof applyPricingRules>[0]> = {}) {
  return applyPricingRules({
    rules: VILLA_RULES,
    suggestedRate,
    previousAppliedRate: null, // isolate from daily-delta
    compSetP25: COMP_P25,
    compSetQuality: "fallback",
    date: "2026-08-03",
    ...overrides,
  });
}

describe("applyPricingRules — P4.1 per-date ceiling-binding gating", () => {
  it("sub-ceiling date (raw < max): NO conflict trip, rate unchanged, honest reason", () => {
    // The engine wants $210, well under the $230 ceiling — the ceiling does NOT
    // bind this date, so the comp_floor_exceeds_max_rate insight must stay silent.
    const r = run(210);
    expect(r.adjusted_rate).toBe(210);
    expect(r.clamped_by).toEqual([]);
    expect(r.guardrail_trips.find((t) => t.guardrail === "comp_floor_exceeds_max_rate")).toBeUndefined();
    // and crucially we do NOT raise it up to the (above-ceiling) comp floor
    expect(r.adjusted_rate).toBeLessThan(VILLA_RULES.max_rate);
  });

  it("ceiling-bound date (raw > max): conflict trip fires with the comp floor + max", () => {
    // raw $235 → clamped to the $230 ceiling; comps want $237.58 → real conflict.
    const r = run(235);
    expect(r.adjusted_rate).toBe(230);
    expect(r.clamped_by).toContain("max_rate");
    const trip = r.guardrail_trips.find((t) => t.guardrail === "comp_floor_exceeds_max_rate");
    expect(trip).toBeDefined();
    expect(trip?.comp_floor_value).toBeCloseTo(237.575, 2);
    expect(trip?.max_rate).toBe(230);
  });

  it("raw exactly at max: ceiling binds → conflict fires (boundary)", () => {
    // raw == max: not "clamped" (230 is within [min,max]) but the engine wanted
    // exactly the ceiling — that IS the ceiling binding the demand signal.
    const r = run(230);
    expect(r.adjusted_rate).toBe(230);
    expect(r.guardrail_trips.some((t) => t.guardrail === "comp_floor_exceeds_max_rate")).toBe(true);
  });

  it("normal comp floor (floor <= max): sub-floor rate is raised to the floor", () => {
    // A property whose comp floor sits BELOW max — the ordinary clamp still works.
    const rules: PricingRulesRow = { ...VILLA_RULES, max_rate: 300 };
    const r = applyPricingRules({
      rules,
      suggestedRate: 200,
      previousAppliedRate: null,
      compSetP25: COMP_P25, // floor 237.575, now <= max 300
      compSetQuality: "fallback",
      date: "2026-08-03",
    });
    expect(r.adjusted_rate).toBe(237.58); // 237.575 rounded to cents
    expect(r.clamped_by).toContain("comp_floor");
    expect(r.guardrail_trips.some((t) => t.guardrail === "comp_floor_exceeds_max_rate")).toBe(false);
  });

  it("insufficient comp quality: comp floor skipped, never an exceeds-conflict", () => {
    const r = run(235, { compSetQuality: "insufficient" });
    expect(r.guardrail_trips.some((t) => t.guardrail === "comp_floor_exceeds_max_rate")).toBe(false);
    expect(r.guardrail_trips.some((t) => t.skipped_reason === "comp_set_insufficient")).toBe(true);
  });

  it("does not raise a sub-ceiling rate above the ceiling via the comp floor", () => {
    // regression: the above-ceiling floor must NEVER pull a $210 date up past max.
    const r = run(210);
    expect(r.adjusted_rate).toBeLessThanOrEqual(VILLA_RULES.max_rate);
    expect(r.clamped_by).not.toContain("comp_floor");
  });
});
