import {
  getOrCreateConversation,
  persistTurn,
  reconstructHistory,
  type ToolCallRecord,
} from "../conversation";

jest.mock("@/lib/supabase/service");

import { createServiceClient } from "@/lib/supabase/service";

const HOST_A = "00000000-0000-0000-0000-000000000aaa";
const HOST_B = "00000000-0000-0000-0000-000000000bbb";
const CONV_ID = "11111111-1111-4111-8111-111111111aaa";
const TURN_ID = "22222222-2222-4222-8222-222222222aaa";

function setSupabaseMock(mocks: {
  selectSingleResult?: { data?: unknown; error?: { message: string } | null };
  insertSingleResult?: { data?: unknown; error?: { message: string } | null };
  countResult?: { count?: number; error?: { message: string } | null };
  orderResult?: { data?: unknown; error?: { message: string } | null };
}) {
  const single = jest.fn().mockResolvedValue(
    mocks.selectSingleResult ?? mocks.insertSingleResult ?? { data: null, error: null },
  );
  const order = jest.fn().mockResolvedValue(mocks.orderResult ?? { data: [], error: null });
  const eq = jest.fn().mockReturnValue({ single, order });
  const select = jest.fn().mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
    if (opts?.count === "exact" && opts.head) {
      return { eq: jest.fn().mockResolvedValue(mocks.countResult ?? { count: 0, error: null }) };
    }
    return { eq, single, order };
  });
  const insert = jest.fn().mockReturnValue({ select });
  const update = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });

  const builder = { select, insert, update };
  const supabase = { from: jest.fn().mockReturnValue(builder) };
  (createServiceClient as jest.Mock).mockReturnValue(supabase);
  return { supabase, builder, insert, select };
}

describe("getOrCreateConversation", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns existing conversation when ID provided + owned by host", async () => {
    setSupabaseMock({
      selectSingleResult: {
        data: { id: CONV_ID, host_id: HOST_A, status: "active", started_at: "2026-05-02T08:00:00Z", last_turn_at: "2026-05-02T08:00:00Z" },
        error: null,
      },
    });

    const result = await getOrCreateConversation({ id: HOST_A }, CONV_ID);
    expect(result.id).toBe(CONV_ID);
    expect(result.host_id).toBe(HOST_A);
  });

  test("throws when conversation belongs to a different host", async () => {
    setSupabaseMock({
      selectSingleResult: {
        data: { id: CONV_ID, host_id: HOST_B, status: "active", started_at: "2026-05-02T08:00:00Z", last_turn_at: "2026-05-02T08:00:00Z" },
        error: null,
      },
    });

    await expect(getOrCreateConversation({ id: HOST_A }, CONV_ID)).rejects.toThrow(
      /does not belong to host/,
    );
  });

  test("creates new conversation when ID is null", async () => {
    const { insert } = setSupabaseMock({
      insertSingleResult: {
        data: { id: CONV_ID, host_id: HOST_A, status: "active", started_at: "2026-05-02T08:00:00Z", last_turn_at: "2026-05-02T08:00:00Z" },
        error: null,
      },
    });

    const result = await getOrCreateConversation({ id: HOST_A }, null);
    expect(result.id).toBe(CONV_ID);
    expect(insert).toHaveBeenCalledWith({ host_id: HOST_A, status: "active" });
  });

  test("throws when fetch returns an error", async () => {
    setSupabaseMock({
      selectSingleResult: { data: null, error: { message: "not found" } },
    });
    await expect(getOrCreateConversation({ id: HOST_A }, CONV_ID)).rejects.toThrow(
      /Cannot fetch conversation/,
    );
  });
});

describe("persistTurn", () => {
  beforeEach(() => jest.clearAllMocks());

  test("inserts a user turn at next turn_index", async () => {
    const { insert, supabase } = setSupabaseMock({
      countResult: { count: 0, error: null },
      insertSingleResult: {
        data: { id: TURN_ID, turn_index: 0, created_at: "2026-05-02T08:00:00Z" },
        error: null,
      },
    });

    const result = await persistTurn({
      conversation_id: CONV_ID,
      role: "user",
      content_text: "what's the wifi password?",
    });

    expect(result.id).toBe(TURN_ID);
    expect(result.turn_index).toBe(0);
    const row = insert.mock.calls[0][0];
    expect(row.conversation_id).toBe(CONV_ID);
    expect(row.turn_index).toBe(0);
    expect(row.role).toBe("user");
    expect(row.content_text).toBe("what's the wifi password?");
    expect(row.tool_calls).toBeNull();
    // Bumped last_turn_at on the conversations table
    expect(supabase.from).toHaveBeenCalledWith("agent_conversations");
  });

  test("inserts an assistant turn with tool_calls + token counts at next turn_index", async () => {
    const { insert } = setSupabaseMock({
      countResult: { count: 1, error: null },
      insertSingleResult: {
        data: { id: TURN_ID, turn_index: 1, created_at: "2026-05-02T08:00:01Z" },
        error: null,
      },
    });

    const toolCalls: ToolCallRecord[] = [
      {
        tool_use_id: "tool_use_abc",
        tool_name: "read_memory",
        input: { entity_type: "property", entity_id: "p1" },
        result: { content: '{"facts":[]}', is_error: false },
        audit_log_id: "audit_1",
      },
    ];

    const result = await persistTurn({
      conversation_id: CONV_ID,
      role: "assistant",
      content_text: "I don't have that on file.",
      tool_calls: toolCalls,
      model_id: "claude-sonnet-4-5-20250929",
      input_tokens: 800,
      output_tokens: 50,
      cache_read_tokens: 700,
    });

    expect(result.turn_index).toBe(1);
    const row = insert.mock.calls[0][0];
    expect(row.role).toBe("assistant");
    expect(row.tool_calls).toEqual(toolCalls);
    expect(row.model_id).toBe("claude-sonnet-4-5-20250929");
    expect(row.input_tokens).toBe(800);
    expect(row.cache_read_tokens).toBe(700);
  });

  test("throws when count query returns an error", async () => {
    setSupabaseMock({
      countResult: { count: undefined, error: { message: "permission denied" } },
    });
    await expect(
      persistTurn({ conversation_id: CONV_ID, role: "user", content_text: "x" }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("reconstructHistory", () => {
  beforeEach(() => jest.clearAllMocks());

  test("expands user/assistant turns into MessageParam[] with synthetic tool_result user messages", async () => {
    const turns = [
      {
        id: "t1",
        turn_index: 0,
        role: "user",
        content_text: "what's the wifi password for Villa Jamaica?",
        tool_calls: null,
        refusal: null,
      },
      {
        id: "t2",
        turn_index: 1,
        role: "assistant",
        content_text: "Let me check.",
        tool_calls: [
          {
            tool_use_id: "tu1",
            tool_name: "read_memory",
            input: { entity_type: "property", entity_id: "p1" },
            result: { content: '{"facts":[{"id":"f1","value":"hunter2"}]}', is_error: false },
            audit_log_id: "a1",
          },
        ],
        refusal: null,
      },
      {
        id: "t3",
        turn_index: 2,
        role: "assistant",
        content_text: "The wifi password is hunter2.",
        tool_calls: null,
        refusal: null,
      },
    ];

    setSupabaseMock({ orderResult: { data: turns, error: null } });

    const messages = await reconstructHistory(CONV_ID);

    // Expected: user → assistant(text+tool_use) → user(tool_result) → assistant(text)
    expect(messages).toHaveLength(4);

    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("what's the wifi password for Villa Jamaica?");

    expect(messages[1].role).toBe("assistant");
    const m1Content = messages[1].content as Array<{ type: string }>;
    expect(m1Content).toHaveLength(2);
    expect(m1Content[0].type).toBe("text");
    expect(m1Content[1].type).toBe("tool_use");

    expect(messages[2].role).toBe("user");
    const m2Content = messages[2].content as Array<{ type: string; tool_use_id?: string }>;
    expect(m2Content).toHaveLength(1);
    expect(m2Content[0].type).toBe("tool_result");
    expect(m2Content[0].tool_use_id).toBe("tu1");

    expect(messages[3].role).toBe("assistant");
  });

  test("skips empty assistant turns (no text + no tool_calls)", async () => {
    const turns = [
      {
        id: "t1",
        turn_index: 0,
        role: "user",
        content_text: "hi",
        tool_calls: null,
        refusal: null,
      },
      {
        id: "t2",
        turn_index: 1,
        role: "assistant",
        content_text: null,
        tool_calls: null,
        refusal: null,
      },
    ];

    setSupabaseMock({ orderResult: { data: turns, error: null } });

    const messages = await reconstructHistory(CONV_ID);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
  });

  test("returns empty array for empty conversation", async () => {
    setSupabaseMock({ orderResult: { data: [], error: null } });
    expect(await reconstructHistory(CONV_ID)).toEqual([]);
  });

  test("propagates query errors", async () => {
    setSupabaseMock({ orderResult: { data: null, error: { message: "DB unreachable" } } });
    await expect(reconstructHistory(CONV_ID)).rejects.toThrow(/DB unreachable/);
  });
});
