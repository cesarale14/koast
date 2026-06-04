/**
 * curateToday gate — asserts the DERIVED FACTS of the two curation rules
 * (same-type grouping; gap/movement separation), never a rendered string. The
 * component owns the prose; the curation is what has to be correct.
 */
import { curateToday } from "@/lib/today/curate";
import type { AgendaRenderPayload } from "@/lib/agent/render/types";

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
