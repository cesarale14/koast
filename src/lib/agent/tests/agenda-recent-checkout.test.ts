import {
  isRecentCheckout,
  RECENT_CHECKOUT_WINDOW_DAYS,
  agendaPreamble,
  type AgendaRollup,
} from "../agenda";

const TODAY = "2026-06-12";
const minus = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const plus = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe("isRecentCheckout (A3 — post-stay window boundary)", () => {
  test("checkout yesterday → in scope", () => {
    expect(isRecentCheckout(minus(1), TODAY)).toBe(true);
  });
  test("checkout exactly windowDays ago → in scope (inclusive lower bound)", () => {
    expect(isRecentCheckout(minus(RECENT_CHECKOUT_WINDOW_DAYS), TODAY)).toBe(true);
  });
  test("checkout windowDays+1 ago → OUT of scope", () => {
    expect(isRecentCheckout(minus(RECENT_CHECKOUT_WINDOW_DAYS + 1), TODAY)).toBe(false);
  });
  test("checkout TODAY → not 'recent' (today's checkouts live in the agenda proper)", () => {
    expect(isRecentCheckout(TODAY, TODAY)).toBe(false);
  });
  test("future checkout → not recent", () => {
    expect(isRecentCheckout(plus(1), TODAY)).toBe(false);
  });
  test("respects a custom window", () => {
    expect(isRecentCheckout(minus(10), TODAY, 7)).toBe(false);
    expect(isRecentCheckout(minus(5), TODAY, 7)).toBe(true);
  });
});

function rollup(over: Partial<AgendaRollup> = {}): AgendaRollup {
  return {
    today: TODAY,
    windowEnd: plus(2),
    checkIns: [],
    checkOuts: [],
    turnovers: [],
    pendingMessages: [],
    recentCheckouts: [],
    empty: true,
    nullTzPropertyCount: 0,
    ...over,
  };
}

describe("agendaPreamble — RECENTLY DEPARTED section (A3)", () => {
  test("surfaces a departed guest WITH the booking id + the propose path", () => {
    const out = agendaPreamble(
      rollup({ recentCheckouts: [{ property: "Villa Jamaica", guest: "Jonathan", date: minus(1), bookingId: "bk-123" }] }),
    );
    expect(out).toContain("RECENTLY DEPARTED");
    expect(out).toContain("Jonathan at Villa Jamaica");
    expect(out).toContain("bk-123");
    expect(out).toContain("propose_guest_reply");
    // grounds the fail-closed contract in the agent's view
    expect(out.toLowerCase()).toContain("fails closed");
  });

  test("omits the section when there are no recent departures", () => {
    expect(agendaPreamble(rollup())).not.toContain("RECENTLY DEPARTED");
  });

  test("a nameless departed guest is referred to by property, never a fabricated name", () => {
    const out = agendaPreamble(
      rollup({ recentCheckouts: [{ property: "Cozy Loft", guest: null, date: minus(2), bookingId: "bk-9" }] }),
    );
    expect(out).toContain("a departed guest at Cozy Loft");
  });
});
