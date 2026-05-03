/**
 * SSE → state-machine integration test (CP2).
 *
 * Validates the streaming → completed flow end-to-end through the data
 * pipeline that useAgentTurn drives in the browser:
 *
 *   M4 SSE wire bytes → TextDecoder → parseSSEChunk → turnReducer → TurnState
 *
 * Three flavors exercise the same pipeline:
 *   1. Whole-payload: all bytes arrive in one chunk.
 *   2. Chunked delivery: 50-byte network chunks (typical TCP).
 *   3. Real ReadableStream: matches useAgentTurn's read loop verbatim,
 *      validating that fetch().body.getReader() integrates cleanly.
 *
 * The reducer is exercised exhaustively in turnReducer.test.ts; the parser
 * in parseSSEEvent.test.ts. This test proves they compose into the streaming
 * → completed flow that state 04 → state 09 of the design canvas requires.
 */

import { parseSSEChunk } from "../parseSSEEvent";
import { __setNowForTests, turnReducer } from "../turnReducer";
import {
  collectMockEvents,
  sampleStreamingTurn,
} from "../__mock__/mockStream";
import {
  initialTurnState,
  type AgentStreamEvent,
  type TurnState,
} from "../types";

/** Mirror of M4's serializeSseEvent without importing the server module
 *  (D-13a anti-pattern: no client→server agent imports). */
function toWire(event: AgentStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function eventsToWire(events: AgentStreamEvent[]): string {
  return events.map(toWire).join("");
}

beforeEach(() => {
  // Deterministic clock so duration_ms is testable.
  let clock = 1_000_000;
  __setNowForTests(() => {
    const v = clock;
    clock += 50;
    return v;
  });
});

afterAll(() => {
  __setNowForTests(() => Date.now());
});

function pipelineState(wire: string): TurnState {
  let buffer = "";
  let state: TurnState = initialTurnState;
  const { events, remainder } = parseSSEChunk(buffer, wire);
  buffer = remainder;
  for (const event of events) {
    state = turnReducer(state, event);
  }
  // Flush any trailing partial.
  if (buffer.length > 0) {
    const flush = parseSSEChunk(buffer, "");
    for (const e of flush.events) state = turnReducer(state, e);
  }
  return state;
}

describe("SSE → state-machine integration", () => {
  test("whole-payload: streaming turn ends at status='done' with the right blocks", () => {
    const events = collectMockEvents(sampleStreamingTurn);
    const wire = eventsToWire(events);
    const state = pipelineState(wire);

    expect(state.status).toBe("done");
    expect(state.conversation_id).toBe("conv-test-1");
    expect(state.turn_id).toBe("turn-test-1");
    expect(state.audit_ids).toEqual(["audit-1", "audit-2"]);
    // 3 blocks in source order: paragraph(intro) → tool(completed) → paragraph(closing)
    expect(state.content).toHaveLength(3);
    expect(state.content[0].kind).toBe("paragraph");
    expect(state.content[1].kind).toBe("tool");
    expect(state.content[2].kind).toBe("paragraph");
    const tool = state.content[1];
    if (tool.kind !== "tool") throw new Error("expected tool block");
    expect(tool.status).toBe("completed");
    expect(tool.success).toBe(true);
    expect(tool.tool_name).toBe("read_memory");
  });

  test("chunked delivery: same final state when wire is split into 50-byte chunks", () => {
    const events = collectMockEvents(sampleStreamingTurn);
    const wire = eventsToWire(events);
    const chunks: string[] = [];
    const chunkSize = 50;
    for (let i = 0; i < wire.length; i += chunkSize) {
      chunks.push(wire.slice(i, i + chunkSize));
    }

    let buffer = "";
    let state: TurnState = initialTurnState;
    for (const chunk of chunks) {
      const { events: parsed, remainder } = parseSSEChunk(buffer, chunk);
      buffer = remainder;
      for (const event of parsed) state = turnReducer(state, event);
    }
    if (buffer.length > 0) {
      const flush = parseSSEChunk(buffer, "");
      for (const e of flush.events) state = turnReducer(state, e);
    }

    expect(state.status).toBe("done");
    expect(state.content).toHaveLength(3);
    const tool = state.content[1];
    if (tool.kind !== "tool") throw new Error("expected tool block");
    expect(tool.status).toBe("completed");
  });

  test("ReadableStream consumption matches useAgentTurn's read loop end-to-end", async () => {
    const events = collectMockEvents(sampleStreamingTurn);
    const wire = eventsToWire(events);
    const encoder = new TextEncoder();
    const wireBytes = encoder.encode(wire);

    // Two-chunk simulation; chunk boundary intentionally not aligned to event \n\n.
    const split = Math.floor(wireBytes.length / 3);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(wireBytes.slice(0, split));
        controller.enqueue(wireBytes.slice(split));
        controller.close();
      },
    });

    // Verbatim mirror of useAgentTurn's consumption loop.
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let state: TurnState = initialTurnState;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const { events: parsed, remainder } = parseSSEChunk(buffer, chunk);
      buffer = remainder;
      for (const event of parsed) state = turnReducer(state, event);
    }
    if (buffer.length > 0) {
      const flush = parseSSEChunk(buffer, "");
      for (const e of flush.events) state = turnReducer(state, e);
    }

    expect(state.status).toBe("done");
    expect(state.turn_id).toBe("turn-test-1");
    expect(state.audit_ids).toEqual(["audit-1", "audit-2"]);
    expect(state.content).toHaveLength(3);
    const tool = state.content[1];
    if (tool.kind !== "tool") throw new Error("expected tool block");
    expect(tool.duration_ms).toBeGreaterThanOrEqual(0);
  });

  test("error mid-stream preserves partial content + flips status='error'", () => {
    const events: AgentStreamEvent[] = [
      { type: "turn_started", conversation_id: "conv-err" },
      { type: "token", delta: "Looking at " },
      {
        type: "tool_call_started",
        tool_use_id: "tu-1",
        tool_name: "read_memory",
        input_summary: "scope=x",
      },
      {
        type: "error",
        code: "round_cap_exceeded",
        message: "tool round budget exceeded",
        recoverable: false,
      },
    ];
    const state = pipelineState(eventsToWire(events));

    expect(state.status).toBe("error");
    expect(state.error).toEqual({
      code: "round_cap_exceeded",
      message: "tool round budget exceeded",
      recoverable: false,
    });
    // Partial content preserved (anti-pattern: never discard partial)
    expect(state.content).toHaveLength(2);
    expect(state.content[0]).toEqual({
      kind: "paragraph",
      text: "Looking at ",
    });
    expect(state.content[1].kind).toBe("tool");
    if (state.content[1].kind === "tool") {
      expect(state.content[1].status).toBe("in-flight"); // never completed
    }
  });

  test("refusal renders as agent text + status='refusal' (no special chrome path)", () => {
    const events: AgentStreamEvent[] = [
      { type: "turn_started", conversation_id: "conv-ref" },
      {
        type: "token",
        delta: "I can't auto-approve a price push outside the configured floor.",
      },
      {
        type: "refusal",
        reason: "scope:auto-approve",
        suggested_next_step: "open the proposal manually in the pricing tab",
      },
    ];
    const state = pipelineState(eventsToWire(events));

    expect(state.status).toBe("refusal");
    expect(state.refusal).toEqual({
      reason: "scope:auto-approve",
      suggested_next_step: "open the proposal manually in the pricing tab",
    });
    // Refusal text came through as a normal token — preserved in content.
    expect(state.content).toHaveLength(1);
    expect(state.content[0]).toEqual({
      kind: "paragraph",
      text: "I can't auto-approve a price push outside the configured floor.",
    });
  });
});
