# M7 Implementation Prompt — propose_guest_message + first non-memory gated action

> Send to Claude Code on the Virginia VPS. The prompt is self-contained: read it top to bottom, follow Phase 1 STOP discipline, surface decisions, ship.

---

## Bootstrap (do this first, no exceptions)

1. Read `~/koast/CLAUDE.md` in full. Discipline rules from M5/M6 lessons should be folded in (post-checkpoint).

2. Run `cd ~/koast && npx repomix` and review `repomix-output.xml`. Note any architectural patterns from M6's commit (171f732) that the M7 conventions doc may not fully account for.

3. Read `~/koast/docs/architecture/agent-loop-v1-milestone-7-conventions.md` in full. The 11 decisions in §12 (D38-D48) are pre-authoring locks. Phase 1 STOP questions in §13 need answers from actual repo state.

4. Read M6 conventions for inheritance context: `~/koast/docs/architecture/agent-loop-v1-milestone-6-conventions.md`. Particularly §12 D20-D37 (substrate decisions M7 inherits).

5. Read M2-M6 substrate files to confirm M7's assumptions hold:
   - `src/lib/action-substrate/` — D35 fork's bypass conditions, action handler registry pattern from M6
   - `src/lib/agent/dispatcher.ts` — verify lines 207-246 unchanged from M6's commit
   - `src/lib/agent/loop.ts` — active_property_id persistence from M6
   - `src/lib/agent/sse.ts` — current schema (post-M6 with `memory_write_pending` and `memory_write_saved` active)
   - `src/lib/agent-client/turnReducer.ts` — existing exhaustive switch with `_exhaustive: never` default; the 4th forward-looking event `action_proposed` already a TODO
   - `src/lib/agent-client/types.ts` — Zod schemas; `ForwardLookingActionProposed` type-only declaration ready for activation
   - `src/components/chat/MemoryArtifact.tsx` — pattern reference for GuestMessageProposal
   - `src/components/chat/ChatClient.tsx` — orchestration patterns for the new artifact component
   - `src/lib/agent/system-prompt.ts` — current monolithic structure (M7 restructures into per-capability sections)

6. Read the schema as it exists today:
   - `agent_artifacts` (post-M6.2): verify CHECK constraint includes `'edited'` value
   - `agent_audit_log`: verify outcome enum unchanged ('succeeded', 'failed', 'pending')
   - Legacy PMS guest thread tables: surface their actual location (Phase 1 STOP Q1)

If any of those files are missing or in unexpected locations, **STOP and surface the discrepancy** — do not improvise.

---

## Phase 1 STOP — answer these before authoring

The conventions doc §13 lists 10 questions. Work through them in order, document findings, and surface any that diverge from the conventions doc's assumptions.

1. **Legacy PMS guest thread schema location.** Where do existing guest threads live in Supabase? Verify table names, primary key, RLS policies. M7's read_guest_thread query depends on this.

2. **Channex send API.** Confirm endpoint, auth, request shape, response shape, idempotency support. Existing PMS substrate may have helpers; surface them.

3. **agent_artifacts.state CHECK includes 'edited'.** Verify against current schema (post-M6.2 migration).

4. **Tool interface ready for editable flag.** Read `src/lib/agent/types.ts`. Does Tool interface need extension, or just add the optional field?

5. **D35 dispatcher fork compatibility with editable=true tools.** Verify the fork doesn't change behavior when an editable tool is registered.

6. **MemoryArtifact regression check.** After SSE event rename, MemoryArtifact's reducer interaction must still fire correctly on `action_completed` with `action_kind='memory_write'`.

7. **Existing M6 audit_log rows.** After SSE rename, do existing audit rows still surface correctly via `loadTurnsForConversation`?

8. **Channex API rate limits.** Does Channex enforce rate limits affecting the post-approval handler retry behavior?

9. **`action_proposed` reducer exhaustiveness.** When activated, reducer's exhaustive-check needs to handle it AND no remaining forward-looking events should exist (or surface what M8+ should plan).

10. **System prompt cache invalidation strategy.** First-turn behavior on M7 deploy; verify acceptable.

**Output format:** create `~/koast/.m7-phase1-stop.md` (gitignored). For each question: actual answer, match-vs-divergence with conventions doc, recommended action.

After writing the file, **STOP**. Surface a summary in chat (10-20 lines max) and wait for explicit approval before proceeding.

---

## Decisions to lock (during authoring)

The conventions doc §12 has 11 decisions (D38-D48). Phase 1 STOP may surface additional decisions worth locking. Add them in real-time as they're made; capture in `agent-loop-v1-milestone-7-conventions.md` §12 with brief rationale.

Likely additional decisions during authoring:
- **D49+:** Channex API client pattern (where does the API client live? `src/lib/integrations/channex/` or similar?)
- **D50+:** chosen system prompt section ordering / section header conventions
- **D51+:** any other decisions surfaced during steps 2-15

Add to conventions doc §12 in real-time. Don't accumulate at the end.

---

## Implementation order

Per conventions §14, with 16 steps:

1. **Phase 1 STOP** — done above. Wait for approval.

2. **SSE event rename** (D39):
   - Rename `memory_write_pending` → `action_proposed` in `sse.ts` and `types.ts`
   - Rename `memory_write_saved` → `action_completed`
   - Add `action_kind` discriminator field to both
   - Update `turnReducer.ts` switch cases
   - Update ChatClient milestone trigger condition (now: `action_completed && action_kind === 'memory_write'`)
   - Update tests accordingly
   - Run preflight: tsc + tests verify M6 memory write flow still works
   - **CP1: surface SSE rename diff for review before proceeding** (regression-sensitive change to working M6 substrate)

3. **Tool interface `editable` flag** (D38):
   - Add optional `editable: boolean` to Tool interface in `src/lib/agent/types.ts`
   - Default false (preserves M6 behavior)
   - Dispatcher reads it but doesn't change fork behavior
   - Tests for the interface extension

4. **`read_guest_thread` tool** (D44):
   - File: `src/lib/agent/tools/read-guest-thread.ts`
   - Mirrors M3's read-memory.ts pattern
   - Phase 1 STOP must have surfaced legacy PMS schema; query against it
   - Returns thread + booking context
   - Registered in tools/index.ts
   - Tests including RLS verification

5. **`propose_guest_message` tool** (D38, D46, D47):
   - File: `src/lib/agent/tools/propose-guest-message.ts`
   - Gated, medium stakes, artifactKind='guest_message_proposal', editable=true
   - buildProposalOutput synthesizes proposal output for the model
   - Tool's handler is a guard that throws (D35 fork bypasses)
   - Registered in tools/index.ts
   - Tests

6. **Post-approval handler** (D42):
   - File: `src/lib/action-substrate/handlers/propose-guest-message.ts`
   - Validate host owns booking via booking_id → property_id → host_id
   - Read message_text from artifact.payload (or edited_text if state='edited')
   - Call Channex send API
   - Channex success: record channex_message_id in commit_metadata; return success
   - Channex failure: return failure (substrate transitions to state='failed')
   - Retry idempotency: check channex_message_id absence before re-send
   - Tests including failure path + retry behavior

7. **Channex API integration** (D49+ if surfaced):
   - Client wrapping existing PMS Channex auth/connection
   - Send endpoint wrapper with typed request/response
   - Error mapping to error-classifier kinds (validation/transient/etc)
   - Tests with mocked Channex responses

8. **`/api/agent/artifact` endpoint extension for edit action**:
   - Handles `{ artifact_id, action: 'edit', edited_text }` in addition to approve/discard
   - Auth + ownership + state='emitted' check
   - Updates `agent_artifacts.payload.edited_text` (preserve original `message_text`)
   - Updates `agent_artifacts.state` to 'edited'
   - Returns JSON: `{ ok: true, state: 'edited', edited_text }`
   - Tests for happy path + ownership violation + bad state

9. **System prompt restructuring** (D40, D41):
   - File: `src/lib/agent/system-prompt.ts`
   - Restructure into: Identity / Tools available / Cross-capability rules / Memory tools / Guest messaging tools / Behavior boundaries
   - Channel-aware drafting rules in Guest messaging section per D41
   - Tests verify all sections render

10. **Reducer extensions for renamed events with action_kind branching**:
    - turnReducer handles `action_proposed` with action_kind='memory_write' or 'guest_message'
    - Per-action-kind block construction (memory_artifact for memory_write; guest_message_artifact for guest_message)
    - Same for `action_completed` event handling
    - Tests for both action_kinds

11. **GuestMessageProposal component** (D43):
    - File: `src/components/chat/GuestMessageProposal.tsx`
    - 4 states: pending (Approve/Edit/Discard), edited (Approve/Discard, "edited by host" subtitle), sent ("Sent · channel" pill, no actions), failed (error, Try-again)
    - Inline edit textarea opens on Edit click
    - Save edit POSTs to /api/agent/artifact with action='edit'
    - Save sends → POST with action='approve'; Discard → action='discard'
    - Component test setup if available (still deferred per M5 CF17; integration tests cover behavior)

12. **ChatClient orchestration**:
    - Render GuestMessageProposal for action_kind='guest_message' artifacts
    - Route edit/approve/discard to /api/agent/artifact
    - Handle action_proposed/action_completed reducer events
    - Milestone trigger: only fires for action_kind='memory_write' (per existing M6 behavior); guest_message uses different motion (TBD or none for M7)

13. **Conversation reads extension**:
    - `loadTurnsForConversation` returns guest_message artifacts alongside memory artifacts (existing pendingArtifacts pattern)
    - Filter: state IN ('emitted', 'edited', 'confirmed', 'failed', 'superseded')
    - Tests verify both artifact kinds render in history scrollback

14. **Tests across all** (~50-70 new, ~330-350 total):
    - Unit: tools, handlers, error classifier extensions, edit endpoint, reducer
    - Integration: SSE rename end-to-end, edit flow, approve flow with mocked Channex, Try-again flow
    - **CP3: preflight (tsc + npm test passing) before staging smoke**

15. **Staging smoke** — full live flow:
    - Cesar drives browser; Claude Code captures server-side
    - Open chat shell, select Villa Jamaica
    - Submit prompt: "There's a guest asking about late check-in for booking <id>. Can you draft a reply?"
    - Expected sequence:
      * `turn_started`
      * `tool_call_started` for read_guest_thread → returns thread
      * `tool_call_started` for propose_guest_message
      * `action_proposed` (action_kind='guest_message')
      * `tool_call_completed`
      * agent's confirmation text
      * `done`
    - Verify GuestMessageProposal renders with 4 buttons (Approve / Edit / Discard / depending on state)
    - Click Edit; verify inline textarea opens; modify text; click Save
    - Verify state='edited' persisted (refresh check); verify "edited by host" subtitle visible
    - Click Approve; verify Channex send fires; verify guest message appears on real OTA
    - Verify state='confirmed' + channex_message_id captured in commit_metadata
    - Edge case: simulate Channex failure (mock or actual transient); verify state='failed' + Try-again button; click Try-again; verify retry succeeds (Channex idempotency holds)
    - **CP4: full SSE event sequence + Channex roundtrip verification + edit-flow verification**

16. **Session report**:
    - File: `~/koast/docs/architecture/agent-loop-v1-milestone-7-report.md`
    - Match M6's report shape
    - Sections: SUMMARY, ADDED, MODIFIED, ARCHITECTURAL DECISIONS (D38-D48 + any added), PHASE 1 STOP FINDINGS, STAGING SMOKE, VERIFICATION, STATS, CARRY-FORWARDS

17. **Single commit** with conventions doc + implementation + report.

---

## Test discipline

Match M6 patterns. M7 expected counts:

- **Unit tests** (~40 new): read_guest_thread query, propose_guest_message tool, post-approval handler (success + Channex failure + retry + idempotency), error classifier extensions if Channex error codes need new mappings, edit endpoint, reducer for renamed events with action_kind branching
- **Component tests** (0 new — M5 CF17 component test infrastructure stays deferred)
- **Integration tests** (~10 new): SSE event rename roundtrip, edit flow at reducer level, approve flow with Channex mocked, Try-again flow with idempotency, ChatClient renders GuestMessageProposal correctly per state
- **Staging smoke** (1): real browser, real Channex send. Verify guest receives message via real OTA.

Total target: ~50-70 new tests. Combined with M6's 279 → ~330-350 passing.

---

## Verification gates (before declaring M7 done)

Per conventions §16:

1. SSE rename complete: no `memory_write_pending` / `memory_write_saved` references in active code
2. M6's MemoryArtifact still works (regression-free)
3. read_guest_thread returns correct thread data with channel
4. propose_guest_message proposes via D35 fork
5. Inline edit produces state='edited' with edited_text preserved
6. Approve from edited sends edited_text to Channex
7. Approve from pending sends original message_text to Channex
8. Channex success → state='confirmed' + channex_message_id captured
9. Channex failure → state='failed' + Try-again works + idempotency on retry
10. System prompt restructured per D40
11. tsc clean; ~330-350 tests passing
12. No new dependencies
13. Anti-patterns audit clean

---

## Commit format

Subject line:

```
Agent loop v1 Milestone 7 — propose_guest_message + first non-memory gated action
```

Body sections (M6 pattern):

1. **SUMMARY** — Second gated tool exercises M6's substrate pattern; first non-memory action with external integration; agent drafts guest messages, host edits and approves, Channex delivers to OTA. SSE event canonicalization activates `action_proposed` (M7 forcing function from M5/M6 type-only declaration).

2. **WHAT'S NEW** — read_guest_thread tool, propose_guest_message tool, post-approval handler with Channex integration, GuestMessageProposal component with 4 states + inline edit, SSE event rename to action_proposed/action_completed with action_kind discriminator, system prompt restructuring per-capability, channel-aware drafting

3. **MIGRATIONS** — 0 (M7 substrate work is code-side; agent_artifacts.state CHECK already includes 'edited' from M6.2; SSE renames are code-only)

4. **ARCHITECTURAL DECISIONS** — 11 from §12 (D38-D48), plus any added during authoring (D49+)

5. **PHASE 1 STOP FINDINGS** — summary of 10 questions and answers, particularly any divergences

6. **STAGING SMOKE** — full propose-then-edit-then-approve flow + Channex roundtrip + edge case

7. **VERIFICATION** — 13 gates passed

8. **STATS** — total LOC

9. **CARRY-FORWARDS** — continued from M6's 31 + new in M7 (32-38 from conventions §18)

10. **NO Co-Authored-By trailer**

---

## Approval gate

Do not commit. After verification:

1. Show staged diff with `git diff --stat --cached`
2. Show commit message preview (use `.m7-cp5-draft.txt` sentinel pattern; `git commit -F` to preserve byte-exact content)
3. Confirm exclusions
4. **CP5: wait for explicit approval before commit + push**

---

## Critical reminders (from CLAUDE.md)

- Never `npm run build` on the VPS
- No Co-Authored-By trailers
- Read CLAUDE.md and repomix-output.xml first
- Phase 1 STOP discipline (multi-round; surface findings before proceeding)
- Use `git commit -F .m7-cp5-draft.txt` for the long commit message
- Pre-flight `git status` before commit; never `git add -A` with intentionally-untracked items present
- Strip implementation-step-number references from commit body during CP5 review (M6 lesson)
- Long staging smokes: surface bugs at smoke-time before any commit; iterate fix-then-resmoke
- Use `/ultraplan` from the start (M7 qualifies — multi-file, cross-substrate)

---

## Anti-patterns (do not ship)

From conventions §17, restated:

- ❌ Sending to Channex without host approval (every guest message goes through propose-then-approve)
- ❌ Auto-retry loops on Channex failure (host-driven retry only via Try-again button)
- ❌ Multi-message proposals in one artifact
- ❌ Drafting messages for guests Koast doesn't have a thread for (always read_guest_thread first)
- ❌ Hardcoded channel logic in component code (channel routing happens at handler level)
- ❌ Persisting Channex message_id outside agent_artifacts.commit_metadata
- ❌ Adding `'sent'` as new state to agent_artifacts.state CHECK (sent is display, substrate tracks 'confirmed')
- ❌ Inline edit forms on MemoryArtifact (different from GuestMessageProposal — MemoryArtifact intentionally has no edit)
- ❌ New dependencies without explicit justification
- ❌ Step-numbered references in commit body
- ❌ Force pushes; rewriting published commits

---

## Out of scope

If you discover any of these during M7, **STOP and surface them**:

- propose_property_note (deferred to small follow-up commit if real use surfaces need)
- propose_price_change / propose_cleaner_assignment / propose_block_dates (M8+)
- Multi-message drafting in single propose
- Guest-thread-bound conversations (currently property-bound)
- Tone presets / pre-approved templates / auto-send (CF #36)
- Send-after-edit cycle (M7 single-edit-then-approve only; CF #37)

If implementation surfaces a need for any of these, capture as carry-forward, work around it, continue. Don't expand M7 scope without explicit approval.

---

## Final instruction

Begin with bootstrap. Then Phase 1 STOP. Surface findings. Wait for approval. Then proceed sequentially through the 16-step implementation order. CP1/CP3/CP4/CP5 checkpoints surface for review before proceeding to next step.

If anything in this prompt is ambiguous or contradicts the conventions doc / actual repo state / CLAUDE.md, **STOP and surface the conflict** — don't make a unilateral call.

Ship M7 cleanly. Quality bar matches M6: substrate proves it scales to non-memory actions with external integrations; the first real demonstration of agent-drafted guest messaging in Koast happens; foundation actually solid for M8+ tools to build on.
