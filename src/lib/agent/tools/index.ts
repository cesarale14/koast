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

registerTool(readMemoryTool);
registerTool(writeMemoryFactTool);
// M7: guest messaging — read_guest_thread returns thread + booking
// context, propose_guest_message gates a draft for host approval and
// (post-approval) Channex send.
registerTool(readGuestThreadTool);
registerTool(proposeGuestMessageTool);
