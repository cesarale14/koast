import { todayView } from "../todayView";

/**
 * P7.1: the first-run state (zero properties) and the all-set state (≥1
 * property, nothing scheduled) must never collapse into each other — that
 * collapse was the onboarding dead-end (a brand-new account saw "you're all
 * set" instead of a way in).
 */
describe("todayView", () => {
  it("0 properties → first_run, even when the agenda is empty", () => {
    expect(todayView(true, true)).toBe("first_run");
    expect(todayView(true, false)).toBe("first_run");
  });

  it("≥1 property with nothing scheduled → all_set (NOT first_run)", () => {
    expect(todayView(false, true)).toBe("all_set");
  });

  it("≥1 property with movements → agenda", () => {
    expect(todayView(false, false)).toBe("agenda");
  });

  it("undefined firstRun behaves as ≥1 property", () => {
    expect(todayView(undefined, true)).toBe("all_set");
    expect(todayView(undefined, false)).toBe("agenda");
  });
});
