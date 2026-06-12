/**
 * agenda-render — DETERMINISTIC canary on toAgendaRenderPayload (no model, no
 * DB). This is Phase B's gate: it pins the typed payload shape, the per-property
 * counts, the today/upcoming split, the gap derivation, and the NO-IDS invariant
 * before the component ever touches the payload.
 */
import { toAgendaRenderPayload } from "@/lib/agent/render/agenda";
import { renderPayloadSchema } from "@/lib/agent/render/types";
import type { AgendaRollup } from "@/lib/agent/agenda";

// Multi-property + mixed days (the prod shape): Villa has 2 check-outs today +
// 1 on today+2; Cozy has 1 check-out today; two unstaffed turnovers; one guest
// awaiting a reply.
const SPLIT: AgendaRollup = {
  today: "2026-05-31",
  windowEnd: "2026-06-02",
  checkIns: [{ property: "Villa Jamaica", guest: null, date: "2026-05-31", numGuests: 3, bookingId: "B1" }],
  checkOuts: [
    { property: "Cozy Loft - Tampa", guest: null, date: "2026-05-31", turnoverScheduled: true, bookingId: "B2" },
    { property: "Villa Jamaica", guest: "Jeremy", date: "2026-05-31", turnoverScheduled: false, bookingId: "B3" },
    { property: "Villa Jamaica", guest: null, date: "2026-05-31", turnoverScheduled: false, bookingId: "B4" },
    { property: "Villa Jamaica", guest: null, date: "2026-06-02", turnoverScheduled: true, bookingId: "B5" },
  ],
  turnovers: [
    { property: "Cozy Loft - Tampa", date: "2026-05-31", time: null, cleanerAssigned: false },
    { property: "Villa Jamaica", date: "2026-06-02", time: "11:30:00", cleanerAssigned: false },
  ],
  pendingMessages: [{ property: "Villa Jamaica", guest: "Jeremy", preview: "Can I check in early?", bookingId: "B3" }],
  recentCheckouts: [],
  empty: false,
  nullTzPropertyCount: 1,
};

const EMPTY: AgendaRollup = {
  today: "2026-05-31",
  windowEnd: "2026-06-02",
  checkIns: [],
  checkOuts: [],
  turnovers: [],
  pendingMessages: [],
  recentCheckouts: [],
  empty: true,
  nullTzPropertyCount: 0,
};

describe("toAgendaRenderPayload — payload canary", () => {
  // Villa is missing check-in essentials (shared source: classifySufficiency,
  // passed in as property nicknames).
  const p = toAgendaRenderPayload(SPLIT, ["Villa Jamaica"]);

  it("has the typed envelope", () => {
    expect(p.v).toBe(1);
    expect(p.kind).toBe("agenda");
    expect(p.horizon).toBe("today_48h");
    expect(p.today).toBe("2026-05-31");
  });

  it("validates against the contract schema", () => {
    expect(renderPayloadSchema.safeParse(p).success).toBe(true);
  });

  // This is the DETERMINISTIC gate for per-property COUNT correctness on the
  // multi-property mixed-day split shape (A=2-today-not-3 + 1-upcoming, B=1-today)
  // — the count the agent-eval "checkout-split-multi" case used to assert against
  // the model's PROSE token ("two"), which false-failed on correct phrasing. The
  // count is gated HERE; the model's prose CONVEYANCE of it is best-effort
  // presentation and is no longer hard-asserted anywhere. Flip a toBe() below to
  // confirm this gate is live (it characterizes groupAgenda's bucketing).
  it("groups TODAY per property with that property's own counts (count-correctness gate)", () => {
    const villa = p.groups.today.find((g) => g.property === "Villa Jamaica");
    const cozy = p.groups.today.find((g) => g.property === "Cozy Loft - Tampa");
    expect(villa?.checkOuts.length).toBe(2); // Jeremy + 1 nameless — NOT 3
    expect(villa?.checkIns.length).toBe(1);
    expect(cozy?.checkOuts.length).toBe(1);
    // every today item is actually dated today (the later one is held out)
    expect(p.groups.today.flatMap((g) => g.checkOuts).every((c) => c.date === "2026-05-31")).toBe(true);
  });

  it("puts the later in-window item in UPCOMING, never today", () => {
    const upVilla = p.groups.upcoming.find((g) => g.property === "Villa Jamaica");
    expect(upVilla?.checkOuts.length).toBe(1);
    expect(upVilla?.checkOuts[0].date).toBe("2026-06-02");
  });

  it("derives the salient gap flags — STRUCTURED, no pre-rendered text", () => {
    const noCleaner = p.gaps.filter((g) => g.kind === "no_cleaner");
    expect(noCleaner.length).toBe(2);
    // Dated + horizon-ordered: today's gap first, the later one second — each
    // carries its turnover date so two no_cleaners on one property can't collide.
    expect(noCleaner[0]).toMatchObject({ property: "Cozy Loft - Tampa", date: "2026-05-31" });
    expect(noCleaner[1]).toMatchObject({ property: "Villa Jamaica", date: "2026-06-02" });

    const awaiting = p.gaps.filter((g) => g.kind === "awaiting_reply");
    expect(awaiting.length).toBe(1);
    expect(awaiting[0].property).toBe("Villa Jamaica");
    expect(awaiting[0].guest).toBe("Jeremy"); // realFirstName / null convention

    const essentials = p.gaps.filter((g) => g.kind === "missing_essentials");
    expect(essentials.length).toBe(1);
    expect(essentials[0].property).toBe("Villa Jamaica");

    // No pre-rendered English crosses the wire — the card renders the sentence.
    expect(p.gaps.every((g) => !("detail" in g))).toBe(true);
  });

  it("awaiting_reply carries guest = null for a nameless pending message", () => {
    const r: AgendaRollup = {
      ...EMPTY,
      empty: false,
      pendingMessages: [{ property: "Seaside Cottage", guest: null, preview: "hello?", bookingId: "B9" }],
    };
    const aw = toAgendaRenderPayload(r).gaps.find((g) => g.kind === "awaiting_reply");
    expect(aw?.guest).toBeNull();
  });

  it("carries the null-tz property count", () => {
    expect(p.nullTzPropertyCount).toBe(1);
  });

  it("contains NO ids (host-facing payload)", () => {
    const json = JSON.stringify(p);
    expect(json).not.toContain("bookingId");
    expect(json).not.toMatch(/\bB[1-9]\b/); // the fixture booking ids
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i); // any uuid
  });

  it("renders an empty rollup as an empty-but-valid payload", () => {
    const e = toAgendaRenderPayload(EMPTY);
    expect(e.groups.today).toEqual([]);
    expect(e.groups.upcoming).toEqual([]);
    expect(e.gaps).toEqual([]);
    expect(renderPayloadSchema.safeParse(e).success).toBe(true);
  });
});
