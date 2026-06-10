jest.mock("@/lib/push/send", () => ({
  sendAssignmentPush: jest
    .fn()
    .mockResolvedValue({ configured: false, total: 0, sent: 0, pruned: 0, failed: 0 }),
}));
jest.mock("@/lib/notifications/host-feed", () => ({ emitHostNotification: jest.fn() }));

import { assignCleaner } from "../assign";
import { sendAssignmentPush } from "@/lib/push/send";
import { emitHostNotification } from "@/lib/notifications/host-feed";

type Seed = {
  cleaners?: Record<string, unknown>[];
  cleaning_tasks?: Record<string, unknown>[];
  properties?: Record<string, unknown>[];
  updateResult?: Record<string, unknown>[];
};

// Chainable fake: every method returns the builder; the builder is thenable and
// resolves to the seeded rows (read) or the update result (after .update()).
function makeSvc(seed: Seed) {
  function from(table: keyof Seed) {
    const state = { mode: "read" as "read" | "update" };
    const result = () =>
      state.mode === "update"
        ? { data: seed.updateResult ?? [{ id: "updated" }], error: null }
        : { data: (seed[table] as Record<string, unknown>[]) ?? [], error: null };
    const builder: Record<string, unknown> = {
      select: () => builder,
      update: () => {
        state.mode = "update";
        return builder;
      },
      eq: () => builder,
      limit: () => builder,
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(res, rej),
    };
    return builder;
  }
  return { from } as unknown as Parameters<typeof assignCleaner>[0];
}

const HOST = "host-1";
const ARGS = { taskId: "t1", cleanerId: "c1", hostId: HOST };

const CLEANER = { id: "c1", name: "Karem Gutierrez", phone: "+1" };
const PROP = { id: "p1", name: "Villa Jamaica" };
const TASK = (status: string) => ({
  id: "t1",
  property_id: "p1",
  scheduled_date: "2026-06-12",
  scheduled_time: null,
  cleaner_token: "tok",
  status,
});

beforeEach(() => jest.clearAllMocks());

describe("assignCleaner", () => {
  test("assigns + dispatches on the happy path", async () => {
    const svc = makeSvc({
      cleaners: [CLEANER],
      cleaning_tasks: [TASK("pending")],
      properties: [PROP],
      updateResult: [{ id: "t1" }],
    });
    const r = await assignCleaner(svc, ARGS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cleanerName).toBe("Karem Gutierrez");
      expect(r.propertyName).toBe("Villa Jamaica");
    }
    expect(sendAssignmentPush).toHaveBeenCalledTimes(1);
  });

  test("emits push_delivery_failure when the cleaner has devices but none received it", async () => {
    (sendAssignmentPush as jest.Mock).mockResolvedValueOnce({
      configured: true,
      total: 2,
      sent: 0,
      pruned: 0,
      failed: 2,
    });
    const svc = makeSvc({
      cleaners: [CLEANER],
      cleaning_tasks: [TASK("pending")],
      properties: [PROP],
      updateResult: [{ id: "t1" }],
    });
    const r = await assignCleaner(svc, ARGS);
    expect(r.ok).toBe(true);
    expect(emitHostNotification).toHaveBeenCalledWith(
      svc,
      ARGS.hostId,
      "push_delivery_failure",
      expect.objectContaining({ cleanerName: "Karem Gutierrez", propertyName: "Villa Jamaica" }),
    );
  });

  test("does NOT emit push_delivery_failure when the push is delivered", async () => {
    (sendAssignmentPush as jest.Mock).mockResolvedValueOnce({
      configured: true,
      total: 2,
      sent: 2,
      pruned: 0,
      failed: 0,
    });
    const svc = makeSvc({
      cleaners: [CLEANER],
      cleaning_tasks: [TASK("pending")],
      properties: [PROP],
      updateResult: [{ id: "t1" }],
    });
    await assignCleaner(svc, ARGS);
    expect(emitHostNotification).not.toHaveBeenCalled();
  });

  test("does NOT emit when there are no subscribed devices (total 0)", async () => {
    (sendAssignmentPush as jest.Mock).mockResolvedValueOnce({
      configured: true,
      total: 0,
      sent: 0,
      pruned: 0,
      failed: 0,
    });
    const svc = makeSvc({
      cleaners: [CLEANER],
      cleaning_tasks: [TASK("pending")],
      properties: [PROP],
      updateResult: [{ id: "t1" }],
    });
    await assignCleaner(svc, ARGS);
    expect(emitHostNotification).not.toHaveBeenCalled();
  });

  test("rejects an unowned/missing cleaner", async () => {
    const svc = makeSvc({ cleaners: [], cleaning_tasks: [TASK("pending")], properties: [PROP] });
    const r = await assignCleaner(svc, ARGS);
    expect(r).toMatchObject({ ok: false, code: "cleaner_not_found" });
    expect(sendAssignmentPush).not.toHaveBeenCalled();
  });

  test("rejects a missing task", async () => {
    const svc = makeSvc({ cleaners: [CLEANER], cleaning_tasks: [], properties: [PROP] });
    const r = await assignCleaner(svc, ARGS);
    expect(r).toMatchObject({ ok: false, code: "task_not_found" });
  });

  test("rejects when the host doesn't own the task's property", async () => {
    const svc = makeSvc({ cleaners: [CLEANER], cleaning_tasks: [TASK("pending")], properties: [] });
    const r = await assignCleaner(svc, ARGS);
    expect(r).toMatchObject({ ok: false, code: "property_not_found" });
  });

  test("refuses to reassign an in_progress turnover (no push fired)", async () => {
    const svc = makeSvc({
      cleaners: [CLEANER],
      cleaning_tasks: [TASK("in_progress")],
      properties: [PROP],
    });
    const r = await assignCleaner(svc, ARGS);
    expect(r).toMatchObject({ ok: false, code: "already_started" });
    expect(sendAssignmentPush).not.toHaveBeenCalled();
  });

  test("refuses to reassign a completed turnover", async () => {
    const svc = makeSvc({
      cleaners: [CLEANER],
      cleaning_tasks: [TASK("completed")],
      properties: [PROP],
    });
    const r = await assignCleaner(svc, ARGS);
    expect(r).toMatchObject({ ok: false, code: "already_started" });
  });

  test("allows re-dispatch of an already-assigned turnover", async () => {
    const svc = makeSvc({
      cleaners: [CLEANER],
      cleaning_tasks: [TASK("assigned")],
      properties: [PROP],
      updateResult: [{ id: "t1" }],
    });
    const r = await assignCleaner(svc, ARGS);
    expect(r.ok).toBe(true);
  });

  test("surfaces update_failed when no rows are updated", async () => {
    const svc = makeSvc({
      cleaners: [CLEANER],
      cleaning_tasks: [TASK("pending")],
      properties: [PROP],
      updateResult: [],
    });
    const r = await assignCleaner(svc, ARGS);
    expect(r).toMatchObject({ ok: false, code: "update_failed" });
  });
});
