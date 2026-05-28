/**
 * RLS regression-guard for POST /api/telemetry/surface
 * (M13 Phase 1.A STEP 4; operator msg 3518 A8 + A1 binding).
 *
 * §3.5.D [CANON] adversarial-regression discipline — 3rd hard-floor
 * instance after M11 Phase D M4 memory-export + M12 Phase B J3
 * ensure-verb-chain.
 *
 * The contract: the endpoint NEVER trusts client-supplied host_id. It
 * derives host_id from auth.getUser() session. Any client-injected
 * host_id (via body, query, header, or impersonation attempt) must be
 * IGNORED — the server-derived host_id is the only value used in the
 * insert.
 *
 * Four adversarial variants tested:
 *   1. host_id in request body → ignored (server uses session.user.id)
 *   2. host_id as query param → ignored
 *   3. host_id as custom header → ignored
 *   4. multi-event batch where SOME events claim foreign host_id → all
 *      rows inserted with session.user.id (no per-event override)
 *
 * The actual DB-level RLS policy (`host_can_read_own_telemetry`) is
 * verified at migration-apply time via the 3-part presence check
 * (information_schema + pg_indexes + pg_policies + relrowsecurity);
 * the policy's enforcement is a postgres-layer guarantee and is not
 * unit-testable from jest.
 */

import { POST } from "../route";

type InsertCall = { rows: Array<Record<string, unknown>> };

function makeMockSupabaseAuth(userId: string) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } } }),
    },
  };
}

function makeMockServiceClient(): {
  client: { from: (table: string) => unknown };
  inserts: InsertCall[];
} {
  const inserts: InsertCall[] = [];
  return {
    inserts,
    client: {
      from: (table: string) => {
        expect(table).toBe("host_surface_telemetry");
        return {
          insert: async (rows: Array<Record<string, unknown>>) => {
            inserts.push({ rows });
            return { error: null };
          },
        };
      },
    },
  };
}

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));
jest.mock("@/lib/supabase/service", () => ({
  createServiceClient: jest.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const mockedCreateClient = createClient as jest.Mock;
const mockedCreateServiceClient = createServiceClient as jest.Mock;

const SERVER_DERIVED_HOST = "session-user-id-host-A";
const FOREIGN_HOST_CLAIM = "spoofed-host-id-host-B";

describe("POST /api/telemetry/surface — RLS regression-guard (§3.5.D 3rd instance)", () => {
  beforeEach(() => {
    mockedCreateClient.mockReturnValue(
      makeMockSupabaseAuth(SERVER_DERIVED_HOST),
    );
  });

  test("adversarial #1: host_id in request body is IGNORED", async () => {
    const svc = makeMockServiceClient();
    mockedCreateServiceClient.mockReturnValue(svc.client);

    const req = new Request("https://app.koasthq.com/api/telemetry/surface", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Note: bodySchema in route.ts validates the events array; the
        // top-level host_id field is silently DROPPED by Zod's
        // .strict()-less object schema, but even if it were accepted,
        // route.ts hardcodes host_id: user.id on every row.
        host_id: FOREIGN_HOST_CLAIM,
        events: [
          {
            session_id: "sess-1",
            event_kind: "inspect_view",
            pathname: "/calendar",
            task_class: "bulk_operate",
          },
        ],
      }),
    });

    const resp = await POST(req);
    expect(resp.status).toBe(200);
    expect(svc.inserts).toHaveLength(1);
    expect(svc.inserts[0]?.rows).toHaveLength(1);
    expect(svc.inserts[0]?.rows[0]?.host_id).toBe(SERVER_DERIVED_HOST);
    expect(svc.inserts[0]?.rows[0]?.host_id).not.toBe(FOREIGN_HOST_CLAIM);
  });

  test("adversarial #2: host_id as query param is IGNORED", async () => {
    const svc = makeMockServiceClient();
    mockedCreateServiceClient.mockReturnValue(svc.client);

    const req = new Request(
      `https://app.koasthq.com/api/telemetry/surface?host_id=${encodeURIComponent(FOREIGN_HOST_CLAIM)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [
            {
              session_id: "sess-2",
              event_kind: "chat_view",
              pathname: "/",
            },
          ],
        }),
      },
    );

    const resp = await POST(req);
    expect(resp.status).toBe(200);
    expect(svc.inserts[0]?.rows[0]?.host_id).toBe(SERVER_DERIVED_HOST);
    expect(svc.inserts[0]?.rows[0]?.host_id).not.toBe(FOREIGN_HOST_CLAIM);
  });

  test("adversarial #3: host_id as custom header is IGNORED", async () => {
    const svc = makeMockServiceClient();
    mockedCreateServiceClient.mockReturnValue(svc.client);

    const req = new Request("https://app.koasthq.com/api/telemetry/surface", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Host-Id": FOREIGN_HOST_CLAIM,
        "X-Forwarded-User": FOREIGN_HOST_CLAIM,
      },
      body: JSON.stringify({
        events: [
          {
            session_id: "sess-3",
            event_kind: "inspect_entry",
            pathname: "/settings",
            task_class: "config",
            entry_trigger: "self_navigated",
          },
        ],
      }),
    });

    const resp = await POST(req);
    expect(resp.status).toBe(200);
    expect(svc.inserts[0]?.rows[0]?.host_id).toBe(SERVER_DERIVED_HOST);
    expect(svc.inserts[0]?.rows[0]?.host_id).not.toBe(FOREIGN_HOST_CLAIM);
  });

  test("adversarial #4: multi-event batch with per-event host_id claims — all rows use session host_id", async () => {
    const svc = makeMockServiceClient();
    mockedCreateServiceClient.mockReturnValue(svc.client);

    const req = new Request("https://app.koasthq.com/api/telemetry/surface", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            session_id: "sess-4",
            event_kind: "chat_view",
            pathname: "/",
            // Even if per-event host_id were accepted, the server
            // hardcodes host_id: user.id on row construction.
            host_id: FOREIGN_HOST_CLAIM,
          } as Record<string, unknown>,
          {
            session_id: "sess-4",
            event_kind: "inspect_entry",
            pathname: "/pricing",
            task_class: "bulk_operate",
            entry_trigger: "self_navigated",
            host_id: FOREIGN_HOST_CLAIM,
          } as Record<string, unknown>,
        ],
      }),
    });

    const resp = await POST(req);
    expect(resp.status).toBe(200);
    expect(svc.inserts[0]?.rows).toHaveLength(2);
    for (const row of svc.inserts[0]?.rows ?? []) {
      expect(row.host_id).toBe(SERVER_DERIVED_HOST);
      expect(row.host_id).not.toBe(FOREIGN_HOST_CLAIM);
    }
  });

  test("unauthenticated request returns 401 without inserting", async () => {
    mockedCreateClient.mockReturnValue({
      auth: {
        getUser: async () => ({ data: { user: null } }),
      },
    });
    const svc = makeMockServiceClient();
    mockedCreateServiceClient.mockReturnValue(svc.client);

    const req = new Request("https://app.koasthq.com/api/telemetry/surface", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            session_id: "sess-anon",
            event_kind: "chat_view",
            pathname: "/",
          },
        ],
      }),
    });

    const resp = await POST(req);
    expect(resp.status).toBe(401);
    expect(svc.inserts).toHaveLength(0);
  });

  test("legitimate insert succeeds + uses session host_id", async () => {
    const svc = makeMockServiceClient();
    mockedCreateServiceClient.mockReturnValue(svc.client);

    const req = new Request("https://app.koasthq.com/api/telemetry/surface", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            session_id: "sess-legit",
            event_kind: "chat_view",
            pathname: "/",
            context: { ui_locale: "en-US" },
          },
        ],
      }),
    });

    const resp = await POST(req);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.inserted).toBe(1);
    expect(svc.inserts[0]?.rows[0]?.host_id).toBe(SERVER_DERIVED_HOST);
    expect(svc.inserts[0]?.rows[0]?.session_id).toBe("sess-legit");
    expect(svc.inserts[0]?.rows[0]?.event_kind).toBe("chat_view");
    expect(svc.inserts[0]?.rows[0]?.pathname).toBe("/");
    expect(svc.inserts[0]?.rows[0]?.context).toEqual({ ui_locale: "en-US" });
    // Navigation row carries event_category='navigation' by default; perf
    // fields remain null. M13 Phase 1.B fluidity extension shape.
    expect(svc.inserts[0]?.rows[0]?.event_category).toBe("navigation");
    expect(svc.inserts[0]?.rows[0]?.latency_ms).toBeNull();
    expect(svc.inserts[0]?.rows[0]?.budget_class).toBeNull();
  });

  // --------- M13 Phase 1.B Step 4 — fluidity perf rows ---------

  test("M13 Phase 1.B: perf row insert carries latency_ms + budget_class + event_category='perf'", async () => {
    const svc = makeMockServiceClient();
    mockedCreateServiceClient.mockReturnValue(svc.client);

    const req = new Request("https://app.koasthq.com/api/telemetry/surface", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            session_id: "sess-perf",
            event_kind: "fluidity_measurement",
            pathname: "/calendar",
            latency_ms: 87.4,
            budget_class: "cmd_k_first_result",
          },
        ],
      }),
    });

    const resp = await POST(req);
    expect(resp.status).toBe(200);
    const row = svc.inserts[0]?.rows[0];
    expect(row?.host_id).toBe(SERVER_DERIVED_HOST);
    expect(row?.event_kind).toBe("fluidity_measurement");
    expect(row?.event_category).toBe("perf");
    expect(row?.latency_ms).toBe(87.4);
    expect(row?.budget_class).toBe("cmd_k_first_result");
  });

  test("M13 Phase 1.B: perf event_kind without latency_ms returns 400", async () => {
    const req = new Request("https://app.koasthq.com/api/telemetry/surface", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            session_id: "sess-perf-missing",
            event_kind: "fluidity_measurement",
            pathname: "/calendar",
            budget_class: "cmd_k_first_result",
            // latency_ms missing — cross-column refinement should reject
          },
        ],
      }),
    });
    const resp = await POST(req);
    expect(resp.status).toBe(400);
  });

  test("M13 Phase 1.B: perf event_kind without budget_class returns 400", async () => {
    const req = new Request("https://app.koasthq.com/api/telemetry/surface", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            session_id: "sess-perf-missing-budget",
            event_kind: "fluidity_measurement",
            pathname: "/calendar",
            latency_ms: 42,
            // budget_class missing — cross-column refinement should reject
          },
        ],
      }),
    });
    const resp = await POST(req);
    expect(resp.status).toBe(400);
  });

  test("M13 Phase 1.B: perf row's host_id is server-derived (RLS-guard parity)", async () => {
    // §3.5.D regression-guard scope extends to perf rows. A malicious
    // client claiming a host_id on a perf-class event must be ignored,
    // same shape as the navigation-row adversarial cases above.
    const svc = makeMockServiceClient();
    mockedCreateServiceClient.mockReturnValue(svc.client);

    const req = new Request("https://app.koasthq.com/api/telemetry/surface", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-host-id": "11111111-1111-1111-1111-111111111111",
      },
      body: JSON.stringify({
        host_id: "22222222-2222-2222-2222-222222222222",
        events: [
          {
            host_id: "33333333-3333-3333-3333-333333333333",
            session_id: "sess-evil-perf",
            event_kind: "fluidity_measurement",
            pathname: "/calendar",
            latency_ms: 50,
            budget_class: "cmd_k_first_result",
          },
        ],
      }),
    });

    const resp = await POST(req);
    expect(resp.status).toBe(200);
    expect(svc.inserts[0]?.rows[0]?.host_id).toBe(SERVER_DERIVED_HOST);
  });
});
