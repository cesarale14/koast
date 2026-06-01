/**
 * agendaCardLines — guard for the AgendaCard UPCOMING date label. A multi-day
 * UPCOMING group (e.g. check-outs on two different days) must show its items'
 * ACTUAL distinct dates, never just the first item's date stamped over the whole
 * group (which displayed a Jun-3 item as "Jun 2" — a false date). TODAY carries
 * no per-item date and must stay byte-identical.
 */
import { propertyBlockLines } from "@/components/chat/agendaCardLines";
import type { AgendaPropertyGroup } from "@/lib/agent/render/types";

// The real symptom shape: Villa Jamaica with a check-out, a check-in, and a
// turnover on EACH of Jun 2 and Jun 3.
const MULTI_DAY_UPCOMING: AgendaPropertyGroup = {
  property: "Villa Jamaica",
  checkOuts: [
    { guest: null, date: "2026-06-02" },
    { guest: null, date: "2026-06-03" },
  ],
  checkIns: [
    { guest: null, date: "2026-06-02", numGuests: null },
    { guest: null, date: "2026-06-03", numGuests: null },
  ],
  turnovers: [
    { date: "2026-06-02", time: null, cleanerAssigned: false },
    { date: "2026-06-03", time: null, cleanerAssigned: false },
  ],
};

describe("propertyBlockLines — UPCOMING shows the items' actual dates", () => {
  it("a multi-day group shows BOTH distinct dates, never just the first", () => {
    expect(propertyBlockLines(MULTI_DAY_UPCOMING, true)).toEqual([
      "2 check-outs · Jun 2, Jun 3",
      "2 check-ins · Jun 2, Jun 3",
      "2 turnovers",
    ]);
  });

  it("a single-day UPCOMING group shows the one date (unchanged)", () => {
    const g: AgendaPropertyGroup = {
      property: "Cozy Loft",
      checkOuts: [{ guest: "Dana", date: "2026-06-02" }],
      checkIns: [],
      turnovers: [{ date: "2026-06-02", time: null, cleanerAssigned: false }],
    };
    expect(propertyBlockLines(g, true)).toEqual([
      "1 check-out (Dana) · Jun 2",
      "1 turnover",
    ]);
  });

  it("TODAY carries no per-item date (byte-identical to pre-change)", () => {
    const g: AgendaPropertyGroup = {
      property: "Villa Jamaica",
      checkOuts: [
        { guest: "Jeremy", date: "2026-05-31" },
        { guest: null, date: "2026-05-31" },
      ],
      checkIns: [{ guest: null, date: "2026-05-31", numGuests: 3 }],
      turnovers: [],
    };
    expect(propertyBlockLines(g, false)).toEqual([
      "2 check-outs (Jeremy, +1)",
      "1 check-in",
    ]);
  });
});
