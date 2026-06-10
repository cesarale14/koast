/**
 * Central tool registration entry point. Importing this module has the
 * side effect of registering every v1 tool with the dispatcher.
 *
 * Adding a tool: import its definition + add a `registerTool()` call.
 * Order doesn't matter; tools are looked up by name at dispatch time.
 *
 * The agent loop server (M4) imports this module once during server
 * boot to populate the registry before processing requests.
 */

import { registerTool, getToolsForAnthropicSDK } from "../dispatcher";
import { readMemoryTool } from "./read-memory";
import { writeMemoryFactTool } from "./write-memory-fact";
import { readGuestThreadTool } from "./read-guest-thread";
import { proposeGuestMessageTool } from "./propose-guest-message";
import { renderAgendaTool } from "./render-agenda";
import { readTurnoversTool } from "./read-turnovers";
import { readPricingTool } from "./read-pricing";
import { proposeAssignCleanerTool } from "./propose-assign-cleaner";
import { isRenderAgendaEnabled } from "../render/flag";

registerTool(readMemoryTool);
registerTool(writeMemoryFactTool);
// M7: guest messaging — read_guest_thread returns thread + booking
// context, propose_guest_message gates a draft for host approval and
// (post-approval) Channex send.
registerTool(readGuestThreadTool);
registerTool(proposeGuestMessageTool);
// Generative-UI: render_agenda — non-gated render of the operational agenda as
// a typed card payload (drives the `render` SSE event + agent_turns.render).
//
// Registered UNCONDITIONALLY. The deploy gate (KOAST_ENABLE_RENDER_AGENDA) is
// read PER REQUEST in activeAnthropicTools() below — NOT here at module
// top-level. A module-level conditional registration froze at build/cold-start
// and diverged from the prompt's live gate (prod advertised a tool the registry
// never added). Gating EXPOSURE live, the same way the prompt gates the catalog
// + rule, keeps the two in lockstep.
registerTool(renderAgendaTool);
// P3.1 — block-emitting read tools. Registered unconditionally; EXPOSURE gated
// live on the SAME render flag (the whole generative-UI line is one switch).
registerTool(readTurnoversTool);
registerTool(readPricingTool);
// P3.2 — the agent's first WRITE-as-proposal. Always exposed (not flag-gated):
// it creates a PENDING proposal and executes nothing; host approval is the gate.
registerTool(proposeAssignCleanerTool);

// The generative-UI tools — exposed only when the render flag is on, in
// lockstep with the prompt's applyRenderToggle.
const GENERATIVE_UI_TOOLS = new Set(["render_agenda", "read_turnovers", "read_pricing"]);

/**
 * The per-request tool array handed to the model. Reads the render flag LIVE
 * (via isRenderAgendaEnabled) so the generative-UI tools are exposed only when
 * enabled — in lockstep with the prompt's applyRenderToggle. Filtering EXPOSURE
 * (not registration) means the gate can't freeze at module-load.
 */
export function activeAnthropicTools(): ReturnType<typeof getToolsForAnthropicSDK> {
  const all = getToolsForAnthropicSDK();
  return isRenderAgendaEnabled() ? all : all.filter((t) => !GENERATIVE_UI_TOOLS.has(t.name));
}
