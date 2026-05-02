# Agent Loop v1 — Milestone 2 Conventions Inventory

*Phase 1 deliverable — read-only inventory before authoring any code. Surfaces test framework, module conventions, client choice, typed-union gaps, and schema-vs-design discrepancies that the implementation must navigate. STOP after this document; await approval before Phases 2-4.*

Cross-references:
- Design doc: `agent-loop-v1-design.md` §6 (memory hooks), §7 (action substrate), §10 (proves), §12 (sequencing)
- Schema: `src/lib/db/schema.ts`
- BELIEF docs in `docs/method/`
- Milestone 1 rollout: `agent-loop-v1-milestone-1-rollout-report.md`

---

## A. Test framework

**Framework**: Jest 30 (`jest@^30.3.0`) with `ts-jest@^29.4.6`. `@types/jest@^30.0.0`.
**Config**: `jest.config.ts` at repo root. `preset: 'ts-jest'`, `testEnvironment: 'node'`, `moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' }`, `testMatch: ['**/*.test.ts']`.

**Test placement**: two patterns coexist in the codebase:
- `src/lib/__tests__/<feature>.test.ts` (root tests directory) — e.g., `src/lib/__tests__/guest-name.test.ts`
- `src/lib/<feature>/tests/<file>.test.ts` (feature-colocated) — e.g., `src/lib/pricing/tests/engine.test.ts`

**Recommendation for Milestone 2**: feature-colocated under `src/lib/agent/tests/` and `src/lib/memory/tests/` (matches the pricing-module precedent, which is the closest analog in shape to what agent-loop becomes).

**Running tests**: there is **no `test` script in `package.json`**. Tests are invoked as `npx jest` directly. Recommend adding `"test": "jest"` to package.json scripts as a small ergonomic improvement — flagging here because it's a 1-line change but is mildly out of scope for "Milestone 2 conventions". *Decision needed*: add the `test` script, or leave as `npx jest`?

**Test style** (from `guest-name.test.ts`, `engine.test.ts`): plain `describe()` / `test()` / `it()` blocks; `expect(...).toBe()` / `.toContain()`. Imports use `@/lib/...` alias. Comment lightly; one assertion per test where possible; group by feature.

---

## B. Module location

**Design doc explicit guidance** (§7.1, §12.2):
- `src/lib/action-substrate/request-action.ts`
- `src/lib/action-substrate/stakes-registry.ts`
- `src/lib/action-substrate/audit-writer.ts`
- `src/lib/memory/read.ts`
- `src/lib/memory/write.ts`

**User prompt suggestion**: "probably src/lib/agent/" — but explicitly defers to Phase 1 findings.

**Existing precedent** (closest analog: `src/lib/pricing/`):
- Flat module shape under feature dir: `engine.ts`, `apply-rules.ts`, `forecast.ts`, etc.
- Subdirs only when content groups cleanly (`signals/`, `tests/`)
- No barrel `index.ts` (only `src/lib/notifications/index.ts` uses that pattern, and it's an exception not the rule)

**Recommendation**: follow the **design doc** literally:
```
src/lib/action-substrate/
  request-action.ts        // Phase 2: requestAction()
  stakes-registry.ts       // Phase 2: stakesRegistry, ActionType, StakesClass
  audit-writer.ts          // Phase 2: writeAuditLog() (called by request-action)
  tests/
    request-action.test.ts
    stakes-registry.test.ts
    audit-writer.test.ts

src/lib/memory/
  read.ts                  // Phase 3: readMemory()
  write.ts                 // Phase 4: writeMemoryFact()
  tests/
    read.test.ts
    write.test.ts
```

Reasoning: the design doc explicitly named these paths; agent-loop tools (Milestone 3) will live under `src/lib/agent/tools/`, distinct from the substrate which is a separate concern. Mixing them under `src/lib/agent/` would conflate the substrate (used by routes/workers/tools) with the tools (used only by the agent loop).

*Decision needed*: confirm `src/lib/action-substrate/` + `src/lib/memory/` (matching design doc) — or override toward `src/lib/agent/` if the user prefers consolidation.

---

## C. Drizzle vs Supabase client convention

**Three clients available**:

| Client | File | Auth context | RLS | Use case |
|---|---|---|---|---|
| `createClient()` (browser) | `src/lib/supabase/client.ts` | session cookie | enforced | Client-side React |
| `createClient()` (server) | `src/lib/supabase/server.ts` | cookie via `next/headers` | enforced | Server components / API routes that act as the host |
| `createServiceClient()` | `src/lib/supabase/service.ts` | none (SUPABASE_SERVICE_ROLE_KEY) | **bypassed** | Server-side admin operations |

**Drizzle** (`db` from `src/lib/db/connection.ts`): direct `postgres-js` connection over `DATABASE_URL`, no auth layer at all (it's the postgres role on staging or prod). Used in 10 src/ files including some API routes (e.g., `src/app/api/reviews/pending/route.ts`) and workers.

**Dominant API-route pattern** (see `src/app/api/messages/send/route.ts`):
1. Call `getAuthenticatedUser()` from `@/lib/auth/api-auth` to get the host
2. Call `verifyPropertyOwnership(user.id, propertyId)` for boundary auth
3. Use `createServiceClient()` for the write — bypasses RLS but route-level auth was just enforced

This pattern means **route-level ownership checks are primary; RLS is secondary defense**. The action substrate handlers (which are reused by routes, workers, and tools) follow this pattern: accept `host_id` as a typed parameter, use service-role for the write, scope by `host_id` in the WHERE clause.

**Recommendation for Milestone 2**:

| Module | Client | Why |
|---|---|---|
| `audit-writer.ts` (writes `agent_audit_log`) | `createServiceClient()` | RLS on the table is SELECT-only for authenticated users — writes require service-role |
| `request-action.ts` | `createServiceClient()` (via audit-writer) | composed; no direct DB access |
| `read.ts` (reads `memory_facts`) | `createServiceClient()` + `host_id` in WHERE | matches dominant pattern; handler is reusable from route/worker/tool contexts |
| `write.ts` (writes `memory_facts`) | `createServiceClient()` + `host_id` in INSERT | same reasoning |

This means callers (e.g., the eventual `/api/agent/artifact-action` route) are responsible for verifying the host matches the authenticated session before calling these handlers. The handlers trust their `host_id` argument.

*Decision needed*: confirm the service-role pattern (consistent with codebase) vs the design doc's `host_id = auth.uid()` framing (which would require `createClient()` from `server.ts` + a session-bound caller). The codebase has settled on service-role + manual host scoping.

---

## D. Typed-union audit (CHECK-constrained text columns)

**Existing exports in `src/lib/db/schema.ts`** (5 total):
```typescript
export type MessagesActorKind         = "host" | "agent" | "cleaner" | "cohost" | "system"  (line 302)
export type MemoryFactSubEntityType   = "front_door" | "lock" | "parking" | "wifi" | "hvac" | "kitchen_appliances"  (line 840)
export type MemoryFactEntityType      = "host" | "property" | "guest" | "vendor" | "booking"  (line 854)
export type MemoryFactSource          = "host_taught" | "inferred" | "observed"  (line 855)
export type MemoryFactStatus          = "active" | "superseded" | "deprecated"  (line 856)
```

**MISSING exports** (CHECK-constrained text columns on Milestone 1 tables that lack matching typed unions):
| Table | Column | Migration enum |
|---|---|---|
| `agent_audit_log` | `source` | `'frontend_api' \| 'agent_artifact' \| 'agent_tool' \| 'worker'` |
| `agent_audit_log` | `actor_kind` | `'host' \| 'agent' \| 'worker' \| 'system'` |
| `agent_audit_log` | `autonomy_level` | `'silent' \| 'confirmed' \| 'blocked'` |
| `agent_audit_log` | `outcome` | `'succeeded' \| 'failed' \| 'pending'` |
| `agent_conversations` | `status` | `'active' \| 'closed' \| 'error'` |
| `agent_turns` | `role` | `'user' \| 'assistant'` |
| `agent_artifacts` | `state` | `'emitted' \| 'confirmed' \| 'edited' \| 'dismissed'` |

This is a **CLAUDE.md convention violation** — the "CHECK-constrained text columns convention" says every CHECK-constrained text column gets a matching typed union. Milestone 1 only exported the memory_facts + messages unions; the agent_* table unions weren't shipped.

**Recommendation for Milestone 2**: add the 7 missing exports to `src/lib/db/schema.ts` as part of this milestone's `schema.ts` touch (it's the canonical place for them; we'll need them anyway for the action substrate's typed inputs and the audit-writer's typed payload). This is technically widening Milestone 2's scope by ~7 lines of `export type` declarations + 1 `npx tsc --noEmit` re-verification, but it's load-bearing for the substrate's input/output types.

*Decision needed*: include the 7 typed-union exports in Milestone 2, or treat as separate cleanup?

---

## E. Schema-vs-design discrepancies (significant — affects the implementation contract)

The Milestone 1 migrations diverged from the design doc in several places. The migrations are **locked**; the design doc is reference. Implementation must use migration values:

| Concern | Design doc says | Migration shipped | Resolution |
|---|---|---|---|
| `memory_facts` sub-entity narrowing column name | `sub_entity_handle` (text, free-form) | `sub_entity_id` (text) + `sub_entity_type` (CHECK to 6 canonical) | Use migration: `sub_entity_id` + controlled-vocab `sub_entity_type` |
| `memory_facts.status` enum | `'active' \| 'superseded' \| 'archived'` | `'active' \| 'superseded' \| 'deprecated'` | Use migration: `'deprecated'` |
| `agent_audit_log.actor_id` nullability | `NOT NULL` | nullable | Use migration: nullable |
| `agent_audit_log.source` enum | `'agent_chat' \| 'agent_artifact' \| 'api_route' \| 'worker'` | `'frontend_api' \| 'agent_artifact' \| 'agent_tool' \| 'worker'` | Use migration |
| `agent_audit_log.autonomy_level` enum | `'host_initiated' \| 'host_confirmed' \| 'agent_autonomous'` | `'silent' \| 'confirmed' \| 'blocked'` | Use migration |
| `agent_audit_log.outcome` enum | `'success' \| 'tool_error' \| 'gate_blocked' \| 'host_dismissed' \| 'cancelled'` | `'succeeded' \| 'failed' \| 'pending'` | Use migration |
| `host_action_patterns` table | Designed in §7.3 | **NOT in any Milestone 1 migration** | **Out of scope for Milestone 2.** Substrate writes only to `agent_audit_log`. Future milestone authors `host_action_patterns` if/when calibration logic is added. |
| `actor_kind` enum on `messages` | `'host' \| 'cohost' \| 'va' \| 'agent' \| 'channex_system'` | `'host' \| 'agent' \| 'cleaner' \| 'cohost' \| 'system'` | Use migration. NB: `'va'` and `'channex_system'` were removed; `'cleaner'` was added. |

The user's Phase 2 prompt aligns with the migration's enums (it says `'allow' \| 'block' \| 'require_confirmation'` for `mode`, and refers to `autonomy_level='confirmed'` / `'silent'` / `'blocked'` which match the migration). So the user's spec already implicitly chose the migration values over the design doc.

*No decision needed*: implementation uses migration values; design doc treated as design context, not the binding contract for these enums.

---

## F. Action type naming

**Design doc** (§7.2): `'memory.write'` (dot-separated, namespaced)
**User prompt**: `'memory_fact_write'` (snake_case)

The user's prompt explicitly names the v1 action type as `'memory_fact_write'`. Implementation will use that name. *No decision needed*; flagging only because the design doc has a different value.

---

## G. Stakes registry shape

**Design doc** (§7.2):
```typescript
{
  'memory.write': {
    stakes_class: 'low',
    reversibility: 'reversible_immediately',
    high_stakes_floor: false,
    requires_confirmation_at_v1: true,
    description: '...',
  }
}
```

**User prompt** (Phase 2): "Stakes registry: a map from action_type → stakes_class. For v1: 'memory_fact_write' → 'low'."

The user simplified to `action_type → stakes_class`. Reversibility, high_stakes_floor, requires_confirmation_at_v1, and description are not in v1's stakes registry per the user's spec. The substrate's gating logic at v1 is "stakes class + the source==='agent_artifact' bypass" — no separate `requires_confirmation_at_v1` flag.

**Recommendation**: follow the user's simpler v1 shape. Future milestones may extend the registry as the design doc envisions. *No decision needed*; flagging.

---

## H. RequestAction input/output shape (final reconciled)

Reconciling user prompt + migration enums + design doc:

```typescript
// stakes-registry.ts
export type StakesClass = 'low' | 'medium' | 'high';
export type ActionType = 'memory_fact_write';   // v1 has one entry; widens in M3+
export const stakesRegistry: Record<ActionType, StakesClass> = {
  memory_fact_write: 'low',
};

// request-action.ts
export type RequestActionMode = 'allow' | 'block' | 'require_confirmation';
export type AgentAuditLogSource = 'frontend_api' | 'agent_artifact' | 'agent_tool' | 'worker';
export type AgentAuditLogActorKind = 'host' | 'agent' | 'worker' | 'system';
export type AgentAuditLogAutonomyLevel = 'silent' | 'confirmed' | 'blocked';
export type AgentAuditLogOutcome = 'succeeded' | 'failed' | 'pending';

export interface RequestActionInput {
  host_id: string;
  action_type: ActionType;
  payload: Record<string, unknown>;
  source: AgentAuditLogSource;
  actor_id: string | null;
  context: Record<string, unknown> | null;
}

export interface RequestActionResult {
  mode: RequestActionMode;
  reason: string;
  audit_metadata: {
    audit_log_id: string;
    autonomy_level: AgentAuditLogAutonomyLevel;
    actor_kind: AgentAuditLogActorKind;
    stakes_class: StakesClass;
    created_at: string;   // ISO
  };
}
```

**Logic** (from user's Phase 2 prompt):
- If `source === 'agent_artifact'` AND `context.artifact_id` is present → `mode='allow'` with `autonomy_level='confirmed'` (the "this call IS the gate" pattern)
- Otherwise: lookup `stakes_class` for `action_type`. If `'low'` → `mode='allow'`, `autonomy_level='silent'`. If `'medium'` or `'high'` → `mode='require_confirmation'`, `autonomy_level='blocked'` (until host confirms via separate flow).
- Always insert one row into `agent_audit_log`. The `outcome` column is set per the substrate's eventual decision: `'pending'` if returning `'require_confirmation'`; `'succeeded'` if returning `'allow'` (the substrate doesn't know yet whether the eventual write will succeed; the caller updates the row's outcome after the actual write attempt — *this needs a small follow-up: should request-action take an "outcome resolver" callback or should it just write 'pending' and let the caller update?*).

**Decision needed**: simpler approach — substrate writes `'pending'` for ALL outcomes initially (since the substrate doesn't know if the eventual side-effect succeeds), and `audit-writer` exports a separate `updateAuditOutcome(audit_log_id, outcome)` helper that the writer (writeMemoryFact) calls after attempting the side-effect. Confirms or rejects this approach.

---

## I. ReadMemory input/output shape (final reconciled)

```typescript
// memory/read.ts
import type {
  MemoryFactEntityType,
  MemoryFactSubEntityType,
  MemoryFactSource,
  MemoryFactStatus,
} from "@/lib/db/schema";

export interface MemoryReadScope {
  entity_type: MemoryFactEntityType;
  entity_id: string;
  sub_entity_type?: MemoryFactSubEntityType;   // controlled vocab from migration
  sub_entity_id?: string;
  guest_id?: string;
}

export interface MemoryReadQuery {
  attribute?: string;
  freshness_threshold_days?: number;
  include_superseded?: boolean;   // default false
}

export interface MemoryFact {
  id: string;
  attribute: string;
  value: unknown;                  // jsonb
  source: MemoryFactSource;
  confidence: number;
  learned_from: Record<string, unknown>;
  learned_at: string;
  last_used_at: string | null;
  status: MemoryFactStatus;
}

export interface DataSufficiency {
  fact_count: number;
  confidence_aggregate: number | null;
  has_recent_learning: boolean;    // any fact <7d old?
  sufficiency_signal: 'rich' | 'sparse' | 'empty';
  note: string;
}

export interface MemoryReadResult {
  facts: MemoryFact[];
  data_sufficiency: DataSufficiency;
}

export async function readMemory(input: {
  host: { id: string };
  scope: MemoryReadScope;
  query: MemoryReadQuery;
}): Promise<MemoryReadResult>;
```

**Sufficiency thresholds** (proposed; design doc and BELIEF_5 don't specify exact thresholds):
- `'empty'`: `fact_count === 0`
- `'sparse'`: `1 <= fact_count <= 2`
- `'rich'`: `fact_count >= 3`
- `has_recent_learning`: any fact's `learned_at >= now() - INTERVAL '7 days'`
- `confidence_aggregate`: `avg(confidence)` for active facts, or `null` if no facts
- `note`: human-readable, e.g., `"Found 3 facts; most recent 2 days ago"` or `"No facts on file"`

*Decision needed*: confirm thresholds (1/2/3+ for sparse-vs-rich; 7-day window for "recent").

**`last_used_at` update**: per BELIEF_3 commitments, update `last_used_at` on every read of an active fact. Implementation: a single `UPDATE memory_facts SET last_used_at = now() WHERE id = ANY($1)` after the SELECT returns IDs. Keeps the read-path simple; the cost of one extra UPDATE per read is negligible at v1's scale.

---

## J. WriteMemoryFact input/output shape (final reconciled)

```typescript
// memory/write.ts
import type {
  MemoryFactEntityType,
  MemoryFactSubEntityType,
  MemoryFactSource,
} from "@/lib/db/schema";

export interface MemoryWriteFact {
  entity_type: MemoryFactEntityType;
  entity_id: string;
  sub_entity_type?: MemoryFactSubEntityType;
  sub_entity_id?: string;
  guest_id?: string;
  attribute: string;
  value: unknown;
  source: MemoryFactSource;
  confidence: number;
}

export interface MemoryWriteContext {
  conversation_id: string;
  turn_id: string;
  artifact_id: string;
  source_message_text?: string;     // optional snippet
}

export type MemoryWriteMode = 'committed' | 'blocked' | 'failed';

export interface MemoryWriteResult {
  mode: MemoryWriteMode;
  fact_id: string | null;
  reason: string;
  audit_metadata: RequestActionResult['audit_metadata'];
}

export async function writeMemoryFact(input: {
  host: { id: string };
  fact: MemoryWriteFact;
  conversation_context: MemoryWriteContext;
}): Promise<MemoryWriteResult>;
```

**`learned_from` JSONB construction**: matches BELIEF_3 §6's `pricing_rules.inferred_from` precedent. Shape:
```json
{
  "conversation_id": "...",
  "turn_id": "...",
  "artifact_id": "...",
  "source_message_text": "...",      // optional
  "learned_at_iso": "2026-..."
}
```

---

## K. Open decisions to confirm before Phase 2

1. **Module location**: confirm `src/lib/action-substrate/` + `src/lib/memory/` (matching design doc) — or override toward `src/lib/agent/`.
2. **Test script**: add `"test": "jest"` to `package.json` scripts? (1-line ergonomic change; out of strict M2 scope but useful)
3. **Service-role + host_id pattern**: confirm using `createServiceClient()` in handlers (matching codebase pattern), with route-level auth assumed by callers.
4. **Typed-union exports**: include the 7 missing CHECK-constrained text column unions in M2's schema.ts touch?
5. **Audit outcome resolution**: substrate writes `outcome='pending'` initially; `audit-writer` exports `updateAuditOutcome(audit_log_id, outcome)` for callers to invoke after the side-effect resolves?
6. **Sufficiency thresholds**: confirm `empty=0 / sparse=1-2 / rich=3+`; freshness window `7d`?

---

## L. Out-of-scope items (NOT touched by Milestone 2)

- `host_action_patterns` table (designed in §7.3, not migrated; no Milestone 2 writer)
- Tool dispatcher / `read_memory` tool registration (Milestone 3)
- Agent loop request handler (Milestone 5)
- SSE streaming protocol (Milestone 6)
- Frontend chat shell (Milestone 7)
- Artifact registry + components (Milestone 8)
- `/api/agent/artifact-action` route (Milestone 9)

---

## Sign-off

- [x] Test framework identified (Jest 30 + ts-jest)
- [x] Module-location precedents surveyed (pricing/ as analog)
- [x] Drizzle vs Supabase client pattern documented (service-role dominant)
- [x] Typed-union audit complete (5 present, 7 missing)
- [x] Schema-vs-design discrepancies enumerated
- [x] RequestAction / ReadMemory / WriteMemoryFact shapes drafted with reconciled enums
- [x] Open decisions enumerated for user confirmation
- [ ] User approval to proceed with Phases 2-4

**STOP. No code authored. Awaiting decisions on items K1-K6 and overall approval to proceed.**
