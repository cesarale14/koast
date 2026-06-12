/**
 * OTA apply dispatch (P3.2 HARD-FLOOR). Proves the safety-critical properties of
 * the single shared write path, with NO live Channex and NO live DB:
 *
 *   - BELT 3: refuses outright while the OTA gate is off (no channex calls).
 *   - BDC routes through buildSafeBdcRestrictions (real, not mocked) — a BLOCK
 *     emits availability=0 and NEVER stop_sell; an out-of-band rate is dropped.
 *   - non-BDC pushes rate/min_stay via updateRestrictions; a non-BDC BLOCK is
 *     REFUSED (the un-wrapped room-type gap), never an un-wrapped write.
 *
 * buildSafeBdcRestrictions runs for real against a mock channex so the
 * availability=0 / no-stop_sell payload is asserted end-to-end.
 */

import { applyOtaRestrictions } from "../ota-apply";
import type { KoastRestrictionProposal } from "../safe-restrictions";

const RATE_PLAN_BDC = "rp-bdc";
const RATE_PLAN_ABB = "rp-abb";
const CPX = "cpx-1";

type BdcDateState = { rate?: string; availability?: number; stop_sell?: boolean; min_stay_arrival?: number };

function mockChannex(opts: { bdcState?: Record<string, BdcDateState> }) {
  const updateRestrictions = jest.fn(async () => ({ data: {} }));
  const getRestrictionsBucketed = jest.fn(async () => ({
    [RATE_PLAN_BDC]: opts.bdcState ?? {},
  }));
  return { updateRestrictions, getRestrictionsBucketed } as never;
}

function mockSvc(opts: {
  channexPropertyId?: string | null;
  channels?: Array<{ channel_code: string; settings: { rate_plan_id?: string } | null; status: string }>;
}) {
  const propRow =
    opts.channexPropertyId === null ? null : { id: "p1", channex_property_id: opts.channexPropertyId ?? CPX };
  const props = {
    select: () => props,
    eq: () => props,
    maybeSingle: async () => ({ data: propRow }),
  };
  const channels = opts.channels ?? [
    { channel_code: "BDC", settings: { rate_plan_id: RATE_PLAN_BDC }, status: "active" },
  ];
  const chans = {
    select: () => chans,
    eq: () => chans,
    then: (resolve: (v: { data: unknown }) => unknown) => resolve({ data: channels }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (t: string) => (t === "properties" ? props : t === "property_channels" ? chans : {}) } as any;
}

const prevFlag = process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH;
beforeEach(() => {
  process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = "true";
});
afterAll(() => {
  if (prevFlag === undefined) delete process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH;
  else process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = prevFlag;
});

function perDate(entries: Record<string, KoastRestrictionProposal>): Map<string, KoastRestrictionProposal> {
  return new Map(Object.entries(entries));
}

describe("BELT 3 — refuses while the OTA gate is off", () => {
  test("gate off → refusedReason, no channex calls", async () => {
    process.env.KOAST_ALLOW_BDC_CALENDAR_PUSH = ""; // off
    const channex = mockChannex({ bdcState: { "2026-07-01": { availability: 1 } } });
    const r = await applyOtaRestrictions(mockSvc({}), {
      propertyId: "p1",
      perDate: perDate({ "2026-07-01": { availability: 0 } }),
      channex,
    });
    expect(r.ok).toBe(false);
    expect(r.refusedReason).toBe("ota_writes_disabled");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((channex as any).updateRestrictions).not.toHaveBeenCalled();
  });
});

describe("BDC — through buildSafeBdcRestrictions", () => {
  test("block emits availability=0 and NEVER stop_sell", async () => {
    const channex = mockChannex({
      bdcState: { "2026-07-01": { rate: "200.00", availability: 1, stop_sell: false, min_stay_arrival: 1 } },
    });
    const r = await applyOtaRestrictions(mockSvc({}), {
      propertyId: "p1",
      perDate: perDate({ "2026-07-01": { availability: 0 } }),
      channex,
    });
    expect(r.ok).toBe(true);
    expect(r.pushedChannels).toEqual(["BDC"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pushed = (channex as any).updateRestrictions.mock.calls[0][0];
    expect(pushed).toHaveLength(1);
    expect(pushed[0].availability).toBe(0);
    expect(pushed[0]).not.toHaveProperty("stop_sell");
    expect(pushed[0].rate_plan_id).toBe(RATE_PLAN_BDC);
  });

  test("adjust_price within band → rate pushed in cents", async () => {
    const channex = mockChannex({
      bdcState: { "2026-07-01": { rate: "200.00", availability: 1, stop_sell: false } },
    });
    const r = await applyOtaRestrictions(mockSvc({}), {
      propertyId: "p1",
      perDate: perDate({ "2026-07-01": { rate: 210, availability: 1, stop_sell: false } }),
      channex,
    });
    expect(r.ok).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pushed = (channex as any).updateRestrictions.mock.calls[0][0];
    expect(pushed[0].rate).toBe(21000);
  });

  test("adjust_price OUT of band → safe-restrictions drops it → skipped, nothing pushed", async () => {
    const channex = mockChannex({
      bdcState: { "2026-07-01": { rate: "200.00", availability: 1, stop_sell: false } },
    });
    const r = await applyOtaRestrictions(mockSvc({}), {
      propertyId: "p1",
      perDate: perDate({ "2026-07-01": { rate: 260, availability: 1, stop_sell: false } }), // +30%
      channex,
    });
    expect(r.ok).toBe(false);
    expect(r.pushedChannels).toEqual([]);
    expect(r.skipped).toEqual([{ channel_code: "BDC", reason: "safe_restrictions_skipped_all" }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((channex as any).updateRestrictions).not.toHaveBeenCalled();
  });

  test("set_min_stay pushes min_stay_arrival", async () => {
    const channex = mockChannex({
      bdcState: { "2026-07-01": { rate: "200.00", availability: 1, stop_sell: false, min_stay_arrival: 1 } },
    });
    const r = await applyOtaRestrictions(mockSvc({}), {
      propertyId: "p1",
      perDate: perDate({ "2026-07-01": { min_stay_arrival: 3 } }),
      channex,
    });
    expect(r.ok).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pushed = (channex as any).updateRestrictions.mock.calls[0][0];
    expect(pushed[0].min_stay_arrival).toBe(3);
  });
});

describe("non-BDC", () => {
  const abbChannels = [{ channel_code: "ABB", settings: { rate_plan_id: RATE_PLAN_ABB }, status: "active" }];

  test("adjust_price → direct updateRestrictions, rate in cents, no availability", async () => {
    const channex = mockChannex({});
    const r = await applyOtaRestrictions(mockSvc({ channels: abbChannels }), {
      propertyId: "p1",
      perDate: perDate({ "2026-07-01": { rate: 180, availability: 1, stop_sell: false } }),
      channex,
    });
    expect(r.ok).toBe(true);
    expect(r.pushedChannels).toEqual(["ABB"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pushed = (channex as any).updateRestrictions.mock.calls[0][0];
    expect(pushed[0].rate).toBe(18000);
    expect(pushed[0]).not.toHaveProperty("availability");
    // non-BDC never reads BDC state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((channex as any).getRestrictionsBucketed).not.toHaveBeenCalled();
  });

  test("block (availability=0) is REFUSED — the un-wrapped room-type gap", async () => {
    const channex = mockChannex({});
    const r = await applyOtaRestrictions(mockSvc({ channels: abbChannels }), {
      propertyId: "p1",
      perDate: perDate({ "2026-07-01": { availability: 0 } }),
      channex,
    });
    expect(r.ok).toBe(false);
    expect(r.pushedChannels).toEqual([]);
    expect(r.skipped).toEqual([{ channel_code: "ABB", reason: "non_bdc_availability_unwrapped" }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((channex as any).updateRestrictions).not.toHaveBeenCalled();
  });
});

describe("H3.3 — targetChannels subset", () => {
  const multiChannels = [
    { channel_code: "ABB", settings: { rate_plan_id: RATE_PLAN_ABB }, status: "active" },
    { channel_code: "DIRECT", settings: { rate_plan_id: "rp-direct" }, status: "active" },
  ];

  test("targetChannels restricts the push to the named subset", async () => {
    const channex = mockChannex({});
    const r = await applyOtaRestrictions(mockSvc({ channels: multiChannels }), {
      propertyId: "p1",
      perDate: perDate({ "2026-07-01": { rate: 180 } }),
      targetChannels: ["ABB"],
      channex,
    });
    expect(r.ok).toBe(true);
    expect(r.pushedChannels).toEqual(["ABB"]);
    expect(r.targets.map((t) => t.channel_code)).toEqual(["ABB"]);
  });

  test("no targetChannels = all active channels", async () => {
    const channex = mockChannex({});
    const r = await applyOtaRestrictions(mockSvc({ channels: multiChannels }), {
      propertyId: "p1",
      perDate: perDate({ "2026-07-01": { rate: 180 } }),
      channex,
    });
    expect(new Set(r.pushedChannels)).toEqual(new Set(["ABB", "DIRECT"]));
  });
});

describe("H3.3 — per-batch partial failure", () => {
  test("a failing non-BDC push records failedChannels + failedByDate, ok=false", async () => {
    const channex = mockChannex({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (channex as any).updateRestrictions = jest.fn(async () => {
      throw new Error("channex 422");
    });
    const r = await applyOtaRestrictions(
      mockSvc({ channels: [{ channel_code: "ABB", settings: { rate_plan_id: RATE_PLAN_ABB }, status: "active" }] }),
      { propertyId: "p1", perDate: perDate({ "2026-07-01": { rate: 180 } }), channex },
    );
    expect(r.ok).toBe(false);
    expect(r.failedChannels).toEqual([{ channel_code: "ABB", error: "channex 422" }]);
    expect(r.failedByDate.get("2026-07-01")?.has("ABB")).toBe(true);
    expect(r.pushedChannels).toEqual([]);
  });
});

describe("H3.3 — capturePriorState (non-BDC pre-flight)", () => {
  test("captures pre-push rate/min-stay per date for revert", async () => {
    const channex = mockChannex({});
    // getRestrictionsBucketed returns the ABB plan's current state for the pre-flight.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (channex as any).getRestrictionsBucketed = jest.fn(async () => ({
      [RATE_PLAN_ABB]: { "2026-07-01": { rate: "150.00", min_stay_arrival: 2 } },
    }));
    const r = await applyOtaRestrictions(
      mockSvc({ channels: [{ channel_code: "ABB", settings: { rate_plan_id: RATE_PLAN_ABB }, status: "active" }] }),
      { propertyId: "p1", perDate: perDate({ "2026-07-01": { rate: 180 } }), capturePriorState: true, channex },
    );
    expect(r.ok).toBe(true);
    const prior = r.priorStateByChannel.get("ABB")?.get("2026-07-01");
    expect(prior).toMatchObject({ channel: "ABB", rate: 150, min_stay_arrival: 2 });
  });

  test("capturePriorState defaults off — no extra read, empty map", async () => {
    const channex = mockChannex({});
    const r = await applyOtaRestrictions(
      mockSvc({ channels: [{ channel_code: "ABB", settings: { rate_plan_id: RATE_PLAN_ABB }, status: "active" }] }),
      { propertyId: "p1", perDate: perDate({ "2026-07-01": { rate: 180 } }), channex },
    );
    expect(r.priorStateByChannel.size).toBe(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((channex as any).getRestrictionsBucketed).not.toHaveBeenCalled();
  });
});

describe("resolution refusals", () => {
  test("property not connected → property_not_connected", async () => {
    const r = await applyOtaRestrictions(mockSvc({ channexPropertyId: null }), {
      propertyId: "p1",
      perDate: perDate({ "2026-07-01": { rate: 200 } }),
      channex: mockChannex({}),
    });
    expect(r.refusedReason).toBe("property_not_connected");
  });

  test("no active channel with a rate plan → no_target_channel", async () => {
    const r = await applyOtaRestrictions(mockSvc({ channels: [] }), {
      propertyId: "p1",
      perDate: perDate({ "2026-07-01": { rate: 200 } }),
      channex: mockChannex({}),
    });
    expect(r.refusedReason).toBe("no_target_channel");
  });
});
