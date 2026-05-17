/**
 * Tests for /api/onboarding/idle-status — M9 Phase G E1 split.
 *
 * Coverage groups per spec STEP 7.5:
 *   (a) GET pure-read — no writes; response shape; Cache-Control header
 *   (b) POST idempotency — call twice; markedCompleteAt early-return on 2nd
 *   (c) POST without prior GET — server re-fetches; writes fire based on
 *       state, not client claims
 *   (d) POST no-op when state clean — empty written[]; no writes
 *   (e) POST cooldown gate — should_reengage=true but cooldown active;
 *       reengage write skipped; silent-complete still fires if eligible
 *
 * Strategy: mock `@/lib/onboarding/idle-status` so each test controls
 * computeIdleStatus return value directly. Mock `@/lib/agent/onboarding-state`
 * for writeOnboardingFact-call assertions. Auth is mocked via the shared
 * supabase helper.
 */

import { GET, POST } from "../route";

jest.mock("@/lib/supabase/server");
jest.mock("@/lib/supabase/service");
jest.mock("@/lib/onboarding/idle-status");
jest.mock("@/lib/agent/onboarding-state");

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { computeIdleStatus } from "@/lib/onboarding/idle-status";
import { writeOnboardingFact } from "@/lib/agent/onboarding-state";

const HOST_ID = "00000000-0000-0000-0000-0000000aa001";

function mockAuth(authed: boolean = true) {
  const supabaseSession = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: authed ? { id: HOST_ID } : null },
        error: null,
      }),
    },
  };
  (createClient as jest.Mock).mockReturnValue(supabaseSession);
  (createServiceClient as jest.Mock).mockReturnValue({ /* service stub */ });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================================
// (a) GET — pure read
// =====================================================================

describe("GET /api/onboarding/idle-status — pure read", () => {
  test("no writeOnboardingFact calls regardless of state", async () => {
    mockAuth(true);
    (computeIdleStatus as jest.Mock).mockResolvedValue({
      hours_since_last_turn: 60,
      should_reengage: false,
      should_silent_complete: true,
      reengagement_cooldown_active: false,
      markedCompleteAt: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(writeOnboardingFact).not.toHaveBeenCalled();
  });

  test("returns 4-field response shape (excludes markedCompleteAt internal)", async () => {
    mockAuth(true);
    (computeIdleStatus as jest.Mock).mockResolvedValue({
      hours_since_last_turn: 30,
      should_reengage: true,
      should_silent_complete: false,
      reengagement_cooldown_active: false,
      markedCompleteAt: null,
    });

    const res = await GET();
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      "hours_since_last_turn",
      "reengagement_cooldown_active",
      "should_reengage",
      "should_silent_complete",
    ]);
    expect(body.should_reengage).toBe(true);
    // markedCompleteAt must NOT leak to client surface.
    expect(body).not.toHaveProperty("markedCompleteAt");
  });

  test("sets Cache-Control: no-store header", async () => {
    mockAuth(true);
    (computeIdleStatus as jest.Mock).mockResolvedValue({
      hours_since_last_turn: null,
      should_reengage: false,
      should_silent_complete: false,
      reengagement_cooldown_active: false,
      markedCompleteAt: null,
    });

    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

// =====================================================================
// (b) POST idempotency
// =====================================================================

describe("POST /api/onboarding/idle-status — idempotency", () => {
  test("first call writes silent-complete + reengage; second call early-returns on markedCompleteAt", async () => {
    mockAuth(true);
    // First call: state warrants silent-complete write (only).
    // silent-complete and reengage are mutually exclusive — silent-complete
    // suppresses reengage in the helper. Cover sequencing with two distinct
    // mock returns.
    (computeIdleStatus as jest.Mock).mockResolvedValueOnce({
      hours_since_last_turn: 60,
      should_reengage: false,
      should_silent_complete: true,
      reengagement_cooldown_active: false,
      markedCompleteAt: null,
    });
    (writeOnboardingFact as jest.Mock).mockResolvedValue(undefined);

    const res1 = await POST();
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1).toEqual({ acked: true, written: ["marked_complete"] });
    expect(writeOnboardingFact).toHaveBeenCalledTimes(1);
    expect(writeOnboardingFact).toHaveBeenCalledWith(
      expect.anything(),
      HOST_ID,
      "onboarding_marked_complete_at",
      expect.any(String),
    );

    // Second call: helper now returns markedCompleteAt populated → early-return.
    (writeOnboardingFact as jest.Mock).mockClear();
    (computeIdleStatus as jest.Mock).mockResolvedValueOnce({
      hours_since_last_turn: 72,
      should_reengage: false,
      should_silent_complete: false,
      reengagement_cooldown_active: false,
      markedCompleteAt: "2026-05-17T01:00:00Z",
    });
    const res2 = await POST();
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2).toEqual({ acked: true, written: [] });
    expect(writeOnboardingFact).not.toHaveBeenCalled();
  });

  test("re-engage write fires when state warrants (no silent-complete)", async () => {
    mockAuth(true);
    (computeIdleStatus as jest.Mock).mockResolvedValue({
      hours_since_last_turn: 30,
      should_reengage: true,
      should_silent_complete: false,
      reengagement_cooldown_active: false,
      markedCompleteAt: null,
    });
    (writeOnboardingFact as jest.Mock).mockResolvedValue(undefined);

    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({ acked: true, written: ["reengaged"] });
    expect(writeOnboardingFact).toHaveBeenCalledTimes(1);
    expect(writeOnboardingFact).toHaveBeenCalledWith(
      expect.anything(),
      HOST_ID,
      "onboarding_idle_reengaged_at",
      expect.any(String),
    );
  });
});

// =====================================================================
// (c) POST without prior GET — server re-fetches, doesn't trust client
// =====================================================================

describe("POST /api/onboarding/idle-status — server-side state re-fetch", () => {
  test("server-fetches state; writes fire based on server state regardless of any client context", async () => {
    mockAuth(true);
    (computeIdleStatus as jest.Mock).mockResolvedValue({
      hours_since_last_turn: 60,
      should_reengage: false,
      should_silent_complete: true,
      reengagement_cooldown_active: false,
      markedCompleteAt: null,
    });
    (writeOnboardingFact as jest.Mock).mockResolvedValue(undefined);

    // POST takes no body — server fetches state itself.
    const res = await POST();
    expect(res.status).toBe(200);
    // computeIdleStatus was called (server re-fetched, not relying on caller).
    expect(computeIdleStatus).toHaveBeenCalledTimes(1);
    expect(computeIdleStatus).toHaveBeenCalledWith(expect.anything(), HOST_ID);
    // Write fired based on server-fetched state.
    const body = await res.json();
    expect(body.written).toEqual(["marked_complete"]);
  });
});

// =====================================================================
// (d) POST no-op when state clean
// =====================================================================

describe("POST /api/onboarding/idle-status — clean state no-op", () => {
  test("empty written[] when neither should_reengage nor should_silent_complete", async () => {
    mockAuth(true);
    (computeIdleStatus as jest.Mock).mockResolvedValue({
      hours_since_last_turn: 10,
      should_reengage: false,
      should_silent_complete: false,
      reengagement_cooldown_active: false,
      markedCompleteAt: null,
    });

    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({ acked: true, written: [] });
    expect(writeOnboardingFact).not.toHaveBeenCalled();
  });

  test("empty written[] when host has never had a turn (hours null)", async () => {
    mockAuth(true);
    (computeIdleStatus as jest.Mock).mockResolvedValue({
      hours_since_last_turn: null,
      should_reengage: false,
      should_silent_complete: false,
      reengagement_cooldown_active: false,
      markedCompleteAt: null,
    });

    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({ acked: true, written: [] });
    expect(writeOnboardingFact).not.toHaveBeenCalled();
  });
});

// =====================================================================
// (e) POST cooldown gate
// =====================================================================

describe("POST /api/onboarding/idle-status — cooldown gate", () => {
  test("should_reengage=true but cooldown active → no reengage write", async () => {
    mockAuth(true);
    // Helper's contract: when cooldown is active, it sets should_reengage=false
    // already (the !cooldownActive guard in the helper formula). The route's
    // explicit !reengagement_cooldown_active gate is defense-in-depth. This
    // test simulates a state where the helper returned should_reengage=true
    // alongside reengagement_cooldown_active=true (defensive belt) and
    // asserts the route's gate prevents the reengage write.
    (computeIdleStatus as jest.Mock).mockResolvedValue({
      hours_since_last_turn: 36,
      should_reengage: true,
      should_silent_complete: false,
      reengagement_cooldown_active: true,
      markedCompleteAt: null,
    });

    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({ acked: true, written: [] });
    expect(writeOnboardingFact).not.toHaveBeenCalled();
  });

  test("silent-complete still fires when cooldown active and silent-complete eligible", async () => {
    mockAuth(true);
    (computeIdleStatus as jest.Mock).mockResolvedValue({
      hours_since_last_turn: 60,
      should_reengage: false,
      should_silent_complete: true,
      reengagement_cooldown_active: true,
      markedCompleteAt: null,
    });
    (writeOnboardingFact as jest.Mock).mockResolvedValue(undefined);

    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({ acked: true, written: ["marked_complete"] });
    expect(writeOnboardingFact).toHaveBeenCalledTimes(1);
    expect(writeOnboardingFact).toHaveBeenCalledWith(
      expect.anything(),
      HOST_ID,
      "onboarding_marked_complete_at",
      expect.any(String),
    );
  });
});
