# M9 Milestone Close — Report (Repo Mirror)

> Repo developer-facing mirror of vault canonical `milestones/M9/M9-close.md` (vault commit `18ff650`). Content identical modulo wikilink → prose-form transformations. Vault is the institutional canonical; this repo mirror is the developer-facing artifact per v2.6 §7.8 gate 5 dual-canonical pattern (new for M9; M8 had no repo mirror).

# M9 Milestone Close

**Status:** Closed.
**Tag:** `m9-close` → `[TBD-STEP-10]` (anchored on close commit).
**Conventions:** v2.6 dual-canonical at `decisions/2026-05-12-m9-conventions.md` (vault) + `docs/architecture/agent-loop-v1-milestone-9-conventions.md` (repo).
**Test count delta:** M8 baseline (524 passing at M8 close) → M9 final **665 passing, 5 skipped** (+141 passing, +5 skipped).
**Date range:** 2026-05-12 (M9 kickoff diagnostic) → 2026-05-19 (Phase H close target).
**Total G8 catches:** 37 across Phases A-H (institutional record at §8).

**Per-phase close + tag:**

| Phase | Close commit (main) | Tag |
|---|---|---|
| A — Test infrastructure | `71d956d` | (no per-phase tag; conventions revision v2.1) |
| B — Cluster A foundation (F3 Zod) | `5bda7db` | v2.2 |
| C — D22 confidence metadata + D23 sufficiency | `81b644a` | v2.3 |
| D — A5 substrate-catch + A6 completion guard | `d582f9a` | v2.4 |
| E — Cluster B voice substrate (D25 + B2) | `96a5a22` | v2.5 |
| F — A7 D24 tonal regression CI | `bfd42e7` | `m9-phase-f-close` + v2.6 |
| G — Cluster E cleanup (E1+E2+E3+E4) | `7f4d046` | `m9-phase-g-close` (no v2.7) |
| H — F7 + §7.8 milestone close | `[close commit TBD]` | `m9-phase-h-close` + `m9-close` (STEP 10) |

---

## 1. SHAPE 2 shipped (Cluster A/B/E — 13 items)

All 13 SHAPE 2 items per v2.6 §1.3 shipped across Phases B/C/D/E/F/G.

**Cluster A — Honesty substrate (Belief 5 grounding, 7 items):**

- **A1 F3 Zod schema enforcement** at 4 single-shot LLM call sites — Phase B (`5bda7db`). Sites 1-4: `messaging.ts::generateDraft` + 3 `reviews/generator.ts` functions. Site 5 (loop.ts) out of F3 scope per Path A; D27/A5 owns chat-text catch.
- **A2 D22 confidence metadata** in `AgentTextOutput` envelope — Phase B + Phase C (`81b644a`). Confidence label + output_grounding + source_attribution fields validated by Zod.
- **A3 P2 source attribution rendering** — folds with A2; Phase C.
- **A4 D23 sufficiency thresholds** per agent tool — Phase C (`81b644a`). `checkSufficiency(toolId, hostId)` catalog at `src/lib/agent/sufficiency.ts`.
- **A5 chat-text refusal substrate-catch** — Phase D (`d582f9a`). D27 Option ε locked: post-stream classifier (`src/lib/agent/post-stream-classifier.ts`) + `stop_reason === "refusal"` branch upgrade.
- **A6 completion-message single-emission guard** — Phase D (`d582f9a`). A6-1 in-turn duplicate detection (shares A4 substrate) + A6-2 fact-write retry-with-backoff hardening.
- **A7 D24 tonal regression CI (shape regex layer)** — Phase F (`bfd42e7`). 66 PHASE_F_SHIP patterns across voice doctrine §5.1-§5.6 + 7 PHASE_F_DEFER_TO_M10 stubs. CI workflow at `.github/workflows/ci.yml`. LLM judge layer deferred to M10 per §6.9.

**Cluster B — Voice substrate (Belief 7 grounding, 2 items):**

- **B1 D25 voice_mode memory_fact + Mode 2 register** — Phase E (`96a5a22`). voice_mode locus: `memory_facts` `entity_type='host'` + `sub_entity_type='voice'`. Mode 2 universally applied today via `readVoiceMode→null→buildVoicePrompt(null)`. Extraction worker scheduling deferred to M10 per §6.8.
- **B2 F6 original_draft diff capture** — Phase E (`96a5a22`). `messages.original_draft_text` + `guest_reviews.original_draft_text` columns added; routes persist Koast-generated text alongside legacy draft columns.

**Cluster E — Cleanup of M8 architectural debt (4 items):**

- **E1 `/api/onboarding/idle-status` GET/POST split** — Phase G (`17441a8`). GET pure-read with `Cache-Control: no-store`; POST acks + writes with server-side state re-fetch. Q-G1 (b) co-opt POST confirmed. Shared eligibility helper at `src/lib/onboarding/idle-status.ts`.
- **E2 `pricing_apply` action_type seeding** — Phase G (`41eefcb`). Narrow scope: route INSERTs into `agent_audit_log` on apply success. VIEW `unified_audit_feed` mapping `pricing_apply → rate_push` already in place pre-M9.
- **E3 `review_rules` drop + reviews-generate refactor** — Phase G (3 commits: `4ec2d55` substrate + `91cc458` consumer refactor + `7f4d046` terminal drop). Per-property → per-host architectural change; preferences moved to `memory_facts` `sub_entity_type='reviews'`. D25 mirror methodology validated in second instance. Q-G2 `'reviews'` (compression-style); Q-G6 β path `/api/reviews/preferences`.
- **E4 `messages_pre_milestone1_snapshot` table drop** — Phase G (`92539d7`). Terminal drop per M1 design intent; 8 days past 7-day observation window. Asymmetric idempotent migration (`DROP TABLE IF EXISTS`): production 90-row drop, staging no-op.

**Atomic count: 13/13 shipped.** No partial-shipment discrepancies surfaced at Phase H STEP 2 audit (vault `milestones/M9/H-phase-1-stop.md`, commit `26bf122`).

---

## 2. SHAPE 2 deferred (Cluster C/D + within-cluster M10 stubs)

**Cluster C — Calibration substrate (Belief 4 architecture), deferred past M9 entirely per v2.6 §1.2:**

- **F8 `host_action_patterns` table + minimal calibration logic** — host's approval patterns substrate; F7 honest-scope copy refresh extended timing horizon for the C13 binding copy ("three weeks of accumulated approvals" → "once enough approvals accumulate").
- **Rate-push revert substrate** (M8 D17d hedge).

**Cluster D — Audit feed + export completion, deferred past M9 entirely:**

- **`notifications.host_id` schema migration** + 5th source in `unified_audit_feed` + SMS → Notifications chip rename.
- **Memory export substrate** (M8 Phase H C13 R-5 commitment) — F7 honest-scope refresh extended timing language ("near-term roadmap" → "the roadmap").

**Within-cluster Phase F deferrals — PHASE_F_DEFER_TO_M10 stubs (7 entries at `src/lib/voice/anti-patterns.ts`):**

- emoji policy (§5.5) → output-filter layer
- exclamation cap (§5.5) → llm-judge (count-shape)
- ensure-verb-chain (§5.6) → llm-judge (heuristic)
- Filler (§5.7) / Self-narration (§5.8) / Performative thoroughness (§5.9) → llm-judge (contextual)
- voice-doctrine self-scan → llm-judge (quote-vs-instance)
- constitution prompts self-scan (build-voice-prompt.ts + agent/system-prompt.ts) → llm-judge

**Slice 3 UI deferrals surfaced at Phase H attestation (vault `milestones/M9/H-close-gate.md`, commit `b6feebd`):**

- `generateDraft` host-UI trigger button in Messages thread UI ("Koast AI — coming in slice 3" deferral observed at attestation).
- Other 3 LLM call sites (generateGuestReview / generateReviewResponse / generateGuestReviewFromIncoming) not host-UI-triggerable through M9; substrate verified via tests.

M10 inheritance roll-up at §10.

---

## 3. Round-2 questions resolved (D26-D29)

Per v2.6 §3.

- **D26 — Output-schema enforcement locus (A1)** — locked **α (generic wrapper)** at Phase B sign-off per Site 1 first-call-site empirical fit. `callLLMWithEnvelope` α-wrapper + per-site `buildEnvelope` heuristic. 7 lines wrapper invocation + ~25-line helper per site vs ~120 lines duplicated control flow under β (per-site Zod). Shipped: Phase B (`5bda7db`).
- **D27 — Substrate-catch for chat-text refusals (A5)** — locked **Option ε** at Phase D sign-off (audit-surfaced beyond v2.0 α/β/γ/δ): post-stream classifier + `stop_reason === "refusal"` branch upgrade. v2.0 α framing (M8 P4 extension) was not viable — different hook locations. Shipped: Phase D (`d582f9a`).
- **D28 — Mode 2 propagation (B1 sub-decision)** — locked **(a) single doctrine import + voice_mode parameter** uniform across Sites 1-4 via `buildVoicePrompt(voiceMode)`. Shipped: Phase E (`96a5a22`).
- **D29 — original_draft capture (B2)** — locked **(a) column on messages + guest_reviews**; separate `message_drafts` table = M10 candidate. Shipped: Phase E (`96a5a22`).

D30 (pricing engine schema-export rewrite explicitly deferred) and D31 (M8 deferrals roll-up + F7 honest-scope reasoning) are decision-deferral records, not implementation locks.

---

## 4. CFs from M9 work (cross-cutting fixes)

- **Phase B 5-vs-4 LLM call site count** — v2.0 §3 said 4; Site 5 (loop.ts) discovered. Path A locks F3 scope to 4 generator sites; Site 5 chat-text path = D27/A5 Phase D ownership. (G8-B1.)
- **Phase C D22 two-layer architecture** — UI integration deferred to M10; M9 ships API-layer propagation only. (G8-C1.)
- **Phase D D27 hook-location** — M8 P4 pre-dispatch pattern does NOT transfer directly to chat-text path; different stop_reason branches. (G8-D1.)
- **Phase F PATH C call-site/constitution prompt bifurcation** — `PROMPT_BEARING_FILES` (call-site, gated) vs `CONSTITUTION_PROMPTS` (deferred to M10 LLM judge) structural cut. Codified in v2.6 §7.9. (G8-F4.)
- **Phase G E2 narrow scope confirmation** — M8 Phase A CF source text conflated "seed action_type" with "agent-loop integration"; v2.6 §1.3 narrow-scope framing is canonical. Smaller scope locked. (G8-G2 ambiguity-flag-not-catch.)
- **Phase G E3 0-row data audit reframe** — production `review_rules` had 0 rows; /ultraplan E3 collapse-strategy decision tree moot. Backup-snapshot-before-terminal-drop discipline (G8-G3) codified institutionally; backup table empty schema preservation.
- **Phase H STEP 5 topnote-at-H1 milestone-shift doc refresh sub-pattern** — institutional pattern for doc refreshes that preserve as-of-authoring content while adding milestone-context. Trap 1 (no substantive doc rewriting) honored.
- **Phase H STEP 6 cross-env audit-coverage gap** — Phase G STEP 6.3 narrow-scope claim ("production-only gap") inherited across 3 audit layers before STEP 6.1 direct staging query surfaced both-envs gap. (G8-H3 cross-stratum.)

---

## 5. Honest-scope copy refresh (F7 + memory-export)

Phase H STEP 5 (`5944afc`) shipped wide-scope F7 across 11 surfaces per §3 D31 reasoning + Phase G E3 architectural-change carryover.

**2 src files — milestone-shift language extended one milestone forward:**

- `src/app/(dashboard)/koast/guide/koast-on-your-behalf/page.tsx:45-49` (C13 binding copy)
  - "ships in a near-term milestone" → "ships in a future milestone"
  - "after roughly three weeks of accumulated approvals" → "once enough approvals accumulate"
- `src/app/(dashboard)/koast/guide/memory/page.tsx:57-60` (memory-export commitment)
  - "on the near-term roadmap" → "on the roadmap"

**9 doc files — uniform topnote pattern at H1** (institutional sub-pattern for milestone-shift doc refreshes):

`docs/REVIEWS_BLUEPRINT.md` · `docs/REVIEWS_DATA_TRUTH.md` · `docs/codebase-analysis.md` · `docs/method/BELIEF_{1,2,3,6,7}_INVENTORY.md` · `docs/method/koast-method-in-code.md`.

Topnote shape: `> **Historical note (M9 Phase G E3, 2026-05-17):** ...` Documents review_rules → memory_facts migration + path rename + per-property → per-host scoping shift. Three docs received framing-adjusted topnotes (BELIEF_3 acted-on framing, BELIEF_7 precedent-preserved framing, koast-method-in-code deprecation-execution framing).

**Institutional rationale:** topnote-at-H1 preserves as-of-authoring substantive content while adding M9-context. Inline replacement rejected per Trap 1 — substantive doc rewriting risk. Future readers get M9-context immediately; historical state-of-codebase descriptions preserved as institutional record.

---

## 6. Voice doctrine evolutions

**Phase F D24 tonal regression CI (shape regex layer):**

- γ catalog organization (`src/lib/agent/patterns/types.ts` shape primitive + `src/lib/agent/refusal-patterns.ts` Phase D + `src/lib/voice/anti-patterns.ts` Phase F).
- 66 PHASE_F_SHIP patterns + 7 PHASE_F_DEFER_TO_M10 stubs.
- Shape regex CI enforced on call-site prompts (PROMPT_BEARING_FILES allow-list).
- Constitution prompts (CONSTITUTION_PROMPTS) deferred to M10 LLM judge per §7.9 bifurcation.

**Phase E D25 voice_mode + Mode 2 register:**

- voice_mode as memory_fact (`entity_type='host'`, `sub_entity_type='voice'`).
- `readVoiceMode` → `buildVoicePrompt(voiceMode)` → Mode 2 prompt as universal default when no fact exists.
- Extraction worker code shipped at `src/lib/voice/extraction-worker.ts`; nightly scheduling infrastructure deferred to M10 per §6.8.

**Phase H attestation observations (vault `milestones/M9/H-close-gate.md`, commit `b6feebd`):**

- Agent-to-host voice: strong Mode 2 register + honest-scope discipline observed (agent refused to fabricate generic template at attestation, citing it "would be too generic to be useful").
- Guest-facing draft tone: agent generated a day-before check-in template with structured arrival/wifi/parking sections; included emojis in guest-facing portion (representative of Airbnb/Booking platform tone norms).
- §5 catalog scope clarification question surfaced: catalog operates on call-site prompts; clarification needed whether emojis in guest-facing drafts are anti-pattern OR explicit allowance distinct from agent-to-host voice. M10 voice doctrine refinement (NOT a Phase H halt).

---

## 7. G8 institutional record (37 catches across Phases A-H)

**Per-phase enumeration** (verbatim from §7.7 conventions + per-phase close notes):

- **Phase A (v2.1) — 1 catch.** G8-A1: §6.3 API route test infrastructure already exists from M6/M7 D38 substrate; v2.0 framing implied missing infrastructure.
- **Phase B (v2.2) — 2 catches.** G8-B1: 5 LLM call sites discovered (not 4 per v2.0 §3). G8-B2: Site 5 (loop.ts) architecturally distinct (streaming + multi-turn + tool-use); Path A locks F3 to 4 generator sites.
- **Phase C (v2.3) — 7 catches.** Most G8-productive M9 phase. G8-C1: D22 has two-layer architecture (API + UI); v2.0 framing assumed single-phase. G8-C2: C2 ConfidenceBandedRange uses pricing-engine shape, not LLM-text envelope. G8-C3: D23 per-tool catalog was wrong granularity; per-generator-call is the actual surface. G8-C4: rendering surface review surfaced 4 sites; M10 inheritance. G8-C5: sufficiency_signal vocabulary mismatch ('rich|sparse|empty' vs 'rich|lean|thin'); Q-C1 rename. G8-C6: hybrid consumer pattern across 4 routes. G8-C7: C1 uniform across all 4 sites lock at Layer 1.
- **Phase D (v2.4) — 4 catches.** G8-D1: D27 hook-location framing wrong (M8 P4 pre-dispatch ≠ chat-text path). G8-D2: A4 + A6 share substrate boundary. G8-D3: `stop_reason === "refusal"` predates M8 F4 envelope; emits generic event, not envelope. G8-D4: A6 = strengthen existing partial substrate, not net-new.
- **Phase E (v2.5) — 6 catches.** G8-E1: M8 C13 binding copy located in `(dashboard)` route group (initial grep missed). G8-E2: voice_mode in system-prompt.ts forward-comment-only, not pre-shipped substrate. G8-E3: Sites 1-4 don't currently import voice doctrine; B2 starts at zero. G8-E4: original_draft has zero current substrate. G8-E5: D25 vs Method-in-code Belief 7 architecture unified via fact JSONB. G8-E6: M8 F1 MemorySupersessionInline already exists; voice section reuses (only positive finding).
- **Phase F (v2.6) — 7 catches.** Four-stratum demonstration. G8-F1: refusal-patterns.ts inheritance was MODULE SHAPE only, not patterns (pre-design). G8-F2: CI substrate was GREENFIELD (pre-design). G8-F3: "prompt-bearing files" scope unoperationalized (pre-design). G8-F4: 4-file PROMPT_BEARING_FILES list conflated call-site vs constitution prompts (implementation-runtime). G8-F5: 3 pre-existing lint errors surfaced by CI activation (CI-activation declared-rules-vs-shipped-code). G8-F6: Vercel production deploys failed silently from Phase D through Phase F STEP 7 (deployment-gate; ~24-hour window). G8-F7: ts-node ambient locally but undeclared in package.json (CI-activation declared-deps-vs-local-env).
- **Phase G (v2.6, no revision) — 4 catches.** G8-G1: E3 per-property → per-host architectural collapse intentional but undocumented in v2.6 §1.3 framing (pre-design). G8-G2 (ambiguity-flag, not-a-counted-catch): E2 scope conflation in M8 CF source text. G8-G3: /ultraplan-time backup-snapshot-before-terminal-drop discipline refinement (pre-design). G8-G4: /ultraplan §3.2 draft INSERT missed 3 NOT NULL columns (implementation-runtime drafted-SQL-vs-shipped-schema). G8-G6: Phase E voice_substrate migration applied production but not recorded in koast_migration_history (cross-phase audit-coverage).
- **Phase H (v2.6, no revision) — 6 catches.** G8-H1: §7.8 gate 1 references missing `milestones/M9/scope.md` artifact (convention-references-uninstantiated-mechanism). G8-H2: Phase G STEP 8.1 review_rules doc-ref flag non-recursive grep; expanded sweep at Phase H STEP 2.1 surfaced 6 more method-doc refs (cross-phase audit-coverage). G8-H3: STEP 2 audit Session 2 scope claim inherited across 3 layers; actual cross-env gap (cross-stratum cross-phase audit-coverage). G8-H4: drafted-SQL `file_name` vs shipped-schema `migration_name` column-name (implementation-runtime drafted-SQL-vs-shipped-schema; same class as G8-G4). G8-H5: §4.2 gate 1 "full staging smoke" mechanism not documented (convention-references-uninstantiated-mechanism; same class as G8-H1). G8-H6: §4.2 sub-gate wording assumes separate staging environment; Koast deploys to production only with test host data (production-as-staging topology; related to convention-references-uninstantiated-mechanism class).

**Aggregate: 37 catches across 7 phases (Phase A 1 + B 2 + C 7 + D 4 + E 6 + F 7 + G 4 + H 6).**

**Stratum distribution:** Pre-design (Phase 1 STOP) dominated Phases A-E (16 catches). Phase F demonstrated all 4 strata in a single phase (pre-design + implementation-runtime + CI-activation + deployment-gate). Phase G/H surfaced new sub-strata (convention-references-uninstantiated-mechanism + production-as-staging-topology + drafted-SQL-vs-shipped-schema). M9 institutional pattern: every phase produced at least 1 catch; mechanical-cleanup phases (G + parts of H) produced fewer absolute counts but surfaced new sub-strata classifying institutional spec gaps.

---

## 8. Conventions evolution v1.x → v2.6

- **v1.x baseline (M8 close, 2026-05-05):** v1.7 M8 conventions locked at M8 close; 10 what-worked patterns + 7 process-gap locks inherited as M9 process discipline.
- **v2.0 (2026-05-12):** Initial M9 conventions drafted against SHAPE 2 scope (~10 items, ~4 weeks). Cluster A/B/E shipping scope, C/D deferred. Decisions D22-D31. Phase plan A-H, ~24 working days.
- **v2.1 (Phase A close):** §6.3 correction (test infrastructure exists; 7 endpoints owe tests, not 5). G8 process discipline introduced (verify-shipped-state at conventions-drafting time).
- **v2.2 (Phase B close):** D26 locked α (generic wrapper). Q-B3 + Q-B4 resolutions. §6.5 added (Phase B M10 carry-forwards). §7.7 amended (G8 carries forward to every phase kickoff, not just conventions-revision time).
- **v2.3 (Phase C close):** D22 locked Option II API-layer. D23 locked Option B per-generator-call. Q-C1 vocabulary rename (sufficiency_signal → output_grounding). §6.6 Phase C M10 inheritance. §7.7 G8 institutional pattern subsection introduced. α + γ blend C1 uniform.
- **v2.4 (Phase D close):** D27 locked Option ε (audit-surfaced beyond v2.0 α/β/γ/δ). A6 = A6-3 scope. §6.7 Phase D M10 inheritance.
- **v2.5 (Phase E close):** D25 voice_mode locus locked. B2/B3 sub-locks. §6.8 Phase E M10 inheritance. §7.7 Phase E G8 entries.
- **v2.6 (Phase F close):** D24 shape-regex layer shipped + structural scope clarification (call-site vs constitution prompts). §6.9 Phase F M10 inheritance (5 items). §6.10 shape primitive extraction methodology (γ pattern + re-export + deferred_ prefix + completeness meta-test). §7.7 G8 dataset extended across all 4 strata. §7.9 allow-list discipline + classification bifurcation. §7.10 phase-close multi-gate verification discipline.

**Phase G + Phase H explicitly DID NOT revise to v2.7** per Trap 5 discipline (mechanical scope + institutional reconciliation, not architectural surfacing).

---

## 9. M10 inheritance roll-up

**Substrate work:**
- Voice extraction worker scheduling (Phase E §6.8) — nightly vs event-driven; Vercel Cron vs VPS systemd timer decision.
- E1 (a) cron/worker for guaranteed silent-complete (Phase G; if product requirement surfaces).
- LLM judge for non-shape-regex catalog enforcement (Phase F §6.9 sub-items i-vi): emoji policy output-filter; exclamation cap llm-judge; ensure-verb-chain heuristic llm-judge; §5.7/5.8/5.9 contextual llm-judge; voice-doctrine self-scan; constitution prompts self-scan.
- Husky pre-commit for local fast-fail (Phase F §6.9 b).
- Sentinel pattern (`// koast-voice-allow: <id>`) once LLM judge can read sentinel context (Phase F §6.9 c).
- Citation-section marker mechanism (`[[cite: ...]]`) reconsidered only if structural bifurcation insufficient (Phase F §6.9 e).

**UI work:**
- Slice 3 UI: expose generateDraft trigger in Messages thread UI (Phase H attestation observation).
- ReviewsSettingsModal "Rules" → "Preferences" UI terminology migration alongside backend memory_facts path (Phase G E3 polish; Phase H attestation re-verified).
- ReviewsSettingsModal propertyId prop removal (Phase G E3 polish).
- D22 UI integration / envelope reaches rendering components (Phase C §6.6).
- Memory tab voice section UI (Phase E §6.8 #1).

**Doctrine work:**
- Voice doctrine §5 catalog scope clarification: agent-to-host vs guest-facing draft tone (emojis in guest-facing drafts) (Phase H attestation).
- Constitution prompt anti-pattern coverage via LLM judge (Phase F §7.9 bifurcation deferral).

**Institutional / record work:**
- §7.8 gate 1 reconcile against missing `milestones/M9/scope.md` artifact (G8-H1).
- §4.2 gate 1 staging-smoke playbook authorship (G8-H5).
- §4.2 gate wording reconciliation against production-as-staging topology (G8-H6).
- Phase F G8-F7 (ts-node devDep) vs Phase H F7 (honest-scope copy refresh) naming-collision disambiguation in M10 conventions.
- Refinement queue for known false-positives surfaced in `edge-cases.fixture.ts` (Phase F §6.9 d).
- §6.10 shape primitive extraction methodology applied to M10 LLM judge catalog (D24 → D25 → E3 lineage validates transferability; M10 judge catalog inherits).

**Hygiene:**
- `review_rules_backup_phase_g` 0-row schema-preservation table drop pass (Phase G E3).
- GH Actions deprecation: `actions/checkout@v4` → `@v5` + `actions/setup-node@v4` → `@v5` before June 2026 default migration (Phase F open follow-up).
- Vercel CLI install on VPS for inline §7.10 (e) observation (Phase F open follow-up).
- gh CLI scope refresh for Actions log content download (Phase F open follow-up).
- Phase E voice_substrate migration_history backfill already shipped at Phase H STEP 6 (G6 closed within M9; record carried forward as institutional pattern for future cross-env asymmetries).

---

## 10. Lessons across M9 (institutional patterns demonstrated)

**§7.7 G8 verify-shipped-state discipline.** 37 catches across 7 phases. Pattern: every phase produced ≥1 catch; conventions-drafted assumptions checked against shipped state before architectural lock. Cost: ~half-day per phase in audit + scope adjustment + conventions revision (where warranted). Value: zero architectural decisions locked against drift-misframing during M9.

**Phase 1 STOP audit-before-design discipline.** Per-phase Phase 1 STOP report (`X-phase-1-stop.md`) authored BEFORE /ultraplan or direct-sign-off implementation. Pre-design catches dominate the M9 G8 dataset (16 of 37). Surface architectural framing errors at smallest blast radius.

**§7.10 phase-close multi-gate verification discipline.** Codified at Phase F post-F6 deployment-gate institutional surfacing. Six gates: tsc + test + lint + CI + Vercel + close-note. Phase G first phase to inherit from kickoff; Phase H second. Discipline holds.

**§6.10 shape primitive extraction methodology.** D24 → D25 → E3 lineage validates transferability. Pattern: γ extraction (shared types module) + re-export technique (zero consumer churn) + deferred_ prefix convention + completeness meta-test. Methodology applies to M10 LLM judge catalog work.

**§7.9 call-site/constitution prompt bifurcation.** Phase F PATH C structural cut: which surfaces matter for output (call-site, gated) vs which surfaces teach the doctrine (constitution, deferred). Bifurcation rather than mechanism-shaped suppression (no per-line sentinels in M9). Codified institutional pattern for future LLM call-site catalog work.

**Topnote-at-H1 milestone-shift doc refresh sub-pattern.** Phase H STEP 5 institutional pattern for milestone-shift doc refreshes: uniform topnote at H1 preserves as-of-authoring content while adding milestone-context. Trap 1 (no substantive doc rewriting) honored. Applied across 9 doc files at Phase H.

**Asymmetric-migration handling patterns.** STEP 6 (E4) used single-operation idempotent pattern (`DROP TABLE IF EXISTS`). STEP 8.4 (E3) used simple pattern after pre-check verified no asymmetry. Multi-operation DO-block pattern drafted but not materialized. Schema-level UNIQUE constraint as backfill idempotency (Phase H STEP 6 G6 backfill).

**Cross-phase cross-stratum G8 pattern.** G6 (Phase E migration history gap surfaced Phase G STEP 6.3, re-audited Phase H STEP 6.1 with broader cross-env scope, surfaced G8-H3) demonstrates institutional pattern: audit claims pass across phases without independent verification at the right granularity. M10 should apply audit-fidelity discipline at each layer.

**Convention-references-uninstantiated-mechanism sub-stratum.** G8-H1 (scope.md missing) + G8-H5 (staging-smoke playbook missing) + G8-H6 (production-as-staging topology). New institutional sub-stratum captured for §7.7. M10 conventions drafting should verify referenced artifacts/mechanisms exist before convention text relies on them.

**Operator attestation + substrate test composition.** Phase H STEP 7.5 demonstrated pattern: substrate-level verification (npm test + Zod schemas + CI gates) PLUS operator-supplied evidence (UI walkthrough + live LLM trigger + sample inspection) compose into close-gate verification when UI surfaces aren't host-triggerable. Pattern applies to milestones that ship substrate without host-UI exposure.

**Direct sign-off vs /ultraplan decision rule.** /ultraplan invoked for 5+ file architectural changes (Phase F D24, Phase G E3); direct sign-off path for mechanical scope (Phase G E2/E4, Phase H F7/G6/§4.2-gates). Decision rule from Phase F/G/H operation; documented in /ultraplan §3 sign-off paths.

**Honest-scope copy refresh discipline.** F7 milestone-shift language (timing horizons extended one milestone forward without inflating commitment) vs substantive doc rewriting (Trap 1). Topnote-at-H1 pattern carries the discipline at doc granularity.

**Trap 5 (no v2.7 in mechanical phases).** Phase G + Phase H explicitly skipped conventions revision per Trap 5 discipline. Pattern: conventions revisions for architectural surfacing only; mechanical scope + institutional reconciliation captured in close notes, not v.X+1.

---

## 11. Open follow-ups (out of M10 scope but flagged)

- Auto-gen Supabase Database types regeneration to eliminate `(supabase.from(table) as any)` pattern at 5+ sites (Phase F STEP 8.5 surfacing; Phase G E3 helpers reused the pattern).
- Continuing voice doctrine refinement as guest-facing draft tone observations accumulate (Phase H attestation).
- M8 close artifact: `M8-close.md` exists in vault but `agent-loop-v1-milestone-8-report.md` does NOT exist in repo. M9 establishes the dual-canonical pattern (M9-close.md + M9-report.md); retroactive M8-report.md authorship is post-M10 hygiene candidate.

---

## 12. References

**Vault canonical:**
- `decisions/2026-05-12-m9-conventions.md` — v2.6 conventions
- `milestones/M9/items/phase-{a,b,c,d,e,f,g}.md` — per-phase close notes
- `milestones/M9/H-phase-1-stop.md` — Phase H audit (vault `26bf122`)
- `milestones/M9/H-close-gate.md` — STEP 7 + STEP 7.5 attestation (vault `b6feebd`)
- `milestones/M9/{B,C,D,E,F,G}-phase-1-stop.md` — per-phase Phase 1 STOP audits
- `milestones/M9/M9-close.md` — milestone close canonical (vault `18ff650`)

**Repo:**
- `docs/architecture/agent-loop-v1-milestone-9-conventions.md` — v2.6 mirror
- `docs/architecture/agent-loop-v1-milestone-9-report.md` — STEP 9 mirror (this file)
- Phase F/G/H substrate commits referenced inline above

**Method grounding (vault):**
- `method/voice-doctrine.md`
- `method/koast-method.md`
- `method/koast-method-in-code.md`
