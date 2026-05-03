/**
 * D19 — ui_context plumbing tests.
 *
 * Three pure helpers extracted from loop.ts so the wire-level
 * behavior can be unit-tested without booting the agent loop:
 *   - buildActivePropertyPreamble: shape lock
 *   - prependActiveContextToLastUserMessage: targets last *plain*
 *     user message; skips synthetic tool_result entries; doesn't
 *     mutate input
 *   - resolveActiveProperty: ownership check; null on missing,
 *     unauthorized, or no row
 *
 * The ownership-check test mocks @/lib/supabase/service so the
 * helper hits a deterministic stub.
 */

jest.mock("@/lib/supabase/service");

import {
  buildActivePropertyPreamble,
  prependActiveContextToLastUserMessage,
  resolveActiveProperty,
} from "../loop";
import { createServiceClient } from "@/lib/supabase/service";
import type Anthropic from "@anthropic-ai/sdk";

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";
const PROPERTY_ID = "11111111-1111-4111-8111-111111111aaa";
const OTHER_HOST_ID = "22222222-2222-4222-8222-222222222aaa";
const PROPERTY_NAME = "Villa Jamaica";

function mockSupabaseSingleResult(result: { data: unknown; error: unknown }) {
  const single = jest.fn().mockResolvedValue(result);
  const eq = jest.fn().mockReturnValue({ single });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });
  (createServiceClient as jest.Mock).mockReturnValue({ from });
}

describe("buildActivePropertyPreamble", () => {
  test("returns the locked shape including property name + id + read_memory hint", () => {
    const out = buildActivePropertyPreamble({ name: PROPERTY_NAME, id: PROPERTY_ID });
    expect(out).toContain("[active context — provided by the host's UI]");
    expect(out).toContain(`active_property = "${PROPERTY_NAME}"`);
    expect(out).toContain(`active_property_id = ${PROPERTY_ID}`);
    expect(out).toContain("use this id for read_memory tool calls.");
    expect(out).toContain(
      "ask them to select that property in the UI rather than guessing its id.",
    );
    // Trailing blank line so the host's actual message starts on a fresh line.
    expect(out.endsWith("\n\n")).toBe(true);
  });
});

describe("prependActiveContextToLastUserMessage", () => {
  const PREAMBLE = "PREAMBLE\n\n";

  test("prepends to the only user message when content is a string", () => {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: "what's the wifi at Villa Jamaica?" },
    ];
    const out = prependActiveContextToLastUserMessage(messages, PREAMBLE);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      role: "user",
      content: "PREAMBLE\n\nwhat's the wifi at Villa Jamaica?",
    });
    // Original not mutated.
    expect(messages[0]).toEqual({
      role: "user",
      content: "what's the wifi at Villa Jamaica?",
    });
  });

  test("targets the LAST user message in a multi-turn history", () => {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: "first user message" },
      { role: "assistant", content: "first assistant reply" },
      { role: "user", content: "second user message" },
    ];
    const out = prependActiveContextToLastUserMessage(messages, PREAMBLE);
    expect(out[0]).toEqual({ role: "user", content: "first user message" });
    expect(out[2]).toEqual({
      role: "user",
      content: "PREAMBLE\n\nsecond user message",
    });
  });

  test("skips synthetic tool_result user messages and lands on the latest plain user message", () => {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: "what's the wifi password?" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Looking that up." },
          {
            type: "tool_use",
            id: "tu-1",
            name: "read_memory",
            input: {},
          },
        ],
      },
      {
        // Synthetic tool_result-bearing user message — must be skipped.
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu-1",
            content: "the wifi is on the fridge",
            is_error: false,
          },
        ],
      },
    ];
    const out = prependActiveContextToLastUserMessage(messages, PREAMBLE);
    // The plain user message at index 0 is the latest plain user message in this history.
    expect(out[0]).toEqual({
      role: "user",
      content: "PREAMBLE\n\nwhat's the wifi password?",
    });
    // Synthetic tool_result block is unchanged.
    expect(out[2]).toEqual(messages[2]);
  });

  test("returns input unchanged when preamble is empty (defensive no-op)", () => {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: "hi" }];
    const out = prependActiveContextToLastUserMessage(messages, "");
    expect(out).toBe(messages);
  });
});

describe("resolveActiveProperty", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns null when ui_context is undefined", async () => {
    const out = await resolveActiveProperty(HOST_ID, undefined);
    expect(out).toBeNull();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  test("returns null when active_property_id is absent", async () => {
    const out = await resolveActiveProperty(HOST_ID, {});
    expect(out).toBeNull();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  test("returns {id, name} when the host owns the property", async () => {
    mockSupabaseSingleResult({
      data: { id: PROPERTY_ID, name: PROPERTY_NAME, user_id: HOST_ID },
      error: null,
    });
    const out = await resolveActiveProperty(HOST_ID, {
      active_property_id: PROPERTY_ID,
    });
    expect(out).toEqual({ id: PROPERTY_ID, name: PROPERTY_NAME });
  });

  test("logs warn and returns null when the host doesn't own the property", async () => {
    mockSupabaseSingleResult({
      data: { id: PROPERTY_ID, name: PROPERTY_NAME, user_id: OTHER_HOST_ID },
      error: null,
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const out = await resolveActiveProperty(HOST_ID, {
      active_property_id: PROPERTY_ID,
    });
    expect(out).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("unauthorized active_property_id");
    expect(warn.mock.calls[0][0]).toContain(`host=${HOST_ID}`);
    expect(warn.mock.calls[0][0]).toContain(`requested=${PROPERTY_ID}`);
    warn.mockRestore();
  });

  test("logs warn and returns null when the property doesn't exist", async () => {
    mockSupabaseSingleResult({ data: null, error: { message: "no row" } });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const out = await resolveActiveProperty(HOST_ID, {
      active_property_id: PROPERTY_ID,
    });
    expect(out).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("unauthorized active_property_id");
    expect(warn.mock.calls[0][0]).toContain("lookup_failed");
    warn.mockRestore();
  });
});
