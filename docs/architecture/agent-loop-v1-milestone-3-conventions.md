# Agent Loop v1 — Milestone 3 Conventions Inventory

*Phase 1 deliverable — read-only inventory before authoring any dispatcher or tool code. Surfaces Anthropic SDK shapes (already installed at v0.80.0), Zod/JSON-Schema strategy (zod 4 has built-in `z.toJSONSchema()` — no new dep), module location, logging convention, audit-row pattern for read tools, and dispatcher test harness pattern. STOP after this document; await approval before Phases 2-5.*

Cross-references:
- Design doc: `agent-loop-v1-design.md` §2.4 (multi-turn dispatch), §4 (the entire tool dispatch contract), §10 (what M3 proves), §12 (sequencing)
- M2 conventions inventory + report
- M2 modules: `src/lib/action-substrate/`, `src/lib/memory/`

---

## A. Anthropic SDK shapes (v0.80.0 installed)

`@anthropic-ai/sdk@^0.80.0` is in `package.json` and resolved in `node_modules`. Two existing usages:
- `src/lib/claude/messaging.ts` — `generateDraft()` for guest replies
- `src/lib/reviews/generator.ts` — review generation

Neither currently uses tools; M3 introduces the first tool usage.

### Tool definition (request shape)

`Anthropic.Tool` interface, defined in `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.mts:1001`:

```typescript
interface Tool {
  name: string;                          // required, snake_case identifier
  description?: string;                  // recommended, shown to model
  input_schema: Tool.InputSchema;        // required, JSON Schema (draft 2020-12)
  cache_control?: CacheControlEphemeral | null;
  defer_loading?: boolean;
  eager_input_streaming?: boolean | null;
  input_examples?: Array<Record<string, unknown>>;
  strict?: boolean;
  type?: 'custom' | null;
  // ... other optional fields
}

namespace Tool {
  interface InputSchema {
    type: 'object';
    properties?: unknown | null;
    required?: Array<string> | null;
    [k: string]: unknown;                // permissive extra keys
  }
}
```

So the dispatcher's `getToolsForAnthropicSDK()` needs to produce objects of shape `{ name, description, input_schema: { type: 'object', properties, required } }`.

### Tool use block (model's request)

`Anthropic.ToolUseBlock`, line 1336:

```typescript
interface ToolUseBlock {
  id: string;                            // tool_use_id we pair with the result
  caller: DirectCaller | ServerToolCaller | ServerToolCaller20260120;
  input: unknown;                        // model's JSON; we Zod-parse this
  name: string;                          // matches our registered tool name
  type: 'tool_use';
}
```

### Tool result block (our response)

`Anthropic.ToolResultBlockParam`, line 1160:

```typescript
interface ToolResultBlockParam {
  tool_use_id: string;                   // pairs with ToolUseBlock.id
  type: 'tool_result';
  content?: string | Array<TextBlockParam | ImageBlockParam | ...>;
  is_error?: boolean;
  cache_control?: CacheControlEphemeral | null;
}
```

The dispatcher returns a typed result; M4 (agent loop server) is responsible for converting the dispatcher's `ToolCallResult` into a `ToolResultBlockParam` to feed back to the SDK. Keeping that translation in M4 means M3's dispatcher doesn't depend on SDK types — it stays a pure backend contract that M4 adapts.

---

## B. Zod usage and JSON Schema strategy

### Versions

- `zod: ^4.3.6` (installed)
- `zod-to-json-schema: NOT INSTALLED`

### The strategy: zod 4's built-in `z.toJSONSchema()`

Zod 4.x ships with native JSON Schema generation. Verified at runtime:

```bash
$ node -e "const z = require('zod'); console.log('  has toJSONSchema:', typeof z.toJSONSchema === 'function');"
  has toJSONSchema: true
```

So we don't need to add `zod-to-json-schema` (the v3 ecosystem helper). The dispatcher's `getToolsForAnthropicSDK()` will call `z.toJSONSchema(tool.inputSchema)` per registered tool. **No new dependencies.**

### Existing Zod usage in the codebase

Currently only one file uses Zod: `src/lib/validators/properties.ts` (request body validation for `PUT /api/properties/[propertyId]`). The pattern matches what M3 needs:

```typescript
import { z } from "zod";
export const propertyUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  property_type: z.enum(["entire_home", "private_room", "shared_room"]).optional(),
  // ...
});
```

M3 expands Zod's role: every tool definition uses Zod for input + output schemas. This is the agent layer's contract enforcement — distinct from request validation but using the same library.

---

## C. Module location

User's M3 prompt specifies `src/lib/agent/` for the dispatcher and `src/lib/agent/tools/` for individual tools. This matches existing precedent:

| Existing module | Shape |
|---|---|
| `src/lib/pricing/` | flat `engine.ts`, `apply-rules.ts`, `signals/`, `tests/` |
| `src/lib/action-substrate/` (M2) | flat `request-action.ts`, `audit-writer.ts`, `stakes-registry.ts`, `tests/` |
| `src/lib/memory/` (M2) | flat `read.ts`, `write.ts`, `tests/` |

**Proposed M3 layout**:

```
src/lib/agent/
  types.ts                  // Tool<I,O>, ToolHandlerContext, ToolCallResult, ToolError
  dispatcher.ts             // registerTool, dispatchToolCall, getRegisteredTools, getToolsForAnthropicSDK
  tools/
    index.ts                // central registration: imports + registerTool() each tool
    read-memory.ts          // first registered tool
    tests/
      read-memory.test.ts
  tests/
    dispatcher.test.ts
    staging-smoke.test.ts   // gated by RUN_STAGING_SMOKE=1
```

Two test directories (one for tools, one for the dispatcher proper) follow the principle of colocating tests with the code under test. No barrel files except `tools/index.ts` (matches the existing exception in `src/lib/notifications/index.ts`).

---

## D. Logging convention

The existing codebase uses **plain `console.log` / `console.warn` / `console.error`** with a `[module-name]` prefix. 68 total uses across `src/lib/`. No structured logger (no pino, winston, etc.) is installed.

Examples:
```typescript
console.log("[market-sync] Cache hit for property", propertyId);
console.error("[messages/send] Insert error:", error);
```

**M3 convention**: match this exactly.
- Dispatcher: `console.log("[dispatcher] ...")` for the dispatch log line per call (debugging during dev; can be silenced later if noisy).
- Tools: `console.error("[tool:read_memory] ...")` for handler errors.

Logging in the dispatcher is intentionally light at v1 — one INFO line per dispatch, one ERROR line on tool failure. Production observability comes from `agent_audit_log` (structured), not from logs.

---

## E. Audit-row pattern for tool calls (the load-bearing decision)

User's M3 prompt: "On success: write agent_audit_log row with the tool call (outcome='succeeded' immediately for read tools that don't gate; outcome='succeeded' after handler resolution for gated writes)."

This means **every tool call writes one audit row, not just gated ones**. The shape of the write differs by gating:

### Read tools (`requiresGate: false`)

The dispatcher writes the audit row directly via `writeAuditLog()` from `src/lib/action-substrate/audit-writer.ts`:

```typescript
writeAuditLog({
  host_id: ctx.host.id,
  action_type: tool.name,                 // e.g., 'read_memory'
  payload: input,                         // the validated tool input
  source: 'agent_tool',                   // matches AgentAuditLogSource
  actor_kind: 'agent',                    // tool calls are agent-driven
  actor_id: null,
  autonomy_level: 'silent',               // reads are always silent
  outcome: 'pending',                     // updated below
  context: { tool_name: tool.name, conversation_id, turn_id },
  stakes_class: 'low',                    // reads are conventionally 'low'
});
// ...handler runs...
updateAuditOutcome(audit_log_id, 'succeeded' | 'failed', { latency_ms, error_message? });
```

### Gated tools (`requiresGate: true`)

The dispatcher delegates to `requestAction()` from `src/lib/action-substrate/request-action.ts`, which writes the audit row internally. Then the dispatcher calls `updateAuditOutcome()` after the handler resolves.

The gating call needs an `ActionType` that the stakes registry knows about. Two options:

- **Option A (recommended)**: when a gated tool is registered with the dispatcher, its `(tool.name, tool.stakesClass)` pair is also registered with the `stakesRegistry`. So `registerTool({ name: 'memory_fact_write_tool', requiresGate: true, stakesClass: 'low', ... })` calls `stakesRegistry.register(tool.name, tool.stakesClass)` under the hood.
- Option B: the dispatcher calls a variant of `requestAction()` that takes the stakes class as an explicit override (a small extension to the M2 module).

**Recommendation**: Option A. The stakes registry stays the canonical source for `name → stakes_class`. Gated tools self-register on tool registration. This requires one small additive change to `stakes-registry.ts`: convert `stakesRegistry` from a fixed const-record into a mutable `Map` plus a `registerStakesEntry(name, stakesClass)` function. The existing `getStakesClass()` API stays the same.

### Action_type values in the audit feed

After M3, `agent_audit_log.action_type` will hold:
- `'memory_fact_write'` (v2 if we ever expose it as a tool; currently only invoked via writeMemoryFact()'s direct request)
- `'read_memory'` (the M3 tool's name; written by the dispatcher's read-tool path)
- Future tool names as M3+ adds more

This is a known-flexible column (no CHECK constraint per the migration). Worth surfacing to operators that the action_type column doubles as the tool-name column for tool-driven actions.

---

## F. Dispatcher API surface (proposed)

```typescript
// src/lib/agent/types.ts
export type StakesClass = 'low' | 'medium' | 'high'; // re-exported from stakes-registry

export interface ToolHandlerContext {
  host: { id: string };
  conversation_id: string;
  turn_id: string;
}

export interface Tool<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  requiresGate: boolean;
  stakesClass?: StakesClass;             // required when requiresGate=true
  handler: (input: TInput, context: ToolHandlerContext) => Promise<TOutput>;
}

export type ToolErrorKind =
  | 'tool_not_found'
  | 'input_validation_failed'
  | 'gate_blocked'
  | 'confirmation_required'
  | 'output_validation_failed'
  | 'handler_threw';

export interface ToolError {
  kind: ToolErrorKind;
  message: string;
  details?: unknown;                     // not returned to model; kept for debugging
}

export type ToolCallResult<TOutput> =
  | { ok: true;  value: TOutput; audit_log_id: string }
  | { ok: false; error: ToolError; audit_log_id: string | null };
```

```typescript
// src/lib/agent/dispatcher.ts
export function registerTool<TInput, TOutput>(tool: Tool<TInput, TOutput>): void;

export async function dispatchToolCall(
  name: string,
  rawInput: unknown,
  context: ToolHandlerContext,
): Promise<ToolCallResult<unknown>>;

export function getRegisteredTools(): readonly Tool<unknown, unknown>[];

export function getToolsForAnthropicSDK(): Anthropic.Tool[];

// Test-only — exposed but only meaningful in test environments.
export function _resetRegistryForTests(): void;
```

`_resetRegistryForTests()` is needed because tests can't otherwise un-register tools between cases. We name it with the underscore prefix to discourage runtime use; document that it's only safe in `beforeEach`. Avoids the alternative (per-call passing of a registry instance), which adds complexity to every caller.

`ToolHandlerContext` is intentionally lean: host, conversation_id, turn_id only. Tools that need direct DB access (none in v1) call `createServiceClient()` themselves, matching M2's pattern.

---

## G. Tool input/output schemas — schema-vs-migration discipline (carries forward from M2)

The design doc §4.2 specifies `read_memory` input as:

```typescript
z.object({
  entity_type: z.enum(['property']),
  entity_id: z.string().uuid(),
  sub_entity_handle: z.string().nullable().optional(),  // ← design doc
  attribute: z.string().nullable().optional(),
})
```

The migration uses `sub_entity_type` (controlled vocab from `MemoryFactSubEntityType`) + `sub_entity_id` (text), NOT `sub_entity_handle`. **Migration values win** per the M2 conventions doc. So the actual `read_memory` tool input must be:

```typescript
z.object({
  entity_type: z.enum(['property']),
  entity_id: z.string().uuid(),
  sub_entity_type: z.enum([
    'front_door', 'lock', 'parking', 'wifi', 'hvac', 'kitchen_appliances',
  ]).optional(),                          // matches MemoryFactSubEntityType
  sub_entity_id: z.string().optional(),
  attribute: z.string().optional(),
  freshness_threshold_days: z.number().int().positive().optional(),
})
```

Output schema must match `MemoryReadResult` from `src/lib/memory/read.ts` (M2). The data_sufficiency block uses M2's shape `{ fact_count, confidence_aggregate, has_recent_learning, sufficiency_signal: 'rich'|'sparse'|'empty', note }`, NOT the design doc's `{ sufficient, fact_count, reason_if_insufficient }` shape. Same reasoning: the actual returned shape is the load-bearing contract; the design doc gets reconciled separately.

---

## H. Test harness pattern

M2's test pattern is `jest.mock("@/lib/supabase/service")` at the module boundary. M3's dispatcher tests follow the same approach with mocking extended to:

- `jest.mock("@/lib/action-substrate/audit-writer")` — mock writeAuditLog/updateAuditOutcome to assert calls
- `jest.mock("@/lib/action-substrate/request-action")` — mock requestAction for gated-tool tests

Per-test setup pattern:
```typescript
beforeEach(() => {
  jest.clearAllMocks();
  _resetRegistryForTests();             // start each test with empty registry
});

test("dispatchToolCall happy path", async () => {
  registerTool({ name: 'fake_tool', requiresGate: false, ... });
  const result = await dispatchToolCall('fake_tool', { x: 1 }, ctx);
  expect(result.ok).toBe(true);
  expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    action_type: 'fake_tool',
    source: 'agent_tool',
  }));
});
```

For the staging smoke (Phase 4c), the same wrapper pattern as M2: setup test user/property via psql, apply transactional GRANT/REVOKE bracket for DRIFT-3, run the gated test, cleanup.

---

## I. Open decisions to confirm before Phase 2

1. **Module location**: confirm `src/lib/agent/{types,dispatcher}.ts` + `src/lib/agent/tools/`. (Matches user's prompt; flagged for explicit confirmation.)

2. **Zod 4 built-in `z.toJSONSchema()`**: confirm using zod 4 native JSON Schema generation; **no new dependency**. (Alternative: install `zod-to-json-schema` for cross-version stability — adds 1 dep.)

3. **Stakes registry extension** (Option A from §E): confirm convert `stakesRegistry` from `Record` to a mutable map + `registerStakesEntry(name, stakesClass)`. Gated tools self-register on `registerTool()`.

4. **Dispatcher writes audit row for read tools** (per user's M3 prompt): confirm. The dispatcher calls `writeAuditLog()` for non-gated tools, `requestAction()` (which writes internally) for gated tools. Always one audit row per dispatch.

5. **`action_type` = tool name in audit rows**: confirm using the tool name as `agent_audit_log.action_type` for tool-driven actions. Matches the no-CHECK-constraint flexibility on that column.

6. **`ToolHandlerContext` lean shape** (host, conversation_id, turn_id only): confirm. Tools that need DB access call `createServiceClient()` themselves.

7. **`_resetRegistryForTests()` test-only API**: confirm. The function exists to enable per-test registry isolation; underscore prefix signals don't-use-in-runtime.

8. **Tool input/output schema**: read_memory uses migration values (`sub_entity_type` controlled vocab + `sub_entity_id` text), and the output's `data_sufficiency` block matches M2's `MemoryReadResult` shape (NOT the design doc's older shape).

---

## J. Out-of-scope items (NOT touched by Milestone 3)

- Agent loop request handler / `/api/agent/turn` route (Milestone 4)
- SSE streaming protocol (Milestone 6)
- Frontend chat shell (Milestone 7)
- Artifact registry + components (Milestone 8)
- Cancellation semantics (`cancellation` field from design doc §4.1) — defer to M4+ when streaming + cancellation matter
- `data_sufficiency_check` per-tool hooks (design doc §4.1) — v1 tools can return their own data_sufficiency block in the output; the optional pre-handler check is a Phase 2 capability
- Multi-turn round-cap enforcement (design doc §2.4) — M4's concern
- DRIFT-3 permanent fix (carries forward; smoke uses transactional bracket)

---

## Sign-off

- [x] Anthropic SDK shapes documented (Tool / ToolUseBlock / ToolResultBlockParam)
- [x] Zod 4 `z.toJSONSchema()` verified; no new dep needed
- [x] Module layout proposed (matches user's prompt + existing precedent)
- [x] Logging convention identified (console.log with [module] prefix)
- [x] Audit-row pattern for read tools resolved (dispatcher writes; one row per dispatch)
- [x] Stakes registry extension pattern proposed for gated tools
- [x] Schema-vs-migration discipline carried forward from M2
- [x] Test harness pattern documented
- [x] 8 open decisions enumerated for user confirmation
- [ ] User approval to proceed with Phases 2-5

**STOP. No code authored. Awaiting decisions on items I1-I8 and overall approval to proceed.**
