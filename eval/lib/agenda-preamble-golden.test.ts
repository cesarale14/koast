/**
 * agenda-preamble-golden — DETERMINISTIC byte-identity lock on agendaPreamble
 * (no model). The groupAgenda extraction (Phase B) refactored the preamble to
 * share its day→property transform with the render payload; this pins the
 * prose output byte-for-byte so the refactor (and any future one) can't silently
 * change what the model reads. Goldens captured from the pre-extraction output.
 */
import { agendaPreamble } from "@/lib/agent/agenda";
import type { AgendaRollup } from "@/lib/agent/agenda";

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

const SPLIT: AgendaRollup = {
  today: "2026-05-31",
  windowEnd: "2026-06-02",
  checkIns: [{ property: "Villa Jamaica", guest: null, date: "2026-05-31", numGuests: null, bookingId: "B1" }],
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
  pendingMessages: [{ property: "Villa Jamaica", guest: "Jeremy", preview: "Hey, can I check in early?", bookingId: "B3" }],
  recentCheckouts: [],
  empty: false,
  nullTzPropertyCount: 1,
};

const GOLDEN_EMPTY =
  "[OPERATIONAL AGENDA — live Koast data for this host. Koast IS the operating layer; this is in-house. The booking ids below are AGENT-INTERNAL: use them only as tool-call arguments, and NEVER show an id to the host. Refer to guests by first name and properties by nickname.]\nToday is 2026-05-31; the window is today + the next 48h. Items are grouped TODAY vs UPCOMING and listed per property, each property carrying its OWN counts — read each property's line as written. Never re-tally across properties, never move an item between days, and never report an UPCOMING item as today.\nNothing on the calendar in the next 48h — no check-ins, check-outs, turnovers, or guests awaiting reply.\n[end operational agenda]\n\n";

const GOLDEN_SPLIT =
  "[OPERATIONAL AGENDA — live Koast data for this host. Koast IS the operating layer; this is in-house. The booking ids below are AGENT-INTERNAL: use them only as tool-call arguments, and NEVER show an id to the host. Refer to guests by first name and properties by nickname.]\nToday is 2026-05-31; the window is today + the next 48h. Items are grouped TODAY vs UPCOMING and listed per property, each property carrying its OWN counts — read each property's line as written. Never re-tally across properties, never move an item between days, and never report an UPCOMING item as today.\nTODAY'S URGENT GAPS (2) — you MUST state EVERY one of these to the host, in plain terms (the property, what's missing, who's affected today); they are time-sensitive and must never be dropped. There are 2, so never call it \"the one thing\" or describe a single item when more than one needs attention: Cozy Loft - Tampa: a turnover is scheduled TODAY with NO cleaner assigned; Villa Jamaica: missing check-in essentials (door/access, wifi, or parking) for a guest arriving today\nTODAY (2026-05-31):\nCozy Loft - Tampa: 1 check-out (a checkout, turnover scheduled (internal booking id for tools: B2)); 1 turnover (scheduled, NO cleaner assigned)\nVilla Jamaica: 2 check-outs (Jeremy checking out, no turnover scheduled (internal booking id for tools: B3); a checkout, no turnover scheduled (internal booking id for tools: B4)); 1 check-in (a check-in (internal booking id for tools: B1))\nUPCOMING (rest of the next 48h, after today):\nVilla Jamaica: 1 check-out (a checkout on 2026-06-02, turnover scheduled (internal booking id for tools: B5)); 1 turnover (on 2026-06-02 at 11:30:00, NO cleaner assigned)\nGuests who may be awaiting a reply (1; heuristic — present softly, e.g. \"looks like X may be waiting\"): Jeremy at Villa Jamaica — \"Hey, can I check in early?\" (internal booking id for tools: B3)\nNote: 1 property has no timezone set, so its schedule is NOT included above — if the host asks about that property, say its location/timezone needs setting first (don't imply nothing is scheduled there).\nProperty gaps: 1 of 2 properties are missing check-in essentials (door/access, wifi, or parking) — drafting guest messages for those is limited until filled.\n[end operational agenda]\n\n";

describe("agendaPreamble — byte-identity golden (groupAgenda extraction lock)", () => {
  it("empty rollup renders byte-identically", () => {
    expect(agendaPreamble(EMPTY)).toBe(GOLDEN_EMPTY);
  });
  it("multi-property split rollup (with gaps) renders byte-identically", () => {
    expect(agendaPreamble(SPLIT, { missing: 1, total: 2 }, ["Villa Jamaica"])).toBe(GOLDEN_SPLIT);
  });
});
