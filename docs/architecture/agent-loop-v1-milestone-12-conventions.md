# Agent Loop v1 — Milestone 12 Conventions (Repo Mirror)

> Repo developer-facing mirror of vault canonical `decisions/2026-05-25-m12-conventions.md`. Substantive content identical per v2.8 §7.10 (f) paired-identical-substring construction; expected audience-split transformations per v2.7 §6.13 + §6.15 (no frontmatter, no `[[wikilinks]]`, no `## Related` section).

# Agent Loop v1 — Milestone 12 Conventions (v2.8 — LOCKED)

**Status:** LOCKED at M12 Phase C v2.8 finalize (2026-05-26).
**Drafted:** 2026-05-25 (Phase A open; same-day as M11 close); patches applied 2026-05-26 (Phase C STEP 1); locked 2026-05-26 (Phase C STEP 2 ship; operator msg 3470 final lock-clear after D-set grain fixes).
**Inheritance:** v2.7 (M10 conventions, vault `decisions/2026-05-19-m10-conventions.md`) — primary reference. M12 inherits structure + carry-forward sections; v2.8-specific amendments per the sections below.
**v2.8 trigger:** J3 LLM-judge runtime per v2.7 §1.1 "alongside" timing-tie. M12 centerpiece + concurrent v2.8 drafting per Phase A (mature sections) + Phase C (fold-back finalize).

---

## Changelog

**v2.8 (LOCKED) — 2026-05-26** — M12 conventions ship under the interleaved sequencing approved at M12 open (operator msg 3447). Phase A drafted MATURE sections; Phase B shipped J3 substrate (TIER 1; commit 987f7e8); Phase C STEP 1 applied gate-resolution patches; Phase C STEP 2 locked at operator final lock-clear (msg 3470) after D-set grain fixes (drop former D56 JudgeId-enum scaffolding + former D58 tiering-demonstration observation; renumber to contiguous D52-D56 5-decision set). Dual-canonical paired ship per §7.10 (f) 4th live firing.

Headline additions (per the §1.0 3-tier register below):
- **§1.0 NEW** — The 3-tier codification register (load-bearing preamble per operator-spec)
- **§3.4 amendment** — 4-sub-class taxonomy (substrate / plan / spec / estimate-vs-measurement)
- **§3.5 NEW** — Phase 1 STOP sub-disciplines taxonomy (4 sub-disciplines A/B/C/D)
- **§4.2 amendment** — Apply-before-writing-code BOTH-HALVES taxonomy (verify-absence + verify-presence)
- **§6.16 NEW** — M3-outcome-3-family pattern (substrate-without-immediate-behavior-change)
- **§6.17 NEW** — OPERATING PATTERN codification (speed-tiered + self-red-team + hard-floor + CONSULT FLAG)
- **§6.18 NEW** — Worker-deploy 4-point attestation model
- **§6.19 NEW** — schema.ts preserve-and-append lineage sub-pattern
- **§6.20 NEW** — Capture-forward-without-migration sub-pattern
- **§7.7 amendment** — Substrate-without-roadmap-commitment disposition discipline
- **§7.10 (f) amendment** — Paired-identical-substring-edit construction (3 live firings to date)
- **§Y NEW** — Tooling-reliability observation (Edit success ≠ proof of file change)

Phase C fold-back outcomes (J3-tied):
- §6.9 sub-items iii-vi codification — DEFERRED to Phase D rollout per per-stub activation cadence (each sub-stub iii-vi consumes the §6.10 separate-domain extraction methodology + ensure-verb-chain template); v2.9 will codify the iii-vi-rollout patterns naturally
- 3-level production-migration-parity check — NO migration shipped in Phase B (Option A: no judge-results host-scoped table); §4.2.2 promotion gate remains real-CREATE-contingent
- §3.5.D HARD-FLOOR adversarial-regression — **PROMOTED to [CANON]** (M11 Phase D M4 data-isolation 1st + M12 Phase B J3 output-quality 2nd = 2 cross-domain instances; D54)
- §6.21 J3 fail-open binding contract [LIVE] — added (D56; register-symmetric with §6.17)

---

# Section 1 — Milestone framing

## 1.0 — The 3-tier codification register (LOAD-BEARING PREAMBLE)

**Per operator spec msg 3447 (architecture-class call):**
> "the v2.8 mature-sections draft tiers its codification three ways: canonize (strong evidence), codify-existing (adopted reality, age-irrelevant), and provisional/observed (thin evidence, await more instances). That tiering should itself be stated in the v2.8 preamble so a future reader knows which conventions are load-bearing canon versus provisional observations — and so M12/M13 know which ones to 'promote' as instances accrue."

**The three tiers — every section/sub-section in v2.8 carries one of these markers:**

| Tier | Marker | Meaning | Promotion path |
|---|---|---|---|
| **CANONIZE** | [CANON] | Strong evidence (typically 3+ instances OR cross-milestone reinforcement); load-bearing for substrate decisions; "rule" semantics | Stays canon unless explicitly amended in a future revision |
| **CODIFY-EXISTING** | [LIVE] | Adopted reality (in CLAUDE.md or production code); age-irrelevant; codification captures what's already governing | Stays LIVE; if the underlying CLAUDE.md / code amends, the conventions track |
| **PROVISIONAL** | [PROV] | Thin evidence (typically 1 instance OR pattern-shape-clear but instance-count-low); observed and worth recording; "await more instances before promoting" | M13/M14 can promote to [CANON] when instance count reaches the threshold (3+) OR demote/remove if pattern fails to recur |

**Reading convention:** every numbered section/sub-section header carries its tier marker in square brackets at the end. A future reader scanning the doc knows immediately which conventions are load-bearing canon vs provisional observations.

**Why this matters:** the v2.7 batch contained both adopted-and-live patterns (e.g. OPERATING PATTERN by the time v2.8 drafts) AND single-instance observations (e.g. HARD-FLOOR adversarial-regression — only M11 Phase D as evidence). Treating these uniformly conflates the discipline strength. The 3-tier register prevents that conflation + sets the promotion pathway explicitly.

**Self-amendment rule:** sections marked [PROV] in v2.8 are candidates for promotion review at v2.9/v3.0 drafting. The promotion happens by amending the marker (and possibly the section text) when accumulated instances justify it.

---

## 1.1 — What M12 is [CANON]

M12 is agent loop v1 work past M11's Cluster M close. M11 shipped the full Cluster M backlog (M1+M2+M3-from-M10+M4) plus the OPERATING PATTERN governance artifact and 4 Phase 1 STOP sub-disciplines. M12 inherits agent loop v1 with two interlocking work tracks:

- **Substrate extension:** J3 LLM-judge runtime — the runtime consumer for constitution-judge-types substrate shipped at M10 Phase C, gating outputs at the 4 LLM call sites for sub-items iii-vi (§6.9). HARD-FLOOR per `milestones/M12/M12-inheritance-inventory.md` §2 (gates guest-facing + host-facing output).
- **Conventions evolution:** v2.8 drafts in this milestone per the "alongside" timing-tie from v2.7 §1.1. Phase A drafts MATURE sections (this document); Phase C folds J3-surfaced patterns + finalizes.

M12 ships under v2.8 conventions (incremental from v2.7). No symbolic v3.0 reset; v2.7 lineage continues. v2.7's framing of "v2.6 lineage continues" applies recursively here.

## 1.2 — SHAPE 1 — technical architecture statement [CANON]

Inherits the SHAPE 1 statement from v2.7 §1.2 unchanged: agent loop v1 substrate (loop.ts + memory_facts + agent_audit_log + RefusalEnvelope + AgentTextOutput envelope + 4 LLM call sites + voice doctrine + Channex integration + Belief 7 voice substrate + Cluster M complete substrate per M10-M11). M12 extends, does not refactor.

## 1.3 — SHAPE 2 [PROV]

M12 SHAPE 2 items locked at Phase A scope-setting. Anticipated structure (NOT FINAL):
- **Cluster J — LLM judge runtime:** J3 (D34 vi); iii-vi sub-items rollout
- **Cluster H carry-forward:** H7 sentinel pattern (J3-blocked) — unblocks post-J3
- **Conditional defer:** H8 citation marker (per condition); H9 E1(a) cron (Mode-1-blocked)

Final SHAPE 2 enumeration locks at Phase A close (the same way v2.7 Phase A locked M10's SHAPE 2).

## 1.4 — Phase enumeration [PROV]

Per `milestones/M12/M12-inheritance-inventory.md` §6 (operator-signed-off-on-(c)-interleaved at msg 3447):
- **Phase A — open + v2.8 mature-sections draft.** SHIPPED 2026-05-25 (TIER 2; draft-only, no tag per §6.17 speed-tiered). Mature sections: §1.0 register + §3.4 amendment + §3.5 4 sub-disciplines + §4.2 both-halves + §6.16-§6.20 codifications + §7.7 + §7.10 (f).
- **Phase B — J3 LLM-judge runtime substrate.** SHIPPED 2026-05-26 (TIER 1 HARD-FLOOR; commit `987f7e8`; tag `m12-phase-b-close`). Generic LLM-judge runner + ensure-verb-chain stub activation + JudgePolicyOverride substrate-for-the-contract + fail-open binding contract recorded in CLAUDE.md `725f2f8`. 4 FP × 3 FPos adversarial-regression discipline (2nd cross-domain instance → §3.5.D [CANON] promotion).
- **Phase C — v2.8 finalize + GATE RESOLUTION.** SHIPPED 2026-05-26 (TIER 1; this ship; tag `m12-phase-c-close`). Fold-back scan: zero new patterns from J3 (clean). Gate resolutions: §3.5.D → [CANON] (D54); §3.4.4 → [PROV] under tightened criterion (D55); §4.2.2 → [PROV] real-CREATE-contingent (no Phase B migration). 5 D-numbers locked (D52-D56) after Phase C STEP 1 STOP + STEP 2 lock-clear grain fixes (drop former D56 enum-scaffolding + former D58 tiering-observation). Lock-and-ship paired-canonical per §7.10 (f) 4th live firing.
- **Phase D — LLM judge iii-vi rollout.** Per-call-site activation; iterative. Open.
- **Phase E — H7 sentinel pattern.** Post-J3 unblocked. Open.
- **Phase F — H8 + H9 reconsidered + M12 close** per §6.14 + D38. Open.

6 phases planned; A-C shipped at v2.8 lock; D-F open for M12 continuation. Larger than M11's 4 (matches M10's 8 in complexity range).

---

# Section 2 — Architectural decisions

## 2.1 — D52-D56 [LOCKED at M12 Phase C v2.8 finalize]

**M12 D-numbers attached to the v2.8 conventions ship per M10 precedent (operator msg 3451).** v2.8 shipped at Phase C lock-and-finalize. Phase A produced a draft at status=drafting; D-numbers stayed [PROV → locks at Phase C] until lock-clear (operator msg 3470). M11 locked ZERO D-numbers (execution under inherited conventions); M12's 5-D set reflects the 5 genuine milestone-decisions ready to be inherited by M13+ — and ONLY those. The D-set grain fixes at Phase C lock-clear dropped two candidates (former D56 JudgeId-enum scaffolding + former D58 tiering-demonstration observation) that didn't clear the milestone-decision bar; both are recorded elsewhere (Phase B STOP + §3.3 institutional-contribution + close-shape contrast). The 5-D set is tight + contiguous; what M13 inherits as "M12 decisions" is exactly what an M13 reader needs to know.

**Locked D-numbers (M12 v2.8):**
- **D52 [LOCKED]** — v2.8 conventions scope: mature-sections-Phase-A + J3-surfaced-Phase-C interleaved (c) sequencing (per operator msg 3447 sign-off).
- **D53 [LOCKED]** — 3-tier codification register canonization ([CANON]/[LIVE]/[PROV]) with PROV→promote self-amendment rule; §1.0 load-bearing preamble (per operator architecture-class call msg 3447).
- **D54 [LOCKED]** — §3.5.D HARD-FLOOR adversarial-regression promotion to [CANON] (M4 data-isolation one-sided + J3 output-quality two-sided = 2 cross-domain, cross-shape instances; cross-domain shape-difference STRENGTHENS canonization beyond identical-instance evidence) (per operator msg 3467 Q1 + 3470 sign-off).
- **D55 [LOCKED]** — Tightened §3.4.4 promotion criterion to DECISION-RELEVANT falsified prediction — an estimate acted upon that proved wrong, explicitly excluding scope-driven or decision-irrelevant count overruns; resolves taxonomy flag (decision-relevant framing = genuine §3.4 child, not §3.6 sibling) (per operator msg 3467 Q2 + 3470 sign-off; Phase A draft taxonomy flag resolved at lock).
- **D56 [LOCKED]** — J3 fail-open binding contract recorded in CLAUDE.md Known Gaps (commit `725f2f8`) + per-call-site override hook (`JudgePolicyOverride.fail_mode_override` at `src/lib/agent/judge/apply-output-judges.ts:59`) as substrate-for-the-contract; §6.21 conventions [LIVE] reference register-symmetric with §6.17 OPERATING PATTERN (per Phase B STOP §3.3 + operator msg 3456 catch #2 + msg 3467 Q7 + 3470 sign-off).

v2.7 ended at D51. v2.8 increments D52-D56 (5 D-numbers; contiguous). D-set frozen at M12 close per the M10 precedent.

**D-set grain discipline (operator msg 3470 framing):** the bar for a D-number is genuine milestone-level decision with M13-inherited consequence. Implementation-convenience (scaffolding-shape) and outcome-observation (framework-validation) do NOT clear the bar — those are sufficient where recorded (Phase B STOP for scaffolding choices; Phase A/B close-shape contrast for tiering observations). Don't let observations or implementation details inflate the decision set inherited by future milestones — that erodes what a D-number means. This applies forward to M13+ as well.

---

# Section 3 — Spec-premise falsification + Phase 1 STOP sub-disciplines

## 3.4 — Spec-premise falsification taxonomy (AMENDMENT; 4 sub-classes) [CANON]

**Framework status: CANONIZED.** 4 sub-classes with concrete cross-milestone evidence:

### 3.4.1 — Substrate-level [CANON]

**Definition:** Shipped code's behavior diverges from its spec premise. Caught by independent verification against actual state (typically tsc/test failures, but also runtime behavior).

**Instances (4):**
- M10 Phase D S2 — envelope-not-persisted
- M10 G8-E1 — internal-substrate-discovery pre-ship
- M10 G8-E2 — runtime-substrate-discovery post-ship
- M11 Phase A item 3 — sufficiency-catalog.test.ts +1-file surfaced as tsc compile-error at Q7 verify-before-vault gate (substrate-cascade-symmetry observation)

**Discipline locus that surfaces:** sub-step verify-shipped-state at the verify-before-vault gate (Q7 pattern from M11 Phase A item 3).

### 3.4.2 — Plan-level [PROV]

**Definition:** Phase plan assumes work that was already done by an earlier phase. Surfaced when the planner's checklist outlives the substrate that satisfied it.

**Instances (1):** M10 Phase F scope pre-executed at Phase C.

**Tier rationale:** single instance to date; pattern shape is clear but rare. Discipline value still real; tier records the evidence honesty.

**Promotion trigger:** Promotes to [CANON] when a 2nd PLAN-LEVEL falsification appears in M13+ — a phase plan assumes work already done by an earlier phase (the planner's checklist outlives the substrate that satisfied it).

### 3.4.3 — Spec-level (NEW from v2.7) [PROV]

**Definition:** The CARRY-FORWARD INVENTORY's spec premise itself is wrong. The deferred item's characterization in the inventory doesn't match reality when investigated.

**Instances (1):** M11 Phase A item 4 — H4 characterized as "gh CLI scope refresh" but investigation found CLI version issue (2.4.0 → 2.92.0 upgrade resolved it; OAuth scopes were fine).

**Discipline locus that surfaces:** Phase 1 STOP investigation against actual state, not assumption from the inventory spec.

**Tier rationale:** single instance to date; pattern shape clear.

**Promotion trigger:** Promotes to [CANON] when a 2nd carry-forward-inventory spec-premise mismatch appears — the deferred item's characterization in the inventory doesn't match what investigation finds (analogous to H4's "gh CLI scope refresh" vs "CLI version upgrade" reality).

### 3.4.4 — Estimate-vs-measurement (NEW from v2.7) [PROV]

**Definition (TIGHTENED at v2.8 lock per operator msg 3467 Q2):** A decision-relevant falsified prediction — an estimate acted upon that proved wrong. Explicitly EXCLUDES scope-driven or decision-irrelevant count overruns; test-count surpluses driven by adversarial-coverage rebalance OR extracted-subsystem suite expansion do NOT qualify. The criterion is whether the falsification CHANGED what was done, not whether a number landed off rough estimate.

**Instances (under tightened criterion; 2):**
- M11 Phase A item 5 **Path A** (~35-45s estimate vs 145s measured) — falsification triggered Path D pivot. ✓ DECISION-RELEVANT.
- M11 Phase A item 5 **Path D** (~35-45s warm estimate vs 115s measured) — falsification triggered Path C (lint-only) pivot. ✓ DECISION-RELEVANT.

**Filtered OUT under the tightened criterion (instances of scope-driven surplus, NOT cost-falsification):**
- M11 Phase C item 1 (+24 vs Q12 +15-20 tests) — scope-driven (adversarial rebalance per M2 operator catch); NO decision-change.
- M11 Phase D item 1 (+15 vs Q13 +8-12 tests) — scope-driven (HARD-FLOOR adversarial coverage); NO decision-change.
- M12 Phase B (+31 vs Q9 +15-20 tests) — scope-driven (operator catch #3 4-FP rebalance + generic-runner-suite extraction); NO decision-change.

These are real estimate-vs-measurement drift events, BUT the surplus came from intentional scope additions, not from unexpected cost forcing a pivot. They are documented in the milestone records but do NOT count as §3.4.4 instances.

**Discipline locus that surfaces:** Q6 "measure post-install" / Q12 "verify-before-vault" mandatory verify-then-confirm gate AT THE DECISION POINT (does the measurement force a pivot?).

---

**Cross-reference note for §3.4 (operator msg 3451):** the §Y.1 tooling-reliability observation shares the §3.4 epistemic shape — "claimed state ≠ actual state; caught by independent verification." BUT §Y.1 is REGISTERED separately as [LIVE] (prescriptive operating rule adopted in CLAUDE.md Code Rules) rather than as §3.4.5 evidence-tier sub-class. The shared shape is recognized; the register-distinction (descriptive evidence-tier vs prescriptive [LIVE] rule) keeps §3.4 a clean 4-sub-class structure rather than a 5-class mixed-register one. See §Y.1 for the standalone codification.

**Tier rationale (re-applied under tightened criterion at M12 Phase C lock):** Under the operator-tightened criterion (msg 3467), DECISION-RELEVANT instances are 2, BOTH within M11 (Path A + Path D). M12 produced ZERO decision-relevant instances under the tightened criterion (its 3 scope-driven surpluses are explicitly filtered out). Cross-milestone INDEPENDENT reinforcement criterion not met. Stays [PROV].

**Promotion trigger:** Promotes to [CANON] when a 2nd-milestone DECISION-RELEVANT falsified prediction appears — a wrong estimate that CHANGED what was done. Scope-driven test-count surpluses (adversarial rebalance, extracted-subsystem suite expansion) do NOT qualify per the tightened definition above; the criterion deliberately excludes the trivial "any number landed off a rough estimate" reading that would promote on noise.

**Taxonomy resolution (RESOLVED at M12 Phase C lock per operator msg 3467 Q2 framing):** The Phase A draft flagged §3.4.4 as possibly a sibling discipline (§3.6 candidate) on the grounds that §3.4.1-3 are "claimed state ≠ actual existence" while estimate-vs-measurement is "predicted value ≠ measured value." The TIGHTENED DEFINITION resolves the flag: under "decision-relevant falsified prediction — an estimate acted upon that proved wrong," the shape IS premise-vs-actual: the estimate was the PREMISE about cost/scope; measurement revealed it false; the falsification forced a decision-change. That epistemic shape — wrong premise about reality caught by independent verification — is the SAME as §3.4.1-3 sub-classes (the falsified premise happens to be a prediction rather than a static claim about existence, but the shape is the same). §3.4.4 stays in §3.4 as sub-class 4; no §3.6 standalone needed.

---

## 3.5 — Phase 1 STOP sub-disciplines (4 sub-disciplines) [CANON framework; PROV individual sub-disciplines except A]

**Framework status: CANONIZED.** The "Phase 1 STOP has sub-disciplines" framework is mature. INDIVIDUAL sub-discipline maturity varies:

| Sub-discipline | Tier | Instances | What it audits |
|---|---|---|---|
| **A — §3.4 spec-premise falsification** | [CANON] | 4+ instances across M10/M11 | "Was the spec premise correct?" |
| **B — Design-vs-current-reality reconciliation** | [PROV] | M11 Phase B (M1 design-vs-conventions audit) | "Does prior design align with current conventions?" |
| **C — Capture-forward-without-migration** | [PROV] | M11 Phase C (M2 rate-push revert; JSONB payload extension instead of new table) | "Is the data already computed and just discarded?" |
| **D — HARD-FLOOR adversarial-regression** | [CANON] | 2 cross-domain instances (M11 Phase D M4 data-isolation + M12 Phase B J3 output-quality) — cross-domain shape-difference (one-sided isolation-probe vs two-sided judge-probe) STRENGTHENS canonization beyond identical-instance evidence | "Does the substrate IGNORE adversarial input where solo-invisible failure is production-expensive?" |

**Discipline pattern:** every Phase 1 STOP for a TIER 1 item should consider which sub-disciplines apply. A always applies (audit the spec); B/C/D apply per the auditable axis present. Multiple can stack.

### 3.5.X — Tier rationale + facet-listing discipline (operator msg 3450)

**Why parent CANON + children PROV:** the parent (§3.5 framework + §3.5.A umbrella) is [CANON] because "always verify against reality before authoring" is PROVEN — it fired 4+ times in 4 different shapes across M10+M11. The specific named shapes under the umbrella (B design-vs-current-reality, C capture-forward-without-migration, D HARD-FLOOR adversarial-regression) each fired ONCE; that's evidence of the pattern but NOT of the named-shape's durability as a convention. CANON = umbrella; PROV = each named shape. This is not timidity — it's recognizing the difference between "umbrella discipline is proven" and "this specific flavor is a durable named convention."

**Sub-discipline B/C/D promotion paths (per operator-set gates):**

- **B (design-vs-current-reality):** promotes to [CANON] when an INDEPENDENT 2nd instance appears (any future milestone).

- **C (capture-forward-without-migration):** promotes to [CANON] when an INDEPENDENT 2nd instance appears. **NOT gated on J3** — J3 is a runtime consumer wiring (not a "data computed-then-discarded" situation); speculative to gate promotion on it. **CROSS-REFERENCE WITH §6.20** — §3.5.C and §6.20 are the same M2 insight wearing two hats: investigation-facet (when does this STOP discipline fire?) ↔ convention-facet (how do you ship without migration?). ONE data point, NOT TWO. Facet-listing must not manufacture two-instance illusion for promotion. Both promote together when a single genuinely independent capture-forward case appears.

- **D (HARD-FLOOR adversarial-regression):** **PROMOTED to [CANON]** at M12 Phase C v2.8 finalize (operator msg 3467 Q1 sign-off; D54). 2 instances cross-domain:
  - **1st (M11 Phase D M4 memory-export):** DATA-ISOLATION domain; ONE-SIDED isolation-probe — 4 adversarial client-supplied hostId param-name variants test that the route IGNORES the input + scopes to authed user. The probe is one-sided because the failure mode is unidirectional (cross-host leak).
  - **2nd (M12 Phase B J3 ensure-verb-chain):** OUTPUT-QUALITY domain; TWO-SIDED judge-probe — 4 false-pass variants (judge must catch abstract-object pairing) × 3 false-positive angles (judge must NOT block concrete-object pairing or no-verb cases). The probe is two-sided because the failure mode is bidirectional (a useless judge that fails-open AND a useless judge that blocks everything are both broken).
  - **Strengthening factor (operator framing msg 3467):** cross-domain generalization PLUS different adversarial-shapes (one-sided vs two-sided) — STRONGER canonization evidence than two identical-shape instances. The SAME discipline ("ignore-the-trick" + "catch-both-failure-directions") expressed in domain-appropriate shape. Eliminates same-shape-clustering risk.

---

# Section 4 — Apply-before-writing-code discipline

## 4.2 — Apply-before-writing-code BOTH HALVES (AMENDMENT) [CANON framework; verify-presence sub-class [PROV]]

**Framework status: CANONIZED.** The discipline now has BOTH HALVES of the verify-vs-apply taxonomy with concrete examples.

### 4.2.1 — Verify-absence (no-op-on-applied-state) [CANON]

**Definition:** Applies that are EXPECTED to be no-op against current state because the prior migration already exists (DROP IF EXISTS against already-absent, or DROP TABLE for backup-no-longer-needed).

**Verify shape:** after psql apply, confirm absence via information_schema (the column/table is GONE as expected; never came back; never existed in the first place).

**Instances (5):** M10 Phase C S7, Phase C S8, Phase D S7, Phase G H1; M11 Phase A item 2.

### 4.2.2 — Verify-presence (state-changing) [PROV] (NEW from v2.7)

**Definition:** Applies that CHANGE state — CREATE TABLE + RLS + POLICY in particular. The state-changing nature makes verification fundamentally different from verify-absence.

**Verify shape:** 3-part presence check after psql apply:
1. `information_schema.tables` — confirm table created
2. `pg_indexes` — confirm intended indexes created (not just pkey)
3. `pg_policies` + `pg_class.relrowsecurity = true` — confirm RLS-silent-failure guard (policy created AND row security enabled)

**Why 3-part:** RLS-enabled-no-policy locks the table to all non-service-role reads, indistinguishable from a clean apply at the table-existence level. The 3-part check exposes this G8-E3-class drift.

**Instances (1):** M11 Phase B M1 (CREATE TABLE host_action_patterns + RLS + select-own policy).

**Tier rationale (operator msg 3451):** single instance to date; pattern shape is clear from M11 Phase B's success (the RLS-silent-failure guard genuinely matters — high-impact catch).

**Phase C gate resolution (M12):** Phase B J3 build confirmed NO state-changing migration (Option A — generic LLM-judge runner + ensure-verb-chain stub activation; no judge-results host-scoped table needed; commit 987f7e8 ships no `supabase/migrations/` files). Conditional gate stays open for Phase D iii-vi rollout or any future state-changing apply.

**Promotion trigger:** Promotes to [CANON] when a 2nd state-changing apply with the 3-part presence-verify pattern (information_schema.tables + pg_indexes + pg_policies+relrowsecurity) appears — Phase D iii-vi rollout OR any future milestone CREATE TABLE + RLS + POLICY substrate. The gate is real-CREATE-contingent, not assumption-based.

### 4.2.3 — Discipline order [CANON]

For BOTH halves, the procedure is:
1. Author migration locally (not committed)
2. Apply to STAGING via psql
3. Verify per sub-class shape (absence or 3-part presence)
4. INSERT staging history record
5. Apply to PRODUCTION via psql
6. Verify per sub-class shape on production
7. INSERT production history record
8. THEN commit code

The "history before code" ordering is the load-bearing invariant.

---

# Section 6 — Operating pattern + sub-pattern codifications

## 6.16 — M3-outcome-3-family pattern [CANON]

**Definition:** Substrate-without-immediate-behavior-change pattern. A new column / table / capability ships in milestone N; the consumer engagement is gated on accumulated data OR explicit phase-N+1 work. Behavior at ship is "no immediate change; data starts accumulating for the consumer to engage later."

**Honest-count discipline:** capture instances ONLY when the substrate genuinely ships with no immediate behavior change. DON'T pad the count by including substrate that ships its consumer in the same milestone (that's standard incremental development).

**Instances (3):**
- M10 Phase C — `notifications.host_id` (column ships; display-on-presence; no immediate behavior change at write paths)
- M10 Phase D — `messages.envelope` (JSONB column ships; render-on-presence; no historical-row backfill)
- M11 Phase B — `host_action_patterns.*` (table ships + writer hooks; READ logic deferred to Phase 2+; zero behavior change in request-action.ts at v1)

**Honest-NOT-counted:** M11 Phase C M2 (capture + consumer in same milestone); M11 Phase D M4 (synchronous read+UI ship).

**Discipline value:** the pattern is a planning aid. When designing substrate, ask "will the consumer engage immediately or accumulate?" If accumulate → M3-family ship is fine; if immediate → standard scope.

---

## 6.17 — OPERATING PATTERN (speed-tiered + self-red-team + hard-floor + CONSULT FLAG) [LIVE]

**Status: ADOPTED AND LIVE.** This is a CODIFY-EXISTING — the pattern is in CLAUDE.md commit `f6a94a6` governing all item work since M11 Phase D. v2.8 captures the adopted reality into the conventions canon; **the pattern itself is the source-of-truth in CLAUDE.md.** If CLAUDE.md amends, this section amends.

### 6.17.1 — Speed tiers

**TIER 1** — subsystem-scale OR hard-floor item. Full Phase 1 STOP → /ultraplan if 5+ files / new subsystem / API+UI+DB → self-red-team → HALT for operator sign-off → ship → vault STOP note + §10 → close artifact + tag.

**TIER 2** — small (1-3 files, UI tweak, bug fix, tooling, dead-code, config; NOT hard-floor). State disposition in 2-3 lines → self-red-team → ship → one-paragraph note appended to phase file. NO standalone STOP, NO close artifact, NO tag, NO separate sign-off round.

### 6.17.2 — HARD FLOOR

Always TIER 1 regardless of file count:
- Cross-host data isolation
- Channex writes
- Auth/RLS

Any change where a solo-invisible bug is production-expensive.

### 6.17.3 — SELF-RED-TEAM (both tiers; mandatory pre-HALT/commit)

State the strongest case against your own recommendation and against your top two default answers. Revise if it survives; note why it fails if not. **This replaces routine outside review.**

### 6.17.4 — CONSULT FLAG

Raise explicitly when a decision is architecture-class, scope-gating, or genuinely uncertain — recommend the operator loop in the outside reviewer before proceeding. Otherwise proceed.

### 6.17.5 — Tier-discipline pairing with Phase 1 STOP sub-disciplines (§3.5)

TIER 1 items must consider §3.5 sub-disciplines (A/B/C/D) at their Phase 1 STOP. HARD-FLOOR items always engage sub-discipline D (adversarial regression).

---

## 6.18 — Worker-deploy 4-point attestation model [CANON]

**Definition:** Background worker (cron, scheduled task, etc.) deploy verification proceeds in 4 distinct attestation points, with Claude-Code-attestable vs operator-attestable boundary explicit.

**The 4 points** (per K1 model; M10 Phase E origin + M11 Phase A K1 Point 4 settlement):

1. **Deploy-green** — route + scheduler shipped; CI passes. **[Claude-Code-attestable]**
2. **Dashboard cron registration** — confirm the cron schedule is registered in the provider dashboard (Vercel Cron Logs, etc.). **[operator-attestable]**
3. **Handler invocation** — manual-vehicle endpoint returns 200 with expected summary payload (D49 manual vehicle pattern). **[Claude-Code-attestable]**
4. **Next-day fire** — confirm cron fired at scheduled time via Cron Logs glance. **[operator-attestable BY DESIGN]**

**Discipline value:** distinguishes what Claude Code can verify from what only the operator can attest. Prevents "deployed = working" assumption that misses Points 2 + 4.

---

## 6.19 — schema.ts preserve-and-append lineage sub-pattern [PROV]

**Definition:** When DROP-ing substrate that had a comment block in schema.ts noting its purpose, PRESERVE the comment + APPEND the drop disposition with cross-ref to the disposition commit. Preserves M9-vintage origin context + adds M10/M11-vintage drop trail. Reader can trace lineage back through milestones via schema.ts comments.

**Instance (1):** M10 Phase G H1 — schema.ts comment for the M9-Phase-G-E3 backup table updated with preserve-and-append lineage treatment (origin + M10 Phase G H1 drop disposition).

**Tier rationale:** single instance; pattern shape is clear (don't lose institutional trail when removing substrate).

**Promotion trigger:** Promotes to [CANON] when a 2nd lineage-preservation case during DROP appears — substrate is getting dropped + a schema.ts (or analogous) comment block preserves the origin context AND appends the drop disposition with cross-ref to the disposition commit.

---

## 6.20 — Capture-forward-without-migration sub-pattern [PROV]

**Definition:** When a deferred capability item is identified, ask "is the data already computed and discarded, or genuinely never captured?" If the first case → capture-forward via application-layer extension (JSONB payload, new audit context fields) WITHOUT a schema migration. If the second case → standard substrate-authoring with migration.

**Instance (1):** M11 Phase C M2 (rate-push revert) — pricing/apply already computed SafeRestrictionPlan.rate_changes[].from but discarded after push. M2 captured forward into `agent_audit_log.payload.prior_state[]` via JSONB extension (no migration). 4/5 ultraplan boxes ticked instead of all 5.

**Tier rationale (operator msg 3450):** single instance — same M2 insight as §3.5.C wearing the convention-facet hat (vs §3.5.C's investigation-facet hat). ONE data point, NOT TWO; facet-listing must not double-count for promotion. Pattern shape is high-value but instance-thin. Promotion to [CANON] requires a genuinely INDEPENDENT capture-forward case in any future milestone — **NOT gated on J3** (J3 is a runtime consumer wiring, not a data-discard situation; speculative to gate promotion on it). **CROSS-REFERENCE WITH §3.5.C** — both promote together when the independent 2nd instance appears.

**Promotion trigger:** Promotes TOGETHER with §3.5.C (facet-pair single-instance discipline; ONE data point NOT TWO). Triggers when a single genuinely INDEPENDENT capture-forward case appears — a deferred capability item where the data is already computed but discarded, captured-forward via application-layer extension (JSONB payload, audit-context field) WITHOUT a schema migration. See §3.5.C trigger.

---

## 6.21 — J3 LLM-judge fail-open binding contract [LIVE]

**Status: ADOPTED AND LIVE.** CLAUDE.md commit `725f2f8` Known Gaps section:

> "This default [J3 LLM-judge fail-open INFRASTRUCTURE-ERROR behavior] is VALID ONLY while host-approval gates the send path."

**Codification path (operator msg 3467 Q7 sign-off; register-symmetric with §6.17 OPERATING PATTERN [LIVE]):**

Fail-open on Haiku-classifier infrastructure errors (timeouts, 5xx, network, parse failures) is the safe runtime default for the generic LLM-judge runner backing J3 ONLY while the architecture has a host-approval gate between draft and send. If ANY call-site activates auto-send (messaging_executor; auto-approve UI mode), the FAIL-OPEN INFRASTRUCTURE-ERROR default MUST flip to fail-closed-or-stricter at that call-site BEFORE auto-send goes live. Without the flip, the judge becomes the only gate between bad output and the guest, and FAIL-OPEN becomes dangerous.

**Substrate already in place for the flip (Phase B M12 ship):**
- `JudgePolicyOverride.fail_mode_override?: Partial<Record<JudgeId, "annotate" | "block">>` — `src/lib/agent/judge/apply-output-judges.ts:59`. Field reserved; type signature stable. Activates when any call-site flips a judge to fail-closed; the override hook is substrate-for-the-contract.

**Reading convention (register-symmetric with §6.17):** the source-of-truth is CLAUDE.md Known Gaps J3 binding contract. If CLAUDE.md amends, this section amends. v2.8 captures the adopted reality into conventions canon.

---

# Section 7 — G8 dataset + carry-forward discipline

## 7.7 — Substrate-without-roadmap-commitment disposition discipline (AMENDMENT) [CANON]

**Definition (extended):** Substrate that ships without a consumer roadmap commitment (no plan for the data to be used) accumulates as carry-forward debt. v2.8 names the disposition taxonomy explicitly.

### 7.7.1 — Disposition options [CANON]

When a substrate-without-roadmap-commitment item surfaces:

1. **DELETE** — full removal of substrate + any cascading orphans (catalog entries, tests, docs). Use when: NO consumer planned + zero existing dependents + the framing-doc explicitly says "delete" (e.g. REVIEWS_BLUEPRINT.md §9.5 framing).

2. **REAPPLY** — apply the substrate properly + build the missing consumer in the same milestone. Use when: a consumer IS planned for this milestone + the half-built substrate is closer to ship than start-over.

3. **CASCADE-DELETE** — DELETE + full audit of dependents (functions called only by the dropped code + their tests + catalog entries + doc references). Use when: DELETE but the substrate had orphan satellites that should NOT survive alone.

### 7.7.2 — Q7 verify-before-vault discipline pairing [CANON]

Cascade-delete dispositions REQUIRE a verify-before-vault gate (Q7 from M11 Phase A item 3 disposition). The cascade extent is often not fully visible until tsc/test surfaces dependents — verify pre-commit.

### 7.7.3 — Instances

- M11 Phase A item 2 — §7.7 #5 (original_draft_text columns): DELETE via idempotent DROP COLUMN IF EXISTS migration (5th apply-before-writing-code instance + 1st on M11 timeline)
- M11 Phase A item 3 — §7.7 #6 (/api/reviews/generate/[bookingId] dead-code): CASCADE-DELETE (route + generator function + calculatePublishTime + tests + sufficiency-catalog Site 2 + docs; Q7 verify surfaced +1 file mid-substrate)

Pattern is mature with 2 dispositions of different sub-shapes (DELETE + CASCADE-DELETE) — register CANON.

---

## 7.10 (f) — Dual-canonical content-fidelity (PAIRED-IDENTICAL-SUBSTRING construction) (AMENDMENT) [CANON]

**Definition (extended from v2.7):** Paired-identical-substring-edit construction for vault canonical + repo mirror.

### 7.10 (f).1 — The construction guarantee [CANON]

Use `patch_note` (vault) + `Edit` (repo) with IDENTICAL old/new strings. Character-identical substantive prose by construction — not by post-hoc diff. Format-only deltas (frontmatter / wikilinks / Related section) live as audience-split per §8.2.

### 7.10 (f).2 — Live firings

4 to date:
- M10 Phase G S5/S6 — voice doctrine paired-edit (1st live; precedent)
- M10 Phase H STEP 3 — M10-close.md vault + M10-report.md repo (2nd live)
- M11-close — M11-close.md vault + M11-report.md repo (3rd live)
- M12 Phase C v2.8 finalize — 2026-05-25-m12-conventions.md vault + agent-loop-v1-milestone-12-conventions.md repo (4th live; this ship)

### 7.10 (f).3 — Tier promotion

4 live firings; remains [CANON] (promotion was at 3 live firings). The discipline is mature and reusable for any future dual-canonical content-fidelity ship.

---

# Section Y (provisional placement; final ordering TBD)

## Y.1 — Tooling-reliability observation [LIVE]

**Status: ADOPTED AND LIVE.** CLAUDE.md Code Rules commit `0eb4c87`:

> "Verify foundational edits via grep, don't trust Edit success messages."

**Codification path (operator msg 3451 — STANDALONE; do NOT fold into §3.4):**

Tooling-reliability stays STANDALONE — does NOT promote to §3.4 as a 5th sub-class even though additional instances may surface during M12. The reasoning is REGISTER, not instance count:

- §3.4 is a **DESCRIPTIVE TAXONOMY** of falsification types observed in the work — evidence-tiered [CANON]/[PROV] structure documenting "what kinds of premise-vs-reality misses happen."
- Tooling-reliability is a **PRESCRIPTIVE OPERATING RULE** — [LIVE] in CLAUDE.md Code Rules: "grep-verify edits before trusting Edit success messages." It tells you what to DO, not what was observed.

Merging a prescriptive [LIVE] rule into an evidence-tiered descriptive taxonomy would mix three tiers ([CANON]/[PROV]/[LIVE]) inside one §3.4 and muddy what the taxonomy is for. Keep tooling-reliability as its own thing; cross-reference the shared epistemic shape from §3.4 (see the §3.4 cross-ref note); let §3.4 stay a CLEAN 4-sub-class evidence-tiered structure rather than a 5-class mixed-register one.

---

# Section 8 — Audience-split (vault vs repo)

## 8.2 — Audience-split discipline (inherited from v2.7) [CANON]

Per v2.7 §8.2 — vault canonical has frontmatter + `[[wikilinks]]` + `## Related` section; repo mirror omits these as audience-split. Substantive content paired-identical per §7.10 (f).

---

# Section 9 — Resolved open items + carry-forward to v2.9

## 9.1 — J3-tied amendments — RESOLVED at Phase C v2.8 finalize

The following sections were Phase A placeholders awaiting J3-implementation evidence; resolution at Phase C lock:

- **§3.5.D HARD-FLOOR adversarial-regression promotion** — RESOLVED: PROMOTED to [CANON] (D54). 2 cross-domain instances (M4 data-isolation + J3 output-quality); cross-domain shape-difference strengthens canonization. See §3.5 + §3.5.X.
- **§4.2.2 verify-presence promotion** — RESOLVED: STAYS [PROV]. Phase B Option A shipped no migration (no judge-results host-scoped table). Conditional gate remains real-CREATE-contingent for Phase D iii-vi rollout or future state-changing applies.
- **§6.21 J3 fail-open binding contract [LIVE]** — ADDED (D56). Register-symmetric with §6.17 OPERATING PATTERN. Source-of-truth in CLAUDE.md `725f2f8` Known Gaps; per-call-site override hook substrate-for-the-contract at `src/lib/agent/judge/apply-output-judges.ts:59`.

## 9.2 — Carry-forward to v2.9

- **§6.9 sub-items iii-vi codification** — DEFERRED to Phase D rollout per per-stub activation cadence. Each sub-stub iii-vi consumes the established generic-runner + ensure-verb-chain-template pattern; v2.9 will codify the iii-vi-rollout patterns naturally with mature multi-stub evidence.
- **DeferredAntiPatternStub `runtime_active + judge_id` extension** — Phase B fold-back scan identified as observation-worthy but instance-thin (single use at deferred_5_6_ensure_verb_chain transition). Defer codification to v2.9 with iii-vi rollout evidence per the anti-corruption discipline (avoid scope-driven codification from single instance).
- **3-level production-migration-parity check** — M10 Phase E origin; NOT applicable in Phase B (no migration shipped); codify if Phase D iii-vi rollout or any future milestone produces an applicable instance.

---

# Section 10 — References

**Vault canonical:**
- This document — `decisions/2026-05-25-m12-conventions.md`
- `milestones/M11/M11-close.md` §9 — M12 inheritance source
- `decisions/2026-05-19-m10-conventions.md` — v2.7 inheritance source
- `milestones/M12/M12-inheritance-inventory.md` — M12 open snapshot

**Repo:**
- `docs/architecture/agent-loop-v1-milestone-11-report.md` — M11 close mirror (v2.8 evidence source)
- `docs/architecture/agent-loop-v1-milestone-10-conventions.md` — v2.7 mirror

**Method grounding:**
- `method/koast-method.md` · `method/koast-method-in-code.md` · `method/voice-doctrine.md`

**OPERATING PATTERN source:**
- `CLAUDE.md` commit `f6a94a6` — speed-tiered + self-red-team + hard-floor + CONSULT FLAG (LIVE)
- `CLAUDE.md` commit `0eb4c87` — tooling-reliability guard (LIVE)

---

*End conventions, v2.8.*
