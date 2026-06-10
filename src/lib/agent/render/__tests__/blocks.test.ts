import { blockDataSchema, blocksRenderPayloadSchema } from "../blocks";
import { renderPayloadSchema } from "../types";

const TURNOVER = {
  kind: "turnover" as const,
  data: { property: "Villa Jamaica", date: "2026-06-12", status: "pending" as const, cleanerName: null },
};
const BOOKING = {
  kind: "booking" as const,
  data: { guestName: "Jeremy", checkIn: "2026-06-12", checkOut: "2026-06-14", platform: "airbnb", totalPrice: 420 },
};
const THREAD = {
  kind: "thread" as const,
  data: { guestName: "Erwin", propertyName: "Cozy Loft - Tampa", platform: "booking_com", lastMessage: "what time is check-in?", unreadCount: 1 },
};
const PRICE = {
  kind: "price_diff" as const,
  data: { date: "2026-06-12", currentRate: 180, suggestedRate: 205, deltaAbs: 25, reason: "Event nearby", urgency: "act_now" as const },
};

describe("blockDataSchema", () => {
  test("accepts each block kind", () => {
    for (const b of [TURNOVER, BOOKING, THREAD, PRICE]) {
      expect(blockDataSchema.safeParse(b).success).toBe(true);
    }
  });

  test("rejects an unknown kind", () => {
    expect(blockDataSchema.safeParse({ kind: "weather", data: {} }).success).toBe(false);
  });

  test("rejects a malformed turnover status", () => {
    const bad = { kind: "turnover", data: { property: "X", date: "2026-06-12", status: "cancelled", cleanerName: null } };
    expect(blockDataSchema.safeParse(bad).success).toBe(false);
  });

  test("rejects a block carrying an id (no-ids invariant for the render lane)", () => {
    // Extra unknown keys (e.g. an id) are stripped by Zod, never surfaced — the
    // parsed shape carries only declared display fields.
    const parsed = blockDataSchema.parse({ ...TURNOVER, data: { ...TURNOVER.data, taskId: "abc" } });
    expect(parsed.kind === "turnover" && "taskId" in parsed.data).toBe(false);
  });
});

describe("blocksRenderPayloadSchema", () => {
  test("accepts a blocks render payload with a heterogeneous list", () => {
    const payload = { v: 1, kind: "blocks", blocks: [TURNOVER, BOOKING, THREAD, PRICE] };
    expect(blocksRenderPayloadSchema.safeParse(payload).success).toBe(true);
  });

  test("accepts an empty block list", () => {
    expect(blocksRenderPayloadSchema.safeParse({ v: 1, kind: "blocks", blocks: [] }).success).toBe(true);
  });
});

describe("renderPayloadSchema (discriminated union: agenda | blocks)", () => {
  test("still accepts an agenda payload (backward-compatible)", () => {
    const agenda = {
      v: 1,
      kind: "agenda",
      horizon: "today_48h",
      today: "2026-06-10",
      groups: { today: [], upcoming: [] },
      gaps: [],
      nullTzPropertyCount: 0,
    };
    expect(renderPayloadSchema.safeParse(agenda).success).toBe(true);
  });

  test("accepts a blocks payload", () => {
    expect(
      renderPayloadSchema.safeParse({ v: 1, kind: "blocks", blocks: [TURNOVER] }).success,
    ).toBe(true);
  });

  test("rejects an unknown render kind (validate-on-read drops it → prose stands)", () => {
    expect(renderPayloadSchema.safeParse({ v: 1, kind: "comp_set", data: {} }).success).toBe(false);
  });
});
