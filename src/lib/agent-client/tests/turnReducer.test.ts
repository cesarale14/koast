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
