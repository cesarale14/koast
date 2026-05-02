import { buildSystemPrompt, SYSTEM_PROMPT_TEXT } from "../system-prompt";

describe("system prompt", () => {
  test("identity statement is the first thing", () => {
    expect(SYSTEM_PROMPT_TEXT).toMatch(/^You are Koast/);
  });

  test("contains a Voice section with the no-filler discipline", () => {
    expect(SYSTEM_PROMPT_TEXT).toMatch(/Voice:/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/Skip filler/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/Don't apologize unnecessarily/);
  });

  test("names read_memory as the only v1 tool and orients on WHEN to call", () => {
    expect(SYSTEM_PROMPT_TEXT).toMatch(/Tools:/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/read_memory/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/BEFORE answering/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/sufficiency_signal/);
  });

  test("honesty rule is scoped to property/operations/guests/host-specific facts", () => {
    expect(SYSTEM_PROMPT_TEXT).toMatch(/Honesty:/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/properties, operations, guests/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/traceable to a tool result/);
    // The refined rule (per user's revision in the M4 prompt) allows
    // trivial conversational turns: only PROPERTY/OPERATIONS/GUEST/HOST
    // facts must be tool-traceable, not arbitrary conversation.
    expect(SYSTEM_PROMPT_TEXT).toMatch(/host's current message/);
  });

  test("does NOT mention artifacts (M4 doesn't emit any; M7 will extend)", () => {
    expect(SYSTEM_PROMPT_TEXT).not.toMatch(/artifact/i);
  });

  test("buildSystemPrompt returns the constant text", () => {
    expect(buildSystemPrompt()).toBe(SYSTEM_PROMPT_TEXT);
  });

  test("buildSystemPrompt accepts a context argument (forward-compat shape)", () => {
    expect(
      buildSystemPrompt({ host: { id: "00000000-0000-0000-0000-000000000aaa" } }),
    ).toBe(SYSTEM_PROMPT_TEXT);
  });
});
