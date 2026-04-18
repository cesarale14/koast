/**
 * Apply pricing_rules guardrails to an engine-suggested rate.
 *
 * Order: min/max clamp → daily-delta clamp → comp-floor clamp. Each
 * guardrail trip is recorded so the UI can show "Koast wanted to
 * suggest $290 but your max is $260" reasoning.
 *
 * Pure function — never mutates inputs, always returns a fresh result.
 */

export interface PricingRulesRow {
  base_rate: number;
  min_rate: number;
  max_rate: number;
  channel_markups: Record<string, number>;
  max_daily_delta_pct: number;
  comp_floor_pct: number;
  seasonal_overrides?: Record<string, unknown>;
  auto_apply: boolean;
}

export type CompSetQuality = "precise" | "fallback" | "insufficient" | "unknown";

export interface ApplyRulesInput {
  rules: PricingRulesRow;
  suggestedRate: number;
  previousAppliedRate: number | null;
  compSetP25: number | null;
  compSetQuality: CompSetQuality;
  date: string;
}

export interface GuardrailTrip {
  guardrail: "max_daily_delta" | "comp_floor" | "comp_floor_exceeds_max_rate";
  value: number | null;
  threshold: number | null;
  skipped_reason?: string;
  /** Populated only for 'comp_floor_exceeds_max_rate' — surfaces the
   *  conflict ("local market wants $X, your max says $Y") so the UI can
   *  prompt the host to raise their max. */
  comp_floor_value?: number;
  max_rate?: number;
}

export interface ApplyRulesResult {
  adjusted_rate: number;
  clamped_by: Array<"min_rate" | "max_rate" | "comp_floor">;
  guardrail_trips: GuardrailTrip[];
}

export function applyPricingRules(input: ApplyRulesInput): ApplyRulesResult {
  const { rules, suggestedRate, previousAppliedRate, compSetP25, compSetQuality } = input;
  const clamped_by: Array<"min_rate" | "max_rate" | "comp_floor"> = [];
  const guardrail_trips: GuardrailTrip[] = [];

  // 1) Clamp to [min, max].
  let adjusted = suggestedRate;
  if (adjusted < rules.min_rate) {
    adjusted = rules.min_rate;
    clamped_by.push("min_rate");
  } else if (adjusted > rules.max_rate) {
    adjusted = rules.max_rate;
    clamped_by.push("max_rate");
  }

  // 2) Daily delta guardrail. Clamp toward the previous day until the
  //    actual delta equals the cap (not just "below the cap"). Keeps the
  //    resulting rate reproducible instead of hovering just under the
  //    threshold.
  if (previousAppliedRate != null && previousAppliedRate > 0) {
    const delta = Math.abs(adjusted - previousAppliedRate) / previousAppliedRate;
    if (delta > rules.max_daily_delta_pct) {
      const cap = rules.max_daily_delta_pct;
      if (adjusted > previousAppliedRate) {
        adjusted = previousAppliedRate * (1 + cap);
      } else {
        adjusted = previousAppliedRate * (1 - cap);
      }
      guardrail_trips.push({
        guardrail: "max_daily_delta",
        value: delta,
        threshold: cap,
      });
    }
  }

  // 3) Comp-floor guardrail. Skip entirely when comp set is insufficient —
  //    there's no meaningful floor to enforce. When the computed floor
  //    EXCEEDS the host's max_rate, we also don't apply it (max_rate is
  //    an absolute ceiling, not a soft preference); instead we surface
  //    the conflict as an insight so the host can raise their max if they
  //    trust the market signal. This is the fix for the Villa Jamaica case
  //    where inferred max=$230 sat below compSetP25×0.85=$237.58 and
  //    previously produced $240 outputs that walked up the host's intent.
  if (compSetQuality === "insufficient" || compSetQuality === "unknown") {
    guardrail_trips.push({
      guardrail: "comp_floor",
      value: null,
      threshold: null,
      skipped_reason: "comp_set_insufficient",
    });
  } else if (compSetP25 != null) {
    const floor = compSetP25 * rules.comp_floor_pct;
    if (floor > rules.max_rate) {
      guardrail_trips.push({
        guardrail: "comp_floor_exceeds_max_rate",
        value: null,
        threshold: null,
        skipped_reason: "comp_floor_exceeds_max_rate",
        comp_floor_value: floor,
        max_rate: rules.max_rate,
      });
    } else if (adjusted < floor) {
      adjusted = floor;
      clamped_by.push("comp_floor");
      guardrail_trips.push({
        guardrail: "comp_floor",
        value: adjusted,
        threshold: floor,
      });
    }
  }

  return {
    adjusted_rate: Math.round(adjusted * 100) / 100,
    clamped_by,
    guardrail_trips,
  };
}
