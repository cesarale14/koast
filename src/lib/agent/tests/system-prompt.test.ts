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

  test("names read_memory and orients on WHEN to call (M4)", () => {
    expect(SYSTEM_PROMPT_TEXT).toMatch(/# Tools/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/read_memory/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/BEFORE answering/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/sufficiency_signal/);
  });

  test("names write_memory_fact as the M6 gated write tool with proposal framing", () => {
    expect(SYSTEM_PROMPT_TEXT).toMatch(/write_memory_fact/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/PROPOSAL, not a write/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/host clicks Save/);
  });

  test("documents the 5 proposal cases with Case 5b out of scope at v1", () => {
    expect(SYSTEM_PROMPT_TEXT).toMatch(/Case 1 \(explicit\)/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/Case 2 \(contextual\)/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/Case 3 \(Q&A answer\)/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/Case 4 \(correction\)/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/Case 5a/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/Case 5b.*out of scope/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/Case 5c/);
  });

  test("teaches the pre-write read_memory check (D27)", () => {
    expect(SYSTEM_PROMPT_TEXT).toMatch(/ALWAYS call read_memory FIRST/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/CORRECTION/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/NEW write/);
  });

  test("CASE 4 has a dedicated mandatory-sequence section (post-CP4 F-1 fix)", () => {
    expect(SYSTEM_PROMPT_TEXT).toMatch(/# CASE 4 — HOST CORRECTS AN EXISTING FACT/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/CALL read_memory FIRST/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/non-negotiable/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/SAVED/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/PENDING/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/NEVER use BOTH fields/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/read_memory is mandatory for case 4/);
  });

  test("supersedes vs supersedes_memory_fact_id field-distinction prose at the top of the tool docs", () => {
    expect(SYSTEM_PROMPT_TEXT).toMatch(/two supersession fields.*DIFFERENT scope/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/supersedes: artifact_id of a PENDING/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/supersedes_memory_fact_id: memory_fact_id of a SAVED/);
  });

  test("documents supersession behavior — pending vs saved correction", () => {
    expect(SYSTEM_PROMPT_TEXT).toMatch(/# Supersession behavior/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/Pending-artifact correction/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/Saved-fact correction/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/supersedes_memory_fact_id/);
  });

  test("includes citation requirement for cases 5a + 5c", () => {
    expect(SYSTEM_PROMPT_TEXT).toMatch(/# Citation requirement/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/citation block MUST cite/);
  });

  test("conservatism + when-uncertain-ask rule", () => {
    expect(SYSTEM_PROMPT_TEXT).toMatch(/Bias toward conservative/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/when uncertain.*ASK/i);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/Proposal fatigue is the failure mode/);
  });

  test("honesty rule is scoped to property/operations/guests/host-specific facts (carry-over from M4)", () => {
    expect(SYSTEM_PROMPT_TEXT).toMatch(/# Honesty/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/properties, operations, guests/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/traceable to a tool result/);
    expect(SYSTEM_PROMPT_TEXT).toMatch(/host's current message/);
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
