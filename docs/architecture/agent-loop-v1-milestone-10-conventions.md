# Agent Loop v1 — Milestone 10 Conventions (Repo Mirror)

> Repo developer-facing mirror of vault canonical `decisions/2026-05-19-m10-conventions.md` (vault commit `032000c`). Substantive content identical; expected formatting transformations per v2.7 §6.13 + §6.15.

# Agent Loop v1 — Milestone 10 Conventions

**Status:** Locked, v2.7
**Drafted:** 2026-05-19
**Inheritance:** v2.6 (M9 conventions, vault `decisions/2026-05-12-m9-conventions.md`) — primary reference. M10 inherits structure + carry-forward sections; M10-specific content per the sections below.

## Changelog

**v2.7 — 2026-05-19** — M10 conventions kickoff. Builds on M9 v2.6 with:
- Hybrid SHAPE 2 cluster scheme (per STEP 3 decision a) — cluster letters for major work tracks + cross-cutting substrate/UI/doctrine/institutional/hygiene tags
- M10 decisions D32-D40 codifying STEP 3 sign-off choices
- 4 NEW §6.X sections (§6.11 topnote-at-H1 sub-pattern, §6.12 schema-level UNIQUE backfill idempotency, §6.13 dual-canonical content-fidelity verification, §6.14 Phase-final-is-milestone-close convention)
- §7.7 G8 dataset extended with 4 new sub-strata (convention-references-uninstantiated-mechanism, production-as-staging-topology, dual-canonical-content-drift, cross-stratum-multi-layer)
- §7.8 milestone close protocol amended (scope.md reconciliation, §4.2 wording, staging-smoke playbook reconciliation, per-phase tag clarification)
- §7.10 phase-close multi-gate extended with (f) dual-canonical content-fidelity check
- §3.4 added: sub-step verify-shipped-state amendment (Phase G + Phase H precedent)
- No retroactive amendments to M9-closed records per STEP 3 decisions (g/h/i/j/k)

---

# Section 1 — Milestone framing

## 1.1 What M10 is

M10 is the continuation of agent loop v1 work past M9's substrate-honesty close. M9 shipped the honesty substrate (Cluster A: output schemas, confidence metadata, sufficiency thresholds, chat-text refusal, completion guard, tonal regression shape regex) and voice substrate (Cluster B: voice_mode + Mode 2, original_draft capture). M10 inherits agent loop v1 with three interlocking work tracks:

- **Substrate extension:** LLM judge layer (Phase F deferral §6.9 sub-items i+ii partial scope), voice extraction worker scheduling (Phase E §6.8 deferral), select Cluster C/D items per phase scope-setting
- **Slice 3 UI exposure:** generateDraft host trigger button in Messages thread UI (single-button scope per STEP 3 decision c); other LLM call-site UI exposure deferred to later slices
- **M9 institutional reconciliation:** 6 instances of convention-references-uninstantiated-mechanism (scope.md, staging-smoke playbook, production-as-staging topology, per-phase tag asymmetry, v2.6 vault/repo drift, phase-h.md absence) addressed via §6.11-§6.14 codifications + §7.7-§7.10 amendments

M10 ships under v2.7 conventions (incremental from v2.6; STEP 3 decision e). No symbolic v3.0 reset; v2.6 lineage continues. Final M10 conventions revision likely lands as v2.8 alongside Phase F deferrals iii-vi LLM judge work (deferred from M10 per STEP 3 decision d partial scope).

## 1.2 SHAPE 1 — technical architecture statement

Inherits the SHAPE 1 statement from M9 v2.6 §1.1 unchanged: agent loop v1 substrate (loop.ts + memory_facts + agent_audit_log + RefusalEnvelope + AgentTextOutput envelope + 4 LLM call sites + voice doctrine + Channex integration + Belief 7 voice substrate). M10 extends, does not refactor. No architectural pivots from v2.6 framing.

## 1.3 SHAPE 2 — items shipped/deferred per cluster

**Hybrid scheme per STEP 3 decision (a):** cluster letters for major work tracks; cross-cutting categorization tags (substrate/UI/doctrine/institutional/hygiene) applied per item. Item-level disposition (ship in M10 / defer to M11 / refine) locked at first M10 phase scope-setting where applicable per STEP 3 decision (b) Cluster C/D per-item ship/defer disposition.

**Cluster J — LLM judge substrate (partial scope per STEP 3 decision d):**

- J1 — §6.9 (i) output-filter for §5.5 emoji policy mode-dependent surface controls [substrate]
- J2 — §6.9 (ii) llm-judge for §5.5 exclamation cap (count-shape pattern) [substrate]
- J3 — Constitution prompt anti-pattern coverage (Item 13a doctrine + 13b substrate per STEP 2.1 split): doctrine codified §7.9 amendment; substrate code in `src/lib/agent/patterns/` and `src/lib/voice/anti-patterns.ts` for CONSTITUTION_PROMPTS allow-list scanning [substrate + doctrine]
- LLM judge sub-items iii-vi (§6.9 ensure-verb-chain heuristic + §5.7/5.8/5.9 contextual + voice-doctrine self-scan + constitution prompts self-scan) DEFERRED to v2.8/M11 per STEP 3 decision (d) partial scope; rationale: i+ii cover the highest-value M10 enforcement gap with bounded scope

**Cluster K — Voice extraction substrate:**

- K1 — Voice extraction worker scheduling (Phase E §6.8 deferral) — nightly cron vs event-driven; Vercel Cron vs VPS systemd timer decision [substrate]

**Cluster L — Slice 3 UI exposure (per STEP 3 decision c — single-button scope):**

- L1 — generateDraft host trigger button in Messages thread UI [substrate UI]

**Cluster M — M9-deferred Cluster C/D candidates (per STEP 3 decision b — per-item locked at first phase scope-setting):**

- M1 — F8 host_action_patterns table + minimal calibration logic [substrate; per-item decision pending]
- M2 — Rate-push revert substrate (M8 D17d hedge) [substrate; per-item decision pending]
- M3 — notifications.host_id schema migration + 5th source in unified_audit_feed + SMS → Notifications chip rename [substrate; per-item decision pending]
- M4 — Memory export substrate (M8 Phase H C13 R-5 commitment) [substrate; per-item decision pending]

**Cluster R — Institutional reconciliations (M9 surfacings):**

- R1 — v2.6 vault/repo content-drift reconciliation (Item 41 dual-tag retained: reconciliation + conventions codification per STEP 2.1) — bring repo into alignment with vault per Trigger 1 disposition (a); pairs with §6.13 codification [reconciliation + conventions codification]
- R2 — §7.8 milestone close protocol amendments (scope.md, §4.2 wording, staging-smoke playbook, per-phase tag clarification) — codified §7.8 below; substrate work resolves residual gaps where applicable [reconciliation]
- R3 — Naming-collision disambiguation: Phase F G8-F7 (ts-node devDep) vs Phase H F7 (honest-scope copy refresh task) — codified §7.7 below [reconciliation]
- R4 — Refinement queue for known false-positives in `edge-cases.fixture.ts` (Phase F §6.9 d) — substrate-adjacent hygiene; surfaced as catalog refinements during M10 phase work [hygiene]
- R5 — §6.10 shape primitive extraction methodology applied to M10 LLM judge catalog (Item 19a codification + 19b substrate per STEP 2.1 split) — codification expanded §6.10 below; application is J1/J2/J3 substrate work [conventions codification + substrate]
- R6 — Convention-references-uninstantiated-mechanism sub-stratum formalization in §7.7 (M10 STEP 1 cross-pattern observation) [conventions codification]

**Cluster S — Slice 3 carry-overs (M9 Phase G/H polish):**

- S1 — ReviewsSettingsModal "Rules" → "Preferences" UI terminology migration [hygiene UI polish]
- S2 — ReviewsSettingsModal propertyId prop removal [hygiene UI polish]
- S3 — D22 UI integration — envelope reaches rendering components (Phase C §6.6 inheritance) [substrate UI]
- S4 — Memory tab voice section UI (Phase E §6.8 #1) [substrate UI]
- S5 — Voice doctrine §5 catalog scope clarification (agent-to-host vs guest-facing draft tone) — Phase H attestation surfacing [doctrine]
- S6 — Continuing voice doctrine refinement as guest-facing draft tone observations accumulate (M9-close §12 #2) [doctrine ongoing]

**Cluster H — Hygiene (M9 carry-forward):**

- H1 — `review_rules_backup_phase_g` drop pass (Phase G E3 0-row schema-preservation table cleanup) [hygiene]
- H2 — GH Actions deprecation: `actions/checkout@v4` → `@v5` + `actions/setup-node@v4` → `@v5` before June 2026 [hygiene]
- H3 — Vercel CLI install on VPS for inline §7.10 (e) observation [hygiene]
- H4 — gh CLI scope refresh for Actions log content download [hygiene]
- H5 — Supabase Database types regeneration (Item 24 primary Hygiene + Substrate conditional per STEP 2.1) [hygiene; substrate upgrade conditional]
- H6 — Husky pre-commit for local fast-fail (Phase F §6.9 b) [hygiene]
- H7 — Sentinel pattern (`// koast-voice-allow: <id>`) — conditional on LLM judge sentinel context-reading capacity (Item 5; ties to J3) [substrate-conditional hygiene]
- H8 — Citation-section marker mechanism (`[[cite: ...]]`) — reconsidered only if structural bifurcation insufficient (Item 6; likely defer further) [substrate-conditional hygiene]
- H9 — E1 (a) cron/worker for guaranteed silent-complete (Item 2; conditional on product requirement) [substrate-conditional hygiene]

**Cluster D — M10 architectural decisions (D32-D40+ per §2)**

Atomic SHAPE 2 count: 35 items across Clusters J/K/L/M/R/S/H (D-cluster decisions enumerated §2).

**M9-close.md §2 PHASE_F_DEFER_TO_M10 7-vs-8 count refinement (STEP 3 decision k):** the actual count in `src/lib/voice/anti-patterns.ts` is **8** (`deferred_5_5_emoji_policy`, `deferred_5_5_exclamation_cap`, `deferred_5_6_ensure_verb_chain`, `deferred_5_7_filler`, `deferred_5_8_self_narration`, `deferred_5_9_performative_thoroughness`, `deferred_voice_doctrine_self_scan`, `deferred_constitution_prompt_quote_vs_instance`). M9-close.md §2 said "7 stubs"; accuracy refinement captured here, no retroactive M9 amendment per Decision (k) Option 2.

## 1.4 Phase enumeration

First-cut allocation; precise scope locks at per-phase Phase 1 STOP. Phase order respects dependencies: institutional reconciliations early (R1 + R2 + R6 inform M10 conventions in-use); LLM judge work after substrate-stability checkpoint; UI work after substrate confirms.

- **Phase A (Days 1-3): Conventions ship + institutional reconciliations.** v2.7 dual-canonical lands; CLAUDE.md M10 pointer block updated; R1 v2.6 vault/repo drift remediation; R2/R3 §7.8 amendments codified; R6 §7.7 sub-stratum formalization. SHAPE 2 lock by close.
- **Phase B (Days 4-7): LLM judge J1 + J2 substrate.** §6.9 sub-item i output-filter (emoji policy) + ii llm-judge (exclamation cap count-shape). Architecture sketch + first pattern shipped.
- **Phase C (Days 8-11): LLM judge J3 + Cluster M decision.** Constitution prompt coverage substrate; Cluster M (C/D items) per-item ship/defer decision at Phase 1 STOP; first M-item shipped if locked.
- **Phase D (Days 12-15): Cluster S substrate UI surfaces.** S3 D22 UI integration + S4 Memory tab voice section UI + S1/S2 ReviewsSettingsModal polish.
- **Phase E (Days 16-18): Voice extraction K1 + Slice 3 L1.** K1 worker scheduling + L1 generateDraft host trigger UI.
- **Phase F (Days 19-21): Remaining Cluster M items.** Ship M-items locked at Phase C; defer others to M11 with explicit reasoning.
- **Phase G (Days 22-23): Doctrine S5 + S6 + Hygiene Cluster H pass.** Voice doctrine §5 catalog scope clarification authoring; doctrine refinement; hygiene items (H1 backup drop / H2 GH Actions / H3 Vercel CLI / H4 gh CLI / H5 Supabase types regen / H6-H9 conditional).
- **Phase H (Days 24-25): M10 close (Phase-final-is-milestone-close per §6.14).** F7-style honest-scope refresh on M10-shipped surfaces. M10-close.md (vault) + M10-report.md (repo dual-canonical per §6.13). `m10-close` tag.

8 phases; ~25 working days; ~5 weeks calendar. Phase budget calibration per v2.6 §1.4 + Phase G lesson (mechanical-cleanup phases produce fewer absolute G8 counts; substrate phases anchor on truth not optimism).

---

# Section 2 — Architectural decisions (D32-D40)

## D32 — M10 SHAPE 2 cluster scheme: hybrid per STEP 3 decision (a)

**Decision:** Hybrid cluster organization — cluster letters (J/K/L/M/R/S/H/D) for major work tracks; cross-cutting categorization tags (substrate/UI/doctrine/institutional/hygiene) applied per item. Cluster letters jump from M9's A/B/E/C/D to new M10 letters to avoid "shipped clusters" / "deferred clusters" semantic confusion that M9 carried.

**Reasoning:** Per STEP 2 analysis: M9 conflated "Cluster A/B/E shipped + C/D deferred" semantics into the same letter-naming scheme; M10 inherits some Cluster C/D items as Cluster M candidates but the scheme decouples cluster identity from disposition. Cross-cutting tags surface the M9-close.md §10 categorical breakdown (substrate/UI/doctrine/institutional/hygiene) at item-level granularity.

**Implications:** SHAPE 2 enumeration in §1.3 reflects this scheme. Per-item disposition tags are visible in §1.3 bullet annotations.

## D33 — Slice 3 UI scope: single-button per STEP 3 decision (c)

**Decision:** Slice 3 UI ships ONE host-facing trigger: generateDraft button in Messages thread UI (L1). Other LLM call-site UI exposure (generateGuestReview, generateReviewResponse, generateGuestReviewFromIncoming) deferred to subsequent slices.

**Reasoning:** Per STEP 2 analysis: Phase H attestation observed the single deferral button — that's the minimum unlock. Broader Messages UI overhaul or all-call-site exposure are scope-expansion options; bounded M10 capacity favors the minimum unlock. Larger UI work folds into a later slice with dedicated scope.

**Implications:** L1 is the only Slice 3 UI item in §1.3. Cluster S substrate UI items (S3 D22 integration + S4 Memory tab voice section) are substrate-finishing work, not slice 3 host-trigger work.

## D34 — LLM judge scope: partial §6.9 sub-items i+ii per STEP 3 decision (d)

**Decision:** M10 ships LLM judge for §6.9 sub-items **i (output-filter, §5.5 emoji policy)** and **ii (llm-judge, §5.5 exclamation cap count-shape pattern)** only. Sub-items iii (ensure-verb-chain heuristic), iv (§5.7/5.8/5.9 contextual), v (voice-doctrine self-scan), vi (constitution prompts self-scan) DEFERRED to v2.8/M11.

**Reasoning:** Per STEP 2 analysis: i+ii cover the highest-value enforcement gaps with bounded scope. Sub-items iii-vi require deeper LLM judge architecture (heuristic interpretation; contextual classification; quote-vs-instance distinction; multi-prompt cross-referencing) that warrants its own milestone scope after i+ii ships and informs the architecture.

**Implications:** Cluster J in §1.3 enumerates J1 + J2 + J3 (J3 covers constitution prompt anti-pattern coverage per Item 13 split). §6.9 in this doc updates the v2.6 §6.9 disposition: i+ii shipped in M10; iii-vi explicitly defer to v2.8/M11.

## D35 — PHASE_F_DEFER_TO_M10 8 stubs disposition methodology per STEP 3 decision (f)

**Decision:** Re-evaluate each of the 8 stubs at first M10 phase scope-setting (Phase B or Phase C). Per-stub decision: ship in M10 (per Cluster J scope), supersede with refined pattern, or refactor before shipping. No blanket "ship all" or "defer all" disposition.

**Reasoning:** Per STEP 2 analysis: stubs were authored at Phase F; M9 close re-read may surface refinements (e.g., a stub's regex was approximate; ensure-verb-chain heuristic needs context-classification not regex). Re-evaluation prevents shipping stale specs.

**Implications:** First M10 phase scope-setting reviews each stub. Disposition captured in M10 phase close notes.

## D36 — 10c.6 per-phase tag asymmetry codification per STEP 3 decision (g) Option 2

**Decision:** Codify "per-phase tags begin from designated phase X of milestone; not all phases tag" as M9 historical convention. No retroactive tagging of Phase A-E close commits. Per-phase tag convention encoded in §7.10 + §7.8 per-phase-tag-discipline clauses.

**Reasoning:** Per STEP 2 analysis: retroactive tagging is backward-direction work on closed milestone. M9's per-phase tag inventory (m9-phase-{f,g,h}-close + m9-close = 4 tags total) is the shipped state; codifying the convention prevents future asymmetry confusion. Pairs with D38 Phase-final-is-milestone-close convention.

**Implications:** §7.10 codifies "per-phase tag start point" as a phase-defined decision (declared at SHAPE 2 lock). Future milestones declare which phase begins per-phase tagging; preceding phases close without tags but with phase close notes.

## D37 — G8-G2 ambiguity disposition per STEP 3 decision (h) Option 2

**Decision:** Document G8-G2 ambiguity in §7.7 institutional record. M9 G8 count stays 37; G8-G2 label retained for traceability without enforced classification. No retroactive renumbering or reclassification.

**Reasoning:** M9 institutional record is closed; backward-amendment undermines closure. Documentation preserves history + clarifies disposition.

**Implications:** §7.7 amended with G8-G2 ambiguity note. M9 count stays 37.

## D38 — Phase-final-is-milestone-close convention per STEP 3 decision (j) Option 2

**Decision:** A milestone's final phase serves dual duty as milestone close phase. Its close artifact is `M{N}-close.md` at vault `milestones/M{N}/`, not a separate `phase-{final}.md` at vault `milestones/M{N}/items/`. Per-phase close note convention applies to non-final phases only.

**Reasoning:** Per STEP 1 Trigger 2 surfacing + STEP 2 analysis: M9 Phase H received no separate phase-h.md (M9-close.md serves dual role). M10 STEP 1 spec read-list assumed "8 phase close notes" — convention-references-uninstantiated-mechanism class catch. Codifying the convention closes the gap forward without retroactive amendment.

**Implications:** Codified in §6.14 (NEW). Future milestones explicitly note which phase is final-and-milestone-close (e.g., M10 Phase H).

## D39 — Dual-canonical content-fidelity verification discipline per STEP 3 decision (i) Option 3

**Decision:** BOTH options for STEP 1 Trigger 1 disposition: (1) bring repo into alignment with vault as M10 hygiene work (R1), (2) codify dual-canonical content-fidelity verification as v2.7 discipline. Verification check fires pre-phase-close + pre-milestone-close.

**Reasoning:** M9 v2.6 vault/repo drift (46-line delta: ~10 frontmatter + ~36 substantive prose) demonstrates the discipline gap; the dual-canonical pattern was authored at v2.3 onward but lacked an explicit verification gate. Codifying the gate prevents future drift; the M9 drift is one-time hygiene cleanup.

**Implications:** Codified §6.13 (NEW). §7.10 (f) new gate added. R1 ships in Phase A or pairs with Phase H close.

## D40 — Topnote-at-H1 sub-pattern for milestone-shift doc refresh codification

**Decision:** Codify the topnote-at-H1 sub-pattern from Phase H STEP 5 institutional lesson as v2.7 convention. Pattern: when milestone-shifting copy across substantive docs (>= 5 documents OR >= 1 doc with > 200 lines), prefer single topnote at H1 over inline replacement.

**Reasoning:** Phase H STEP 5 applied this to 9 doc files (review_rules → memory_facts refresh). Inline replacement risks accidental substantive content drift (Trap 1); topnote preserves as-of-authoring content while adding milestone context. Pairs with §3 D31-class honest-scope refresh decisions.

**Implications:** Codified §6.11 (NEW).

## D41 — Milestone-conventions inheritance via reference

**Decision:** Milestone-conventions inheritance via reference. M9 v2.6 demonstrated the pattern implicitly for M8 §3 inheritance; v2.7 formalizes the discipline at §6.15. Pairs with §6.13 dual-canonical content-fidelity verification (same anti-drift principle at vault/repo scale).

**Reasoning:** STEP 4 close PATH A surfaced the pattern when v2.7's 601-line draft hit the spec's 800-line halt threshold. The threshold assumed verbatim inheritance was expected; the actual v2.6 → M9 inheritance pattern (and v2.7 formalization) is reference-based. Codifying the discipline prevents inter-milestone duplicate-then-drift across future conventions revisions.

**Implications:** Codified §6.15 (NEW). v2.7 is the first formalized application; future M11+ conventions inherit v2.7 sections by reference per §6.15.

---

# Section 3 — Phase 1 STOP discipline

## 3.1 Inheritance from M9

M10 inherits the Phase 1 STOP discipline from M9 v2.6 §3 unchanged. Every M10 session that begins implementation work runs Phase 1 STOP first against the phase's scope. Not optional. Always halt after audit and surface the structured report for human review.

The M9 audit categories carry forward as the template; phase-specific categories adapt per phase.

## 3.2 Per-phase Phase 1 STOP categories (high level)

**Phase A (conventions ship + reconciliations):**
- Verify v2.6 vault/repo drift remediation scope; STEP 2 R1 disposition application
- Verify §7.8 amendment scope (scope.md / §4.2 wording / staging-smoke / per-phase tag)
- Verify §6.11-§6.14 NEW section authorship doesn't duplicate v2.6 content; net-new only

**Phase B (LLM judge J1+J2 substrate):**
- Verify Phase F PHASE_F_DEFER_TO_M10 8 stubs current state in src/lib/voice/anti-patterns.ts
- Verify §6.10 shape primitive extraction methodology paths (`src/lib/agent/patterns/types.ts`)
- Verify §5.5 emoji policy specification still reflects current voice doctrine

**Phase C (LLM judge J3 + Cluster M):**
- Per-item Cluster M (M1-M4) audit: shipped state of host_action_patterns + rate-push substrate + notifications.host_id + memory_export
- Verify CONSTITUTION_PROMPTS allow-list pattern from Phase F §7.9 bifurcation

**Phase D (Cluster S substrate UI):**
- Verify D22 envelope rendering call sites + AgentTextOutput consumer surfaces
- Verify Memory tab voice section UI substrate (M8 F1 base)
- Verify ReviewsSettingsModal call sites (host-scoped /api/reviews/preferences post-Phase G E3)

**Phase E (K1 voice extraction + L1 slice 3 UI):**
- Verify voice extraction worker code state at `src/lib/voice/extraction-worker.ts`
- Verify Vercel Cron infrastructure (or VPS timer alternative) candidates
- Verify Messages thread UI substrate for L1 button insertion

**Phase F (remaining Cluster M):**
- Per remaining M-item: Phase 1 STOP audit at item granularity

**Phase G (doctrine + hygiene):**
- Verify voice doctrine §5 current state (Phase H attestation surfaced clarification need)
- Verify hygiene items can ship without phase-coupling

**Phase H (M10 close per §6.14 Phase-final-is-milestone-close):**
- Verify M10-close.md authorship inputs (per-phase close notes + decisions D32-D40+ + inheritance roll-up)
- Verify dual-canonical readiness for M10-report.md repo mirror

## 3.3 Halt report shape

Per v2.6 §3.3 / M8 §3.3 structure. Adapt to per-phase scope. Halt report at `vault milestones/M10/{X}-phase-1-stop.md` via mcpvault.

## 3.4 Sub-step verify-shipped-state amendment (NEW v2.7)

**Pattern (Phase G + Phase H precedent):** verify shipped state at sub-step boundaries WITHIN phases, not only at phase start.

M9 demonstrated value across three sub-steps:
- Phase G STEP 6.1 — staging-smoke test outcome verified before STEP 6.2 implementation
- Phase H STEP 6.1 — cross-env migration_history audit corrected STEP 2's narrow-scope claim before STEP 6.3 INSERT
- Phase H STEP 7.5 — operator attestation per gate before §7.8 close gate completion

Cost: small (per-step grep / DB query / file check). Value: catches institutional state drift at sub-step granularity; prevents architectural decisions from compounding on unverified assumptions.

**Operational rule:** Phase 1 STOP discipline applies at phase boundary AND at sub-step boundaries where the sub-step's shipped-state claim is load-bearing for subsequent work. Sub-step verify-shipped-state surfaces in phase close notes as institutional record.

---

# Section 4 — Implementation order and smoke gates

## 4.1 Sequenced phase order

M10 phases A-H per §1.4. Each phase ships items per the §1.3 cluster registry with dependency-respecting order: institutional reconciliations early (informs M10 conventions in-use), substrate work middle, doctrine + hygiene late, close last.

Deferral levers if scope tightens (per v2.6 §4.1 pattern):
1. Cluster M (M9-deferred C/D items) — each M-item independently defer to M11
2. LLM judge J3 constitution prompts — defer to v2.8 alongside iii-vi
3. Hygiene H6-H9 (conditional items) — defer if product requirement absent
4. K1 voice extraction worker scheduling — defer scheduling decision if Vercel Cron vs VPS timer decision needs more product input

## 4.2 Mid-milestone smoke gates (AMENDED per institutional reconciliations)

Per-phase verification, per v2.6 §4.2 pattern. AMENDMENTS for M10:

**Topology clarification (per R2 + G8-H6 reconciliation):** Koast deploys to production only with test host data. "Staging smoke" wording in §4.2 + §7.8 historically referenced a separate staging environment. In M10 conventions and forward: staging smoke = substrate-only smoke + operator-attestation supplement. "Staging" refers to non-production-affecting state validation, not a separate deployment environment. Per-phase smoke gate satisfied when substrate tests pass AND operator attestation captures live-traffic verification.

**Staging-smoke playbook (per R2 + G8-H5 reconciliation):** No separate staging-smoke playbook artifact required. The substrate smoke is `npm test` + per-phase gate-specific checks listed below. The operator-attestation supplement is per-phase agent walkthrough at app.koasthq.com production session (host-attested via Telegram or equivalent). Phase H STEP 7.5 demonstrated the pattern.

**scope.md reconciliation (per G8-H1):** §1.3 SHAPE 2 enumeration is canonical for "items shipped" verification. Optional `vault milestones/M{N}/scope.md` may exist as scratch artifact for SHAPE 2 lock authoring; not required by §7.8 gate 1.

**M10 phase gates:** Defer per-phase gate enumeration to each Phase 1 STOP authoring (per v2.6 §4.2 pattern). Phase-specific gates surface in halt reports.

**M10 close gate (Phase H per §6.14):**
- Substrate-only smoke (npm test 665+ passing pre-shipment + Phase H additions)
- All M10 SHAPE 2 items per §1.3 verified shipped or explicit defer-with-reason
- Voice doctrine §5 catalog scope clarification authored
- Dual-canonical content-fidelity check (§7.10 f) on M10-close.md vs M10-report.md pre-tag
- All voice-bearing surfaces operator-attestation reviewed (Phase H STEP 7.5 pattern)

## 4.3 Escalation patterns

Inherits from v2.6 §4.3 / M8 §4.3 unchanged. If smoke gate fails: surface to phase close note, halt phase progression, diagnose substrate-vs-implementation, escalate to human if substrate. Round-2 question surfaces during implementation route to `vault milestones/M10/round-2-questions.md` with candidate resolutions.

## 4.4 Vocabulary distinction

Inherits from v2.6 §4.4 unchanged. `output_grounding` ('rich'/'sparse'/'empty') vs `SufficiencyLevel` ('rich'/'lean'/'thin') vocabulary distinction holds across M10.

---

# Section 5 — Deliverable specification

## 5.1 Code artifacts (M10-specific extensions)

**LLM judge substrate (Cluster J):**
- `src/lib/voice/llm-judge/` or equivalent module — emoji policy output-filter + exclamation cap llm-judge
- Extended pattern catalog at `src/lib/voice/anti-patterns.ts` to mark stubs as i+ii-shipped vs iii-vi-deferred
- CONSTITUTION_PROMPTS allow-list scanning extension (Item 13a + 13b substrate)

**Voice extraction (Cluster K):**
- Scheduling infrastructure (Vercel Cron OR VPS systemd timer or equivalent)
- Extraction worker invocation path

**Slice 3 UI (Cluster L):**
- Messages thread UI button + handler invoking generateDraft
- Loading + error + success states

**Cluster M items (per-item ship decisions at first phase scope-setting)**

**Cluster S substrate UI:**
- D22 envelope rendering integration at AgentTextOutput consumer surfaces
- Memory tab voice section UI (extends M8 F1 substrate)
- ReviewsSettingsModal terminology + propertyId prop migration

## 5.2 Documentation artifacts

**Vault writes (via mcpvault):**
- `decisions/2026-05-19-m10-conventions.md` — v2.7 canonical
- `milestones/M10/M10-close.md` — milestone close (Phase H authorship)
- `milestones/M10/items/phase-{a,b,c,d,e,f,g}.md` — per-phase close notes (NOT phase-h.md per §6.14)
- `milestones/M10/{X}-phase-1-stop.md` — per-phase Phase 1 STOP halt reports

**Repo mirrors:**
- `docs/architecture/agent-loop-v1-milestone-10-conventions.md` — v2.7 mirror (this file)
- `docs/architecture/agent-loop-v1-milestone-10-report.md` — M10 milestone close report (Phase H authorship; dual-canonical with vault per §6.13)

**CLAUDE.md update:** M10 pointer block addition (STEP 5; lean per Phase F STEP 9.5 precedent).

## 5.3 Phase gates

Inherits from v2.6 §5.3 + §7.10 phase-close multi-gate. Each M10 phase commit: tsc + test + lint + CI + Vercel + close note + (where applicable) conventions revision + (per §7.10 new gate f) dual-canonical content-fidelity check.

---

# Section 6 — Anti-scope (explicit)

## 6.1 Deferred to M11+

Items explicitly NOT in M10 scope:

- LLM judge §6.9 sub-items iii-vi (ensure-verb-chain heuristic, §5.7/5.8/5.9 contextual, voice-doctrine self-scan, constitution prompts self-scan) — D34 partial scope
- Cluster M items not ship-locked at first M10 phase (per-item defer decisions at Phase C scope-setting)
- Multi-call-site Slice 3 UI expansion (Decision c single-button scope only)
- D22 UI integration beyond Cluster S substrate finishing
- Voice extraction Mode 1 generative (M9 §6.8 inheritance)

## 6.2 Not in M10 even though tempting

- Property creation via chat (D21) — deferred to direct-booking-site work per M8/M9 anti-scope
- Multi-user model + RLS rewrites — deferred per M8/M9 anti-scope
- Tier 2 context-aware LLM-generated starters (D10 R-1) — deferred per M8/M9 anti-scope
- Mobile tooltip for topbar "?" affordance — deferred
- Drawer filter chips — deferred

Inherits from v2.6 §6.2 anti-scope catalog plus M10-specific additions above.

## 6.3-6.8 — M9 §6 history continues

§6.3 M8 endpoint test carry-forwards (corrected v2.1) — closed in M9.
§6.4 Substrate-enabling work happening during M9 — closed in M9.
§6.5 M10 carry-forwards from M9 Phase B sign-off [added v2.2] — folded into M10 inheritance inventory (vault de1dd8f) and Cluster R reconciliations.
§6.6 M10 carry-forwards from M9 Phase C sign-off [added v2.3] — folded.
§6.7 M10 carry-forwards from M9 Phase D sign-off [added v2.4] — folded.
§6.8 M10 carry-forwards from M9 Phase E sign-off [added v2.5] — folded (K1 voice extraction worker scheduling now Cluster K active).

These §6.x sections carry forward as M9 institutional record references; M10 enumerates the active M10 inheritance via §1.3 SHAPE 2 + §6.9.

## 6.9 M10 disposition of Phase F deferred items (UPDATED from v2.6 §6.9)

Per D34 LLM judge partial scope:

**Ships in M10 (Cluster J):**
- (i) output-filter — §5.5 emoji policy mode-dependent surface controls (J1)
- (ii) llm-judge — §5.5 exclamation cap count-shape pattern (J2)
- Constitution prompt anti-pattern coverage (J3 substrate + S5 doctrine codification)

**Defers to v2.8 / M11:**
- (iii) llm-judge — §5.6 ensure-verb-chain heuristic (with abstract objects)
- (iv) llm-judge — §5.7 Filler / §5.8 Self-narration / §5.9 Performative thoroughness contextual patterns
- (v) llm-judge — voice-doctrine.md self-scan (quote-vs-instance)
- (vi) llm-judge — constitution prompts self-scan (related to J3 but broader scope)

Husky pre-commit (§6.9 b from v2.6), Sentinel pattern (§6.9 c), Refinement queue for edge-cases.fixture.ts (§6.9 d), Citation-section marker mechanism (§6.9 e) — all carry forward as Cluster H conditional hygiene items per §1.3.

## 6.10 Shape primitive extraction methodology (EXPANDED per Item 19a)

Carries forward from v2.6 §6.10. M10 expansion per STEP 2.1 Item 19a codification:

**Methodology applies to M10 LLM judge catalog construction.** D24 → D25 → E3 lineage validated transferability in M9; M10 LLM judge work (J1/J2/J3) inherits the same methodology:

- γ extraction (shared types module): LLM judge primitives live at `src/lib/agent/patterns/judge-types.ts` (or extension of existing `patterns/types.ts`)
- Re-export technique: judge catalog re-exports primitives; consumer surfaces preserved
- SHIP/DEFER prefix convention: deferred judge entries prefixed `deferred_` like Phase F PHASE_F_DEFER_TO_M10 stubs
- Catalog completeness meta-test: every SHIP entry appears in fixtures; meta-test enforces same-PR fixture additions

J1/J2/J3 implementation references this section. Phase 1 STOP audits at Cluster J phases verify substrate paths.

## 6.11 Topnote-at-H1 sub-pattern for milestone-shift doc refresh (NEW v2.7)

**Pattern (D40 codification of Phase H STEP 5 institutional lesson):** when milestone-shifting copy across substantive docs (>= 5 documents OR >= 1 doc with > 200 lines), prefer single topnote at H1 over inline replacement.

**Format:**

```markdown
> **Historical note (M{N} Phase {X}, YYYY-MM-DD):** This document references the `<thing>` ... which was {removed/replaced/migrated} during M{N} Phase {X}. <new locus>. References below predate the migration; see `milestones/M{N}/items/phase-{x}.md` for the migration record.
```

**When to use:**
- Cross-doc milestone-shifting language refresh (e.g., F7 honest-scope language extension; Cluster E E3 review_rules → memory_facts doc-ref migration)
- Doc class where inline replacement risks substantive content rewriting (BELIEF inventory docs; design blueprints)

**When NOT to use:**
- Single-doc small copy edit (just inline-edit; no topnote needed)
- Substantive doc rewrite (this is a different decision class; topnote-at-H1 is for *refresh*, not *rewrite*)

**Institutional rationale:** preserves as-of-authoring content while adding milestone context; future readers get milestone-context immediately; historical state-of-codebase descriptions preserved as institutional record. Trap-1 discipline (no substantive doc rewriting in copy refresh).

## 6.12 Schema-level UNIQUE constraint as backfill idempotency pattern (NEW v2.7)

**Pattern (codification of Phase H STEP 6 institutional lesson):** when authoring one-shot backfill scripts where script-level idempotency isn't practical, rely on schema-level UNIQUE constraint on tracking columns for re-run protection.

**Example (M9 Phase H STEP 6 G6 backfill):**
- `koast_migration_history` has UNIQUE constraint on `migration_name`
- Backfill script INSERTs voice_substrate migration row; re-run on either env produces UNIQUE violation, surfacing the duplicate without silent corruption
- No need for application-layer "check if exists before inserting" logic

**When to use:**
- One-shot backfill scripts (not a numbered migration); preserved at `supabase/scripts/` per institutional convention
- Tracking-table inserts where natural-key UNIQUE constraint exists or can be added

**Pairs with §7.10 phase-close multi-gate:** backfill script execution per-env captures applied_by + notes; idempotency enforced at schema level.

## 6.13 Dual-canonical content-fidelity verification (NEW v2.7)

**Pattern (D39 codification per STEP 3 decision i Option 3):** dual-canonical artifacts (vault canonical + repo mirror) must remain identical modulo formatting transformations (vault YAML frontmatter, vault wikilinks → repo prose).

**Substantive prose drift is a verification failure.** Pairs with §7.10 (f) new gate.

**Pre-phase-close + pre-milestone-close verification check:**
1. `diff <(vault canonical body, stripped of frontmatter + wikilinks)` against `<(repo mirror body)`
2. Acceptable: format-only differences (wikilink → prose), line-wrapping
3. Failure: substantive prose drift (sentence-level content differs); halt the close

**Institutional cost of skipping:** M9 v2.6 vault/repo drift (46-line delta, ~36 lines substantive prose) demonstrates accumulation over time. Vault accumulated incremental detail via mcpvault patches across Phase B-G dual-canonical commits; repo mirror re-authoring less consistent. The discipline was authored at v2.3 but lacked an enforcement gate.

**M10 application:** Cluster R1 ships repo-vault alignment as M10 hygiene. The codified discipline + §7.10 (f) gate prevents future drift.

## 6.14 Phase-final-is-milestone-close convention (NEW v2.7)

**Pattern (D38 codification per STEP 3 decision j Option 2):** a milestone's final phase serves dual duty as milestone close phase. Its close artifact is `M{N}-close.md` at vault `milestones/M{N}/` (NOT a separate `phase-{final}.md` at vault `milestones/M{N}/items/`).

**Per-phase close note convention applies to non-final phases only.**

**Examples:**
- M9 Phase H = M9 milestone close phase. M9-close.md serves as Phase H's close artifact. No phase-h.md exists.
- M10 Phase H = M10 milestone close phase (per §1.4). M10-close.md will serve as Phase H's close artifact. No phase-h.md will exist for M10.

**Per-phase tag convention (pairs with D36):** if per-phase tags are used in a milestone (declared at SHAPE 2 lock), the final phase receives BOTH `m{N}-phase-{final}-close` + `m{N}-close` tags anchored on the same close commit (per M9 Phase H precedent: m9-phase-h-close + m9-close both on 86604ce).

**Convention-references-uninstantiated-mechanism resolution:** future M10+ STEP read-lists that reference "all phase close notes" should enumerate via vault directory listing, not assume phase count from generic convention.

## 6.15 Milestone-conventions inheritance via reference (NEW v2.7)

**Pattern (D41 codification per STEP 4 close PATH A surfacing):** milestone conventions inherit prior-milestone conventions by REFERENCE, not by verbatim copy. Sections that carry forward unchanged are explicitly named ("§7.1 — Inherits from v2.6 §7.1 unchanged"); the prior-milestone canonical artifact remains the authoritative source for the inherited content.

**M9 v2.6 demonstrated this pattern implicitly** at §3.1 ("M9 inherits the Phase 1 STOP discipline from M8 conventions §3 unchanged"). v2.7 formalizes the discipline at conventions-section granularity rather than ad-hoc per-section preamble.

**Rationale:** verbatim copy of inherited sections creates inter-milestone duplicate text. Each conventions revision after v1.0 would compound copy-then-edit-with-drift risk. Same anti-drift principle as §6.13 dual-canonical content-fidelity verification — §6.13 protects vault/repo scale within a milestone; §6.15 protects inter-milestone scale across milestones.

**Pattern format:** sections that inherit unchanged from prior milestone use a single inheritance statement:

```markdown
## 7.X Section Title

Inherits from v{prior}.{Y} §7.X unchanged.
```

Sections that inherit with amendments use a "CARRIES + amendment" or "AMENDED" marker plus the amendment text only (NOT a re-statement of the inherited content):

```markdown
## 7.X Section Title (AMENDED per <reason>)

Inherits from v{prior}.{Y} §7.X. M{N} v{this} amendments:

<amendment 1>
<amendment 2>
```

**When the pattern doesn't apply:** sections net-new to the milestone (e.g., §6.11-§6.14 in v2.7) author full content as the canonical source for future inheritance.

**Pre-flight verification (pairs with §7.10 f):** before committing the canonical artifact, verify referenced prior-milestone sections still exist at the cited paths. Convention-references-uninstantiated-mechanism class catches (§7.7) cover the case where a referenced section was renamed/removed in prior conventions.

**Institutional cost of skipping (pre-v2.7 state):** without this codification, future conventions drafters may default to verbatim copy of inherited sections, creating inter-milestone drift over time as edits accumulate selectively. The discipline is forward-looking; M10 v2.7 is the first formalized application.

---

# Section 7 — Implementation prompt for Claude Code

## 7.1 Session start protocol

Inherits from v2.6 §7.1 unchanged.

## 7.2 Phase 1 STOP execution per phase

Inherits from v2.6 §7.2 unchanged.

## 7.3 Per-item implementation pattern

Inherits from v2.6 §7.3 unchanged.

## 7.4 Round-2 question protocol

Inherits from v2.6 §7.4 unchanged.

## 7.5 Doctrine compliance review

Inherits from v2.6 §7.5 unchanged.

## 7.6 Vault hygiene during M10

Inherits from v2.6 §7.6 unchanged; vault note discipline (frontmatter + Related section + wikilink connectivity) per CLAUDE.md "Vault note discipline" subsection.

## 7.7 G8 institutional pattern (AMENDED — 4 new sub-strata + G8-G2 disposition)

Inherits from v2.6 §7.7 G8 institutional subsection. M10 v2.7 amendments:

**4 NEW sub-strata (R6 codification):**

1. **Convention-references-uninstantiated-mechanism** — spec/convention text references file/mechanism/environment/artifact that doesn't exist in shipped state. M9 instances: G8-H1 (`milestones/M9/scope.md`), G8-H5 (staging-smoke playbook), G8-H6 (production-as-staging topology), M9 STEP 10c.6 (per-phase tag asymmetry), M10 STEP 1 Trigger 1 (v2.6 vault/repo drift; partial-overlap with dual-canonical-content-drift sub-stratum), M10 STEP 1 Trigger 2 (phase-h.md absence). Six instances across Phase H + post-close M10 setup. Discipline: *"when authoring conventions text that references file/mechanism/environment/artifact, verify the reference is instantiated OR explicitly flag as forward-looking spec."*

2. **Production-as-staging-topology** — verification gate wording assumes separate staging environment; actual topology is production-only with test host data. Distinct from convention-references-uninstantiated-mechanism in scope: this is specifically about environment topology, not file/mechanism references. M9 instance: G8-H6.

3. **Dual-canonical-content-drift** — vault canonical and repo mirror artifacts diverge over time without verification gate catching the drift. M9 instance: v2.6 vault/repo conventions drift (M10 STEP 1 Trigger 1). Codified discipline at §6.13 + §7.10 (f) gate.

4. **Cross-stratum-multi-layer** — gap propagates across multiple audit layers without independent verification at the right granularity. M9 instances: G8-G6 (Phase E voice_substrate gap inherited Phase G → Phase H), G8-H3 (Session 2 scope claim inherited across three audit layers), G8-H5 (smoke playbook absence acknowledged but not catalogued until Phase H). M9 Phase H called this sub-stratum out in prose; M10 v2.7 formalizes for §7.7 institutional record.

**G8-G2 ambiguity disposition (D37):** G8-G2 (ambiguity-flag, not-a-counted-catch) preserved as M9 historical record. M9 G8 count stays 37. Label retained for traceability; M10 doesn't renumber or reclassify M9 catches per closed-milestone discipline.

**Naming-collision disambiguation (R3):** "F7" in M9 v2.6 §7.7 G8-F7 entry refers to Phase F's 7th catch (ts-node devDep gap); distinct from "F7" item (Phase H honest-scope copy refresh task) in §1.4. Same letter+number, different context. Disambiguate by always qualifying: "G8-F7" for Phase F catch; "Phase H F7 task" for honest-scope refresh.

## 7.8 Milestone close protocol (AMENDED per institutional reconciliations)

Inherits from v2.6 §7.8. M10 v2.7 amendments:

**Gate 1 wording (per scope.md reconciliation):** "Verify all SHAPE 2 items shipped per `milestones/M{N}/scope.md`" softened to: "Verify all SHAPE 2 items shipped per §1.3 (or `milestones/M{N}/scope.md` if authored)." §1.3 enumeration is canonical; scope.md is optional scratch artifact.

**Gate 3 wording (per §4.2 reconciliation):** "Run M{N} close gate (full staging smoke per §4.2)" updated to: "Run M{N} close gate per §4.2 (substrate-only smoke + operator-attestation supplement per amended §4.2)." Production-as-staging topology (D33-related per §4.2 amendment) applies.

**Gate 5 dual-canonical (per §6.13 + §7.10 f):** Before mirroring close note to repo, execute §7.10 (f) dual-canonical content-fidelity check. Mirror commit fails the gate if substantive prose drift detected.

**Per-phase tag inventory clarification (per D36 + D38):** §7.8 acknowledges that not all phases tag. Per-phase tag start-point declared at SHAPE 2 lock. Final phase = milestone close phase per §6.14; receives both `m{N}-phase-{final}-close` + `m{N}-close` tags on same commit.

**Gate 8 final surfacing:** unchanged from v2.6 §7.8 gate 8 wording pattern.

## 7.9 Allow-list discipline + classification bifurcation (CARRIES + Item 13a addition)

Inherits from v2.6 §7.9. M10 v2.7 amendment per Item 13a:

**Constitution prompt anti-pattern coverage extension (J3 doctrine codification):** CONSTITUTION_PROMPTS allow-list (Phase F PATH C bifurcation) gains M10 anti-pattern catalog scanning per LLM judge work. The constitution-prompt-class catalog patterns are distinct from call-site-class patterns (per Phase F PATH C: call-site prompts gated by shape regex; constitution prompts deferred to LLM judge for quote-vs-instance distinction).

**Pattern addition methodology:** new constitution-prompt anti-patterns enter CONSTITUTION_PROMPTS-specific catalog (not PROMPT_BEARING_FILES catalog). Allow-list discipline + classification bifurcation per v2.6 §7.9 (a)/(b) sub-sections holds.

## 7.10 Phase-close multi-gate verification discipline (CARRIES + NEW gate (f))

Inherits from v2.6 §7.10. M10 v2.7 amendment:

**NEW Gate (f) — Dual-canonical content-fidelity check:** After per-phase close commit + per-tag annotation, before pushing the tag, diff vault canonical close note vs repo mirror close note. Substantive prose drift (beyond expected frontmatter / link-format transformations) fails the gate.

Verification mechanism:
1. Strip vault YAML frontmatter and Related-section wikilinks from vault canonical
2. Diff against repo mirror body
3. Acceptable: format-only differences (wikilink → prose reference), line-wrapping cosmetics
4. Failure: sentence-level content differs

Pairs with §6.13 (NEW). Phase G first phase to inherit §7.10 multi-gate from kickoff; M10 phases all inherit gate (f) from M10 v2.7 effective date.

**Per-phase tag start-point clause (per D36):** §7.10 acknowledges that per-phase tags begin from a designated phase (declared at SHAPE 2 lock). Phases preceding the designated start-phase close without per-phase tags but with phase close notes. The full §7.10 multi-gate (a)-(f) applies to every phase commit regardless of tag presence.

---

# Section 8 — References

## 8.1 Method documents (vault)

- `method/koast-method.md` — seven Beliefs and values commitment
- `method/koast-method-in-code.md` — engineering grounding of Method commitments
- `method/voice-doctrine.md` — voice register + anti-pattern doctrine

## 8.2 Voice doctrine (dual-canonical)

- Vault canonical: `method/voice-doctrine.md`
- Repo code-import: `~/koast/docs/voice.md`

## 8.3 M9 inheritance

- `milestones/M9/M9-close.md` (vault 18ff650) — M10 inheritance roll-up + §10 / §11 / §12
- `decisions/2026-05-12-m9-conventions.md` (vault) — v2.6 conventions inherited
- `docs/architecture/agent-loop-v1-milestone-9-conventions.md` (repo mirror; drift remediation = R1 active M10 work)
- `docs/architecture/agent-loop-v1-milestone-9-report.md` (repo developer-facing M9 report)
- `milestones/M9/H-close-gate.md` (vault b6feebd) — M9 close-gate attestation
- `milestones/M9/items/phase-{a,b,c,d,e,f,g}.md` — M9 per-phase close notes (no phase-h.md per §6.14 + D38)

## 8.4 M10 setup artifacts

- `milestones/M10/M10-inheritance-inventory.md` (vault de1dd8f) — 45 atomic items post-STEP 2.1 split
- `milestones/M10/M10-conventions-stop.md` (vault dd8f5fb) — STEP 2 STOP audit + scope decisions surfacing
- `decisions/2026-05-19-m10-conventions.md` (vault) — v2.7 canonical
- `docs/architecture/agent-loop-v1-milestone-10-conventions.md` (repo, this file)

## 8.5 Project-level documents

- `~/koast/CLAUDE.md` — project working agreements, vault policy, M9 + M10 conventions pointer blocks
- `~/koast/DESIGN_SYSTEM.md` — visual + interaction conventions
- Repomix output: `~/koast/repomix-output.xml` (regenerate before M10 Phase A start)

---

*End conventions, v2.7.*
