/**
 * render_agenda flag consistency — the deterministic guard for the bug that
 * broke prod while the eval was green: the tool was registered at module
 * top-level (frozen at build/cold-start) while the prompt gate read live, so
 * prod advertised a tool the registry never added.
 *
 * The invariant: in EVERY flag state, render_agenda is in the per-request tools
 * array IFF the prompt advertises it — and both gates are read LIVE (the flag is
 * toggled at RUNTIME here, between assertions, not at module-load). A frozen
 * module-level gate fails this: it can't change when the flag changes.
 */
import { activeAnthropicTools } from "../tools"; // side-effect: registers all tools (render_agenda unconditionally)
import { buildSystemPrompt } from "../system-prompt";
import { isRenderAgendaEnabled } from "../render/flag";

const renderToolExposed = () => activeAnthropicTools().some((t) => t.name === "render_agenda");
const promptAdvertises = () => /render_agenda/.test(buildSystemPrompt());

describe("render_agenda flag — tools array and prompt agree, read per request", () => {
  const KEY = "KOAST_ENABLE_RENDER_AGENDA";
  const prev = process.env[KEY];
  afterEach(() => {
    if (prev === undefined) delete process.env[KEY];
    else process.env[KEY] = prev;
  });

  test("flag OFF: render_agenda in NEITHER the tools array NOR the prompt", () => {
    delete process.env[KEY];
    expect(isRenderAgendaEnabled()).toBe(false);
    expect(renderToolExposed()).toBe(false);
    expect(promptAdvertises()).toBe(false);
  });

  test("flag ON: render_agenda in BOTH the tools array AND the prompt", () => {
    process.env[KEY] = "1";
    expect(isRenderAgendaEnabled()).toBe(true);
    expect(renderToolExposed()).toBe(true);
    expect(promptAdvertises()).toBe(true);
  });

  test("invariant: tools-array exposure and prompt advertisement agree in every state (toggled live)", () => {
    // Toggle at runtime between assertions — proves neither gate is frozen at
    // module-load. A prompt advertising a tool the array lacks (the prod bug)
    // makes these inequalities fail.
    for (const v of [undefined, "1", undefined, "1"]) {
      if (v === undefined) delete process.env[KEY];
      else process.env[KEY] = v;
      expect(renderToolExposed()).toBe(promptAdvertises());
    }
  });
});
