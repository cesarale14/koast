jest.mock("@/lib/push/send", () => ({
  sendAssignmentPush: jest
    .fn()
    .mockResolvedValue({ configured: true, total: 1, sent: 1, pruned: 0, failed: 0 }),
}));

import { notifyCleaner } from "../notify";
import { sendAssignmentPush } from "@/lib/push/send";

type Seed = {
  cleaning_tasks?: Record<string, unknown>[];
  properties?: Record<string, unknown>[];
  cleaners?: Record<string, unknown>[];
};

function makeSvc(seed: Seed) {
  function from(table: keyof Seed) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      limit: () => builder,
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: (seed[table] as Record<string, unknown>[]) ?? [], error: null }).then(res, rej),
    };
    return builder;
  }
  return { from } as unknown as Parameters<typeof notifyCleaner>[0];
}

const HOST = "host-1";
const ARGS = { taskId: "t1", hostId: HOST };
const PROP = { id: "p1", name: "Villa Jamaica" };
const CLEANER = { id: "c1", name: "Karem Gutierrez" };
const TASK = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  property_id: "p1",
  cleaner_id: "c1",
  scheduled_date: "2026-06-12",
  cleaner_token: "tok",
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe("notifyCleaner", () => {
  test("fires the push on the happy path", async () => {
    const svc = makeSvc({ cleaning_tasks: [TASK()], properties: [PROP], cleaners: [CLEANER] });
    const r = await notifyCleaner(svc, ARGS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cleanerName).toBe("Karem Gutierrez");
      expect(r.propertyName).toBe("Villa Jamaica");
    }
    expect(sendAssignmentPush).toHaveBeenCalledTimes(1);
    expect((sendAssignmentPush as jest.Mock).mock.calls[0][1]).toMatchObject({
      cleanerId: "c1",
      url: "/clean/t1/tok",
    });
  });

  test("task not found → task_not_found, no push", async () => {
    const svc = makeSvc({ cleaning_tasks: [] });
    const r = await notifyCleaner(svc, ARGS);
    expect(r).toMatchObject({ ok: false, code: "task_not_found" });
    expect(sendAssignmentPush).not.toHaveBeenCalled();
  });

  test("property not owned → property_not_found", async () => {
    const svc = makeSvc({ cleaning_tasks: [TASK()], properties: [] });
    const r = await notifyCleaner(svc, ARGS);
    expect(r).toMatchObject({ ok: false, code: "property_not_found" });
    expect(sendAssignmentPush).not.toHaveBeenCalled();
  });

  test("no cleaner assigned → no_cleaner_assigned", async () => {
    const svc = makeSvc({ cleaning_tasks: [TASK({ cleaner_id: null })], properties: [PROP] });
    const r = await notifyCleaner(svc, ARGS);
    expect(r).toMatchObject({ ok: false, code: "no_cleaner_assigned" });
    expect(sendAssignmentPush).not.toHaveBeenCalled();
  });

  test("cleaner row missing → cleaner_not_found", async () => {
    const svc = makeSvc({ cleaning_tasks: [TASK()], properties: [PROP], cleaners: [] });
    const r = await notifyCleaner(svc, ARGS);
    expect(r).toMatchObject({ ok: false, code: "cleaner_not_found" });
    expect(sendAssignmentPush).not.toHaveBeenCalled();
  });
});
