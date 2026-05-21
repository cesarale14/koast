/**
 * host_id passthrough tests for 4 notify* functions.
 * M10 Phase C STEP 7 (M3).
 *
 * App-level enforcement: every notify* path threads owning-host id into
 * storeNotification, which sets notifications.host_id at INSERT. Historical
 * rows stay NULL (Outcome 3 per STEP 6); new rows enforced here.
 *
 * 5 tests; 712 → 717.
 */

// Mock SMS helpers BEFORE importing notifications (which imports them).
jest.mock("@/lib/notifications/sms", () => ({
  __esModule: true,
  sendSMS: jest.fn().mockResolvedValue("SM_mock_sid"),
  logSMS: jest.fn().mockResolvedValue(undefined),
}));

import {
  notifyCleanerAssigned,
  notifyCleanerReminder,
  notifyHostComplete,
  notifyHostIssue,
} from "@/lib/notifications";

/** Capture the insert payload from supabase.from("notifications").insert(...). */
function makeSupabaseMock() {
  const insert = jest.fn().mockResolvedValue({ error: null });
  const from = jest.fn((table: string) => {
    // Cleaner notifications also write to sms_log via logSMS (mocked).
    // The notifications insert is the only one we care about here.
    void table;
    return {
      insert,
      // Some upstream code chains via select/eq; not used in storeNotification.
      select: () => ({ eq: () => ({ limit: () => ({ data: [] }) }) }),
    };
  });
  return { supabase: { from }, insert };
}

const HOST_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "https://test.koasthq.com";
});

describe("notify* host_id passthrough — M3 STEP 7", () => {
  test("notifyCleanerAssigned sets host_id from opts.userId", async () => {
    const { supabase, insert } = makeSupabaseMock();
    const task = { id: "t1", scheduled_date: "2026-06-01", cleaner_token: "tok" };
    const cleaner = { id: "c1", phone: "+1234567890", name: "Alice" };
    await notifyCleanerAssigned(supabase, task, "Villa", cleaner, { userId: HOST_ID });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({
      host_id: HOST_ID,
      type: "cleaner_assigned",
      recipient: "Alice",
    });
  });

  test("notifyCleanerAssigned defaults host_id to null when opts.userId undefined (defensive)", async () => {
    const { supabase, insert } = makeSupabaseMock();
    const task = { id: "t2", scheduled_date: "2026-06-01", cleaner_token: "tok" };
    const cleaner = { id: "c1", phone: "+1234567890", name: "Alice" };
    await notifyCleanerAssigned(supabase, task, "Villa", cleaner);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({
      host_id: null,
      type: "cleaner_assigned",
    });
  });

  test("notifyCleanerReminder sets host_id from opts.userId", async () => {
    const { supabase, insert } = makeSupabaseMock();
    const task = { id: "t3", scheduled_date: "2026-06-01", cleaner_token: "tok" };
    const cleaner = { id: "c1", phone: "+1234567890", name: "Bob" };
    await notifyCleanerReminder(supabase, task, "Villa", "123 Main St", cleaner, {
      userId: HOST_ID,
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({
      host_id: HOST_ID,
      type: "cleaner_reminder",
      recipient: "Bob",
    });
  });

  test("notifyHostComplete sets host_id from explicit hostId param", async () => {
    const { supabase, insert } = makeSupabaseMock();
    const task = { id: "t4", scheduled_date: "2026-06-01" };
    await notifyHostComplete(supabase, HOST_ID, task, "Villa", null);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({
      host_id: HOST_ID,
      type: "host_complete",
      recipient: "host",
    });
  });

  test("notifyHostIssue sets host_id from explicit hostId param", async () => {
    const { supabase, insert } = makeSupabaseMock();
    const task = { id: "t5", scheduled_date: "2026-06-01", cleaner_token: "tok" };
    await notifyHostIssue(supabase, HOST_ID, task, "Villa", "Door lock broken", null);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({
      host_id: HOST_ID,
      type: "host_issue",
      recipient: "host",
    });
  });
});
