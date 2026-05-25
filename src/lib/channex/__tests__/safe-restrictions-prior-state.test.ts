/**
 * Tests for M11 Phase C item 1 (M2) helpers in safe-restrictions.ts:
 *   - priorStateFromBdcPlan: builds prior_state[] from SafeRestrictionPlan
 *     + successful-dates set
 *   - fetchCurrentChannelState: thin wrapper around getRestrictionsBucketed
 *     for non-BDC pre-flight reads
 *
 * Pure-logic for priorStateFromBdcPlan (no DB); fetchCurrentChannelState
 * mocks the channex client at call boundary.
 */

import {
  priorStateFromBdcPlan,
  fetchCurrentChannelState,
  type SafeRestrictionPlan,
} from "../safe-restrictions";

describe("priorStateFromBdcPlan", () => {
  const baseEmptyPlan: SafeRestrictionPlan = {
    entries_to_push: [],
    dates_to_open: [],
    dates_to_close: [],
    rate_changes: [],
    min_stay_changes: [],
    skipped_fields: [],
    bdc_state_fetched_at: "2026-05-25T08:00:00Z",
  };

  test("returns only entries for successful dates with non-null from-state", () => {
    const plan: SafeRestrictionPlan = {
      ...baseEmptyPlan,
      rate_changes: [
        { date: "2026-06-01", from: 200, to: 220, delta_pct: 0.10 },
        { date: "2026-06-02", from: 210, to: 230, delta_pct: 0.095 },
        { date: "2026-06-03", from: 205, to: 215, delta_pct: 0.049 },
      ],
      min_stay_changes: [
        { date: "2026-06-02", from: 2, to: 1 },
      ],
    };
    const successfulDates = new Set(["2026-06-01", "2026-06-02"]);

    const result = priorStateFromBdcPlan(plan, "BDC", successfulDates);
    expect(result).toHaveLength(2);
    expect(result.find((e) => e.date === "2026-06-01")).toEqual({
      date: "2026-06-01",
      channel: "BDC",
      rate: 200,
      min_stay_arrival: null,
    });
    expect(result.find((e) => e.date === "2026-06-02")).toEqual({
      date: "2026-06-02",
      channel: "BDC",
      rate: 210,
      min_stay_arrival: 2,
    });
    // 2026-06-03 had rate_change but was NOT in successfulDates → excluded
    expect(result.find((e) => e.date === "2026-06-03")).toBeUndefined();
  });

  test("filters dates with both rate=null and min_stay=null (nothing to revert)", () => {
    // Date is in successfulDates but has no rate_change AND no min_stay_change
    // → can't revert (no prior field captured)
    const plan: SafeRestrictionPlan = {
      ...baseEmptyPlan,
      rate_changes: [{ date: "2026-06-01", from: 200, to: 220, delta_pct: 0.10 }],
    };
    const successfulDates = new Set(["2026-06-01", "2026-06-99"]);

    const result = priorStateFromBdcPlan(plan, "BDC", successfulDates);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-06-01");
  });

  test("handles plans with empty rate_changes + min_stay_changes (no entries)", () => {
    const successfulDates = new Set(["2026-06-01"]);
    const result = priorStateFromBdcPlan(baseEmptyPlan, "BDC", successfulDates);
    expect(result).toEqual([]);
  });

  test("propagates channel name into emitted entries", () => {
    const plan: SafeRestrictionPlan = {
      ...baseEmptyPlan,
      rate_changes: [{ date: "2026-06-01", from: 200, to: 220, delta_pct: 0.10 }],
    };
    const result = priorStateFromBdcPlan(plan, "CUSTOM_CHANNEL", new Set(["2026-06-01"]));
    expect(result[0].channel).toBe("CUSTOM_CHANNEL");
  });
});

describe("fetchCurrentChannelState", () => {
  function makeMockChannex(bucketedResult: Record<string, Record<string, unknown>>) {
    return {
      getRestrictionsBucketed: jest.fn().mockResolvedValue(bucketedResult),
    };
  }

  test("returns Map<date, CapturedPriorState> normalized from bucketed result", async () => {
    const channex = makeMockChannex({
      "rate-plan-1": {
        "2026-06-01": { rate: "200.00", min_stay_arrival: 1 },
        "2026-06-02": { rate: "210.00", min_stay_arrival: 2 },
      },
    }) as unknown as Parameters<typeof fetchCurrentChannelState>[0]["channex"];

    const result = await fetchCurrentChannelState({
      channex,
      channexPropertyId: "ch-prop-1",
      ratePlanId: "rate-plan-1",
      channel: "ABB",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-02",
    });

    expect(result.size).toBe(2);
    expect(result.get("2026-06-01")).toEqual({
      date: "2026-06-01",
      channel: "ABB",
      rate: 200,
      min_stay_arrival: 1,
    });
    expect(result.get("2026-06-02")).toEqual({
      date: "2026-06-02",
      channel: "ABB",
      rate: 210,
      min_stay_arrival: 2,
    });
  });

  test("returns empty Map when rate plan absent from bucketed result", async () => {
    const channex = makeMockChannex({}) as unknown as Parameters<typeof fetchCurrentChannelState>[0]["channex"];

    const result = await fetchCurrentChannelState({
      channex,
      channexPropertyId: "ch-prop-1",
      ratePlanId: "unknown-rate-plan",
      channel: "ABB",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-02",
    });

    expect(result.size).toBe(0);
  });

  test("treats rate='0.00' as null (unset) per buildSafeBdcRestrictions convention", async () => {
    const channex = makeMockChannex({
      "rate-plan-1": {
        "2026-06-01": { rate: "0.00", min_stay_arrival: 1 },
        "2026-06-02": { rate: "", min_stay_arrival: 1 },
      },
    }) as unknown as Parameters<typeof fetchCurrentChannelState>[0]["channex"];

    const result = await fetchCurrentChannelState({
      channex,
      channexPropertyId: "ch-prop-1",
      ratePlanId: "rate-plan-1",
      channel: "ABB",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-02",
    });

    expect(result.get("2026-06-01")?.rate).toBeNull();
    expect(result.get("2026-06-02")?.rate).toBeNull();
  });
});
