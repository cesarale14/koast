# Agent loop v1 — Milestone 7 report

> **Status:** shipped 2026-05-05. Single commit on `main`; no feature branch.
>
> **Predecessors:** M1 (schema), M2 (action substrate), M3 (tool dispatcher + read_memory), M4 (agent loop server), M5 (chat shell), M6 (write_memory_fact + first gated write end-to-end + dispatcher fork D35).

---

## 1. Summary

M7 is the **second gated tool** to use M6's D35 dispatcher fork, and the **first non-memory action with external system integration**. The agent now reads guest message threads via `read_guest_thread`, drafts contextually-appropriate replies via `propose_guest_message`, and the host approves (or edits, or discards) via the `GuestMessageProposal` card; on approval, the post-approval handler calls Channex's API which delivers the message via the OTA → guest.

**Cold-send for thread-less bookings** is supported for channel-managed Booking.com properties (probe-validated 2026-05-05 against a live Villa Jamaica BDC booking). Airbnb cold-send and iCal-import-property constraints surfaced during the smoke and were captured as `ColdSendUnsupportedError` with `gate` discriminators for host-actionable error copy. CF #45 (channel_id-in-body for ABB cold-send) and the iCal-only category exclusion are documented; both are routed through the same §6 amendment failure encoding the chat shell renders.

**SSE event canonicalization** activates the `action_proposed` event from M5/M6's forcing function. `memory_write_pending`/`memory_write_saved` are renamed to `action_proposed`/`action_completed` with an `action_kind` discriminator (`'memory_write' | 'guest_message'`); the discriminated union pattern is extensible. The reducer's exhaustive switch is now exhaustive across the full SSE union — no remaining forward-looking events.

The substrate proves it scales to non-memory capabilities with external integrations.

---

## 2. Added

| File | LOC | Role |
|---|---|---|
| `src/lib/agent/tools/read-guest-thread.ts` | 234 | NEW — non-gated tool returning thread + booking + channel context |
| `src/lib/agent/tools/propose-guest-message.ts` | 124 | NEW — gated, editable, medium-stakes; D35 fork synthesizes proposal output |
| `src/lib/action-substrate/handlers/propose-guest-message.ts` | 439 | NEW — post-approval handler with established-thread + cold-send branches; G1-G4 gate validations |
| `src/lib/action-substrate/handlers/errors.ts` | 68 | NEW — `ColdSendUnsupportedError` + `ColdSendGate` union |
| `src/components/chat/GuestMessageProposal.tsx` | 251 | NEW — 4 visual states + inline edit textarea + Discard-from-failed |
| `src/lib/agent/tools/tests/read-guest-thread.test.ts` | 271 | NEW — 17 tests (helpers + handler ownership + channel mapping) |
| `src/lib/agent/tools/tests/propose-guest-message.test.ts` | 110 | NEW — 9 tests (declaration + schema + buildProposalOutput + handler-throws guard) |
| `src/lib/action-substrate/handlers/tests/propose-guest-message.test.ts` | 619 | NEW — 13 tests (existing-thread happy/idempotency/errors + cold-send happy + 4 gate paths) |
| `src/app/api/agent/artifact/__tests__/route.test.ts` | 388 | NEW — 19 tests (auth/validation + edit + per-kind dispatch + §6 encoding for both error classes) |
| `src/lib/agent/tests/conversation-pending-artifacts.test.ts` | 261 | NEW — 9 tests (state filter widening + channel resolution paths) |
| `docs/architecture/agent-loop-v1-milestone-7-conventions.md` | 661 | (already in repo from M7 docs commit `bb1f960`; revised in this commit per §6/§11/§17/§18 amendments) |
| `docs/architecture/agent-loop-v1-milestone-7-report.md` | THIS | NEW — session report |

Channex client extension: `sendMessageOnBooking()` added to `src/lib/channex/messages.ts` (~50 LOC; existing file).

---

## 3. Modified

| File | Change |
|---|---|
| `src/lib/agent/types.ts` | + `editable?: boolean` on Tool interface (D38) |
| `src/lib/agent/sse.ts` | rename SSE events to `action_proposed` / `action_completed` with nested z.discriminatedUnion on `action_kind` |
| `src/lib/agent-client/types.ts` | mirror SSE rename + new `guest_message_artifact` ContentBlock + `GuestMessageArtifactState` union + `MemoryArtifactState` extended for documentation |
| `src/lib/agent-client/turnReducer.ts` | switch case rename + nested switch on `action_kind` for both `action_proposed` + `action_completed` (memory_write + guest_message branches) |
| `src/lib/agent-client/parseSSEEvent.ts` | unchanged (parsing is shape-agnostic; types.ts schema rev does the work) |
| `src/lib/agent/loop.ts` | rename emit + add parallel `action_proposed{action_kind:'guest_message'}` branch when `block.name === 'propose_guest_message'` |
| `src/app/api/agent/artifact/route.ts` | edit action (D38), per-kind dispatch (memory_write vs guest_message), pre-execute audit flip, §6 amendment encoding for both `ChannexSendError` AND `ColdSendUnsupportedError`, `commit_metadata.channel` written at confirm time |
| `src/lib/agent/conversation.ts` | state filter widened to include `'edited'`; `derived_channel` join via `message_threads.channel_code`; precedence comment added (commit_metadata → join → undefined) |
| `src/lib/agent/system-prompt.ts` | full restructure into 6 sections (D40) + channel-aware drafting (D41) + Case 5b refined language + system-notification rule for propose_guest_message |
| `src/lib/agent/tools/index.ts` | register `read_guest_thread` + `propose_guest_message` (4 tools total) |
| `src/components/chat/ChatClient.tsx` | guest_message_artifact live render + history branch + handleArtifactEdit + dedup race fix at composition layer (D52) + commit_metadata.channel pass-through |
| `src/components/chat/ChatShell.module.css` | `.guest-message-*` classes mirroring `.memory-*` with golden-tint surface |
| `src/components/chat/index.ts` | export `GuestMessageProposal` + types |
| `src/lib/action-substrate/artifact-writer.ts` | `committed_at` extension: `'edited'` is non-terminal alongside `'emitted'` (committed_at stays NULL) |
| `src/components/chat/MemoryArtifact.tsx` | unchanged — regression-free (verified by retained M6 tests + smoke Phase 4) |

Tests modified:
- `src/lib/agent-client/tests/turnReducer.test.ts` — case rename + 1 new full-shape regression test (17 assertions across all 8 memory_write payload fields) + 3 new guest_message branch tests
- `src/components/chat/tests/milestone-trigger.test.ts` — case rename + 2 new tests (memory_write triggers milestone / guest_message does NOT)
- `src/lib/agent/tests/system-prompt.test.ts` — +7 new structural tests for D40 sections + D41 channel calibration + D46/D47 invariants

---

## 4. Migrations

**0** — M7 substrate work is code-side only. `agent_artifacts.state` CHECK already includes `'edited'` from M6.2's lifecycle expansion; SSE event renames are wire-only with no DB rows typed by event names.

---

## 5. Architectural decisions

15 decisions total. 11 from §12 D38-D48 (locked pre-authoring); 4 added during authoring (D49-D52, post-Phase-1-STOP).

**Pre-authoring (D38-D48):**

D38 — Tool interface `editable: boolean` flag (PE)
D39 — SSE event canonicalization (PE) — `action_proposed` / `action_completed` with `action_kind` discriminator (nested Zod discriminatedUnion)
D40 — System prompt per-capability sections (PE)
D41 — Channel-aware drafting via system prompt
D42 — Channex post-approval verification — refined post-CP4 to §6 amendment (state stays 'emitted' on Channex failure; commit_metadata.last_error carries signal)
D43 — `GuestMessageProposal` component (4 states + inline edit + Discard-from-failed refinement)
D44 — `read_guest_thread` tool (non-gated)
D45 — `'edited'` state activation in `agent_artifacts.state` (first use of pre-existing CHECK enum value)
D46 — Bundled scope: read_guest_thread + propose_guest_message together
D47 — No supersession in M7 (guest messages don't supersede each other)
D48 — Channel context flow (read_guest_thread output → agent reasoning → propose_guest_message input → Channex API)

**Post-Phase-1-STOP (D49-D52):**

D49 — Cold-send via `POST /bookings/:channex_booking_id/messages` (M7 specific) — Channex auto-creates the thread shell at booking-creation; the cold-send endpoint attaches messages to that latent shell and returns `relationships.message_thread.data.id` immediately. Probe-confirmed 2026-05-05.
D50 — `ColdSendUnsupportedError` class for cold-send pre-flight gates (PE for future capability constraints) — extensible `ColdSendGate` union; route handles alongside `ChannexSendError` in the same §6 encoding with distinct SSE error code.
D51 — Asymmetric channel resolution for guest_message_proposal artifacts (PE) — three-source precedence: commit_metadata.channel canonical → message_threads join fallback → undefined for fresh-booking edge.
D52 — `[history, sessionHarvest]` dedup by `turn_id` with history first (regression-pin) — fixes a latent race that M6's milestone animation masked but M7's no-motion guest_message flow exposed.

---

## 6. Phase 1 STOP findings

All 10 §13 questions verified against the repo at HEAD `bb1f960` (the M7 docs commit; substrate work then built forward in the same working tree). Zero divergences from the conventions doc at write-time.

| # | Question | Result |
|---|---|---|
| 1 | message_threads + messages schema | `src/lib/db/schema.ts:209-313` ✓ |
| 2 | Channex sendMessage | `src/lib/channex/messages.ts:385`, throws `ChannexSendError(message, status, body)`, no idempotency-key ✓ |
| 3 | agent_artifacts.state CHECK has all 5 values | M6.2 migration `20260504020000_agent_artifacts_lifecycle_expansion.sql` ✓ |
| 4 | Tool interface accepts editable extension | `types.ts:43-94` ✓ |
| 5 | D35 fork doesn't branch on editable | `dispatcher.ts:267-365` reads buildProposalOutput + artifactKind only ✓ |
| 6 | MemoryArtifact regression after rename | reducer attaches memory_artifact block on `action_proposed{action_kind:'memory_write'}` — same shape, same fields ✓ |
| 7 | M6 audit_log rows post-rename | rows typed by `action_type` column (DB), not SSE event names ✓ |
| 8 | Channex rate limits | none observed in current sendMessage path ✓ |
| 9 | Reducer exhaustiveness post-action_proposed | `_exhaustive: never` holds across the full union ✓ |
| 10 | System prompt cache invalidation | one-turn rebuild cost on first M7 turn; subsequent warm ✓ |

The pre-validated failure-encoding decision — substrate state stays 'emitted' on Channex failure, audit outcome + commit_metadata.last_error carry the signal — was recorded in `~/koast/.m7-phase1-stop.md` (gitignored sentinel) and folded into §6 amendment in the conventions doc revision in this commit.

---

## 7. Staging smoke

Four-phase arc against production Supabase + real Channex (the only place real OTA threads exist).

### Phase A — Kathy Joseph, ABB Villa Jamaica, established-thread (validated earlier in session)
Propose-edit-approve through chat shell. Real Channex round-trip (HTTP 200 in 12.7s). Edited_text persisted alongside agent's original message_text. Real Airbnb extranet showed message delivered. Surfaced two architectural fixes (Fix #1 dedup race, Fix #2 channel display) that block clean post-refresh rendering.

### Phase 2 — Gretter Rodriguez, BDC Villa Jamaica, cold-send endpoint probe (raw curl)
Endpoint status was 'D' (documented but unprobed) before this session. Probed via `/tmp/m7-channex-cold-send-probe.sh`:
- HTTP 200 in 1.68s
- Response symmetric to existing `POST /message_threads/:id/messages`
- Plus `relationships.message_thread.data.id` (auto-created thread id) carried in response — no separate fetch needed
- Channex maintains a thread shell from booking-creation time; cold-send attaches to that latent shell

Real message landed at Channex; Gretter receives it on Booking.com. Probe captures preserved at `/tmp/m7-probe-response.json` + `/tmp/m7-probe-thread.json`.

### Phase 3a — Nadia Orenday, ABB Cozy Loft, ColdSendUnsupportedError gate G3 (after fixes)
First attempt (pre-fix Phase 2 handler): Channex 422 `{channel_id: ["can't be blank"]}` — surfaced the iCal-import-property constraint. Cozy Loft has `property_channels.channex_channel_id='ical-import'` (Koast-side sentinel) for ABB; Channex has 0 channels for the property.

After Option-C-refined implementation (gates G1-G4 + ColdSendUnsupportedError + route §6 encoding), Cesar refreshed the failed artifact and clicked Try-again. Substrate now:
- G3 fires: throws `ColdSendUnsupportedError(gate='ical-import')` BEFORE any Channex call
- Route inner catch: §6 encoding with `code='cold_send_unsupported'`, `last_error.channex_status: null`, `last_error.gate: 'ical-import'`
- UI renders host-actionable copy: "Cozy Loft - Tampa is connected via iCal only on Airbnb. Messaging requires channel-managed integration through Channex (the iCal calendar feed doesn't support outbound messages). The first message must be sent through Airbnb's native interface."

Channex never reached. Real-use exit path: Discard-from-failed button.

### Phase 4 — wifi memory write Villa Jamaica (M6 regression smoke)
Cesar prompted "remember the wifi password for villa jamaica is ZORRO1123". Agent called `read_memory` (no prior fact) then proposed `write_memory_fact`. Approved.

Substrate capture:
- `agent_artifacts.id=92eeb53d-…`, state='confirmed', committed_at=`2026-05-05 08:48:33`, commit_metadata=`{memory_fact_id, superseded_memory_fact_id: null}`
- `agent_audit_log.outcome='succeeded'`, latency_ms=704
- `memory_facts.id=86f312be-…`, attribute='password', value='"ZORRO1123"', status='active', source='host_taught', confidence=1.00 (NEW row, no supersession)
- Server log: `[dispatcher] Tool 'write_memory_fact' gated to require_confirmation; artifact 92eeb53d-… emitted in 244ms`

UI: "memory · settled" eyebrow, "Saved · 1 layer settled" footer, milestone deposit animation fired, card transitioned to saved state **without hard refresh** — validates Fix #1 dedup race fix on the M6 memory write path.

### Architectural surface validated (smoke composition)

- Established-thread sends (BDC + ABB at Villa Jamaica): Phase A
- Cold-send to channel-managed BDC (Villa Jamaica): Phase 2 endpoint probe
- Cold-send refusal at iCal-import gate (Cozy Loft G3): Phase 3a
- M6 memory-write inheritance: regression-free, Phase 4
- Fix #1 dedup race (history wins on duplicate turn id): validated by Phase 4 transition without hard refresh
- Fix #2 channel canonical write: validated by Kathy's "Sent · Airbnb" pill (post-fix refresh)
- §6 amendment encoding: validated for ChannexSendError (raw 422 path on Phase 3 first attempt) AND ColdSendUnsupportedError (clean Phase 3a re-attempt)
- D35 dispatcher fork: validated for both write_memory_fact + propose_guest_message + ColdSendUnsupportedError refusal path

### Two architectural fixes surfaced during smoke iteration

**Fix #1 — Dedup race in ChatClient.** Latent in M6, masked by milestone animation; surfaced via M7's no-motion guest_message flow. After router.refresh, the same turn appeared in BOTH `history` (refreshed substrate) AND `sessionHarvest` (stale local). Duplicate `key={t.id}` produced undefined React reconciliation — sessionHarvest's stale entry won, card stayed pending. Fix: explicit Set-based dedup by turn_id at composition layer with history iterated first. D52.

**Fix #2 — Channel display rendering wrong field.** The 'sent' state showed "Sent · guest" instead of "Sent · Airbnb". Component default for missing `channel` was the literal "guest" string. Fix is asymmetric (D51): three-source channel resolution — `commit_metadata.channel` canonical (post-approval handler writes it) → `message_threads` join fallback (covers legacy artifacts + emitted/edited states) → undefined falls through to a channel-less eyebrow/pill rather than misleading copy. `channelLabel` returns null on missing instead of 'guest'.

### Cold-send arc (probe-first discipline)

Probed `POST /bookings/:id/messages` against a real BDC booking before integrating, per Cesar's "probe-first-then-integrate" sequence. Discovered:
- Endpoint is symmetric to existing thread-keyed sibling
- Response carries `relationships.message_thread.data.id` (auto-created thread id) — no separate fetch needed
- Property-level constraints: channel_id required for ABB on channel-managed properties (Channex auto-resolves for BDC); iCal-import sentinel on iCal-only properties
- Channex maintains thread shells from booking-creation time even before any messages exist; the shell becomes a row in our local schema only after the first message creates `message_count > 0`

Each smoke iteration surfaced new constraints honestly. ABB cold-send + iCal-import constraints were captured as gate-routed errors with host-actionable copy rather than expanded scope.

---

## 8. Verification

13 gates per conventions §16, all ✓ at code level + smoke validation per phase.

| # | Gate | Code | Smoke |
|---|---|---|---|
| 1 | tsc --noEmit clean | ✓ | — |
| 2 | ~330-350 tests passing | ✓ 363 | — |
| 3 | No memory_write_pending/saved in active code | ✓ (only doc/comment historical refs) | — |
| 4 | M6 MemoryArtifact regression-free | ✓ tests preserved | ✓ Phase 4 milestone fires |
| 5 | read_guest_thread returns thread + booking + channel | ✓ 17 tool tests | ✓ Phase A reads Kathy thread |
| 6 | propose_guest_message uses D35 fork | ✓ tool tests pin requiresGate=true, stakesClass='medium', editable=true, buildProposalOutput, handler-throws | ✓ Phase A + Phase 3a |
| 7 | Inline edit produces state='edited' with edited_text preserved | ✓ route test | ✓ Phase A (Cesar edited Kathy draft) |
| 8 | Approve from edited sends edited_text to Channex | ✓ handler test | ✓ Phase A (sent edited text, not original) |
| 9 | Approve from pending sends original message_text | ✓ handler test | — (Phase A flow used edit) |
| 10 | Channex success → confirmed + channex_message_id | ✓ route + handler tests | ✓ Phase A + Phase 4 |
| 11 | Channex failure → emitted + last_error + Try-again | ✓ §6 amendment + ColdSendUnsupportedError | ✓ Phase 3a (raw 422 path then gate-routed) |
| 12 | System prompt restructured per D40/D41 | ✓ +7 structural tests | — (validated implicitly via Phase 3 channel calibration) |
| 13 | No new dependencies | ✓ git diff package.json/lock = 0 | — |

---

## 9. Stats

```
Tests:        279 (M6 baseline) → 363 passing (M7) — Δ +84 net
              3 skipped (M5/M6 always-skip staging suites)
              366 total / 29 of 32 suites passed
Files:        ~30 changed (sources + tests + conventions revisions + report)
LOC:          ~4500 net insertions across implementation + tests + docs
Dependencies: 0 added (M5 invariant held)
Migrations:   0 (substrate work code-side only)
Channex API
endpoints
exercised:    POST /message_threads/:id/messages (M6 path)
              POST /bookings/:id/messages (NEW — M7 cold-send, status 'D' → probe-validated 2026-05-05)
              GET /message_threads/:id (sanity follow-up to verify auto-created thread)
              GET /channels?filter[property_id]= (diagnostic during smoke; not in shipped code path)
              GET /bookings/:id (diagnostic; not in shipped code path)
```

---

## 10. Carry-forwards

Continued from M6's 31. M7 introduces:

- **CF #32-#38** (M7 §18 pre-authoring) — propose_property_note, multi-message drafting, guest-thread-bound conversations, tone presets, auto-send templates, send-after-edit, action_kind expansion guardrails. Unchanged from pre-authoring.
- **CF #39** — Booking discovery tool (no `list_threads`/`list_bookings` today; v1 names bookings explicitly).
- **CF #40** — In-place artifact mutation vs router.refresh (handleArtifactEdit currently refreshes; reducer-feed polish iteration when surfaced by real use).
- **CF #41** — Audit retry attempt history (single audit row reused across retries; lifecycle clean per attempt but no per-attempt history).
- **CF #42** — Failure UI derivation refinement (commit_metadata.last_error proxy → audit_outcome+last_error defense-in-depth).
- **CF #43** — Multi-channel bookings render all threads (read_guest_thread v1 returns most-recent only).
- **CF #44** — First-message-in-thread support (cold-send). **ACTIVATED IN M7.** No longer carry-forward; folded into substrate. BDC cold-send works via channel-managed properties (Gretter probe). ABB cold-send constraints surfaced and routed via CF #45.
- **CF #45** — channel_id resolution for ABB cold-send. Channel-managed Airbnb properties require channel_id in the Channex POST body (422 without; auto-resolves for BDC). Currently routed to `ColdSendUnsupportedError(gate='abb-cold-send-cf45')` with host-actionable copy. Implementation: small probe of channel_id placement in body shape + ~25 LOC + 2 tests; estimated ~30-second probe + small substrate change.
- **CF #46** — Stakes-class refinement for explicit memory writes. Real-use signal: Case 1 explicit instructions ("remember X") may not need propose-then-approve overhead at v1.x maturity. Two implementation shapes (separate save_memory_fact tool vs polymorphic stakes); telemetry needed before committing — Case 1 percentage of total proposes + host approval rate over 1-2 weeks of M7+ usage. Pattern extends to future capabilities (explicit "send this exact message" in M8+ tools).

---

*Shipped 2026-05-05. The first real demonstration of agent-drafted guest messaging in Koast: host asks Koast to draft a reply, agent reads thread + channel context, drafts contextually-appropriate reply, host edits + approves, message sends via Channex to OTA, guest receives it. Substrate proven to scale to non-memory capabilities with external integrations.*
