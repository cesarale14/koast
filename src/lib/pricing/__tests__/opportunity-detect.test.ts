/**
 * Opportunity detectors (P4.4) — gap-night + stale-weekend → adjust_price proposals.
 * Proves: each detector fires on the right engine output, the whiplash bound applies
 * at propose time, booked/already-proposed/stale dates are skipped, and the cap holds.
 * createProposal is mocked (the proposals lane has its own suite); here we assert the
 * detect→propose wiring + the proposal payloads.
 */

jest.mock("@/lib/proposals/server");

import { detectPricingOpportunities } from "../opportunity-detect";
import { createProposal } from "@/lib/proposals/server";

const mockCreate = createProposal as jest.MockedFunction<typeof createProposal>;
const HOST = "host-1";
const PROP = "prop-1";
const NOW = "2026-06-12T10:00:00.000Z"; // a Friday-adjacent clock; recs are future
const FRESH = "2026-06-12T05:00:00.000Z";

// 2026-07-03 is a Friday, 2026-07-04 a Saturday, 2026-07-07 a Tuesday (UTC).
function rec(date: string, suggested: number, signals: Record<string, unknown> = {}, createdAt = FRESH) {
  return { date, suggested_rate: suggested, created_at: createdAt, reason_signals: signals };
}

function fakeSvc(opts: {
  recs?: ReturnType<typeof rec>[];
  rules?: Record<string, unknown> | null;
  currentRates?: Array<{ date: string; applied_rate: number | null; base_rate?: number | null }>;
  bookings?: Array<{ check_in: string; check_out: string }>;
  pendingProposals?: Array<{ payload: { action?: { dates?: string[] } } }>;
}) {
  const recsT = { select: () => recsT, eq: () => recsT, gte: () => recsT, order: () => recsT, then: (r: (v: { data: unknown }) => unknown) => r({ data: opts.recs ?? [] }) };
  const rulesT = { select: () => rulesT, eq: () => rulesT, maybeSingle: async () => ({ data: opts.rules ?? null }) };
  const calT = { select: () => calT, eq: () => calT, is: () => calT, in: () => calT, then: (r: (v: { data: unknown }) => unknown) => r({ data: opts.currentRates ?? [] }) };
  const bookT = { select: () => bookT, eq: () => bookT, lte: () => bookT, gte: () => bookT, in: () => bookT, then: (r: (v: { data: unknown }) => unknown) => r({ data: opts.bookings ?? [] }) };
  const propT = { select: () => propT, eq: () => propT, then: (r: (v: { data: unknown }) => unknown) => r({ data: opts.pendingProposals ?? [] }) };
  const svc = {
    from: (t: string) =>
      t === "pricing_recommendations" ? recsT :
      t === "pricing_rules" ? rulesT :
      t === "calendar_rates" ? calT :
      t === "bookings" ? bookT :
      t === "proposals" ? propT : {},
  };
  return svc as unknown as Parameters<typeof detectPricingOpportunities>[0];
}

const RULES = { base_rate: 200, min_rate: 100, max_rate: 400, channel_markups: {}, max_daily_delta_pct: 0.5, comp_floor_pct: 0.85, auto_apply: false };

beforeEach(() => {
  jest.clearAllMocks();
  let n = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreate.mockImplementation(async () => ({ proposal: { id: `p-${++n}` } as any, autoExecuted: false }));
});

async function run(opts: Parameters<typeof fakeSvc>[0], maxProposals?: number) {
  return detectPricingOpportunities(fakeSvc(opts), { propertyId: PROP, hostId: HOST, propertyName: "Villa", maxProposals, nowISO: NOW });
}

test("gap night: orphan night with a below-current suggestion → discount proposal", async () => {
  const r = await run({
    rules: RULES,
    recs: [rec("2026-07-07", 150, { gap_night: { score: -0.8, reason: "Orphan night — 2-day gap (heavy discount)" } })],
    currentRates: [{ date: "2026-07-07", applied_rate: 200 }],
  });
  expect(r.detected).toBe(1);
  expect(r.created).toHaveLength(1);
  const arg = mockCreate.mock.calls[0][1];
  expect(arg.actionType).toBe("adjust_price");
  expect(arg.createdBy).toBe("worker");
  expect((arg.payload as { action: { dates: string[]; rate: number } }).action).toMatchObject({ dates: ["2026-07-07"], rate: 150 });
  expect(arg.rationale).toMatch(/Gap night/i);
});

test("stale weekend: Friday priced well below suggestion → raise proposal", async () => {
  const r = await run({
    rules: RULES,
    recs: [rec("2026-07-03", 280, { competitor: { reason: "20th pctl, underpriced" } })], // Friday
    currentRates: [{ date: "2026-07-03", applied_rate: 200 }], // +$80, +40% → material
  });
  expect(r.detected).toBe(1);
  const arg = mockCreate.mock.calls[0][1];
  expect((arg.payload as { action: { rate: number } }).action.rate).toBe(280);
  expect(arg.rationale).toMatch(/Weekend below market/i);
  expect(arg.rationale).toMatch(/underpriced/);
});

test("whiplash bounds the proposed rate against max_rate", async () => {
  const r = await run({
    rules: { ...RULES, max_rate: 250 },
    recs: [rec("2026-07-03", 320, { competitor: { reason: "x" } })], // Friday, suggested 320 > max 250
    currentRates: [{ date: "2026-07-03", applied_rate: 200 }],
  });
  expect(r.created).toHaveLength(1);
  expect((mockCreate.mock.calls[0][1].payload as { action: { rate: number } }).action.rate).toBe(250);
});

test("weekend within the noise floor is NOT proposed", async () => {
  const r = await run({
    rules: RULES,
    recs: [rec("2026-07-03", 205, { competitor: { reason: "x" } })], // +$5 only, below the $12/6% floor
    currentRates: [{ date: "2026-07-03", applied_rate: 200 }],
  });
  expect(r.detected).toBe(0);
  expect(mockCreate).not.toHaveBeenCalled();
});

test("booked date is skipped", async () => {
  const r = await run({
    rules: RULES,
    recs: [rec("2026-07-03", 280, { competitor: { reason: "x" } })],
    currentRates: [{ date: "2026-07-03", applied_rate: 200 }],
    bookings: [{ check_in: "2026-07-01", check_out: "2026-07-05" }], // covers 07-03
  });
  expect(r.detected).toBe(0);
});

test("a date already carried by a pending adjust_price proposal is skipped (dedup)", async () => {
  const r = await run({
    rules: RULES,
    recs: [rec("2026-07-03", 280, { competitor: { reason: "x" } })],
    currentRates: [{ date: "2026-07-03", applied_rate: 200 }],
    pendingProposals: [{ payload: { action: { dates: ["2026-07-03"] } } }],
  });
  expect(r.detected).toBe(0);
  expect(r.skippedAlreadyProposed).toBe(1);
  expect(mockCreate).not.toHaveBeenCalled();
});

test("stale rec (old producing run) seeds no opportunity", async () => {
  const r = await run({
    rules: RULES,
    recs: [rec("2026-07-03", 280, { competitor: { reason: "x" } }, "2026-06-01T00:00:00Z")], // 11 days old
    currentRates: [{ date: "2026-07-03", applied_rate: 200 }],
  });
  expect(r.detected).toBe(0);
});

test("caps the number of proposals and reports the overflow", async () => {
  // 4 stale weekends, cap at 2 → 2 created, 2 capped, biggest-delta first.
  const recs = [
    rec("2026-07-03", 250, { competitor: { reason: "x" } }), // +50
    rec("2026-07-04", 300, { competitor: { reason: "x" } }), // +100 (Sat)
    rec("2026-07-10", 240, { competitor: { reason: "x" } }), // +40
    rec("2026-07-11", 280, { competitor: { reason: "x" } }), // +80 (Sat)
  ];
  const currentRates = recs.map((r) => ({ date: r.date, applied_rate: 200 }));
  const r = await run({ rules: RULES, recs, currentRates }, 2);
  expect(r.detected).toBe(4);
  expect(r.created).toHaveLength(2);
  expect(r.capped).toBe(2);
  // biggest deltas first: 07-04 (+100) and 07-11 (+80)
  const proposedDates = mockCreate.mock.calls.map((c) => (c[1].payload as { action: { dates: string[] } }).action.dates[0]);
  expect(proposedDates).toEqual(["2026-07-04", "2026-07-11"]);
});
