# Agent Loop v1 — Milestone 2 Report

*Executed 2026-05-02. Memory handlers + action substrate, the first behavioral layer of the agent loop. Foundation schema from Milestone 1 now has reusable read/write paths. All 80 unit tests pass; staging smoke verified end-to-end roundtrip including audit log resolution. Milestone 3 (tool dispatcher with `read_memory` as the first registered tool) wires these handlers into the agent loop's tool dispatch path.*

Cross-references:
- Conventions inventory: [`agent-loop-v1-milestone-2-conventions.md`](./agent-loop-v1-milestone-2-conventions.md) — Phase 1 deliverable; decisions locked here
- Milestone 1: [`agent-loop-v1-milestone-1-rollout-report.md`](./agent-loop-v1-milestone-1-rollout-report.md) — schema this milestone consumes
- Design doc: [`agent-loop-v1-design.md`](./agent-loop-v1-design.md) §6 (memory hooks), §7 (action substrate)
- BELIEF docs in `docs/method/` — referenced for memory shape (BELIEF_3) and confidence/sufficiency (BELIEF_5)

---

## Phase outcomes

### Phase 1 — Conventions inventory (CLEAN, STOPPED for approval)

Saved to `agent-loop-v1-milestone-2-conventions.md`. Surfaced 6 open decisions, 1 typed-union-convention compliance gap (7 missing exports), 7 schema-vs-design discrepancies. User approved all 6 decisions; Phases 2-5 proceeded against the locked decisions.

### Phase 2 — Action substrate (CLEAN, 17 tests / 3 suites)

**Modules under `src/lib/action-substrate/`:**

| File | Lines | Purpose |
|---|---:|---|
| `stakes-registry.ts` | 39 | `StakesClass`, `ActionType`, `stakesRegistry`, `getStakesClass()`. v1 has 1 entry: `memory_fact_write` → `'low'`. |
| `audit-writer.ts` | 160 | `writeAuditLog()` inserts row with `outcome='pending'` + `stakes_class` merged into context; `updateAuditOutcome()` resolves to succeeded/failed with optional `latency_ms` and `error_message`. |
| `request-action.ts` | 148 | `requestAction()` with the substrate's gating logic: agent_artifact bypass via `context.artifact_id` → `mode='allow'` / `autonomy='confirmed'`; otherwise stakes-based dispatch. Always writes one audit row. |

**Tests under `src/lib/action-substrate/tests/`:** 412 lines total across 3 suites:
- `stakes-registry.test.ts` (17 lines, 3 tests) — registry shape + lookup correctness
- `audit-writer.test.ts` (223 lines, 6 tests) — insert shape, context merge with stakes_class, error path, update outcome with latency_ms, update outcome with error_message + context merge, update error path
- `request-action.test.ts` (172 lines, 8 tests) — agent_artifact bypass (with valid id, without id, with empty id), low-stakes dispatch from each source (frontend_api / worker / agent_tool), audit row shape + outcome='pending', writeAuditLog error propagation

Mocking strategy: service-role client mocked at the module boundary via `jest.mock("@/lib/supabase/service")`. Tests don't hit a real DB.

### Phase 3 — Memory read handler (CLEAN, 14 tests / 1 suite)

**Module: `src/lib/memory/read.ts`** (223 lines)

`readMemory(input)` returns `{ facts, data_sufficiency }`. Filters by host_id (always), entity_type + entity_id (always), sub_entity_type / sub_entity_id / guest_id / attribute (optional), status (default active; `include_superseded=true` allows superseded too), `freshness_threshold_days` (gte filter on learned_at). Orders by learned_at DESC.

After the SELECT returns, the handler updates `last_used_at = now()` for the active facts in the result set — BELIEF_3 memory access tracking. Skipped when zero facts or all returned facts are superseded.

`data_sufficiency` block computed per the locked thresholds:
- `empty`: fact_count === 0
- `sparse`: fact_count 1-2
- `rich`: fact_count >= 3
- `has_recent_learning`: any fact's learned_at within 7 days
- `confidence_aggregate`: avg over returned facts; null when empty
- `note`: human-readable string composed from the above

**Tests: `src/lib/memory/tests/read.test.ts`** (339 lines, 14 tests across 6 describe-blocks):
- Empty result → sufficiency_signal='empty', confidence_aggregate=null
- Sparse vs rich (1, 2, 3 facts) → correct signals
- has_recent_learning (recent vs old fact)
- Query filters: scope, attribute, default status='active', `include_superseded` uses `in` filter, freshness_threshold_days uses gte
- last_used_at update on access (and skip when empty)
- Error propagation when SELECT returns an error

### Phase 4 — Memory write helper (CLEAN, demonstrating the canonical pattern)

**Module: `src/lib/memory/write.ts`** (183 lines)

`writeMemoryFact(input)` is the reference implementation of the request-action → INSERT → updateAuditOutcome pattern. Three steps:

1. Call `requestAction()` with `source='agent_artifact'` + `context.artifact_id`. Substrate writes the audit row with outcome='pending' and returns the audit_metadata. For v1's only action type (memory_fact_write, low-stakes), the artifact bypass kicks in and mode='allow' / autonomy_level='confirmed'.
2. INSERT into memory_facts via service-role + explicit host_id. Row carries Tier 1 metadata: source, confidence, learned_from JSONB (mirrors `pricing_rules.inferred_from` per BELIEF_3 §6).
3. Resolve the audit outcome via `updateAuditOutcome()` — `'succeeded'` with `latency_ms` if INSERT succeeded; `'failed'` with `error_message: 'insert_failed: ...'` otherwise. If the substrate returned `mode != 'allow'` (block path), resolve to `'failed'` with `error_message: 'gate_blocked: ...'` and skip the INSERT entirely.

Returns `{ mode, fact_id, reason, audit_metadata }` where `mode` is `'committed'` / `'blocked'` / `'failed'`.

**Tests: `src/lib/memory/tests/write.test.ts`** (202 lines, 5 tests across 3 describe-blocks):
- Happy path: substrate consulted with right shape, INSERT row has right Tier 1 metadata + provenance JSONB, audit resolved to 'succeeded' with latency_ms
- Optional fields default to null in the row + provenance JSONB (no source_message_text)
- Blocked path: substrate returns 'require_confirmation' → mode='blocked', no INSERT, audit resolved to 'failed' with `gate_blocked` error_message
- Failed insert path: INSERT errors → mode='failed', audit resolved to 'failed' with `insert_failed` error_message

### Phase 5 — Verification + smoke (CLEAN)

**Schema.ts touch:**
7 typed unions added per Milestone 2 decision #4. tsc clean before and after. Each union matches its migration's CHECK constraint exactly.

```typescript
export type AgentAuditLogSource         = "frontend_api" | "agent_artifact" | "agent_tool" | "worker";
export type AgentAuditLogActorKind      = "host" | "agent" | "worker" | "system";
export type AgentAuditLogAutonomyLevel  = "silent" | "confirmed" | "blocked";
export type AgentAuditLogOutcome        = "succeeded" | "failed" | "pending";
export type AgentConversationStatus     = "active" | "closed" | "error";
export type AgentTurnRole               = "user" | "assistant";
export type AgentArtifactState          = "emitted" | "confirmed" | "edited" | "dismissed";
```

**`package.json` touch:**
Added `"test": "jest"` to `scripts`. Decision #2.

**Final test suite:**

```
$ npx tsc --noEmit
(exit 0)

$ npm test
Test Suites: 1 skipped, 8 passed, 8 of 9 total
Tests:       1 skipped, 80 passed, 81 total
Time:        15.11 s
```

The 1 skipped suite is the staging-smoke test (gated by `RUN_STAGING_SMOKE=1`). 80 unit tests + the gated smoke = 81 total.

**Staging smoke (gated, executed via wrapper):**

```bash
set -a; source .env.staging; set +a
# Pre-condition: insert test user + property + apply DRIFT-3 grants transactionally
psql "$DATABASE_URL" <<SQL ... SQL
RUN_STAGING_SMOKE=1 npx jest src/lib/memory/tests/staging-smoke.test.ts
# Cleanup: REVOKE grants + DELETE test rows
```

Smoke result:
```
PASS src/lib/memory/tests/staging-smoke.test.ts
  staging smoke
    ✓ end-to-end: write → read → audit row at 'succeeded' (8.3s)
```

End-to-end verification:
- `writeMemoryFact` returned `mode='committed'`, `fact_id` populated
- `readMemory` found exactly 1 fact with full provenance roundtrip:
  - attribute, value, source='host_taught', confidence≈0.95, status='active'
  - `learned_from`: conversation_id, turn_id, artifact_id, source_message_text, learned_at_iso all match
  - data_sufficiency: fact_count=1, sufficiency_signal='sparse', has_recent_learning=true
- audit_log row queried directly: outcome='succeeded', autonomy_level='confirmed', actor_kind='agent', source='agent_artifact', latency_ms is a number, context.stakes_class='low'
- Cleanup verified: 0 remaining smoke users / properties / facts / audits

---

## Architectural decisions made during authoring

### D1 — Audit row at `outcome='pending'` initially; caller resolves via separate helper

The substrate doesn't know whether the eventual side-effect succeeds. Two-step pattern:
1. `requestAction()` writes the audit row with `outcome='pending'` regardless of mode
2. Caller (e.g., `writeMemoryFact`) calls `updateAuditOutcome(audit_log_id, 'succeeded'|'failed', { latency_ms, error_message })` after the side-effect resolves

**Why this shape**: Keeps the substrate's concern (gating + audit insertion) separate from the side-effect's concern (executing the action + measuring latency). Callers explicitly resolve outcomes — there's no implicit "did the substrate succeed" coupling.

**Trade-off**: Callers must call `updateAuditOutcome` after the side-effect. If a caller forgets, the audit row sits at 'pending' forever — diagnosable via a query (`outcome='pending' AND created_at < now() - interval '5 minutes'`). v1 doesn't ship that diagnostic; defer to observability in a later milestone.

### D2 — `stakes_class` written into `agent_audit_log.context.stakes_class`

The audit log row has dedicated columns for `actor_kind`, `autonomy_level`, `outcome`, etc. but no `stakes_class` column (the migration didn't add one). To preserve the stakes information in the audit feed without a schema change, the substrate writes `stakes_class` as a JSONB field on `context`.

**Why this shape**: Avoids a schema change. The audit feed's `context` column is meant for free-form metadata anyway. Future queries can extract via `context->>'stakes_class'`.

**Trade-off**: Querying by stakes_class requires a JSONB index for performance; v1 doesn't have it (no query path uses it yet). Add when query patterns surface.

### D3 — `agent_artifact` bypass requires both `source='agent_artifact'` AND a non-empty `context.artifact_id`

Both conditions must hold for the bypass. Without the artifact_id, the substrate falls through to the stakes-based logic (which for memory_fact_write means `mode='allow'` with `autonomy_level='silent'` — different from the bypass's `'confirmed'`).

**Why this shape**: The artifact_id is the load-bearing evidence that "the host clicked confirm on the artifact UI." Without an artifact_id, the action's path through agent_artifact is meaningless (there's nothing the host actually confirmed). Treating it as a fall-through means an upstream caller that mis-emits `source='agent_artifact'` without context still gets a sane default behavior, not a silent privilege grant.

### D4 — `actor_kind` derived from `source`, not passed in

The substrate maps source → actor_kind:
- `frontend_api` → `'host'` (route is acting on behalf of the host)
- `agent_artifact` / `agent_tool` → `'agent'`
- `worker` → `'worker'`

**Why this shape**: Reduces caller surface area (one less parameter to get wrong). The mapping is a property of the substrate's contract, not the caller's choice. If a future scenario needs to override (e.g., a route inserting on behalf of a system worker), the mapping function (`actorKindForSource`) becomes a configurable point — but v1 doesn't need that.

### D5 — Transactional GRANT/REVOKE bracket for staging smoke

Staging is missing the production-level `service_role` grants (DRIFT-3 from Milestone 1). The smoke test wrapper applies the grants with `GRANT USAGE ON SCHEMA public + GRANT SELECT/INSERT/UPDATE/DELETE ON ALL TABLES` to the three Supabase roles, runs the smoke, then `REVOKE`s. Same pattern Milestone 1 Phase 2 RLS testing used. Staging's DRIFT-3 state is unchanged after the smoke.

**Why this shape**: Honors the "don't fix DRIFT-3 in this session" constraint while still enabling end-to-end verification. The grants are session-local; staging's permanent state matches what it was before the smoke.

**Trade-off**: Future smoke-style tests need the same wrapper. A permanent fix to DRIFT-3 (a recovery migration applying these grants symmetrically) makes future staging tests work without the bracket. Out of scope for Milestone 2 per user constraint.

---

## Files added (11) + modified (2)

### Added — `src/lib/action-substrate/`
- `stakes-registry.ts` (39 lines)
- `audit-writer.ts` (160 lines)
- `request-action.ts` (148 lines)
- `tests/stakes-registry.test.ts` (17 lines)
- `tests/audit-writer.test.ts` (223 lines)
- `tests/request-action.test.ts` (172 lines)

### Added — `src/lib/memory/`
- `read.ts` (223 lines)
- `write.ts` (183 lines)
- `tests/read.test.ts` (339 lines)
- `tests/write.test.ts` (202 lines)
- `tests/staging-smoke.test.ts` (122 lines, gated by `RUN_STAGING_SMOKE=1`)

### Added — `docs/architecture/`
- `agent-loop-v1-milestone-2-conventions.md` (Phase 1 deliverable, ~280 lines)
- `agent-loop-v1-milestone-2-report.md` (this file)

### Modified
- `src/lib/db/schema.ts` (+30 lines: 7 typed-union exports)
- `package.json` (+1 line: `"test": "jest"` script)

**Locked / unchanged**: all 4 Milestone 1 migration files; the design document (the design-vs-migration reconciliation is a separate task).

---

## Test counts

| Suite | Tests | Lines |
|---|---:|---:|
| `stakes-registry.test.ts` | 3 | 17 |
| `audit-writer.test.ts` | 6 | 223 |
| `request-action.test.ts` | 8 | 172 |
| `read.test.ts` | 14 | 339 |
| `write.test.ts` | 5 | 202 |
| `staging-smoke.test.ts` | 1 (gated) | 122 |
| **Total Milestone 2** | **37 (36 unit + 1 smoke)** | **1,075** |
| Pre-existing tests still passing | 44 | — |
| **Grand total in suite** | **80 unit + 1 gated smoke = 81** | — |

---

## Open carry-forwards for Milestone 3

1. **Tool dispatcher with `read_memory` as the first registered tool** (the headline Milestone 3 deliverable per design doc §4.2).
2. **DRIFT-3 fix** — staging missing service_role grants. Smoke test currently uses transactional GRANT/REVOKE bracket. Permanent fix is a recovery migration applying these grants symmetrically. Suggested filename: `20260502100000_recovery_supabase_role_grants.sql`. Tracked in CLAUDE.md as a known fidelity gap; address in next staging-arc session.
3. **Audit-row aging diagnostic** — query for `agent_audit_log` rows stuck at `outcome='pending'` (caller forgot to call `updateAuditOutcome`). Worth wiring into observability when there's enough live traffic for the pattern to matter.
4. **Stakes-class JSONB indexing** — `agent_audit_log.context->>'stakes_class'` is unindexed; add a partial index when query patterns demand it.
5. **`stakes_class` as a first-class column** (vs. JSONB nesting) — would require a schema change. Defer until query patterns demand it.
6. **Pre-activation gate for messaging_executor** — when the executor begins firing in production, every new message INSERT path needs to set `actor_kind='agent'` (not rely on Milestone 1's one-time back-population). Already documented in CLAUDE.md per Milestone 1 carry-forwards.
7. **`messages_pre_milestone1_snapshot` drop** — ≥2026-05-09 per Milestone 1 test plan §A4. Already documented in CLAUDE.md.

---

## Sign-off

- [x] Phase 1 conventions inventory complete; 6 decisions approved
- [x] Phase 2 action substrate authored (3 modules, 17 tests, all pass)
- [x] Phase 3 memory read handler authored (1 module, 14 tests, all pass)
- [x] Phase 4 memory write helper authored — demonstrates request-action → INSERT → updateAuditOutcome pattern (1 module, 5 tests, all pass)
- [x] Phase 5 verification clean: tsc 0, npm test 80/80 unit + 1 gated smoke pass, staging smoke verified end-to-end roundtrip with audit resolution
- [x] 7 typed-union exports added to schema.ts; tsc clean
- [x] `"test": "jest"` script added to package.json
- [x] Migration files unchanged
- [x] Design document unchanged
- [x] Production data untouched
- [x] No new dependencies introduced

After this session: Milestone 2 is complete. The substrate + memory handlers exist with isolated tests and verified roundtrip against staging. Milestone 3 (tool dispatcher with `read_memory` as the first registered tool) wires the read handler into the agent loop's tool dispatch path.
