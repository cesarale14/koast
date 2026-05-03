import { parseSSEChunk, parseSSEEventBlock } from "../parseSSEEvent";
import type { AgentStreamEvent } from "../types";

function asWire(events: AgentStreamEvent[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

describe("parseSSEEventBlock", () => {
  test("parses a turn_started block", () => {
    const block = `data: ${JSON.stringify({ type: "turn_started", conversation_id: "c1" })}`;
    const ev = parseSSEEventBlock(block);
    expect(ev).toEqual({ type: "turn_started", conversation_id: "c1" });
  });

  test("parses a token block", () => {
    const block = `data: ${JSON.stringify({ type: "token", delta: "hi" })}`;
    expect(parseSSEEventBlock(block)).toEqual({ type: "token", delta: "hi" });
  });

  test("parses a tool_call_started block", () => {
    const block = `data: ${JSON.stringify({
      type: "tool_call_started",
      tool_use_id: "tu1",
      tool_name: "read_memory",
      input_summary: "x",
    })}`;
    expect(parseSSEEventBlock(block)).toEqual({
      type: "tool_call_started",
      tool_use_id: "tu1",
      tool_name: "read_memory",
      input_summary: "x",
    });
  });

  test("parses a tool_call_completed block", () => {
    const block = `data: ${JSON.stringify({
      type: "tool_call_completed",
      tool_use_id: "tu1",
      success: true,
      result_summary: "ok",
    })}`;
    expect(parseSSEEventBlock(block)).toEqual({
      type: "tool_call_completed",
      tool_use_id: "tu1",
      success: true,
      result_summary: "ok",
    });
  });

  test("parses a done block with audit_ids", () => {
    const block = `data: ${JSON.stringify({
      type: "done",
      turn_id: "t1",
      audit_ids: ["a1", "a2"],
    })}`;
    expect(parseSSEEventBlock(block)).toEqual({
      type: "done",
      turn_id: "t1",
      audit_ids: ["a1", "a2"],
    });
  });

  test("parses an error block", () => {
    const block = `data: ${JSON.stringify({
      type: "error",
      code: "round_cap_exceeded",
      message: "...",
      recoverable: false,
    })}`;
    expect(parseSSEEventBlock(block)).toEqual({
      type: "error",
      code: "round_cap_exceeded",
      message: "...",
      recoverable: false,
    });
  });

  test("parses a refusal block with null suggested_next_step", () => {
    const block = `data: ${JSON.stringify({
      type: "refusal",
      reason: "scope",
      suggested_next_step: null,
    })}`;
    expect(parseSSEEventBlock(block)).toEqual({
      type: "refusal",
      reason: "scope",
      suggested_next_step: null,
    });
  });

  test("returns null for malformed JSON", () => {
    expect(parseSSEEventBlock("data: {bad json")).toBeNull();
  });

  test("returns null for unknown event types", () => {
    const block = `data: ${JSON.stringify({ type: "artifact", id: "x" })}`;
    expect(parseSSEEventBlock(block)).toBeNull();
  });

  test("returns null for an empty data line", () => {
    expect(parseSSEEventBlock("data:")).toBeNull();
  });

  test("ignores SSE comment lines", () => {
    const block = `: heartbeat\ndata: ${JSON.stringify({ type: "token", delta: "ok" })}`;
    expect(parseSSEEventBlock(block)).toEqual({ type: "token", delta: "ok" });
  });

  test("strips one optional space after the data: prefix", () => {
    // Per SSE spec, "data: foo" and "data:foo" should both yield "foo".
    const json = JSON.stringify({ type: "token", delta: "x" });
    expect(parseSSEEventBlock(`data:${json}`)).toEqual({ type: "token", delta: "x" });
    expect(parseSSEEventBlock(`data: ${json}`)).toEqual({ type: "token", delta: "x" });
  });
});

describe("parseSSEChunk", () => {
  test("parses a single complete event", () => {
    const wire = asWire([{ type: "token", delta: "hi" }]);
    const result = parseSSEChunk("", wire);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ type: "token", delta: "hi" });
    expect(result.remainder).toBe("");
  });

  test("parses multiple events in one chunk", () => {
    const wire = asWire([
      { type: "turn_started", conversation_id: "c1" },
      { type: "token", delta: "a" },
      { type: "token", delta: "b" },
      { type: "done", turn_id: "t1", audit_ids: [] },
    ]);
    const result = parseSSEChunk("", wire);
    expect(result.events).toHaveLength(4);
    expect(result.events[0].type).toBe("turn_started");
    expect(result.events[3].type).toBe("done");
    expect(result.remainder).toBe("");
  });

  test("buffers a partial event across chunks", () => {
    const full = asWire([{ type: "token", delta: "hello" }]);
    const split = Math.floor(full.length / 2);
    const r1 = parseSSEChunk("", full.slice(0, split));
    expect(r1.events).toHaveLength(0);
    const r2 = parseSSEChunk(r1.remainder, full.slice(split));
    expect(r2.events).toHaveLength(1);
    expect(r2.events[0]).toEqual({ type: "token", delta: "hello" });
    expect(r2.remainder).toBe("");
  });

  test("retains a trailing partial event in remainder", () => {
    const wire =
      asWire([{ type: "token", delta: "first" }]) +
      `data: ${JSON.stringify({ type: "token", delta: "second-incomplete" })}`;
    const result = parseSSEChunk("", wire);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ type: "token", delta: "first" });
    expect(result.remainder.length).toBeGreaterThan(0);
  });

  test("skips a malformed event but keeps subsequent valid ones", () => {
    const wire =
      `data: not-json\n\n` +
      asWire([{ type: "token", delta: "ok" }]);
    const result = parseSSEChunk("", wire);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ type: "token", delta: "ok" });
  });

  test("skips a schema-invalid event but keeps subsequent valid ones", () => {
    const wire =
      `data: ${JSON.stringify({ type: "token" /* missing delta */ })}\n\n` +
      asWire([{ type: "token", delta: "ok" }]);
    const result = parseSSEChunk("", wire);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ type: "token", delta: "ok" });
  });

  test("preserves carriage-return-free wire even for empty chunks", () => {
    const result = parseSSEChunk("", "");
    expect(result.events).toEqual([]);
    expect(result.remainder).toBe("");
  });
});
