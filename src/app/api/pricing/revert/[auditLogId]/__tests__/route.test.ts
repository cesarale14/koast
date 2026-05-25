/**
 * Tests for POST /api/pricing/revert/[auditLogId] — M11 Phase C item 1 (M2).
 *
 * Route boundary tests: auth, env-gate, lock, lib delegation, status mapping.
 * The revertRatePush lib is mocked at the module boundary so the route's
 * outcome → HTTP status mapping is exercised independently.
 */

import { POST } from "../route";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/supabase/service");
jest.mock("@/lib/concurrency/locks");
jest.mock("@/lib/channex/calendar-push-gate");
jest.mock("@/lib/pricing/revert");

import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { acquireLock, releaseLock } from "@/lib/concurrency/locks";
import { isCalendarPushEnabled } from "@/lib/channex/calendar-push-gate";
import { revertRatePush } from "@/lib/pricing/revert";

const AUDIT_LOG_ID = "11111111-1111-1111-1111-111111111111";
const REVERT_AUDIT_ID = "22222222-2222-2222-2222-222222222222";
const HOST = { id: "00000000-0000-0000-0000-000000000aaa" };

function makeRequest() {
  return new Request("http://localhost/api/pricing/revert/test", { method: "POST" }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  (isCalendarPushEnabled as jest.Mock).mockReturnValue(true);
  (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: HOST });
  (acquireLock as jest.Mock).mockResolvedValue(true);
  (releaseLock as jest.Mock).mockResolvedValue(undefined);
});

describe("POST /api/pricing/revert/[auditLogId]", () => {
  test("503 when calendar push env-gate is disabled", async () => {
    (isCalendarPushEnabled as jest.Mock).mockReturnValueOnce(false);

    const res = await POST(makeRequest(), { params: { auditLogId: AUDIT_LOG_ID } });
    expect(res.status).toBe(503);
  });

  test("401 when unauthenticated", async () => {
    (getAuthenticatedUser as jest.Mock).mockResolvedValueOnce({ user: null });

    const res = await POST(makeRequest(), { params: { auditLogId: AUDIT_LOG_ID } });
    expect(res.status).toBe(401);
  });

  test("400 when auditLogId param missing", async () => {
    const res = await POST(makeRequest(), { params: { auditLogId: "" } });
    expect(res.status).toBe(400);
  });

  test("409 when concurrency lock already held", async () => {
    (acquireLock as jest.Mock).mockResolvedValueOnce(false);

    const res = await POST(makeRequest(), { params: { auditLogId: AUDIT_LOG_ID } });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("revert_in_progress");
  });

  test("200 on succeeded outcome with restored entries", async () => {
    (revertRatePush as jest.Mock).mockResolvedValueOnce({
      outcome: "succeeded",
      revert_audit_log_id: REVERT_AUDIT_ID,
      restored_count: 2,
      failed_count: 0,
      restored: [
        { date: "2026-06-01", channel: "BDC", rate: 200, min_stay_arrival: null },
        { date: "2026-06-02", channel: "BDC", rate: 210, min_stay_arrival: null },
      ],
      failed: [],
    });

    const res = await POST(makeRequest(), { params: { auditLogId: AUDIT_LOG_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe("succeeded");
    expect(body.restored_count).toBe(2);
    expect(releaseLock).toHaveBeenCalled();
  });

  test("404 maps to audit_row_not_found outcome", async () => {
    (revertRatePush as jest.Mock).mockResolvedValueOnce({
      outcome: "audit_row_not_found",
      revert_audit_log_id: null,
      restored_count: 0,
      failed_count: 0,
      restored: [],
      failed: [],
    });

    const res = await POST(makeRequest(), { params: { auditLogId: AUDIT_LOG_ID } });
    expect(res.status).toBe(404);
  });

  test("409 maps to already_reverted outcome", async () => {
    (revertRatePush as jest.Mock).mockResolvedValueOnce({
      outcome: "already_reverted",
      revert_audit_log_id: null,
      restored_count: 0,
      failed_count: 0,
      restored: [],
      failed: [],
    });

    const res = await POST(makeRequest(), { params: { auditLogId: AUDIT_LOG_ID } });
    expect(res.status).toBe(409);
  });

  test("502 maps to push_failed outcome", async () => {
    (revertRatePush as jest.Mock).mockResolvedValueOnce({
      outcome: "push_failed",
      revert_audit_log_id: REVERT_AUDIT_ID,
      restored_count: 0,
      failed_count: 1,
      restored: [],
      failed: [{ date: "2026-06-01", channel: "BDC", error: "channex error" }],
    });

    const res = await POST(makeRequest(), { params: { auditLogId: AUDIT_LOG_ID } });
    expect(res.status).toBe(502);
  });

  test("403 maps to ownership_mismatch outcome", async () => {
    (revertRatePush as jest.Mock).mockResolvedValueOnce({
      outcome: "ownership_mismatch",
      revert_audit_log_id: null,
      restored_count: 0,
      failed_count: 0,
      restored: [],
      failed: [],
    });

    const res = await POST(makeRequest(), { params: { auditLogId: AUDIT_LOG_ID } });
    expect(res.status).toBe(403);
  });
});
