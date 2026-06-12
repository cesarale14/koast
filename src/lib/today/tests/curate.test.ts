/**
 * curateToday gate — asserts the DERIVED FACTS of the two curation rules
 * (same-type grouping; gap/movement separation), never a rendered string. The
 * component owns the prose; the curation is what has to be correct.
 */
import { curateToday, partitionImminentGaps } from "@/lib/today/curate";
import { deriveGreeting } from "@/lib/today/deriveGreeting";
import type { AgendaRenderPayload, AgendaGap } from "@/lib/agent/render/types";

const payload = (over: Partial<AgendaRenderPayload>): AgendaRenderPayload => ({
  v: 1,
  kind: "agenda",
  horizon: "today_48h",
  today: "2026-06-03",
  groups: { today: [], upcoming: [] },
  gaps: [],
  nullTzPropertyCount: 0,
  ...over,
});

describe("curateToday — group same-type events", () => {
  it("a named + a nameless checkout collapse to ONE line: count 2, Jeremy leads, +1 nameless", () => {
    const c = curateToday(
      payload({
        groups: {
          today: [
            {
              property: "Villa",
              checkOuts: [
                { guest: "Jeremy", date: "2026-06-03" },
                { guest: null, date: "2026-06-03" },
              ],
              checkIns: [],
              turnovers: [],
            },
          ],
          upcoming: [],
        },
      }),
    );
    expect(c.today).toHaveLength(1);
    const m = c.today[0].movements;
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ kind: "checkout", count: 2, named: ["Jeremy"], namelessCount: 1 });
    // loses + dupes nothing
    expect(m[0].count).toBe(m[0].named.length + m[0].namelessCount);
  });

  it("keeps check-out before check-in and sums check-in guests", () => {
    const c = curateToday(
      payload({
        groups: {
          today: [
            {
              property: "Villa",
              checkOuts: [{ guest: "Ana", date: "2026-06-03" }],
              checkIns: [{ guest: "Maya", date: "2026-06-03", numGuests: 2 }],
              turnovers: [],
            },
          ],
          upcoming: [],
        },
      }),
    );
    const m = c.today[0].movements;
    expect(m.map((x) => x.kind)).toEqual(["checkout", "checkin"]);
    expect(m[1].guests).toBe(2);
  });

  it("upcoming: same-type events on different days stay separate lines (no date loss)", () => {
    const c = curateToday(
      payload({
        groups: {
          today: [],
          upcoming: [
            {
              property: "Villa",
              checkOuts: [
                { guest: null, date: "2026-06-04" },
                { guest: null, date: "2026-06-05" },
              ],
              checkIns: [],
              turnovers: [],
            },
          ],
        },
      }),
    );
    const m = c.upcoming[0].movements;
    expect(m).toHaveLength(2);
    expect(m.map((x) => x.date)).toEqual(["2026-06-04", "2026-06-05"]);
  });
});

describe("curateToday — separate gaps from movements", () => {
  it("gaps live ONLY in .gaps; the property's movements carry no turnover/cleaner info", () => {
    const c = curateToday(
      payload({
        groups: {
          today: [
            {
              property: "Villa",
              checkOuts: [{ guest: "Jeremy", date: "2026-06-03" }],
              checkIns: [],
              turnovers: [{ date: "2026-06-03", time: null, cleanerAssigned: false }],
            },
          ],
          upcoming: [],
        },
        gaps: [{ kind: "no_cleaner", property: "Villa", date: "2026-06-03" }],
      }),
    );
    expect(c.gaps).toHaveLength(1);
    expect(c.today[0].movements.map((m) => m.kind)).toEqual(["checkout"]); // no turnover line
  });

  it("a property whose only event is an unstaffed turnover is NOT a block row — its gap is in NEEDS YOU", () => {
    const c = curateToday(
      payload({
        groups: {
          today: [
            {
              property: "Cozy",
              checkOuts: [],
              checkIns: [],
              turnovers: [{ date: "2026-06-03", time: null, cleanerAssigned: false }],
            },
          ],
          upcoming: [],
        },
        gaps: [{ kind: "no_cleaner", property: "Cozy", date: "2026-06-03" }],
      }),
    );
    expect(c.today).toHaveLength(0); // movement-less → not rendered as a block
    expect(c.gaps).toHaveLength(1); // but the gap is still surfaced
    expect(c.empty).toBe(false);
  });

  it("fully empty payload → empty:true with empty sections", () => {
    expect(curateToday(payload({}))).toMatchObject({ today: [], upcoming: [], gaps: [], empty: true });
  });
});

// A2 (5b) — the "Needs you" imminence window (today + 48h).
describe("partitionImminentGaps", () => {
  const TODAY = "2026-06-03";
  const gap = (over: Partial<AgendaGap>): AgendaGap => ({ kind: "no_cleaner", property: "Villa", ...over });

  it("a dated gap inside the window is imminent", () => {
    const r = partitionImminentGaps([gap({ date: "2026-06-04" })], TODAY, 2);
    expect(r.imminent).toHaveLength(1);
    expect(r.upcomingCount).toBe(0);
  });

  it("a dated gap beyond the window folds into upcomingCount", () => {
    const r = partitionImminentGaps([gap({ date: "2026-06-10" })], TODAY, 2);
    expect(r.imminent).toHaveLength(0);
    expect(r.upcomingCount).toBe(1);
  });

  it("the window edge (today + windowDays) is inclusive", () => {
    const r = partitionImminentGaps([gap({ date: "2026-06-05" })], TODAY, 2);
    expect(r.imminent).toHaveLength(1);
  });

  it("undated gaps are always imminent (not time-bound)", () => {
    const r = partitionImminentGaps([gap({}), gap({ kind: "awaiting_reply", guest: "Sam" })], TODAY, 2);
    expect(r.imminent).toHaveLength(2);
    expect(r.upcomingCount).toBe(0);
  });

  it("never loses or dupes a gap: imminent + upcomingCount === total", () => {
    const gaps = [gap({ date: "2026-06-03" }), gap({ date: "2026-06-09" }), gap({}), gap({ date: "2026-06-20" })];
    const r = partitionImminentGaps(gaps, TODAY, 2);
    expect(r.imminent.length + r.upcomingCount).toBe(gaps.length);
  });
});

// A2 (5a) — pin the headline-count ↔ rendered-gaps consistency: the greeting's
// turnover count and the rendered no_cleaner rows BOTH derive from payload.gaps,
// so they can never diverge. This locks that invariant.
describe("greeting turnover count == rendered no_cleaner gaps (A2 5a)", () => {
  it("the deriveGreeting turnovers count equals the no_cleaner gap rows", () => {
    const gaps: AgendaGap[] = [
      { kind: "no_cleaner", property: "Villa" },
      { kind: "no_cleaner", property: "Loft" },
      { kind: "awaiting_reply", property: "Villa", guest: "Sam" },
    ];
    const p = payload({ gaps });
    const greeting = deriveGreeting(p, "Cesar", 9);
    const turnovers = greeting.gaps.find((g) => g.category === "turnovers");
    const rendered = curateToday(p).gaps.filter((g) => g.kind === "no_cleaner");
    expect(turnovers?.count).toBe(rendered.length);
    expect(turnovers?.count).toBe(2);
  });
});
