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

registerTool(readMemoryTool);

// Future tools registered here:
//   import { writeMemoryFactTool } from "./write-memory-fact";
//   registerTool(writeMemoryFactTool);
