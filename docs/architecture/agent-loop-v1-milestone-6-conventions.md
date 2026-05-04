# Agent loop v1 — Milestone 6 conventions

> **Status:** forward-looking decisions, pre-authoring. Updated as Phase 1 STOP surfaces architectural questions against actual repo state at M6 kickoff.
>
> **Predecessors:** M1 (schema foundation), M2 (action substrate + memory handlers), M3 (tool dispatcher + read_memory), M4 (agent loop server with end-to-end streaming), M5 (chat shell + SSE consumption + ui_context plumbing).
>
> **Pattern weight:** M6 is the first milestone where the M2-M5 substrate fires end-to-end for a *gated write*. Decisions made here establish patterns that every future gated action (propose_guest_message, propose_price_change, propose_cleaner_assignment, etc.) will inherit. The conventions doc explicitly marks pattern-establishing decisions vs. M6-specific decisions.

---

## 1. Scope

M6 ships the **first gated write tool**: `write_memory_fact`. The agent can now propose memory writes during conversation; the host approves or discards via the chat shell's MemoryArtifact (built in M5, currently preview-only); approved writes persist to `memory_facts`; the supersession pattern records correction chains.

In scope for M6:
- The `write_memory_fact` tool implementation
- Action handler for the post-approval execution (substrate bypass path)
- The dedicated `/api/agent/artifact` endpoint for host approval/discard
- **Dispatcher fork at `src/lib/agent/dispatcher.ts:207-246`** (D35) — splits `'blocked'` (preserves existing ToolError + audit→failed) from `'require_confirmation'` (writes `agent_artifacts` row, leaves audit `'pending'`, returns success with proposal output). Substrate gates remain authoritative.
- **Three schema migrations** (action_type data rename; `agent_artifacts` lifecycle expansion — `audit_log_id` FK + `supersedes` column + `state` enum gains `'superseded'`; `agent_turns.active_property_id`). The originally-drafted M6.4 (`memory_facts.supersedes`) is dropped — `memory_facts.superseded_by` already exists. The originally-drafted "agent_audit_log.supersedes + outcome enum 'superseded'" is also dropped — Phase 1 STOP confirmed audit log is execution-accountability (outcome ∈ succeeded/failed/pending), not lifecycle; supersession lives on `agent_artifacts` instead.
- Granular `tool_call_failed` SSE event with structured error taxonomy
- The 3 forward-looking SSE events from M5 promoted to live: `tool_call_failed`, `memory_write_pending`, `memory_write_saved`
- Reducer extensions for the new events
- MemoryArtifact wired to live data (currently preview-only)
- ToolCall `state="failed"` variant wired to `tool_call_failed` events
- System prompt update teaching the agent when to call write_memory_fact + supersession behavior
- Conversation reads extended to surface pending artifacts on page refresh / conversation reopen
- KoastMark milestone visual completion (M5 carry-forward CF15) — fires on approve

Out of scope for M6 (deferred):
- The 4th forward-looking SSE event `action_proposed` (M7+ — non-memory action proposals like guest messages need different action types)
- Agent awareness of long-term pending artifacts (agent doesn't know about its own past-proposed-but-unresolved artifacts; M7+ product decision)
- Sub_entity_type expansion beyond M1's 6 canonical types — real use surfaces the gaps; future milestone adds via CHECK update
- `agent_conversations.title` and `preview` columns — derivation works at v1 scale; defer until performance or feature load demands them
- Audit log surface (chat shell topbar icon still wired to nothing; M7+ artifact registry surface)
- Inline edit forms on artifacts (per Q3 — supersession-via-conversation handles corrections)
- Chat shell navigation / structured surface design (tab strip, inbox view, structured property views — future milestone)
- Visible polish carry-forwards from M5 (mobile drawer beyond static, tablet breakpoint, dark mode QA, a11y audit, scroll pill, tooltype/woff2 conversion, timestamp canonical strategy)

---

## 2. Source of truth

The substrate layers from M1-M5 are the foundation. M6 extends, doesn't replace.

| Source | Treatment |
|--------|-----------|
| M2 action substrate (`src/lib/action-substrate/`) | The bypass path is the entry point for artifact approvals. Phase 1 STOP must verify bypass conditions are still `source='agent_artifact'` AND `context.artifact_id` non-empty (defensive AND). |
| M3 tool dispatcher (`src/lib/agent/dispatcher.ts`) | New tool registered following the M3 pattern. Error classifier added as sibling module. |
| M4 agent loop (`src/lib/agent/loop.ts`) | Per-tool error catch + classify + emit `tool_call_failed`. Existing `error` event reserved for unrecoverable turn-level failures. |
| M5 chat shell (`src/components/chat/`) | MemoryArtifact and ToolCall variants already built; M6 wires them to live data via reducer + ChatClient updates. |
| M5 conventions §10 carry-forwards | M6 closes specific carry-forwards (CF15 milestone visual, CF§10.1 partial — 3 of 4 forward-looking events promoted). Does not address all carry-forwards. |
| Phase C design handoff (`design/m5-handoff/handoff/`) | MemoryArtifact and ToolCall designs already specified. M6 doesn't add new visual surfaces. |
| memory_facts schema (M1) | The destination for approved writes. M6 adds `supersedes` column. |

**Locked invariants from prior milestones:**
- 6 canonical sub_entity_types (front_door, lock, parking, wifi, hvac, kitchen_appliances) — M6 doesn't expand
- Plus Jakarta Sans + JetBrains Mono typography
- 9 semantic palette tokens
- Motion vocabulary (idle / active / milestone / hero — milestone gets visual completion in M6)
- Action substrate's two write paths (normal gated + agent_artifact bypass)
- M5's reducer + hook pattern (no new state libraries)
- M5's no-new-dependencies invariant (M6 holds the line — component test infrastructure stays deferred)

---

## 3. Pattern-establishing vs M6-specific

Decisions in §12 are tagged with one of:

- **PE** (pattern-establishing) — affects every future gated action, not just memory writes
- **M6** (M6-specific) — applies to memory writes only; future gated actions may diverge

The PE-tagged decisions deserve disproportionate care because they propagate.

| Decision | Tag | Rationale |
|----------|-----|-----------|
| Q1 (action_type rename) | PE | Naming convention for all future action_types |
| Q2 (artifact persistence model) | PE | Storage + rendering + reload behavior for all artifacts |
| Q3 (supersession tracking) | PE | Correction-chain pattern for all gated actions |
| Q4 (when agent proposes) | M6 partial / PE partial | Specific 6 sub_entity_types are M6; "explicit + contextual yes, inferred no" is PE |
| Q5 (tool_call_failed taxonomy) | PE | Failure model for all future tools |
| Q6 (schema migrations) | mixed | Rename + outcome enum are M6 mechanical; supersedes columns + active_property_id pattern are PE |
| Q7 (artifact bypass via dedicated endpoint) | PE | Approval flow for all future gated actions |
| Q8 (file structure) | PE | File-location pattern for all future tools/handlers/artifacts |

---

## 4. Three schema migrations

Per Q6 / D29 (revised). All migrations are ALTER on existing tables (no new tables; RLS scope inherits). Supersedes + outcome-enum expansion are the same lifecycle concern (artifact correction chain) and ship in one file by design — the "one concern per file" discipline is preserved at the lifecycle-concern grain, not the column grain. **The originally-drafted `memory_facts.supersedes` migration is dropped** — `memory_facts.superseded_by` (uuid → memory_facts.id) and the existing `status` enum already encode the correction-chain pattern. Phase 1 STOP confirmed the misread.

### M6.1 — Rename action_type from `'memory_fact_write'` to `'write_memory_fact'` (data UPDATE only)

```sql
-- File: 20260504XXXXXX_rename_memory_fact_write_action_type.sql
-- Phase 1 STOP confirmed: agent_audit_log.action_type has NO CHECK
-- constraint (the column is plain `text NOT NULL`). Pure data rename.

UPDATE agent_audit_log
SET action_type = 'write_memory_fact'
WHERE action_type = 'memory_fact_write';
```

The same rename also touches `src/lib/action-substrate/stakes-registry.ts` (seed entry) and the four test files referencing `'memory_fact_write'` (`audit-writer.test.ts`, `request-action.test.ts`, `stakes-registry.test.ts`). Bundle in the same authoring step as the migration. The stale schema comment on `agent_audit_log.action_type` referencing `'memory.write'` gets cleaned up in the same pass.

### M6.2 — `agent_artifacts` lifecycle expansion (audit_log FK + supersedes + state enum)

```sql
-- File: 20260504XXXXXX_agent_artifacts_lifecycle_expansion.sql
-- Adds the paired-FK link to agent_audit_log + lifecycle correction chain
-- + 'superseded' state. All three concerns belong to the artifact's
-- lifecycle layer; agent_audit_log's execution-outcome enum is left
-- intact (Phase 1 STOP confirmed audit log = accountability,
-- agent_artifacts = lifecycle).

ALTER TABLE agent_artifacts
  ADD COLUMN audit_log_id UUID NULL REFERENCES agent_audit_log(id) ON DELETE SET NULL;

ALTER TABLE agent_artifacts
  ADD COLUMN supersedes UUID NULL REFERENCES agent_artifacts(id) ON DELETE SET NULL;

ALTER TABLE agent_artifacts DROP CONSTRAINT agent_artifacts_state_check;
ALTER TABLE agent_artifacts ADD CONSTRAINT agent_artifacts_state_check
  CHECK (state IN ('emitted', 'confirmed', 'edited', 'dismissed', 'superseded'));

CREATE INDEX idx_agent_artifacts_supersedes
  ON agent_artifacts(supersedes)
  WHERE supersedes IS NOT NULL;

CREATE INDEX idx_agent_artifacts_audit_log
  ON agent_artifacts(audit_log_id)
  WHERE audit_log_id IS NOT NULL;
```

**Existing audit_log.outcome enum unchanged.** `agent_audit_log.outcome` stays at `('succeeded', 'failed', 'pending')` — execution outcome of an action attempt. An artifact in `state='superseded'` may still have audit rows showing `outcome='pending'` (proposal pending) or `'succeeded'` (prior approval attempt) — those are different facts. Audit log is immutable accountability; lifecycle transitions live on agent_artifacts.

**Existing `state='emitted'` rows preserved.** The CHECK replacement is purely additive (`'superseded'` joins the allowed set; existing values stay valid).

**Existing JSONB pairing.** `agent_audit_log.context.artifact_id` continues to be written by the action substrate as a defensive secondary lookup for backwards compat with M2's bypass path. The new `agent_artifacts.audit_log_id` FK is the canonical primary linkage going forward.

> **Note on memory_facts:** the originally-drafted M6.4 (`memory_facts.supersedes`) is dropped. `memory_facts.superseded_by` already exists. M6 reuses it.

### M6.3 — Add `agent_turns.active_property_id`

```sql
-- File: 20260504XXXXXX_add_active_property_id_to_agent_turns.sql

ALTER TABLE agent_turns
  ADD COLUMN active_property_id UUID NULL REFERENCES properties(id);

CREATE INDEX idx_agent_turns_active_property
  ON agent_turns(active_property_id)
  WHERE active_property_id IS NOT NULL;
```

Per Q4 implication / D32. Records property scope on every turn. Loop persists this field when writing turns (closes M5's CF D-F2 — the "All properties" `active_property_id IS NULL` fallback no longer applies; nullability remains honest for legacy turns predating property selection).

---

## 5. The write_memory_fact tool

Lives at `src/lib/agent/tools/write-memory-fact.ts`. Mirrors M3's `read-memory.ts` pattern.

### Tool definition shape

```typescript
import { z } from 'zod';
import { Tool } from '../types';

export const writeMemoryFactInputSchema = z.object({
  property_id: z.string().uuid(),
  sub_entity_type: z.enum([
    'front_door', 'lock', 'parking', 'wifi', 'hvac', 'kitchen_appliances'
  ]),
  fact_value: z.string().min(1).max(2000),
  fact_metadata: z.record(z.unknown()).optional(),
  supersedes: z.string().uuid().optional(),  // for Q4 case 4
});

export const writeMemoryFactOutputSchema = z.object({
  audit_id: z.string().uuid(),
  outcome: z.literal('pending'),
});

export const writeMemoryFact: Tool = {
  name: 'write_memory_fact',
  description: 'Propose to save a memory fact about a property. ...',
  inputSchema: writeMemoryFactInputSchema,
  outputSchema: writeMemoryFactOutputSchema,
  requiresGate: true,
  stakesClass: 'medium',  // raised from 'low' per D35; the substrate's gate triggers require_confirmation
  handler: async (input, context) => {
    // Unreached for write_memory_fact at proposal time. The dispatcher fork (D35)
    // intercepts when requestAction returns mode='require_confirmation', writes
    // the agent_artifacts row + paired agent_audit_log row (lifecycle + audit roles
    // separated per D21), and synthesizes the proposal output via buildProposalOutput.
    // The handler is invoked only on the post-approval path (host clicks Save),
    // routed through the action handler registry to handlers/write-memory-fact.ts.
    throw new Error('write_memory_fact handler should not run at proposal time; check dispatcher fork');
  },
  buildProposalOutput: (input, context, artifactId) => ({
    artifact_id: artifactId,
    audit_id: artifactId,  // paired ref; M5/M6 reducer correlation
    outcome: 'pending',
  }),
};
```

### Proposal-time flow (dispatcher fork; D35)

The dispatcher does not invoke the tool's `handler` at proposal time. Instead, when `requestAction` returns `mode='require_confirmation'` for a gated tool, the dispatcher:

1. Leaves `agent_audit_log.outcome='pending'` (does not mark it failed)
2. Writes a paired `agent_artifacts` row (lifecycle persistence per D21) referencing the audit row
3. Calls the tool's `buildProposalOutput(input, context, artifactId)` to synthesize the proposal output
4. Returns `{ ok: true, value: <proposal-output>, audit_log_id }` to the loop

This treats `require_confirmation` as constructive success rather than a typed failure. The substrate's gate enum has been telling us this since M2 — M6 starts listening. The `'blocked'` mode preserves existing ToolError + audit→failed behavior verbatim.

The artifact_id (== audit_id by paired-ref convention) flows back to the model as part of the tool result, but the model rarely needs it directly — the chat shell reads pending artifacts independently via the conversation reads extension (§11). The id is mainly for client-side reducer correlation and post-approval lookup.

---

## 6. The post-approval handler (action handler registry)

Lives at `src/lib/action-substrate/handlers/write-memory-fact.ts`.

This is the *execution* logic that runs when host clicks Save on the MemoryArtifact. The `/api/agent/artifact` endpoint (§7) receives `{ audit_id, action: 'approve' }`, looks up the paired `agent_artifacts` + `agent_audit_log` rows, dispatches to the registered handler for that action_type via the action handler registry, and on success marks both lifecycle (`agent_artifacts.status='resolved'`) and audit (`agent_audit_log.outcome='approved'`) state. The substrate bypass path (`source='agent_artifact'`) remains the M2-shaped entry point for any future direct substrate invocation; M6's primary entry point is the dedicated endpoint.

### Phase 1 STOP must verify

1. **M2's substrate has an action handler registry** (or a clear way to extend the bypass path). If not, M6 introduces one — small extension, registers handlers by action_type string. Surface this either way.

2. **Bypass conditions are exactly `source='agent_artifact'` AND `context.artifact_id` non-empty** (defensive AND). User memory says yes; confirm against actual code.

3. **No M3/M4/M5 changes silently altered the bypass path.** Particularly: did anything add additional bypass conditions, change the audit row update behavior, or reroute through a different path?

### Handler shape

```typescript
export async function writeMemoryFactHandler(
  auditRow: AgentAuditLogRow,
  context: HandlerContext
): Promise<HandlerResult> {
  // 1. Validate host owns the property (defensive)
  // 2. INSERT into memory_facts (with supersedes if present in payload)
  // 3. Return success with the new memory_fact id
  // (Substrate then updates auditRow.outcome='approved' and emits memory_write_saved)
}
```

---

## 7. The artifact endpoint

Lives at `src/app/api/agent/artifact/route.ts`. Per Q7 / D29.

### Shape

POST `/api/agent/artifact` with body:
```typescript
{
  audit_id: string,
  action: 'approve' | 'discard',
}
```

### Approve flow

1. Auth check via existing `getAuthenticatedUser` pattern (M4 convention)
2. Look up audit row; verify host_id matches authenticated user; verify outcome='pending'
3. Dispatch to action handler registry (Q8 / D31)
4. Handler executes write
5. Substrate updates auditRow.outcome='approved'
6. Substrate marks any rows with `supersedes = this.audit_id` as `outcome='superseded'` (cascade)
7. Return SSE stream containing `memory_write_saved` event + `done` event
8. (Optional M7 work: a follow-up agent turn confirming "saved!" — out of scope for M6; the SSE response is sufficient)

### Discard flow

1. Auth check
2. Look up audit row; verify host_id; verify outcome='pending'
3. Update auditRow.outcome='rejected'
4. Return JSON `{ success: true }` (no SSE stream needed)

### Why SSE for approve, JSON for discard

Approve fires `memory_write_saved` which the chat shell consumes to:
- Update the MemoryArtifact's visual state to "saved"
- Trigger the parent KoastMark's milestone animation
- Update local memory cache if the chat shell maintains one

Discard is a simple state transition; no animation, no cache invalidation, no model interaction. JSON response is sufficient.

---

## 8. SSE event union expansion

Per Q5 + the M6 promotion of forward-looking events.

### sse.ts (server) additions

```typescript
// Existing 7 events: turn_started, token, tool_call_started, 
// tool_call_completed, done, error, refusal

// New in M6:
| { type: 'tool_call_failed'; tool_use_id: string; tool_name: string; 
    error: ToolError; latency_ms: number }
| { type: 'memory_write_pending'; artifact_id: string; audit_id: string;
    proposed_payload: WriteMemoryFactPayload; supersedes?: string }
| { type: 'memory_write_saved'; artifact_id: string; audit_id: string;
    memory_fact_id: string; supersedes?: string }
```

### Error taxonomy (per Q5 / D-Q5)

```typescript
type ToolError = {
  kind: 'validation' | 'authorization' | 'constraint' 
      | 'conflict' | 'transient' | 'unknown';
  message: string;
  retryable: boolean;
};
```

Classification rules in `src/lib/agent/error-classifier.ts`:
- Postgres constraint errors → `constraint` (retryable)
- Postgres unique violation → `conflict` (retryable with supersedes)
- Network/timeout errors → `transient` (retryable as-is)
- Zod validation failure → `validation` (retryable with corrected input)
- Explicit AuthorizationError thrown by handler → `authorization` (not retryable)
- Anything else → `unknown` (not retryable; report to host)

### types.ts (client) mirror

The 3 events promoted from `// TODO M6/M7` to active schema. M5's reducer's exhaustive check at the default case (`const _exhaustive: never = event`) currently fails the TypeScript compile for these events — M6 adds the cases, satisfying exhaustiveness.

The 4th forward-looking event (`action_proposed`) stays as M7 TODO. Reducer's exhaustive check still fails for it; M7 will add.

---

## 9. Reducer extensions

`src/lib/agent-client/turnReducer.ts` adds three new cases:

### `tool_call_failed`

Mutates the in-flight ToolCall block in current state to `state='failed'`, attaches the error message, sets `latency_ms`. Equivalent to `tool_call_completed` but failure-flavored.

### `memory_write_pending`

Adds a new MemoryArtifact block to the current turn's content array. State `pending`. Stores `audit_id` for later supersession lookup.

If the event includes a `supersedes` field: the reducer ALSO marks any existing MemoryArtifact block in the conversation history with `audit_id === supersedes` as `state='superseded'`. This is optimistic UI — the substrate's cascade also updates the database, but the UI updates immediately for snappy feedback.

### `memory_write_saved`

Mutates the matching MemoryArtifact block (by `audit_id`) to `state='saved'`. Triggers the parent KoastMark's milestone animation via a side effect (the avatar component watches for state transitions on the most recent message and fires milestone on saved).

### Exhaustive check

`default: const _exhaustive: never = event;` continues to fail for `action_proposed` (M7) — reducer doesn't handle it yet. TypeScript correctly enforces that M7 must add the case before merging.

---

## 10. System prompt update

`src/lib/agent/system-prompt.ts` adds Q4 instructions. The system prompt change invalidates M5's prompt cache on first M6 turn (cost: one cache miss). Acceptable.

### Sections added

**1. write_memory_fact tool documentation.** What it does, when to use it, the 6 valid sub_entity_types and what fits each.

**2. The propose-with-citation rule.** Cases 1-4 (explicit, contextual, Q&A answer, correction) propose without special citation since the source is the host's own words in the current turn. Case 5a (summarization of prior memory_facts) proposes with explicit grounding in the prior approved facts ("you've previously saved X, Y, Z — want me to save the consolidated pattern?"). Case 5b (operational data inference) is out of scope — the agent doesn't have operational tools yet. Case 5c (conversation prose inference) proposes only when concrete, specific, and supported by 3+ signals across conversation history; proposal text must cite the inference source. **Frequency bias toward conservative**: when in doubt, don't propose — ask conversationally instead. Proposal fatigue is the failure mode to avoid.

**3. The supersession behavior.** Two flavors:
- Pending artifact correction: if the model has a still-pending memory write proposal in conversation context and host corrects it, re-propose with `supersedes: <pending_audit_id>`
- Saved fact correction: if host corrects a fact that exists in `read_memory` results, propose new write with `supersedes: <existing_fact_id>`

**4. Pre-write read_memory call.** Before proposing write_memory_fact for a fact-providing host turn, call read_memory to check if the sub_entity_type already has a fact. If yes, the write is a correction (set `supersedes`). If no, it's a new fact.

**5. The when-uncertain-ask rule.** Ambiguous cases ("the wifi works fine") aren't proposable. Agent asks clarifying question rather than proposing speculatively.

**6. Quality filter for case 2 (contextual proposals).** Propose only when the fact:
- Fits one of the 6 sub_entity_types
- Seems like a stable property attribute (not a one-time event)
- Is concrete enough to be useful (not vague)

### Pattern note

The system prompt becomes increasingly important as tool surface grows. M6 sets the precedent for how to teach a new tool. Future milestones (M7 propose_guest_message, M8 propose_price_change, etc.) follow the same prompt-section pattern.

---

## 11. Conversation reads extended

`src/lib/agent/conversation.ts` per Q2c.

### Function changes

**Option A (chosen):** Extend `loadTurnsForConversation` to return turns with their pending artifacts attached.

```typescript
type UITurn = {
  // ... existing fields from M5
  pendingArtifacts: PendingArtifact[];  // new in M6
};

type PendingArtifact = {
  artifact_id: string;        // agent_artifacts.id
  audit_log_id: string;       // agent_artifacts.audit_log_id (FK per D21)
  kind: string;               // agent_artifacts.kind ('property_knowledge_confirmation' for M6's first write tool; expands)
  payload: unknown;           // agent_artifacts.payload (typed per kind via registry)
  created_at: string;
  supersedes?: string;        // prior artifact_id this proposal corrects
};
```

The function does two queries in parallel: existing turns query + pending artifacts query (`SELECT * FROM agent_artifacts WHERE conversation_id = $1 AND state = 'emitted'`), then stitches in memory by `turn_id`. The audit_log_id FK provides a path back to the execution-outcome view if a caller needs it; lifecycle reads don't need to join.

This avoids breaking the function's signature for non-M6 callers — `pendingArtifacts` is just an additional field. Existing callers ignore it; M6 callers consume it.

### M5 caller compatibility

M5's `(dashboard)/chat/[conversation_id]/page.tsx` and `(dashboard)/chat/page.tsx` pass turns to ChatClient. The shape extends; ChatClient reads `pendingArtifacts` and attaches them to the rendering of the originating turn.

Phase 1 STOP must verify the M5 caller code can absorb the shape extension cleanly.

---

## 12. Architectural decisions (locked)

### Pre-authoring decisions (locked during conventions session, 2026-05-XX)

**D20 — Action_type rename via migration in M6** (PE; resolves Q1 + the long-standing carry-forward).
Rename `'memory_fact_write'` to `'write_memory_fact'` in M6's first migration. Updates existing audit rows + CHECK constraint. Cost is near-zero (small audit log volume in dev/staging); precedent value is high (verb_noun naming convention for all future action_types).

**D21 — Artifact persistence in `agent_artifacts` (lifecycle); `agent_audit_log` retains execution-accountability role; explicit FK pairing** (PE; resolves Q2a; revised twice post-Phase-1-STOP).
The originally-drafted "audit_log only" approach was a misread — `agent_artifacts` already exists in the schema with its own state machine (`emitted | confirmed | edited | dismissed`) and is the correct lifecycle home. M6 writes paired rows on every proposal: a row in `agent_artifacts` (the artifact's lifecycle, with the proposed payload) and a row in `agent_audit_log` (the immutable audit trail of the action attempt and its execution outcome).

**Linkage:** `agent_artifacts.audit_log_id uuid REFERENCES agent_audit_log(id) ON DELETE SET NULL` (added in M6.2) is the canonical primary FK. The pre-existing `agent_audit_log.context.artifact_id` JSONB field continues to be written by the substrate as a defensive secondary lookup for backwards compat with M2's bypass path, but the column FK is now the primary linkage.

**Semantic separation:** lifecycle and accountability are distinct concerns. `agent_artifacts.state` answers "what's happened to this proposal?" (emitted/confirmed/edited/dismissed/superseded). `agent_audit_log.outcome` answers "did this execution attempt succeed?" (succeeded/failed/pending). An artifact in `state='superseded'` may have an audit row showing `outcome='succeeded'` (prior approval execution worked) or `'pending'` (proposal awaiting host action) — those are different facts and they live on different tables for a reason. Every gated action follows this pattern.

**D22 — Turn-bound artifact rendering** (PE; resolves Q2b).
Artifacts render inline in the turn that proposed them. They don't "follow" or appear sticky on subsequent turns. Hosts scroll up to find unresolved proposals. M6 ships without a "pending counter" or jump-to UI; that's M7+/polish work.

**D23 — Refresh + reopen reload from server** (PE; resolves Q2c, Q2d).
Pending artifacts persist via the audit log row. Page refresh + conversation reopen reload via extended `loadTurnsForConversation`. Agent unaware of long-term pending artifacts (M7+ concern; carry-forward).

**D24 — No TTL on pending artifacts** (PE; resolves Q2e).
Pending state persists indefinitely until host approves, discards, or conversation is deleted. No background expiry jobs.

**D25 — Supersession at the lifecycle layer** (PE; resolves Q3; revised twice post-Phase-1-STOP).
Supersession is a lifecycle concept, not an execution-outcome concept. M6 adds:
- `agent_artifacts.supersedes uuid REFERENCES agent_artifacts(id) ON DELETE SET NULL` — reverse pointer chain at the artifact lifecycle layer
- `agent_artifacts.state CHECK` gains `'superseded'` (alongside existing `'emitted', 'confirmed', 'edited', 'dismissed'`)
- `agent_audit_log.outcome` enum is **NOT** modified — stays `('succeeded', 'failed', 'pending')`. Audit log retains its execution-outcome semantics.

For saved-fact corrections at the persisted-data layer, M6 reuses the existing `memory_facts.superseded_by` column already in schema.

**Cascade behavior:** when a new artifact has `supersedes` set, the substrate marks the prior `agent_artifacts` row's `state='superseded'`. The prior row's audit_log entry stays as-is (whatever outcome was recorded for that execution attempt — typically `'pending'` if the prior proposal was never approved, or `'succeeded'` if it was already saved before the correction). Reducer applies the same lifecycle-state cascade optimistically on the client.

**D25 addendum — dual-tracked cascade.** Supersession runs on two tracks:
- **Substrate (authoritative).** `artifact-writer.ts` writes the new artifact row, then issues an UPDATE to flip the prior artifact's `state='superseded'` in the database. This is best-effort and non-fatal: if the prior row is missing or the update errors, the writer logs a warn and continues — the new row is still committed and remains canonical.
- **Reducer (optimistic UX).** The client-side reducer mirrors the cascade in-memory: when a `memory_write_pending` event with `supersedes` arrives, the prior MemoryArtifact block in the current turn's content is flipped to `state='superseded'` immediately for snappy UI feedback.

Edge case: when the substrate cascade is non-fatal-skipped (concurrent dismissal, race condition, FK lookup miss), the optimistic UI may briefly show `'superseded'` for an artifact whose DB state is actually different. Page refresh re-reads from the substrate (via `loadTurnsForConversation`'s pending-artifacts query) and resolves to actual state. The new artifact is canonical regardless of cascade outcome — the supersession field on the new row is the authoritative chain pointer.

**D26 — Agent proposes on cases 1-5 with case-specific rules and citation requirement** (M6 partial / PE partial; resolves Q4).
- Case 1 (explicit "remember X") → propose
- Case 2 (contextual fact mentioning) → propose
- Case 3 (host answers agent's question) → propose
- Case 4 (correction of existing fact) → propose with supersession; agent must call read_memory first to find prior fact's id
- Case 5a (summarization of prior memory_facts via read_memory) → propose; explicit grounding in prior approved facts
- Case 5b (inference from operational data like booking history) → out of scope until those tools exist (read_bookings, read_pricing_signals, etc. — future milestones)
- Case 5c (inference from conversation prose patterns) → propose conservatively only when: (a) concrete and specific, not vague; (b) supported by 3+ signals across conversation history; (c) proposal text cites the inference source
- When uncertain → ask, don't fabricate
- **Frequency bias toward conservative.** When in doubt, don't propose. Asking "want me to save that?" conversationally is preferable to a speculative proposal. The MemoryArtifact UI is signal, not noise — proposal fatigue is the failure mode to avoid.
- **Citation requirement (PE).** When proposing from any source other than direct explicit host statement (cases 5a and 5c specifically), the proposal text must cite the inference source. Host needs to know why the agent is proposing this. Examples: "you've previously saved X, Y, Z about this property — want me to save the consolidated pattern?" or "across our last 4 conversations, you've mentioned the neighbor situation — want me to save 'noisy neighbor adjacent at unit 5B' as a property quirk?"

The 6 canonical sub_entity_types are M6-specific. The case taxonomy, citation requirement, and conservatism bias are PE — they apply to every future gated action with a proposal flow.

**D27 — Pre-write read_memory call** (PE; sub-decision of Q4).
Before proposing write_memory_fact, agent calls read_memory to determine if the sub_entity_type already has a fact for the property. If yes → corrected write with supersedes. If no → new write. Two tool calls per fact-providing turn is acceptable cost.

**D28 — Granular tool_call_failed event with structured taxonomy** (PE; resolves Q5).
New SSE event for per-tool failures. Error kinds: validation, authorization, constraint, conflict, transient, unknown. Retryable flag tells UI/agent whether to surface retry. Turn-level `error` event reserved for unrecoverable failures. Classifier in `src/lib/agent/error-classifier.ts`.

**D29 — Three M6 migrations** (mixed; resolves Q6; revised twice post-Phase-1-STOP).
1. **M6.1** — action_type data rename (`memory_fact_write` → `write_memory_fact`). UPDATE only; no CHECK constraint exists on `action_type`. Bundle with stakes-registry seed update + the four test files referencing the old value + stale schema-comment cleanup.
2. **M6.2** — `agent_artifacts` lifecycle expansion: add `audit_log_id` FK (paired ref per D21), add `supersedes` column (correction chain per D25), expand `state` CHECK to include `'superseded'`. Three ALTERs ship together because they all encode the artifact lifecycle concern; existing audit_log execution-outcome enum is left alone.
3. **M6.3** — `agent_turns.active_property_id` column (closes M5 CF D-F2)

The originally-drafted M6.4 (`memory_facts.supersedes`) is **dropped** — `memory_facts.superseded_by` already exists. The originally-drafted "agent_audit_log.supersedes column + outcome enum 'superseded'" is also **dropped** — Phase 1 STOP confirmed audit log is execution-accountability, lifecycle goes on agent_artifacts. M6.5 (active_property_id) is renumbered to M6.3.

The "one concern per file" discipline applies at the lifecycle-concern grain, not the column grain.

Sub_entity_type expansion DEFERRED. agent_conversations.title/preview DEFERRED.

**D30 — Dedicated /api/agent/artifact endpoint with action-in-body** (PE; resolves Q7).
Single route, POST body specifies `{ audit_id, action: 'approve' | 'discard' }`. Approve returns SSE stream with `memory_write_saved` + `done`. Discard returns JSON. Cleaner than reusing /api/agent/turn with synthetic messages.

**D31 — File structure: dual-location pattern for tools and handlers** (PE; resolves Q8).
- Tool definition: `src/lib/agent/tools/<tool_name>.ts` (proposal-time logic; runs during model inference)
- Action handler: `src/lib/action-substrate/handlers/<action_type>.ts` (post-approval execution; runs when host approves artifact)
- Different lifecycles, different concerns, different files.

**D32 — Error classifier as own module** (PE; sub-decision of Q5/Q8).
`src/lib/agent/error-classifier.ts` — self-contained, easily testable. Dispatcher imports and uses. Keeps dispatcher's main path readable.

**D33 — KoastMark milestone visual completion** (M6; resolves CF15 from M5).
M5 shipped the milestone state machine with stub visual (data-state flips for ~2s, no actual deposit animation). M6 adds the `.ghost` and `.stack` SVG groups + animation per the brand spec's milestone register. Triggers on `memory_write_saved` SSE event.

**D34 — System prompt update for write_memory_fact** (M6; resolves Q4 implementation).
Adds tool documentation, propose-don't-fabricate rule, supersession behavior, pre-write read_memory rule, when-uncertain-ask rule, quality filter for contextual proposals. Cache invalidation cost on first M6 turn is acceptable.

**D35 — Dispatcher fork at lines 207-246; stakes class for write_memory_fact raised to `'medium'`; `buildProposalOutput` interface extension** (PE; locked post-Phase-1-STOP, Divergence C resolution).

Rationale: the M2 substrate's `requestAction` already returns three modes (`allow`, `block`, `require_confirmation`), but the M3 dispatcher conflates the latter two as failure (`gate_blocked` / `confirmation_required` ToolError, audit→failed). M6 splits the branch:

- `'blocked'` → existing behavior preserved verbatim (ToolError + audit→failed). No regression.
- `'require_confirmation'` → constructive success: audit row stays `'pending'`, paired `agent_artifacts` row is written, dispatcher synthesizes proposal output via `tool.buildProposalOutput(input, context, artifactId)`, returns `{ ok: true, value, audit_log_id }`.

Concrete change scope: ~25-35 LOC in dispatcher's `gatedMode !== 'allow'` branch (lines 233-246), ~5-10 LOC adding `buildProposalOutput?: (input, ctx, artifactId) => output` to the `Tool<TInput, TOutput>` interface in `types.ts`, ~30-40 LOC for the new `src/lib/action-substrate/artifact-writer.ts` shared module, registration-time enforcement (gated tools must declare `buildProposalOutput` mirroring the existing `requiresGate + stakesClass` invariant on dispatcher.ts:61-65). read_memory is unaffected — it takes the `requiresGate=false` branch (dispatcher.ts:225-230) and never enters the forked code.

Stakes class for write_memory_fact is raised from the originally-proposed `'low'` to **`'medium'`**. Memory writes are reversible (discard / supersession), but they shape the agent's behavior across future conversations — that's a meaningful enough commitment that the substrate should gate them at the higher tier and trigger `require_confirmation`. The stakes registry's `medium` mapping is what produces the gate response that the dispatcher fork now handles constructively.

Substrate authority is preserved: `requestAction` remains the single source of truth for whether a write is allowed silently, blocked, or requires confirmation. The dispatcher just stops treating "requires confirmation" as failure. Every future gated tool benefits — they declare `requiresGate: true` + a stakes class + `buildProposalOutput`, and the dispatcher handles the rest. C2's per-handler proposal-write duplication is avoided.

This is the load-bearing PE decision of M6. The dispatcher fork is what makes the substrate scale to N gated tools without N implementations of the proposal dance.

**outputSchema scope clarification (PE).** `tool.outputSchema` validates proposal-time output only for gated tools. Three dispatch modes:
- `requiresGate=false` (read tools): outputSchema validates handler output. Unchanged from M3.
- `requiresGate=true` + substrate `mode='allow'` (substrate bypass path): outputSchema validates handler output.
- `requiresGate=true` + substrate `mode='require_confirmation'` (D35 fork): outputSchema validates `buildProposalOutput`'s result.

Post-approval execution at `/api/agent/artifact` (§7) runs the action handler at `action-substrate/handlers/<action_type>.ts` directly — it doesn't go through `dispatchToolCall`, so `tool.outputSchema` doesn't apply there. The post-approval handler validates the audit row's payload (which mirrors the tool's `inputSchema`) and produces a typed result the endpoint converts to a `memory_write_saved` SSE event with its own validation surface. The two validation layers (proposal-time via dispatcher, execution-time via handler) are intentionally separate.

**Supersedes field convention (PE).** Tools whose `inputSchema` declares a `supersedes: string` field signal to the dispatcher that the proposal might be a correction. The dispatcher reads `validatedInput.supersedes` (if present and non-empty) and passes it to `writeArtifact`, which writes the new artifact row with `supersedes` set AND cascades the prior artifact's `state` to `'superseded'`. Tools whose semantics don't include corrections simply omit the field from their inputSchema; the dispatcher's check becomes a no-op. This is convention not contract — the field name `supersedes` is what the dispatcher looks for.

---

## 13. Phase 1 STOP — questions to answer before authoring

The first Claude Code session for M6 starts with Phase 1 STOP per CLAUDE.md discipline. Surface these questions before writing any code:

1. **Action handler registry.** Does M2's substrate have an action handler registry pattern, or are handlers inline in the bypass logic? If no registry: M6 introduces one (small extension). Surface either way.

2. **Existing CHECK constraint values.** What's the current shape of `agent_audit_log_action_type_check` and `agent_audit_log_outcome_check`? M6.1 and M6.3 migrations need to preserve any existing values not mentioned in this conventions doc.

3. **Bypass condition verification.** Confirm M2's bypass path is `source='agent_artifact'` AND `context.artifact_id` non-empty (defensive AND, not OR). Verify no silent changes from M3/M4/M5.

4. **Stakes class for write_memory_fact.** What did M2 register as the stakes class for `'memory_fact_write'`? M6's rename preserves the same class. Confirm the class string.

5. **M5 conversation reads compatibility.** Can `(dashboard)/chat/[conversation_id]/page.tsx` and `(dashboard)/chat/page.tsx` accept the extended `UITurn` shape (`pendingArtifacts: PendingArtifact[]`) without breaking changes? Verify by reading callers.

6. **Migration directory and naming convention.** What's the actual location? Confirm matches M1-M5 patterns. What's the timestamp convention?

7. **Error classifier dependencies.** What error types are already imported in `src/lib/agent/dispatcher.ts`? Need to know what's available before classifying. Postgres errors come through which library (pg? @supabase/supabase-js with explicit error codes?).

8. **`(dashboard)/layout.tsx` early-return scope.** Does the early-return for `/chat` need extension to `/api/agent/artifact`? Probably no (artifact endpoint is API, not page route, doesn't render layout) but worth verifying.

9. **MemoryArtifact prop signature compatibility.** M5's MemoryArtifact accepts `state: 'pending' | 'saved'`. M6 needs to add `'superseded'` and `'failed'` (the latter for if the post-approval write fails). Verify type signature and component handles new states gracefully.

10. **KoastMark milestone SVG addition.** M5's KoastMark.tsx is a 5-band flat mark. The milestone state needs `.ghost` (incoming band) and `.stack` (existing bands shifting). Verify the component can be extended to include these without breaking existing motion.

11. **Repomix discipline confirmation.** Per CLAUDE.md "every prompt to Claude Code should start with: 'Read ~/koast/CLAUDE.md and repomix-output.xml first.'" Confirm.

The answers become the first decisions logged in the M6 session report.

---

## 14. Implementation order (suggested)

Per the M2-M5 rhythm:

1. **Phase 1 STOP** — done. Findings logged at `~/koast/.m6-phase1-stop.md`; divergences A/B/C/D resolved (this doc reflects the resolution).
2. **Conventions doc revision** (this revision) — first authoring action; D21/D29/D35 + §17 + §5 stakes raise applied before any code change.
3. **Migrations (M6.1-M6.3)** — three separate migration files, applied to staging first then production. Verify CHECK constraint preservation. Verify rename atomicity. Verify M6.2's column-add-then-constraint-replace ordering.
4. **`agent_artifacts` writer** — `src/lib/action-substrate/artifact-writer.ts`; shared substrate module; tests.
5. **Dispatcher fork (D35)** — split `'blocked'` vs `'require_confirmation'` at `dispatcher.ts:207-246`; add `buildProposalOutput` to `Tool` interface in `types.ts`; enforce at registration for gated tools; tests verify `'blocked'` behavior unchanged + `'require_confirmation'` returns constructive success. **Checkpoint: surface dispatcher diff for review before proceeding.**
6. **write_memory_fact tool definition** — `tools/write-memory-fact.ts`; stakes class `'medium'`; `buildProposalOutput`; tests.
7. **Post-approval handler** — `action-substrate/handlers/write-memory-fact.ts`; tests.
8. **Error classifier** — `error-classifier.ts`; tests for all 6 error kinds.
9. **SSE event union expansion** — sse.ts (server) + types.ts (client) updates; tests.
10. **Loop integration** — wire write_memory_fact dispatch into runAgentTurn; per-tool error catch + classify + emit tool_call_failed; persist `active_property_id` on every turn write.
11. **Reducer extensions** — turnReducer.ts handles tool_call_failed, memory_write_pending, memory_write_saved; supersession cascade; tests. **Checkpoint: verify exhaustiveness passes for the 3 new events but still fails for `action_proposed` (forces M7).**
12. **System prompt update** — system-prompt.ts gains write_memory_fact instructions; tests verify rendered prompt.
13. **Conversation reads extension** — loadTurnsForConversation returns pending artifacts (sourced from `agent_artifacts` joined to `agent_audit_log`); tests.
14. **Artifact endpoint** — `/api/agent/artifact` route handler; tests.
15. **MemoryArtifact wiring** — component receives live data, calls endpoint on Save/Discard, consumes SSE response.
16. **ToolCall failed-state wiring** — variant already exists from M5; wire to reducer state.
17. **KoastMark milestone visual** — add .ghost/.stack SVG groups + animation; tests verify motion fires on state transition.
18. **ChatClient orchestration** — supersession cascade + milestone trigger + Save/Discard wiring. **Checkpoint: pre-staging-smoke preflight (tsc clean, npm test passing, all 14 design states + new live data paths verified).**
19. **Tests across all of the above** — ~45 new, ~250 total.
20. **Staging smoke** — live M4 endpoint test of write_memory_fact end-to-end (propose → MemoryArtifact renders → Save → memory_facts row written → milestone animation fires).
21. **Session report** — `docs/architecture/agent-loop-v1-milestone-6-report.md` matching M5's shape.
22. **Commit** — single commit; M6 conventions doc revision + implementation + report bundled. **Checkpoint: STAGED diff for commit approval, M5-format. No intermediate commits.**

---

## 15. Test discipline

Match M2-M5 patterns. M6 expected counts (rough):

- **Unit tests** (~40 new): write_memory_fact tool (proposal handler), post-approval handler, error classifier (6 kinds × edge cases), supersession cascade logic, system prompt rendering with new sections, migration assertions
- **Component tests** (0 new — M5 deferred component test infrastructure; M6 holds the line per CF17)
- **Integration tests** (~5 new): end-to-end pending-artifact flow at the reducer/hook level, supersession cascade at reducer level, parseSSEEvent for the 3 new event types, /api/agent/artifact route with both approve and discard paths, error classification through the loop
- **Staging smoke** (1): live M4 endpoint, write_memory_fact proposed → approved → memory_facts row verified → milestone animation observed

Total target: ~45 new tests. Combined with M5's existing 205, M6 lands with ~250 passing tests.

`npm test` before each commit. `npx tsc --noEmit` before each commit. Never run `npm run build` on the VPS.

---

## 16. Verification gates (before declaring M6 done)

In addition to test passes:

1. **All 3 migrations applied cleanly** — staging then production, no rollbacks, CHECK constraints preserve existing values, rename atomicity holds, M6.2 column-add-precedes-constraint-replace.

2. **The 3 new SSE events are in the active schema** (not commented as TODO) and the reducer's exhaustive check passes.

3. **The 4th forward-looking event (`action_proposed`) is still TODO** — reducer's exhaustive check should still fail for it, forcing M7 to address.

4. **No client-side imports of @/lib/agent in chat surfaces** — same invariant from M5.

5. **No legacy PMS tokens (--golden, --coastal, --mangrove, --tideline) in chat surfaces** — same invariant from M5.

6. **MemoryArtifact wired to live data** — preview routes still work; live data path also works.

7. **The supersession cascade is verified** — submitting a corrected memory write marks the prior pending row as superseded in the database.

8. **read_memory excludes superseded rows** — `memory_facts` query filters `WHERE status = 'active'` (existing column from M1's schema; values: `active | superseded | deprecated`). Verify a corrected fact's predecessor row's status flips to `'superseded'` and `superseded_by` points to the successor.

9. **Milestone animation visually completes** — Cesar verifies in browser that approving a memory write fires the deposit animation per the brand spec.

10. **Anti-patterns audit** — no inline edit forms on artifacts, no "Welcome to Koast" banner regressions, no Co-Authored-By trailers, no toast errors.

---

## 17. Anti-patterns (do not ship)

From M5 conventions §14 (still locked):
- ❌ "Welcome to Koast" banner on empty state
- ❌ Gradient backgrounds, shadow-elevated cards, purple, chip-style status pills
- ❌ Tool calls as separate cards (must be inline)
- ❌ Top-right "AI" badge or model-name indicator inside chat surface
- ❌ Icon-only primary buttons
- ❌ Typewriter cursor, toast errors, pill-rounded inputs
- ❌ Avatar in `data-state="hero"` outside marketing
- ❌ Importing from src/lib/agent/ on client side
- ❌ New color/font/spacing values
- ❌ Co-Authored-By trailers

M6-specific anti-patterns:
- ❌ Inline edit forms on MemoryArtifact (Q3 / D25 — supersession-via-conversation handles corrections)
- ❌ Reusing /api/agent/turn for artifact approval/discard (Q7 / D30 — dedicated endpoint)
- ❌ New tables for artifact storage (Q2a / D21 — use existing `agent_artifacts` for lifecycle and `agent_audit_log` for accountability; pair them via the new `audit_log_id` FK; don't replace either)
- ❌ Bundled migration files (Q6 / D29 — one lifecycle-concern per file; M6.2's three ALTERs all encode the artifact-lifecycle concern)
- ❌ Adding lifecycle/state semantics to `agent_audit_log.outcome` (D25 — the execution-outcome enum is for execution outcomes only: succeeded/failed/pending. Lifecycle state goes on `agent_artifacts.state`. Don't conflate accountability with lifecycle.)
- ❌ Auto-retry on the post-approval handler's failure (M6 step 15 anti-pattern flip side — failed-state retry is host-driven via the MemoryArtifact's "Try again" button, not auto-retry by the substrate. The artifact endpoint's idempotency guard handles the second attempt correctly: the original audit row is `outcome='pending'` until the host re-acts, so a retry calls into the same handler shape. Auto-retry would mask transient failures the host should see.)
- ❌ Statistical inference proposals from the agent without citation or without 3+ supporting signals (Q4 / D26 — case 5 allowed only with citation requirement and conservatism bias)
- ❌ Skipping the pre-write read_memory call (Q4 / D27 — the agent must check existing facts)
- ❌ Adding `action_proposed` to the active SSE schema (M7 work; reducer exhaustive check should still fail for it)
- ❌ Sub_entity_type expansion (deferred until real-use surfaces gaps)
- ❌ `agent_conversations.title`/`preview` columns (deferred)
- ❌ Adding new dependencies (M5 invariant; component test infrastructure stays deferred)

---

## 18. Carry-forwards (open items beyond M6)

These are decisions deferred or items that need attention beyond M6's scope. Carried forward from M5's §10 + new in M6.

### Carried forward from M5 (still active)

3. Mobile drawer interaction polish (M5 implementation; needs polish pass)
4. Tablet breakpoint (640-960px refinement)
5. Dark mode QA pass on states 04/06/08/10/14
6. Accessibility audit (formal, per design README requirements)
7. Keyboard shortcut completion (`↑` recall deferred from M5)
8. "↓ new" pill for scroll-to-latest (auto-scroll rule shipped M5)
9. Conversation grouping rule refinement
11. Audit log surface (chat shell topbar icon currently wired to nothing)
12. Error variant designs beyond connection-loss
13. Action proposal collapse-after-approval (M7 with action_proposed)
14. Long-prose tool-call collapse-all
16. Self-hosted fonts conversion to woff2
17. Component test infrastructure (deferred; would breach no-deps invariant)
19. Timestamp canonical strategy (suppressHydrationWarning is M5 escape hatch)

### New in M6

20. **`action_proposed` event + non-memory action artifacts** — the 4th forward-looking event from M5 stays TODO. M7 adds it with the first non-memory action type (most likely `propose_guest_message`).

21. **Agent awareness of long-term pending artifacts** — agent currently has no signal about its own past-proposed-but-unresolved artifacts on conversation reopen. Future product decision (M7+): does agent surface these proactively, or stay silent until host acts?

22. **Sub_entity_type expansion beyond M1's 6 canonical types** — real use will surface gaps ("the handyman is Joe's Plumbing" doesn't fit). Future milestone adds new types via CHECK constraint update + system prompt update.

23. **`agent_conversations.title`/`preview` columns** — derivation works at v1 scale. Migrate when performance or feature load demands.

24. **Chat shell navigation / structured surfaces** — the chat is currently the only surface in the new brand chrome. Legacy dashboard surfaces (Properties, Calendar, Pricing, Messages) exist in legacy brand. Future milestone designs the navigation model (tab strip? structured property views? merge legacy surfaces?) and migrates accordingly.

25. **Stakes class re-evaluation** — write_memory_fact is `medium` stakes (D35; raised from the originally-proposed `low` because writes shape the agent's behavior across future conversations). Future milestones may add high-stakes actions (price changes, message sends) — verify stakes registry properly differentiates per Q5's failure model and the dispatcher fork's handling of each mode.

26. **Cascade behavior for deletion** — if a host deletes a property (currently no UI for this), what happens to its memory_facts? To pending artifacts referencing it? Future milestone defines the cascade. M6 doesn't address; FK constraints provide minimum safety.

27. **Audit log outcome enum may benefit from a 'cancelled' / 'dismissed' value** — M6's discard path uses `error_message='dismissed_by_host'` as a sentinel to distinguish host-side dismissal from real execution failure on `outcome='failed'` audit rows. This is acceptable but brittle: future audit-log surfaces (the topbar audit icon — CF11) must filter on the sentinel string when reporting real execution failures. A clean fix is a future migration adding a `'cancelled'` or `'dismissed'` value to the agent_audit_log_outcome_check CHECK constraint, then updating the artifact endpoint's discard path to use it. Defer until the audit-log surface ships and surfaces the brittleness in practice.

28. **Live state-feed-through from /api/agent/artifact SSE response into the reducer** — M7+ polish. M6 step 18 uses `router.refresh()` after the milestone animation so the substrate re-reads cleanly; the cost is a small visible flash between optimistic UI and the refreshed state. A polish iteration would consume the saved/discarded events back into the same reducer (or a sibling hook) so the in-memory state stays live without round-tripping through the server. Round-trip cost at v1 scale is acceptable.

29. **KoastMark milestone visual** — animation fires correctly per M6 step 17 + the trigger delta (CP4 verified `[dispatcher] gated to require_confirmation` flow ends with `data-state='milestone'` on the most-recent koast avatar for 2s). The architectural trigger is right; the visual impact lands closer to "a little animation" than the brand spec's deposit metaphor of "a fact settling into place." Future polish pass refines:
    - Animation duration and easing curve (currently 2s ease-out; may benefit from a longer settle phase or a different curve that emphasizes the deposit moment)
    - Visual prominence of the ghost band's entry (color, opacity curve, vertical offset starting position)
    - Possible accompanying micro-effects (subtle scale on the avatar, brief glow within brand constraints)
    - Coordination with the MemoryArtifact's pending → saved transition (synchronized motion across both elements)

    M6 ships with the architecturally-correct trigger; visual refinement happens in a future polish milestone driven by real-use feedback on what the deposit moment should feel like.

30. **Tool-architectural enforcement of D27 (pre-write read_memory)** — write_memory_fact's dispatcher could require the agent to have called read_memory in the same turn for the same property + sub_entity_type before write_memory_fact is dispatched, refusing the proposal otherwise. This makes D27 a hard substrate-level rule rather than a system-prompt-only instruction. PE — every future correction-capable tool inherits the pattern.

    Surfaced live during CP4 F-1: the agent skipped read_memory and proposed with `supersedes` (artifact-id) instead of `supersedes_memory_fact_id` (memory_fact_id) for what was actually a saved-fact correction, breaking the post-approval supersession cascade. M6 ships with system-prompt-level guarantees only (revised CASE 4 section makes it mandatory in language); substrate enforcement is the durable fix.

    Defer to a polish milestone where substrate enforcement is judged necessary by real-use signal. M6's runtime behavior isn't 100% deterministic — system-prompt makes correct behavior likely, substrate enforcement (this CF) would make it certain.

---

## 19. Success criteria

M6 is complete when:

- All 3 migrations applied cleanly to staging and production environments
- `write_memory_fact` tool registered, dispatchable, and tested
- Post-approval handler executes writes correctly via the substrate's bypass path
- The 3 new SSE events are in the active schema; reducer handles them; integration test verifies the full flow
- The 4th forward-looking event still TODO (M7 lock-in)
- MemoryArtifact wired to live data; preview routes still work
- ToolCall failed-state variant wired to live errors
- KoastMark milestone animation visually completes on approve
- Supersession cascade works correctly (pending and saved variants)
- read_memory excludes superseded rows
- System prompt update teaches the agent the new tool + supersession + cases 1-5 with citation requirement + conservatism bias + when-uncertain-ask
- /api/agent/artifact endpoint working for both approve and discard
- Staging smoke verifies end-to-end: propose → render → approve → write → milestone
- ~250 passing tests; no new dependencies
- Session report written
- Single commit lands with no Co-Authored-By trailer
- The first real demonstration of memory writing in Koast: Cesar tells the agent something about a property, the agent proposes saving it, Cesar approves, the fact persists, future conversations recall it

---

*End of M6 conventions. Updated as Phase 1 STOP and implementation surface new architectural questions.*
