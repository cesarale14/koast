import { describeHostNotification, PROPOSALS_CHANGED_EVENT } from "../describe";
import type { NormalizedHostNotification } from "../host-feed";

function n(over: Partial<NormalizedHostNotification>): NormalizedHostNotification {
  return {
    id: "n1",
    type: "proposal_created",
    payload: {},
    readAt: null,
    createdAt: "2026-06-11T01:46:35Z",
    ...over,
  };
}

describe("describeHostNotification — every type maps to a titled, actionable row", () => {
  test("proposal_created deep-links to the Today approval surface, sub = rationale", () => {
    const d = describeHostNotification(
      n({ type: "proposal_created", payload: { proposalId: "p1", rationale: "Karem is free and closest." } }),
    );
    expect(d.title).toBe("Koast has a suggestion");
    expect(d.sub).toBe("Karem is free and closest.");
    // "/" is where TodaySuggests renders the approvable ProposalCard — the
    // contract the agent→host visibility path depends on.
    expect(d.href).toBe("/");
  });

  test("cleaning_completed → Today, photo count sub", () => {
    const d = describeHostNotification(n({ type: "cleaning_completed", payload: { propertyName: "Villa", photoCount: 2 } }));
    expect(d.title).toBe("Cleaning done at Villa");
    expect(d.sub).toBe("2 photos to review");
    expect(d.href).toBe("/");
  });

  test("booking_new / booking_cancelled → calendar, first-name only", () => {
    const a = describeHostNotification(n({ type: "booking_new", payload: { guestName: "Jonathan Reyes", checkIn: "2026-06-12", checkOut: "2026-06-15" } }));
    expect(a.title).toBe("New booking — Jonathan");
    expect(a.href).toBe("/calendar");
    const b = describeHostNotification(n({ type: "booking_cancelled", payload: { guestName: "Jonathan Reyes" } }));
    expect(b.title).toBe("Booking cancelled — Jonathan");
    expect(b.href).toBe("/calendar");
  });

  test("push_delivery_failure → turnovers", () => {
    const d = describeHostNotification(n({ type: "push_delivery_failure", payload: { propertyName: "Villa", cleanerName: "Karem" } }));
    expect(d.title).toBe("Couldn't reach Karem");
    expect(d.href).toBe("/turnovers");
  });

  test("every mapping yields a non-empty title + href (no dead bell rows)", () => {
    for (const type of [
      "proposal_created",
      "cleaning_completed",
      "booking_new",
      "booking_cancelled",
      "push_delivery_failure",
    ] as const) {
      const d = describeHostNotification(n({ type }));
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.href.startsWith("/")).toBe(true);
    }
  });
});

describe("PROPOSALS_CHANGED_EVENT — the shared name can't drift between emitter + listener", () => {
  test("is a stable namespaced event string", () => {
    expect(PROPOSALS_CHANGED_EVENT).toBe("koast:proposals-changed");
  });
});
