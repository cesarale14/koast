# Agent Loop v1 — Milestone 6 Report

*Executed 2026-05-04. The first gated write end-to-end. M6 ships `write_memory_fact` — the first tool that proposes a memory write under stake, gates through the M2 substrate, renders an inline MemoryArtifact for host approval, and (on Save) commits a row to `memory_facts` with full supersession-cascade support across both the artifact lifecycle layer (`agent_artifacts.state`) and the persisted-data layer (`memory_facts.superseded_by` + `status`). Staging smoke validated the full propose-then-approve-then-correct round-trip in production: host proposed front-door code 4827 → approved → saved; host corrected to 4828 → agent called read_memory FIRST per D27, proposed with `supersedes_memory_fact_id` populated → approved → memory_facts row 4827 cascaded to status='superseded' with superseded_by=<4828 id>; recall test returned only the 4828 fact. The M2-M5 substrate fired end-to-end for a gated write for the first time.*

Cross-references:
- Conventions inventory: [`agent-loop-v1-milestone-6-conventions.md`](./agent-loop-v1-milestone-6-conventions.md)
- Predecessors: M1 schema · M2 substrate + memory handlers · M3 dispatcher + read_memory · M4 agent loop server · M5 chat shell + SSE consumption + ui_context plumbing
- Design doc: §3.2 (SSE event union) · §4 (tool dispatch) · §7 (action substrate)

---

## 1. Summary

M6 is the load-bearing milestone for everything M7+ will build on. Three architectural decisions ride together:

- **D35 dispatcher fork**: the M2 substrate's `requestAction` returns three modes (`allow`, `block`, `require_confirmation`), but the M3 dispatcher conflated the latter two as failure (typed `ToolError`). M6 splits the branch — `'blocked'` preserves verbatim ToolError + audit→failed; `'require_confirmation'` becomes constructive success: the audit row stays `'pending'`, a paired `agent_artifacts` row is written via the new shared `artifact-writer.ts` substrate module, and the tool's `buildProposalOutput` synthesizes a model-facing tool result. read_memory's dispatch path (`requiresGate=false`) is structurally insulated from the fork — zero regression risk.
- **D21/D25 lifecycle/accountability separation**: artifacts live on `agent_artifacts` (state machine `emitted | confirmed | edited | dismissed | superseded`); audit rows live on `agent_audit_log` (execution-outcome enum `succeeded | failed | pending`, untouched). The two tables pair via the new FK `agent_artifacts.audit_log_id → agent_audit_log(id)`. Phase 1 STOP twice corrected the original conventions draft: the first revision rejected "audit_log only" persistence in favor of the existing `agent_artifacts` table; the second revision rejected adding `'superseded'` to `agent_audit_log.outcome` — supersession is lifecycle, audit log keeps execution semantics.
- **D36 dual-tracked supersession**: the cascade runs on two tracks — substrate-authoritative (`agent_artifacts.state` flips at write time, `memory_facts.status` flips at post-approval handler time) and reducer-optimistic (chat shell mirrors the cascade in-memory for snappy UX). Edge case: substrate cascade is non-fatal-skipped on rare failures; new artifact stays canonical; page refresh resolves any divergence.

Scope expanded once during smoke. The first attempt failed with `[artifact-writer] Failed to insert artifact: invalid input syntax for type uuid: ""` — the loop hardcoded `turn_id: ""` in the dispatcher's ToolHandlerContext at line 445 because the assistant turn wasn't persisted until post-loop (line 558). M3-M5 had nothing FK'ing on `context.turn_id`; M6 introduced the first FK consumer (`agent_artifacts.turn_id NOT NULL`) and exposed the gap. **Option A** (locked post-divergence): split `persistTurn` into `insertTurn` (stub at start) + `finalizeTurn` (UPDATE post-dispatch). Race-protected by the pre-existing unique index on `(conversation_id, turn_index)`. Stub turns persist on SDK errors per A1 — `loadTurnsForConversation` filters them out of UI scrollback, leaves them queryable in DB for diagnosis.

Scope expanded again during recall validation (CP4 F-1 failure). The strengthened **CASE 4** prompt section drove the agent to call `read_memory` first and use `supersedes_memory_fact_id` correctly on the second smoke pass. M6 ships with system-prompt-level guarantees only; substrate enforcement of D27 is captured as CF #30 for a future polish milestone.

---

## 2. Added

### Action substrate — `src/lib/action-substrate/`

| File | Lines | Purpose |
|---|---:|---|
| `artifact-writer.ts` | 163 | Shared substrate module — `writeArtifact()` (INSERT new agent_artifacts row + best-effort cascade prior to state='superseded') + `updateArtifactState()` (UPDATE state with committed_at + commit_metadata). PE — every future gated tool routes through this. |
| `handlers/write-memory-fact.ts` | 170 | Post-approval handler. assertHostOwnsProperty via `properties.user_id`, INSERT new memory_facts via M2's writeMemoryFact (substrate bypass), optional UPDATE of prior memory_facts row when `supersedes_memory_fact_id` is set (status='superseded' + superseded_by=<new id>). Non-fatal on cascade failure. |
| `tests/artifact-writer.test.ts` | 197 | 9 tests — insert shape, supersession cascade fires, cascade failure non-fatal, error propagation, updateArtifactState happy + edge cases. |
| `handlers/tests/write-memory-fact.test.ts` | 231 | 7 tests — happy path (writeMemoryFact wired), ownership rejection (different user_id), property-not-found, supersession cascade, non-fatal cascade failure, write-failure propagation (mode='blocked' / mode='failed'). |

### Agent loop — `src/lib/agent/`

| File | Lines | Purpose |
|---|---:|---|
| `error-classifier.ts` | 122 | Classifies thrown errors into the M6 D28 taxonomy: validation \| authorization \| constraint \| conflict \| transient \| unknown. Postgres-code precedence (23505→conflict, 23502/23503/23514→constraint, 08*→transient) over message-pattern matching. |
| `tools/write-memory-fact.ts` | 160 | The M6 write tool. requiresGate=true, stakesClass='medium', artifactKind='property_knowledge_confirmation'. `buildProposalOutput` synthesizes `{ artifact_id, audit_log_id, outcome:'pending', message }` for the model. Handler is a guard that throws — D35 fork bypasses it; post-approval lives in action-substrate/handlers. |
| `tools/tests/write-memory-fact.test.ts` | 161 | 13 tests — declaration shape, input schema validation (UUIDs, vocabulary, supersedes uuid, citation), buildProposalOutput synthesis, outputSchema match, handler-as-guard. |
| `tests/error-classifier.test.ts` | 109 | 16 tests — Postgres codes (23505/23502/23503/23514/08*), message patterns (does-not-own, permission denied, unauthorized, validation, zod, timeout, fetch failed, ETIMEDOUT, 503), unknown fallback, code-takes-precedence-over-message. |

### Routes — `src/app/`

| File | Lines | Purpose |
|---|---:|---|
| `api/agent/artifact/route.ts` | 279 | POST /api/agent/artifact. resolveArtifact via M6.2 paired FK + ownership check + idempotency guard (state must be 'emitted' → 409 otherwise). Approve path: dispatches writeMemoryFactHandler, marks state='confirmed' + outcome='succeeded', emits memory_write_saved + done as SSE. Discard path: state='dismissed' + outcome='failed' (sentinel error_message='dismissed_by_host'), JSON ack. Error path: marks both layers failed + emits error SSE. |

### UI tests — `src/components/chat/`

| File | Lines | Purpose |
|---|---:|---|
| `tests/milestone-trigger.test.ts` | 122 | 5 tests — SSE buffer parsing (clean stream, partial buffer, malformed JSON skip), state transition timing (idle → milestone → idle over 2000ms), prefers-reduced-motion guard. |

### Migrations — `supabase/migrations/`

| File | Lines | Purpose |
|---|---:|---|
| `20260504010000_rename_memory_fact_write_action_type.sql` | 23 | M6.1 — pure data UPDATE of `agent_audit_log.action_type` from `'memory_fact_write'` to `'write_memory_fact'`. No CHECK surgery (column has no constraint). |
| `20260504020000_agent_artifacts_lifecycle_expansion.sql` | 53 | M6.2 — adds `audit_log_id uuid REFERENCES agent_audit_log(id) ON DELETE SET NULL` (paired ref) + `supersedes uuid REFERENCES agent_artifacts(id) ON DELETE SET NULL` (correction chain) + state CHECK gains `'superseded'` (alongside existing emitted/confirmed/edited/dismissed). Two partial indexes. |
| `20260504030000_add_active_property_id_to_agent_turns.sql` | 18 | M6.3 — `agent_turns.active_property_id uuid REFERENCES properties(id) ON DELETE SET NULL` + partial index. Closes M5 CF D-F2 ("All properties" fallback no longer applies once writers populate). |

### Docs

| File | Lines | Purpose |
|---|---:|---|
| `docs/architecture/agent-loop-v1-milestone-6-conventions.md` | 757 | 16 architectural decisions (D20-D35), 3-section migration block, 12 carry-forwards (20-31), Phase 1 STOP findings, dual-tracked cascade addendum, anti-patterns. |
| `docs/architecture/agent-loop-v1-milestone-6-report.md` | (this file) |

**Total new source LOC: ~2,089** (production code + tests across 14 net-new files + 3 migrations + the conventions doc).

---

## 3. Modified

### Server-side

| File | Δ Lines | Purpose |
|---|---:|---|
| `src/lib/agent/types.ts` | +41 | Tool interface: `artifactKind?: string` + `buildProposalOutput?(input, ctx, refs) => output` + `ProposalRefs` type {artifact_id, audit_log_id}. Both required when requiresGate=true (registration enforces). |
| `src/lib/agent/dispatcher.ts` | +155 | D35 fork at lines 207-246. Three independent registration gates (stakesClass + buildProposalOutput + artifactKind) for gated tools. Branch split: 'blocked' (verbatim ToolError + audit→failed) vs 'require_confirmation' (writeArtifact + buildProposalOutput + outputSchema parse + return ok=true; audit STAYS pending). PE convention docstring on the supersedes-field extraction (tools whose inputSchema declares `supersedes: string` trigger lifecycle cascade). |
| `src/lib/agent/loop.ts` | +141 | Imports classifyError. Tool-call success branches on tool name — write_memory_fact emits `memory_write_pending` alongside `tool_call_completed` (D35 fork side-channel). Tool-call failure emits `tool_call_failed` with classifyError-derived kind+retryable+latency. isProposalOutput type guard. **Option A turn_id-ordering fix**: assistant stub pre-inserted via insertTurn at start of turn → real turn_id passed through ToolHandlerContext to writeArtifact's NOT NULL FK; finalizeTurn UPDATEs the stub at end with content_text/tool_calls/refusal/tokens. active_property_id resolved once per turn and threaded through both persistTurn (user) + insertTurn (assistant). |
| `src/lib/agent/conversation.ts` | +378 | persistTurn race-protected with 23505 retry. New insertTurn + finalizeTurn (Option A). loadTurnsForConversation extends to two parallel queries (turns + agent_artifacts WHERE state IN ('emitted', 'confirmed', 'superseded'); 'dismissed' filtered server-side); stitches by turn_id. PendingArtifact type with state + commit_metadata. UITurn gains pendingArtifacts: PendingArtifact[]. Stub-turn filter on assistant rows where content_text + tool_calls + refusal are all null (per A1 cleanup-on-error). |
| `src/lib/agent/sse.ts` | +62 | AgentStreamEventSchema gains 3 events: tool_call_failed (kind enum + message + retryable + latency_ms), memory_write_pending (artifact_id + audit_log_id + proposed_payload + supersedes), memory_write_saved (artifact_id + audit_log_id + memory_fact_id + superseded_memory_fact_id). 7-event v1 → 10-event M6. |
| `src/lib/agent/system-prompt.ts` | +74 | M6 surface taught: write_memory_fact tool docs, supersedes vs supersedes_memory_fact_id field-distinction prose, dedicated `# CASE 4 — HOST CORRECTS AN EXISTING FACT` section with mandatory 3-step sequence (read_memory FIRST + INSPECT findings + choose field by case 2a/2b + NEVER both), 5-cases enumeration with 5b out-of-scope, citation requirement (5a + 5c), conservatism + when-uncertain-ask. |
| `src/lib/action-substrate/stakes-registry.ts` | +21 | Seed entry rename `memory_fact_write` → `write_memory_fact` + raise to `'medium'` (D35). _resetStakesRegistryForTests mirrors. |
| `src/lib/memory/write.ts` | +2 | M2 frontend write path: action_type rename. Bypass keeps mode='allow' regardless of stakes raise. |

### Client-side

| File | Δ Lines | Purpose |
|---|---:|---|
| `src/lib/agent-client/types.ts` | +165 | AgentStreamEventSchema mirrors server's 3 new events. `tool_call_failed` / `memory_write_pending` / `memory_write_saved` promoted from `// TODO M6/M7` to active schema (action_proposed stays type-only — M7 forcing function). ContentBlock 'tool' status union gains 'failed' + optional error block. New 'memory_artifact' ContentBlock (artifact_id + audit_log_id + state union {pending,saved,superseded,failed} + payload + memory_fact_id + superseded_by_artifact_id + error). |
| `src/lib/agent-client/turnReducer.ts` | +155 | Three new switch cases (D-FORWARD-EVENTS resolution): tool_call_failed (mutateToolFailed: in-flight tool block → status='failed' with structured error + duration), memory_write_pending (appendMemoryArtifactPending: new memory_artifact block in state='pending' + supersession-cascade marks prior matching block state='superseded' + superseded_by_artifact_id), memory_write_saved (mutateMemoryArtifactSaved: matching pending block → state='saved' + memory_fact_id; defensive synthetic-block on out-of-order). Default branch's `_exhaustive: never` still fails compile for action_proposed. |
| `src/components/chat/ChatClient.tsx` | +330 | Sessionharvest extracts memory_artifact ContentBlocks (Issue A fix; UITurnLite gains pendingArtifacts). handleArtifactAction: POST /api/agent/artifact, drains SSE on approve, watches for memory_write_saved → fireMilestone() (prefers-reduced-motion guard at fn entry; idle → milestone → idle over 2000ms). HistoryTurnView accepts onArtifactAction + avatarMilestone + expandedTools/onToggleToolExpanded (Issue C fix — wires the M5 ToolCall expansion already implemented). lastKoastIdx targeting so milestone fires on most-recent agent avatar only. payloadToFactSpans maps write_memory_fact payload to MemoryArtifact's FactSpan key/val rendering. |
| `src/components/chat/MemoryArtifact.tsx` | +65 | State union: 'pending' \| 'saved' \| 'superseded' \| 'failed'. New eyebrow text per state. Saved: check pill + layers. Superseded: dim italic notice. Failed: error message + Try-again button (Issue B anti-pattern flip side: host-driven retry). |
| `src/components/chat/KoastMark.tsx` | +39 | .ghost SVG group (incoming deposit band, y=-18 starting position) + .stack wrapper around 5 existing bands. Existing globals.css k-milestone-* keyframes now have target groups; data-state='milestone' fires the deposit. Closes M5 CF15. |

### Tests

| File | Δ Lines | Purpose |
|---|---:|---|
| `src/lib/agent/tests/dispatcher.test.ts` | +274 | 5 new D35 tests + adapt 3 existing — registration enforcement (buildProposalOutput / artifactKind missing → throws); mode='block' (verbatim ToolError + audit→failed, untouched from M3); mode='require_confirmation' D35 fork (writeArtifact called, audit STAYS pending verified by negative assertion, buildProposalOutput called with refs, ok=true); supersedes propagation; writeArtifact-throws → audit→failed; bad-proposal-output → audit→failed. |
| `src/lib/agent-client/tests/turnReducer.test.ts` | +155 | 7 new tests for the M6 promotions: tool_call_failed normal + orphan, memory_write_pending normal + supersession cascade, memory_write_saved normal + orphan synthetic block. |
| `src/lib/agent/tests/conversation.test.ts` | +124 | 6 new tests: insertTurn stub shape + 23505 retry + error propagation; finalizeTurn happy + partial-fields + error propagation. |
| `src/lib/agent/tests/loop.test.ts` | +74 | 4 existing tests adapted — user turn → persistTurn(×1), assistant → insertTurn(×1) + finalizeTurn(×1). SDK-error path: insertTurn fires, finalizeTurn does NOT (stub remains alive). |
| `src/lib/agent/tests/system-prompt.test.ts` | +71 | 5 new tests: M6 tool docs, 5 cases with 5b out-of-scope, CASE 4 dedicated section + non-negotiable language, supersedes vs supersedes_memory_fact_id field-distinction prose, citation requirement, conservatism. |
| `src/lib/action-substrate/tests/{audit-writer,request-action,stakes-registry}.test.ts` | +72 (combined) | M6.1 companion: action_type 'memory_fact_write' → 'write_memory_fact' across the test files. request-action's stakes-based tests adapted: medium stakes → mode='require_confirmation'/autonomy='blocked' (was 'allow'/'silent' for low stakes). stakes-registry assertions on seed value updated. |
| `src/lib/memory/tests/{staging-smoke,write}.test.ts` | +12 (combined) | Mirror the action_type + stakes refs from M2 tests. |

### Application + Conventions

| File | Δ Lines | Purpose |
|---|---:|---|
| `src/lib/agent/tools/index.ts` | +6 | Register writeMemoryFactTool alongside readMemoryTool. |
| `docs/architecture/agent-loop-v1-milestone-6-conventions.md` | +757 (NEW) | (covered in Added) |

**Total modified LOC: 25 files, ~2,117 insertions / 306 deletions** (per `git diff --stat`).

---

## 4. Migrations

Three migrations, applied to staging (`aljowaggoulsswtxdtmf`) first then production (`wxxpbgbfebpkvsxhpphb`). koast_migration_history rows recorded in both with sha256 checksums.

| File | Staging | Production |
|---|---|---|
| `20260504010000_rename_memory_fact_write_action_type.sql` | 2026-05-04 03:32 (UPDATE 0; empty staging) | 2026-05-04 03:38 (UPDATE 0; prod had no `memory_fact_write` rows — only 5 `read_memory` from M3 testing) |
| `20260504020000_agent_artifacts_lifecycle_expansion.sql` | 2026-05-04 03:32 (4 ALTER + 2 CREATE INDEX) | 2026-05-04 03:38 (same) |
| `20260504030000_add_active_property_id_to_agent_turns.sql` | 2026-05-04 03:32 (ALTER + CREATE INDEX) | 2026-05-04 03:38 (same) |

The originally-drafted M6.4 (`memory_facts.supersedes`) and M6.5 (separated outcome enum + supersedes) are dropped — Phase 1 STOP confirmed both were misreads of the existing schema.

RLS verification: all three target tables (agent_audit_log, agent_artifacts, agent_turns) already have RLS enabled from M1. ALTER TABLE doesn't disturb that. No new ENABLE ROW LEVEL SECURITY needed.

---

## 5. Architectural decisions

15 decisions in conventions §12 (D20-D34) plus three locked during/post Phase 1 STOP and the divergence resolutions:

- **D20** action_type rename (PE) — verb_noun convention.
- **D21** Artifact persistence in `agent_artifacts` (lifecycle); `agent_audit_log` retains execution-accountability role; explicit `audit_log_id` FK pairing (PE; revised twice post-Phase-1-STOP).
- **D22** Turn-bound artifact rendering (PE).
- **D23** Refresh + reopen reload from server (PE).
- **D24** No TTL on pending artifacts (PE).
- **D25** Supersession at the lifecycle layer; `agent_audit_log.outcome` UNCHANGED (PE; revised twice post-Phase-1-STOP).
- **D26** Agent proposes on cases 1-5 with case-specific rules and citation requirement (PE partial / M6 partial).
- **D27** Pre-write read_memory call (PE).
- **D28** Granular tool_call_failed event with structured taxonomy (PE).
- **D29** Three M6 migrations (mixed; revised twice post-Phase-1-STOP).
- **D30** Dedicated /api/agent/artifact endpoint with action-in-body (PE).
- **D31** File structure: dual-location pattern for tools and handlers (PE).
- **D32** Error classifier as own module (PE).
- **D33** KoastMark milestone visual completion (M6).
- **D34** System prompt update for write_memory_fact (M6).
- **D35** Dispatcher fork; stakes class for write_memory_fact raised to `'medium'`; `buildProposalOutput` interface extension (PE; locked at Divergence C resolution).
- **D36** Dual-tracked supersession cascade — substrate authoritative + reducer optimistic (PE; addendum to D25).
- **D37** Substrate require_confirmation for medium stakes (PE; verified live via request-action test at line 82 + dispatcher test on the constructive-success path).

---

## 6. Phase 1 STOP findings

Two rounds of correction.

### Round 1 — initial divergences

- **Divergence A** — `agent_artifacts` table already exists from M1 (`20260501020000_agent_loop_tables.sql`) with state machine emitted/confirmed/edited/dismissed. The originally-drafted "audit_log only" persistence was a misread; lifecycle goes on `agent_artifacts`. Conventions doc D21 revised.
- **Divergence B** — `memory_facts.superseded_by` (uuid → memory_facts.id) + status enum already exist from M1 (`20260501010000_guests_and_memory_facts.sql`). The originally-drafted M6.4 (`memory_facts.supersedes`) is dropped as redundant. M6 reuses existing columns.
- **Divergence C** — Dispatcher fork shape locked as Option C1 (substrate gates remain authoritative; dispatcher treats `'require_confirmation'` as constructive success rather than typed failure). C2 (per-handler proposal-write duplication) rejected — "doesn't survive the second gated tool" — because every future gated tool would re-implement the proposal dance. Stakes class for write_memory_fact raised from `'low'` to `'medium'`.
- **Divergence D** — Conventions doc placed in repo, then revised TWICE as the first authoring action (per Cesar's operational sequence): once for the initial corrections (D21/D25/D29/§17/+D35), once for the lifecycle/accountability separation reclarification.

### Round 2 — lifecycle/accountability separation

The first revision still left audit log carrying lifecycle role. Reading M1 schema directly confirmed:
- `agent_audit_log.action_type` has NO CHECK constraint (column is plain `text NOT NULL`). M6.1 = data UPDATE only.
- `agent_audit_log.outcome` enum is `('succeeded', 'failed', 'pending')` — execution outcome, not lifecycle. Adding `'superseded'` would conflate accountability with lifecycle.
- `agent_artifacts.state` enum is `('emitted', 'confirmed', 'edited', 'dismissed')` — THIS is where `'superseded'` belongs.
- No FK column linking the two tables; only `agent_audit_log.context.artifact_id` JSONB convention from M2's bypass code.

Resolution: M6.2 adds `audit_log_id` FK on `agent_artifacts` (canonical primary linkage going forward), `supersedes` self-FK at the lifecycle layer, `state` CHECK gains `'superseded'`. `agent_audit_log.outcome` left intact.

### Round 3 — turn_id-ordering bug surfaced at smoke

The first staging smoke failed with `[artifact-writer] Failed to insert artifact: invalid input syntax for type uuid: ""`. Traced to loop.ts:445 — assistant turn isn't persisted until line 558 (post-loop), so dispatcher receives `turn_id: ""` placeholder. Worked through M3-M5 because nothing FK'd on `context.turn_id` in JSONB; M6's `agent_artifacts.turn_id NOT NULL` introduced the first FK consumer.

Resolution: **Option A** (locked post-divergence). Split `persistTurn` into `insertTurn` (stub at start; race-protected by pre-existing unique index on `(conversation_id, turn_index)` with 23505 retry loop) + `finalizeTurn` (UPDATE post-dispatch). Stub turns persist on SDK errors per A1 — `loadTurnsForConversation` filters them out of UI scrollback, leaves them queryable for diagnosis. Phase 1 STOP confirmed the unique constraint already existed in production schema (no M6.4 migration needed).

### Round 4 — agent supersedes-field selection error at recall validation

CP4 F-1 surfaced the agent skipping read_memory and using `supersedes` (artifact-id) instead of `supersedes_memory_fact_id` (memory_fact_id) for what was actually a saved-fact correction. The dispatcher's lifecycle cascade fired correctly on the artifact-id, but the post-approval handler's memory_facts cascade depends on `supersedes_memory_fact_id` — would have left two `'active'` memory_facts.

Resolution: strengthened CASE 4 system-prompt section with a 3-step mandatory sequence + field-distinction prose at the top of the tool docs. Cache invalidation cost on next turn acknowledged. Re-smoke validated: agent called read_memory FIRST, used `supersedes_memory_fact_id` correctly, cascade landed at both layers. CF #30 captures substrate-architectural enforcement of D27 as future polish.

---

## 7. Staging smoke

Production DB throughout — `wxxpbgbfebpkvsxhpphb`. Dev server on the VPS bound to *:3000, M6 + Option A code. Cesar drove the browser; Claude Code captured DB + server log state.

### Pre-smoke baseline

- Properties: Villa Jamaica `bfb0750e-9ae9-4ef4-a7de-988062f6a0ad` + Cozy Loft `57b350de-e0c7-4825-8064-b58a6ec053fb`, both owned by user_id `312f9366-dbb4-49e2-8b89-48286fb93b3b`.
- memory_facts: 0 rows total (M6 is the first writer in production).
- agent_artifacts: 0 rows total.
- agent_audit_log: 5 rows, all `read_memory` outcome='succeeded' from M3 testing.
- agent_turns.active_property_id: 24 rows, all NULL (legacy; M5 CF D-F2).

### Smoke sequence

**T0 — propose 4827 (CP4-A).** Conversation `4de20a49-edf5-4f14-a2a9-f27fb2f43cc4`. Prompt: "Remember that the front door code at this property is 4827, valid through end of summer."
- Server log: `[dispatcher] Tool 'read_memory' succeeded in 236ms.` then `[dispatcher] Tool 'write_memory_fact' gated to require_confirmation; artifact a1c6f85f-2454-431a-89a0-489d612f1625 emitted in 116ms.`
- POST /api/agent/turn 200 in 29,211 ms. **D35 fork's first production firing.**
- agent_artifacts row written: state='emitted', turn_id=`5f6a027a-…` (real UUID), audit_log_id=`c8d619bc-…` (paired FK), payload includes citation.source_text quoting host's words.
- agent_audit_log row written: outcome='pending' (NOT 'failed' — D35 keeps it pending).
- Token counts: input 542, output 80, cache_read 3,501. Computed cost ~$0.00388/turn (above $0.0018 baseline due to 2-tool turn + system-prompt cache miss; cache-warm subsequent turns will trend toward baseline).
- active_property_id populated on user + assistant turns (Villa Jamaica id) — M5 CF D-F2 closure verified live.

**T1 — Save click (CP4-B/C/D).** POST /api/agent/artifact 200 in 3,983 ms (2.5s of which was first-compile).
- memory_facts: NEW row `5352ff2a-c117-496a-a824-4f2467d5a89a` written. status='active', source='host_taught', value='4827'.
- agent_artifacts: state flipped to 'confirmed', commit_metadata={memory_fact_id: 5352ff2a-…, superseded_memory_fact_id: null}.
- agent_audit_log: outcome flipped to 'succeeded', latency_ms=493.
- SSE response: `memory_write_saved` event with full payload + `done`. Reducer/milestone fired. Cesar visually confirmed MemoryArtifact transitioned to "MEMORY · SETTLED" with check pill.

**T2 — first correction attempt (failed; bug surfaced).** Prompt: "Actually it's 4828, not 4827."
- Agent SKIPPED read_memory (D27 violation). Proposed write_memory_fact with `supersedes='a1c6f85f-…'` (the prior artifact-id) instead of `supersedes_memory_fact_id='5352ff2a-…'` (the prior memory_fact_id).
- Substrate cascade fired correctly on the wrong layer: agent_artifacts a1c6f85f-… state flipped to 'superseded'. But on Save the post-approval handler would only INSERT new memory_facts row; would not mark 4827 as superseded. Two `'active'` rows would result.

**T3 — fix pass.** Issues A (render harvest), B (system prompt CASE 4 + field-distinction), C (ToolCall expansion wiring), D (CF #30) landed. tsc clean, 279/282 tests passing. Dev server restarted.

**T4 — supersession smoke (CP4 F-1b).** Fresh conversation `c4234d4a-7958-47d4-9152-3083dd8ef55b`. Prompt: "Actually it's 4828, not 4827."
- Server log: `[dispatcher] Tool 'read_memory' succeeded in 567ms.` then `[dispatcher] Tool 'write_memory_fact' gated to require_confirmation; artifact fa2b10fb-5201-435b-ac02-09b0826c7eb6 emitted in 253ms.` — read_memory dispatched FIRST per D27.
- write_memory_fact tool_calls payload: `supersedes_memory_fact_id="5352ff2a-c117-496a-a824-4f2467d5a89a"` (the saved 4827 fact's UUID), `supersedes` ABSENT. Strengthened CASE 4 prompt validated.
- agent_artifacts row written with state='emitted', supersedes=null (artifact-layer not used for saved-fact correction), payload includes supersedes_memory_fact_id.

**T5 — Save the correction (CP4 F-2 cascade).** POST /api/agent/artifact 200 in 10,957 ms.
- memory_facts cascade landed:
  - `5352ff2a-…` (4827) → status='superseded', superseded_by=`960afa22-7a7f-43e1-acf9-8f5e4162ccf0`
  - `960afa22-…` (4828) → status='active', superseded_by=null
- agent_artifacts `fa2b10fb-…` → state='confirmed', commit_metadata={memory_fact_id: 960afa22-…, superseded_memory_fact_id: 5352ff2a-…}.
- agent_audit_log `c91fd5a5-…` → outcome='succeeded', latency_ms=403.
- Two subsequent 409s in the log for the same audit_id — idempotency guard correctly refused re-resolution (state≠'emitted'). React strict-mode double-fire / browser network re-attempt; no data corruption.

**T6 — recall test.** Prompt: "What memory do you have about Villa Jamaica?" Agent's read_memory returned ONLY the 4828 fact (the WHERE status='active' filter excluded the superseded 4827). Response referenced 4828, did not mention 4827.

**M6 architectural validation: complete end-to-end across all 6 stages.**

---

## 8. Verification — 10 gates

| Gate | Outcome |
|---|---|
| 1. All 3 migrations applied cleanly | ✅ Staging then production, no rollbacks. CHECK constraint preservation verified (existing `state` values intact, `'superseded'` purely additive). koast_migration_history rows recorded with sha256 checksums. |
| 2. The 3 new SSE events are in the active schema, action_proposed still TODO | ✅ AgentStreamEventSchema includes tool_call_failed + memory_write_pending + memory_write_saved. action_proposed exists ONLY as ForwardLookingActionProposed type-only declaration in src/lib/agent-client/types.ts. Reducer's exhaustive check would fail compile if action_proposed were lifted into AgentStreamEventSchema without a paired switch case. |
| 3. action_proposed forces M7 | ✅ Verified via grep: `grep -n action_proposed` against types.ts + turnReducer.ts + sse.ts shows only docstring/type-only references; no active schema entry; no reducer case. |
| 4. No client-side imports of @/lib/agent in chat surfaces | ✅ grep `from "@/lib/agent"` against src/components/chat/ and src/lib/agent-client/ returns empty. |
| 5. No legacy PMS tokens in chat surfaces | ✅ grep `--golden\|--coastal\|--mangrove\|--tideline` against src/components/chat/ + src/lib/agent-client/ returns empty. |
| 6. MemoryArtifact wired to live data; preview routes still work | ✅ ChatClient harvests memory_artifact ContentBlocks into pendingArtifacts (Issue A fix); HistoryTurnView consumes both harvested + server-loaded; component supports 4 states (pending/saved/superseded/failed); preview routes from M5 still drive mock data through the same prop shape. |
| 7. Supersession cascade verified at both layers | ✅ Staging smoke T5: memory_facts.superseded_by populated on prior row; agent_artifacts.state='superseded' on prior artifact's lifecycle row when the correction proposal landed. |
| 8. read_memory excludes superseded rows | ✅ Staging smoke T6: read_memory returned ONLY the active 4828 fact (4827 with status='superseded' filtered by the existing M1 `WHERE status='active'` clause). |
| 9. Milestone animation visually completes | ✅ ChatClient fireMilestone drains memory_write_saved from /api/agent/artifact SSE response, sets milestoneActive=true for 2000ms, prefers-reduced-motion guarded. KoastMark .ghost + .stack groups in SVG markup; globals.css k-milestone-* keyframes drive the deposit. CF #29 captures visual-polish refinement for future milestone. |
| 10. Anti-patterns audit | ✅ No inline edit forms on artifacts; no reuse of /api/agent/turn for artifact approval; no new artifact tables; no bundled migration files; no statistical inference proposals without citation; no skipping pre-write read_memory call (system-prompt-enforced; CF #30 for substrate enforcement); no action_proposed in active schema; no new dependencies in package.json; no Co-Authored-By trailers (commit pending). |
| Bonus: tsc clean | ✅ `npx tsc --noEmit` exit 0, no output. |
| Bonus: tests pass | ✅ 24 suites, 3 skipped (pre-existing staging-smoke), **279 tests passed / 0 failed**. M6-scope tests: ~80 net-new (artifact-writer 9 + dispatcher D35 5+adapt 3 + error-classifier 16 + write_memory_fact tool 13 + handler 7 + reducer 7 + conversation 6 + system-prompt 5 + memory-write+stakes 12-adapt + milestone 5). |

---

## 9. Stats

**Code (TypeScript / TSX / SQL):**
- Action substrate: artifact-writer.ts (163), handlers/write-memory-fact.ts (170) = **333 source lines**
- Agent loop: error-classifier.ts (122), tools/write-memory-fact.ts (160) = **282 source lines**
- Routes: api/agent/artifact/route.ts (279) = **279 source lines**
- Migrations: 23 + 53 + 18 = **94 SQL lines**

**Tests:**
- New test files: artifact-writer.test (197), handlers/write-memory-fact.test (231), error-classifier.test (109), tools/write-memory-fact.test (161), milestone-trigger.test (122) = **820 test lines**
- Existing test extensions: dispatcher.test (+274), conversation.test (+124), turnReducer.test (+155), system-prompt.test (+71), loop.test (+74), memory + substrate test rename (+86) = **~784 modified test lines**

**Server-side modifications: ~1,100 net insertions** across types.ts (+41), dispatcher.ts (+155), loop.ts (+141), conversation.ts (+378), sse.ts (+62), system-prompt.ts (+74), stakes-registry.ts (+21), memory/write.ts (+2).

**Client-side modifications: ~715 net insertions** across types.ts (+165), turnReducer.ts (+155), ChatClient.tsx (+330), MemoryArtifact.tsx (+65).

**Total source LOC added in M6: ~2,100 net-new** (production code + 14 net-new files).
**Total test LOC added in M6: ~1,604** (820 net-new + 784 modified).

**Tests (full repo):** 279 passing across 24 suites; 3 skipped (staging-smoke pre-existing). M6-scope tests: ~80 net-new.

**Dependencies added:** **0** — preserves M5's "no new deps" invariant. Component-level UI tests still deferred (CF17 inherited from M5).

**Docs:**
- `agent-loop-v1-milestone-6-conventions.md`: 757 lines (16 decisions D20-D35, 12 carry-forwards 20-31, Phase 1 STOP findings, dual-tracked cascade addendum)
- `agent-loop-v1-milestone-6-report.md`: this file

---

## 10. Carry-forwards

12 net-new entries in conventions §18, continuing M5's 1-19. **All M5 actively-deferred entries remain active** unless explicitly resolved.

| # | Item | Status |
|---|---|---|
| **15** | **KoastMark milestone state visual stub — RESOLVED IN M6 (D33 + step 17 + trigger delta)** | Listed-but-resolved-in-M6 |
| 20 | `action_proposed` event + non-memory action artifacts | Active deferred (M7) |
| 21 | Agent awareness of long-term pending artifacts | Active deferred (M7+) |
| 22 | Sub_entity_type expansion beyond M1's 6 canonical | Active deferred |
| 23 | `agent_conversations.title`/`preview` columns | Active deferred |
| 24 | Chat shell navigation / structured surfaces | Active deferred |
| 25 | Stakes class re-evaluation (write_memory_fact='medium' per D35; future high-stakes actions) | Active deferred |
| 26 | Cascade behavior for property deletion | Active deferred |
| 27 | Audit log outcome enum 'cancelled'/'dismissed' value (currently sentinel `error_message='dismissed_by_host'`) | Active deferred |
| 28 | Live state-feed-through from /api/agent/artifact SSE into reducer (vs router.refresh roundtrip) | Active deferred (M7+) |
| 29 | KoastMark milestone visual polish — animation correct, brand impact below "deposit metaphor" target | Active deferred (polish) |
| 30 | Tool-architectural enforcement of D27 (pre-write read_memory) — substrate-level vs system-prompt-level | Active deferred (PE; future polish) |
| 31 | Stale `agent_artifacts a1c6f85f-…` historical record from failed F-1 (state='superseded' from later cascade; cosmetic only — does NOT affect cascade or recall correctness) | Captured (cosmetic) |

### Capture observations from M6

- **M5 ToolCall.tsx had expansion already implemented** — Issue C investigation surfaced that the component spec (props expanded/onToggleExpand/resultBody, isInteractive logic, chevron) was wired from M5 but ChatClient never passed the props. Retroactive validation of M5 design foresight; M6 step 18.5 wired it minimally.
- **Agent semantic D27 satisfaction** — at runtime the agent extracts the prior fact_id from conversation context (the prior turn's `read_memory` result) without mechanically re-calling. Accepted as v1 behavior; substrate enforcement (CF #30) is the durable fix for M7+ if real-use signal demands it.
- **Source semantics across tables** — `memory_facts.source='host_taught'` (the agent's classification of the fact's origin) coexists with `agent_audit_log.source='agent_tool'` (where the action originated). Different axes, both correct as documented in M1/M2 schemas.
- **Cost trajectory** — M6 first turn `$0.00388` vs M5's `$0.0018` baseline. Explained by 2-tool turns (read_memory + write_memory_fact) plus system prompt cache miss on the first M6 turn (the new CASE 4 + field-distinction prose invalidated M5's cache). Cache-warm subsequent turns will trend toward baseline ($0.0018-0.0024 expected for typical 2-tool turns).
- **Stale row #31 decision** — chose option (a) — leave the historical row as diagnostic trace. Cleanup would erase a useful record of the F-1 failure path. Cosmetic only; affects no cascade correctness.

---

*End of M6 report.*
