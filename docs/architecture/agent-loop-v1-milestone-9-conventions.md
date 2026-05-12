# Agent Loop v1 — Milestone 9 Conventions

**Status:** Locked, v2.0
**Drafted:** 2026-05-12
**Canonical locations:**
- `~/koast/docs/architecture/agent-loop-v1-milestone-9-conventions.md` (repo, canonical for code-import)
- `decisions/2026-05-12-m9-conventions.md` (vault, canonical for Method-grounding via mcpvault)

**Pre-deliverables (already shipped):**
- M8 close: `milestones/M8/M8-close.md` (M9 inheritance roll-up)
- M9 Phase 1 STOP diagnostic: 2026-05-12 (delivered via Telegram; locked SHAPE 2 scope, A2/A3/A5 architectural locks, A1/A4 Round-2 defers, B1 lock, B2/B3 Round-2 defers, X1 single conventions doc, X2 API route test infra closes first session, X3 pricing engine rewrite stays deferred)

**Method grounding:** This milestone operationalizes Belief 5 (Honest confidence) and Belief 7 (The host's voice) via underlying-architecture substrate at the four existing LLM call sites. Inherits Beliefs 1-4 from M8 conventions unchanged. Belief 6 (full digital substrate) is held to its Method-in-code Phase 2 framing; M9 ships substrate-shaped honesty without expanding capability breadth.

**Naming:** "Honesty + Voice Substrate" — M8 shipped the visible surface of trust; M9 ships the underlying architecture of honesty.

## Changelog

**v2.0 — 2026-05-12** — Initial drafting against SHAPE 2 scope (~10 items, ~4 weeks). Cluster A (honesty substrate: output-schema enforcement + confidence metadata + sufficiency thresholds + tonal regression + substrate-catch coverage + completion-emission guard), Cluster B (voice substrate: voice_mode as memory_fact entity_type='host', Mode 2 propagation, original_draft diff capture), Cluster E (cleanup: review_rules drop + reviews-generate refactor, snapshot table drop, idle-status side-effect-on-GET fix, pricing_apply action_type seeding). Inherits M8 v1.7 discipline (10 what-worked patterns + 7 process-gap locks). Decisions D22-D31. Phase plan A-H, ~24 working days.

---

# Section 1 — Milestone framing

## 1.1 What M9 is

M9 is the substrate-honesty milestone that takes the shipped M8 product from "visible surface of trust shipped, underlying architecture of honesty asymmetric" to "Method-honest at v1 launch across both surface AND substrate."

M8 conventions §1.2 named the M9 thesis explicitly: "M8 ships the *visible surface* of trust (what the host sees). M9 ships the *underlying architecture* of honesty (output schemas, refusal generation, confidence calibration)." M9 delivers that architecture across the four existing LLM call sites and ships the voice substrate that makes Mode 2 propagation honest.

The milestone is bounded: **~10 items across three clusters, ~4 weeks of focused work.**

**Cluster A — Honesty substrate (Belief 5 grounding):**
- F3 Zod schema enforcement at LLM call sites (D26 deferred to Round-2 for locus)
- P1 confidence metadata propagation (D22 locked)
- P2 source attribution rendering (folds with P1)
- P3 data-sufficiency thresholds per agent tool (D23 locked)
- Substrate-catch coverage for chat-text refusal path (D27 deferred to Round-2)
- Completion-message single-emission substrate guard (M8 Phase F R-3 carry-forward closure)
- Automated tonal-alignment regression for voice doctrine (D24 locked)

**Cluster B — Voice substrate (Belief 7 grounding):**
- F5 voice_mode setting + Mode 2 register propagation (D25 locks locus; D28 propagation pattern deferred to Round-2)
- F6 original_draft diff capture (D29 storage shape deferred to Round-2)

**Cluster E — Cleanup of M8 architectural debt:**
- E1 `/api/onboarding/idle-status` side-effect-on-GET fix (M8 Phase F architectural compromise)
- E2 `pricing_apply` action_type seeding (M8 Phase A non-gating CF)
- E3 `review_rules` drop + reviews-generate refactor (D15 v1.1 M8 inheritance — folds with F3 at the same call site)
- E4 `messages_pre_milestone1_snapshot` table drop (overdue per CLAUDE.md)

## 1.2 What M9 is not

M9 does NOT ship:

**Cluster C — Calibration substrate (deferred past M9 per SHAPE 2 sign-off):**
- F8 `host_action_patterns` table + minimal calibration logic
- Rate-push revert substrate (M8 D17d hedge)
- C13 "~three weeks of accumulated approvals" copy commitment: honest-scope persistence past M9 accepted as SHAPE 2 cost; copy refresh during M9 Phase H extends honest-scope language one milestone

**Cluster D — Audit feed + export completion (deferred past M9):**
- `notifications.host_id` schema migration + 5th source in `unified_audit_feed` (chip rename SMS → Notifications per M8 D17b stays pending)
- Memory export substrate (M8 C13 R-5 "on the near-term roadmap" commitment): same honest-scope persistence pattern

**Standard deferred past convergence (per M8 conventions §6.2):**
- Tier 2 context-aware LLM-generated starters (D10 R-1)
- Property creation via chat (D21) — deferred to direct-booking-site work
- `guests` table + back-population (Method-in-code Tier 1, milestone-shaped)
- Voice extraction worker / Mode 1 generative voice
- Sub_entity_type vocabulary expansion (CF #22)
- Operational memory category
- Orb-mode foregrounding
- Multi-user model + RLS rewrites
- Agent tool catalog expansion (~36 tools, Method-in-code Phase 2)
- Direct booking subsystem (Method-in-code Phase 4)
- Fold `/comp-sets` into `/market-intel` (G R-1)

The full anti-scope is enumerated in Section 6.

## 1.3 Scope summary (item registry)

**Cluster A (Honesty substrate):**
- A1 — F3 Zod schema enforcement at 4 LLM call sites
- A2 — P1 confidence metadata in outputs (D22)
- A3 — P2 source attribution rendering (folds with A2)
- A4 — P3 sufficiency thresholds per agent tool (D23)
- A5 — Substrate-catch coverage for chat-text refusal path
- A6 — Completion-message single-emission substrate guard
- A7 — Automated tonal regression (D24, shape regex CI phase only)

**Cluster B (Voice substrate):**
- B1 — F5 voice_mode + Mode 2 propagation (D25)
- B2 — F6 original_draft diff capture

**Cluster E (Cleanup):**
- E1 — `/api/onboarding/idle-status` side-effect-on-GET fix
- E2 — `pricing_apply` action_type seeding
- E3 — `review_rules` drop + reviews-generate refactor
- E4 — `messages_pre_milestone1_snapshot` table drop

Atomic count: 13 items. Clustered count: ~10 (P2 folds with P1; substrate-catch + completion guard cluster). Phase plan in §4 reflects implementation breakdown.

## 1.4 Milestone-level effort estimate

~24 working days at typical pace. Roughly 4-5 weeks calendar.

Phase budget (refined in §4):
- Phase A (Days 1-2): conventions drafting + API route test infrastructure setup
- Phase B (Days 3-6): Cluster A foundation — F3 Zod at 4 LLM call sites
- Phase C (Days 7-9): A2/A3 confidence metadata + sufficiency thresholds
- Phase D (Days 10-12): A5/A6 substrate-catch + completion guard
- Phase E (Days 13-16): Cluster B voice substrate (F5 + F6)
- Phase F (Days 17-19): A7 tonal regression (shape regex CI)
- Phase G (Days 20-22): Cluster E cleanup
- Phase H (Days 23-24): F7 honest-scope pass + M9 close

Phase B duration calibration discipline (M8 G1) applies: substrate-heavy phases anchor estimates on truth, not optimism. Phase B nominally 4 days; surface architectural-substrate risk vs. surface-rendering risk explicitly during Phase A drafting.

Deferral levers if scope tightens:
1. A7 tonal regression LLM-judge phase — already deferred to M10 by D24; shape regex CI is M9 minimum
2. E3 `review_rules` drop — defer if reviews-generate refactor surfaces unexpected scope; ship its own conventions
3. Substrate-catch chat-text (A5) — narrow to publisher-category coverage only; broader catch deferred

---

# Section 2 — Architectural decisions (D22-D31)

Numbering continues from M8 v1.7 (latest D21 — property creation deferral). Each decision is locked. Decisions reference items by their convergence-list ID (F3-F6, P1-P3) or M8 Phase reference.

## D22 — Confidence metadata propagation locked (A2)

**Decision:** Confidence metadata travels alongside content via a parallel structured channel, not as fields inside the content schema and not as rendering-time inference.

Each LLM call site that produces host-facing output returns a structured envelope:
```typescript
type AgentTextOutput = {
  content: string;             // the text shown to the host
  confidence: 'confirmed' | 'high_inference' | 'active_guess';
  source_attribution: SourceRef[];  // memory_fact IDs, retrieval refs
  hedge?: string;              // surface-rendered qualifier if applicable
  sufficiency_signal?: 'rich' | 'sparse' | 'empty';  // from M8 read_memory pattern
};
```

The rendering layer reads metadata and produces appropriate UI treatment (M8 `ConfidenceBandedRange` pattern at the hero; chat-surface inline source attribution; refusal envelope treatment for grounding failures).

**Reasoning:** Method-in-code Belief 5 grounding: "Confidence is propagated structurally, not appended as disclaimer text." Three options considered: (a) `{confidence, source, hedge}` fields inside content schema (pollutes content; couples confidence to content shape); (b) parallel structured channel (separation of concerns; rendering layer composes); (c) rendering-time inference from raw outputs (re-derives information the LLM call already had access to). Cross-cutting decision affecting multiple Cluster A items. (b) wins on cleanest substrate separation and inheritance to the ~36 future tool catalog (Phase 2 work).

**Implications:**
- Every LLM call site returns the envelope shape (not just `string`). Existing call sites: `messaging.ts:generateDraft`, the three review-generation functions, `propose_guest_message`, `propose_property_note` if shipped.
- Zod schemas (F3, A1, D26 Round-2) enforce the envelope shape at runtime; ungrounded outputs trigger refusal fallback (Phase D substrate-catch).
- Rendering layer in the chat substrate (M8 D1/D18 ChatStore + RefusalEnvelopeRenderer) consumes the metadata channel; existing surfaces extend rather than re-architect.
- M8 `read_memory`'s `sufficiency_signal` (rich/sparse/empty) feeds the envelope when memory retrieval underlies the output. A4 D23 ties this to the per-tool sufficiency catalog.

## D23 — Sufficiency thresholds locus locked (A4)

**Decision:** Hybrid — static catalog declared at tool-registration time defines threshold values; runtime computation checks `memory_facts` state (or other relevant data) against catalog at retrieval time.

```typescript
// tool-registration shape (one entry per agent tool)
const PROPOSE_GUEST_MESSAGE_THRESHOLDS = {
  property_capabilities: {
    minimum_required: ['property_name', 'door_access', 'wifi', 'parking'],
    sufficient_signal: 'rich',
    below_threshold_behavior: 'host_input_needed',
  },
  guest_history: {
    minimum_required: [],
    sufficient_signal: 'sparse',  // sparse fine for first-time guests
    below_threshold_behavior: 'proceed_with_acknowledgment',
  },
};
```

Runtime: when the tool dispatches, compare current memory_facts state against the catalog. Below threshold → tool returns `host_input_needed` envelope (matches M8 D18 RefusalEnvelope kind); above threshold → tool proceeds with metadata flagged accordingly.

**Reasoning:** Method-in-code Belief 5 commitment: "Each new agent tool declares minimum data threshold + below-threshold behavior + above-threshold behavior. No tool ships without these declarations." Two options considered: (a) static catalog only (simpler but can't adapt to per-host memory state); (b) runtime computation only (no shared discipline, each call site re-derives). Hybrid takes catalog declaration (static discipline, registered alongside tool) + runtime check (per-host adaptation via memory_facts integration). Integrates cleanly with M8 C3 sufficiency classifier without re-deriving.

**Implications:**
- New module `src/lib/agent/sufficiency.ts` exposes `checkSufficiency(toolId, hostId): SufficiencyResult`.
- Catalog lives alongside tool definitions; new tools added to catalog at registration (discipline lock — no tool ships without entry).
- M8 C3 sufficiency classifier (rich/sparse/empty per memory_facts entity) is the substrate; D23 layers per-tool requirements on top.
- Threshold violations route through M8 RefusalEnvelope (`kind: 'host_input_needed'`) — single rendering treatment.

## D24 — Tonal regression mechanism locked (A7)

**Decision:** Both shape regex and LLM judge, with explicit phasing.

**M9 Phase F (Days 17-19) ships:**
- Shape regex layer: regex patterns matching voice doctrine §5 anti-patterns (emoji in Koast-to-host, ✨/🎉 in any context, "Great question!", "I'd love to help", "Hope this helps!", etc.) run in CI on every commit touching prompt-bearing files. Fail-loud on match.
- Reference voice doctrine §5 anti-pattern enumeration; regex patterns synced with doctrine same-PR.

**Deferred to M10 candidate:** LLM judge nightly job evaluating shipped-output samples from production traffic against voice doctrine. Larger investment (prompt engineering, sample selection, comparator-judge setup, drift-alert routing). Phased so M9 ships substrate without LLM-evaluation infrastructure.

**Reasoning:** Voice doctrine §1.6 ("Voice violations are bugs") requires actionable detection. Three options considered: (a) shape regex only (catches enumerated anti-patterns, misses semantic drift); (b) LLM judge only (catches semantic drift, requires significant infra investment, slower feedback loop); (c) both with phasing. Shape regex is cheap, fast, and catches the regression class M8 F.5 caught at smoke gate (chat-text refusal voice drift) — pulling that to CI prevents drift before staging. LLM judge handles harder semantic-drift case but warrants its own milestone shape.

**Implications:**
- M9 Phase F ships regex patterns in `src/lib/voice/anti-patterns.test.ts` (or similar) running via standard test infra.
- CI configuration wires the test into the gating check.
- Anti-pattern catalog committed alongside voice doctrine reference; doctrine updates flow into catalog updates same-PR.
- LLM judge infra documented as M10 candidate in §6.1.

## D25 — voice_mode locus locked (B1)

**Decision:** `voice_mode` lives as a `memory_fact` on `entity_type='host'`, treated as evolved state with supersession history. Not a column on `properties`, not a column on `host_state`, not a separate `voice_settings` table.

```
entity_type:      'host'
sub_entity_type:  'voice'
entity_id:        <host_id>
attribute:        'voice_mode'
value:            { mode: 'neutral' | 'learned', seed_samples: [...] }
source:           'host_taught' | 'inferred'
confidence:       0.6-1.0
status:           'active'
superseded_by:    NULL (set on supersession; supersession_reason captures why)
```

**Reasoning:** Honors M8 Phase H C13 copy commitment: "voice memory learns how you write." Voice mode is fundamentally evolved state — initial value seeded from host writing samples, supersessions land as Koast accumulates writing data. The memory_fact substrate supports supersession (M6); placing voice_mode there inherits the `supersession_reason` column (M8 Phase A) for free.

Three options considered: (a) column on `properties` (forces per-property voice; conflates property-scope with host-scope); (b) column on `host_state` (M8 Phase G pattern for continuous-write state — but voice_mode is evolved state, not continuous-write; it changes through observation events, not every interaction); (c) memory_fact on `entity_type='host'` (matches evolved-state semantics; inspectable via M8 F1 Memory tab; supersession-walk for free). (c) is the natural fit.

**Implications:**
- New memory_fact `entity_type='host'` / `sub_entity_type='voice'` row per host.
- M8 F1 Memory tab surfaces the voice section (already present as empty state with observation count + Mode 1 threshold per M8 D6).
- voice_mode reads via `read_memory(host_id, entity_type='host', sub_entity_type='voice', attribute='voice_mode')`.
- Mode 2 propagation (D28, Round-2) reads voice_mode at LLM call sites and applies appropriate register.
- Supersession events captured via M8 `supersession_reason` column with reasons like `'host_corrected'` or `'inferred_drift'`.

## D26 — Output-schema enforcement locus deferred to Round-2 (A1)

**Decision:** Defer architectural locus for F3 Zod schema enforcement to first-LLM-call-site implementation in Cluster A Phase B.

Two options remain open until implementation surfaces preference:
- (a) Generic LLM-call wrapper module — single `executeLLMCall(prompt, schema, retries)` helper used by all call sites
- (b) Per-call-site Zod schemas — schemas live alongside their call sites; common patterns extract to shared module

**Reasoning:** M8 deferred 8 of 20 ambiguities to Round-2; that pattern worked. Output-schema enforcement is a substrate decision better made when first call site refactor reveals patterns. Diagnostic surfaced both options; first call site implementation reveals which fits cleaner.

**Surface protocol:** When Phase B begins first LLM-call-site refactor, surface to human via `milestones/M9/round-2-questions.md`. Lock at that point; subsequent sites match locked pattern.

## D27 — Substrate-catch for chat-text refusals deferred to Round-2 (A5)

**Decision:** Defer architectural locus for substrate-catch coverage of chat-text refusal path to F.5-pattern substrate work in Phase D.

Two options remain open:
- (a) Pre-dispatch intercept extension (M8 P4 pattern in `loop.ts` — gated-tool augmentation between SDK final-message and `dispatchToolCall`)
- (b) Post-response classifier (run classifier on assistant text after SDK returns)

**Reasoning:** M8 Phase D F.5 shipped substrate-catch for tool-path refusals via P4 publisher-category classifier. Chat-text path uses system-prompt enforcement only. Extension shape reveals itself during F.5-pattern work — whether the M8 pre-dispatch intercept pattern (loop.ts) extends to chat-text or whether post-response is structurally different enough to warrant separate handling.

**Surface protocol:** When Phase D F.5-pattern substrate work begins, surface to `milestones/M9/round-2-questions.md` with implementation-revealed preference. M8 codified pre-dispatch intercept pattern as the gated-tool augmentation default; chat-text may extend or diverge.

## D28 — Mode 2 propagation deferred to Round-2 (B1 sub-decision)

**Decision:** Defer Mode 2 register propagation locus across LLM call sites to first F5 voice_mode implementation in Phase E.

Two options remain open:
- (a) Single doctrine import — current pattern at 4 LLM call sites; voice doctrine is one source-of-truth, call sites read at call time
- (b) Per-call-site template parameterized by voice_mode — each call site has its own template; voice_mode parameter selects register variant

**Reasoning:** Current pattern (single doctrine import) works at 4 call sites. Question is whether scaling to ~40 tools (Method-in-code Phase 2) needs a different shape. First voice_mode-aware call site implementation surfaces whether parameterization is structural or whether doctrine-section selection within import is sufficient.

**Surface protocol:** Phase E F5 implementation surfaces decision via Round-2 question file. Lock at that point.

## D29 — original_draft capture deferred to Round-2 (B2)

**Decision:** Defer original_draft storage shape to Phase E F6 implementation.

Three options remain open:
- (a) Column on `messages` table (`original_draft_text TEXT NULL`)
- (b) JSONB metadata field on existing `messages.metadata` JSONB column
- (c) Separate `message_drafts` table with FK to messages

**Reasoning:** Existing patterns differ. Reviews subsystem captures `draft_text` + `final_text` on `guest_reviews` rows (column-based). Messaging captures executor-drafts via existing column path; inbound-LLM-drafts are the gap. M8 created `messages_pre_milestone1_snapshot` as separate rollback table (separate-table precedent). Implementation surfaces which fits cleanest — column simplest, JSONB most flexible, separate-table cleanest separation.

**Surface protocol:** Phase E F6 implementation surfaces decision via Round-2 question file.

## D30 — Pricing engine schema-export rewrite explicitly deferred

**Decision:** Pricing engine native-range output ("proper engine output rewrite" CF inherited from M8 D8a) remains deferred. M9 does NOT include this. M10+ candidate when richer pricing capabilities (e.g., portfolio-level recommendations, multi-day optimization) surface need for engine-native ranges.

**Context:** M8 D8a shipped render-time IQR derivation via `usePortfolioWeekendRange` + `src/lib/pricing/range.ts`. Engine continues to ship point estimates today; cohort-dispersion banding happens at the hook layer. This works for M8/M9 hero copy; the rewrite is technical-debt-shaped, not Method-honesty-shaped.

**Reasoning:** Acknowledge the carry-forward explicitly rather than letting it drift silently. M9 scope discipline rejects opportunistic engine-rewrite during honesty-substrate work — they are orthogonal substrates and adding pricing engine surgery would blow SHAPE 2 budget.

**Implications:** No-op in M9. CF backlog continues to track as "P0 engine-native ranges" candidate; M10+ session opens with its own conventions when prioritized.

## D31 — M8 deferrals roll-up: explicit deferred-past-M9 catalog

**Decision:** The `milestones/M8/M8-close.md` M9 inheritance roll-up enumerates 39 items across 6 categories. SHAPE 2 inherits ~10. Items NOT in SHAPE 2 stay deferred past M9 with no implicit promise of M10 inclusion. Decision deliberately captures explicit defers to prevent silent drift.

**Items explicitly NOT in M9 scope:**

*Cluster C — Calibration substrate (Belief 4 architecture):*
- F8 `host_action_patterns` table + minimal calibration logic
- Rate-push revert substrate (M8 D17d hedge)

*Cluster D — Audit feed + export completion:*
- `notifications.host_id` migration + 5th source in `unified_audit_feed`
- Memory export substrate (M8 Phase H C13 R-5 commitment)

*Copy refinements (M8 close §M9 inheritance):*
- Tier 2 context-aware LLM-generated starters (D10 R-1)
- Tier 1 starter copy tonal uniformity (R-11)
- P4 publisher-category classifier keyword tuning (Round-2 #6)
- Thread-context-aware classification beyond message_text (Round-2 #8)

*Performance optimizations (surface-if-real-traffic):*
- Booking→property cache (R-10)
- Portfolio-aggregation endpoint (E C2 R-5)
- TTL tuning for tab-visibility cache (E R-6)
- Rolling-window stabilization for forward-looking weekend cohort

*Deferred features:*
- Property creation via chat (D21) — deferred to direct-booking-site work
- Drawer filter chips (G R-5)
- Mobile tooltip for topbar "?" affordance (H R-3)
- Negative-delta cohort handling for `ConfidenceBandedRange` (E C2)
- Fold `/comp-sets` into `/market-intel` (G R-1 / D12 hint)
- Weekend definition config (E C2 v1.6)

**Reasoning:** M8 Phase F F.1 demonstrated that compounding scope at conversation-step granularity is the recurring risk. Honest-scope persistence past M9 for F8 timing ("~three weeks of accumulated approvals") and memory export ("on the near-term roadmap") is accepted as SHAPE 2 cost. M9 Phase H performs copy refresh: surfaces with shipped-copy committing to F8 / memory-export get language extended one more milestone (exact language drafted at M9 Phase H close).

**Implications:** None for implementation. Catalog discipline only — visible artifact of what M9 is choosing NOT to do, preventing scope creep.

---

# Section 3 — Phase 1 STOP discipline

## 3.1 Inheritance from M8

M9 inherits the Phase 1 STOP discipline from M8 conventions §3 unchanged. Every M9 session that begins implementation work runs Phase 1 STOP first against the phase's scope. Not optional. Always halt after audit and surface the structured report for human review.

The M8 audit categories carry forward as the template; phase-specific categories adapt per phase.

## 3.2 Per-phase Phase 1 STOP categories (high level)

**Phase B (Cluster A foundation):**
- Verify each of 4 LLM call sites' current shape (input handling, output handling, error path)
- Verify Zod is available in dependencies (not new dep per CLAUDE.md discipline)
- Verify refusal-envelope substrate (M8 D18) is in place
- Verify D26 Round-2 candidate options against first call site shape

**Phase C (confidence metadata + sufficiency):**
- Verify M8 C3 sufficiency classifier integrates cleanly with D23 catalog
- Verify rendering surfaces consume new envelope metadata (chat-surface, RefusalEnvelopeRenderer, ConfidenceBandedRange)
- Verify source attribution rendering for memory-backed claims

**Phase D (substrate-catch + completion guard):**
- Verify M8 P4 `loop.ts` pre-dispatch intercept extends to chat-text or surfaces alternative
- Verify completion-message emission path in onboarding (M8 Phase F R-3 carry-forward state)

**Phase E (voice substrate):**
- Verify memory_fact `entity_type='host'` / `sub_entity_type='voice'` rendering in M8 F1 Memory tab
- Verify M8 actor_kind discipline holds for original_draft capture (executor-drafts already attribute; inbound is the gap)
- Verify M7 channel-aware drafting in system prompt remains intact

**Phase F (tonal regression):**
- Verify voice doctrine §5 anti-patterns are enumerable (not aspirational)
- Verify CI infrastructure available for the regex test layer

**Phase G (cleanup):**
- Verify `review_rules` callers via grep (M8 Phase 1 STOP found `src/app/api/reviews/generate/[bookingId]/route.ts` — verify still single caller)
- Verify `messages_pre_milestone1_snapshot` table state pre-drop
- Verify `pricing_apply` action_type seeding doesn't break existing `unified_audit_feed` VIEW

**Phase H (close):**
- Verify F7 honest-scope language pass across M9-shipped surfaces (M8 Phase I pattern)
- Verify copy refresh on F8 / memory-export shipped-copy surfaces honors honest-scope persistence

## 3.3 Halt report shape

Per M8 §3.3 structure. Adapt to per-phase scope. Halt report at `milestones/M9/<phase>-phase-1-stop.md` via mcpvault.

---

# Section 4 — Implementation order and smoke gates

## 4.1 Sequenced phase order

**Phase A — Conventions drafting + API route test infrastructure (Days 1-2)**

Conventions doc landed (this document). Per X2 sign-off, close 5 separate M8 carry-forwards on API route test infrastructure in a single early-M9 commit:

- Install RTL/jsdom + supertest (or equivalent — verified during Phase 1 STOP) — only deps that don't exist
- Establish patterns for API route testing in `src/__tests__/api/` or similar
- One canonical example test demonstrating the pattern (e.g., `/api/audit-feed/since` or a similarly substrate-shaped route)
- Document the pattern in `docs/testing/api-route-tests.md`

**Phase A Round-2 questions surfaced:**
- Dependency choice (RTL+jsdom vs. RTL+@testing-library/jest-dom vs. supertest-only)
- Test isolation (per-test DB vs. transactional rollback vs. fixtures)

**Phase B — Cluster A foundation: F3 Zod at LLM call sites (Days 3-6)**

Per D26 (Round-2): first LLM-call-site implementation surfaces output-schema enforcement locus decision. Once locked, subsequent sites match.

LLM call sites to refactor:
1. `src/lib/messaging/generateDraft.ts` (M7 substrate)
2. `src/app/api/reviews/generate/[bookingId]/route.ts` (review generation — folds with E3 cleanup; Phase B touches; Phase G completes)
3. `src/lib/agent/tools/propose_guest_message.ts` (M7 substrate)
4. Additional prompt-bearing call sites (verified during Phase 1 STOP)

Each call site: Zod schema for `AgentTextOutput` envelope (D22 shape), grounding check against retrieved memory, refusal fallback wired to M8 RefusalEnvelope substrate.

**Phase C — Confidence metadata + sufficiency thresholds (Days 7-9)**

A2/A3/A4 ship per D22, D23:
- `src/lib/agent/sufficiency.ts` module with catalog + runtime check
- D22 envelope metadata propagation wired through all call sites refactored in Phase B
- Rendering layer extensions: chat-surface inline source attribution, RefusalEnvelopeRenderer extensions for `host_input_needed` kind from sufficiency violations
- M8 C3 sufficiency classifier integration verified

**Phase D — Substrate-catch chat-text + completion guard (Days 10-12)**

A5/A6:
- D27 Round-2 lands during F.5-pattern substrate work — substrate-catch shape locked
- Completion-message single-emission guard closes M8 Phase F R-3 carry-forward — substrate-level enforcement of D11 prompt-only contract
- Voice doctrine tonal-drift verification on each refusal surface

**Phase E — Voice substrate Cluster B (Days 13-16)**

B1/B2 ship F5/F6:
- voice_mode memory_fact pattern per D25; M8 F1 Memory tab extensions for voice section
- Mode 2 register propagation per D28 (Round-2 locks during first parameterization)
- original_draft capture per D29 (Round-2 locks during implementation surface)
- Foundational hygiene already in place (M7 actor_kind discipline) — verify in Phase 1 STOP

**Phase F — Tonal regression substrate (Days 17-19)**

A7 per D24 phasing:
- Shape regex CI layer ships in Phase F
- Anti-pattern catalog in `src/lib/voice/anti-patterns.test.ts`
- Voice doctrine §5 enumeration synced
- LLM judge nightly infrastructure deferred to M10 candidate

**Phase G — Cluster E cleanup (Days 20-22)**

Ordered by risk (shipped-substrate-touching first):

1. **E1** — `/api/onboarding/idle-status` side-effect-on-GET fix: split into GET (read-only) + POST (mark-completed event). Mirrors M8 Phase G `mark-seen` POST shape.
2. **E2** — `pricing_apply` action_type seeding: emit `'pricing_apply'` action_type from existing `/api/pricing/apply` writes; VIEW mapping already in place from M8 Phase A.
3. **E3** — `review_rules` drop + reviews-generate refactor (D15 v1.1): review-tone preferences move to `memory_facts` on `entity_type='host'` (matches D25 voice_mode locus pattern), defaults sourced from voice doctrine + `DEFAULT_ONBOARDING_TEMPLATES`. Folds with F3 Zod refactor at the same call site (Phase B touched it; Phase G completes).
4. **E4** — `messages_pre_milestone1_snapshot` table drop: overdue per CLAUDE.md (scheduled 2026-05-09). Migration + atomic drop.

**Phase H — M9 close (Days 23-24)**

- F7 honest-scope language pass across M9-shipped surfaces (M8 Phase I pattern)
- Copy refresh on F8 timing + memory-export shipped surfaces (push honest-scope language one milestone)
- M9 inheritance roll-up to eventual M10 (`milestones/M9/M9-close.md`)
- `m9-close` tag on closing commit

Total: ~24 working days = ~4-5 weeks at typical pace.

## 4.2 Mid-milestone smoke gates

Per-phase verification, per the M8 pattern. Each smoke gate is executable, not visual-only.

**Phase A gate:** Conventions doc landed in both destinations; test infra setup demonstrable via single canonical API route test; Phase 1 STOP dependency-choice Round-2 resolved.

**Phase B gate:** All 4 LLM call sites produce envelope-shaped outputs; Zod schemas enforce; ungrounded outputs route through RefusalEnvelope substrate. End-to-end: send a request to `messaging.generateDraft`, output is envelope-shaped, schema-validated, grounding-check enforced.

**Phase C gate:** Sufficiency catalog exposes `checkSufficiency(toolId, hostId)`; integration with M8 C3 verified; chat-surface shows source attribution when memory-backed claims surface; below-threshold returns trigger RefusalEnvelope rendering.

**Phase D gate:** Chat-text refusal path catches publisher-category content (test case: write a chat-text message asking Koast to draft legal correspondence — substrate intercepts); completion-message guard prevents duplicate emission (test case: simulated edge-case host returning to onboarding mid-flow).

**Phase E gate:** voice_mode memory_fact written + readable for test host; M8 F1 Memory tab shows voice section with mode + supersession history; Mode 2 register applied at first parameterized call site; original_draft captured on a test message dispatch.

**Phase F gate:** Shape regex CI fails on a planted anti-pattern in a test prompt; passes on the cleaned prompt; anti-pattern catalog synced with voice doctrine §5.

**Phase G gate (per-item):**
- E1: `/api/onboarding/idle-status` GET no longer writes; POST endpoint added; both behave correctly.
- E2: `pricing_apply` action_type surfaces in `unified_audit_feed` after a test apply.
- E3: `review_rules` table dropped; reviews-generate works via memory_facts + voice doctrine; no 500s on review generation for test booking.
- E4: `messages_pre_milestone1_snapshot` dropped; migration committed.

**M9 close gate (Phase H):**
- Full smoke against staging with real test data
- All 4 LLM call sites produce envelope outputs with confidence metadata
- voice_mode memory_fact present for test host; Mode 2 register applied
- Shape regex CI green; manual tonal-drift check on shipped output samples
- F8 / memory-export shipped-copy refresh applied per honest-scope persistence
- All voice-bearing surfaces reviewed against voice doctrine

## 4.3 Escalation patterns (inherited from M8 §4.3)

If a smoke gate fails: surface to `milestones/M9/items/<item-name>.md`, halt phase progression, diagnose substrate-vs-implementation, escalate to human if substrate.

If Phase 1 STOP reveals scope expansion: surface in halt report; human decides absorb/defer/split; update conventions same-PR if architectural decisions change.

If Round-2 question surfaces during implementation: halt item, write to `milestones/M9/round-2-questions.md` with candidate resolutions, surface to human, resume on lock.

---

# Section 5 — Deliverable specification

## 5.1 Code artifacts

**Migrations (`~/koast/drizzle/migrations/`):**
- voice_mode memory_fact seeding migration if needed — D25 (may be no-op if existing schema accommodates without migration; Phase 1 STOP verifies)
- `drop_review_rules.sql` — E3 (post-refactor)
- `drop_messages_pre_milestone1_snapshot.sql` — E4
- Other migrations per Phase 1 STOP findings (e.g., original_draft column if D29 lands on option (a))

**Backend (new):**
- `src/lib/agent/sufficiency.ts` — D23 catalog + runtime check
- `src/lib/voice/anti-patterns.test.ts` — D24 shape regex layer
- `src/app/api/onboarding/mark-complete/route.ts` — E1 POST replacement for side-effect-on-GET
- Zod schemas per call site (D26 Round-2 outcome determines layout)

**Backend (modifications):**
- 4 LLM call sites: envelope-shaped outputs, Zod schemas, grounding checks, refusal fallbacks
- `src/lib/agent/system-prompt.ts` — voice_mode-aware register selection (D28 Round-2 outcome)
- `/api/onboarding/idle-status` — read-only GET (no side-effects)
- `/api/pricing/apply` — emit `pricing_apply` action_type
- `/api/reviews/generate/[bookingId]/route.ts` — refactor for `review_rules` removal + envelope shape

**Frontend (new or extended):**
- Chat-surface source attribution rendering (M8 RefusalEnvelopeRenderer extensions)
- Memory tab voice section content (M8 F1 extension per D25)

**Tests (target ~80-120 new tests):**
- API route tests per Phase A infra setup
- LLM call-site output envelope schema tests
- Sufficiency catalog runtime tests
- Anti-pattern regex tests (catalog completeness against voice doctrine §5)
- voice_mode memory_fact integration tests
- Cleanup item migration tests

## 5.2 Documentation artifacts

**Vault writes (via mcpvault):**
- `decisions/2026-05-12-m9-conventions.md` — this doc, mirrored
- `milestones/M9/scope.md` — locked scope summary (Phase A)
- `milestones/M9/round-2-questions.md` — deferred decisions tracker (D26, D27, D28, D29 land here)
- `milestones/M9/items/<item-name>.md` — per-item progress notes during implementation
- `milestones/M9/M9-close.md` — close report at milestone close

**Repo writes:**
- `~/koast/docs/architecture/agent-loop-v1-milestone-9-conventions.md` — this doc, canonical
- `~/koast/docs/architecture/agent-loop-v1-milestone-9-report.md` — close-of-milestone report
- `~/koast/docs/testing/api-route-tests.md` — Phase A test infra pattern

**CLAUDE.md updates (Phase H):**
- M9 conventions reference under "milestones" section
- M5/M6/M7/M8 backlog cleanup notes if any items closed by M9

## 5.3 Phase gates

- **Phase 1 STOP gates:** Per phase per §3.2.
- **Mid-milestone smoke gates:** Per phase per §4.2.
- **M9 close gate:** Full staging smoke per §4.2.

---

# Section 6 — Anti-scope (explicit)

## 6.1 Deferred to M10+

- **Cluster C — Calibration substrate (F8):** `host_action_patterns` table + calibration logic + rate-push revert substrate. Honest-scope copy persistence past M9 accepted; M9 Phase H copy refresh extends timing language.
- **Cluster D — Audit feed + export completion:** `notifications.host_id` migration + 5th audit-feed source; memory export substrate.
- **D30 — Pricing engine schema-export rewrite** ("proper engine output rewrite"): explicit defer.
- **D24 — LLM judge nightly** for tonal regression: shape regex ships in M9; LLM judge phased to M10 candidate.
- **`guests` table + back-population** (Method-in-code Tier 1; milestone-shaped scope).
- **Voice extraction worker / Mode 1 generative voice:** F5/F6 ship foundation; extraction post-Mode-2-shipped + threshold data accumulation.
- **Sub_entity_type vocabulary expansion** (CF #22).
- **Operational memory category build-out.**
- **Orb-mode foregrounding** (collapsed-chat affordance).
- **Multi-user model + RLS rewrites** (Method-in-code Phase 3).
- **Agent tool catalog expansion** (~36 missing tools per Method-in-code Phase 2).
- **Direct booking subsystem** (Method-in-code Phase 4).
- **Acquisition speculation paths** (per M8 diagnostic appendix).

## 6.2 Not in M9 even though tempting

- Tier 2 context-aware LLM-generated starters (D10) — Phase 2 work.
- Property creation via chat (D21) — deferred to direct-booking-site work; `research/2026-05-10-property-creation-direct-booking-bundle.md` is the inheritance pointer.
- Fold `/comp-sets` into `/market-intel` (G R-1) — product evaluation, not architecture.
- Drawer filter chips (G R-5) — surface-if-need-flagged.
- Mobile tooltip for topbar "?" (H R-3) — observability item.
- Negative-delta cohort handling (E C2) — surface-if-traffic-flags.
- Weekend definition config (E C2 v1.6) — surface-if-traffic-flags.
- Per-property voice variation (Belief 7 "fills in over time") — first multi-brand operator unblocks.
- Embeddings as voice-extraction complement — post-Mode-1-generative.

## 6.3 Substrate-enabling work happening *during* M9 (not anti-scope)

These look like scope expansion but are the cost of doing the items right:

- API route test infrastructure (X2) — closes 5 separate M8 carry-forwards (F9 / C5 / C4 / audit-feed / route-tests). Phase A first-session work.
- Memory tab voice section content (M8 F1 extension) — voice_mode renders here per D25.
- Voice doctrine §5 enumeration discipline — anti-pattern catalog stays synced with regex test layer per D24.
- Repomix regenerate (Phase A complete) — stale May 5 output replaced by current f6e4f64 state (6.91 MB).
- `original_draft` storage migration if D29 lands on option (a) or (c) — small migration; non-blocking.

---

# Section 7 — Implementation prompt for Claude Code

## 7.1 Session start protocol

Every M9 implementation session begins with:

```
1. Pull vault: cd ~/koast-vault && git pull
2. Pull repo: cd ~/koast && git pull
3. Read via mcpvault:
   - decisions/2026-05-12-m9-conventions.md (this doc)
   - method/koast-method.md
   - method/koast-method-in-code.md
   - method/voice-doctrine.md
   - milestones/M8/M8-close.md (M9 inheritance roll-up)
   - milestones/M9/scope.md (created in Phase A)
   - milestones/M9/round-2-questions.md (if exists)
   - milestones/M9/items/<current-item-name>.md (if mid-item)
4. Read repomix-output.xml for current code state
5. Confirm session focus with human: "Working on Phase X, item <Y>?"
```

If session is the first M9 session post-conventions-lock, run Phase 1 STOP per §3 (Phase B audit).

## 7.2 Phase 1 STOP execution per phase

Each phase's first session runs the phase-scoped Phase 1 STOP audit (§3.2). Halt report at `milestones/M9/<phase>-phase-1-stop.md` via mcpvault, commit + push, halt for human sign-off.

## 7.3 Per-item implementation pattern

For each item (A1-A7, B1-B2, E1-E4):

1. Read or create `milestones/M9/items/<item-name>.md` via mcpvault
2. Verify the item's architectural decisions (referenced D22-D31 + M8 D1-D21 where applicable)
3. Verify voice doctrine bindings if voice-bearing surface
4. Implement per architectural decisions
5. Write tests covering acceptance criterion (API route tests using Phase A infra)
6. Update item progress note
7. Run item's smoke gate
8. Commit code with substantive message: `git commit -m "M9 <item-id>: <what shipped>"`
9. Update CF backlog if new CFs surfaced

## 7.4 Round-2 question protocol

When a Round-2 question surfaces during implementation (D26, D27, D28, D29 are pre-flagged):

1. Halt the current item
2. Write question to `milestones/M9/round-2-questions.md` with what's blocked, candidate resolutions, recommended resolution
3. Commit + push
4. Surface to human: "Round-2 question on <item>: <summary>."
5. Wait for human resolution
6. Resume implementation with locked answer
7. Update round-2-questions.md with the resolution

## 7.5 Doctrine compliance review

Every voice-bearing surface gets a doctrine compliance review before smoke gate. Per M8 §7.5; voice doctrine §5 anti-patterns are now also enforced via shape regex CI (D24) — review surfaces anything regex misses.

## 7.6 Vault hygiene during M9

Vault writes via mcpvault per CLAUDE.md policy. No Bash filesystem fallback for vault destinations. If mcpvault unavailable: halt, surface, do not write via filesystem.

Per-session vault writes expected:
- Session note at session start (`sessions/YYYY-MM-DD-m9-<topic>.md`)
- Item progress note as implementation proceeds (`milestones/M9/items/<item-name>.md`)
- Round-2 questions if surfaced
- Phase 1 STOP report per phase

## 7.7 Discipline carries (M8 §4 lessons applied)

Apply by default, no re-derivation:

1. Diagnostic-then-halt at phase-step granularity
2. Same-PR conventions revisions
3. Test-strength + browser smoke balance
4. Substrate verification before locking forward-state copy
5. Content as voice-doctrine-load-bearing surface
6. Pre-dispatch intercept pattern (loop.ts)
7. host_state for continuous-write state
8. memory_fact-as-state for milestone markers (extended to evolved state per D25)
9. Helper-layer humanization
10. Cohort dispersion via IQR over stddev (small-N)

M8 discipline gaps locked as M9 process:

- **G1.** Phase duration calibration — anchor estimates on truth, surface substrate-vs-surface risk per phase
- **G2.** Cumulative scope discipline at conversation granularity — check after ~3-4 reasonable expansions, surface BEFORE compounding
- **G3.** Vercel-build-fix discipline — clear `.tsbuildinfo` before `tsc --noEmit`; local Next build dry-run as final gate on prompt-sensitive routes
- **G4.** Schema migration discipline — schema.ts updates SAME commit as migration
- **G5.** Side-effect-on-GET avoidance — Phase G closes M8 idle-status compromise (E1)
- **G6.** Cross-surface coherence verification at phase close
- **G7.** Substrate-step visual verification at Hard Checkpoints

New questions for v2.0 observation:

- **N1.** Late-M8 architectural-stability signal (G+H+I shipped zero conventions revisions). M9 budgets 3 revisions; observe variance.
- **N2.** Cluster-vs-Phase organization. M9 SHAPE 2 uses one-cluster-per-phase pattern (Phase B-C-D for Cluster A; Phase E for Cluster B; Phase G for Cluster E). Single conventions doc per X1 sign-off.

## 7.8 Milestone close protocol

Final M9 session (Phase H):

1. Verify all SHAPE 2 items shipped per `milestones/M9/scope.md`
2. Verify all smoke gates passed
3. Run M9 close gate (full staging smoke per §4.2)
4. Draft `milestones/M9/M9-close.md` covering:
   - What shipped (per item)
   - What was deferred (with reasoning)
   - Round-2 questions resolved during implementation (D26-D29 land here)
   - Carry-forwards generated (CFs from M9 work)
   - Honest-scope copy refresh applied (F8 / memory-export language extended)
   - Voice doctrine evolutions if any
5. Mirror report to `~/koast/docs/architecture/agent-loop-v1-milestone-9-report.md`
6. Update `~/koast/CLAUDE.md` with M9 conventions reference
7. Tag the milestone close commit (`m9-close`)
8. Surface to human: "M9 shipped. Report at milestones/M9/M9-close.md."

---

# Section 8 — References

## 8.1 Method documents
- `method/koast-method.md` — seven Beliefs and values commitment
- `method/koast-method-in-code.md` — engineering grounding of Method commitments

## 8.2 Voice doctrine
- `~/koast/docs/voice.md` — code-import canonical
- `method/voice-doctrine.md` — Method-grounding canonical (anti-pattern §5 referenced by D24 shape regex)

## 8.3 M8 inheritance
- `milestones/M8/M8-close.md` — M9 inheritance roll-up
- `decisions/2026-05-05-m8-conventions.md` — M8 conventions v1.7 (D1-D21 inherited)
- `decisions/2026-05-05-convergence-diagnostic.md` — original 22-item gap analysis
- M9 Phase 1 STOP diagnostic (delivered 2026-05-12 via Telegram; locked SHAPE 2 + decision pre-locks)

## 8.4 Prior milestones
- M5 conventions: `~/koast/docs/architecture/agent-loop-v1-milestone-5-conventions.md`
- M6 conventions: `~/koast/docs/architecture/agent-loop-v1-milestone-6-conventions.md`
- M7 conventions: `~/koast/docs/architecture/agent-loop-v1-milestone-7-conventions.md`
- M7 report: `~/koast/docs/architecture/agent-loop-v1-milestone-7-report.md`
- M8 conventions: `~/koast/docs/architecture/agent-loop-v1-milestone-8-conventions.md`

## 8.5 Project-level documents
- `~/koast/CLAUDE.md` — project working agreements, vault policy
- `~/koast/DESIGN_SYSTEM.md` — visual + interaction conventions
- Repomix output: `~/koast/repomix-output.xml` (regenerated 2026-05-12 against f6e4f64)

---

*End conventions, v2.0.*
