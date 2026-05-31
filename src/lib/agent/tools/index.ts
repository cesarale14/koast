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

import { registerTool } from "../dispatcher";
import { readMemoryTool } from "./read-memory";
import { writeMemoryFactTool } from "./write-memory-fact";
import { readGuestThreadTool } from "./read-guest-thread";
import { proposeGuestMessageTool } from "./propose-guest-message";
import { renderAgendaTool } from "./render-agenda";

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
// DEPLOY GATE: registered ONLY when KOAST_ENABLE_RENDER_AGENDA=1, so landing
// the code (column + tool) is decoupled from enabling the behavior. Off in prod
// (flag unset) → the model never sees the tool → no un-eval-hardened,
// catalog-inconsistent tool in front of real hosts. On in dev / staging / eval
// / E2E. Phase D flips the prod flag on alongside the when-to-card system-prompt
// rule + the corrected tool catalog (and re-runs the anti-deflection sweep).
if (process.env.KOAST_ENABLE_RENDER_AGENDA === "1") {
  registerTool(renderAgendaTool);
}
