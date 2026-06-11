import { isRecFresh, filterFreshRecs, todayStrUTC, REC_VALIDITY_DAYS } from "../freshness";

// Fixed "now": 2026-06-11T18:00:00Z
const NOW = "2026-06-11T18:00:00.000Z";
const TODAY = "2026-06-11";
const YESTERDAY = "2026-06-10";
const TOMORROW = "2026-06-12";

describe("todayStrUTC", () => {
  it("extracts the UTC calendar date", () => {
    expect(todayStrUTC(NOW)).toBe(TODAY);
  });
});

describe("isRecFresh", () => {
  it("fresh: today's date, run created just now", () => {
    expect(isRecFresh({ date: TODAY, createdAt: NOW }, NOW)).toBe(true);
  });

  it("fresh: future date, run created today", () => {
    expect(isRecFresh({ date: "2026-09-09", createdAt: NOW }, NOW)).toBe(true);
  });

  it("expired: target night already passed (yesterday)", () => {
    // even with a brand-new run, a past night is never actionable
    expect(isRecFresh({ date: YESTERDAY, createdAt: NOW }, NOW)).toBe(false);
  });

  it("expired: the stale Apr–Jun set — past date AND old run", () => {
    expect(isRecFresh({ date: "2026-04-18", createdAt: "2026-04-18T10:00:00Z" }, NOW)).toBe(false);
  });

  it("stale: future date but the producing run is older than the window", () => {
    // future night, but the run is REC_VALIDITY_DAYS+1 old → engine went quiet
    const oldRun = "2026-06-08T18:00:00.000Z"; // 3 days ago, window is 2
    expect(isRecFresh({ date: TOMORROW, createdAt: oldRun }, NOW)).toBe(false);
  });

  it("boundary: run exactly REC_VALIDITY_DAYS old is still fresh", () => {
    const edge = new Date(Date.parse(NOW) - REC_VALIDITY_DAYS * 86_400_000).toISOString();
    expect(isRecFresh({ date: TOMORROW, createdAt: edge }, NOW)).toBe(true);
  });

  it("stale: missing/unparseable createdAt fails closed", () => {
    expect(isRecFresh({ date: TOMORROW, createdAt: null }, NOW)).toBe(false);
    expect(isRecFresh({ date: TOMORROW, createdAt: "not-a-date" }, NOW)).toBe(false);
  });

  it("honors a custom validityDays", () => {
    const fiveDaysAgo = new Date(Date.parse(NOW) - 5 * 86_400_000).toISOString();
    expect(isRecFresh({ date: TOMORROW, createdAt: fiveDaysAgo }, NOW, 2)).toBe(false);
    expect(isRecFresh({ date: TOMORROW, createdAt: fiveDaysAgo }, NOW, 7)).toBe(true);
  });
});

describe("filterFreshRecs", () => {
  it("drops past-date + stale-run rows, keeps fresh future rows, preserves order", () => {
    const recs = [
      { date: "2026-04-18", createdAt: "2026-04-18T10:00:00Z", id: "past" },
      { date: TODAY, createdAt: NOW, id: "today" },
      { date: "2026-09-09", createdAt: NOW, id: "future-fresh" },
      { date: "2026-09-10", createdAt: "2026-06-01T10:00:00Z", id: "future-stale-run" },
    ];
    const out = filterFreshRecs(recs, NOW);
    expect(out.map((r) => r.id)).toEqual(["today", "future-fresh"]);
  });
});
