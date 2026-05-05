import {
  __setNowForTests,
  turnReducer,
} from "../turnReducer";
import { collectMockEvents, sampleStreamingTurn } from "../__mock__/mockStream";
import { initialTurnState, type AgentStreamEvent, type TurnState } from "../types";

// Deterministic clock for duration_ms assertions.
let clockMs = 0;
beforeEach(() => {
  clockMs = 1_000_000;
  __setNowForTests(() => clockMs);
});
afterAll(() => {
  __setNowForTests(() => Date.now());
});

function tick(ms: number): void {
  clockMs += ms;
}

function feed(state: TurnState, events: AgentStreamEvent[]): TurnState {
  return events.reduce((s, e) => turnReducer(s, e), state);
}

describe("turnReducer — happy path", () => {
  test("turn_started moves from idle to streaming and stamps conversation_id", () => {
    const next = turnReducer(initialTurnState, {
      type: "turn_started",
      conversation_id: "conv-1",
    });
    expect(next.status).toBe("streaming");
    expect(next.conversation_id).toBe("conv-1");
    expect(next.content).toEqual([]);
  });

  test("token appends into a fresh paragraph", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, { type: "token", delta: "hi" });
    expect(s.content).toEqual([{ kind: "paragraph", text: "hi" }]);
  });

  test("subsequent tokens append to the same paragraph", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, { type: "token", delta: "hi" });
    s = turnReducer(s, { type: "token", delta: " there" });
    expect(s.content).toEqual([{ kind: "paragraph", text: "hi there" }]);
  });

  test("token after a tool call starts a new paragraph", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, { type: "token", delta: "before" });
    s = turnReducer(s, {
      type: "tool_call_started",
      tool_use_id: "tu1",
      tool_name: "read_memory",
      input_summary: "x",
    });
    s = turnReducer(s, { type: "token", delta: "after" });
    expect(s.content).toHaveLength(3);
    expect(s.content[0]).toEqual({ kind: "paragraph", text: "before" });
    expect(s.content[1].kind).toBe("tool");
    expect(s.content[2]).toEqual({ kind: "paragraph", text: "after" });
  });

  test("tool_call_started creates an in-flight tool block stamped with started_at", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, {
      type: "tool_call_started",
      tool_use_id: "tu1",
      tool_name: "read_memory",
      input_summary: "scope=x",
    });
    expect(s.content).toHaveLength(1);
    const block = s.content[0];
    if (block.kind !== "tool") throw new Error("expected tool block");
    expect(block.status).toBe("in-flight");
    expect(block.tool_use_id).toBe("tu1");
    expect(block.tool_name).toBe("read_memory");
    expect(block.input_summary).toBe("scope=x");
    expect(block.started_at).toBe(clockMs);
  });

  test("tool_call_completed mutates the same block and computes duration_ms", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, {
      type: "tool_call_started",
      tool_use_id: "tu1",
      tool_name: "read_memory",
      input_summary: "scope=x",
    });
    tick(240);
    s = turnReducer(s, {
      type: "tool_call_completed",
      tool_use_id: "tu1",
      success: true,
      result_summary: "Found 1 fact",
    });
    expect(s.content).toHaveLength(1);
    const block = s.content[0];
    if (block.kind !== "tool") throw new Error("expected tool block");
    expect(block.status).toBe("completed");
    expect(block.success).toBe(true);
    expect(block.result_summary).toBe("Found 1 fact");
    expect(block.duration_ms).toBe(240);
  });

  test("done flips status, captures turn_id and audit_ids", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, { type: "token", delta: "hello" });
    s = turnReducer(s, { type: "done", turn_id: "t-1", audit_ids: ["a", "b"] });
    expect(s.status).toBe("done");
    expect(s.turn_id).toBe("t-1");
    expect(s.audit_ids).toEqual(["a", "b"]);
    expect(s.content).toEqual([{ kind: "paragraph", text: "hello" }]);
  });

  test("end-to-end mockStream sample produces expected blocks + status=done", () => {
    const events = collectMockEvents(sampleStreamingTurn);
    const final = feed(initialTurnState, events);
    expect(final.status).toBe("done");
    expect(final.turn_id).toBe("turn-test-1");
    expect(final.audit_ids).toEqual(["audit-1", "audit-2"]);
    // Content order: paragraph(intro) → tool(completed) → paragraph(closing)
    expect(final.content).toHaveLength(3);
    expect(final.content[0].kind).toBe("paragraph");
    expect(final.content[1].kind).toBe("tool");
    expect(final.content[2].kind).toBe("paragraph");
    const tool = final.content[1];
    if (tool.kind !== "tool") throw new Error("expected tool block");
    expect(tool.status).toBe("completed");
    expect(tool.success).toBe(true);
  });
});

describe("turnReducer — error and refusal", () => {
  test("error preserves partial content and flips status", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, { type: "token", delta: "partial" });
    s = turnReducer(s, {
      type: "error",
      code: "round_cap_exceeded",
      message: "stopped",
      recoverable: false,
    });
    expect(s.status).toBe("error");
    expect(s.error).toEqual({
      code: "round_cap_exceeded",
      message: "stopped",
      recoverable: false,
    });
    expect(s.content).toEqual([{ kind: "paragraph", text: "partial" }]);
  });

  test("refusal records reason and null suggested_next_step", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, {
      type: "refusal",
      reason: "out of scope",
      suggested_next_step: null,
    });
    expect(s.status).toBe("refusal");
    expect(s.refusal).toEqual({
      reason: "out of scope",
      suggested_next_step: null,
    });
  });

  test("refusal preserves a populated suggested_next_step", () => {
    const s = turnReducer(initialTurnState, {
      type: "refusal",
      reason: "scope",
      suggested_next_step: "try /api/pricing/preview-bdc-push instead",
    });
    expect(s.refusal?.suggested_next_step).toBe(
      "try /api/pricing/preview-bdc-push instead",
    );
  });
});

describe("turnReducer — edge cases", () => {
  test("token with empty delta is a no-op", () => {
    const s = turnReducer(initialTurnState, { type: "token", delta: "" });
    expect(s).toBe(initialTurnState);
  });

  test("turn_started resets prior content (caller harvests before re-submitting)", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c1" });
    s = turnReducer(s, { type: "token", delta: "first turn" });
    s = turnReducer(s, { type: "done", turn_id: "t-1", audit_ids: [] });
    s = turnReducer(s, { type: "turn_started", conversation_id: "c1" });
    expect(s.status).toBe("streaming");
    expect(s.content).toEqual([]);
    expect(s.turn_id).toBeNull();
  });

  test("out-of-order tool_call_completed (no matching started) appends a defensive completed block", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, {
      type: "tool_call_completed",
      tool_use_id: "orphan",
      success: false,
      result_summary: "",
    });
    expect(s.content).toHaveLength(1);
    const block = s.content[0];
    if (block.kind !== "tool") throw new Error("expected tool block");
    expect(block.status).toBe("completed");
    expect(block.tool_use_id).toBe("orphan");
    expect(block.tool_name).toBe("(unknown)");
  });

  test("two parallel tool calls — completion targets the right one by tool_use_id", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, {
      type: "tool_call_started",
      tool_use_id: "tu-A",
      tool_name: "read_memory",
      input_summary: "a",
    });
    tick(50);
    s = turnReducer(s, {
      type: "tool_call_started",
      tool_use_id: "tu-B",
      tool_name: "read_memory",
      input_summary: "b",
    });
    tick(100);
    s = turnReducer(s, {
      type: "tool_call_completed",
      tool_use_id: "tu-B",
      success: true,
      result_summary: "B done",
    });
    expect(s.content).toHaveLength(2);
    const blockA = s.content[0];
    const blockB = s.content[1];
    if (blockA.kind !== "tool" || blockB.kind !== "tool") {
      throw new Error("expected tool blocks");
    }
    expect(blockA.status).toBe("in-flight");
    expect(blockB.status).toBe("completed");
    expect(blockB.duration_ms).toBe(100);
  });
});

describe("turnReducer — M6 promotions: tool_call_failed", () => {
  test("transitions in-flight tool block to status='failed' with structured error", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, {
      type: "tool_call_started",
      tool_use_id: "tu-fail",
      tool_name: "write_memory_fact",
      input_summary: "x",
    });
    tick(50);
    s = turnReducer(s, {
      type: "tool_call_failed",
      tool_use_id: "tu-fail",
      tool_name: "write_memory_fact",
      error: { kind: "constraint", message: "violates check constraint", retryable: true },
      latency_ms: 50,
    });
    const block = s.content[0];
    if (block.kind !== "tool") throw new Error("expected tool block");
    expect(block.status).toBe("failed");
    expect(block.error).toEqual({
      kind: "constraint",
      message: "violates check constraint",
      retryable: true,
    });
    expect(block.duration_ms).toBe(50);
  });

  test("out-of-order tool_call_failed (no matching in-flight) appends a defensive failed block", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, {
      type: "tool_call_failed",
      tool_use_id: "tu-orphan",
      tool_name: "read_memory",
      error: { kind: "transient", message: "timeout", retryable: true },
      latency_ms: 200,
    });
    expect(s.content).toHaveLength(1);
    const block = s.content[0];
    if (block.kind !== "tool") throw new Error("expected tool block");
    expect(block.status).toBe("failed");
    expect(block.tool_name).toBe("read_memory");
  });
});

describe("turnReducer — action_proposed (memory_write)", () => {
  test("appends a memory_artifact block in state='pending' with the proposed payload", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, {
      type: "action_proposed",
      action_kind: "memory_write",
      artifact_id: "art-1",
      audit_log_id: "audit-1",
      proposed_payload: {
        property_id: "11111111-1111-4111-8111-111111111111",
        sub_entity_type: "front_door",
        attribute: "code",
        fact_value: "4827",
        source: "host_taught",
      },
    });
    expect(s.content).toHaveLength(1);
    const block = s.content[0];
    if (block.kind !== "memory_artifact") throw new Error("expected memory_artifact");
    expect(block.artifact_id).toBe("art-1");
    expect(block.audit_log_id).toBe("audit-1");
    expect(block.state).toBe("pending");
    expect(block.payload.attribute).toBe("code");
    expect(block.memory_fact_id).toBeUndefined();
  });

  test("preserves ALL 8 memory_write payload fields verbatim (regression-pin against future SSE schema work)", () => {
    // Mirrors what loop.ts emits at the action_proposed memory_write
    // branch — every field the dispatcher pipes through from the
    // tool's validated input. The reducer must carry them onto the
    // memory_artifact block without drops or transformations.
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, {
      type: "action_proposed",
      action_kind: "memory_write",
      artifact_id: "art-full",
      audit_log_id: "audit-full",
      proposed_payload: {
        property_id: "bfb0750e-9ae9-4ef4-a7de-988062f6a0ad",
        sub_entity_type: "wifi",
        attribute: "password",
        fact_value: "Sandcastle!42",
        confidence: 0.9,
        source: "host_taught",
        supersedes_memory_fact_id: "fact-prior-uuid",
        citation: {
          source_text: "host: 'the wifi password is Sandcastle!42'",
          reasoning: "explicit host statement",
        },
      },
      // top-level supersedes (artifact-id chain) intentionally omitted —
      // exercised in the cascade test below.
    });

    const block = s.content[0];
    if (block.kind !== "memory_artifact") throw new Error("expected memory_artifact");
    // Top-level block fields
    expect(block.artifact_id).toBe("art-full");
    expect(block.audit_log_id).toBe("audit-full");
    expect(block.state).toBe("pending");
    expect(block.memory_fact_id).toBeUndefined();
    expect(block.superseded_by_artifact_id).toBeUndefined();
    expect(block.error).toBeUndefined();
    // All 8 payload fields preserved verbatim
    expect(block.payload.property_id).toBe("bfb0750e-9ae9-4ef4-a7de-988062f6a0ad");
    expect(block.payload.sub_entity_type).toBe("wifi");
    expect(block.payload.attribute).toBe("password");
    expect(block.payload.fact_value).toBe("Sandcastle!42");
    expect(block.payload.confidence).toBe(0.9);
    expect(block.payload.source).toBe("host_taught");
    expect(block.payload.supersedes_memory_fact_id).toBe("fact-prior-uuid");
    expect(block.payload.citation).toEqual({
      source_text: "host: 'the wifi password is Sandcastle!42'",
      reasoning: "explicit host statement",
    });
    // No top-level artifact-chain supersedes was set
    expect(block.payload.supersedes).toBeUndefined();
  });

  test("supersession cascade: when supersedes is set, prior pending artifact in current content flips to state='superseded'", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    // First proposal lands.
    s = turnReducer(s, {
      type: "action_proposed",
      action_kind: "memory_write",
      artifact_id: "art-original",
      audit_log_id: "audit-1",
      proposed_payload: {
        property_id: "p",
        sub_entity_type: "front_door",
        attribute: "code",
        fact_value: "1234",
        source: "host_taught",
      },
    });
    // Corrected proposal supersedes the first.
    s = turnReducer(s, {
      type: "action_proposed",
      action_kind: "memory_write",
      artifact_id: "art-correction",
      audit_log_id: "audit-2",
      proposed_payload: {
        property_id: "p",
        sub_entity_type: "front_door",
        attribute: "code",
        fact_value: "4827",
        source: "host_taught",
      },
      supersedes: "art-original",
    });

    expect(s.content).toHaveLength(2);
    const original = s.content[0];
    const correction = s.content[1];
    if (original.kind !== "memory_artifact" || correction.kind !== "memory_artifact") {
      throw new Error("expected both blocks to be memory_artifact");
    }
    expect(original.state).toBe("superseded");
    expect(original.superseded_by_artifact_id).toBe("art-correction");
    expect(correction.state).toBe("pending");
  });
});

describe("turnReducer — action_completed (memory_write)", () => {
  test("flips matching pending artifact to state='saved' and stamps memory_fact_id", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, {
      type: "action_proposed",
      action_kind: "memory_write",
      artifact_id: "art-1",
      audit_log_id: "audit-1",
      proposed_payload: {
        property_id: "p",
        sub_entity_type: "wifi",
        attribute: "password",
        fact_value: "MyP@ssword",
        source: "host_taught",
      },
    });
    s = turnReducer(s, {
      type: "action_completed",
      action_kind: "memory_write",
      artifact_id: "art-1",
      audit_log_id: "audit-1",
      memory_fact_id: "fact-1",
    });
    const block = s.content[0];
    if (block.kind !== "memory_artifact") throw new Error("expected memory_artifact");
    expect(block.state).toBe("saved");
    expect(block.memory_fact_id).toBe("fact-1");
  });

  test("guest_message branch: action_proposed appends guest_message_artifact block in state='pending'", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, {
      type: "action_proposed",
      action_kind: "guest_message",
      artifact_id: "art-gm-1",
      audit_log_id: "audit-gm-1",
      proposed_payload: {
        booking_id: "44444444-4444-4444-8444-444444444444",
        message_text: "Hi! 3pm check-in works great.",
      },
    });
    expect(s.content).toHaveLength(1);
    const block = s.content[0];
    if (block.kind !== "guest_message_artifact") {
      throw new Error("expected guest_message_artifact");
    }
    expect(block.state).toBe("pending");
    expect(block.payload.message_text).toBe("Hi! 3pm check-in works great.");
    expect(block.payload.booking_id).toBe("44444444-4444-4444-8444-444444444444");
    expect(block.payload.edited_text).toBeUndefined();
    expect(block.channex_message_id).toBeUndefined();
  });

  test("guest_message branch: action_completed flips matching block to state='sent' and stamps channex_message_id", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, {
      type: "action_proposed",
      action_kind: "guest_message",
      artifact_id: "art-gm-2",
      audit_log_id: "audit-gm-2",
      proposed_payload: {
        booking_id: "44444444-4444-4444-8444-444444444444",
        message_text: "draft",
      },
    });
    s = turnReducer(s, {
      type: "action_completed",
      action_kind: "guest_message",
      artifact_id: "art-gm-2",
      audit_log_id: "audit-gm-2",
      channex_message_id: "cx-msg-99",
    });
    const block = s.content[0];
    if (block.kind !== "guest_message_artifact") {
      throw new Error("expected guest_message_artifact");
    }
    expect(block.state).toBe("sent");
    expect(block.channex_message_id).toBe("cx-msg-99");
  });

  test("guest_message branch: action_completed transitions 'edited' → 'sent' too (host edited then approved)", () => {
    // Reducer doesn't track edits in-stream (those flow via the
    // /api/agent/artifact JSON edit path → router.refresh, not SSE).
    // But if a hypothetical 'edited' state is in the in-memory block
    // when action_completed lands, the transition still works.
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, {
      type: "action_proposed",
      action_kind: "guest_message",
      artifact_id: "art-gm-3",
      audit_log_id: "audit-gm-3",
      proposed_payload: { booking_id: "44444444-4444-4444-8444-444444444444", message_text: "draft" },
    });
    // Simulate UI side mutation to 'edited' (would happen via reducer
    // extension or external setter; here we just check the transition).
    const baseContent = s.content[0];
    if (baseContent.kind !== "guest_message_artifact") throw new Error("setup");
    s = {
      ...s,
      content: [{ ...baseContent, state: "edited" as const }],
    };
    s = turnReducer(s, {
      type: "action_completed",
      action_kind: "guest_message",
      artifact_id: "art-gm-3",
      audit_log_id: "audit-gm-3",
      channex_message_id: "cx-msg-100",
    });
    const block = s.content[0];
    if (block.kind !== "guest_message_artifact") throw new Error("expected guest_message_artifact");
    expect(block.state).toBe("sent");
  });

  test("out-of-order action_completed (no matching pending) appends a synthetic saved block", () => {
    let s = turnReducer(initialTurnState, { type: "turn_started", conversation_id: "c" });
    s = turnReducer(s, {
      type: "action_completed",
      action_kind: "memory_write",
      artifact_id: "art-orphan",
      audit_log_id: "audit-x",
      memory_fact_id: "fact-x",
    });
    expect(s.content).toHaveLength(1);
    const block = s.content[0];
    if (block.kind !== "memory_artifact") throw new Error("expected memory_artifact");
    expect(block.state).toBe("saved");
    expect(block.memory_fact_id).toBe("fact-x");
  });
});
