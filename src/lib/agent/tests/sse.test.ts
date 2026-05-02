import {
  AgentStreamEventSchema,
  serializeSseEvent,
  makeSseResponse,
} from "../sse";

describe("AgentStreamEventSchema", () => {
  test("accepts a turn_started event", () => {
    expect(
      AgentStreamEventSchema.safeParse({
        type: "turn_started",
        conversation_id: "abc",
      }).success,
    ).toBe(true);
  });

  test("accepts a token event", () => {
    expect(
      AgentStreamEventSchema.safeParse({ type: "token", delta: "hello" }).success,
    ).toBe(true);
  });

  test("accepts a tool_call_started event", () => {
    expect(
      AgentStreamEventSchema.safeParse({
        type: "tool_call_started",
        tool_use_id: "tu1",
        tool_name: "read_memory",
        input_summary: "Looking up...",
      }).success,
    ).toBe(true);
  });

  test("accepts a tool_call_completed event", () => {
    expect(
      AgentStreamEventSchema.safeParse({
        type: "tool_call_completed",
        tool_use_id: "tu1",
        success: true,
        result_summary: "Found 1 fact.",
      }).success,
    ).toBe(true);
  });

  test("accepts a done event", () => {
    expect(
      AgentStreamEventSchema.safeParse({
        type: "done",
        turn_id: "t1",
        audit_ids: ["a1", "a2"],
      }).success,
    ).toBe(true);
  });

  test("accepts an error event", () => {
    expect(
      AgentStreamEventSchema.safeParse({
        type: "error",
        code: "round_cap_exceeded",
        message: "...",
        recoverable: false,
      }).success,
    ).toBe(true);
  });

  test("accepts a refusal event with null suggested_next_step", () => {
    expect(
      AgentStreamEventSchema.safeParse({
        type: "refusal",
        reason: "...",
        suggested_next_step: null,
      }).success,
    ).toBe(true);
  });

  test("rejects unknown event types (including 'artifact' which M4 doesn't emit)", () => {
    expect(
      AgentStreamEventSchema.safeParse({ type: "artifact", artifact_id: "x" }).success,
    ).toBe(false);
  });

  test("rejects malformed events (missing required fields)", () => {
    expect(
      AgentStreamEventSchema.safeParse({ type: "token" }).success,
    ).toBe(false);
  });
});

describe("serializeSseEvent", () => {
  test("formats as 'data: <json>\\n\\n'", () => {
    const wire = serializeSseEvent({ type: "token", delta: "hi" });
    expect(wire).toBe('data: {"type":"token","delta":"hi"}\n\n');
  });

  test("validates the event before serializing (defensive against bugs at emit)", () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serializeSseEvent({ type: "token" } as any),
    ).toThrow();
  });

  test("produces parseable wire format", () => {
    const wire = serializeSseEvent({
      type: "tool_call_completed",
      tool_use_id: "tu1",
      success: true,
      result_summary: "done",
    });
    expect(wire.startsWith("data: ")).toBe(true);
    expect(wire.endsWith("\n\n")).toBe(true);
    const json = JSON.parse(wire.slice(6, -2));
    expect(json.type).toBe("tool_call_completed");
  });
});

describe("makeSseResponse", () => {
  test("sets text/event-stream content type and SSE-friendly headers", () => {
    const stream = new ReadableStream<Uint8Array>({ start: () => undefined });
    const response = makeSseResponse(stream);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toMatch(/no-cache/);
    expect(response.headers.get("Connection")).toBe("keep-alive");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
  });
});
