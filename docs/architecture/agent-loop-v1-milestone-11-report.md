# Agent Loop v1 — Milestone 11 Report (Repo Mirror)

> Repo developer-facing mirror of vault canonical `milestones/M11/M11-close.md`. Substantive content identical with expected formatting transformations per §6.13 (vault frontmatter stripped; wikilinks rendered as plain prose refs; `## Related` section omitted as audience-split per §8.2).

# M11 close — agent-loop v1 milestone 11 (Cluster M COMPLETE)

**Status:** Closed (pending two-tag push at CLOSE STEP 4 per §6.14 + D38 — `m11-phase-d-close` already on remote; `m11-close` waits on operator sign-off).
**Tags:** `m11-phase-d-close` + `m11-close` → final repo-mirror commit (CLOSE STEP 4 anchor; per §6.14 + D38).
**Conventions:** v2.7 inherited UNCHANGED from M10 (no new conventions doc this milestone; v2.8 NOT drafted per Trap 5; v2.8 timing now ripe for M12 alongside J3 LLM-judge runtime per v2.7 §1.1).
**Test trajectory:** M10 close `739` → M11 close `780` passing, 8 skipped (unchanged across milestone). Net +41.
**Date range:** 2026-05-24 (M11 open + Phase A kickoff) → 2026-05-25 (Phase D close).
**Total milestone deliverables:** 4 phases A-D (single substantive item per phase B-D; 5 items in Phase A hygiene batch); 4 per-phase tags; 0 new D-numbers; 4 §3.4 sub-classes; **Cluster M COMPLETE.**

---

## 1. M11 scope

M11 opened on M10-close.md §9 inheritance inventory: 13 deferred items + K1 Point 4 settlement + PRE-CONDITION external-event-gated landmine. M11 ran 4 phases A-D under v2.7 inherited conventions; closed 9 items via shipped substrate (8 in inventory + K1 Point 4); 5 J3-runtime-tied or Mode-1-blocked items remain for M12.

The headline arc: **Cluster M completion.** All 4 deferred Cluster M items (M1+M2+M3+M4) have now shipped across M10+M11. The backlog carried since M2 design → M4 → M9 → M10 → M11 is empty.

---

## 2. SHAPE 2 final accounting (Phase A hygiene batch + B/C/D single-item substrate)

| Phase | Items | Final state |
|---|---|---|
| **A — institutional-open + hygiene batch** | 5 items: PRE-CONDITION extraction-worker host-filter; §7.7 #5 migration disposition; §7.7 #6 dead-code disposition + cascade; H4 gh CLI upgrade; H6 Husky pre-commit | All 5 SHIPPED; PRE-CONDITION production-verified live |
| **B — Cluster M substrate** | M1: F8 host_action_patterns | SHIPPED Phase B (longest-carried calibration substrate; M2 design → M11 Phase B) |
| **C — Cluster M substrate** | M2: rate-push revert (D17d) | SHIPPED Phase C; D17d v1.1 hedge lifted after 3 milestones of deferral |
| **D — Cluster M substrate** | M4: memory export (M8 C13 R-5) | SHIPPED Phase D; M8 C13 binding-copy commitment delivered |

**SHAPE 2 atomic count: 8 items shipped this milestone + 1 operator-attested K1 Point 4 close = 9 deliverables.** No partial-shipment discrepancies.

---

## 3. Per-phase summary (§6.15 — cross-ref, do not re-expand)

| Phase | Tag | Anchor commit | Key deliverable | Vault note |
|---|---|---|---|---|
| **A — institutional-open** | `m11-phase-a-close` | `6ad626d` | 5/5 hygiene-batch items; §3.4 4-sub-class taxonomy expansion via Issue #1+#2 dispositions; K1 Point 4 closed | `milestones/M11/items/phase-a.md` |
| **B — M1 host_action_patterns** | `m11-phase-b-close` | `bec8d79` | F8 calibration substrate (6 files; +548 lines); first verify-presence apply-before-writing-code instance; 3rd M3-outcome-3-family | `milestones/M11/items/phase-b.md` |
| **C — M2 rate-push revert** | `m11-phase-c-close` | `1ac7ad5` | D17d v1.1 hedge lifted (11 files; +1588 lines); capture-forward-without-migration sub-discipline; +2 follow-ups (guard drop + tooling-reliability CLAUDE.md elevation) | `milestones/M11/items/phase-c.md` |
| **D — M4 memory export** | `m11-phase-d-close` | `2953325` | M8 C13 R-5 kept-promise (5 files; +678 lines); HARD-FLOOR adversarial-regression sub-discipline (4 adversarial test cases); CLUSTER M COMPLETE | `milestones/M11/items/phase-d.md` |

§6.15 inheritance-by-reference observed — full per-phase context lives in the linked vault notes; this close rolls up dispositions without re-expanding.

---

## 4. Decision set (D-numbers)

**M11 LOCKED ZERO NEW D-NUMBERS.** v2.7 (D32-D51) carried unchanged. M11 was Cluster M execution under inherited conventions; the conventions weren't re-opened. v2.8 drafting deferred to M12 alongside J3 LLM-judge runtime per v2.7 §1.1 timing-tie.

D-set stays at D51 (M10's last). The OPERATING PATTERN (CLAUDE.md commit f6a94a6) is process discipline, not a numbered architectural decision — codified inline at CLAUDE.md, candidate for v2.8 §-amendment.

---

## 5. §3.4 taxonomy + institutional observations

M11 expanded the §3.4 spec-premise-falsification taxonomy from M10's 4 instances / 2 sub-classes to **5+ instances / 4 sub-classes**:

| Sub-class | M10 | M11 contributions | Description |
|---|---|---|---|
| **Substrate-level** | 3 (Phase D S2 + G8-E1 + G8-E2) | +1 (Phase A item 3 Q7 cascade catch — sufficiency-catalog.test.ts +1-file surfaced as tsc compile-error at verify-before-vault gate; substrate-cascade-symmetry observation) | Shipped code's behavior diverged from spec premise |
| **Plan-level** | 1 (M10 Phase F scope pre-executed) | — | Phase plan assumed work that was already done |
| **Spec-level** NEW | — | 1 (Phase A item 4 — H4 carry-forward characterization "scope refresh" but reality was CLI version 2.4.0 → 2.92.0) | Carry-forward inventory's spec premise itself wrong |
| **Estimate-vs-measurement** NEW | — | 2+ (Phase A item 5 Path A ~35-45s estimate vs 145s measured + Path D ~35-45s warm estimate vs 115s measured; Phase C item 1 +24 tests vs Q12 +15-20 estimate; Phase D item 1 +15 tests vs Q13 +8-12 estimate — all strictly more coverage, not regressions) | Pre-implementation estimates falsified by measurement |

Plus separate institutional contributions:
- **OPERATING PATTERN** (CLAUDE.md commit f6a94a6) — speed-tiered + self-red-team + hard-floor + CONSULT FLAG; process artifact validated as "working as designed" at operator msg 3436
- **Tooling-reliability observation** — silent Edit no-op surfaced Phase C item 1; elevated to CLAUDE.md Code Rules as cross-session guard (commit 0eb4c87)
- **Auto-apply / host-revert forward-contract** — recorded in CLAUDE.md Known Gaps for post-M11 auto-apply ship (the $250-on-reverted-$200 example)

---

## 6. Apply-discipline taxonomy (BOTH HALVES COMPLETE)

M11 completed the apply-before-writing-code taxonomy that M10 started:

| Sub-class | Total instances | M11 contributions |
|---|---|---|
| **Verify-absence** (DROP IF EXISTS no-op-on-applied-state) | 5 | +1 (Phase A item 2: drop original_draft_text phantom columns) |
| **Verify-presence** (CREATE TABLE state-changing) NEW | 1 | +1 (Phase B item 1: CREATE TABLE host_action_patterns + RLS + policy + 3-part presence verify per RLS-silent-failure guard) |

**Both halves of the taxonomy now have concrete examples with their respective verify shapes.** Phase B's 3-part verify (information_schema.tables + pg_indexes + pg_policies+relrowsecurity) is the M11-introduced discipline-extension for state-changing applies. v2.8 §4.2 amendment candidate.

No 7th apply-before-writing-code instance this milestone (M2's payload extension was application-level JSONB; M4's export had no migration).

---

## 7. M3-outcome-3-family pattern + 4 Phase 1 STOP sub-disciplines

**M3-outcome-3-family pattern — 3 instances (honestly counted):**

| # | Locus | Behavior at ship |
|---|---|---|
| 1 (M10 Phase C M3) | `notifications.host_id` | display-on-presence; no immediate write-path change |
| 2 (M10 Phase D S3) | `messages.envelope` | render-on-presence; no historical-row backfill |
| 3 (M11 Phase B item 1) | `host_action_patterns.*` | zero behavior change in request-action.ts; data accumulates as artifacts terminal-resolve |

**M2 NOT counted as 4th** — M2's capture-side + consumer-side shipped in same milestone; standard incremental development. M4 NOT counted — synchronous read+UI ship.

**4 Phase 1 STOP sub-disciplines accumulated across M11:**

| Phase | Sub-discipline | Discipline locus |
|---|---|---|
| A | §3.4 spec-premise falsification | "Was the spec premise correct?" |
| B | Design-vs-current-reality reconciliation | "Does prior design align with current conventions?" |
| C | Capture-forward-without-migration | "Is the data already computed and just discarded?" |
| **D** | **HARD-FLOOR adversarial regression** | **"Does the route IGNORE adversarial client input on a hard-floor field?"** |

Each is a Phase 1 STOP sub-discipline reusable across future milestones.

---

## 8. CLUSTER M COMPLETION (the headline)

The Cluster M backlog has been carried since M2 design (agent-loop v1 design.md §7.3 + companion). M2 conventions deferred it. M9 conventions deferred to M10. M10 shipped M3 (notifications.host_id) at Phase C. M11 shipped the remaining three across Phases B/C/D.

| Cluster M item | Disposition | Shipped | Substrate commit |
|---|---|---|---|
| **M1** F8 host_action_patterns | Calibration substrate + writer integration | M11 Phase B | `bec8d79` |
| **M2** Rate-push revert (D17d v1.1 hedge) | Audit-row-driven undo + UI revert button | M11 Phase C | `1ac7ad5` |
| **M3** `notifications.host_id` | Column + audit-feed source + chip rename | M10 Phase C (D44 first-M-item) | (M10) |
| **M4** Memory export (M8 C13 R-5) | Dedicated endpoint + UI button | M11 Phase D | `2953325` |

**Cluster M backlog: EMPTY.** The 5 remaining inherited items are all J3-runtime-tied or Mode-1-blocked.

---

## 9. v2.8 / M12 INHERITANCE INVENTORY (load-bearing M12-open source)

**Equivalent of M10-close.md §9.** M12 opens by reading THIS section, the way M11 opened by reading M10-close §9.

### 9.1 — Conventions basis for M12

v2.7 inherited UNCHANGED throughout M11 (Trap 5 held). **v2.8 timing is now ripe** — v2.7 §1.1 verbatim:
> "Final M10 conventions revision likely lands as v2.8 alongside Phase F deferrals iii-vi LLM judge work."

J3 LLM-judge runtime IS the v2.8 trigger. M12 centerpiece = J3 runtime + concurrent v2.8 drafting.

### 9.2 — v2.8 EVIDENCE BASE (accumulated this milestone; NOT drafted)

| Track | M10 state at close | M11 state at close | M12 drafting input |
|---|---|---|---|
| §3.4 taxonomy | 4 instances / 2 sub-classes (substrate ×3 + plan ×1) | 5+ instances / 4 sub-classes (added spec-level + estimate-vs-measurement) | §3.4 amendment with full 4-sub-class taxonomy + concrete examples per sub-class |
| Apply-discipline taxonomy | 4 instances / 1 sub-class (all verify-absence) | 6 instances / 2 sub-classes (verify-absence ×5 + verify-presence ×1) | §4.2 amendment with state-changing 3-part verify (information_schema.tables + pg_indexes + pg_policies+relrowsecurity) |
| M3-outcome-3-family | 2 instances | 3 instances (substrate-without-immediate-behavior-change pattern reinforced) | §6.X codification with 3-instance evidence |
| Phase 1 STOP sub-disciplines | 1 (§3.4 falsification) | 4 (A/B/C/D) | §3.X amendment formalizing the 4 sub-discipline taxonomy |
| OPERATING PATTERN | n/a | Process artifact in CLAUDE.md (speed-tiered + self-red-team + hard-floor + CONSULT FLAG) | §-amendment candidate codifying TIER framing + hard-floor enumeration + self-red-team replacement of routine outside review |
| Tooling-reliability observation | n/a | Edit success ≠ proof of file change (CLAUDE.md Code Rules) | §3.4 sub-class candidate (5th: tooling-reliability) OR standalone CLAUDE.md note |

### 9.3 — DEFERRED WORK inventory (5 items remain; all J3-runtime or Mode-1 tied)

| # | Item | Status post-M11 | M12 disposition |
|---|---|---|---|
| 7 | **J3 LLM-judge runtime (D34 vi)** | PENDING; substrate exists at M10 Phase C; runtime consumer deferred | **M12 centerpiece** (v2.8 trigger) |
| 8 | LLM judge sub-items iii-vi (§6.9 ensure-verb-chain + §5.7/5.8/5.9 contextual + voice-doctrine self-scan + constitution prompts self-scan) | PENDING; J3-runtime-tied | M12 alongside J3 runtime |
| 11 | H7 Sentinel pattern (`// koast-voice-allow: <id>`) | PENDING; J3-blocked | Unblocks when J3 runtime ships |
| 12 | H8 Citation-section marker (`[[cite: ...]]`) | PENDING; conditional defer (reconsider only if structural bifurcation insufficient) | Likely defer further |
| 13 | H9 E1(a) cron for guaranteed silent-complete | PENDING; Mode-1-blocked (depends on Mode 1 generative voice product requirement) | Inherits to M13+ unless Mode 1 ships in M12 |

**Closed in M11 (for institutional record; do not re-process):**
- ✓ PRE-CONDITION extraction-worker host-filter — Phase A item 1 (production-verified live)
- ✓ §7.7 #5 (original_draft_text migration disposition) — Phase A item 2
- ✓ §7.7 #6 (dead-code disposition + cascade) — Phase A item 3
- ✓ H4 gh CLI scope refresh (resolved as version upgrade per §3.4 spec-level falsification) — Phase A item 4
- ✓ H6 Husky pre-commit — Phase A item 5
- ✓ M1 F8 host_action_patterns — Phase B
- ✓ M2 rate-push revert (D17d v1.1 lifted) — Phase C
- ✓ M4 memory export (M8 C13 R-5 kept promise) — Phase D
- ✓ K1 Point 4 cron-fire attestation — Phase A close (operator-attested @ 02:55 UTC, triple-purpose with item 1 verification)

### 9.4 — M12 first-step suggestions (advisory only)

When M12 opens, the operator likely does what they did for M11:
1. Read M11-close.md §9 (this section)
2. Author M12-inheritance-inventory.md
3. Propose M12 phase plan
4. Sign off

Anticipated M12 Phase A scope: J3 LLM-judge runtime + v2.8 conventions drafting in parallel. v2.8 conventions drafting consumes the §9.2 evidence base.

---

## 10. References (§6.15)

**Vault canonical:**
- `decisions/2026-05-19-m10-conventions.md` — v2.7 (inherited basis; M10 canonical)
- `milestones/M11/items/phase-{a,b,c,d}.md` — 4 per-phase close notes
- `milestones/M11/items/phase-{a..d}-phase-1-stop.md` + variants — per-phase STOPs (mixed file names; see per-phase notes)
- `milestones/M11/M11-inheritance-inventory.md` — M11 open snapshot
- `milestones/M11/items/phase-b-step-1-lead-determination.md` — Phase B lead-determination (M8 D17d hedge inert)

**Repo:**
- `docs/architecture/agent-loop-v1-milestone-11-report.md` — this artifact (paired-identical-substring construction per §6.13)
- Phase substrate commits: `7398180`+`9b83487`+`9364089`+`6ad626d` (Phase A items 1-5) + `bec8d79` (B) + `1ac7ad5`+`eabb3d2`+`0eb4c87` (C + follow-ups) + `2953325` (D) + `f6a94a6` (OPERATING PATTERN)

**M10 inheritance + precedent:**
- `milestones/M10/M10-close.md` — predecessor milestone-close (§9 inheritance inventory was M11's open source)
- `docs/architecture/agent-loop-v1-milestone-10-conventions.md` — v2.7 (inherited basis per §6.15)

**Method grounding:**
- `~/koast-vault/method/koast-method.md` · `~/koast-vault/method/koast-method-in-code.md` · `~/koast-vault/method/voice-doctrine.md`
- M8 C13 binding copy locus: `src/app/(dashboard)/koast/guide/memory/page.tsx:55-62` (now kept-promise via M4)
