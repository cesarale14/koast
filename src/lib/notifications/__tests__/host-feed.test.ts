import { emitHostNotification, normalizeHostNotification, type HostNotificationRow } from "../host-feed";

function fakeSvc(insertImpl: () => Promise<{ error: unknown }>) {
  const insert = jest.fn().mockImplementation(insertImpl);
  const svc = { from: jest.fn().mockReturnValue({ insert }) } as unknown as Parameters<
    typeof emitHostNotification
  >[0];
  return { svc, insert };
}

describe("emitHostNotification", () => {
  test("inserts a host_notifications row with host_id/type/payload", async () => {
    const { svc, insert } = fakeSvc(async () => ({ error: null }));
    await emitHostNotification(svc, "host-1", "cleaning_completed", { taskId: "t1", photoCount: 2 });
    expect(insert).toHaveBeenCalledWith({
      host_id: "host-1",
      type: "cleaning_completed",
      payload: { taskId: "t1", photoCount: 2 },
    });
  });

  test("defaults payload to {}", async () => {
    const { svc, insert } = fakeSvc(async () => ({ error: null }));
    await emitHostNotification(svc, "host-1", "booking_new");
    expect(insert).toHaveBeenCalledWith({ host_id: "host-1", type: "booking_new", payload: {} });
  });

  test("swallows a DB error (never throws — must not break the triggering event)", async () => {
    const { svc } = fakeSvc(async () => ({ error: { message: "boom" } }));
    await expect(
      emitHostNotification(svc, "host-1", "proposal_created", {}),
    ).resolves.toBeUndefined();
  });

  test("swallows a thrown insert", async () => {
    const { svc } = fakeSvc(async () => {
      throw new Error("network");
    });
    await expect(
      emitHostNotification(svc, "host-1", "push_delivery_failure", {}),
    ).resolves.toBeUndefined();
  });
});

describe("normalizeHostNotification", () => {
  const row: HostNotificationRow = {
    id: "n1",
    host_id: "host-1",
    type: "cleaning_completed",
    payload: { propertyName: "Villa", photoCount: 3 },
    read_at: null,
    created_at: "2026-06-10T12:00:00Z",
  };

  test("camelCases the row + keeps the payload", () => {
    expect(normalizeHostNotification(row)).toEqual({
      id: "n1",
      type: "cleaning_completed",
      payload: { propertyName: "Villa", photoCount: 3 },
      readAt: null,
      createdAt: "2026-06-10T12:00:00Z",
    });
  });

  test("null payload → {}", () => {
    expect(normalizeHostNotification({ ...row, payload: null }).payload).toEqual({});
  });

  test("carries read_at through as readAt", () => {
    expect(normalizeHostNotification({ ...row, read_at: "2026-06-10T13:00:00Z" }).readAt).toBe(
      "2026-06-10T13:00:00Z",
    );
  });
});
