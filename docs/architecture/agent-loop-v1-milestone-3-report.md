# Agent Loop v1 — Milestone 3 Report

*Executed 2026-05-02. Tool dispatcher with `read_memory` as the first registered tool. The dispatcher infrastructure (registration, input/output Zod validation, audit-row writes per dispatch, two gating patterns) is in place; one tool is registered; end-to-end smoke against staging proves the dispatch path round-trips a real memory_fact through `dispatchToolCall('read_memory', ...)` with full provenance and a correctly-resolved audit row. Milestone 4 (agent loop server) wires this dispatcher into the `/api/agent/turn` request flow with the Anthropic SDK.*

Cross-references:
- Conventions inventory: [`agent-loop-v1-milestone-3-conventions.md`](./agent-loop-v1-milestone-3-conventions.md) — Phase 1 deliverable; decisions locked here
- Milestone 2: [`agent-loop-v1-milestone-2-report.md`](./agent-loop-v1-milestone-2-report.md) — substrate + memory handlers M3 builds on
- Design doc: [`agent-loop-v1-design.md`](./agent-loop-v1-design.md) §4 (tool dispatch contract), §10 (what M3 proves), §12 (sequencing)

---

## Phase outcomes

### Phase 1 — Conventions inventory (CLEAN, STOPPED for approval)

Saved to `agent-loop-v1-milestone-3-conventions.md`. 8 open decisions surfaced, all approved by user. Decisions locked:
1. Module location: `src/lib/agent/{types,dispatcher}.ts` + `src/lib/agent/tools/`
2. Zod 4 native `z.toJSONSchema()` (no new dependency)
3. Stakes registry extension: convert from fixed Record to mutable Map + `registerStakesEntry()` with duplicate detection (no-op same value, throw on differing)
4. Dispatcher writes audit row directly for read tools (action_type = tool.name); gated tools delegate to `requestAction()`
5. Action_type = tool name in audit rows (carry-forward: rename `memory_fact_write` → `write_memory_fact` in a future migration)
6. `ToolHandlerContext` lean: `{ host, conversation_id, turn_id }` only
7. `_resetRegistryForTests()` underscore-prefix test-only API
8. Schema reconciliation: read_memory tool's input uses migration values; output's data_sufficiency uses M2's actual shape

### Phase 2 — Types + dispatcher + stakes-registry mutability (CLEAN)

**Modules touched:**

| File | Lines | Purpose |
|---|---:|---|
| `src/lib/agent/types.ts` (NEW) | 96 | `Tool<TInput, TOutput>`, `ToolHandlerContext`, `ToolError`, `ToolErrorKind`, `ToolCallResult<T>`, `AnthropicToolParam`, `StakesClass` re-export |
| `src/lib/agent/dispatcher.ts` (NEW) | 299 | `registerTool`, `dispatchToolCall`, `getRegisteredTools`, `getToolsForAnthropicSDK`, `_resetRegistryForTests`. Two audit-write patterns (read vs gated) documented inline. |
| `src/lib/action-substrate/stakes-registry.ts` (MODIFIED) | 96 | Converted `stakesRegistry` from fixed `Record` to mutable `Map`; added `registerStakesEntry(actionType, stakesClass)` with duplicate detection (silent no-op when stakes_class matches; throws on conflict); added `getRegisteredStakesEntries()` and `_resetStakesRegistryForTests()`. `ActionType` widened from literal-union to `string`. |

**Substrate adjacency note**: the only substrate-adjacent change is the stakes-registry mutability extension. No other M2 modules were modified. `request-action.ts` and `audit-writer.ts` continue to import `getStakesClass` and `ActionType` unchanged; the runtime behavior is identical for v1's seed entry (`memory_fact_write`).

### Phase 3 — read_memory tool (CLEAN)

**Modules:**

| File | Lines | Purpose |
|---|---:|---|
| `src/lib/agent/tools/read-memory.ts` (NEW) | 137 | The tool definition: input schema (`entity_type='property'`, controlled-vocab `sub_entity_type`, optional `sub_entity_id` / `attribute` / `freshness_threshold_days`), output schema (mirrors M2's `MemoryReadResult`), description (final text below), handler delegating to `readMemory()` |
| `src/lib/agent/tools/index.ts` (NEW) | 19 | Central tool registration entry point — imports `readMemoryTool` and calls `registerTool()`. Has the side effect of populating the dispatcher's registry. |

**Final description text** (model-facing, ~190 words):

> Read facts the host has previously taught about a property — door codes, wifi passwords, parking instructions, HVAC quirks, lock idiosyncrasies, kitchen appliance tricks.
>
> Call this BEFORE answering any guest or host question that depends on what the host has already confirmed. Reading from memory beats asking the host the same thing twice and lets you ground answers in real provenance instead of guessing.
>
> v1 scope: entity_type='property' only. Pass the property's UUID as entity_id (resolved from ui_context or a prior turn's tool call). Optional narrowing:
>   - sub_entity_type: one of 'front_door' | 'lock' | 'parking' | 'wifi' | 'hvac' | 'kitchen_appliances'
>   - attribute: free-form (e.g., 'unlock_mechanism' for the front door, 'password' for wifi)
>   - freshness_threshold_days: only return facts learned within the last N days
>
> Returns each fact with full provenance (id, attribute, value, source, confidence, learned_at, learned_from JSONB) and a data_sufficiency block. When sufficiency_signal is 'empty' or 'sparse', prefer asking the host directly over guessing or fabricating; when 'rich', answer from the facts and cite the most recent ones.

**Description deliberation**: the wording is oriented around **when to call** ("Call this BEFORE answering any guest or host question that depends on...") rather than **what it does** technically. The data_sufficiency signal is named explicitly so the model has a clean decision input ("empty/sparse → ask host; rich → answer"). v1 scope restrictions (entity_type='property' only) are stated upfront so the model doesn't waste turns trying guest/vendor scopes.

**Schema discipline**: the input schema's `sub_entity_type` z.enum lists the 6 canonical values from `MemoryFactSubEntityType` — duplication of the typed union is intentional (Zod schema is what the dispatcher validates against; TypeScript union is what M2's handler types). Both are kept in sync if the migration adds entries.

### Phase 4 — Dispatcher tests + tool tests + staging smoke (CLEAN)

**Test files (3 new + 1 modified):**

| File | Lines | Tests |
|---|---:|---:|
| `src/lib/agent/tests/dispatcher.test.ts` (NEW) | 335 | 13 unit tests across 5 describe blocks |
| `src/lib/agent/tools/tests/read-memory.test.ts` (NEW) | 180 | 13 unit tests across 3 describe blocks |
| `src/lib/agent/tests/staging-smoke.test.ts` (NEW, gated) | 167 | 1 gated smoke |
| `src/lib/action-substrate/tests/stakes-registry.test.ts` (MODIFIED) | 66 | 8 tests (was 3) |

**Test surface coverage:**

Dispatcher (13 tests):
- registerTool: registers fresh tool, throws on duplicate name, throws when requiresGate=true but no stakesClass, self-registers gated stakes entry
- dispatchToolCall happy path: validates input → runs handler → writes audit (pending) → resolves audit (succeeded) → returns ok=true with audit_log_id
- Error paths: tool_not_found (no audit row), input_validation_failed (no audit row), handler_threw (audit failed with error_message), output_validation_failed (audit failed)
- Gated tool path: substrate returns 'allow' → handler runs and audit resolved succeeded; substrate returns 'require_confirmation' → no handler call, error kind 'confirmation_required', audit resolved 'failed' with gate_confirmation_required reason
- getToolsForAnthropicSDK: returns name + description + input_schema (type='object'); throws if a tool's schema is non-object
- _resetRegistryForTests: clears the registry

read_memory tool (13 tests):
- Input schema validation: required-only valid, all-optional valid, rejects non-property entity_type (v1 scope), rejects non-canonical sub_entity_type, accepts every canonical sub_entity_type, rejects non-uuid entity_id, rejects negative freshness_threshold_days
- Handler delegation: forwards scope+query to M2's readMemory correctly, output passes the tool's outputSchema, propagates errors
- Registration metadata: name='read_memory', requiresGate=false, description orients model around when (regex check)

Stakes registry (8 tests, was 3):
- Seed state: exactly memory_fact_write→'low'; getStakesClass returns 'low'; getStakesClass throws for unknown
- Duplicate detection: registers new, no-op on same stakes_class, throws on conflict, multiple distinct registrations survive
- _resetStakesRegistryForTests: returns to seed state

**Mocking strategy**: `jest.mock("@/lib/action-substrate/audit-writer")` and `jest.mock("@/lib/action-substrate/request-action")` at module boundaries. `_resetRegistryForTests()` + `_resetStakesRegistryForTests()` in `beforeEach()` for per-test isolation.

**Staging smoke** (`src/lib/agent/tests/staging-smoke.test.ts`, gated by `RUN_STAGING_SMOKE=1`):
- Pre-condition: wrapper script seeds test user/property and applies transactional GRANT/REVOKE bracket for DRIFT-3
- Test: writeMemoryFact seeds a smoke fact, dispatchToolCall('read_memory', ...) retrieves it, full provenance roundtrip verified, audit row queried directly
- Cleanup: afterAll deletes the smoke fact + write audit + dispatch audit

### Phase 5 — Verification (CLEAN)

**TypeScript:**
```
$ npx tsc --noEmit
(exit 0)
```

**Unit tests:**
```
$ npm test
Test Suites: 2 skipped, 10 passed, 10 of 12 total
Tests:       2 skipped, 111 passed, 113 total
Time:        17.97 s
```

The 2 skipped suites are the M2 + M3 staging smokes (both gated by `RUN_STAGING_SMOKE=1`). Unit count grew from M2's 80 → M3's 111: net +31 tests (5 dispatcher additions over the M2 baseline + 13 dispatcher + 13 read_memory + extending stakes-registry by 5).

**Staging smoke (executed via wrapper):**
```bash
set -a; source .env.staging; set +a
psql "$DATABASE_URL" <<SQL ...setup user/property + GRANT bracket... SQL
RUN_STAGING_SMOKE=1 npx jest src/lib/agent/tests/staging-smoke.test.ts
psql "$DATABASE_URL" <<SQL ...cleanup + REVOKE... SQL
```

Smoke result:
```
PASS src/lib/agent/tests/staging-smoke.test.ts
  M3 dispatcher staging smoke
    ✓ end-to-end: seed a fact → dispatchToolCall('read_memory') returns it with full provenance + correct audit row (1.5s)
```

End-to-end verification:
- Tool registered: `[dispatcher] Registered tool 'read_memory' (gated=false).`
- writeMemoryFact seeded a fact in `memory_facts` (M2 path)
- dispatchToolCall('read_memory', ...) succeeded in ~500ms
- Returned facts array contained exactly 1 entry with the seeded id, attribute, value='smoke-fact-value', source='host_taught', confidence≈0.9, status='active'
- Provenance JSONB roundtripped: conversation_id, artifact_id all match seed
- data_sufficiency: fact_count=1, sufficiency_signal='sparse', has_recent_learning=true
- agent_audit_log row queried directly: action_type='read_memory', source='agent_tool', actor_kind='agent', autonomy_level='silent', outcome='succeeded', latency_ms is a number, context.tool_name='read_memory', context.conversation_id matches dispatch context, context.stakes_class='low'
- Cleanup: 0 remaining smoke users / properties / facts / audits

---

## Architectural decisions during authoring

### D1 — `ActionType` widened from literal-union to `string`

The M2 stakes-registry had `ActionType = "memory_fact_write"` as a literal-union. With dynamic tool registration in M3, full compile-time enumeration isn't possible without code generation. The type was widened to `string` and runtime validation moved to `getStakesClass()` (which throws on unknown actionType).

**Trade-off**: lose the compile-time check that "you can only call requestAction with a registered action_type." Mitigation: when a gated tool registers with the dispatcher, its (name, stakesClass) pair gets registered in the stakes-registry automatically — so all stakes-registered names are also registered tool names.

**Why this shape**: Code generation for action types would couple the build process to tool registration. A runtime registry with `throws-on-unknown` is simpler and catches the mistake at the first dispatch attempt rather than silently allowing it.

### D2 — Two distinct audit-write patterns based on `requiresGate`

Read tools call `writeAuditLog()` directly with action_type=tool.name; the dispatcher fully owns the audit row. Gated tools delegate to `requestAction()` (which writes the row internally) and use `updateAuditOutcome()` to resolve.

**Why this shape**: Read tools don't need to consult the substrate's gating logic — every read at low stakes is allowed silently. Going through `requestAction()` for read tools would add a layer of indirection without value. Gated tools need the substrate's `agent_artifact` bypass detection, calibration logic, etc. — that's the substrate's concern.

**Trade-off**: Two write paths in the dispatcher means the audit-row-shape contract is enforced in two places (the dispatcher's `buildReadToolAuditPayload()` for reads, the substrate's `requestAction()` for gated). Both currently produce the same shape (host_id + action_type + payload + source='agent_tool' + actor_kind='agent' + ...). If the shape diverges later, fix at both sites.

### D3 — Dispatcher uses `console.log` / `console.error` with `[dispatcher]` and `[tool:<name>]` prefixes

Matches existing codebase convention. One INFO line per registration + one INFO line per successful dispatch + one ERROR line per handler failure. No structured logger.

**Why this shape**: Production observability comes from `agent_audit_log` (structured), not from logs. Logs are debugging aid for development; staying lightweight keeps them readable.

### D4 — Tool's audit row context carries `tool_name` even though `action_type` already does

The dispatcher writes the audit row with `action_type='read_memory'` (the tool name) AND `context.tool_name='read_memory'` (redundantly). Reasoning: future tool-driven actions may have their `action_type` be something other than the tool name (e.g., `action_type='memory_fact_write'` invoked via a tool named `save_memory_fact`). Carrying `tool_name` in context makes the tool boundary always queryable in a uniform way.

### D5 — Dispatcher's input/output validation uses Zod's `safeParse()`, not `parse()`

`safeParse` returns a `{ success, data | error }` discriminated union; `parse` throws. Using `safeParse` lets the dispatcher convert Zod errors into a structured `ToolError` with `kind: 'input_validation_failed'` or `'output_validation_failed'` instead of a generic exception. The model receives a machine-parseable explanation of what was wrong.

### D6 — Dispatcher's `getToolsForAnthropicSDK()` calls `z.toJSONSchema()` per call (not cached)

Anthropic's tool definition is built per server start anyway (M4 will call `getToolsForAnthropicSDK()` once at boot). Caching the JSON Schema would add complexity for marginal benefit. v1 has 1 tool; even at 50 tools the cost is sub-millisecond.

**Future revisit**: if `z.toJSONSchema()` becomes expensive at scale (large recursive schemas, many tools), add memoization keyed on the Zod schema object identity.

---

## Files added (5) + modified (2)

### Added
- `src/lib/agent/types.ts` (96 lines)
- `src/lib/agent/dispatcher.ts` (299 lines)
- `src/lib/agent/tools/read-memory.ts` (137 lines)
- `src/lib/agent/tools/index.ts` (19 lines)
- `src/lib/agent/tests/dispatcher.test.ts` (335 lines)
- `src/lib/agent/tests/staging-smoke.test.ts` (167 lines, gated)
- `src/lib/agent/tools/tests/read-memory.test.ts` (180 lines)
- `docs/architecture/agent-loop-v1-milestone-3-conventions.md` (Phase 1 inventory)
- `docs/architecture/agent-loop-v1-milestone-3-report.md` (this file)

### Modified
- `src/lib/action-substrate/stakes-registry.ts` (96 lines — was 39; converted Record→Map + added registerStakesEntry)
- `src/lib/action-substrate/tests/stakes-registry.test.ts` (66 lines — was 17; expanded to cover mutability)

**Locked / unchanged**: all migration files; the design document (the design-vs-migration reconciliation is still a separate task); all M1 + M2 modules outside the substrate.

---

## Test counts

| Suite | Tests | Lines |
|---|---:|---:|
| `dispatcher.test.ts` | 13 | 335 |
| `read-memory.test.ts` | 13 | 180 |
| `stakes-registry.test.ts` (extended from M2) | 8 (was 3) | 66 |
| `agent/tests/staging-smoke.test.ts` | 1 (gated) | 167 |
| **Net new this milestone** | **+31 unit + 1 gated smoke** | **+650 lines** |
| **Grand total project tests** | **111 unit + 2 gated smokes** | — |

---

## Open carry-forwards for Milestone 4 and beyond

1. **Milestone 4 — agent loop server** (`/api/agent/turn` route + `/api/agent/conversations/[id]`). The dispatcher is now ready to plug into the Messages API loop. M4 imports `src/lib/agent/tools/index.ts` once at boot, calls `getToolsForAnthropicSDK()` to populate the request, and converts dispatcher's `ToolCallResult` into Anthropic's `ToolResultBlockParam`.

2. **Action_type rename: `memory_fact_write` → `write_memory_fact`** for naming consistency with future tools (verb_object, lowercase snake_case). Don't fix this session; ship as a small recovery migration when there's other migration work pending. Tracked in stakes-registry.ts comments.

3. **DRIFT-3 permanent fix** (carries forward from M2). Smoke uses transactional GRANT/REVOKE bracket. Permanent fix is a recovery migration `20260502100000_recovery_supabase_role_grants.sql`. Out of scope this session; address next staging-arc session.

4. **Tool `cancellation` field** (design doc §4.1 — `'idempotent' | 'requires_completion'`). Deferred at v1 since neither streaming nor host-initiated cancellation is wired yet. M4-M6 work; revisit when streaming UI lands.

5. **Tool `data_sufficiency_check` per-tool hooks** (design doc §4.1 — pre-handler check returning `{ sufficient, reason }`). Deferred — v1 tools embed sufficiency in their output schema (read_memory's `data_sufficiency` block). The pre-handler hook is a Phase 2 capability for tools whose sufficiency depends on inputs and can short-circuit before running the handler.

6. **Multi-turn round-cap enforcement** (design doc §2.4). M4's concern, not M3's. The dispatcher is round-agnostic; it doesn't know or care which turn invoked it.

7. **M1 carry-forwards still active**: messaging_executor INSERT path attribution gate (when executor begins firing); drop messages_pre_milestone1_snapshot ≥2026-05-09.

8. **Audit-row aging diagnostic** (M2 carry-forward). `agent_audit_log` rows stuck at `outcome='pending'` indicate a dispatcher path that wrote the row but never resolved. Wire into observability when traffic warrants.

---

## Sign-off

- [x] Phase 1 conventions inventory complete; 8 decisions approved
- [x] Phase 2 dispatcher infrastructure (types + dispatcher + stakes-registry mutability) authored; 13 dispatcher tests + 8 stakes-registry tests pass
- [x] Phase 3 read_memory tool authored with deliberate description + migration-aligned schemas
- [x] Phase 4 tests + staging smoke authored
- [x] Phase 5 verification clean: tsc 0, npm test 111/111 unit + 2 gated smokes, M3 staging smoke verified end-to-end roundtrip with correct audit shape
- [x] Migration files unchanged
- [x] Design document unchanged
- [x] Production data untouched
- [x] No new dependencies introduced

After this session: M3 is complete. The dispatcher exists, one tool is registered (read_memory), end-to-end tool call works against staging via the gated smoke. M4 (agent loop server) wires the dispatcher into the Anthropic SDK request flow.
