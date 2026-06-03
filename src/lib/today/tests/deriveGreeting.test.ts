/**
 * deriveGreeting gate — asserts the DERIVED FACTS (category, count, tone, order),
 * never a rendered string. That's the whole point of returning structured facts:
 * the greeting prose is the component's job, so there's nothing here to assert
 * brittly (the checkout-split lesson as a design property).
 */
import { deriveGreeting } from "@/lib/today/deriveGreeting";
import type { AgendaRenderPayload } from "@/lib/agent/render/types";

const base = (gaps: AgendaRenderPayload["gaps"]): AgendaRenderPayload => ({
  v: 1,
  kind: "agenda",
  horizon: "today_48h",
  today: "2026-06-03",
  groups: { today: [], upcoming: [] },
  gaps,
  nullTzPropertyCount: 0,
});

describe("deriveGreeting — structured facts, not phrasing", () => {
  it("2 no_cleaner gaps → attention + turnovers:2 (the count/category, not a string)", () => {
    const g = deriveGreeting(
      base([
        { kind: "no_cleaner", property: "Villa Jamaica", date: "2026-06-03" },
        { kind: "no_cleaner", property: "Cozy Loft", date: "2026-06-04" },
      ]),
      "Cesar",
      9,
    );
    expect(g.tone).toBe("attention");
    expect(g.gaps).toEqual([{ category: "turnovers", count: 2 }]);
    expect(g.timeOfDay).toBe("Morning");
    expect(g.name).toBe("Cesar");
  });

  it("empty gap set → all-clear (clear tone, no gaps)", () => {
    const g = deriveGreeting(base([]), "Cesar", 14);
    expect(g.tone).toBe("clear");
    expect(g.gaps).toEqual([]);
    expect(g.timeOfDay).toBe("Afternoon");
  });

  it("groups by category preserving the payload URGENCY order (most pressing first)", () => {
    const g = deriveGreeting(
      base([
        { kind: "no_cleaner", property: "Villa Jamaica", date: "2026-06-03" },
        { kind: "awaiting_reply", property: "Villa Jamaica", guest: "Erwin" },
        { kind: "no_cleaner", property: "Cozy Loft", date: "2026-06-03" },
        { kind: "missing_essentials", property: "Cozy Loft" },
      ]),
      null,
      20,
    );
    // no_cleaner first (urgency), then replies, then essentials — turnovers count 2.
    expect(g.gaps).toEqual([
      { category: "turnovers", count: 2 },
      { category: "replies", count: 1 },
      { category: "essentials", count: 1 },
    ]);
    expect(g.timeOfDay).toBe("Evening");
    expect(g.name).toBeNull();
  });

  it("time-of-day boundaries (12 and 18)", () => {
    expect(deriveGreeting(base([]), null, 11).timeOfDay).toBe("Morning");
    expect(deriveGreeting(base([]), null, 12).timeOfDay).toBe("Afternoon");
    expect(deriveGreeting(base([]), null, 17).timeOfDay).toBe("Afternoon");
    expect(deriveGreeting(base([]), null, 18).timeOfDay).toBe("Evening");
  });
});
