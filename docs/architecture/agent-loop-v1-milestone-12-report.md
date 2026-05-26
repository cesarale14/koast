# Agent Loop v1 — M12 Milestone Close (Repo Mirror)

> Repo developer-facing mirror of vault canonical `milestones/M12/M12-close.md`. Substantive content identical per v2.8 §7.10 (f) paired-identical-substring construction (5th live firing); expected audience-split transformations per v2.7 §6.13 + §6.15 (no frontmatter, no `[[wikilinks]]`, no `## Related` section).

# Agent Loop v1 — M12 Milestone Close

**Status:** Closed.
**Tag:** `m12-close` → anchored on the repo-mirror commit (per §6.14 + D38 Phase-final-is-milestone-close convention; D36 per-phase tag discipline).
**Conventions:** v2.8 LOCKED (D52-D56; Phase C ship 2026-05-26).
**Close-date:** 2026-05-26.
**Predecessor:** M11 close (Cluster M backlog complete).
**OPERATING PATTERN — TIER 1 close + RELAY-TO-OUTSIDE-REVIEWER point cleared.** Per operator msg 3481 binding + msg 3483 sign-off + adjustments applied.

---

## §1 — What M12 is

M12 is agent loop v1 work past M11's Cluster M backlog close. M12 had two interlocking centerpieces:

- **Substrate centerpiece:** J3 LLM-judge runtime (D34 vi) + iii-vi sub-items rollout (5 stubs). The runtime consumer for the constitution-judge-types substrate (M10 Phase C) — gating guest-facing output at the 4 LLM call sites via 6 host-to-guest runtime judges + 2 CI-time author-file scans. HARD-FLOOR.
- **Conventions centerpiece:** v2.8 conventions ship — interleaved (c) sequencing per operator msg 3447 sign-off + 3-tier codification register canonization (per operator architecture-class msg 3447).

M12 spans 6 phases (3 ship + 1 draft + 1 defer + 1 close). 5 D-numbers locked (D52-D56). +141 net tests (739 → 880 passing). v2.8 LOCKED throughout Phases D-E (no mid-milestone amendment) — Phase C lock held.

---

## §2 — Phase ledger

| Phase | Scope | Operating tier | Tag | Substrate commits |
|---|---|---|---|---|
| **A** | v2.8 mature-sections draft (interleaved (c) sequencing per D52) | TIER 2 draft | — | vault-only (status=drafting) |
| **B** | J3 LLM-judge runtime substrate (HARD-FLOOR) | TIER 1 SHIP | `m12-phase-b-close` | `987f7e8` |
| **C** | v2.8 finalize + GATE RESOLUTION + dual-canonical lock | TIER 1 SHIP | `m12-phase-c-close` | `d906129` (repo mirror) + vault `9df7d9d` |
| **D** | iii-vi rollout (5 stubs: iv-b → iv-a → iv-c → v → vi) | TIER 1 SHIP | `m12-phase-d-close` | `ef94e30` + `5cae16b` + `0a75ad6` + `afe59a8` + `d0534f7` |
| **E** | H7 sentinel STOP → DEFER (obviated by Phase D vi) | TIER 2 defer | — | none (phase-1-stop.md IS the record) |
| **F** | M12 milestone-close (per §6.14 + D38) | TIER 1 close | `m12-close` (this phase) | (this phase) |

6 phases as planned at Phase A. 4 ship-commits (B + C-repo + D 5x) + 2 non-ship phases (A draft, E defer).

**Phase shapes demonstrated:** TIER 1 SHIP × 3 (Phase B/C/D) + TIER 2 draft (Phase A; 1 instance) + TIER 2 defer (Phase E; 1 instance). M12 is the first milestone to demonstrate three distinct phase shapes — see §8 for v2.9 codification.

---

## §3 — Test trajectory

| Breakpoint | Tests passing | Tests skipped |
|---|---|---|
| M11 close (carried) | 739 | 8 |
| M12 Phase A close (draft-only) | 780 | 8 |
| M12 Phase B close (J3 substrate ship) | 811 | 8 |
| M12 Phase C close (v2.8 lock + dual-canonical) | 811 | 8 |
| M12 Phase D close (iii-vi 5 stubs shipped) | 880 | 8 |
| M12 Phase E close (defer; no code) | 880 | 8 |
| **M12 close** | **880** | **8 (enumerated per §3.2)** |

**Net M12:** +141 tests passing; 8 stable-skipped (no change since pre-M12). Major drivers: Phase B (+31 J3 stub + integration), Phase D (+69 iii-vi 5 stubs + integration adjustments), Phase A (+41 misc M11-era catch-ups during draft work).

### §3.1 — Test count growth ramp

Per D55 tightened §3.4.4 criterion: this scope-driven test surplus is intentional adversarial coverage + extracted-subsystem expansion (NOT decision-relevant cost-falsification). +141 net does NOT count as a §3.4.4 instance.

### §3.2 — 8 stable-skipped tests enumerated (Q7 disposition)

Per operator msg 3483 Q7: convert opaque "8 skipped unchanged" carry-over to known-quantity. Each test enumerated below with skip-reason + validity assessment + M13 disposition.

| # | Test | Suite | Skip-reason | Valid? | M13 disposition |
|---|---|---|---|---|---|
| 1 | "end-to-end: seed a fact → dispatchToolCall('read_memory') returns it with full provenance + correct audit row" | `src/lib/agent/tests/staging-smoke.test.ts` (M3 dispatcher staging smoke) | env-gated `RUN_STAGING_SMOKE=1` | YES (integration-class; opt-in real-Supabase smoke) | carry (no action) |
| 2 | "end-to-end: seed memory_fact → runAgentTurn → SDK invokes read_memory → answer references the fact" | `src/lib/agent/tests/m4-staging-smoke.test.ts` (M4 staging smoke) | env-gated `RUN_STAGING_SMOKE=1` | YES (integration-class; real-SDK + Supabase smoke) | carry (no action) |
| 3 | "end-to-end: write → read → audit row at 'succeeded'" | `src/lib/memory/tests/staging-smoke.test.ts` (memory-tools staging smoke) | env-gated `RUN_STAGING_SMOKE=1` | YES (integration-class) | carry (no action) |
| 4 | "schema validity — real Haiku response parses to valid JudgeResult" | `src/lib/agent/judge/__tests__/exclamation-cap-llm.integration.test.ts` | env-gated `INTEGRATION=1` | YES (real Anthropic API; cost + latency; not regular CI) | carry (no action) |
| 5 | "clearly-theatrical input → verdict='fail' (unambiguous discrimination)" | same suite as #4 | env-gated `INTEGRATION=1` | YES | carry |
| 6 | "parse robustness — real call returns valid shape regardless of incidental formatting" | same suite as #4 | env-gated `INTEGRATION=1` | YES | carry |
| 7 | "src/lib/voice/build-voice-prompt.ts — constitution prompt, deferred to M10 LLM judge (§6.9)" | `src/lib/voice/__tests__/anti-patterns.test.ts:203` (CONSTITUTION_PROMPTS loop) | per-entry `test.skip` with "deferred to M10 LLM judge" rationale | **PARTIAL** — rationale text outdated (Phase D vi shipped `scripts/voice-scan-constitution.ts` which IS the LLM judge for these files) | **M13 candidate:** update rationale text to point at Phase D vi script |
| 8 | "src/lib/agent/system-prompt.ts — constitution prompt, deferred to M10 LLM judge (§6.9)" | same loop as #7 | same per-entry `test.skip` rationale | **PARTIAL** — same as #7 | **M13 candidate:** update rationale text |

**Summary:**
- **6 tests** (1-6): integration-class env-gated; valid skip-reason; carry as-is.
- **2 tests** (7-8): constitution-prompts-loop `test.skip`; rationale text outdated (Phase D vi shipped the consumer). **M13 candidate** to update the skip rationale string from "deferred to M10 LLM judge (§6.9)" → "scanned at CI-time by `scripts/voice-scan-constitution.ts` per M12 Phase D vi; this suite's coverage marker stays for institutional record."

**Carry-forward:** 8 skipped tests confirmed; 2 (#7-#8) flagged as M13 rationale-update items. **Per operator msg 3483 — DO NOT FIX individually (scope creep); just enumerate + flag.**

---

## §4 — v2.8 conventions ship + D-numbers locked

v2.8 LOCKED at M12 Phase C (operator msg 3470 final lock-clear). D52-D56 (5 contiguous; first since D51 at M10).

| # | Decision | Source |
|---|---|---|
| **D52** | v2.8 conventions scope: mature-sections-Phase-A + J3-surfaced-Phase-C interleaved (c) sequencing | operator msg 3447 |
| **D53** | 3-tier codification register canonization ([CANON]/[LIVE]/[PROV] with PROV→promote self-amendment rule); §1.0 load-bearing preamble | operator msg 3447 architecture-class call |
| **D54** | §3.5.D HARD-FLOOR adversarial-regression promotion to [CANON] (M4 data-isolation one-sided + J3 output-quality two-sided = 2 cross-domain, cross-shape instances at promotion time) | operator msg 3467 Q1 + 3470 sign-off |
| **D55** | Tightened §3.4.4 promotion criterion: DECISION-RELEVANT falsified prediction — an estimate acted upon that proved wrong; explicitly excluding scope-driven count overruns; resolves taxonomy flag (decision-relevant framing = genuine §3.4 child, not §3.6 sibling) | operator msg 3467 Q2 + 3470 sign-off |
| **D56** | J3 fail-open binding contract recorded in CLAUDE.md Known Gaps (commit `725f2f8`) + per-call-site override hook (`JudgePolicyOverride.fail_mode_override` at `src/lib/agent/judge/apply-output-judges.ts:59`) as substrate-for-the-contract; §6.21 conventions [LIVE] | Phase B STOP §3.3 + operator msg 3456 catch #2 + msg 3467 Q7 + 3470 sign-off |

**D-set grain discipline (Phase C lock-clear pattern, operator msg 3470):** the bar for a D-number is genuine milestone-level decision with M13-inherited consequence. Implementation-convenience (scaffolding-shape) and outcome-observation (framework-validation) do NOT clear the bar. Two grain-filtered drops at Phase C lock-clear (former D56 JudgeId-enum + former D58 tiering-demonstration) — recorded as institutional discipline for M13+ D-numbers.

---

## §5 — Substrate shipped

### §5.1 — Runtime LLM judges (6 active; 4 host-to-guest call sites gated)

| Judge | Source | Doctrine § | Phase |
|---|---|---|---|
| J1 emoji_policy | `src/lib/voice/output-filter.ts` | §5.5 | M10 Phase B (deterministic; output-filter) |
| J2 exclamation_cap | `src/lib/agent/judge/exclamation-cap.ts` + `exclamation-cap-llm.ts` | §5.5 | M10 Phase B (count-prefilter + Haiku rescue) |
| J3 ensure_verb_chain | `src/lib/agent/judge/ensure-verb-chain.ts` | §5.6 | **M12 Phase B (iii activated)** |
| J4 self_narration | `src/lib/agent/judge/self-narration.ts` | §5.8 | **M12 Phase D (iv-b activated)** |
| J5 filler | `src/lib/agent/judge/filler.ts` | §5.7 | **M12 Phase D (iv-a activated)** |
| J6 performative_thoroughness | `src/lib/agent/judge/performative-thoroughness.ts` | §5.9 | **M12 Phase D (iv-c activated — refined GENERIC-INTERCHANGEABLE vs CONTEXT-SPECIFIC discriminator per operator msg 3475)** |

All 6 dispatched via `src/lib/agent/judge/apply-output-judges.ts` with uniform ANNOTATE-ONLY fail-behavior. FAIL-OPEN INFRASTRUCTURE-ERROR contract per §6.21 [LIVE]. Audience-scoped to host-to-guest at Phase D (koast-to-host returns skip via `audience_out_of_scope`).

### §5.2 — CI-time author-file scans (2 active; shared classifier)

| Judge | Source | Target | Phase |
|---|---|---|---|
| voice_doctrine_self_scan | `scripts/voice-scan-doctrine.ts` + `src/lib/agent/judge/quote-vs-instance.ts` | `method/voice-doctrine.md` | **M12 Phase D (v activated)** |
| constitution_prompt_quote_vs_instance | `scripts/voice-scan-constitution.ts` + (shared classifier) | `src/lib/voice/build-voice-prompt.ts` + `src/lib/agent/system-prompt.ts` per `CONSTITUTION_PROMPTS` | **M12 Phase D (vi activated; homomorphic with v)** |

CI-time activation: npm scripts (`voice:scan:doctrine` + `voice:scan:constitution`). Per-match LLM classification: quote-context (typographically marked / pedagogical / negative-example block) → PASS; declarative-use → FAIL. Exit code 0 = clean; 1 = violations found.

### §5.3 — Catalog state (PHASE_F_DEFER_TO_M10)

`src/lib/voice/anti-patterns.ts` PHASE_F_DEFER_TO_M10 catalog state post-M12:

| Catalog ID | Phase A state | Phase B state | Phase D state |
|---|---|---|---|
| deferred_5_5_emoji_policy | deferred (output-filter) | deferred (shipped via J1) | unchanged |
| deferred_5_5_exclamation_cap | deferred (llm-judge) | deferred (shipped via J2) | unchanged |
| deferred_5_6_ensure_verb_chain | deferred (llm-judge) | **runtime_active=true (J3)** | unchanged |
| deferred_5_7_filler | deferred (llm-judge) | deferred | **runtime_active=true (J5)** |
| deferred_5_8_self_narration | deferred (llm-judge) | deferred | **runtime_active=true (J4)** |
| deferred_5_9_performative_thoroughness | deferred (llm-judge) | deferred | **runtime_active=true (J6)** |
| deferred_voice_doctrine_self_scan | deferred (llm-judge) | deferred | **runtime_active=true (CI-time)** |
| deferred_constitution_prompt_quote_vs_instance | deferred (llm-judge) | deferred | **runtime_active=true (CI-time)** |

**8 of 8 deferred catalog entries have live consumers post-M12.** Zero deferred-stubs remain.

---

## §6 — §3.5.D HARD-FLOOR adversarial-regression discipline (re-accounted per operator msg 3483 Q4)

### §6.1 — Re-accounting: 5 hard-floor instances (NOT 7)

Per operator msg 3483 Q4 substantive catch: §3.5.D was canonized as "HARD-FLOOR adversarial-regression" (D54). The discipline applies to substrate that GATES GUEST-FACING OUTPUT (or where solo-invisible failure is production-expensive). Counting v/vi as §3.5.D instances stretches the canonized definition — same definitional-loosening risk that M3-outcome-3-family non-padding (§6.16) and §3.4.4 surplus filter (D55) explicitly refused.

**§3.5.D HARD-FLOOR adversarial-regression instances (5; honest re-count):**

| # | Source | Domain | Adversarial shape | Activation surface | Hard-floor? |
|---|---|---|---|---|---|
| 1 | M11 Phase D M4 memory-export | DATA-ISOLATION (cross-host) | ONE-SIDED isolation-probe (4 hostId-leak param variants) | runtime route | YES (cross-host data leak = silent-invisible production failure) |
| 2 | M12 Phase B J3 ensure-verb-chain | OUTPUT-QUALITY (§5.6) | TWO-SIDED judge-probe (4 FP × 3 FPos) | runtime judge gating host-to-guest | YES (gates guest-facing voice integrity) |
| 3 | M12 Phase D iv-b self-narration | OUTPUT-QUALITY (§5.8) | TWO-SIDED (4 generic × 3 specific follow-through) | runtime judge gating host-to-guest | YES |
| 4 | M12 Phase D iv-a filler | OUTPUT-QUALITY (§5.7) | TWO-SIDED (4 removable × 3 legitimate-role) | runtime judge gating host-to-guest | YES |
| 5 | M12 Phase D iv-c performative-thoroughness | OUTPUT-QUALITY (§5.9) | TWO-SIDED + WARMTH-FPos (4 generic-interchangeable × 6 FPos including 3 context-specific warmth per operator msg 3475 refinement) | runtime judge gating host-to-guest | YES |

**§3.5.D [CANON] standing:** ample with 5 hard-floor instances. Discipline robust across DOMAIN axes (data-isolation + output-quality) and SHAPE axes (one-sided isolation-probe + two-sided judge-probe + warmth-FPos refined-discriminator).

### §6.2 — CI-time classifier adversarial-testing — RELATED-but-DISTINCT discipline (v/vi)

Phase D v + vi each shipped with two-sided adversarial coverage (4 FP × 3 FPos) BUT are CI-TIME scans of AUTHORED files (voice-doctrine.md + constitution prompts). They are adversarially-tested but do NOT gate guest-facing output and are therefore NOT hard-floor.

**v/vi as a RELATED-but-DISTINCT discipline instance class:**

| # | Source | Domain | Adversarial shape | Activation surface |
|---|---|---|---|---|
| Class instance 1 | M12 Phase D v voice-doctrine-self-scan | DOCTRINE-INTEGRITY | TWO-SIDED (4 declarative × 3 pedagogy) | CI-time author-file scan |
| Class instance 2 | M12 Phase D vi constitution-prompt-quote-vs-instance | CONSTITUTION-INTEGRITY | TWO-SIDED homomorphic with #1 | CI-time author-file scan |

**v2.9 CANDIDATE (explicit decision required at v2.9 drafting; NOT folded implicitly at M12 close):**
- Option (α): broaden §3.5.D from "HARD-FLOOR adversarial-regression" to "ALL-CLASSIFIERS adversarial-regression" (any adversarially-tested classifier requires two-sided coverage regardless of activation surface)
- Option (β): seed a SIBLING discipline (e.g., §3.5.E or §6.X) for CI-time classifier adversarial-testing — distinct from hard-floor, distinct discipline name, distinct definition

The CI-time-vs-runtime activation-surface dimension is a DELIBERATE v2.9 question. Record v/vi as the v2.9 candidate, NOT as §3.5.D-hard-floor instances. Decision belongs to M13 v2.9 drafting (or later) with mature evidence.

### §6.3 — Counterfactual: why this matters for future work

§3.5.D's definition determines what FUTURE work MUST mandatorily apply two-sided coverage:
- Under "HARD-FLOOR adversarial-regression" (current CANON): future hard-floor substrate (guest-facing gating; cross-host; auth/RLS; Channex writes) MUST ship with two-sided adversarial. Non-hard-floor classifiers MAY do so but not bound to.
- Under "ALL-CLASSIFIERS adversarial-regression" (Option α): ANY adversarially-tested classifier requires two-sided coverage. Broader mandate.

Stretching §3.5.D's CANON definition implicitly at M12 close would have made the broader mandate de facto without the deliberate v2.9 decision. Operator msg 3483 Q4 catch averts this.

---

## §7 — Convention evolution v2.7 → v2.8 + v2.9 evidence base (per operator msg 3483 Q3 enhancement)

### §7.1 — v2.8 net additions over v2.7

- §1.0 3-tier codification register ([CANON]/[LIVE]/[PROV] with PROV→promote rule)
- §3.4 4-sub-class taxonomy (substrate / plan / spec / estimate-vs-measurement; D55 tightened criterion)
- §3.5 4 Phase 1 STOP sub-disciplines (A/B/C/D; D promoted to [CANON] at D54 per §6.1 above)
- §4.2 BOTH HALVES apply-discipline (verify-absence + verify-presence)
- §6.16 M3-outcome-3-family pattern
- §6.17 OPERATING PATTERN [LIVE]
- §6.18 Worker-deploy 4-point attestation
- §6.19 schema.ts preserve-and-append lineage
- §6.20 capture-forward-without-migration
- §6.21 J3 fail-open binding contract [LIVE]
- §7.7 substrate-without-roadmap disposition taxonomy (DELETE / REAPPLY / CASCADE-DELETE)
- §7.10 (f) paired-identical-substring construction
- §Y.1 tooling-reliability observation [LIVE]

### §7.2 — v2.9 CANON-READY promotions (operator msg 3483 Q3 enhancement)

Per operator msg 3483 Q3: "v2.9's evidence base is already SUBSTANTIAL — iii-vi codification (5 mature instances, CANON-ready) and the runtime_active extension (6 instances, CANON-ready) aren't just latent triggers, they're ripe-to-promote. M13's v2.9 drafting opens with a ready base, the way M12 opened v2.8."

State these as **v2.9 CANON-ready promotions** (not just forward-triggers):

| # | v2.9 promotion candidate | Evidence base | Status |
|---|---|---|---|
| 1 | **§6.9 iii-vi codification** — the iii-vi-rollout pattern (5 stubs ship under shared template: ensure-verb-chain reference + per-judge adversarial template + apply-output-judges j-slot dispatch) | 5 mature instances (J3 + J4 + J5 + J6 + v+vi homomorphic pair) | **CANON-ready for v2.9** |
| 2 | **DeferredAntiPatternStub `runtime_active + judge_id` extension** — catalog-id-preserved + transition-flag pattern for stub-promotion lineage | 6 instances (J3 from M12 Phase B + 5 from M12 Phase D: J4/J5/J6 runtime + v+vi CI-time) | **CANON-ready for v2.9** |

### §7.3 — v2.9 PROV items + promotion triggers

Carry-forward to v2.9 as PROV items with explicit promotion triggers (NOT CANON-ready yet):

| # | v2.9 PROV item | Evidence | Promotion trigger |
|---|---|---|---|
| 1 | **CI-time classifier adversarial-testing** (§3.5.D sibling-or-broadening per §6.2 above) | 2 instances (v + vi homomorphic; M12 Phase D) | Explicit v2.9 decision: broaden §3.5.D OR seed sibling discipline + 2nd cross-domain CI-time instance |
| 2 | **TIER 2 sub-shapes** (per operator msg 3483 Q5; see §8.1 below) | TIER 2 draft (Phase A; 1 instance) + TIER 2 defer (Phase E; 1 instance) | draft-only promotes on 2nd draft-only phase; defer-only promotes on 2nd defer-only phase |
| 3 | **Auto-send → sentinel re-validation contract** (latent per Phase E §10.4) | Conditional-on-H7-building; currently no sentinel ships | Active only IF H7 ever re-opens AND `messaging_executor` activates |
| 4 | **3-level production-migration-parity check** (M10 Phase E origin) | NOT applicable in M12 (no state-changing apply) | Promotes if Phase D-class iii-vi rollout OR future state-changing apply produces an instance |

### §7.4 — M13 v2.9 drafting opens with a ready base

Per operator msg 3483 Q3 framing: M13's v2.9 drafting opens with a ready base, just as M12 opened v2.8. The TWO CANON-ready promotions (§7.2) + FOUR PROV items with triggers (§7.3) constitute the substantive v2.9 batch. M13 can author v2.9 mature sections at open (or interleave per (c) sequencing precedent) without needing to gather more evidence first.

**v2.9 trigger timing:** activates when M13 (or later) elects v2.9 drafting. There is no time-tied trigger; v2.8 carries unchanged until a v2.9-drafting milestone explicitly opens it.

---

## §8 — Institutional contributions

### §8.1 — Three phase-shape demonstration (operator msg 3483 Q5 adjustment)

M12 is the first milestone to demonstrate three distinct OPERATING PATTERN phase shapes:

| Shape | Instance | Discipline |
|---|---|---|
| TIER 1 SHIP | Phase B + C + D (3 instances; well above CANON threshold) | full STOP + ship + close-artifact + tag (CANON; in CLAUDE.md commit `f6a94a6`) |
| TIER 2 draft | Phase A (1 instance) | mature-sections draft; no tag; phase note appended to inventory or to drafting doc |
| TIER 2 defer | Phase E (1 instance) | defer-disposition; no build; no close artifact; no tag; phase-1-stop.md IS the record |

Per operator msg 3483 Q5: TIER 2 sub-shapes are PROV (single-instance each), not CANON. Codify in v2.9 as **[PROV] with promotion triggers** (NOT canon — single instances each; same discipline as every other PROV):

- **TIER 2 draft sub-shape:** promotes to [CANON] on a 2nd draft-only phase.
- **TIER 2 defer sub-shape:** promotes to [CANON] on a 2nd defer-only phase.

Do NOT §6.17.1-canonize a one-instance shape at M12 close. The OPERATING PATTERN's existing TIER 2 framing absorbs both sub-shapes cleanly; the v2.9 codification names them explicitly when evidence justifies.

### §8.2 — iv-c boundary refinement (operator msg 3475)

Most consequential M12 institutional contribution: the iv-c performative-thoroughness boundary refinement at Phase D STEP 1 sign-off.

**Original frame** (Phase D STOP §3.3 initial draft): "non-informational = removable = performative." Operator catch: conflates "non-informational" with "performative" — authentic relational warmth ("can't wait for the jazz festival") is non-informational but IS authentic host voice the voice-extraction substrate exists to preserve.

**Operator-binding refinement (msg 3475):** GENERIC INTERCHANGEABLE vs CONTEXT-SPECIFIC discriminator. Test: would this sentence be IDENTICAL if sent to a different guest about a different property in a different situation? YES → fail-eligible. NO (named guest/property/occasion/situation) → PASS even though non-informational.

**Asymmetric cost principle baked in:** over-block of authentic warmth is the WORST failure mode for THIS judge (would homogenize host voice + work against voice-extraction). Borderline → PASS rule encodes the asymmetry.

**Cross-stub lesson recorded (forward-looking for M13+):** "your frame tests canonical hard cases but misses a class of legitimate cases adjacent to the boundary." When articulating a fuzzy-judge boundary, explicitly check whether the FPos set covers each legitimate USE-CLASS of the matched pattern, not just the easy-to-imagine cases.

### §8.3 — D-set grain discipline established (operator msg 3470)

The "implementation-convenience and outcome-observation do NOT clear the bar" rule (Phase C lock-clear pattern) is now part of v2.8 §2.1. Two grain-filtered drops at Phase C lock-clear (former D56 enum-scaffolding + former D58 tiering-observation) — recorded as institutional discipline for M13+ D-numbers. Don't let observations or implementation details inflate the decision set inherited by future milestones.

### §8.4 — Phase B JudgeId-enum oversight surfaced + remediated

Phase B's upfront JudgeId enum widening (Q8 sign-off; full iii-vi catalog reserved) broke the §7.6 completeness meta-test at `src/lib/voice/__tests__/output-filter.test.ts:174` — a §3.4.1 substrate-level falsification (claimed-vs-actual on fixture-coverage exhaustive map). Surfaced at first Phase D full-tsc check (`ef94e30`). Remediated by updating the map to include all 8 enum IDs with cross-suite fixture-loci comment block — adds an institutional benefit (the meta-test now documents WHERE each fixture lives).

### §8.5 — §3.5.D 5-instance honest-count + v/vi v2.9 candidate (operator msg 3483 Q4)

The discipline-strength of REFUSING DEFINITIONAL STRETCH at close (Q4 re-accounting): 5 hard-floor instances + 2 separated v/vi as v2.9 candidate. Same shape as M3-outcome-3-family non-padding + §3.4.4 surplus filter. Section §6 above details the re-accounting.

### §8.6 — H7 OBVIATED/CONDITIONAL with B' trap-warning preserved (Phase E + operator msg 3481)

Phase E DEFER-only shape demonstrated: phase-1-stop.md IS the record. H7 ledger status is OBVIATED/CONDITIONAL (distinct from H8 conditional-defer + H9 Mode-1-blocked) with displacement-by-Phase-D-vi reasoning baked in so M13 doesn't re-open cold. B' system-insertion trap-warning preserved for any future H7 re-open (same persistence-discipline as §6.21 [LIVE] fail-open contract). v2.9 forward-trigger (auto-send → sentinel re-validation) recorded as LATENT/CONDITIONAL.

---

## §9 — M13 inheritance section (operator msg 3483 Q6 — 4 completeness elements)

Per operator msg 3483 Q6: the M13 inheritance section must have four completeness elements (matching M11-close §9 shape) so M13 opens clean off this section alone. All four present below.

### §9.1 — Conventions basis + v2.9 trigger timing (Q6 element 1)

**Conventions:** M13 opens under **v2.8 LOCKED** (this milestone's lock). Inherited by reference per §6.15. v2.8 carries unchanged until a v2.9-drafting milestone explicitly opens.

**v2.9 trigger timing:** activates when M13 (or later) elects v2.9 drafting. No time-tied trigger. M13's v2.9 evidence base is already substantial (§7.2 CANON-ready promotions + §7.3 PROV items with triggers) — M13 can author v2.9 mature sections at open OR interleave per (c) sequencing precedent.

### §9.2 — Carry-forward + 3 statuses + reasoning (Q6 element 2)

13/13 original M12-inheritance items disposed:

| # | Item | Status | Reasoning |
|---|---|---|---|
| 7 | J3 LLM-judge runtime | CLOSED M12 Phase B | — |
| 8 | J3 iii-vi sub-items (5 stubs) | CLOSED M12 Phase D | — |
| **11** | **H7 Sentinel pattern** | **OBVIATED/CONDITIONAL** | Disposition A obviated by Phase D vi; B/C have no compelling need; YAGNI completeness rejected per operator msg 3481. M13 re-opens ONLY on specific need (not "should ship eventually"). B' trap-warning preserved (system-insertion = boundary to exclude). v2.9 auto-send → sentinel re-validation contract LATENT. |
| **12** | **H8 Citation-section marker** | **CONDITIONAL-DEFER** | Structural foundation broader at M12 close than at v2.7-lock (Phase D vi extended structural classification with per-match LLM). H8's triggering condition further from being met. Re-open on actual case where structural + quote-vs-instance cannot disambiguate. |
| **13** | **H9 E1(a) cron** | **MODE-1-BLOCKED** | Dependency-bound on Mode 1 generative voice product requirement. Mode 1 not shipped in M12; not on M13 horizon unless added. Re-opens when Mode 1 enters scope. |

**3 statuses distinct + actionable:**
- **OBVIATED** (H7): displaced, not just deferred. Active watch unnecessary; M13 acts only on specific need surfacing.
- **CONDITIONAL-DEFER** (H8): conditional trigger remains unmet; M13 watches for ANY structural-bifurcation gap.
- **MODE-1-BLOCKED** (H9): dependency-bound; M13 watches for Mode 1 scope.

This tells M13 explicitly which to actively watch vs which is likely-dead.

### §9.3 — v2.9 evidence base (Q6 element 3)

Per §7.2 + §7.3:

**v2.9 CANON-ready promotions (ripe; M13 drafts at v2.9 open):**
1. §6.9 iii-vi codification (5 mature instances)
2. DeferredAntiPatternStub `runtime_active + judge_id` extension (6 instances)

**v2.9 PROV items + promotion triggers:**
1. CI-time classifier adversarial-testing — broaden §3.5.D OR seed sibling discipline (operator-set v2.9 decision)
2. TIER 2 sub-shapes (draft-only + defer-only; each promotes on 2nd instance)
3. Auto-send → sentinel re-validation contract (latent; conditional on H7 re-open)
4. 3-level production-migration-parity check (M10 Phase E origin; promotes on first applicable state-changing apply)

**§3.5.D [CANON] standing:** 5 hard-floor instances (per §6.1 re-accounting). Robust across domain + shape axes. No further promotion needed; §3.5.D-vs-sibling broadening question is the v2.9 candidate per §7.3 item 1.

### §9.4 — Closed-list (Q6 element 4)

**M11-shipped (operator already-acknowledged complete per M11-close §9.3):** items 1-6 + 9-10 (8 items).

**M12-shipped (this milestone):**
- Phase B (`987f7e8`): J3 LLM-judge runtime substrate (D34 vi); item 7
- Phase C (`d906129` repo + `9df7d9d` vault): v2.8 conventions lock + dual-canonical paired-ship (§7.10 (f) 4th live firing); D52-D56
- Phase D 5x (`ef94e30` / `5cae16b` / `0a75ad6` / `afe59a8` / `d0534f7`): iii-vi rollout (J4/J5/J6 runtime + v+vi CI-time); item 8
- Phase E (vault `c5619a1`): H7 DEFER record (no code; phase-1-stop.md IS the record)
- Phase F (this commit): M12-close + dual-canonical paired-ship (§7.10 (f) 5th live firing)

**Closed item count:** 10 (8 from M11 + 2 from M12: items 7 + 8). 3 remaining → M13 (§9.2 table). M13 does NOT re-process any closed item.

**Conventions-shipped:**
- M11: zero D-numbers locked (execution under inherited v2.7)
- M12: D52-D56 locked at Phase C v2.8 finalize

---

## §10 — Close gate verification (per §7.8 amended + §7.10 (f))

Per v2.8 §7.8 milestone close protocol:

- **(a) `npx tsc --noEmit`** → 0 errors (verified pre-close; Phase D + Phase E both clean)
- **(b) `npm test`** → 880 passing / 8 skipped (verified Phase D close; Phase E shipped no code; carried)
- **(c) `npm run lint`** → EXIT 0 (1 react-hooks/exhaustive-deps warning permitted on ChatClient.tsx, surfaced at every pre-commit since Phase B; not error)
- **(d) Vercel production deploy verification** → operator-attestable per §4.2 amended (production-as-staging topology)
- **(e) Substrate smoke + operator-attestation** → operator-attestable per §4.2 amended (3 host-to-guest call sites; J3-J6 envelopes ship per Phase D; v/vi npm scripts available on-demand)
- **(f) Dual-canonical content-fidelity (§7.10 (f) 5th live firing)** → THIS PAIRED-COMMIT pair is the firing (vault `milestones/M12/M12-close.md` + repo `docs/architecture/agent-loop-v1-milestone-12-report.md`)
- **(g) Conventions revision dual-canonical** → v2.8 LOCKED at Phase C (4th live firing); no Phase F conventions revision

**13/13 carry-forward items disposed.** 10 shipped (8 M11 + 2 M12); 3 → M13 with explicit reasoning (§9.2).

---

## §11 — Tag + Phase F close shape

**Tag:** `m12-close` → anchored on the repo-mirror commit (`docs/architecture/agent-loop-v1-milestone-12-report.md` ship). Per §6.14 + D38 Phase-final-is-milestone-close: SINGLE tag (no separate `m12-phase-f-close` per §6.14).

**Phase F close shape:** TIER 1 SHIP-PHASE (milestone-close machinery). Phase F's only ship-commit IS the M12-close dual-canonical paired-commit. STOP at `milestones/M12/M12-close-stop.md` is the audit record; this M12-close.md is the deliverable + M13 inheritance inventory.

**Outside-reviewer relay cleared:** operator msg 3483 sign-off with 3 adjustments (Q4 re-account / Q5 PROV / Q7 enumeration) + 1 enhancement (Q3 CANON-ready promotions). All applied above. SOLO from sign-off per operator msg 3483 release: "no re-relay needed before the ship."

---

*End M12 close, v2.8.*
