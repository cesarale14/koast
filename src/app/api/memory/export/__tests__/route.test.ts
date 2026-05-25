/**
 * Tests for GET /api/memory/export — M11 Phase D item 1 (M4).
 *
 * The HARD-FLOOR test class is the adversarial regression guard:
 * the route must derive hostId EXCLUSIVELY from the authenticated
 * session, never from request input. Per operator sign-off msg 3436:
 * "the test has to make the route try to leak and prove it can't."
 *
 * Mocks getAuthenticatedUser, createServiceClient, and exportMemoryForHost
 * at the module boundary; asserts exportMemoryForHost gets called with
 * `user.id` regardless of what's in the request URL/body.
 */

import { GET } from "../route";
import { NextRequest } from "next/server";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/supabase/service");
jest.mock("@/lib/memory/export");

import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { exportMemoryForHost } from "@/lib/memory/export";

const AUTHED_HOST = "00000000-0000-0000-0000-000000000aaa";
const OTHER_HOST = "00000000-0000-0000-0000-000000000bbb";

interface AuditInsertCall {
  args: unknown[];
}

function makeSupabaseAuditMock() {
  const auditInsertCalls: AuditInsertCall[] = [];
  const insertFn = jest.fn((row: unknown) => {
    auditInsertCalls.push({ args: [row] });
    return Promise.resolve({ data: null, error: null });
  });
  const supabase = {
    from: jest.fn(() => ({ insert: insertFn })),
  };
  return { supabase, auditInsertCalls };
}

const SAMPLE_PAYLOAD = {
  exported_at: "2026-05-25T18:30:00.000Z",
  host_id: AUTHED_HOST,
  koast_version: "M11-Phase-D",
  fact_count: 0,
  memory_facts: {},
};

beforeEach(() => {
  jest.clearAllMocks();
  (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: AUTHED_HOST } });
  (exportMemoryForHost as jest.Mock).mockResolvedValue(SAMPLE_PAYLOAD);
  const { supabase } = makeSupabaseAuditMock();
  (createServiceClient as jest.Mock).mockReturnValue(supabase);
});

describe("GET /api/memory/export", () => {
  test("401 when unauthenticated", async () => {
    (getAuthenticatedUser as jest.Mock).mockResolvedValueOnce({ user: null });

    const req = new NextRequest("http://localhost/api/memory/export", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(exportMemoryForHost).not.toHaveBeenCalled();
  });

  test("200 happy path + Content-Disposition attachment header", async () => {
    const req = new NextRequest("http://localhost/api/memory/export", { method: "GET" });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const cd = res.headers.get("Content-Disposition");
    expect(cd).toMatch(/^attachment; filename=koast-memory-\d{4}-\d{2}-\d{2}\.json$/);

    const body = await res.json();
    expect(body.host_id).toBe(AUTHED_HOST);
    expect(body.koast_version).toBe("M11-Phase-D");
  });

  test("500 on lib throw with logged error", async () => {
    (exportMemoryForHost as jest.Mock).mockRejectedValueOnce(new Error("db connection lost"));

    const req = new NextRequest("http://localhost/api/memory/export", { method: "GET" });
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/db connection lost/);
  });

  test("delegates with the AUTHED user id (default case)", async () => {
    const req = new NextRequest("http://localhost/api/memory/export", { method: "GET" });
    await GET(req);

    expect(exportMemoryForHost).toHaveBeenCalledTimes(1);
    expect(exportMemoryForHost).toHaveBeenCalledWith(AUTHED_HOST);
  });
});

describe("GET /api/memory/export — HARD-FLOOR ADVERSARIAL GUARD (cross-host isolation)", () => {
  test("ADVERSARIAL: ignores ?hostId=<other-host> in query string; scopes to AUTHED user", async () => {
    // Operator sign-off msg 3436: "the test has to make the route try
    // to leak and prove it can't." Even if a client crafts a request
    // with another host's id in the query, the route MUST read hostId
    // from auth only.
    const req = new NextRequest(
      `http://localhost/api/memory/export?hostId=${OTHER_HOST}`,
      { method: "GET" },
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(exportMemoryForHost).toHaveBeenCalledTimes(1);
    expect(exportMemoryForHost).toHaveBeenCalledWith(AUTHED_HOST);
    expect(exportMemoryForHost).not.toHaveBeenCalledWith(OTHER_HOST);
  });

  test("ADVERSARIAL: ignores ?host_id=<other-host> (alternate query-param name)", async () => {
    const req = new NextRequest(
      `http://localhost/api/memory/export?host_id=${OTHER_HOST}`,
      { method: "GET" },
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(exportMemoryForHost).toHaveBeenCalledWith(AUTHED_HOST);
    expect(exportMemoryForHost).not.toHaveBeenCalledWith(OTHER_HOST);
  });

  test("ADVERSARIAL: ignores ?user_id=<other-host>", async () => {
    const req = new NextRequest(
      `http://localhost/api/memory/export?user_id=${OTHER_HOST}`,
      { method: "GET" },
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(exportMemoryForHost).toHaveBeenCalledWith(AUTHED_HOST);
    expect(exportMemoryForHost).not.toHaveBeenCalledWith(OTHER_HOST);
  });

  test("ADVERSARIAL: ignores multiple adversarial params combined", async () => {
    const req = new NextRequest(
      `http://localhost/api/memory/export?hostId=${OTHER_HOST}&user_id=${OTHER_HOST}&host=${OTHER_HOST}`,
      { method: "GET" },
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(exportMemoryForHost).toHaveBeenCalledWith(AUTHED_HOST);
    expect(exportMemoryForHost).not.toHaveBeenCalledWith(OTHER_HOST);
  });
});
