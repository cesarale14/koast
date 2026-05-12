/**
 * Route tests for GET /api/audit-feed/unread-count — M9 Phase A
 * canonical exemplar for the API route testing pattern.
 *
 * Covers Phase G C4 behavior:
 *   - 401 when unauthenticated (no Supabase user)
 *   - NULL host_state.last_seen_inspect_at → "all unread", count capped
 *     at 100 server-side, display "9+" via formatDisplay
 *   - Recent last_seen + zero new events → { count: 0, display: null }
 *   - N=5 new events → { count: 5, display: "5" }
 *   - N=12 new events → { count: 12, display: "9+" } (overflow boundary)
 *   - host_state lookup error → structured 500
 *   - unified_audit_feed count error → structured 500
 *
 * Pattern reference: docs/testing/api-route-tests.md (Phase A canonical).
 */

import { GET } from "../route";

jest.mock("@/lib/supabase/server");

import { createClient } from "@/lib/supabase/server";
import {
  mockSupabaseClient,
  mockAuthedUser,
  mockUnauthed,
  mockSupabaseQuery,
  getQueryChain,
} from "@/__tests__/helpers/supabase";

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/audit-feed/unread-count — auth", () => {
  test("returns 401 when no authenticated user", async () => {
    const supabase = mockSupabaseClient();
    mockUnauthed(supabase);
    (createClient as jest.Mock).mockReturnValue(supabase);

    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "unauthenticated" });
  });
});

describe("GET /api/audit-feed/unread-count — authed paths", () => {
  test("NULL last_seen_inspect_at: count capped at 100, display '9+'", async () => {
    const supabase = mockSupabaseClient();
    mockAuthedUser(supabase, HOST_ID);
    mockSupabaseQuery(supabase, "host_state", { data: null, error: null });
    // DB returns 150 raw — the route caps at COUNT_HARD_CAP=100.
    mockSupabaseQuery(supabase, "unified_audit_feed", { count: 150, error: null });
    (createClient as jest.Mock).mockReturnValue(supabase);

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ count: 100, display: "9+" });

    // No .gt() applied when last_seen is NULL — sanity check the chain.
    const auditChain = getQueryChain(supabase, "unified_audit_feed");
    expect(auditChain.gt).not.toHaveBeenCalled();
  });

  test("recent last_seen + zero new events: returns 0 / null", async () => {
    const supabase = mockSupabaseClient();
    mockAuthedUser(supabase, HOST_ID);
    const recent = new Date().toISOString();
    mockSupabaseQuery(supabase, "host_state", {
      data: { last_seen_inspect_at: recent },
      error: null,
    });
    mockSupabaseQuery(supabase, "unified_audit_feed", { count: 0, error: null });
    (createClient as jest.Mock).mockReturnValue(supabase);

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ count: 0, display: null });

    // .gt() applied with the recent timestamp.
    const auditChain = getQueryChain(supabase, "unified_audit_feed");
    expect(auditChain.gt).toHaveBeenCalledWith("occurred_at", recent);
  });

  test("N=5 new events: numeric display '5'", async () => {
    const supabase = mockSupabaseClient();
    mockAuthedUser(supabase, HOST_ID);
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    mockSupabaseQuery(supabase, "host_state", {
      data: { last_seen_inspect_at: oneHourAgo },
      error: null,
    });
    mockSupabaseQuery(supabase, "unified_audit_feed", { count: 5, error: null });
    (createClient as jest.Mock).mockReturnValue(supabase);

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ count: 5, display: "5" });
  });

  test("N=12 new events: overflow display '9+'", async () => {
    const supabase = mockSupabaseClient();
    mockAuthedUser(supabase, HOST_ID);
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    mockSupabaseQuery(supabase, "host_state", {
      data: { last_seen_inspect_at: oneHourAgo },
      error: null,
    });
    mockSupabaseQuery(supabase, "unified_audit_feed", { count: 12, error: null });
    (createClient as jest.Mock).mockReturnValue(supabase);

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ count: 12, display: "9+" });
  });
});

describe("GET /api/audit-feed/unread-count — error paths", () => {
  test("host_state lookup error returns structured 500", async () => {
    const supabase = mockSupabaseClient();
    mockAuthedUser(supabase, HOST_ID);
    mockSupabaseQuery(supabase, "host_state", {
      data: null,
      error: { message: "connection refused" },
    });
    (createClient as jest.Mock).mockReturnValue(supabase);

    const response = await GET();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("host_state lookup failed");
    expect(body.error).toContain("connection refused");
  });

  test("unified_audit_feed count error returns structured 500", async () => {
    const supabase = mockSupabaseClient();
    mockAuthedUser(supabase, HOST_ID);
    mockSupabaseQuery(supabase, "host_state", {
      data: { last_seen_inspect_at: new Date().toISOString() },
      error: null,
    });
    mockSupabaseQuery(supabase, "unified_audit_feed", {
      count: null,
      error: { message: "view not found" },
    });
    (createClient as jest.Mock).mockReturnValue(supabase);

    const response = await GET();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("audit feed count failed");
    expect(body.error).toContain("view not found");
  });
});
