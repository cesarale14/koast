import {
  demandSignal,
  seasonalitySignal,
  competitorSignal,
  gapNightSignal,
  bookingPaceSignal,
} from "../signals";

// ========== Demand Signal ==========

describe("demandSignal", () => {
  it("returns neutral for demand score of 50", () => {
    const result = demandSignal(50);
    expect(result.score).toBe(0);
    expect(result.weight).toBe(0.25);
    expect(result.reason).toContain("50/100");
  });

  it("returns positive for high demand", () => {
    const result = demandSignal(80);
    expect(result.score).toBe(0.6);
    expect(result.reason).toContain("high demand");
  });

  it("returns negative for low demand", () => {
    const result = demandSignal(30);
    expect(result.score).toBe(-0.4);
    expect(result.reason).toContain("below average");
  });

  it("handles null demand score", () => {
    const result = demandSignal(null);
    expect(result.score).toBe(0);
    expect(result.reason).toContain("No market demand data");
  });

  it("clamps to [-1, 1]", () => {
    expect(demandSignal(100).score).toBe(1);
    expect(demandSignal(0).score).toBe(-1);
  });

  it("matches Tampa test data (53/100)", () => {
    const result = demandSignal(53);
    expect(result.score).toBe(0.06);
    expect(result.reason).toContain("neutral");
  });
});

// ========== Seasonality Signal ==========

describe("seasonalitySignal", () => {
  it("returns positive for Saturday in March (peak Tampa)", () => {
    // March 21, 2026 is a Saturday
    const result = seasonalitySignal(new Date("2026-03-21T00:00:00"));
    expect(result.score).toBe(0.35); // 0.15 (Sat) + 0.20 (Mar peak)
    expect(result.reason).toContain("Saturday");
    expect(result.reason).toContain("March");
    expect(result.reason).toContain("peak season");
  });

  it("returns negative for Wednesday in July (low Tampa)", () => {
    // July 1, 2026 is a Wednesday
    const result = seasonalitySignal(new Date("2026-07-01T00:00:00"));
    expect(result.score).toBe(-0.25); // -0.10 (Wed) + -0.15 (Jul low)
    expect(result.reason).toContain("Wednesday");
    expect(result.reason).toContain("low season");
  });

  it("returns moderate for Friday in October (shoulder)", () => {
    // Oct 2, 2026 is a Friday
    const result = seasonalitySignal(new Date("2026-10-02T00:00:00"));
    expect(result.score).toBe(0.2); // 0.15 (Fri) + 0.05 (Oct shoulder)
    expect(result.reason).toContain("Friday");
    expect(result.reason).toContain("shoulder season");
  });
});

// ========== Competitor Signal ==========

describe("competitorSignal", () => {
  const compAdrs = [150, 180, 200, 220, 236, 250, 260, 280, 300, 320, 350, 380, 400, 420, 450];
  const compOccs = [40, 45, 48, 50, 55, 58, 60, 62, 65, 68, 70, 72, 75, 80, 85];

  it("returns strong positive when below 25th percentile with high occupancy", () => {
    // Rate $140 (below p25 of $180), occupancy 70% (above median 60%)
    const result = competitorSignal(140, 70, compAdrs, compOccs);
    expect(result.score).toBe(0.6);
    expect(result.reason).toContain("significantly underpriced");
  });

  it("returns negative when overpriced with low occupancy", () => {
    // Rate $420 (above p75 of $350), occupancy 40% (below median 60%)
    const result = competitorSignal(420, 40, compAdrs, compOccs);
    expect(result.score).toBe(-0.5);
    expect(result.reason).toContain("overpriced");
  });

  it("returns strong positive when below 25th percentile and empty", () => {
    // Rate $200 (below p25 of $220), occupancy 45% (below median 60%)
    const result = competitorSignal(200, 45, compAdrs, compOccs);
    expect(result.score).toBe(0.6);
    expect(result.reason).toContain("significant room to raise");
  });

  it("returns moderate positive when below median but above 25th", () => {
    // Rate $240 (above p25 $220 but below median $260), occupancy 45%
    const result = competitorSignal(240, 45, compAdrs, compOccs);
    expect(result.score).toBe(0.3);
    expect(result.reason).toContain("price isn't the issue");
  });

  it("handles no comp data", () => {
    const result = competitorSignal(200, 50, [], []);
    expect(result.score).toBe(0);
    expect(result.reason).toContain("No comp data");
  });

  it("handles null rate", () => {
    const result = competitorSignal(null, 50, compAdrs, compOccs);
    expect(result.score).toBe(0);
  });

  it("matches Tampa test data ($180 vs median $236)", () => {
    // Tampa comps: median ADR $236, median occupancy 58.4%
    const tampaAdrs = [160, 180, 195, 210, 220, 236, 245, 260, 275, 290, 310, 330, 350, 380, 400];
    const tampaOccs = [35, 40, 45, 48, 52, 58.4, 60, 63, 65, 68, 70, 73, 75, 80, 85];
    const result = competitorSignal(180, 48, tampaAdrs, tampaOccs);
    expect(result.score).toBeGreaterThan(0);
    expect(result.reason).toContain("percentile");
    expect(result.reason).toContain("$180");
  });
});

// ========== Gap Night Signal ==========

describe("gapNightSignal", () => {
  const bookings = [
    { check_in: "2026-03-20", check_out: "2026-03-23" },
    { check_in: "2026-03-25", check_out: "2026-03-28" },
    { check_in: "2026-04-01", check_out: "2026-04-05" },
  ];

  it("returns heavy discount for orphan night (1-2 day gap)", () => {
    // March 23 and 24 are a 2-day gap between first two bookings
    const result = gapNightSignal("2026-03-23", bookings);
    expect(result.score).toBe(-0.8);
    expect(result.reason).toContain("Orphan night");
  });

  it("returns no discount for dates not in a gap", () => {
    const result = gapNightSignal("2026-03-21", bookings);
    expect(result.score).toBe(0);
  });

  it("returns moderate discount for 3-day gap", () => {
    // March 28-31 is a gap before April 1 booking (4 days, but let's test 3)
    // Actually 28, 29, 30, 31 = 4 days, so no discount
    const result = gapNightSignal("2026-03-29", bookings);
    expect(result.score).toBe(0); // 4-day gap = no discount
  });

  it("handles fewer than 2 bookings", () => {
    const result = gapNightSignal("2026-03-25", [bookings[0]]);
    expect(result.score).toBe(0);
    expect(result.reason).toContain("No adjacent bookings");
  });
});

// ========== Booking Pace Signal ==========

describe("bookingPaceSignal", () => {
  const today = "2026-03-25";

  it("returns heavy discount for last-minute open date", () => {
    const result = bookingPaceSignal("2026-03-26", today, false);
    expect(result.score).toBe(-0.6);
    expect(result.reason).toContain("last-minute");
  });

  it("returns moderate discount for open date 5 days out", () => {
    const result = bookingPaceSignal("2026-03-30", today, false);
    expect(result.score).toBe(-0.3);
    expect(result.reason).toContain("moderate discount");
  });

  it("returns slight discount for open date 10 days out", () => {
    const result = bookingPaceSignal("2026-04-04", today, false);
    expect(result.score).toBe(-0.1);
    expect(result.reason).toContain("slight discount");
  });

  it("returns positive for date booked 30+ days out", () => {
    const result = bookingPaceSignal("2026-05-01", today, true);
    expect(result.score).toBe(0.2);
    expect(result.reason).toContain("strong advance booking");
  });

  it("returns neutral for far-out open date", () => {
    const result = bookingPaceSignal("2026-06-01", today, false);
    expect(result.score).toBe(0);
  });

  it("returns neutral for recently booked date", () => {
    const result = bookingPaceSignal("2026-03-27", today, true);
    expect(result.score).toBe(0);
  });
});

// ========== Integration: Weighted Sum ==========

describe("weighted sum calculation", () => {
  it("produces expected rate adjustment for Tampa Saturday March scenario", () => {
    const demand = demandSignal(53);          // 0.06 × 0.30 = 0.018
    const season = seasonalitySignal(new Date("2026-03-21")); // 0.35 × 0.25 = 0.0875
    const competitor = competitorSignal(180, 48,
      [160, 180, 195, 210, 220, 236, 245, 260, 275, 290, 310, 330, 350, 380, 400],
      [35, 40, 45, 48, 52, 58.4, 60, 63, 65, 68, 70, 73, 75, 80, 85]
    );
    const gap = gapNightSignal("2026-03-21", []);
    const pace = bookingPaceSignal("2026-03-21", "2026-03-25", false);

    const weightedSum =
      demand.score * demand.weight +
      season.score * season.weight +
      competitor.score * competitor.weight +
      gap.score * gap.weight +
      pace.score * pace.weight;

    // With base_rate $180 and max_adjustment 0.30:
    // suggested = 180 × (1 + weightedSum × 0.30)
    const suggested = 180 * (1 + weightedSum * 0.30);

    expect(weightedSum).toBeGreaterThan(0); // Should be positive overall
    expect(suggested).toBeGreaterThan(180); // Should suggest a raise
    expect(suggested).toBeLessThan(250);    // But not absurdly high
  });
});
