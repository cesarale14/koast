/**
 * TURN-S1 (D1) — Turnover task creation hook on the Channex booking webhook.
 *
 * Proves the riskiest assumption: that turnover-task creation fires for a
 * Channex booking ingested via the webhook (not just the iCal path), and
 * that the booking_id idempotency guard holds when the same booking is
 * delivered more than once (webhook replay) or touched by a second caller
 * (webhook + iCal both invoking createCleaningTask).
 *
 * Deterministic replay: no live booking, no network. The Channex client is
 * mocked (getBooking returns a fixture; availability/ack are no-ops) and the
 * Supabase service client is a small STATEFUL in-memory fake that enforces
 * the cleaning_tasks UNIQUE(booking_id) constraint — so "insert, then the
 * next call's guard sees it" is genuinely exercised rather than stubbed.
 *
 * Scope: app-code only. No schema, no prod data.
 */

import { POST } from "../route";
import { createCleaningTask } from "@/lib/turnover/auto-create";

jest.mock("@/lib/supabase/service");
jest.mock("@/lib/channex/client");
// H6.1 — the webhook now claim-firsts via acquireLock; this suite isn't testing
// the lock, so model it as "always acquired" (the lock behavior is covered in
// claim-first.test.ts). Without this, the in-memory fake's concurrency_locks
// insert returns no row → acquireLock false → every delivery skipped_in_flight.
jest.mock("@/lib/concurrency/locks", () => ({
  acquireLock: jest.fn().mockResolvedValue(true),
  releaseLock: jest.fn().mockResolvedValue(undefined),
}));

import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";

// ---------------------------------------------------------------------------
// Stateful in-memory fake Supabase — supports exactly the chains the webhook
// + createCleaningTask + upsertBookingFromChannexRevision use:
//   select/insert/update · eq/in/is/gt/gte/order/limit/single · thenable.
// Enforces UNIQUE(booking_id) on cleaning_tasks (23505 on collision).
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function makeStatefulSupabase(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const k of Object.keys(seed)) tables[k] = seed[k].map((r) => ({ ...r }));
  let idCounter = 1000;

  function from(name: string) {
    if (!tables[name]) tables[name] = [];
    const state: {
      op: "select" | "insert" | "update" | "delete";
      filters: Array<(r: Row) => boolean>;
      insertRows: Row[] | null;
      updateVals: Row | null;
      orderCol: string | null;
      limitN: number | null;
      returning: boolean;
      single: boolean;
    } = { op: "select", filters: [], insertRows: null, updateVals: null, orderCol: null, limitN: null, returning: false, single: false };

    function exec(): { data: unknown; error: { code?: string; message: string } | null } {
      if (state.op === "insert") {
        const out: Row[] = [];
        for (const raw of state.insertRows ?? []) {
          const row: Row = { ...raw };
          if (name === "cleaning_tasks") {
            const clash = tables.cleaning_tasks?.some((r) => r.booking_id === row.booking_id);
            if (clash) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          }
          if (row.id == null) row.id = `gen-${idCounter++}`;
          if (row.created_at == null) row.created_at = new Date().toISOString();
          tables[name].push(row);
          out.push(row);
        }
        if (state.single) return { data: out[0] ?? null, error: null };
        if (state.returning) return { data: state.limitN != null ? out.slice(0, state.limitN) : out, error: null };
        return { data: null, error: null };
      }
      const matched = tables[name].filter((r) => state.filters.every((f) => f(r)));
      if (state.op === "update") {
        for (const r of matched) Object.assign(r, state.updateVals);
        return { data: state.returning ? matched : null, error: null };
      }
      if (state.op === "delete") {
        tables[name] = tables[name].filter((r) => !state.filters.every((f) => f(r)));
        return { data: state.returning ? matched : null, error: null };
      }
      // select
      let rows = matched.slice();
      if (state.orderCol) rows.sort((a, b) => String(a[state.orderCol as string] ?? "").localeCompare(String(b[state.orderCol as string] ?? "")));
      if (state.limitN != null) rows = rows.slice(0, state.limitN);
      if (state.single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    const builder: Record<string, unknown> = {
      select() { state.returning = true; return builder; },
      insert(rows: Row | Row[]) { state.op = "insert"; state.insertRows = Array.isArray(rows) ? rows : [rows]; return builder; },
      update(vals: Row) { state.op = "update"; state.updateVals = vals; return builder; },
      delete() { state.op = "delete"; return builder; },
      eq(c: string, v: unknown) { state.filters.push((r) => r[c] === v); return builder; },
      in(c: string, arr: unknown[]) { state.filters.push((r) => arr.includes(r[c])); return builder; },
      is(c: string, v: unknown) { state.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return builder; },
      gt(c: string, v: unknown) { state.filters.push((r) => r[c] != null && (r[c] as string | number) > (v as string | number)); return builder; },
      gte(c: string, v: unknown) { state.filters.push((r) => r[c] != null && (r[c] as string | number) >= (v as string | number)); return builder; },
      order(c: string) { state.orderCol = c; return builder; },
      limit(n: number) { state.limitN = n; return Promise.resolve(exec()); },
      single() { state.single = true; return Promise.resolve(exec()); },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(exec()).then(resolve, reject); },
    };
    return builder;
  }

  return { client: { from }, tables };
}

function makeChannexMock() {
  return {
    getBooking: jest.fn().mockResolvedValue({
      attributes: {
        status: "new",
        arrival_date: "2026-07-10",
        departure_date: "2026-07-14",
        amount: "800.00",
        currency: "USD",
        ota_reservation_code: "ABB-XYZ123",
        ota_name: "Airbnb",
        unique_id: "ABB-XYZ123",
        customer: { name: "Test", surname: "Guest" },
      },
    }),
    getRoomTypes: jest.fn().mockResolvedValue([]), // [] → availability block is a no-op
    updateAvailability: jest.fn().mockResolvedValue(undefined),
    acknowledgeBookingRevision: jest.fn().mockResolvedValue(undefined),
  };
}

const CHANNEX_PROP = "channex-prop-villa";
const PROP_ID = "11111111-1111-4111-8111-111111111111";
const HOST_ID = "22222222-2222-4222-8222-222222222222";
const FUTURE_BOOKING_ID = "33333333-3333-4333-8333-333333333333";

function seedTables(): Record<string, Row[]> {
  return {
    properties: [
      { id: PROP_ID, channex_property_id: CHANNEX_PROP, default_cleaner_id: null, name: "Villa Jamaica", user_id: HOST_ID },
    ],
    // A confirmed future booking AFTER the new booking's checkout — proves
    // next_booking_id (the cleaning window) gets resolved on create.
    bookings: [
      { id: FUTURE_BOOKING_ID, property_id: PROP_ID, channex_booking_id: "chx-future", platform: "airbnb", check_in: "2026-07-20", check_out: "2026-07-24", status: "confirmed", guest_name: "Future Guest" },
    ],
    cleaning_tasks: [],
    channex_webhook_log: [],
    pricing_performance: [],
  };
}

function bookingEnvelope(event: string, bookingId: string, revisionId: string) {
  return {
    headers: { get: () => null },
    json: async () => ({
      event,
      property_id: CHANNEX_PROP,
      payload: { booking_id: bookingId, revision_id: revisionId, property_id: CHANNEX_PROP },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  (createChannexClient as jest.Mock).mockReturnValue(makeChannexMock());
});

describe("TURN-S1 — Channex webhook creates a turnover task", () => {
  test("booking_new creates exactly one task with the cleaning window (next_booking_id) set", async () => {
    const { client, tables } = makeStatefulSupabase(seedTables());
    (createServiceClient as jest.Mock).mockReturnValue(client);

    const res = await POST(bookingEnvelope("booking_new", "chx-new-1", "rev-1"));
    const body = await res.json();

    expect(body.action).toBe("created");
    expect(tables.cleaning_tasks).toHaveLength(1);

    const insertedBooking = tables.bookings.find((b) => b.channex_booking_id === "chx-new-1");
    expect(insertedBooking).toBeDefined();

    const task = tables.cleaning_tasks[0];
    expect(task.booking_id).toBe(insertedBooking!.id); // task points at the Koast booking row
    expect(task.property_id).toBe(PROP_ID);
    expect(task.scheduled_date).toBe("2026-07-14"); // checkout day
    expect(task.next_booking_id).toBe(FUTURE_BOOKING_ID); // <-- cleaning window resolved
    expect(task.status).toBe("pending"); // no default_cleaner_id → manual assign next
  });

  test("replaying the same revision does NOT create a second task (webhook dedup)", async () => {
    const { client, tables } = makeStatefulSupabase(seedTables());
    (createServiceClient as jest.Mock).mockReturnValue(client);

    const first = await (await POST(bookingEnvelope("booking_new", "chx-new-1", "rev-1"))).json();
    expect(first.action).toBe("created");
    expect(tables.cleaning_tasks).toHaveLength(1);

    const second = await (await POST(bookingEnvelope("booking_new", "chx-new-1", "rev-1"))).json();
    expect(second.action).toBe("skipped_duplicate");
    expect(tables.cleaning_tasks).toHaveLength(1); // still one
  });

  test("re-delivery with a NEW revision but the SAME booking holds via the booking_id guard", async () => {
    const { client, tables } = makeStatefulSupabase(seedTables());
    (createServiceClient as jest.Mock).mockReturnValue(client);

    await POST(bookingEnvelope("booking_new", "chx-new-1", "rev-1"));
    expect(tables.cleaning_tasks).toHaveLength(1);

    // A later modification event (different revision) re-reaches the hook.
    const mod = await (await POST(bookingEnvelope("booking_modification", "chx-new-1", "rev-2"))).json();
    expect(mod.action).toBe("modified");
    expect(tables.cleaning_tasks).toHaveLength(1); // guard held — no duplicate
  });
});

describe("TURN-S1 — createCleaningTask idempotency across webhook + iCal callers", () => {
  test("two callers for the same booking yield one task and the same id", async () => {
    const { client, tables } = makeStatefulSupabase({
      properties: [{ id: PROP_ID, channex_property_id: CHANNEX_PROP, default_cleaner_id: null, name: "Villa Jamaica", user_id: HOST_ID }],
      bookings: [{ id: FUTURE_BOOKING_ID, property_id: PROP_ID, check_in: "2026-07-20", check_out: "2026-07-24", status: "confirmed" }],
      cleaning_tasks: [],
    });

    const booking = { id: "booking-abc", property_id: PROP_ID, check_out: "2026-07-14" };

    // Caller 1 (e.g. the Channex webhook)
    const id1 = await createCleaningTask(client, booking);
    // Caller 2 (e.g. the iCal sweep / backfill) — same booking
    const id2 = await createCleaningTask(client, booking);

    expect(id1).toBeTruthy();
    expect(id2).toBe(id1); // same task returned, not a new one
    expect(tables.cleaning_tasks).toHaveLength(1);
    expect(tables.cleaning_tasks[0].next_booking_id).toBe(FUTURE_BOOKING_ID);
  });
});

describe("P1.1 — webhook turnover lifecycle (modification drift + cancellation teardown)", () => {
  test("booking_modification re-points an unstarted task when the checkout drifts", async () => {
    const seed = seedTables();
    // Existing booking + task at the OLD checkout (2026-07-12); the Channex
    // mock returns departure_date 2026-07-14 → a 2-day drift to reconcile.
    seed.bookings.push({
      id: "row-mod-1", property_id: PROP_ID, channex_booking_id: "chx-mod-1",
      platform: "airbnb", check_in: "2026-07-08", check_out: "2026-07-12",
      status: "confirmed", guest_name: "Drift Guest",
    });
    seed.cleaning_tasks.push({
      id: "task-mod-1", property_id: PROP_ID, booking_id: "row-mod-1",
      next_booking_id: null, scheduled_date: "2026-07-12", scheduled_time: "11:30:00",
      status: "pending", cleaner_id: null, cleaner_token: "tok-mod-1", checklist: [],
    });
    const { client, tables } = makeStatefulSupabase(seed);
    (createServiceClient as jest.Mock).mockReturnValue(client);

    const res = await (await POST(bookingEnvelope("booking_modification", "chx-mod-1", "rev-mod-1"))).json();
    expect(res.action).toBe("modified");

    const task = tables.cleaning_tasks.find((t) => t.id === "task-mod-1")!;
    expect(task.scheduled_date).toBe("2026-07-14");          // re-pointed to the modified checkout
    expect(task.next_booking_id).toBe(FUTURE_BOOKING_ID);    // cleaning window re-resolved
    expect(tables.cleaning_tasks).toHaveLength(1);           // no duplicate created
  });

  test("booking_cancellation tears down an UNSTARTED task", async () => {
    const seed = seedTables();
    seed.bookings.push({
      id: "row-can-1", property_id: PROP_ID, channex_booking_id: "chx-can-1",
      platform: "airbnb", check_in: "2026-08-01", check_out: "2026-08-05",
      status: "confirmed", guest_name: "Cancel Guest",
    });
    seed.cleaning_tasks.push({
      id: "task-can-1", property_id: PROP_ID, booking_id: "row-can-1",
      next_booking_id: null, scheduled_date: "2026-08-05", scheduled_time: "11:30:00",
      status: "assigned", cleaner_id: null, cleaner_token: "tok-can-1", checklist: [],
    });
    const { client, tables } = makeStatefulSupabase(seed);
    (createServiceClient as jest.Mock).mockReturnValue(client);

    const res = await (await POST(bookingEnvelope("booking_cancellation", "chx-can-1", "rev-can-1"))).json();
    expect(res.action).toBe("cancelled");
    expect(tables.cleaning_tasks.find((t) => t.id === "task-can-1")).toBeUndefined(); // torn down
  });

  test("booking_cancellation leaves an in-progress task intact", async () => {
    const seed = seedTables();
    seed.bookings.push({
      id: "row-can-2", property_id: PROP_ID, channex_booking_id: "chx-can-2",
      platform: "airbnb", check_in: "2026-08-10", check_out: "2026-08-14",
      status: "confirmed", guest_name: "InProgress Guest",
    });
    seed.cleaning_tasks.push({
      id: "task-can-2", property_id: PROP_ID, booking_id: "row-can-2",
      next_booking_id: null, scheduled_date: "2026-08-14", scheduled_time: "11:30:00",
      status: "in_progress", cleaner_id: null, cleaner_token: "tok-can-2", checklist: [],
    });
    const { client, tables } = makeStatefulSupabase(seed);
    (createServiceClient as jest.Mock).mockReturnValue(client);

    const res = await (await POST(bookingEnvelope("booking_cancellation", "chx-can-2", "rev-can-2"))).json();
    expect(res.action).toBe("cancelled");
    expect(tables.cleaning_tasks.find((t) => t.id === "task-can-2")).toBeDefined(); // preserved — real work
  });
});
