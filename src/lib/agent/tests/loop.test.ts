import { runAgentTurn } from "../loop";

jest.mock("@anthropic-ai/sdk");
jest.mock("../conversation");
jest.mock("../dispatcher");

import Anthropic from "@anthropic-ai/sdk";
import {
  getOrCreateConversation,
  persistTurn,
  reconstructHistory,
} from "../conversation";
import {
  dispatchToolCall,
  getToolsForAnthropicSDK,
} from "../dispatcher";

const HOST = { id: "00000000-0000-0000-0000-000000000aaa" };
const CONV_ID = "11111111-1111-4111-8111-111111111aaa";
const ASSISTANT_TURN_ID = "33333333-3333-4333-8333-333333333aaa";
const AUDIT_ID = "44444444-4444-4444-4444-444444444aaa";

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";

  (getOrCreateConversation as jest.Mock).mockResolvedValue({
    id: CONV_ID,
    host_id: HOST.id,
    status: "active",
    started_at: "2026-05-02T08:00:00Z",
    last_turn_at: "2026-05-02T08:00:00Z",
  });
  (persistTurn as jest.Mock).mockResolvedValue({
    id: ASSISTANT_TURN_ID,
    turn_index: 1,
    created_at: "2026-05-02T08:00:01Z",
  });
  (reconstructHistory as jest.Mock).mockResolvedValue([
    { role: "user", content: "what's the wifi password?" },
  ]);
  (getToolsForAnthropicSDK as jest.Mock).mockReturnValue([
    { name: "read_memory", description: "...", input_schema: { type: "object" } },
  ]);
});

interface FakeStreamSpec {
  textChunks?: string[];
  finalMessage: Partial<Anthropic.Message> & { stop_reason: Anthropic.StopReason };
  shouldThrow?: Error;
}

function makeFakeStream(spec: FakeStreamSpec) {
  const events: unknown[] = (spec.textChunks ?? []).map((text) => ({
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text },
  }));

  return {
    [Symbol.asyncIterator]: async function* () {
      if (spec.shouldThrow) {
        throw spec.shouldThrow;
      }
      for (const e of events) yield e;
    },
    finalMessage: jest.fn().mockResolvedValue({
      id: "msg-1",
      type: "message",
      role: "assistant",
      content: [],
      model: "claude-sonnet-4-5-20250929",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: 80,
        server_tool_use: null,
        service_tier: "standard",
        cache_creation: null,
        inference_geo: null,
      },
      ...spec.finalMessage,
    }),
    abort: jest.fn(),
  };
}

function setSdkStream(stream: ReturnType<typeof makeFakeStream> | ReturnType<typeof makeFakeStream>[]) {
  const streams = Array.isArray(stream) ? stream : [stream];
  let i = 0;
  const messagesStream = jest.fn().mockImplementation(() => {
    const s = streams[Math.min(i, streams.length - 1)];
    i += 1;
    return s;
  });
  (Anthropic as unknown as jest.Mock).mockImplementation(() => ({
    messages: { stream: messagesStream },
  }));
  return messagesStream;
}

async function collectEvents(input: {
  host: typeof HOST;
  conversation_id: string | null;
  user_message_text: string;
}) {
  const events = [];
  for await (const ev of runAgentTurn(input)) {
    events.push(ev);
  }
  return events;
}

describe("runAgentTurn — happy path (text-only response)", () => {
  test("emits turn_started → token(s) → done; persists user + assistant turns", async () => {
    setSdkStream(
      makeFakeStream({
        textChunks: ["Hello, ", "how can I help?"],
        finalMessage: {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Hello, how can I help?", citations: null }],
        },
      }),
    );

    const events = await collectEvents({
      host: HOST,
      conversation_id: null,
      user_message_text: "hi",
    });

    expect(events.map((e) => e.type)).toEqual([
      "turn_started",
      "token",
      "token",
      "done",
    ]);

    const turnStarted = events[0] as { type: "turn_started"; conversation_id: string };
    expect(turnStarted.conversation_id).toBe(CONV_ID);

    expect((events[1] as { type: "token"; delta: string }).delta).toBe("Hello, ");
    expect((events[2] as { type: "token"; delta: string }).delta).toBe("how can I help?");

    const done = events[3] as { type: "done"; turn_id: string; audit_ids: string[] };
    expect(done.turn_id).toBe(ASSISTANT_TURN_ID);
    expect(done.audit_ids).toEqual([]);

    // User turn persisted, then assistant turn persisted (2 calls total)
    expect(persistTurn).toHaveBeenCalledTimes(2);
    const userCall = (persistTurn as jest.Mock).mock.calls[0][0];
    expect(userCall.role).toBe("user");
    expect(userCall.content_text).toBe("hi");

    const assistantCall = (persistTurn as jest.Mock).mock.calls[1][0];
    expect(assistantCall.role).toBe("assistant");
    expect(assistantCall.content_text).toBe("Hello, how can I help?");
    expect(assistantCall.tool_calls).toBeNull();
    expect(assistantCall.input_tokens).toBe(100);
    expect(assistantCall.output_tokens).toBe(50);
    expect(assistantCall.cache_read_tokens).toBe(80);
  });
});

describe("runAgentTurn — tool path", () => {
  test("dispatches tool, feeds result back, second stream returns end_turn", async () => {
    const toolUseId = "toolu_abc";
    const round1 = makeFakeStream({
      textChunks: ["Let me check. "],
      finalMessage: {
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Let me check. ", citations: null },
          {
            type: "tool_use",
            id: toolUseId,
            name: "read_memory",
            input: { entity_type: "property", entity_id: "p1", sub_entity_type: "wifi" },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ],
      },
    });
    const round2 = makeFakeStream({
      textChunks: ["The password is hunter2."],
      finalMessage: {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "The password is hunter2.", citations: null }],
      },
    });
    const streamMock = setSdkStream([round1, round2]);

    (dispatchToolCall as jest.Mock).mockResolvedValue({
      ok: true,
      value: {
        facts: [{ id: "f1", attribute: "password", value: "hunter2" }],
        data_sufficiency: { fact_count: 1, confidence_aggregate: 1, has_recent_learning: true, sufficiency_signal: "sparse", note: "Found 1 fact" },
      },
      audit_log_id: AUDIT_ID,
    });

    const events = await collectEvents({
      host: HOST,
      conversation_id: null,
      user_message_text: "what's the wifi password?",
    });

    // Expected sequence:
    //   turn_started → token(round 1 text)
    //   tool_call_started → tool_call_completed (round 1 tool dispatch)
    //   token(round 2 text) → done
    expect(events.map((e) => e.type)).toEqual([
      "turn_started",
      "token",
      "tool_call_started",
      "tool_call_completed",
      "token",
      "done",
    ]);

    const tcStarted = events[2] as { type: "tool_call_started"; tool_use_id: string; tool_name: string; input_summary: string };
    expect(tcStarted.tool_use_id).toBe(toolUseId);
    expect(tcStarted.tool_name).toBe("read_memory");
    expect(tcStarted.input_summary).toMatch(/wifi/);

    const tcCompleted = events[3] as { type: "tool_call_completed"; success: boolean; result_summary: string };
    expect(tcCompleted.success).toBe(true);
    expect(tcCompleted.result_summary).toMatch(/Found 1 fact/);

    // SDK called twice (one per round)
    expect(streamMock).toHaveBeenCalledTimes(2);

    // dispatchToolCall called once
    expect(dispatchToolCall).toHaveBeenCalledTimes(1);

    // Assistant turn persisted with tool_calls JSONB
    const assistantCall = (persistTurn as jest.Mock).mock.calls[1][0];
    expect(assistantCall.tool_calls).toHaveLength(1);
    expect(assistantCall.tool_calls[0].tool_use_id).toBe(toolUseId);
    expect(assistantCall.tool_calls[0].audit_log_id).toBe(AUDIT_ID);
    expect(assistantCall.content_text).toBe("Let me check. The password is hunter2.");

    // done event includes the audit id
    const done = events[5] as { type: "done"; audit_ids: string[] };
    expect(done.audit_ids).toEqual([AUDIT_ID]);
  });
});

describe("runAgentTurn — round cap", () => {
  test("emits error with code='round_cap_exceeded' after 5 tool_use rounds", async () => {
    // Always returns tool_use; never end_turn
    const toolUseStream = () =>
      makeFakeStream({
        finalMessage: {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tu_repeat",
              name: "read_memory",
              input: { entity_type: "property", entity_id: "p1" },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          ],
        },
      });
    setSdkStream([toolUseStream(), toolUseStream(), toolUseStream(), toolUseStream(), toolUseStream(), toolUseStream()]);

    (dispatchToolCall as jest.Mock).mockResolvedValue({
      ok: true,
      value: { facts: [], data_sufficiency: { fact_count: 0, confidence_aggregate: null, has_recent_learning: false, sufficiency_signal: "empty", note: "none" } },
      audit_log_id: AUDIT_ID,
    });

    const events = await collectEvents({
      host: HOST,
      conversation_id: null,
      user_message_text: "go",
    });

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect((errorEvent as { type: "error"; code: string }).code).toBe("round_cap_exceeded");

    // Assistant turn STILL persisted (per loop.ts: round-cap is a kind
    // of completion, not an SDK error)
    expect(persistTurn).toHaveBeenCalledWith(expect.objectContaining({ role: "assistant" }));
  });
});

describe("runAgentTurn — SDK error mid-stream", () => {
  test("emits error event; does NOT persist assistant turn (atomicity per §2.5)", async () => {
    setSdkStream(
      makeFakeStream({
        finalMessage: { stop_reason: "end_turn", content: [] },
        shouldThrow: new Error("Anthropic 503 Service Unavailable"),
      }),
    );

    const events = await collectEvents({
      host: HOST,
      conversation_id: null,
      user_message_text: "hi",
    });

    expect(events[0].type).toBe("turn_started");
    const errorEvent = events[events.length - 1];
    expect(errorEvent.type).toBe("error");
    expect((errorEvent as { type: "error"; code: string; message: string }).code).toBe("anthropic_sdk_error");
    expect((errorEvent as { type: "error"; message: string }).message).toMatch(/503/);

    // User turn persisted (1 call), assistant turn NOT persisted (no second call)
    expect(persistTurn).toHaveBeenCalledTimes(1);
    expect((persistTurn as jest.Mock).mock.calls[0][0].role).toBe("user");
  });
});

describe("runAgentTurn — refusal", () => {
  test("emits refusal event when stop_reason='refusal'; persists assistant turn with refusal metadata", async () => {
    setSdkStream(
      makeFakeStream({
        finalMessage: { stop_reason: "refusal", content: [] },
      }),
    );

    const events = await collectEvents({
      host: HOST,
      conversation_id: null,
      user_message_text: "do something problematic",
    });

    const refusal = events[events.length - 1];
    expect(refusal.type).toBe("refusal");

    // Assistant turn IS persisted with refusal metadata
    expect(persistTurn).toHaveBeenCalledTimes(2);
    const assistantCall = (persistTurn as jest.Mock).mock.calls[1][0];
    expect(assistantCall.role).toBe("assistant");
    expect(assistantCall.refusal).toBeTruthy();
  });
});

describe("runAgentTurn — missing API key", () => {
  test("throws when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      collectEvents({ host: HOST, conversation_id: null, user_message_text: "hi" }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY is not set/);
  });
});
