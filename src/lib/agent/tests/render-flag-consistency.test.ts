/**
 * render flag consistency — the deterministic guard for the bug that broke prod
 * while the eval was green: the tool was registered at module top-level (frozen
 * at build/cold-start) while the prompt gate read live, so prod advertised a
 * tool the registry never added.
 *
 * The invariant: in EVERY flag state, render_agenda is in the per-request tools
 * array IFF the prompt advertises it — and both gates are read LIVE (the flag is
 * toggled at RUNTIME here, between assertions, not at module-load).
 *
 * Generalized (post-P3-finish): the SAME exposed-IFF-advertised invariant must
 * hold for EVERY registered tool, in every flag state — so the capability
 * doctrine (the prompt catalog) and the offered-tool set can never diverge.
 * That divergence is exactly what made the prod agent decline pricing: a flag
 * parse mismatch ('1'-only vs an env set to 'true') dropped the tools from BOTH
 * gates while a stale doctrine line told the model pricing was a future phase.
 */
import { activeAnthropicTools } from "../tools"; // side-effect: registers all tools
import { getToolsForAnthropicSDK } from "../dispatcher";
import { buildSystemPrompt } from "../system-prompt";
import { isRenderAgendaEnabled } from "../render/flag";

const KEY = "KOAST_ENABLE_RENDER_AGENDA";
const renderToolExposed = () => activeAnthropicTools().some((t) => t.name === "render_agenda");
const promptAdvertises = () => /render_agenda/.test(buildSystemPrompt());

describe("render flag parsing — accepts '1' AND 'true' (the prod bug)", () => {
  const prev = process.env[KEY];
  afterEach(() => {
    if (prev === undefined) delete process.env[KEY];
    else process.env[KEY] = prev;
  });

  test("'1' and 'true' both enable; everything else is off", () => {
    process.env[KEY] = "1";
    expect(isRenderAgendaEnabled()).toBe(true);
    process.env[KEY] = "true";
    expect(isRenderAgendaEnabled()).toBe(true); // the value Cesar set in prod
    delete process.env[KEY];
    expect(isRenderAgendaEnabled()).toBe(false);
    process.env[KEY] = "0";
    expect(isRenderAgendaEnabled()).toBe(false);
    process.env[KEY] = "false";
    expect(isRenderAgendaEnabled()).toBe(false);
  });
});

describe("render_agenda flag — tools array and prompt agree, read per request", () => {
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
    process.env[KEY] = "true";
    expect(isRenderAgendaEnabled()).toBe(true);
    expect(renderToolExposed()).toBe(true);
    expect(promptAdvertises()).toBe(true);
  });

  test("invariant: render exposure and prompt advertisement agree in every state (toggled live)", () => {
    for (const v of [undefined, "1", undefined, "true"]) {
      if (v === undefined) delete process.env[KEY];
      else process.env[KEY] = v;
      expect(renderToolExposed()).toBe(promptAdvertises());
    }
  });
});

describe("doctrine ↔ offered-tool set cannot diverge — EVERY registered tool", () => {
  const prev = process.env[KEY];
  afterEach(() => {
    if (prev === undefined) delete process.env[KEY];
    else process.env[KEY] = prev;
  });

  // For every registered tool, in both flag states: the tool is exposed to the
  // model IFF the system prompt names it. Catches a tool offered-but-undescribed
  // (the model won't use it — the pricing-decline symptom) AND a tool
  // described-but-unoffered (the model calls a tool that isn't there — the
  // original prod bug). The catalog stays hand-written, but this guard makes it
  // impossible to ship a divergence.
  for (const flagValue of [undefined, "true"] as const) {
    test(`flag ${flagValue ?? "OFF"}: exposed IFF advertised, for all tools`, () => {
      if (flagValue === undefined) delete process.env[KEY];
      else process.env[KEY] = flagValue;

      const prompt = buildSystemPrompt();
      const exposed = new Set(activeAnthropicTools().map((t) => t.name));
      for (const tool of getToolsForAnthropicSDK()) {
        const isExposed = exposed.has(tool.name);
        const isAdvertised = prompt.includes(tool.name);
        // Readable failure: names the diverging tool + its two gate states.
        expect(`${tool.name} exposed=${isExposed} advertised=${isAdvertised}`).toBe(
          `${tool.name} exposed=${isExposed} advertised=${isExposed}`,
        );
      }
    });
  }
});
