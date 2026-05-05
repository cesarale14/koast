# Agent loop v1 — Milestone 7 conventions

> **Status:** forward-looking decisions, pre-authoring. Updated as Phase 1 STOP surfaces architectural questions against actual repo state at M7 kickoff.
>
> **Predecessors:** M1 (schema), M2 (action substrate), M3 (tool dispatcher + read_memory), M4 (agent loop server), M5 (chat shell), M6 (write_memory_fact + first gated write end-to-end + dispatcher fork D35).
>
> **Pattern weight:** M7 is the **second gated tool** to use M6's pattern, but the first to address a non-memory capability with external system integration. Most architectural decisions inherit from M6; new decisions are about what's specific to guest messaging.

---

## 1. Scope

M7 ships **two new agent tools for guest messaging**:

1. **`read_guest_thread`** (non-gated) — agent reads existing message thread for a guest/booking
2. **`propose_guest_message`** (gated, medium stakes) — agent drafts a reply; host approves; Channex sends to OTA → guest

This is the first proof that M6's substrate scales to **non-memory capabilities with external system side effects**. Every architectural decision M6 established is inherited; M7 exercises the substrate against new ground (free-text artifacts, host inline editing, real external delivery via Channex).

In scope for M7:
- `read_guest_thread` tool — queries existing PMS thread storage; returns thread, channel, booking context
- `propose_guest_message` tool — gated medium-stakes; D35 fork emits proposal artifact
- Post-approval handler at `action-substrate/handlers/propose-guest-message.ts` — calls Channex send API; verifies success before marking artifact `state='confirmed'`
- New `GuestMessageProposal` chat-shell component with 4 states + inline edit affordance (`pending` / `edited` / `sent` / `failed`)
- Per-action-type `editable: boolean` flag on Tool interface; M7 introduces inline edit
- Activation of `'edited'` state in `agent_artifacts.state` enum (already in CHECK constraint per M2; M7 uses it for first time)
- SSE event canonicalization: rename `memory_write_pending` → `action_proposed`, `memory_write_saved` → `action_completed`, with `action_kind` discriminator field
- Reducer + ChatClient updates for renamed events + GuestMessageProposal rendering
- System prompt restructured into per-capability sections (Memory tools, Guest messaging tools) with cross-capability rules (citation, supersession, conservatism, pre-write reads) at top
- Channel-aware drafting baked into system prompt (Airbnb conversational, Booking.com formal, etc.)
- Channex API integration in post-approval handler; failure → state='failed' with retry affordance
- 1-2 schema migrations for the SSE event renames + Tool interface `editable` flag persistence (if needed)

Out of scope for M7 (deferred):
- `propose_property_note` tool (smaller capability bundled debate; deferred)
- Other non-memory actions (`propose_price_change`, `propose_block_dates`, `propose_cleaner_assignment` — all M8+)
- Agent-initiated guest messaging without explicit host trigger (M7 only proposes when host asks)
- Multi-message drafting in a single propose (one message per artifact)
- Direct send (skipping host approval) for any guest message
- Threading behavior changes (M7 reads/sends to existing threads; doesn't create new threads or change threading model)
- Guest-facing UI (no guest sees Koast; only the message Koast drafts via the host)
- Sub_entity_type expansion beyond M1's 6 (carried from M6 CF #22)
- Visible polish carry-forwards from M5/M6 (mobile drawer, dark mode, milestone visual polish, etc.)

---

## 2. Source of truth

| Source | Treatment |
|--------|-----------|
| M6 architectural decisions D20-D37 | Inherited as substrate baseline. Each decision propagates to M7 unless explicitly amended. |
| M6 D35 dispatcher fork | Used for `propose_guest_message`; no fork changes. M7 is first beyond-memory consumer. |
| M6 dual-tier supersession (D25/D36) | Inherited but unused in M7 — guest messages don't supersede each other (each message is independent send). |
| M6 paired audit_log_id FK | Inherited; agent_artifacts row paired with audit_log row identically to M6. |
| M6 /api/agent/artifact endpoint | Inherited; polymorphic dispatch via action handler registry; new handler registered for guest_message kind. |
| M6 ChatClient orchestration | Extended for GuestMessageProposal rendering + edit interaction. |
| M2 stakes registry | New entry: `'propose_guest_message'` registered as medium stakes. |
| M2 agent_artifacts.state CHECK | Already includes `'edited'` (per pre-M2 schema design); M7 first activator. |
| Channex API | External system; M7's post-approval handler calls send endpoint. Existing PMS substrate handles auth/connection. |
| Legacy PMS guest thread schema | Source of truth for thread data; `read_guest_thread` queries it. |

**Locked invariants from prior milestones:**
- 6 canonical sub_entity_types unchanged (M7 doesn't write memory_facts)
- Plus Jakarta Sans + JetBrains Mono typography
- 9 semantic palette tokens
- Motion vocabulary (idle / active / milestone / hero) — guest message send may trigger a different motion (TBD)
- M5's reducer + hook pattern (no new state libraries)
- No new dependencies (M5 invariant; M7 holds the line)

---

## 3. Pattern-establishing vs M7-specific

| Decision | Tag | Rationale |
|----------|-----|-----------|
| D38 Tool interface `editable` flag | PE | Per-action-type edit affordance. Future tools opt in. |
| D39 SSE event canonicalization (rename) | PE | One canonical "action proposed" event; `action_kind` discriminator. Future actions inherit. |
| D40 System prompt per-capability sections | PE | Restructure pattern. Future capabilities follow. |
| D41 Channel-aware drafting via prompt | M7 partial / PE partial | Specific OTA conventions are M7; "tools receive channel context, prompt teaches conventions" is PE. |
| D42 Channex post-approval verification | M7 specific | Send must succeed before state='confirmed'; failure → state='failed'. |
| D43 GuestMessageProposal component | M7 specific | New artifact component shape; future tools may share patterns or introduce their own. |
| D44 read_guest_thread tool definition | M7 specific | Read tools follow M3 pattern. |
| D45 'edited' state activation in agent_artifacts | PE | First use of pre-existing CHECK enum value. |

PE-tagged decisions earn proportionate care because they propagate.

---

## 4. Schema migrations

**M7.1 — Tool interface `editable` flag persistence (if needed).**

Decision: does `editable` need to be in DB, or is it tool-registration-only?

Tool registration happens in code; `editable: true | false` is a property of the Tool definition. The dispatcher reads it at runtime. **No DB migration needed for the flag itself.**

What MIGHT need migration: if we want the `agent_artifacts` row to record whether edit is permitted (so chat shell can render UI without re-querying tool definitions), we'd add `editable: boolean` column. But this duplicates info that's already derivable from the action_type string.

**Decision:** no migration for editable. Chat shell looks up tool's editable flag from a simple hardcoded map (or tool registry export) when rendering artifacts. Cheap, no schema churn.

**M7.2 — SSE event rename (data-only migration if needed).**

The rename `memory_write_pending` → `action_proposed` and `memory_write_saved` → `action_completed` is a code-side change to `sse.ts` and `types.ts`. No DB rows are typed by SSE event names.

**Decision:** no migration. Code changes only.

**Net for M7: 0 migrations.**

This is unusual for a milestone but accurate — M7's substrate work is on the code side; M6's M6.2 already gave us the agent_artifacts.state CHECK with all 5 enum values present.

---

## 5. The two new tools

### read_guest_thread

`src/lib/agent/tools/read-guest-thread.ts`. Mirrors M3's `read-memory.ts` pattern.

```typescript
export const readGuestThreadInputSchema = z.object({
  booking_id: z.string().uuid(),
  // Optional: max_messages to limit context window cost
  max_messages: z.number().int().min(1).max(50).default(20),
});

export const readGuestThreadOutputSchema = z.object({
  thread: z.array(z.object({
    sender: z.enum(['guest', 'host', 'platform']),
    timestamp: z.string().datetime(),
    text: z.string(),
    channel: z.string(),  // airbnb, booking_com, vrbo, direct
  })),
  booking: z.object({
    id: z.string().uuid(),
    property_id: z.string().uuid(),
    guest_name: z.string(),
    check_in: z.string().date(),
    check_out: z.string().date(),
    channel: z.string(),
  }),
});

export const readGuestThread: Tool = {
  name: 'read_guest_thread',
  description: 'Retrieve the message thread for a guest booking, including channel and booking context.',
  inputSchema: readGuestThreadInputSchema,
  outputSchema: readGuestThreadOutputSchema,
  requiresGate: false,
  // No stakesClass needed (non-gated)
  handler: async (input, context) => {
    // Query legacy PMS schema for thread data
    // Return thread + booking context
  },
};
```

Phase 1 STOP must surface: actual location of legacy PMS guest thread schema. Likely Supabase tables; verify table names and RLS policies for the host_id filtering.

### propose_guest_message

`src/lib/agent/tools/propose-guest-message.ts`. Mirrors M6's `write-memory-fact.ts` pattern.

```typescript
export const proposeGuestMessageInputSchema = z.object({
  booking_id: z.string().uuid(),
  message_text: z.string().min(1).max(5000),  // Channex max varies; 5000 is generous upper bound
  // No supersedes — guest messages don't supersede each other
});

export const proposeGuestMessageOutputSchema = z.object({
  artifact_id: z.string().uuid(),
  audit_log_id: z.string().uuid(),
  outcome: z.literal('pending'),
});

export const proposeGuestMessage: Tool = {
  name: 'propose_guest_message',
  description: 'Propose a guest message draft for host review and approval. Drafts go to the artifact substrate; host approves to send via Channex.',
  inputSchema: proposeGuestMessageInputSchema,
  outputSchema: proposeGuestMessageOutputSchema,
  requiresGate: true,
  stakesClass: 'medium',
  artifactKind: 'guest_message_proposal',
  editable: true,  // NEW per D38
  handler: async () => {
    // Guard that throws — D35 dispatcher fork bypasses this
    throw new Error('propose_guest_message handler should not run; D35 fork intercepts');
  },
  buildProposalOutput: (input, ctx, refs) => ({
    artifact_id: refs.artifact_id,
    audit_log_id: refs.audit_log_id,
    outcome: 'pending',
    message: `Drafted guest message for booking ${input.booking_id}; awaiting host approval.`,
  }),
};
```

---

## 6. Post-approval handler

`src/lib/action-substrate/handlers/propose-guest-message.ts`.

```typescript
export async function proposeGuestMessageHandler(
  artifact: AgentArtifactRow,
  context: HandlerContext
): Promise<HandlerResult> {
  // 1. Validate host owns the booking (defensive ownership check via booking_id → property_id → host_id)
  // 2. Read the message_text from artifact.payload (or artifact.payload.edited_text if state='edited')
  // 3. Call Channex send API with booking_id, channel, message_text
  // 4. If Channex returns success: 
  //    - record channex_message_id in artifact.commit_metadata
  //    - return { success: true, message_id: <channex_id> }
  //    (Substrate transitions artifact to state='confirmed', audit to outcome='succeeded')
  // 5. If Channex returns failure:
  //    - return { success: false, error: <details> }
  //    (Substrate transitions artifact to state='failed', audit to outcome='failed' with error_message)
  //    Host sees Try-again in UI; second attempt re-runs handler from step 3
}
```

**Defensive design:**
- Channex API call wrapped in retry-once-on-transient-failure (network blip, etc.)
- Specific Channex error codes mapped via error-classifier (existing M6 module)
- Idempotency: if same artifact is re-attempted (Try-again click), check if Channex already received this attempt via channex_message_id absence in commit_metadata. Channex itself may have idempotency; verify in Phase 1 STOP.

### §6 amendment (post-CP4 smoke)

The pre-authoring §6 draft above said "Substrate transitions artifact to state='failed', audit to outcome='failed' with error_message" on Channex failure. This conflicted with §17's anti-pattern about adding 'sent' as a new state ("sent is a display concept; substrate only tracks 'confirmed'"). The same pull applies to 'failed': failure is also a display concept. The shipped implementation resolves the tension as follows:

- On `ChannexSendError`: artifact stays `state='emitted'`. The paired `agent_audit_log.outcome` flips to `'failed'`, and `agent_artifacts.commit_metadata.last_error = { message, channex_status, attempted_at }` carries the signal for downstream UI rendering.
- On `ColdSendUnsupportedError` (M7 cold-send pre-flight gates G1-G4): artifact also stays `state='emitted'`. `last_error.channex_status: null` (Channex was never reached; the handler refused at a local gate) and `last_error.gate: <ColdSendGate>` captures the constraint identifier. SSE error code is `'cold_send_unsupported'` (distinct from `'channex_send_failed'`) so the chat shell can differentiate.
- Try-again re-POSTs `action='approve'` and re-runs the handler. The route's pre-execute audit flip resets `outcome='failed' → 'pending'` per attempt; the lifecycle stays clean. The artifact remains actionable.
- Truly unrecoverable failures (ownership, booking missing, post-Channex-200 db hiccup) re-throw past the inner catch into the outer catch, which applies M6's `state='dismissed'` pattern.

The `agent_artifacts.state` enum keeps its M2 / M6.2 shape — `emitted | edited | confirmed | dismissed | superseded`. No new value added.

---

## 7. Inline edit affordance (D38)

When the host clicks Edit on a `GuestMessageProposal` artifact:

1. **UI:** inline textarea opens, pre-filled with the artifact's `payload.message_text`
2. **Save edit (chat shell):** POST to `/api/agent/artifact` with `{ artifact_id, action: 'edit', edited_text }` 
3. **Endpoint behavior:**
   - Verify host owns artifact + state is `'emitted'` (not already confirmed/dismissed)
   - Update `agent_artifacts.payload.edited_text` (preserve original `message_text` for audit trail)
   - Update `agent_artifacts.state` to `'edited'`
   - Return JSON: `{ ok: true, state: 'edited', edited_text }`
4. **Chat shell renders:** state changes from `'pending'` (Approve / Edit / Discard buttons) to `'edited'` with a subtle visual delta (e.g., "edited by host" subtitle), still showing Approve / Discard buttons
5. **Approve from edited state:** post-approval handler reads `payload.edited_text` (falls back to `payload.message_text` if no edited_text exists) and uses that as the Channex send body
6. **Audit trail:** `agent_audit_log.context` JSONB preserves both versions

**Schema implication:** `agent_artifacts.payload` JSONB may carry both `message_text` (agent original) and `edited_text` (host edit). Application-level convention; no schema change needed.

**SSE event implication:** the artifact endpoint's edit path returns JSON (not SSE) — same shape as discard. No new SSE event needed for edit. The chat shell's reducer mutates the artifact state on receipt of the JSON response.

---

## 8. SSE event canonicalization (D39)

### Renames

| M6 name | M7 name | Rationale |
|---------|---------|-----------|
| `memory_write_pending` | `action_proposed` | Generic across action types |
| `memory_write_saved` | `action_completed` | Generic across action types |

### New shape

```typescript
type ActionProposed = {
  type: 'action_proposed';
  action_kind: 'memory_write' | 'guest_message';  // expands per future tools
  artifact_id: string;
  audit_log_id: string;
  proposed_payload: unknown;  // shape varies by action_kind
  supersedes?: string;
};

type ActionCompleted = {
  type: 'action_completed';
  action_kind: 'memory_write' | 'guest_message';
  artifact_id: string;
  audit_log_id: string;
  // Action-kind-specific fields:
  memory_fact_id?: string;          // memory_write only
  channex_message_id?: string;       // guest_message only
  superseded_memory_fact_id?: string; // memory_write only
};
```

### Migration cost

- `sse.ts` rename + add discriminator
- `types.ts` rename + Zod schema update
- `turnReducer.ts` switch case rename + per-action-kind mutation logic
- ChatClient milestone trigger: now fires on `action_completed` AND `action_kind === 'memory_write'` (not just on `memory_write_saved`); future actions may use different motion or no motion
- `system-prompt.ts` references update if any
- Tests across all of the above

Roughly ~80-120 LOC of mechanical churn. Cheap given the architectural payoff.

### `action_proposed` activation

This was the M5 forward-looking event that stayed type-only as M6's forcing function. M7 activates it. The reducer's exhaustive-check `_exhaustive: never` no longer fails for `action_proposed`. M7's reducer now handles all 4 originally-forward-looking events (`tool_call_failed`, `action_proposed`, `action_completed`, plus M6's renamed predecessors).

The reducer is now exhaustive across all SSE events with no forward-looking placeholders. Future SSE events introduced by future milestones go through the same forcing-function pattern: type-only declaration, reducer exhaustive-check fails until handler added.

---

## 9. System prompt restructuring (D40)

### Current shape (M6)

Single linear prompt: introduction, tool catalog, when-to-call rules per tool, citation rules, supersession behavior, conservatism, etc. All interleaved.

### M7 shape

```
# Koast — System Prompt

## Identity
[Koast's role, brand voice, conservatism bias]

## Tools available
[Brief tool catalog: read_memory, write_memory_fact, read_guest_thread, propose_guest_message]

## Cross-capability rules
- Pre-write reads (D27)
- Citation requirement on inferred proposals (D26)  
- Supersession field semantics (D25)
- Conservatism bias

## Memory tools
- read_memory: when to call, sub_entity_type vocabulary
- write_memory_fact: 5 cases, supersedes vs supersedes_memory_fact_id

## Guest messaging tools  
- read_guest_thread: when to call (always before propose_guest_message)
- propose_guest_message: when to call, channel-aware drafting (Airbnb/Booking.com/Vrbo conventions), tone calibration

## Behavior boundaries
[Don't invent facts, don't impersonate guests, etc.]
```

### Cache cost

Restructure invalidates the prompt cache. M7's first turn pays the rebuild cost. Subsequent turns benefit from the cleaner cache hierarchy. Acceptable.

### PE pattern

Future capability milestones (M8 with pricing, M9 with calendar, etc.) follow the same per-capability section structure. Each capability gets its own section with tool docs + when-to-call + capability-specific rules. Cross-capability rules stay at top.

---

## 10. Channel-aware drafting (D41)

System prompt teaches the agent per-OTA conventions:

```
When drafting guest messages, calibrate tone to the booking's channel:

- airbnb: friendly, conversational. Use the guest's first name. Emoji acceptable but sparing. ~150-300 chars typical for routine messages.

- booking_com: more formal. Use the guest's first name. Avoid emoji. Booking.com character limits are stricter; aim for under 1000 chars.

- vrbo: between airbnb's warmth and booking_com's formality. Family-oriented context (Vrbo skews family/group bookings). 

- direct: open. Default to friendly-professional unless the host's prior thread suggests otherwise.

The booking's channel is provided in read_guest_thread output. Always check it before drafting.
```

Edit affordance (D38) backstops if tone misses.

---

## 11. GuestMessageProposal component (D43)

`src/components/chat/GuestMessageProposal.tsx`.

States (paralleling MemoryArtifact's 4 states + edit):

- **`pending`**: shows the drafted message text. Approve / Edit / Discard buttons.
- **`edited`**: shows edited message text with subtle "edited by host" subtitle. Approve / Discard buttons (no Edit; one edit per artifact).
- **`sent`**: shows the sent message text. "Sent · [channel]" check pill. No actions. Channex message_id linked if useful.
- **`failed`**: shows the (drafted or edited) message text. Error details. Try-again button. Discard button also rendered (post-CP4 refinement) — non-transient failures (Channex 422 for character limits, OTA-policy rejections, ColdSendUnsupportedError gates) re-fail on retry, so the host needs an exit path that doesn't require page refresh.

Visual treatment: TBD via Phase A design exploration if desired, OR simpler shape — text-block with action footer. Free-text artifact is visually different from MemoryArtifact's structured-record form.

### §11 amendment (post-CP4 smoke)

The pre-authoring §11 above lists 4 component states; substrate state is `agent_artifacts.state ∈ {emitted | edited | confirmed | superseded | dismissed}`. The mapping between them is asymmetric because of the §6 amendment's failure encoding:

- `pending` ← `state='emitted'` AND no `commit_metadata.last_error`
- `edited`  ← `state='edited'` AND no `commit_metadata.last_error`
- `sent`    ← `state='confirmed'`
- `failed`  ← `state='emitted'` (or `'edited'`) AND `commit_metadata.last_error` is present

The chat shell derives the `failed` visual from `commit_metadata.last_error` presence, NOT a substrate state value. Audit outcome is canonical lifecycle truth (`succeeded` / `failed` / `pending`); `last_error` presence is the reliable proxy the rendering layer reads. This holds for both `ChannexSendError` failures (via Channex) and `ColdSendUnsupportedError` failures (via local pre-flight gates) — both write `last_error` to `commit_metadata` and both leave `state='emitted'`.

The component's `channel` prop is resolved per D51 (commit_metadata.channel canonical → message_threads join fallback → undefined for fresh-booking edge). Channel display in eyebrow + sent pill conditionally renders only when channel is known; `channelLabel` returns null for missing channel rather than a generic 'guest' fallback.

---

## 12. Architectural decisions (locked pre-authoring)

D38 — Tool interface `editable: boolean` flag (PE) — Per-action-type edit affordance. M6's write_memory_fact registers `editable: false`. M7's propose_guest_message registers `editable: true`. Future tools opt in based on real product signal.

D39 — SSE event canonicalization (PE) — Rename `memory_write_pending` → `action_proposed`, `memory_write_saved` → `action_completed`, with `action_kind` discriminator. `memory_write_pending` and `memory_write_saved` are removed from the schema. Reducer/UI switch on `action_kind` for type-specific behavior.

D40 — System prompt per-capability sections (PE) — Restructure into Identity / Tools available / Cross-capability rules / Per-capability sections / Behavior boundaries. Future capabilities follow the pattern. M7's first turn pays cache invalidation cost.

D41 — Channel-aware drafting via system prompt (M7 specific / PE partial) — Specific OTA conventions are M7. The pattern of "tools receive channel context as input, prompt teaches per-channel conventions" is PE.

D42 — Channex post-approval verification (M7 specific) — Send must succeed before artifact transitions to `state='confirmed'`. Failure → `state='failed'`, host sees Try-again button. Idempotency on retry verified via channex_message_id check.

D43 — GuestMessageProposal component (M7 specific) — New artifact component for free-text proposals. 4 states (pending / edited / sent / failed). Inline edit affordance via textarea.

D44 — read_guest_thread tool (M7 specific) — Non-gated tool; queries legacy PMS schema for thread data. Phase 1 STOP must verify schema location.

D45 — `'edited'` state activation in agent_artifacts (PE) — First use of pre-existing CHECK enum value. Confirms M2's substrate design anticipated this case.

D46 — Bundled scope: read_guest_thread + propose_guest_message together (M7 specific) — Tools ship as a unit because they're functionally interdependent. Read tool is not its own milestone.

D47 — No supersession in M7 (M7 specific) — Guest messages don't supersede each other; each message is an independent send. M6's supersession columns inherited but unused. Future tools may use them.

D48 — Channel context flow (PE) — Booking's channel surfaces from `read_guest_thread` output → into agent's reasoning context → into `propose_guest_message` input via the message_text (agent crafts channel-appropriate text) → into post-approval handler for routing → into Channex API. Channel awareness is per-tool input, not a separate global state.

### Decisions added during authoring (post-Phase-1-STOP)

D49 — Cold-send via `POST /bookings/:channex_booking_id/messages` (M7 specific) — When the local `message_threads` row is missing, the post-approval handler calls Channex's `POST /bookings/:id/messages` endpoint instead of the thread-keyed sibling. Probed 2026-05-05 against a live Villa Jamaica BDC booking; HTTP 200 in 1.68s, response symmetric to the existing `POST /message_threads/:id/messages` plus `relationships.message_thread.data.id` carrying the auto-created thread id. Channex maintains a thread shell from booking-creation time even before any messages exist; the cold-send endpoint attaches the new message to that latent shell, so we get both the message id AND the thread id in one round-trip with no separate fetch. The handler materializes the local `message_threads` row from the response (`onConflict: 'channex_thread_id', ignoreDuplicates: true`; webhook is canonical for thread state, our handler is canonical for the just-sent message).

D50 — `ColdSendUnsupportedError` class for cold-send pre-flight gates (PE for future capability constraints) — When the cold-send branch can't dispatch (no `channex_booking_id`, no `property_channels` row, iCal-import sentinel, ABB pending CF #45), throw `ColdSendUnsupportedError` with a `gate: ColdSendGate` discriminator instead of a plain `Error`. The route's inner catch handles `ColdSendUnsupportedError` alongside `ChannexSendError` — both route through M7 §6 amendment encoding (`state='emitted'`, `commit_metadata.last_error`, audit `outcome='failed'`) but with distinct SSE error codes (`cold_send_unsupported` vs `channex_send_failed`) and `last_error.channex_status: null` for unsupported (Channex never reached) vs `<HTTP code>` for Channex failures. Adding new gates: extend `ColdSendGate` union + throw with new identifier; route handling Just Works.

D51 — Asymmetric channel resolution for guest_message_proposal artifacts (PE) — Three-source precedence in `loadTurnsForConversation`: (1) `commit_metadata.channel` written by the post-approval handler at confirm time (canonical post-fix); (2) `message_threads` join via `payload.booking_id` for emitted/edited artifacts + legacy confirmed artifacts written before the fix; (3) `undefined` for the rare fresh-booking-no-thread edge — the `GuestMessageProposal` component degrades to a channel-less eyebrow. Surfaced as `derived_channel?: string` on `PendingArtifact`. Documents the explicit precedence inline so future readers can extend without re-deriving.

D52 — `[history, sessionHarvest]` dedup by `turn_id` with history first (M7 specific / regression-pin) — Latent in M6, masked by the milestone deposit animation; surfaced via M7's no-motion guest_message flow (the smoke's Phase C bug). After router.refresh, the same turn appears in BOTH `history` (refreshed substrate) AND `sessionHarvest` (stale local). Duplicate `key={t.id}` produces undefined React reconciliation. Fix: explicit `Set<string>`-based dedup at the composition layer with history iterated first; sessionHarvest entries with already-seen turn ids are filtered. History wins because the substrate is canonical post-refresh.

---

## 13. Phase 1 STOP — questions to answer before authoring

1. **Legacy PMS guest thread schema location.** Where do existing guest threads live in Supabase? Verify table names, primary key (booking_id? thread_id?), RLS policies. M7's read_guest_thread query depends on this.

2. **Channex send API.** Confirm:
   - Endpoint URL/method
   - Authentication mechanism (API key in env? OAuth?)
   - Request body shape (booking_id, message_text, channel-specific fields?)
   - Response shape (message_id? error codes?)
   - Idempotency support (does Channex deduplicate retried sends?)

3. **agent_artifacts.state CHECK includes 'edited'.** M2 design anticipated this. Verify against current schema (post-M6.2 migration).

4. **Tool registration for editable flag.** Is the Tool interface in `src/lib/agent/types.ts` ready to accept an `editable: boolean` field, or does it need extension?

5. **D35 dispatcher fork compatibility.** Verify the dispatcher's `require_confirmation` branch (lines 207-246 from M6) doesn't change behavior when an editable=true tool is registered. The fork itself shouldn't care; just confirm.

6. **MemoryArtifact still works.** After SSE event rename (D39), MemoryArtifact's reducer interaction needs to still fire correctly on `action_completed` with `action_kind='memory_write'`. Regression check.

7. **Existing M6 audit log rows.** After SSE event rename, do existing M6 audit_log rows (action_type='write_memory_fact') still surface correctly via `loadTurnsForConversation`? They should — the rename is at SSE layer, not at audit row content.

8. **Channex API rate limits.** Does Channex enforce rate limits that could be hit by post-approval handler? If so, should retries respect them?

9. **`action_proposed` reducer exhaustiveness.** When M7 activates `action_proposed` in the active SSE schema, the reducer's exhaustive-check needs to handle it AND still fail for any future forward-looking events. M5/M6 had `action_proposed` as the M7 forcing function; M7 needs to NOT forget there are no future forward-looking events left (or surface what new ones M8+ should plan for).

10. **System prompt cache invalidation strategy.** Restructure invalidates cache. Verify the model's first-turn behavior on M7 deploy is acceptable (one-turn cache rebuild, then warm).

---

## 14. Implementation order (suggested)

1. **Phase 1 STOP** — answer §13 questions
2. **SSE event rename** (D39) — sse.ts, types.ts, turnReducer.ts, ChatClient.tsx (milestone trigger condition update). Tests adapted.
3. **Tool interface `editable` flag** (D38) — types.ts; dispatcher reads it but doesn't change fork behavior.
4. **`read_guest_thread` tool** (D44) — Phase 1 STOP must have surfaced schema. Tool definition + query + tests.
5. **`propose_guest_message` tool** (D38, D46, D47) — registration, input/output schemas, buildProposalOutput, tests.
6. **Post-approval handler** (D42) — Channex send + verification + state transitions + retry behavior + tests.
7. **System prompt restructuring** (D40, D41) — per-capability sections, channel-aware drafting rules, cross-capability rules at top. Cache invalidation accepted.
8. **`/api/agent/artifact` endpoint extension for edit action** — handles edit alongside approve/discard. JSON response, no SSE.
9. **GuestMessageProposal component** (D43) — 4 states + inline edit textarea + edit-action wiring + tests.
10. **ChatClient orchestration** — render GuestMessageProposal for action_kind='guest_message' artifacts; route edit/approve/discard to endpoint; handle reducer events for action_proposed/action_completed.
11. **Reducer extensions** for renamed events with action_kind branching.
12. **Conversation reads extension** — `loadTurnsForConversation` returns guest_message artifacts alongside memory artifacts (per existing pendingArtifacts pattern).
13. **Tests** across all (~50-70 new, ~330-340 total).
14. **Staging smoke** — full flow: agent reads thread → drafts message → host edits → host approves → Channex sends → confirmation. Plus edge case: failure path.
15. **Session report.**
16. **Single commit.**

---

## 15. Test discipline

Match M6 patterns. M7 expected counts (rough):

- **Unit tests** (~40 new): read_guest_thread query, propose_guest_message tool, post-approval handler (success + Channex failure + retry), error classifier extensions if Channex error codes need new mappings, edit endpoint, reducer for renamed events
- **Component tests** (0 new — M5 deferred component test infrastructure stays deferred per M5 CF17)
- **Integration tests** (~10 new): SSE event rename end-to-end, edit flow at reducer level, approve flow with Channex mocked, Try-again flow, ChatClient renders GuestMessageProposal correctly per state
- **Staging smoke** (1): real browser, real Channex send. Verify guest receives message via real OTA.

Total target: ~50-70 new tests. Combined with M6's 279, M7 lands ~330-350 passing.

---

## 16. Verification gates (before declaring M7 done)

1. SSE rename complete: no `memory_write_pending` / `memory_write_saved` references in active code (all replaced)
2. M6's MemoryArtifact still works correctly (regression-free)
3. read_guest_thread returns correct thread data with channel
4. propose_guest_message proposes via D35 fork (constructive success path)
5. Inline edit produces `state='edited'` with edited_text preserved alongside original
6. Approve from edited state sends edited_text to Channex
7. Approve from pending state sends original message_text to Channex
8. Channex send success → artifact `state='confirmed'`, audit `outcome='succeeded'`, channex_message_id captured
9. Channex send failure → artifact `state='failed'`, audit `outcome='failed'` with error_message; Try-again button rendered; retry attempts re-send
10. System prompt restructured per D40; all capability sections present; cross-capability rules at top
11. tsc clean; ~330-350 tests passing
12. No new dependencies (M5 invariant held)
13. Anti-patterns audit clean (no Co-Authored-By, no /tmp paths, no force-pushes)

---

## 17. Anti-patterns (do not ship)

From M6 §17 (still locked):
- ❌ Inline edit forms on MemoryArtifact (different from inline edit on GuestMessageProposal — MemoryArtifact's design intentionally has no edit)
- ❌ Reusing `/api/agent/turn` for artifact actions
- ❌ New tables for artifact storage (use agent_artifacts + agent_audit_log)
- ❌ Bundled migration files (one concern per file)
- ❌ Statistical inference proposals without citation
- ❌ Skipping pre-write read_memory call (D27)
- ❌ New dependencies without explicit justification

M7-specific anti-patterns:
- ❌ Sending to Channex without host approval (every guest message goes through propose-then-approve)
- ❌ Auto-retry loops on Channex failure (host-driven retry only via Try-again button; idempotency guard at endpoint protects)
- ❌ Multi-message proposals in one artifact (one message per artifact)
- ❌ Drafting messages for guests Koast doesn't have a thread for — call `read_guest_thread` first; it returns `thread:[]` + booking context for thread-less bookings (cold-send path materializes the local thread row at handler time when supported)
- ❌ Hardcoded channel logic in component code (channel routing happens at handler level via Channex API; component just displays the result)
- ❌ Persisting Channex message_id-related data outside agent_artifacts.commit_metadata (Channex is source of truth for sent-message data)
- ❌ Adding `'sent'` or `'failed'` as new states to agent_artifacts.state CHECK — both are *display* concepts. Substrate only tracks `'emitted' | 'edited' | 'confirmed' | 'superseded' | 'dismissed'`. The UI derives `'sent'` from `state='confirmed' && action_kind='guest_message'`; `'failed'` from `state='emitted'/'edited' && commit_metadata.last_error` presence (per §6 + §11 amendments).
- ❌ Attempting to message iCal-import properties via Channex — handler returns `ColdSendUnsupportedError(gate='ical-import')` with host-actionable copy ("[Property] is connected via iCal only on [Platform]; messaging requires channel-managed integration through Channex"). Not a Koast gap; iCal is calendar-only by design and the iCal feed doesn't expose outbound messaging.

---

## 18. Carry-forwards (open items beyond M7)

Continued from M6's §18 (carry-forwards 20-31). M7 introduces:

32. **`propose_property_note` tool** — small non-Channex capability deferred from M7 scope. Would land as a small commit when real use surfaces "I want to save unstructured property notes." Probably ~200 LOC + tests.

33. **Multi-message drafting** — M7 ships one message per artifact. Future enhancement: agent drafts a sequence (welcome message + check-in instructions + house rules), each as separate artifacts in one turn. Real use will surface if this is needed.

34. **Guest-thread-bound conversations** — M7's chat shell conversation is property-bound (via active_property_id). Future: conversations can be guest/booking-bound (active_booking_id). Useful for "host wants to focus on a specific guest's needs across multiple touchpoints." 

35. **Guest message tone presets** — instead of channel inference, host-set tone preferences ("always be more formal even on Airbnb," "use casual voice for direct bookings"). M7+ polish if real use shows tone calibration is frequently wrong.

36. **Auto-send pre-approved templates** — M7 always requires approval. Future: pre-approved message types (e.g., "guest checks in tomorrow, send standard arrival message") that bypass propose-then-approve for routine messages. Stakes: low; could move to mode='allow' silent. Probably needs its own opt-in mechanism per host.

37. **Send-after-edit cycle** — M7 single-edit-then-approve. Future: edit-multiple-times-before-approving. Probably useful; real use will tell.

38. **action_kind expansion guardrails** — as more action types land (M8+), `action_kind` discriminator grows. At what count does it become unwieldy? Worth visiting when 4-5 action_kind values exist.

39. **Booking discovery tool** — agent has no `list_threads` / `list_bookings` tool today; v1 expects the host to name a booking explicitly in the prompt. Real use will tell whether a discovery tool ("show me unanswered guest threads") earns its keep. Surfaced during Phase 1 STOP; deferred from M7 scope.

40. **In-place artifact mutation vs router.refresh** — `handleArtifactEdit` (M7 D38) currently calls `router.refresh()` after a successful edit POST instead of feeding the new state into the in-memory reducer. Cost: small visible flash between optimistic and refreshed render. Polish iteration would consume the artifact endpoint's edit JSON response back into a sibling reducer hook. M7's `[history, sessionHarvest]` dedup-by-turn-id (D52) makes the refresh-driven path safe; in-place mutation would be polish, not correctness.

41. **Audit retry attempt history** — M7 reuses the same `agent_audit_log` row across retry attempts (pre-execute audit flip resets `outcome='failed' → 'pending'` per attempt). Lifecycle is clean per attempt but the log doesn't preserve a per-attempt history (timestamps, latency, error_message of prior failed attempts). Future audit-log surface may want to render attempt history; would need either a separate `agent_audit_attempts` table or JSONB array on the audit row. Not blocking; surfaced as the M7 cold-send retry surfaced multiple gate-error sequences in the Phase 3 smoke.

42. **Failure UI derivation refinement** — chat shell currently derives the `'failed'` visual from `commit_metadata.last_error` presence. Works in practice but couples UI rendering to commit_metadata schema. Polish iteration: surface `audit_outcome` directly on the loaded artifact and derive failure from outcome='failed' + last_error presence (defense-in-depth) — protects against partial-write races where last_error is absent but the audit row already flipped.

43. **Multi-channel bookings render all threads** — `read_guest_thread` v1 returns the most-recent thread only (`order by last_message_received_at desc limit 1`). Multi-channel bookings (rare today; a booking bridged across both ABB and BDC channels) would have multiple `message_threads` rows. Future enhancement: return all threads with channel discriminator. Surfaced inline in `read-guest-thread.ts` docstring.

44. **First-message-in-thread support (cold-send) — ACTIVATED IN M7.** No longer carry-forward; folded into M7 substrate. BDC cold-send works end-to-end via channel-managed properties (Gretter probe 2026-05-05); ABB cold-send constraints surfaced and routed via CF #45.

45. **channel_id resolution for ABB cold-send** — channel-managed Airbnb properties (real `channex_channel_id` in `property_channels`) require `channel_id` in the Channex `POST /bookings/:id/messages` request body (Channex returns 422 `{channel_id: ["can't be blank"]}` when omitted; auto-resolves for BDC since the booking's channel relationship is implicit at the Channex side). Currently routed to `ColdSendUnsupportedError(gate='abb-cold-send-cf45')` with host-actionable copy ("Send the first message via Airbnb directly; subsequent messages will work through Koast"). Implementation: small probe to confirm channel_id placement in the body shape (top-level vs `relationships.channel.data.id` vs nested) + resolve from local `property_channels.channex_channel_id` + ~25 LOC handler change + 2 tests. Body-shape probe is ~30 seconds against a Villa Jamaica thread-less ABB booking. The `recoverable: true` flag on `ColdSendUnsupportedError` flips when CF #45 ships.

46. **Stakes-class refinement for explicit memory writes** — current `write_memory_fact` uniformly stakes='medium' / always D35-fork-gated. Real-use signal at M7 smoke: "remember the wifi password is X" type explicit instructions (Case 1 from system-prompt taxonomy) don't need propose-then-approve overhead; the host explicitly named the fact and value, gated review adds friction without protection. The propose card serves as interpretation verification (structured `sub_entity_type/attribute/fact_value` rendering catches interpretation errors), but at v1.x maturity hosts will trust the agent's interpretation enough to skip the click for explicit cases. Two real implementation shapes: (a) new non-gated `save_memory_fact` tool for Case 1 (write_memory_fact stays gated for Cases 2-5); (b) stakes-class polymorphism on `write_memory_fact` based on case identifier in input (dispatcher treats explicit cases as `mode='allow'`). Both preserve audit trail. Real-use telemetry needed before committing: count Case 1 vs Cases 2-5 proposals over 1-2 weeks of M7+ usage; if Case 1 is >70% of all proposes AND host approval rate on Case 1 is >95%, the stakes split is justified by signal. Pattern extends to future capabilities (explicit "send this exact message" in M8+ tools would justify lower-stakes mode similarly).

---

## 19. Success criteria

M7 is complete when:
- Both new tools registered, dispatchable, tested
- D35 dispatcher fork unmodified; both new tools use it
- read_guest_thread returns correct thread data with booking + channel context
- propose_guest_message via D35 fork → MemoryArtifact (sorry — *GuestMessageProposal*) renders with Save/Discard/Edit buttons
- Edit affordance works: inline textarea, save persists edited_text, state='edited'
- Approve sends to Channex; success → 'confirmed' with channex_message_id; failure → 'failed' with retry path
- SSE events renamed; reducer exhaustive across all event types; M6's memory write flow regression-free
- System prompt restructured into per-capability sections with cross-capability rules at top
- Channel-aware drafting verified at staging smoke (Airbnb message reads conversational; Booking.com reads more formal)
- ~330-350 tests passing; no new dependencies
- Single commit on main with conventions doc + implementation + report bundled
- The first real demonstration of agent-drafted guest messaging in Koast: host asks Koast to draft a reply to a guest, agent reads thread, drafts contextually-appropriate reply, host approves, message sends via Channex to OTA, guest receives it

---

*End of M7 conventions. Updated as Phase 1 STOP and implementation surface new architectural questions.*
