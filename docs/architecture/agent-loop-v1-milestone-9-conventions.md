# Agent Loop v1 — Milestone 9 Conventions

**Status:** Locked, v2.6
**Drafted:** 2026-05-12
**Revised:** 2026-05-12 (M9 Phase A v2.1 — §6.3 correction + verification discipline; M9 Phase B v2.2 — D26 locked α + Q-B3 + Q-B4 resolutions + M10 carry-forwards; M9 Phase C v2.3 — D22 locked Option II API-layer + D23 locked Option B per-generator-call + Q-C1 vocabulary rename + 7 G8 catches + α + γ blend C1 uniform + G8 institutional pattern + M10 inheritance; M9 Phase F v2.6 — D24 shape-regex layer shipped + structural call-site/constitution scope bifurcation + M10 inheritance + G8 stratification across pre-design / implementation-runtime / CI-activation / deployment-gate layers + phase-close multi-gate discipline)
**Canonical locations:**
- `~/koast/docs/architecture/agent-loop-v1-milestone-9-conventions.md` (repo, canonical for code-import)
- `decisions/2026-05-12-m9-conventions.md` (vault, canonical for Method-grounding via mcpvault)

**Pre-deliverables (already shipped):**
- M8 close: `milestones/M8/M8-close.md` (M9 inheritance roll-up)
- M9 Phase 1 STOP diagnostic: 2026-05-12 (delivered via Telegram; locked SHAPE 2 scope, A2/A3/A5 architectural locks, A1/A4 Round-2 defers, B1 lock, B2/B3 Round-2 defers, X1 single conventions doc, X2 API route test infra closes first session, X3 pricing engine rewrite stays deferred)

**Method grounding:** This milestone operationalizes Belief 5 (Honest confidence) and Belief 7 (The host's voice) via underlying-architecture substrate at the four existing LLM call sites. Inherits Beliefs 1-4 from M8 conventions unchanged. Belief 6 (full digital substrate) is held to its Method-in-code Phase 2 framing; M9 ships substrate-shaped honesty without expanding capability breadth.

**Naming:** "Honesty + Voice Substrate" — M8 shipped the visible surface of trust; M9 ships the underlying architecture of honesty.

## Changelog

**v2.5 — 2026-05-15 (M9 Phase E close)**

- **D25 voice_mode shape locked:** entity_type='host' + sub_entity_type='voice'. Fact payload JSONB carries `mode` + features (cadence stats, greeting/closing patterns, vocabulary signature, sample_count) + optional seed_samples. Honors M8 C13 binding copy.
- **B2 Mode 2 propagation locked at (a):** single doctrine import + voice_mode parameter, uniform across Sites 1-4 via `buildVoicePrompt`. G8-E3 caught net-new integration.
- **B3 original_draft capture locked at (a) v1:** `original_draft_text` column on messages + guest_reviews. Separate table = M10 candidate.
- **Voice learning mechanism = (iii) hybrid:** features + samples. SHAPE-RECOGNITION only; generative Mode 1 = M10+.
- **Supersession trigger:** threshold-based (sample_count crosses 2× prior baseline).
- **Voice extraction worker:** TS substrate ships; nightly scheduling infrastructure follow-up post-Phase E.
- **Memory tab voice section UI deferred to M10** per Phase A Q-A1 component-test-infrastructure deferral.
- **6 G8 catches in Phase E** — fifth consecutive M9 phase. Running total 20 catches across A-E.
- **§6.8 M10 inheritance from Phase E** (6 carry-forwards).
- **Phase E artifacts:** migration `20260515220000_voice_substrate.sql` + schema.ts + voice-fact-schema.ts + voice-mode.ts + extraction-worker.ts + build-voice-prompt.ts + 4 generator/route updates + 21 new tests. Phase D baseline 596 → 617 tests passing.
- **Phase E budget vs v2.0 nominal Days 13-16:** actual <1 working day. Continues Phase A-D calibration pattern.

**v2.4 — 2026-05-15 (M9 Phase D close)**

- **D27 resolved at Option ε** (audit-surfaced beyond v2.0 α/β/γ/δ framing): post-stream classifier (A4 chat-text refusal substrate-catch) + `stop_reason === "refusal"` branch upgrade to emit RefusalEnvelope (closes G8-D3). v2.0 α framing (M8 P4 extension) was not viable — P4 is tool-input classifier inside `stop_reason === "tool_use"` branch; chat-text path is `stop_reason === "end_turn"` else branch (different hook locations).
- **A6 = A6-3 scope:** A6-1 in-turn duplicate detection (shares A4 post-stream-classifier substrate; detection-only at Phase D, truncation M10 candidate) + A6-2 fact-write hardening (retry-with-backoff + error-level log on persistent failure; replaces M8 silent try/catch + console.warn swallowing pattern).
- **Shared pattern catalog at `src/lib/agent/refusal-patterns.ts`:** authored data consumed by Phase D runtime classifier AND Phase F D24 CI shape regex (when F ships). No drift between runtime + CI enforcement layers.
- **4 G8 catches in Phase D:** G8-D1 M8 P4 pre-dispatch pattern does NOT transfer directly to chat-text path; G8-D2 A4 + A6 share substrate boundary (single new module covers both); G8-D3 `stop_reason === "refusal"` currently emits generic event, not envelope (predates M8 F4); G8-D4 A6 scope = (ii) strengthen existing partial substrate, not net-new.
- **§7.7 institutional pattern Phase D entry added.** M9 v2.0 was drafted with systematic verification gap; G8 has now caught v2.0 framing drift at FOUR consecutive phase kickoffs (Phase A test infra, Phase B site count, Phase C D22 scope + D23 granularity, Phase D D27 hook-location).
- **§6.7 M10 inheritance from Phase D** — γ streaming-aware per-chunk classifier (deferred unless real-traffic latency surfaces), Phase F D24 CI inherits `refusal-patterns.ts` substrate, A6-1 truncation (Phase D ships detection-only), A6-2 fact-write failure audit table (Phase D logs at error level).
- **Phase D artifacts (substrate):** `src/lib/agent/refusal-patterns.ts` (pattern catalog), `src/lib/agent/post-stream-classifier.ts` (classifyAccumulatedText + upgradeStopReasonRefusal), 23 new tests across two test files, `loop.ts` hook integrations at 3 activation points + A6-2 retry-with-backoff. Existing `loop.test.ts` refusal test updated to assert envelope shape per G8-D3 closure.
- **Phase D budget vs v2.0 nominal Days 10-12:** actual <1 working day. Continues Phase A/B/C calibration pattern.

**v2.3 — 2026-05-12 (M9 Phase C close)**

- **D22 propagation pattern locked: Option II parallel return path.** Generators return parallel shape (legacy content fields + envelope of AgentTextOutput shape); routes expose envelope in response shape uniformly across 4 routes per α + γ blend (C1 uniform lock).
- **D22 scope clarified: Phase C ships API-layer propagation only.** UI integration (envelope reaches rendering components for confidence/grounding display) deferred to M10 per (η.4). Two-layer architecture surfaced; see §6 M10 inheritance.
- **D23 scope clarified: per-generator-call catalog (Option B).** v2.0 "per-tool catalog" framing was wrong granularity; M8 C3 D9 MISSING_CAPABILITY_COPY already covers propose_guest_message at the per-tool level. Real sufficiency-relevant gap was at generator-call layer (Sites 1-4 buildEnvelope inline heuristics); catalog formalizes those.
- **Q-C1 (c) vocabulary resolution: envelope field renamed `sufficiency_signal` → `output_grounding`.** Distinct from M8 C3 sufficiency.ts (rich/lean/thin for host-onboarding state). See §4 vocabulary distinction note. Phase C STEP 2 mechanical rename across schema + 4 generators + 4 test files.
- **Q-C2 (β) retroactive phase notes:** `milestones/M9/items/phase-a.md` + `phase-b.md` + `phase-c.md` written; per-phase notes continue through M9. Restores M8 parity.
- **7 G8 catches in Phase C** — most of any M9 phase. G8-1 vocabulary drift; G8-2 C2 ConfidenceBandedRange pricing-vs-LLM substrate distinction; G8-3 per-tool catalog scope correction; G8-4 rendering surface count correction; G8-5 retroactive phase notes gap; G8-6 M8 C3 ↔ D23 boundary; G8-7 D22 two-layer architecture (mid-implementation halt). See §7.7 institutional pattern.
- **§7.7 G8 institutional pattern:** M9 v2.0 was drafted with systematic verification gap; G8 caught v2.0 framing misses at every phase kickoff (Phase A test infra, Phase B site count, Phase C D22 scope + D23 granularity). M10 conventions drafting must include explicit ground-truth verification per architectural claim. This is institutional learning, not just process discipline.
- **§6.6 M10 inheritance** — D22 UI integration (two-layer, non-uniform across hybrid consumer pattern), voice doctrine for confidence rendering, v2.0 verification gap institutional pattern, C2 ConfidenceBandedRange evaluation (G8-2 left open).
- **Phase C artifacts (substrate):** `src/lib/agent/sufficiency-catalog.ts` (D23 catalog + per-site entries; gradient3 shared helper), `src/lib/agent/__tests__/sufficiency-catalog.test.ts` (14 catalog tests). Generator + route signatures updated across 4 sites with parallel-return shape; Phase B tests adjusted to assert envelope alongside legacy fields. Backward-compat preserved at response level (legacy fields still present; envelope additive).
- **Phase C budget vs v2.0 nominal Days 7-9:** actual ~1 working day across STEPs 1-7. First M9 phase to ship within nominal but well under upper bound. v2.2 §7.7 G1 calibration discipline + G8 application working as designed.

**v2.2 — 2026-05-12 (M9 Phase B close)**

- **D26 locked = α (generic wrapper).** First-call-site implementation (Site 1 — `messaging.ts:generateDraft`) demonstrated α's fit empirically: per-site marginal cost ~7 lines wrapper invocation + ~25-line `buildEnvelope` helper. Repair retry + fall-through handled once in the wrapper; Sites 2-4 inherit. Counter-test for β: ~120 lines duplicated control flow across 4 sites. α wins on minimal duplication + clean composition + inheritance to ~40 future tool catalog.
- **Q-B3 resolved: two envelopes per SDK call.** `generateGuestReview` makes 2 sequential SDK calls; applying the wrapper twice with separate `buildEnvelope` functions is the natural fit. Different context inputs + different sufficiency profiles; one combined envelope would have forced artificial flattening.
- **Q-B4 resolved: Site 4 bias rules stay at prompt-level** (per Phase B sign-off). F3 does NOT add structural `.refine()` for `generateGuestReviewFromIncoming`'s rating-tier banned-phrase patterns. Voice-doctrine refinements remain D24 Phase F territory (tonal regression substrate).
- **New §6.5 — M10 carry-forwards from Phase B sign-off.** Three items: Site 5 chat-text catch (Phase D D27/A5 ownership confirmed), model version standardization (sonnet-4-5 vs sonnet-4 drift surfaced at Site 5), G8 verify-shipped-state at every phase kickoff (v2.1 discipline re-validated by Phase B's 5-vs-4 finding).
- **§7.7 amended.** G8 carries forward to every M9 phase kickoff (not just conventions-revision time). Phase C onward applies G8 to its Phase 1 STOP audit.
- **Phase B artifacts (Sites 1-4 substrate):** `src/lib/agent/schemas/agent-text-output.ts` (D22 envelope + SourceRef Zod schemas), `src/lib/agent/llm-call.ts` (α wrapper `callLLMWithEnvelope` + `LLMSchemaError`), `src/lib/claude/messaging.ts` (Site 1 refactor), `src/lib/reviews/generator.ts` (Sites 2-4 refactor with two-envelope pattern at Site 2 + hedge metadata at Site 4 when private feedback flags issues). 28 new tests across 4 test files (7 schema + 6 wrapper + 5 Site 1 + 10 Sites 2-4).
- **Phase B budget actuals:** v2.0 nominal Days 3-6; actual <1 working day implementation time. Continues Phase A pattern — phase budgets are scope-shaped, not duration-shaped at typical pace. Phase C kickoff applies the same calibration check via G8.

**v2.1 — 2026-05-12 (M9 Phase A)**

- §6.3 correction: API route test infrastructure exists (M6/M7 D38 substrate at `/api/agent/artifact` + `/api/agent/turn`); 7 endpoints owe tests (not 5). Phase B+ closes carry-forwards as adjacent work — no retroactive backfill in Phase A.
- New process discipline: conventions drafting must include "verify against shipped state" step before lock. M9 v2.0 §6.3 framing was drafted without verifying infrastructure absence; Phase 1 STOP audit caught it. Future revisions + M10 drafting include explicit verification step.
- §3 phase-budget acknowledgment: Phase A's 1-2 day estimate was scope-miss not duration-miss (infrastructure mostly existed; actual scope was doc + helpers + 1 exemplar ≈ half day). Other M9 phase budgets may have similar drift; Phase B kickoff re-budgets against actual M9 pace.
- §6 structural: §6.3 reframed as "M8 endpoint test carry-forwards (corrected v2.1)"; prior §6.3 substrate-enabling content moves to §6.4 with the API-route-test bullet updated (its v2.0 framing was the corrected error).
- Phase A artifacts shipped: `docs/testing/api-route-tests.md` (canonical pattern doc), `src/__tests__/helpers/supabase.ts` (shared mock factory), `src/app/api/audit-feed/unread-count/__tests__/route.test.ts` (canonical exemplar, 7 tests).

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

## D22 — Confidence metadata propagation locked: Option II parallel return (A2) [updated v2.3]

**Decision (v2.3 lock):** Option II — generators return parallel shape `{ ...legacy_content_fields, envelope: AgentTextOutput }` (Site 2 has two envelopes per Q-B3 — `envelope_review` + `envelope_note`). Routes expose envelope(s) in response shape uniformly across 4 routes (`/api/messages/draft` + 3 `/api/reviews/*` routes). Two-layer architecture: Phase C ships Layer 1 (API-layer propagation); Layer 2 (UI integration — envelope reaches rendering components for confidence/grounding display) deferred to M10 per α + γ blend (C1 uniform lock).

**Reasoning:** Phase C STEP 4 mid-implementation halt surfaced G8-7 — `/api/messages/draft` has NO direct UI consumer (persist-then-fetch via messages table → thread fetch). STEP 4.5 audit revealed hybrid consumer pattern across the 4 routes (Sites 1+2 persist-then-fetch; Sites 3+4 direct UI fetch). α + γ blend locked: API-layer propagation uniform; UI integration deferred to M10. C1 uniform treatment preserves M10 ability to design Layer 2 integration holistically across the hybrid consumer pattern.

Option II preserves Phase B's internal-envelope work (smallest delta from Phase B substrate). Generator's `buildEnvelope` helpers stay in place (now consume D23 catalog per D23 lock); route handlers receive both shapes; UI evolves incrementally in M10.

Layer 2 effort is non-uniform across the 4 routes (Phase C STEP 4.5 audit found hybrid consumer pattern):
- Sites 1 + 2 (persist-then-fetch via thread route): Layer 2 requires DB persistence + thread route extension + component prop threading
- Sites 3 + 4 (direct UI fetch): Layer 2 is component prop threading only

v2.0 D22 framing assumed single-phase scope. G8-7 catch corrected.

**Implications:**
- All 4 generators return parallel shape with envelope (Site 2 returns two envelopes per Q-B3).
- All 4 routes expose envelope in response shape (`envelope` for Sites 1/3/4; `envelope_review` + `envelope_note` for Site 2; `envelope` field optional in Site 3 `/api/reviews/respond` since the route also has save_draft/approve paths that don't run the generator).
- Backward compatibility preserved (legacy response fields unchanged; envelope additive). Existing UI consumers (ReviewSlideOver, GuestReviewForm) ignore the additive `envelope` field via loose property access — no UI-side changes needed in Phase C.
- D22 confidence metadata still computed via deterministic-from-context per D23 catalog (Phase B substrate; D23 formalized in Phase C). M10 may extend to memory-retrieval-derived confidence when read_memory is wired through generators' prompt context.

## D22 — Confidence metadata propagation locked (A2) [original v2.1 framing, superseded by v2.3 lock above]

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

## D23 — Sufficiency thresholds — per-generator-call catalog locked Option B (A4) [updated v2.3]

**Decision (v2.3 lock):** Option B — per-generator-call catalog at `src/lib/agent/sufficiency-catalog.ts`. Catalog formalizes Phase B's inline `buildEnvelope` heuristics into typed per-Site threshold entries (Sites 1-4). `buildEnvelope` helpers consume the catalog (`<Site>Threshold.evaluate(input)`) instead of inline gradient logic.

**Reasoning:** Phase C audit revealed v2.0 "per-tool catalog" framing was wrong granularity (G8-3):

- 4 agent tools exist: `read_memory`, `read_guest_thread`, `write_memory_fact`, `propose_guest_message`.
- Only `propose_guest_message` has a substantive sufficiency surface (input-time gate on required capabilities), and M8 C3 D9 `MISSING_CAPABILITY_COPY` registry already covers it.
- Real sufficiency-relevant gap was at the **generator-call** layer — Sites 1-4 had inline gradient heuristics inside their `buildEnvelope` helpers. D23 catalog formalizes those.

Per-tool sufficiency stays with M8 C3 D9 registry; D23 does not duplicate. M8 C3 ↔ D23 boundary (G8-6) made explicit in §4 vocabulary distinction note.

Catalog structure:
- Per-Site entry: `GeneratorThreshold<TInput>` with `generator` name + `evaluate(input)` returning `{ confidence, output_grounding }`.
- Shared `gradient3(presentCount, totalCount)` helper expresses the 3-tier "all/some/none → confirmed-rich/high_inference-sparse/active_guess-empty" pattern across multi-axis entries.
- Site 2 has two entries — `generateGuestReviewThreshold` (review_text, 3-axis) + `generatePrivateNoteThreshold` (private_note, constant "active_guess/sparse") — per Q-B3 two-envelope resolution.

**Implications:**
- `buildEnvelope` helpers become thin wrappers (extract context for catalog input + assemble final envelope shape including site-specific extras like Site 4's `hedge`).
- D23 catalog uses the same `rich | sparse | empty` vocabulary as M3 `read_memory.data_sufficiency.sufficiency_signal` — they're the same concept (output-time grounding). Distinct from M8 C3 `SufficiencyLevel` (rich/lean/thin host-onboarding) — different vocabularies at field-name level (Q-C1 (c) rename to `output_grounding`).
- 14 catalog unit tests (`src/lib/agent/__tests__/sufficiency-catalog.test.ts`) cover all entries.
- M10 may extend catalog with read_memory wire-through (catalog input includes retrieved memory_facts state; entries downgrade grounding when retrieved facts are sparse/empty). Currently catalog derives grounding from caller-provided context, mirroring Phase B's inline heuristics.

## D23 — Sufficiency thresholds locus locked (A4) [original v2.1 framing, superseded by v2.3 lock above]

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

## D24 — Tonal regression mechanism locked (A7) [updated v2.6]

**Decision (v2.6 lock):** Shape-regex layer shipped Phase F; LLM judge layer deferred to M10. Structural scope: D24 shape-regex gates **call-site prompts**; constitution prompts defer to M10 LLM judge.

**M9 Phase F shipped:**
- Shape primitive (γ extraction): `src/lib/agent/patterns/types.ts` — `PatternEntry<TKind>`, `PatternMatch<TKind>`, `findFirstMatch`, `findAllMatches`. Shared with M9 Phase D refusal-patterns module via re-export (zero consumer churn).
- Voice anti-pattern catalog: `src/lib/voice/anti-patterns.ts` — 66 patterns enumerated across voice doctrine §5.1-§5.6 (sycophancy Koast-to-host 6 + host-to-guest 4; apology theater 7; over-hedging 7 single + 1 stacked; corporate voice 17 phrases + 4 constructions; chipper/lifestyle-brand 9; AI-recognizable 9 constructions + 2 specific). 7 stub entries in `PHASE_F_DEFER_TO_M10` document non-shipped catalog enforcement work by `planned_layer` (output-filter | llm-judge).
- Runner + allow-list: `src/lib/voice/anti-patterns.runner.ts` — `PROMPT_BEARING_FILES` literal allow-list (call-site prompts, gated) + `CONSTITUTION_PROMPTS` documented deferred surface. `scanFile()` returns line + ±20 char context for failure UX.
- Test wiring: `src/lib/voice/__tests__/anti-patterns.test.ts` — three describe blocks (catalog completeness introspection, meta-tests against fixtures, prompt-bearing file scan). 16 tests; 14 passing + 2 `test.skip` (constitution prompts surfaced in jest output rather than invisibly excluded).
- Fixtures: `src/lib/voice/fixtures/{all-patterns,clean,edge-cases}.fixture.ts` — covers every catalog id; doctrine-honest clean voice; 5 edge cases including permitted-apology, single-hedge, stacked-hedge, quoted-violation, corporate-in-doctrine.
- CI workflow: `.github/workflows/ci.yml` — single job, Node 20, ubuntu-latest, steps `npm ci → npm run lint → npx tsc --noEmit → npm test`. Triggers on `pull_request` against main + `push` to main. Additive to Vercel's existing tsc + ESLint deploy pipeline.

**Scope clarification (Phase F STEP 7 PATH C lock):** Prompt-bearing files split into two structurally distinct classes:

- **Call-site prompts** — direct output generation; voice violations leak to user-facing output. Gated by D24 shape-regex (PROMPT_BEARING_FILES). Current members: `src/lib/claude/messaging.ts`, `src/lib/reviews/generator.ts`.
- **Constitution prompts** — behavior-defining; teach voice doctrine via negative-example pedagogy; quote-vs-instance ambiguity inherent to the file class. Documented in CONSTITUTION_PROMPTS export. Deferred to M10 LLM judge. Current members: `src/lib/voice/build-voice-prompt.ts`, `src/lib/agent/system-prompt.ts`.

Operational discipline codified at §7.9.

**LLM judge layer deferred to M10.** Larger investment (prompt engineering, sample selection, comparator-judge setup, drift-alert routing); warrants its own milestone shape. M10 inheritance enumerated at §6.9.

**Reasoning:** Voice doctrine §1.6 ("Voice violations are bugs") requires actionable detection. Shape regex is cheap, fast, and catches the regression class M8 F.5 caught at smoke gate (chat-text refusal voice drift) — pulling that to CI prevents drift before staging. LLM judge handles harder semantic-drift case but warrants its own milestone shape. The structural call-site/constitution bifurcation was surfaced during STEP 7 catalog runtime (G8-F4); /ultraplan's initial 4-file PROMPT_BEARING_FILES list had conflated two surfaces.

**Honest scope record (Phase F):** CI activation surfaced unrelated pre-existing lint debt (Phase D origin: `let refusalReason` never reassigned; Phase E origin: `as any` directive misplacement on voice-mode.ts; Phase E origin: unused `messagesOrder` jest.fn). Vercel's existing build pipeline did not gate on these. Lint cleanup landed as STEP 8.5 prerequisite to STEP 8 CI workflow. G8-F5 institutional catch codified at §7.7. CI activation also surfaced undeclared ts-node devDependency (G8-F7) — ambient in local node_modules but not in `package.json`; jest's `jest.config.ts` parsing requires ts-node. Fix shipped same-step with package.json + package-lock.json declaration.

## D25 — voice_mode locus + payload locked (B1) [updated v2.5]

**Decision (v2.5 lock — extends v2.0 Path B):** voice_mode lives as `memory_fact` on `entity_type='host'` + `sub_entity_type='voice'`. Fact payload value (JSONB):

```typescript
{
  mode: 'neutral' | 'learned',
  features: {
    sentence_length_avg: number,
    sentence_length_stdev: number,
    greeting_patterns: string[],
    closing_patterns: string[],
    vocabulary_signature: string[],
    sample_count: number,
  },
  seed_samples?: string[]
}
```

Feature mapping to M8 C13 binding copy: cadence → sentence_length_avg/stdev; vocabulary → vocabulary_signature[]; sign-off → closing_patterns[]; greeting_patterns[] bonus axis supporting "recognizably yours at scale."

Migration `20260515220000_voice_substrate.sql` extends sub_entity_type CHECK to include 'voice'. Substrate at `src/lib/memory/voice-fact-schema.ts` + `src/lib/memory/voice-mode.ts`. Phase E ships SHAPE-RECOGNITION only per Method-in-code Belief 7 v1; generative Mode 1 = M10+.

## D25 — voice_mode locus locked (B1) [original v2.1 framing, superseded by v2.5 lock above]

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

## D26 — Output-schema enforcement locus locked α (A1) [updated v2.2]

**Decision (v2.2 lock):** α — generic wrapper module at `src/lib/agent/llm-call.ts` (`callLLMWithEnvelope`). All 4 Phase B sites use the wrapper. Site 2 invokes it twice (Q-B3 — two envelopes, one per SDK call).

**Reasoning:** First call-site implementation (Site 1 — `messaging.ts:generateDraft` at Phase B Site 1 sign-off) demonstrated α's fit empirically. Per-site marginal cost ≈ 7 lines wrapper invocation + ~25-line `buildEnvelope` helper encoding deterministic-from-context heuristics. Repair retry + fall-through to error handled once in the wrapper; Sites 2-4 inherit the behavior without duplication.

Counter-test for β (per-site Zod) would duplicate ~30 lines of call + extract + build + validate + retry + throw control flow per site, ~120 lines across 4 sites. α wins on minimal duplication, clean composition, and inheritance to the ~40 future tool catalog (Method-in-code Phase 2).

Option γ (hybrid) doesn't apply for Phase B since Site 5 is out of scope per Path A. If Site 5's text-output path ever lands under F3 (currently D27/A5 territory), the wrapper either extends to support streaming or γ becomes the fit — that decision lives in M10 alongside the model-version standardization (§6.5 CF #2).

**Implications:**
- All 4 Phase B sites use `callLLMWithEnvelope`. Site 2 (`generateGuestReview`) invokes it twice (Q-B3 two-envelopes resolution).
- Site-specific customization happens via the `buildEnvelope` callback + optional `repairPrompt` override. Adequate flexibility without site-specific control flow.
- Backward compatibility preserved (Option B migration): generator signatures stay legacy (`Promise<string>` for Site 1, `Promise<ReviewResult>` for Site 2, etc.). Envelope flows through F3 internally. Phase C wires the envelope through to rendering surfaces.
- The wrapper exports `LLMSchemaError` for callers that want to distinguish schema-failure from other errors. Default behavior is throw-and-propagate; downstream routes' existing try/catch + 500-with-message pattern handles it correctly per CLAUDE.md error discipline.

## D27 — Substrate-catch for chat-text refusals locked Option ε (A5) [updated v2.4]

**Decision (v2.4 lock):** Option ε — post-stream classifier (β) + `stop_reason === "refusal"` branch upgrade to emit RefusalEnvelope (closes G8-D3). Single substrate at `src/lib/agent/post-stream-classifier.ts`; two activation points in `loop.ts` (post-`stream.finalMessage()` in `runOneRound` for embedded-refusal catch; `stop_reason === "refusal"` branch in `runAgentTurn` for explicit-refusal envelope upgrade).

**Reasoning:** Phase D Phase 1 STOP audit (G8-D1) revealed v2.0 D27 framing implied transferability of M8 P4 pre-dispatch pattern that doesn't hold:
- M8 P4 hook lives INSIDE `stop_reason === "tool_use"` branch (loop.ts ~281-330), operates on **tool input** (`block.input.message_text`).
- Chat-text path goes through `stop_reason === "end_turn"` else branch; text accumulated via `accumulatedText` during streaming. Different hook location, different input shape.
- P4 is a precedent for the classifier+envelope+break shape; A4 needs a new substrate hook point.

Option γ (per-chunk classifier during stream) over-engineered for current scale — false-positive risk on partial text ("I can't" → "I can't help" vs "I can't recall the exact details"). M10+ if real-traffic data shows latency cost from β waiting for finalMessage.

Option δ (system-prompt only) rejected — rejecting δ IS the meta-decision of shipping Phase D substrate.

Option ε surfaced from audit (G8-D3): `stop_reason === "refusal"` branch in loop.ts currently emits a generic `{ type: "refusal", reason }` event predating M8 F4 envelope substrate. A4 has TWO surfaces: embedded-refusal catch (end_turn text) + explicit-refusal envelope upgrade. Single classifier substrate covers both.

**Implications:**
- All chat-text refusal paths route through `RefusalEnvelope` (M8 F4 substrate); UI rendering uses existing `RefusalEnvelopeRenderer`.
- Pattern catalog at `src/lib/agent/refusal-patterns.ts` is the source of truth; Phase F D24 CI shape regex inherits same substrate.
- Detection-only at Phase D for A6-1 in-turn duplicates (truncation = M10 candidate).
- Legacy `refusalReason` variable retained on assistant turn JSONB column for backward-compat hydration; no caller sets it anymore.

## D27 — Substrate-catch for chat-text refusals deferred to Round-2 (A5) [original v2.1 framing, superseded by v2.4 lock above]

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

## 4.4 Vocabulary distinction (added v2.3)

Output-time grounding (envelope.`output_grounding`) and host-onboarding sufficiency (M8 C3 `SufficiencyLevel` in `src/lib/agent/sufficiency.ts`) are different concepts using distinct vocabularies:

- **`output_grounding`: `'rich' | 'sparse' | 'empty'`** — measures whether a specific generation is grounded in retrieved facts. Per-output, per-generation. Lives on `AgentTextOutput` envelope (D22). Field renamed v2.3 from `sufficiency_signal` per Q-C1 (c).
- **`SufficiencyLevel`: `'rich' | 'lean' | 'thin'`** — measures whether a host has configured enough across their portfolio for Koast to operate. Host-level, onboarding-completion-shaped. Lives on `SufficiencyClassification` output of M8 C3 `classifySufficiency`.

Field names distinguish them at substrate level; do not conflate. v2.3 rename eliminated the word-overlap conflation risk that v2.0/v2.1/v2.2 had carried.

A third related field — M3 `read_memory.data_sufficiency.sufficiency_signal` — shares the `rich | sparse | empty` vocabulary because it is the upstream substrate that envelope `output_grounding` inherits values from when memory retrieval underlies the generated content. read_memory's field keeps its name (M3-era convention; nested under `data_sufficiency` so semantic context is clear). They are structurally separate fields with identical vocabulary because they are conceptually the same signal.

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

## 6.3 M8 endpoint test carry-forwards (corrected v2.1)

API route test infrastructure shipped at M6/M7 D38 (`/api/agent/artifact/__tests__/route.test.ts` + `/api/agent/turn/__tests__/route.test.ts`). M9 Phase A canonicalized the pattern (`docs/testing/api-route-tests.md`) + shared helpers (`src/__tests__/helpers/supabase.ts`) + a third exemplar at `/api/audit-feed/unread-count/__tests__/route.test.ts`.

7 M8 endpoints currently lack route tests:

- `/api/audit-feed/list` (Phase C F9)
- `/api/audit-feed/since` (Phase C F9)
- `/api/audit-feed/unread-count` (Phase G C4) — **shipped Phase A** as canonical exemplar
- `/api/audit-feed/mark-seen` (Phase G C4)
- `/api/dashboard/tab-visibility` (Phase E C6) — helper-tested
- `/api/onboarding/idle-status` (Phase F C3) — also owes side-effect-on-GET fix per M9 Cluster E (E1)
- `/api/agent/conversations` (Phase B/D)

Phase B+ closes these as adjacent work when touching the endpoints. No retroactive backfill in Phase A (Trap 1 from Phase A diagnostic).

v2.0 originally framed this as 5 carry-forwards requiring infrastructure installation. Phase 1 STOP audit on 2026-05-12 corrected:

- Infrastructure exists (2 working exemplars at `/api/agent/artifact` + `/api/agent/turn`)
- Actual count is 7 (not 5)
- Gap is unwritten tests, not missing infrastructure

This correction prompted the new process discipline captured in §4.1 changelog and §3 phase-budget acknowledgment: conventions drafting must include explicit "verify against shipped state" before locking architectural framing.

## 6.4 Substrate-enabling work happening *during* M9 (not anti-scope)

These look like scope expansion but are the cost of doing the items right:

- API route test pattern documentation + shared helpers + canonical exemplar (Phase A complete) — canonicalizes the M6/M7 pattern; substrate-enabling for Phase B+ endpoint tests.
- D22 `AgentTextOutput` envelope schema + `callLLMWithEnvelope` α-wrapper (Phase B complete) — F3 substrate at single-shot LLM call sites 1-4. Phase C wires rendering propagation via D22 metadata; Phase D/A5 extends to Site 5 agent-loop text path.
- Memory tab voice section content (M8 F1 extension) — voice_mode renders here per D25.
- Voice doctrine §5 enumeration discipline — anti-pattern catalog stays synced with regex test layer per D24.
- Repomix regenerate (Phase A complete) — stale May 5 output replaced by current f6e4f64 state (6.91 MB).
- `original_draft` storage migration if D29 lands on option (a) or (c) — small migration; non-blocking.

## 6.5 M10 carry-forwards from M9 Phase B sign-off [added v2.2]

Three items surfaced during Phase B sign-off; explicitly captured here to prevent silent drift.

1. **Site 5 chat-text substrate-catch.** Per Path A sign-off, the agent loop's text output is OUT of F3 scope at Phase B. Coverage rolls forward to D27 (substrate-catch for chat-text refusals, Phase D Round-2) and A5 (substrate-catch coverage, Phase D). Not an M10 item per se — already named in Phase D scope. Captured here for traceability so that Phase D Phase 1 STOP audit picks up the Site 5 thread without re-derivation.

2. **Model version standardization.** Sites 1-4 use `claude-sonnet-4-20250514`; Site 5 (agent loop) uses `claude-sonnet-4-5-20250929`. Model-version drift surfaced during Phase B Phase 1 STOP audit. Standardization is M10 candidate (out of M9 scope); requires deliberate decision on which model becomes canonical (newer Site 5 model is the natural answer but should be validated against the legacy 4 sites' use cases before flip — e.g., does Sonnet 4.5 maintain the anti-fabrication-strong behavior at Site 4 that Sonnet 4 demonstrated?).

3. **G8 — verify-shipped-state at every M9 phase kickoff.** v2.1 introduced G8 as a conventions-drafting discipline ("verify against shipped state before locking architectural framing"). Phase B Phase 1 STOP audit re-validated its value by catching v2.0's 4-vs-5 site-count framing miss. v2.2 amends §7.7 to lock G8 at every M9 phase kickoff (not just at conventions-revision time). Phase C onward applies G8 to its Phase 1 STOP audit per §3.

## 6.8 M10 carry-forwards from M9 Phase E sign-off [added v2.5]

Six Phase E carry-forwards:

1. **Memory tab voice section UI (`MemoryVoiceSection.tsx`).** Phase A Q-A1 deferred component test infrastructure; v2.5 carries forward. UI ships M10 alongside D22 UI integration (Phase C §6.6 #1).
2. **Voice extraction worker event-driven invocation.** v2.5 ships nightly per Q-E7 (iii). M10: event-driven on message creation for faster voice adaptation.
3. **Separate `message_drafts` table.** v2.5 ships column approach per Q-E4 (a). Separate table M10 when diff history needs grow.
4. **vocabulary_signature[] implementation depth.** v2.5 ships frequency-ranked top-N + stop-word filtering. Richer signature (n-grams, collocations, register markers) M10.
5. **Generative Mode 1.** v2.5 ships shape-recognition; generative-from-scratch in host's voice is M10+.
6. **Nightly scheduling infrastructure decision.** TS substrate ships invocation-agnostic; Vercel Cron vs VPS systemd timer is small follow-up post-Phase E.

## 6.7 M10 carry-forwards from M9 Phase D sign-off [added v2.4]

1. **γ streaming-aware per-chunk refusal detection** — Phase D Option γ (per-chunk classifier during stream loop) was deferred because false-positive risk on partial text outweighs the latency win at current scale. If real-traffic data shows β post-stream classifier introduces noticeable latency, M10 evaluates γ.

2. **Phase F D24 CI inherits `refusal-patterns.ts` substrate.** v2.3 D24 split CI shape regex (M9 Phase F) + LLM judge nightly (M10) stands; the catalog is the shared source. Phase F imports the same pattern entries Phase D runtime uses; M10 LLM judge can reuse for evaluation prompts.

3. **A6-1 truncation (Phase D ships detection-only).** Text-mangling risk (cutting mid-sentence) deferred; M10 designs the truncation boundary if duplicate-detection telemetry shows the gap matters. A6-2 fact-write hardening + the M8 prompt directive already cover the cross-turn case.

4. **A6-2 fact-write failure audit table.** Phase D logs failures at `console.error` level. M10 candidate: write to `agent_audit_log` with `kind='a6_fact_write_failed'` so the failure surfaces in the audit feed for trust inspection.

## 6.6 M10 carry-forwards from M9 Phase C sign-off [added v2.3]

Three Phase C carry-forwards, plus institutional-pattern carry-forward:

1. **D22 UI integration (Layer 2 — two-layer architecture).** Phase C shipped Layer 1 (API-layer propagation). Layer 2 = envelope reaches rendering components for confidence/grounding display. Effort is non-uniform across the 4 routes per Phase C STEP 4.5 audit:
   - Sites 1 + 2 (persist-then-fetch via thread route): Layer 2 requires DB persistence + thread route extension + component prop threading.
   - Sites 3 + 4 (direct UI fetch): Layer 2 is component prop threading only.

   M10 conventions drafting scopes per-pattern; uniform Phase C starting state (4 routes expose envelope; zero components consume it).

2. **Voice doctrine for confidence rendering.** When envelope reaches rendering surfaces, how does Koast surface confidence/grounding metadata visually — numeric chip, hedge phrase, visual indicator, suppression on confirmed? Voice doctrine §3.4 honest-confidence binding applies; specific rendering pattern is M10 design decision.

3. **C2 ConfidenceBandedRange evaluation (G8-2 left open).** v2.0 D22 listed C2 ConfidenceBandedRange as a rendering surface, but audit showed it consumes a pricing-engine shape (`ConfidenceBandedRangeValue`) not the LLM-text envelope. v2.3 documents the distinction. M10+ may rationalize via a higher-level Confidence rendering abstraction; not a Phase D-or-later urgent item.

4. **Institutional pattern: M9 v2.0 verification gap.** See §7.7. M10 conventions drafting must include explicit "verify against shipped state per architectural claim" step before lock.

## 6.9 M10 carry-forwards from M9 Phase F sign-off [added v2.6]

Phase F shipped the D24 shape-regex layer; remaining catalog enforcement and adjacent operational disciplines roll forward to M10.

1. **Non-shape-regex catalog enforcement.** Sub-items by `planned_layer` (documented per-entry in `PHASE_F_DEFER_TO_M10`):
   - **(i) output-filter** — mode-dependent surface controls (§5.5 emoji policy). Mode-dependent (Koast-to-host=zero, host-to-guest Mode 1=learned, Mode 2=minimal); enforcement surface is OUTPUT text per-mode, not prompt-bearing files.
   - **(ii) llm-judge** — count-shape patterns (§5.5 exclamation cap: max one per response, milestone-context only). Count + semantic-context judgment, not phrase-shape regex.
   - **(iii) llm-judge** — heuristic descriptions (§5.6 ensure-verb-chain: "ensure with abstract objects"). Shape regex would false-positive legitimate uses of `ensure` with concrete objects.
   - **(iv) llm-judge** — contextual patterns (§5.7 Filler, §5.8 Self-narration, §5.9 Performative thoroughness). Length + structure + context-dependent.
   - **(v) llm-judge** — voice-doctrine.md self-scan (quote-vs-instance). Doctrine contains every banned phrase as quotation; v1 runner excludes the file. Judge can distinguish quote-from-instance.
   - **(vi) llm-judge** — constitution prompts self-scan (`build-voice-prompt.ts`, `system-prompt.ts`). Same architectural class as (v); constitution prompts cite banned phrases by name as negative-example pedagogy. Documented in CONSTITUTION_PROMPTS export at `src/lib/voice/anti-patterns.runner.ts`.

2. **Husky pre-commit for local fast-fail.** Developer convenience; not authoritative gate. CI remains the authoritative gate.

3. **Sentinel pattern** (`// koast-voice-allow: <id>`) for context-aware suppression. Useful only once LLM judge can read the sentinel context to decide whether suppression is doctrine-honest. M9 ships shape-regex-only and explicitly does NOT include per-line suppression sentinels.

4. **Refinement queue for known false-positives** surfaced in `__fixtures__/edge-cases.fixture.ts` (e.g., `case_quoted_violation` documents that v1 catalog matches inside quotes; M10 LLM judge distinguishes).

5. **Citation-section marker mechanism** (`[[cite: ...]]`) — deferred from PATH B analysis at STEP 7. Reconsider only if structural call-site/constitution bifurcation proves insufficient at M10; likely it will not, because structural is the answer.

## 6.10 Shape primitive extraction methodology [added v2.6]

Phase F's γ extraction pattern + supporting disciplines are inheritance methodology for M10's LLM judge catalog when it ships.

(a) **Extraction pattern (γ):** primitives live at `src/lib/agent/patterns/types.ts`; domain catalogs import from the types module. When M10's LLM judge catalog ships, its shape primitives follow the same `extract-to-patterns/` pattern (not `extract-to-judge/` or `extract-to-judge-types.ts` — same primitives directory, shared shape).

(b) **Re-export technique:** refactoring an existing primitive module preserves consumer surface via `export { ... } from "./patterns/types"` re-export rather than forcing consumer import-path updates. `src/lib/agent/refusal-patterns.ts` demonstrates: Phase D consumers (`post-stream-classifier.ts`, `__tests__/refusal-patterns.test.ts`) unmodified through the STEP 5 lift.

(c) **SHIP/DEFER prefix convention:** deferred catalog entries are prefixed `deferred_` to prevent id collisions with shipped entries of similar phrase shape. The catalog completeness meta-test enforces `/^deferred_[a-z0-9_]+$/` for the DEFER bucket. Surfaced organically during STEP 7 first re-run when the test rejected an unprefixed stub — exactly the kind of in-step structural surfacing the meta-test was designed for.

(d) **Catalog completeness introspection:** every SHIP entry must appear in the `all-patterns.fixture.ts` via `// pattern: <id>` delineation; meta-test verifies both directions (catalog→fixture and fixture→catalog) to catch orphan additions or removals. Forces same-PR fixture additions on catalog growth.

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
- **G8.** Verify-shipped-state at every M9 phase kickoff (v2.1 introduced as conventions-drafting discipline; v2.2 amends to ongoing per-phase process; v2.3 elevates to institutional pattern — see below). Phase 1 STOP audit at each phase verifies the conventions doc's assumed shipped state against actual repo state BEFORE design proposal. Catches scope-frame misses before architectural decisions compound.

### G8 institutional pattern (added v2.3)

M9 v2.0 was drafted with systematic verification gap. G8 has caught v2.0 framing misses at every phase kickoff:

- **Phase A (v2.1):** API route test infrastructure exists from M6/M7 D38; v2.0 §6.3 assumed missing infrastructure (count was 5, actual 7).
- **Phase B (v2.2):** 5 LLM call sites discovered (not 4 per v2.0 §3); Site 5 architecturally distinct (streaming + multi-turn + tool-use orchestration).
- **Phase C (v2.3):** D22 has two-layer architecture (API + UI); v2.0 framing assumed single-phase scope. D23 per-tool catalog was wrong granularity; per-generator-call is the actual surface. Hybrid consumer pattern across 4 routes affects Layer 2 scope. SEVEN G8 catches total — most of any M9 phase.
- **Phase D (v2.4):** D27 hook-location framing wrong (G8-D1). A4 + A6 share substrate (G8-D2). stop_reason='refusal' branch predates M8 F4 envelope (G8-D3 → Option ε). A6 = strengthen existing partial substrate (G8-D4). FOUR G8 catches.
- **Phase E (v2.5):** M8 C13 binding copy located in `(dashboard)` route group (G8-E1). voice_mode in system-prompt.ts forward-comment-only (G8-E2). Sites 1-4 don't currently import voice doctrine; B2 starts at zero (G8-E3). original_draft has zero current substrate (G8-E4). D25 vs Method-in-code Belief 7 architecture unified via fact JSONB (G8-E5). M8 F1 MemorySupersessionInline already exists; voice section reuses (G8-E6 — only positive finding). SIX G8 catches; running total 20 across A-E.
- **Phase F (v2.6):** SEVEN G8 catches across three distinct strata; running total 27 across A-F.
  - **F1 — pre-design verification gap:** refusal-patterns.ts inheritance was MODULE SHAPE only, not patterns; v2.4 changelog framed inheritance ambiguously. Surfaced STEP 2 Phase 1 STOP.
  - **F2 — pre-design verification gap:** CI substrate was GREENFIELD; v2.0 D24 assumed existing CI infrastructure. Surfaced STEP 2 Phase 1 STOP.
  - **F3 — pre-design verification gap:** D24 v2.0 didn't operationalize "prompt-bearing files" scope. Surfaced STEP 2 Phase 1 STOP.
  - **F4 — implementation-runtime verification gap:** /ultraplan's 4-file PROMPT_BEARING_FILES list conflated two structurally distinct surfaces (call-site vs constitution prompts). Catalog runtime surfaced the boundary mid-STEP-7; PATH C codified the bifurcation at §7.9.
  - **F5 — CI-activation verification gap (subtype: declared rules vs unverified shipped code):** /ultraplan Q-F2 (a) codification of `npm run lint` as a CI gate surfaced three pre-existing lint errors introduced Phase D and Phase E. Cleared via STEP 8.5 cleanup.
  - **F6 — deployment-gate verification gap:** Vercel production deploys failed silently from Phase D close (d582f9a) through Phase F STEP 7 (b36a0cf), ~24-hour window. Phase-close discipline included local tsc + test but not Vercel deploy-success verification. Production frozen at a71b37a throughout. Cleared via STEP 8.5 lint cleanup. Codified at §7.10.
  - **F7 — CI-activation verification gap (subtype: declared dependencies vs unverified local environment):** ts-node was ambient in local node_modules but undeclared in `package.json`. CI's clean `npm ci` couldn't resolve ts-node when Jest parsed `jest.config.ts`. Same stratum as F5; different subtype.

**Pattern:** M9 v2.0 conventions referenced shipped state without verification. Each phase kickoff has applied G8 and caught drift; revisions accumulate. Cost: ~half-day per phase in audit + scope adjustment + conventions revision.

**Institutional abstraction (v2.6):** G8 catches operate at multiple gate layers and within layers at multiple subtypes. Phase F alone surfaced three distinct strata:

- **Pre-design** (F1, F2, F3) — Phase 1 STOP catches against the conventions document's assumed shipped state.
- **Implementation-runtime** (F4) — catches surfaced by the catalog/code actually running against shipped state mid-phase.
- **CI-activation** (F5, F7) — catches surfaced when a new gating layer activates against state previously unverified by the prior gate posture. Subtypes within: declared rules vs unverified shipped code (F5); declared dependencies vs unverified local environment (F7).
- **Deployment-gate** (F6) — catches surfaced when deploy-success verification is added to phase-close (the gate that should have caught Phase D + E silent prod-deploy failures).

M10 conventions drafting must verify-against-shipped-state at design time AND retain runtime, CI-activation, and deployment-gate diagnostic disciplines.

**Forward-applying to M10:** Conventions drafting must include explicit "verify against shipped state per architectural claim" step before lock. Each named substrate, each scope claim, each integration boundary requires verification, not pattern-match from milestone-close inheritance.

This is institutional learning, not just process discipline. Conventions drafting that doesn't ground-truth-verify produces work that accumulates rework at implementation time. M9's caught drift cost ~half-day per phase; M10 onward avoids the rework by verifying at drafting.

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

## 7.9 Allow-list discipline + classification bifurcation [added v2.6]

Codifies the prompt-file classification + same-PR allow-list update discipline locked at STEP 7 PATH C. Driven by G8-F4 implementation-runtime surfacing.

Prompt-bearing files split into two classes:

**(a) Call-site prompts** — output-generating; voice violations leak to user-facing output. Gated by D24 shape-regex via `PROMPT_BEARING_FILES` literal allow-list at `src/lib/voice/anti-patterns.runner.ts`. Current members:
- `src/lib/claude/messaging.ts`
- `src/lib/reviews/generator.ts`

**(b) Constitution prompts** — behavior-defining; teach voice doctrine via negative-example pedagogy; quote-vs-instance ambiguity inherent. Documented in `CONSTITUTION_PROMPTS` export at the same location. Deferred to M10 LLM judge (§6.9 (vi)). Current members:
- `src/lib/voice/build-voice-prompt.ts`
- `src/lib/agent/system-prompt.ts`

Operational discipline:

1. **Classification required first.** New prompt files must be classified (call-site vs constitution) before adding to either list. Misclassification surfaces at runtime — call-site additions get scanned, constitution additions don't; the test failure or its absence is the diagnostic.
2. **Same-PR allow-list update for both classes.** Adding a new prompt module requires updating `PROMPT_BEARING_FILES` (call-site) or `CONSTITUTION_PROMPTS` (constitution) in the same PR.
3. **Per-phase G8 check verifies allow-list contains all shipped LLM call-site routes.** Phase 1 STOP audits include this verification against shipped LLM call-site routes.
4. **Literal paths only; no globs.** Globs invite scope drift and silently catch unintended files. The test's existence-check protects against typos by surfacing path errors as discrete ENOENT failures rather than as confusing scan errors.

## 7.10 Phase-close multi-gate verification discipline [added v2.6]

Codifies the phase-close gate sequence including CI + Vercel observation. Driven by G8-F6 deployment-gate verification gap.

Phase-close gate sequence (all required for "closed" status):

(a) Local `npx tsc --noEmit` → 0 errors
(b) Local `npm test` → all passing (specific count tracked per phase)
(c) Local `npm run lint` → 0 errors
(d) **CI workflow on close commit → green** (added v2.6)
(e) **Vercel production deploy on close commit → green** (added v2.6)
(f) Per-phase close note authored at `milestones/M{N}/items/phase-{Y}.md`
(g) Conventions revision (if scope warrants) dual-canonical (vault + repo mirror)

**F6 institutional discovery:** gates (a)-(c) alone are insufficient. Phase D and Phase E both passed (a)-(c) and (f)-(g) but failed (d) and (e) silently — Vercel production deploys errored from Phase D close (d582f9a) through Phase F STEP 7 (b36a0cf), ~24-hour window. The "close" claim was technically inaccurate prior to v2.6: close meant `main`, not `prod`.

Implementation aids (recommended, not required):

- Vercel webhook → Telegram notification on prod deploy failure
- `gh run watch <run-id>` after CI-triggering commits (or REST API poll loop when gh CLI auth is unavailable)
- `vercel ls --prod` check incorporated into phase-close verification

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

*End conventions, v2.6.*
