# M10 Milestone Close — Report (Repo Mirror)

> Repo developer-facing mirror of vault canonical `milestones/M10/M10-close.md` (vault commit `97d3ad5`). Content identical modulo wikilink → prose-form transformations + omission of vault-side YAML frontmatter and Related-section wikilink graph-connectivity. Vault is the institutional canonical; this repo mirror is the developer-facing artifact per v2.7 §6.13 + §7.10 (f) dual-canonical fidelity discipline (second live (f) firing in M10 after Phase G S5/S6 doctrine pair). Audience-split per §8.2.

# M10 close — agent-loop v1 milestone 10

**Status:** Closed (pending two-tag push at STEP 5).
**Tags:** `m10-phase-h-close` + `m10-close` → final repo-mirror commit (STEP 3 anchor; per §6.14 + D38).
**Conventions:** v2.7 dual-canonical at `decisions/2026-05-19-m10-conventions.md` (vault 032000c) + `docs/architecture/agent-loop-v1-milestone-10-conventions.md` (repo 240235b). v2.8 NOT shipped this milestone (Trap 5 held; batch inventoried §9; separate post-M10 pass per §1.1 timing tied to deferred J3 LLM-judge runtime).
**Test trajectory:** M9 close 665 → M10 close 739 passing, 8 skipped (3 integration env-gated; unchanged across M10). Net +74 passing.
**Date range:** 2026-05-19 (M10 kickoff conventions drafting) → 2026-05-24 (Phase H close).
**Total G8 catches:** 5 across Phases A-H (G8-A1, G8-B1, G8-E1, G8-E2-multi-layer, G8-E3). Institutional record at §5.
**M10 Phase H = milestone-close phase per §6.14 + D38** (Phase-final-is-milestone-close convention; M9 retroactive precedent, M10 first applied case).

---

## 1. M10 scope

M10 continued agent loop v1 past M9's substrate-honesty close with three interlocking work tracks (§1.1):
- Substrate extension (LLM judge layer J1+J2+J3; voice extraction worker scheduling K1; select Cluster M items)
- Slice 3 UI exposure (L1 generateDraft host trigger button)
- M9 institutional reconciliation (6 instances → §6.11-§6.14 codifications + §7.7-§7.10 amendments)

8 phases A-H per §1.4. Per-phase tag convention applied from Phase A onward (declared at SHAPE 2 lock). Phase H = milestone-close (§6.14 + D38 dual-duty).

---

## 2. SHAPE 2 final accounting (Clusters J/K/L/M/R/S/H/D per §1.3)

| Cluster | Items | Final state |
|---|---|---|
| **J — LLM judge substrate** | J1 (output-filter emoji policy) / J2 (llm-judge exclamation cap) / J3 (constitution-prompt registry) | SHIPPED Phase B (J1+J2) + Phase C (J3 substrate; LLM-judge runtime DEFERRED v2.8/M11 per D34 vi) |
| **K — Voice extraction substrate** | K1 (worker scheduling) | SHIPPED Phase E (Vercel Cron + shared handler + manual vehicle; 4-point attestation §8) |
| **L — Slice 3 UI** | L1 (generateDraft K-button) | SHIPPED Phase E (8a→8e excavation tail produced first live Phase D S8 render in production) |
| **M — M9-deferred candidates** | M1 / M2 / M3 / M4 | M3 SHIPPED Phase C (D44 first-M-item); M1 / M2 / M4 DEFERRED M11 with explicit reasoning (D43); Cluster M closed at Phase C, formalized Phase F |
| **R — Institutional reconciliations** | R1-R6 | Operationalized across v2.7 conventions ship (Phase A) + per-phase work |
| **S — Slice 3 carry-overs (M9 Phase G/H polish)** | S1-S6 | S1-S4 SHIPPED Phase D; S5 SHIPPED Phase G (D51); S6 SHIPPED Phase G (1-line M10-cycle note); doctrine class closed |
| **H — Hygiene** | H1-H9 | H1 SHIPPED Phase G (DROP backup; 4th apply-before-writing-code); H2 SHIPPED Phase G (GH Actions v4→v5); H3 inherited-resolved (Vercel CLI pre-installed Phase E side-effect); H5 inherited-resolved-N/A (pure-Drizzle; phase-c.md §9); H4/H6/H7/H8/H9 → M11 |
| **D — M10 architectural decisions** | D32-D51 (20 decisions) | Full set §4 |

**SHAPE 2 atomic count: 35 items per §1.3.** Final disposition: shipped + deferred-with-explicit-reasoning, no partial-shipment discrepancies.

---

## 3. Per-phase summary (§6.15 — cross-ref, do not re-expand)

| Phase | Tag | Anchor commit | Key deliverable | Vault note |
|---|---|---|---|---|
| **A — institutional-open** | `m10-phase-a-close` | `1c8cc37` | v2.7 dual-canonical ship + R1 vault/repo drift reconciliation + CLAUDE.md M10 pointer; SHAPE 2 lock | `phase-a.md` |
| **B — LLM judge J1+J2** | `m10-phase-b-close` | `0d5196e` | J1 emoji output-filter + J2 exclamation-cap LLM-judge; AgentTextOutput envelope substrate (Q3 inert pending Phase D UI) | `phase-b.md` |
| **C — J3 + M3** | `m10-phase-c-close` | `5952d61` | J3 constitution-prompt anti-pattern registry (substrate-only; runtime D34 vi → v2.8) + M3 notifications.host_id end-to-end (1st apply-before-writing-code exercise S7 + 2nd exercise S8) | `phase-c.md` |
| **D — Cluster S substrate UI** | `m10-phase-d-close` | `9bfb1af` | S1+S2 ReviewsSettingsModal hygiene + S3 D22 envelope end-to-end (3rd apply-before-writing-code S7 + S8 first live UI rendering; closed Phase B Q3) + S4 Memory tab voice section | `phase-d.md` |
| **E — K1 + L1** | `m10-phase-e-close` | `99a2feb` | K1 Vercel Cron + handler + manual vehicle (D48-D49) + L1 K-button (D50); 8a→8e excavation produced G8-E1/E2-multi-layer/E3 + first live Phase D S8 production render | `phase-e.md` |
| **F — Cluster M close formalization** | `m10-phase-f-close` | `99a2feb` (anchored on Phase E final; formalization-only, 0 substrate) | §1.4 scope pre-executed at Phase C (D43/D44); empty-ship phase close note; §3.4 plan-level falsification 4th instance | `phase-f.md` |
| **G — Doctrine S5/S6 + Hygiene H1/H2** | `m10-phase-g-close` | `52b46ea` | S5 §5 catalog scope clarification (D51) + S6 1-line M10-cycle note; first live §7.10 (f) in M10 (paired-identical-substring-edit construction guarantee); H1 backup DROP (4th apply-before-writing-code) + H2 Actions v4→v5 | `phase-g.md` |
| **H — milestone-close** | `m10-phase-h-close` + `m10-close` | STEP 3 final-mirror commit (TBD) | This artifact (vault) + repo mirror at `agent-loop-v1-milestone-10-report.md` (STEP 3, second live (f)); F7 honest-scope refresh on CLAUDE.md M10 pointer (STEP 4) | (this note; no separate phase-h.md per §6.14 + D38) |

---

## 4. Decision set D32-D51 (20 decisions)

| # | Decision | Phase |
|---|---|---|
| D32 | M10 SHAPE 2 cluster scheme — hybrid (cluster letters + cross-cutting tags) | Conventions §2 |
| D33 | Slice 3 UI scope — single-button (L1 generateDraft only) | Conventions §2 |
| D34 | LLM judge scope — partial §6.9 sub-items i+ii M10; iii-vi defer v2.8/M11 | Conventions §2 |
| D35 | PHASE_F_DEFER_TO_M10 8-stubs methodology — re-evaluate each at first M10 phase scope-setting | Conventions §2 |
| D36 | Per-phase tag asymmetry codification (M9 historical convention) | Conventions §2 |
| D37 | G8-G2 ambiguity disposition (M9 institutional record stays closed) | Conventions §2 |
| D38 | Phase-final-is-milestone-close convention (codified §6.14) | Conventions §2 |
| D39 | Dual-canonical content-fidelity verification discipline (both options: R1 hygiene + §6.13 codification) | Conventions §2 |
| D40 | Topnote-at-H1 sub-pattern (codified §6.11) | Conventions §2 |
| D41 | Milestone-conventions inheritance via reference (codified §6.15) | Conventions §2 |
| D42 | J2 substrate (hybrid count-prefilter + LLM-on-borderline; deterministic-only first) | Phase B |
| D43 | Cluster M dispositions (M3 ship Phase C; M1/M2/M4 defer M11 with explicit reasoning) | Phase C |
| D44 | First-M-item ship lock (M3 = notifications.host_id end-to-end) | Phase C |
| D45 | S3 envelope-display scope (C: confidence + judge_results; deferred 3 fields persisted not surfaced) | Phase D |
| D46 | S3 envelope persistence (nullable JSONB Option 1; M3-outcome-3-family 2nd instance) | Phase D |
| D47 | Cluster S dispositions (S1-S4 ship Phase D; S5/S6 doctrine-defer to Phase G) | Phase D |
| D48 | K1 voice-extraction scheduling — Vercel Cron over VPS systemd timer | Phase E |
| D49 | Ship manual-trigger /api/voice/extract (verifyServiceKey-only; D48 attestation vehicle) | Phase E |
| D50 | Slice 3 L1 K-button enable + wire to /api/messages/draft | Phase E |
| D51 | Voice doctrine §5 catalog scope = failure-mode-organized PRIMARY + per-surface sub-differentiation where surface context changes the answer | Phase G |

D-set frozen at D51. No new D-numbers opened at Phase H (milestone-close is roll-up + disposition per §6.14 + D38 + M9 precedent).

---

## 5. G8 institutional dataset (5 catches across 8 phases)

| Catch | Phase | Class | One-line summary |
|---|---|---|---|
| **G8-A1** | A | scope-shipped-by-codification (NEW sub-stratum candidate; v2.8) | v2.7 conventions ship + R1 reconciliation operationalized 5/6 Phase A SHAPE 2 items via the codifying commits themselves |
| **G8-B1** | B | ultraplan-mischaracterization | Phase B ultraplan §2.3 streaming-mischaracterization surfaced at design-review pre-ship |
| **G8-E1** | E | producer-divergence (status-VALUE) | /api/messages/draft wrote `draft_status="generated"`; all UI consumers gate on `"draft_pending_approval"`; messaging_executor.py was already correct. Unified producer-value at STEP 8a |
| **G8-E2** | E | persistence multi-layer (shape + silent-write + phantom-column) | /api/messages/draft (a) UPDATE-inbound vs INSERT-outbound shape divergence; (b) silent-200 on write failure (no .select+error); (c) phantom-column `original_draft_text` root cause. STEP 8c fix surfaced STEP 8d root cause |
| **G8-E3** | E | migration-application-integrity | `20260515220000_voice_substrate.sql` RECORDED-AND-PARTIALLY-APPLIED (history INSERT'd; ADD COLUMN never landed). Invisible to name-level parity. 4-writer phantom-column blast radius (1 user-visible bug + 3 latent including 1 dead code). STEP 8e strip resolution |

**Aggregate: 5 catches across 8 phases (A 1 + B 1 + C 0 + D 0 + E 3 + F 0 + G 0 + H pending close).** Phases C/D/F/G ran 0-catch — design-review pre-emption (Phase C STEP 4 caught 3 risk classes preemptively; Phase D STEP 4 caught 5 framing-class risks) and clean §3.4 verify-then-act (Phase G H1 production-existence re-check produced clean match) demonstrate the discipline value is observable in BOTH find-a-gap cases AND confirm-clean cases.

**Stratum distribution:** Pre-design (Phase 1 STOP) for G8-A1 + G8-B1; runtime-substrate-discovery (operator visual/error attestation past green CI) for G8-E1/E2/E3. M10 institutional pattern: green CI did NOT catch the persistence-layer chain (G8-E1→E2→E3); operator browser attestation at §7.10 (e) Vercel gate did. Phase E surface-failure guard at STEP 8c forced STEP 8d's root-cause excavation by turning silent-200 into loud-500 with diagnostic column-name.

---

## 6. Test trajectory + tag inventory

**Test trajectory (reconciled at STEP 2.1 — corrects STEP 1 readout 681 error):**

| Milestone/Phase | Passing | Skipped | Net Δ |
|---|---|---|---|
| M9 close | 665 | 5 | baseline |
| A close | 665 | 5 | +0 (vault-only institutional) |
| B close | 706 | 8 | +41 (+3 skip = 3 integration env-gated added) |
| C close | 720 | 8 | +14 |
| D close | 724 | 8 | +4 |
| E close | 739 | 8 | +15 |
| F close | 739 | 8 | +0 (formalization-only) |
| G close | 739 | 8 | +0 (doctrine + drop + CI-bump = no test delta by design) |

**M10 net: +74 passing across 7 substrate phases. 8 skipped (3 integration env-gated stable across milestone).**

**Tag inventory: 9 tags total** = 7 per-phase tags (m10-phase-{a..g}-close) + 2 milestone-close tags (m10-phase-h-close + m10-close). Both milestone-close tags anchor on the same final repo-mirror commit (STEP 3 — TBD) per §6.14 + D36 + M9 precedent (m9-phase-h-close + m9-close on 86604ce).

**Tag peel reconciliation (STEP 2.1 verified):**
- m10-phase-a-close → 1c8cc37
- m10-phase-b-close → 0d5196e
- m10-phase-c-close → 5952d61
- m10-phase-d-close → 9bfb1af
- m10-phase-e-close → 99a2feb (STEP 8e final substrate)
- m10-phase-f-close → 99a2feb (formalization-only; anchored on Phase E final substrate; no new commit per phase-close convention)
- m10-phase-g-close → 52b46ea (H2 final substrate)
- m10-phase-h-close + m10-close → STEP 3 final repo-mirror commit (anchored together per §6.14)

---

## 7. Institutional artifacts / precedents established this milestone

1. **4 apply-before-writing-code exercises** (production-as-staging G8-H6 topology). Production migration applied (psql) BEFORE writing-code commit lands. Loci: Phase C S7 (`notifications.host_id`); Phase C S8 (`unified_audit_feed_v2`); Phase D S7 (`messages.envelope`); Phase G H1 (`drop_review_rules_backup_phase_g`). Pattern: column/view add + immediate code that depends on it + per-env psql apply + history INSERT before code commit. v2.8 candidate (§9) codifies as a §4.2 amendment.

2. **First live §7.10 (f) firing + paired-identical-substring-edit construction guarantee** (Phase G S5/S6, a192865 vault + 3e7affa repo). Method: `patch_note` (vault) + `Edit` (repo) using IDENTICAL old/new strings → character-identical substantive prose by construction (stronger than post-hoc diff). Format-only residual byte delta (~227 bytes) accepted as audience-split per §8.2. Precedent for M11+ doctrine phases + second live (f) at Phase H STEP 3.

3. **§3.4 spec-premise-falsification — 4 instances with sub-class split** (substrate-level ×3: Phase D S2 envelope-not-persisted; G8-E1 internal-substrate-discovery pre-ship; G8-E2 runtime-substrate-discovery post-ship + PLAN-level ×1: Phase F scope pre-executed at Phase C). Codification candidate for v2.8 §3.4 amendment.

4. **§3.4 clean-attestation case** (Phase G H1 verify-then-act). The recorded-applied state DID match production reality (table present pre-drop, absent post-drop); G8-E3-class re-check at execution boundary produced clean attestation. Discipline value: visible in BOTH find-a-gap cases (G8-E1/E2/E3) AND confirm-clean cases (Phase G H1) — the check itself is the value, not finding a gap every time.

5. **schema.ts preserve-and-append lineage treatment** (Phase G H1 schema.ts:378-385). Comment block UPDATED (not removed wholesale) to preserve M9-E3 origin context + append M10-H1 disposition cross-ref. 1-line institutional trail an M11+ reader can trace from schema.ts back to both original creation + drop.

6. **First live Phase D S8 confidence envelope production render** (Phase E STEP 8e end-state; first end-to-end host-triggered Slice-1 traversal: inbound message → host clicks K → generator + J1 + J2 + envelope persistence + thread re-fetch + PendingDraftBubble with confidence label + judge_results StatusDot).

---

## 8. K1 4-point worker-deploy-attestation roll-up

| Point | What | Attestation status |
|---|---|---|
| 1 | Deploy-green (route + scheduler shipped; CI passes) | **CONFIRMED** [Claude Code] at Phase E STEP 6/7 commits |
| 2 | Vercel dashboard cron registration (`/api/cron/voice-extraction @ 0 5 * * *`) | **CONFIRMED** [operator, Vercel dashboard] post-Phase-E close |
| 3 | Handler-invocation `/api/voice/extract` → 200 `{hosts_processed:1, hosts_extracted:1, ...}` (D49 manual vehicle) | **CONFIRMED** [Claude Code] at Phase E STEP 7 curl attestation |
| 4 | Next-day cron fire ~05:00 UTC via Vercel Cron Logs | **OPERATOR-ATTESTABLE; PENDING as-of-authoring.** Note: Cron Logs live on vercel.com (dashboard), not reachable from app.koasthq.com-scoped browser session — Point 4 is operator-attestable BY DESIGN. Settles on operator Cron-Logs glance; M11 inheritance if still pending at close-tag-push. NOT a blocker for the milestone tag. |

3 of 4 points CONFIRMED in-milestone. Point 4 settles on next operator dashboard glance; not blocking close.

v2.8 candidate: codify the 4-point worker-deploy-attestation model as a §6.X amendment alongside the §7.10 phase-close multi-gate, with explicit Claude-Code-attestable vs operator-attestable columns.

---

## 9. v2.8 / M11 inheritance INVENTORY (Trap 5 STAYS — NOT drafted; handoff list)

### v2.8 conventions batch (separate post-M10 pass; timing-tied to deferred J3 LLM-judge runtime per D34 vi + §1.1)

Per Trap 5 + §1.1 framing, v2.8 conventions are NOT drafted at M10 milestone-close. The accumulated batch lives by cross-reference in the per-phase close notes:

- `milestones/M10/items/phase-c.md` §9 — apply-before-writing-code §4.2 amendment evidence (Phase C exercises 1+2); anticipatory-rename-after-substrate §6.X candidate; §6.12 INSERT-WITH-UNIQUE vs UPDATE-WITH-WHERE-GUARD sub-strata distinction; Supabase types regen N/A confirmation (closes H5)
- `milestones/M10/items/phase-d.md` §9 — M3-outcome-3-family pattern §6.X codification (notifications.host_id + messages.envelope; 2 instances + 3 apply-before-writing-code exercises); apply-before-writing-code §4.2 codification (3rd exercise reinforces case); deferred S3 fields display-extension; reviews UI envelope Slice (S3-c deferred); confidence-badge shared component; MemoryVoiceSection Method-honest evolution; listMemoryFacts shape evolution; frontend-design node-only-jest JSX-free extract pattern
- `milestones/M10/items/phase-e.md` §10 — 3-level production-migration-parity check (gated on G8-H6 production-as-staging); §3.4 spec-premise-falsification amendment 3-instance evidence (Phase D S2 + G8-E1 + G8-E2 sub-class split); §7.7 substrate-shipped-without-roadmap-commitment (original_draft_text columns + generate/[bookingId] route — both shipped speculatively + never plumbed to a consumer); M3-outcome-3-family pattern reinforcement; worker-deploy-attestation 4-point model; extraction-worker host-filter correctness landmine (pre-host-#2)
- `milestones/M10/items/phase-f.md` §6 — §3.4 spec-premise-falsification 4th instance with PLAN-level sub-class distinction (instances 1-3 substrate-level; instance 4 plan-level — phase plan assumed work remained after prior phase closed cluster)
- `milestones/M10/items/phase-g.md` §7 — first-live-(f) paired-identical-substring-edit sub-discipline (codification candidate alongside §7.10 (f) framework); §3.4 verify-then-act clean-attestation case (the discipline value is observable in both find-a-gap AND confirm-clean cases); schema.ts comment preserve-and-append lineage treatment sub-pattern (cousin of §6.11 topnote-at-H1)

**v2.8 headline candidates (1-line index; not drafted; sources above):** 3-level production-migration-parity check / §3.4 amendment 4-instance with substrate-level × plan-level sub-class split / §7.7 substrate-without-roadmap-commitment / first-(f) paired-edit sub-discipline / M3-outcome-3-family pattern §6.X / apply-before-writing-code §4.2 amendment / worker-deploy-attestation 4-point model / schema.ts preserve-and-append lineage sub-pattern.

### M11 deferred WORK inventory (distinct from v2.8 conventions)

- **Cluster M deferred** (D43 dispositions): M1 (F8 host_action_patterns); M2 (rate-push revert M8 D17d); M4 (memory export M8 C13 R-5)
- **§7.7 substrate-without-roadmap-commitment cleanup** (recorded Phase E STEP 8d-8e): `original_draft_text` columns never migrated to prod + zero readers + stripped from writers; `/api/reviews/generate/[bookingId]` dead-code route (zero callers); both candidates for full removal OR build-the-feature-properly disposition
- **extraction-worker host-filter correctness landmine** (Phase E §10 #6): `src/lib/voice/extraction-worker.ts:95-104` SELECTs ALL outbound messages without host_id filter; works at 1-host scale; silent-corruption-class for host #2 onward. **Fix BEFORE host #2 onboarding.** The one external-event-gated M11 item.
- **J3 LLM-judge runtime** (D34 vi defer): the runtime consumer for the J3 constitution-prompt anti-pattern registry (substrate shipped Phase C; consumer M11+)
- **LLM judge sub-items iii-vi** (§6.9 + D34): ensure-verb-chain heuristic; §5.7/5.8/5.9 contextual; voice-doctrine self-scan; constitution prompts self-scan
- **H4 gh CLI scope refresh** (operator-side; Phase G H4 disposition)
- **H6 Husky pre-commit** / **H7 Sentinel pattern** (dependency-bound on J3 v2.8 runtime) / **H8 Citation-section marker** / **H9 E1(a) cron** (dependency-bound on Mode 1 generative voice) — Phase G defer-with-explicit-reasoning
- **K1 Point 4** settlement if still pending at close-tag-push (operator Cron Logs glance)

---

## 10. References (§6.15)

**Vault canonical:**
- `decisions/2026-05-19-m10-conventions.md` — v2.7 (M10 canonical; vault 032000c). §1.3/§1.4/§3.4/§6.11-§6.15/§7.7/§7.8/§7.10(a)-(f)/§8.2; D32-D41 + D38 codification
- `milestones/M10/items/phase-{a,b,c,d,e,f,g}.md` — 7 per-phase close notes
- `milestones/M10/items/phase-{a,b,c,d,e,g}-phase-1-stop.md` + `phase-{b,c,d,e,g}-ultraplan.md` + `phase-g-design.md` — per-phase audits + designs
- `milestones/M10/M10-inheritance-inventory.md` (vault de1dd8f) — atomic item registry
- `milestones/M10/M10-conventions-stop.md` (vault dd8f5fb) — STEP 2 STOP precursor
- `milestones/M10/M10-close.md` — milestone close canonical (vault 97d3ad5)

**Repo:**
- `docs/architecture/agent-loop-v1-milestone-10-conventions.md` — v2.7 mirror (repo 240235b)
- `docs/architecture/agent-loop-v1-milestone-10-report.md` — STEP 3 mirror (this file)
- Phase substrate commits: 1c8cc37 (A), 0d5196e (B), 5952d61 (C), 9bfb1af (D), 99a2feb (E STEP 8e), 52b46ea (G H2)

**M9 inheritance + precedent:**
- `milestones/M9/M9-close.md` — predecessor milestone-close (template + §6.14 retroactive precedent)
- `decisions/2026-05-12-m9-conventions.md` — v2.6 inheritance source per §6.15

**Method grounding (vault):**
- `method/voice-doctrine.md` (S5/S6 D51 lock; first-live-(f) precedent)
- `method/koast-method.md`
- `method/koast-method-in-code.md`
