/**
 * Route tests for POST /api/agent/artifact (M6 + M7).
 *
 * Covers the M7 surface area additions:
 *   - action='edit' (D38): happy path, state guards, ownership, bad input
 *   - resolveArtifact accepts state IN ('emitted', 'edited')
 *   - approve dispatch by artifact.kind (memory_write vs guest_message)
 *   - guest_message §6 failure encoding (ChannexSendError → state stays
 *     'emitted', commit_metadata.last_error written, audit outcome
 *     flipped to 'failed', error SSE with code='channex_send_failed')
 *   - pre-execute audit outcome flip (failed → pending before handler)
 *
 * The route streams SSE for approve, JSON for edit/discard. The tests
 * drain the SSE stream and parse events; for JSON paths they read
 * .json() directly.
 */

import { POST } from "../route";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/supabase/service");
jest.mock("@/lib/action-substrate/handlers/write-memory-fact");
jest.mock("@/lib/action-substrate/handlers/propose-guest-message");
jest.mock("@/lib/action-substrate/artifact-writer");
jest.mock("@/lib/action-substrate/audit-writer");
jest.mock("@/lib/agent/tools", () => ({}), { virtual: false });

import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { writeMemoryFactHandler } from "@/lib/action-substrate/handlers/write-memory-fact";
import { proposeGuestMessageHandler } from "@/lib/action-substrate/handlers/propose-guest-message";
import { updateArtifactState } from "@/lib/action-substrate/artifact-writer";
import { updateAuditOutcome } from "@/lib/action-substrate/audit-writer";
import { ChannexSendError } from "@/lib/channex/messages";
import { ColdSendUnsupportedError } from "@/lib/action-substrate/handlers/errors";

const HOST = { id: "00000000-0000-0000-0000-000000000aaa" };
const AUDIT_ID = "11111111-1111-4111-8111-111111111111";
const ARTIFACT_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const BOOKING_ID = "44444444-4444-4444-8444-444444444444";
const CHANNEX_MSG_ID = "cx-msg-99";
const NEW_MESSAGE_ROW_ID = "55555555-5555-4555-8555-555555555555";

function makeRequest(body: unknown) {
  return {
    json: jest.fn().mockResolvedValue(body),
    signal: { aborted: false },
  } as unknown as Parameters<typeof POST>[0];
}

interface StubArtifact {
  id: string;
  audit_log_id: string;
  kind: string;
  payload: Record<string, unknown>;
  state: string;
  conversation_id: string;
  turn_id: string;
  commit_metadata: Record<string, unknown> | null;
}

const baseArtifact: StubArtifact = {
  id: ARTIFACT_ID,
  audit_log_id: AUDIT_ID,
  kind: "guest_message_proposal",
  payload: { booking_id: BOOKING_ID, message_text: "Hi! 3pm works great." },
  state: "emitted",
  conversation_id: "conv-1",
  turn_id: "turn-1",
  commit_metadata: null,
};

/**
 * Builds a fake supabase client where:
 *   - SELECT agent_artifacts (.single) returns supplied artifact row
 *   - SELECT agent_conversations (.single) returns { host_id }
 *   - UPDATE agent_artifacts (for edit / §6 failure last_error) returns ok
 */
function mockSupabase(opts: {
  artifact: StubArtifact | null;
  conversationHostId?: string;
  artifactUpdateError?: { message: string } | null;
}): { updateArtifactCalls: Array<{ payload: unknown }> } {
  const artifactSingle = jest
    .fn()
    .mockResolvedValue(
      opts.artifact
        ? { data: opts.artifact, error: null }
        : { data: null, error: { message: "no row" } },
    );
  const artifactSelectEq = jest.fn(() => ({ single: artifactSingle }));
  const artifactSelect = jest.fn(() => ({ eq: artifactSelectEq }));

  const updateArtifactCalls: Array<{ payload: unknown }> = [];
  const artifactUpdateEq = jest
    .fn()
    .mockImplementation(() =>
      // Hybrid: returns a thenable so route's `.then(...)` chain works
      // for the §6 last_error update, AND can be awaited as Promise<{error}>
      // for the edit-path direct update.
      Promise.resolve({ error: opts.artifactUpdateError ?? null }),
    );
  const artifactUpdate = jest.fn((payload: unknown) => {
    updateArtifactCalls.push({ payload });
    return { eq: artifactUpdateEq };
  });

  const conversationSingle = jest.fn().mockResolvedValue({
    data: { host_id: opts.conversationHostId ?? HOST.id },
    error: null,
  });
  const conversationSelectEq = jest.fn(() => ({ single: conversationSingle }));
  const conversationSelect = jest.fn(() => ({ eq: conversationSelectEq }));

  const fromMock = jest.fn((table: string) => {
    if (table === "agent_artifacts") {
      return { select: artifactSelect, update: artifactUpdate };
    }
    if (table === "agent_conversations") {
      return { select: conversationSelect };
    }
    throw new Error(`unexpected from(${table})`);
  });

  (createServiceClient as jest.Mock).mockReturnValue({ from: fromMock });
  return { updateArtifactCalls };
}

/** Drain an SSE Response and return parsed events. */
async function drainSse(res: Response): Promise<Array<{ type: string; [k: string]: unknown }>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: Array<{ type: string; [k: string]: unknown }> = [];
  let buf = "";
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep = buf.indexOf("\n\n");
    while (sep !== -1) {
      const record = buf.slice(0, sep).trim();
      buf = buf.slice(sep + 2);
      if (record.startsWith("data: ")) {
        try {
          events.push(JSON.parse(record.slice(6)));
        } catch {
          /* malformed; skip */
        }
      }
      sep = buf.indexOf("\n\n");
    }
  }
  return events;
}

beforeEach(() => {
  jest.clearAllMocks();
  (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: HOST, error: null });
  (updateArtifactState as jest.Mock).mockResolvedValue(undefined);
  (updateAuditOutcome as jest.Mock).mockResolvedValue(undefined);
});

describe("POST /api/agent/artifact — auth + body validation", () => {
  test("401 when not authenticated", async () => {
    (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: null, error: "Unauthorized" });
    const res = await POST(makeRequest({ audit_id: AUDIT_ID, action: "approve" }));
    expect(res.status).toBe(401);
  });

  test("400 on invalid JSON body", async () => {
    const req = {
      json: jest.fn().mockRejectedValue(new SyntaxError("bad json")),
      signal: { aborted: false },
    } as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("400 on unknown action", async () => {
    const res = await POST(makeRequest({ audit_id: AUDIT_ID, action: "send" }));
    expect(res.status).toBe(400);
  });

  test("400 when edit is missing edited_text", async () => {
    const res = await POST(makeRequest({ audit_id: AUDIT_ID, action: "edit" }));
    expect(res.status).toBe(400);
  });

  test("400 when edited_text exceeds 5000 chars", async () => {
    const res = await POST(
      makeRequest({ audit_id: AUDIT_ID, action: "edit", edited_text: "x".repeat(5001) }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/agent/artifact — resolveArtifact", () => {
  test("404 when no artifact found", async () => {
    mockSupabase({ artifact: null });
    const res = await POST(makeRequest({ audit_id: AUDIT_ID, action: "approve" }));
    expect(res.status).toBe(404);
  });

  test("404 when host doesn't own the conversation", async () => {
    mockSupabase({ artifact: { ...baseArtifact }, conversationHostId: "other-host" });
    const res = await POST(makeRequest({ audit_id: AUDIT_ID, action: "approve" }));
    expect(res.status).toBe(404);
  });

  test("409 when artifact is in terminal state ('confirmed')", async () => {
    mockSupabase({ artifact: { ...baseArtifact, state: "confirmed" } });
    const res = await POST(makeRequest({ audit_id: AUDIT_ID, action: "approve" }));
    expect(res.status).toBe(409);
  });

  test("409 when artifact state='dismissed' (terminal)", async () => {
    mockSupabase({ artifact: { ...baseArtifact, state: "dismissed" } });
    const res = await POST(makeRequest({ audit_id: AUDIT_ID, action: "approve" }));
    expect(res.status).toBe(409);
  });

  test("accepts state='edited' in approve path (M7 D38 widening)", async () => {
    mockSupabase({
      artifact: {
        ...baseArtifact,
        state: "edited",
        payload: {
          booking_id: BOOKING_ID,
          message_text: "draft",
          edited_text: "edited draft",
        },
      },
    });
    (proposeGuestMessageHandler as jest.Mock).mockResolvedValue({
      channex_message_id: CHANNEX_MSG_ID,
      message_id: NEW_MESSAGE_ROW_ID,
    });

    const res = await POST(makeRequest({ audit_id: AUDIT_ID, action: "approve" }));
    expect(res.status).toBe(200);
    const events = await drainSse(res);
    expect(events.find((e) => e.type === "action_completed")).toBeDefined();
  });
});

describe("POST /api/agent/artifact — edit action (D38)", () => {
  test("happy path: state='emitted' → state='edited', payload.edited_text persisted, JSON response", async () => {
    const { updateArtifactCalls } = mockSupabase({ artifact: { ...baseArtifact } });
    const res = await POST(
      makeRequest({
        audit_id: AUDIT_ID,
        action: "edit",
        edited_text: "Hi Alex! 3pm check-in works great. Door code is 4827.",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.state).toBe("edited");
    expect(body.edited_text).toBe(
      "Hi Alex! 3pm check-in works great. Door code is 4827.",
    );

    // Verify update payload: state='edited' + payload.edited_text appended
    expect(updateArtifactCalls).toHaveLength(1);
    const update = updateArtifactCalls[0].payload as {
      state: string;
      payload: { booking_id: string; message_text: string; edited_text: string };
    };
    expect(update.state).toBe("edited");
    expect(update.payload.edited_text).toBe(
      "Hi Alex! 3pm check-in works great. Door code is 4827.",
    );
    expect(update.payload.message_text).toBe("Hi! 3pm works great."); // original preserved
    expect(update.payload.booking_id).toBe(BOOKING_ID);
  });

  test("409 when artifact is already in state='edited' (single edit per artifact, CF #37)", async () => {
    mockSupabase({ artifact: { ...baseArtifact, state: "edited" } });
    const res = await POST(
      makeRequest({ audit_id: AUDIT_ID, action: "edit", edited_text: "second edit" }),
    );
    expect(res.status).toBe(409);
  });

  test("does NOT call updateArtifactState ('edited' is non-terminal — committed_at must stay NULL)", async () => {
    mockSupabase({ artifact: { ...baseArtifact } });
    await POST(makeRequest({ audit_id: AUDIT_ID, action: "edit", edited_text: "edited" }));
    expect(updateArtifactState).not.toHaveBeenCalled();
  });
});

describe("POST /api/agent/artifact — approve dispatch by kind", () => {
  test("memory_write kind invokes writeMemoryFactHandler and emits action_completed (memory_write)", async () => {
    mockSupabase({
      artifact: {
        ...baseArtifact,
        kind: "property_knowledge_confirmation",
        payload: {
          property_id: PROPERTY_ID,
          sub_entity_type: "wifi",
          attribute: "password",
          fact_value: "Sandcastle!42",
          source: "host_taught",
        },
      },
    });
    (writeMemoryFactHandler as jest.Mock).mockResolvedValue({
      memory_fact_id: "fact-1",
      superseded_memory_fact_id: null,
    });

    const res = await POST(makeRequest({ audit_id: AUDIT_ID, action: "approve" }));
    const events = await drainSse(res);
    const completed = events.find((e) => e.type === "action_completed");
    expect(completed).toBeDefined();
    expect(completed?.action_kind).toBe("memory_write");
    expect(completed?.memory_fact_id).toBe("fact-1");
    expect(events.find((e) => e.type === "done")).toBeDefined();
    expect(proposeGuestMessageHandler).not.toHaveBeenCalled();
  });

  test("guest_message kind invokes proposeGuestMessageHandler and emits action_completed (guest_message)", async () => {
    mockSupabase({ artifact: { ...baseArtifact } });
    (proposeGuestMessageHandler as jest.Mock).mockResolvedValue({
      channex_message_id: CHANNEX_MSG_ID,
      message_id: NEW_MESSAGE_ROW_ID,
    });

    const res = await POST(makeRequest({ audit_id: AUDIT_ID, action: "approve" }));
    const events = await drainSse(res);
    const completed = events.find((e) => e.type === "action_completed");
    expect(completed).toBeDefined();
    expect(completed?.action_kind).toBe("guest_message");
    expect(completed?.channex_message_id).toBe(CHANNEX_MSG_ID);
    expect(events.find((e) => e.type === "done")).toBeDefined();

    // Verify success-path commit_metadata
    expect(updateArtifactState).toHaveBeenCalledWith(
      ARTIFACT_ID,
      "confirmed",
      expect.objectContaining({
        commit_metadata: expect.objectContaining({
          channex_message_id: CHANNEX_MSG_ID,
          message_id: NEW_MESSAGE_ROW_ID,
        }),
      }),
    );
    expect(writeMemoryFactHandler).not.toHaveBeenCalled();
  });
});

describe("POST /api/agent/artifact — guest_message §6 failure encoding", () => {
  test("ChannexSendError → state stays 'emitted', last_error in commit_metadata, audit outcome='failed', error SSE with code='channex_send_failed'", async () => {
    const { updateArtifactCalls } = mockSupabase({ artifact: { ...baseArtifact } });
    (proposeGuestMessageHandler as jest.Mock).mockRejectedValue(
      new ChannexSendError("thread closed", 422, { errors: [{ title: "thread closed" }] }),
    );

    const res = await POST(makeRequest({ audit_id: AUDIT_ID, action: "approve" }));
    const events = await drainSse(res);

    // 1. error SSE with the §6 code
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.code).toBe("channex_send_failed");
    expect(errorEvent?.recoverable).toBe(true);

    // 2. NO done event (failure path skips done by design)
    expect(events.find((e) => e.type === "done")).toBeUndefined();

    // 3. updateArtifactState was NOT called with 'confirmed' or 'dismissed'
    //    (state must stay 'emitted' per §6)
    const stateUpdates = (updateArtifactState as jest.Mock).mock.calls.map((c) => c[1]);
    expect(stateUpdates).not.toContain("confirmed");
    expect(stateUpdates).not.toContain("dismissed");

    // 4. last_error written via direct supabase update on agent_artifacts
    //    (the §6 path writes commit_metadata.last_error directly)
    const lastErrorUpdate = updateArtifactCalls.find(
      (c) => (c.payload as { commit_metadata?: { last_error?: unknown } }).commit_metadata?.last_error !== undefined,
    );
    expect(lastErrorUpdate).toBeDefined();
    const lastError = (
      lastErrorUpdate!.payload as {
        commit_metadata: { last_error: { message: string; channex_status: number; attempted_at: string } };
      }
    ).commit_metadata.last_error;
    expect(lastError.message).toBe("thread closed");
    expect(lastError.channex_status).toBe(422);
    expect(typeof lastError.attempted_at).toBe("string");

    // 5. updateAuditOutcome called with 'failed' AFTER the pre-execute
    //    'pending' flip — we expect both calls in order.
    const outcomeCalls = (updateAuditOutcome as jest.Mock).mock.calls.map((c) => c[1]);
    expect(outcomeCalls).toEqual(expect.arrayContaining(["pending", "failed"]));
  });

  test("Try-again after §6 failure: pre-execute audit flip resets failed→pending before the new handler call", async () => {
    // Simulate: artifact still 'emitted', commit_metadata has a prior last_error,
    // audit outcome was 'failed' from prior attempt. Try-again should call
    // updateAuditOutcome(audit_id, 'pending') BEFORE invoking the handler.
    mockSupabase({
      artifact: {
        ...baseArtifact,
        commit_metadata: {
          last_error: {
            message: "thread closed",
            channex_status: 422,
            attempted_at: "2026-05-04T00:00:00Z",
          },
        },
      },
    });
    (proposeGuestMessageHandler as jest.Mock).mockResolvedValue({
      channex_message_id: CHANNEX_MSG_ID,
      message_id: NEW_MESSAGE_ROW_ID,
    });

    const res = await POST(makeRequest({ audit_id: AUDIT_ID, action: "approve" }));
    await drainSse(res);

    // Order: 'pending' flip BEFORE proposeGuestMessageHandler invocation, then 'succeeded'.
    const outcomeCalls = (updateAuditOutcome as jest.Mock).mock.calls.map((c) => c[1]);
    expect(outcomeCalls[0]).toBe("pending");
    expect(outcomeCalls).toContain("succeeded");
    expect(proposeGuestMessageHandler).toHaveBeenCalled();
  });

  test("ColdSendUnsupportedError → state stays 'emitted', last_error has gate + channex_status=null, audit outcome='failed', error SSE with code='cold_send_unsupported'", async () => {
    const { updateArtifactCalls } = mockSupabase({ artifact: { ...baseArtifact } });
    (proposeGuestMessageHandler as jest.Mock).mockRejectedValue(
      new ColdSendUnsupportedError(
        "Cozy Loft - Tampa is connected via iCal only on Airbnb. The first message must be sent through Airbnb's native interface.",
        "ical-import",
      ),
    );

    const res = await POST(makeRequest({ audit_id: AUDIT_ID, action: "approve" }));
    const events = await drainSse(res);

    // 1. error SSE with the cold_send_unsupported code
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.code).toBe("cold_send_unsupported");
    expect(errorEvent?.message).toMatch(/iCal only on Airbnb/);
    // recoverable defaults to false on the gate (G3 ical-import)
    expect(errorEvent?.recoverable).toBe(false);

    // 2. NO done event (failure path skips done)
    expect(events.find((e) => e.type === "done")).toBeUndefined();

    // 3. State NOT confirmed/dismissed (stays 'emitted' per §6 amendment)
    const stateUpdates = (updateArtifactState as jest.Mock).mock.calls.map((c) => c[1]);
    expect(stateUpdates).not.toContain("confirmed");
    expect(stateUpdates).not.toContain("dismissed");

    // 4. last_error written with gate + channex_status=null
    const lastErrorUpdate = updateArtifactCalls.find(
      (c) => (c.payload as { commit_metadata?: { last_error?: unknown } }).commit_metadata?.last_error !== undefined,
    );
    expect(lastErrorUpdate).toBeDefined();
    const lastError = (
      lastErrorUpdate!.payload as {
        commit_metadata: {
          last_error: { message: string; channex_status: number | null; attempted_at: string; gate?: string };
        };
      }
    ).commit_metadata.last_error;
    expect(lastError.message).toMatch(/iCal only on Airbnb/);
    // channex_status=null indicates Channex was NEVER reached (cold-send
    // refused at the local pre-flight gate before any Channex call).
    expect(lastError.channex_status).toBeNull();
    expect(lastError.gate).toBe("ical-import");
    expect(typeof lastError.attempted_at).toBe("string");

    // 5. updateAuditOutcome called with 'pending' (pre-flip) then 'failed'
    const outcomeCalls = (updateAuditOutcome as jest.Mock).mock.calls.map((c) => c[1]);
    expect(outcomeCalls).toEqual(expect.arrayContaining(["pending", "failed"]));
  });

  test("Non-Channex / non-ColdSendUnsupported error in guest_message handler falls through to outer catch → M6 dismissed pattern", async () => {
    mockSupabase({ artifact: { ...baseArtifact } });
    (proposeGuestMessageHandler as jest.Mock).mockRejectedValue(
      new Error("[handler:propose_guest_message] Booking … not found"),
    );

    const res = await POST(makeRequest({ audit_id: AUDIT_ID, action: "approve" }));
    const events = await drainSse(res);
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.code).toBe("post_approval_failed"); // M6 outer-catch code
    // M6 outer catch dismisses the artifact
    expect(updateArtifactState).toHaveBeenCalledWith(
      ARTIFACT_ID,
      "dismissed",
      expect.any(Object),
    );
  });
});

describe("POST /api/agent/artifact — discard preserved (M6 regression)", () => {
  test("discard works — state='dismissed' + audit failed with sentinel", async () => {
    mockSupabase({ artifact: { ...baseArtifact } });

    const res = await POST(makeRequest({ audit_id: AUDIT_ID, action: "discard" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.state).toBe("dismissed");

    expect(updateArtifactState).toHaveBeenCalledWith(ARTIFACT_ID, "dismissed");
    expect(updateAuditOutcome).toHaveBeenCalledWith(
      AUDIT_ID,
      "failed",
      expect.objectContaining({ error_message: "dismissed_by_host" }),
    );
  });
});
