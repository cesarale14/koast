/**
 * TURN-S2-send — deterministic proof for the cleaner web-push dispatch path.
 *
 * Like S1: no live sends, no prod data. web-push is mocked; Supabase is a small
 * stateful in-memory fake (select/eq/limit, upsert on endpoint, delete/eq).
 *
 * Proves:
 *   1. subscribe → subscription persisted bound to the task's cleaner_id
 *      (+ 403 invalid token, 409 unassigned task).
 *   2. assign-send → exactly one web-push per the cleaner's subscriptions.
 *   3. 410 on send → the dead subscription is pruned.
 */

jest.mock("@/lib/supabase/service");
jest.mock("web-push", () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), sendNotification: jest.fn() },
}));

import webpush from "web-push";
import { sendAssignmentPush } from "@/lib/push/send";
import { POST as subscribePost } from "@/app/api/clean/[taskId]/[token]/subscribe/route";
import { createServiceClient } from "@/lib/supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function makeStatefulSupabase(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const k of Object.keys(seed)) tables[k] = seed[k].map((r) => ({ ...r }));
  let idc = 5000;

  function from(name: string) {
    if (!tables[name]) tables[name] = [];
    const st: {
      op: "select" | "upsert" | "delete";
      filters: Array<(r: Row) => boolean>;
      cols: boolean;
      limitN: number | null;
      upsertRow: Row | null;
      onConflict: string | null;
    } = { op: "select", filters: [], cols: false, limitN: null, upsertRow: null, onConflict: null };

    function exec() {
      if (st.op === "upsert") {
        const row = { ...(st.upsertRow as Row) };
        const key = st.onConflict;
        if (key) {
          const existing = tables[name].find((r) => r[key] === row[key]);
          if (existing) { Object.assign(existing, row); return { data: null, error: null }; }
        }
        if (row.id == null) row.id = `gen-${idc++}`;
        tables[name].push(row);
        return { data: null, error: null };
      }
      const matched = tables[name].filter((r) => st.filters.every((f) => f(r)));
      if (st.op === "delete") {
        tables[name] = tables[name].filter((r) => !st.filters.every((f) => f(r)));
        return { data: null, error: null };
      }
      let rows = matched.slice();
      if (st.limitN != null) rows = rows.slice(0, st.limitN);
      return { data: rows, error: null };
    }

    const builder: Record<string, unknown> = {
      select() { st.cols = true; return builder; },
      upsert(row: Row, opts?: { onConflict?: string }) { st.op = "upsert"; st.upsertRow = row; st.onConflict = opts?.onConflict ?? null; return builder; },
      delete() { st.op = "delete"; return builder; },
      eq(c: string, v: unknown) { st.filters.push((r) => r[c] === v); return builder; },
      limit(n: number) { st.limitN = n; return Promise.resolve(exec()); },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(exec()).then(res, rej); },
    };
    return builder;
  }
  return { client: { from }, tables };
}

const TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKEN = "tok-123";
const CLEANER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function subscribeReq(body: unknown) {
  return {
    headers: { get: () => "jest-UA" },
    json: async () => body,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}
const subPayload = { subscription: { endpoint: "https://push.example/ep-1", keys: { p256dh: "p1", auth: "a1" } } };

beforeAll(() => {
  process.env.VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
});
beforeEach(() => jest.clearAllMocks());

describe("subscribe — persists subscription bound to cleaner_id", () => {
  test("valid token + assigned task → upserts a row bound to cleaner_id", async () => {
    const { client, tables } = makeStatefulSupabase({
      cleaning_tasks: [{ id: TASK_ID, cleaner_token: TOKEN, cleaner_id: CLEANER_ID }],
      cleaner_push_subscriptions: [],
    });
    (createServiceClient as jest.Mock).mockReturnValue(client);

    const res = await subscribePost(subscribeReq(subPayload), { params: { taskId: TASK_ID, token: TOKEN } });
    expect(res.status).toBe(200);
    expect(tables.cleaner_push_subscriptions).toHaveLength(1);
    const row = tables.cleaner_push_subscriptions[0];
    expect(row.cleaner_id).toBe(CLEANER_ID);
    expect(row.endpoint).toBe("https://push.example/ep-1");
    expect(row.p256dh).toBe("p1");
  });

  test("re-subscribe same endpoint → updates, no duplicate (onConflict endpoint)", async () => {
    const { client, tables } = makeStatefulSupabase({
      cleaning_tasks: [{ id: TASK_ID, cleaner_token: TOKEN, cleaner_id: CLEANER_ID }],
      cleaner_push_subscriptions: [],
    });
    (createServiceClient as jest.Mock).mockReturnValue(client);
    await subscribePost(subscribeReq(subPayload), { params: { taskId: TASK_ID, token: TOKEN } });
    await subscribePost(subscribeReq(subPayload), { params: { taskId: TASK_ID, token: TOKEN } });
    expect(tables.cleaner_push_subscriptions).toHaveLength(1);
  });

  test("invalid token → 403, nothing persisted", async () => {
    const { client, tables } = makeStatefulSupabase({
      cleaning_tasks: [{ id: TASK_ID, cleaner_token: TOKEN, cleaner_id: CLEANER_ID }],
      cleaner_push_subscriptions: [],
    });
    (createServiceClient as jest.Mock).mockReturnValue(client);
    const res = await subscribePost(subscribeReq(subPayload), { params: { taskId: TASK_ID, token: "wrong" } });
    expect(res.status).toBe(403);
    expect(tables.cleaner_push_subscriptions).toHaveLength(0);
  });

  test("unassigned task (cleaner_id null) → 409", async () => {
    const { client } = makeStatefulSupabase({
      cleaning_tasks: [{ id: TASK_ID, cleaner_token: TOKEN, cleaner_id: null }],
      cleaner_push_subscriptions: [],
    });
    (createServiceClient as jest.Mock).mockReturnValue(client);
    const res = await subscribePost(subscribeReq(subPayload), { params: { taskId: TASK_ID, token: TOKEN } });
    expect(res.status).toBe(409);
  });
});

describe("sendAssignmentPush — one push per subscription", () => {
  const seed = () => ({
    cleaner_push_subscriptions: [
      { id: "s1", cleaner_id: CLEANER_ID, endpoint: "https://push.example/ep-1", p256dh: "p1", auth: "a1" },
      { id: "s2", cleaner_id: CLEANER_ID, endpoint: "https://push.example/ep-2", p256dh: "p2", auth: "a2" },
    ],
  });

  test("fires exactly one web-push per subscription with the deep link", async () => {
    (webpush.sendNotification as jest.Mock).mockResolvedValue({ statusCode: 201 });
    const { client } = makeStatefulSupabase(seed());

    const out = await sendAssignmentPush(client, {
      cleanerId: CLEANER_ID,
      url: `/clean/${TASK_ID}/${TOKEN}`,
      title: "New cleaning job",
      body: "Villa Jamaica · Jul 14",
    });

    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({ configured: true, total: 2, sent: 2, pruned: 0, failed: 0 });
    // payload carries the deep link
    const firstPayload = JSON.parse((webpush.sendNotification as jest.Mock).mock.calls[0][1]);
    expect(firstPayload.url).toBe(`/clean/${TASK_ID}/${TOKEN}`);
  });

  test("410 on send → dead subscription pruned", async () => {
    (webpush.sendNotification as jest.Mock)
      .mockResolvedValueOnce({ statusCode: 201 })          // s1 ok
      .mockRejectedValueOnce({ statusCode: 410 });         // s2 gone
    const { client, tables } = makeStatefulSupabase(seed());

    const out = await sendAssignmentPush(client, {
      cleanerId: CLEANER_ID, url: "/clean/x/y", title: "t", body: "b",
    });

    expect(out).toMatchObject({ sent: 1, pruned: 1, failed: 0 });
    expect(tables.cleaner_push_subscriptions.map((r) => r.id)).toEqual(["s1"]); // s2 pruned
  });

  test("no subscriptions → no sends", async () => {
    const { client } = makeStatefulSupabase({ cleaner_push_subscriptions: [] });
    const out = await sendAssignmentPush(client, { cleanerId: CLEANER_ID, url: "/x", title: "t", body: "b" });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(out).toMatchObject({ total: 0, sent: 0 });
  });

  test("VAPID unconfigured → no-op (no sends)", async () => {
    const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
    const { client } = makeStatefulSupabase(seed());
    const out = await sendAssignmentPush(client, { cleanerId: CLEANER_ID, url: "/x", title: "t", body: "b" });
    expect(out.configured).toBe(false);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    process.env.VAPID_PUBLIC_KEY = pub; process.env.VAPID_PRIVATE_KEY = priv;
  });
});
