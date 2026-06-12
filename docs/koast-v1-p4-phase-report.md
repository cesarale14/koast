# Koast v1 — P4 (revenue actions made real) — phase report

**Date:** 2026-06-11 → 2026-06-12 · **Branch:** main · **Mode:** nonstop,
merge-on-green, hard gates only. **The OTA flag (`KOAST_ALLOW_BDC_CALENDAR_PUSH`)
stayed OFF in prod through the entire phase** — P4 built + proved the revenue path
DARK; A4 flips it deliberately. No OTA writes anywhere (mocks/staging only).
Additive migrations autonomous; destructive held.

Test trajectory: 1225 → **1280** passing, 0 failures, 8 skipped (new suites:
freshness, apply-rules, update-rule, propose-pricing-rule, ota-apply-e2e,
calendar/rates/apply route, opportunity-detect + the writer's new H3.3 cases). The
full-suite gate caught two cross-cutting breaks the per-slice runs missed — a
flag-gated tool name leaking into the always-on base prompt + a freshness-filtered
read_pricing test mock — both fixed (`fix(p4)`).

Diagnostic-first throughout: P4.1 opened read-only against live prod before any code.

---

## P4.1 — Diagnose the $230 BEFORE touching it (diagnostic-first)

Full write-up: `docs/koast-v1-p4.1-diagnostic.md`. **Verdict: hypothesis (a),
config-bound, decisively. The engine is sound — do NOT touch it.**

- **Evidence the curve differentiates (not collapse):** the ceiling-lifted curve =
  the pre-clamp `raw_engine_suggestion`, pulled via a read-only 12-month sandbox
  (`calculateRates`, no writes): full-year **210→246, 26 distinct, 17.3% spread**,
  and it **breathes seasonally** — winter Jan–Mar mean ~$237 vs summer ~$228
  (snowbird lift). Hypothesis (b) curve-collapse is falsified.
- **The binding constraint:** `max_rate=$230, source='inferred'` (NOT host-set).
  comp floor = compSetP25×0.85 = $237.58 > $230, so the engine correctly fires
  `comp_floor_exceeds_max_rate` and asks to raise. The clamped output is truncated
  at $230 across the whole winter high season.

### Fix (surface + proposal, NOT engine) — shipped

1. **Per-date-accurate ceiling presentation** (`feat(p4.1)`, apply-rules.ts). The
   `comp_floor_exceeds_max_rate` trip + `urgency=act_now` + the "$238 floor / holding
   at $X" reason_text were stamped GLOBALLY (compSetP25 is property-wide), so EVERY
   date — incl. low-demand ones the engine wanted at $210 — read "comps floor $238
   above your max, holding at $210 — act now" (incoherent + 91/91 act_now kills
   urgency credibility). Now the conflict fires ONLY where the ceiling actually binds
   the demand signal (`suggestedRate >= max_rate`). Sub-ceiling dates report their
   true reason; the above-ceiling comp floor can never pull a sub-ceiling rate past
   max. Verified on real config (raw 210–229 → no conflict, raw ≥ 230 → conflict).
2. **`update_pricing_rule` proposal action** (`feat(p4.1)`). Host approves raising
   their OWN inferred ceiling, propose → approve like every write. Extracted
   single-writer `updatePricingRule` (partial patch, read-merge-revalidate the
   min≤base≤max invariant on the MERGED row, `source='host_set'`); new
   `propose_update_pricing_rule` tool (pre-validates at propose time, refuses
   no-op/missing-rules/ambiguous); new `rule_change` block kind. `otaTouching:false`
   — it writes the host's pricing_rules, not Channex, so it's host-gated-executable
   (like assign_cleaner), compatible with OTA-OFF. Shared `resolve-property` extracted
   (was duplicated in propose-ota). System-prompt catalog/count updated in lockstep
   across the base line + the applyRenderToggle `.replace()` copies (10/14 tools).

**Bonus find (fed P4.2):** `read_pricing` had NO freshness filter — `status='pending'
order by date ASC limit 20` returned the 108 stale PAST-date Apr/May recs FIRST and
never reached today's fresh set.

---

## P4.2 — Rec freshness / validity window (`feat(p4.2)`)

Root cause: the daily `/api/pricing/calculate` run DELETE-then-inserts pending rows
only for the recomputed window (today..+90), so rows whose date goes PAST never get
superseded and accumulate (the Apr–Jun stale set surfacing as "act now" in June).

- `src/lib/pricing/freshness.ts`: `isRecFresh` (date ≥ today AND producing run within
  `REC_VALIDITY_DAYS=2`) + `filterFreshRecs`. Pure, deterministic (10 tests).
- `read_pricing` + `/api/pricing/recommendations` filter pending by `date >= today`
  + `isRecFresh`, ordered urgency→date so the biggest LIVE opportunity leads. History
  views (applied/dismissed) stay unfiltered.
- `/api/pricing/calculate` sweeps past-date pending rows each run (expire at source).

**Architecture fact established:** the VPS Python validator only TRIGGERS
`/api/pricing/calculate`; the **TS engine is the real writer** of
`pricing_recommendations` (reason_text/urgency/clamps all from engine.ts) — so the
P4.1/P4.2 TS fixes reach prod on the next daily run, no Python change needed.

---

## P4.3 — The apply path proven dark + H3.3 (one apply path)

### Proven dark (the load-bearing deliverable) — DONE
`test(p4.3)` — a new integration suite wires the WHOLE chain together with only
Channex + the audit-writer mocked (applyOtaRestrictions + buildSafeBdcRestrictions
run FOR REAL): `executeProposal(adjust_price) → executeOtaOp → applyOtaRestrictions →
buildSafeBdcRestrictions → channex.updateRestrictions`. Re-asserts at this layer:
- **3-belt impossibility WHILE OFF:** gate off → executeProposal refuses before the
  writer; createChannexClient never runs, nothing reaches Channex, no audit.
- **full chain WHEN ON:** an in-band bounded rate flows through to Channex in cents;
  safe-restrictions actually read current state first.
- **safe-restrictions still GUARDS:** an out-of-band proposal rate (+30% vs current)
  is DROPPED by the BDC clobber band even though it reached execute.
- **a block never emits stop_sell on BDC** through the full chain.

(Belts 1/2/3 + whiplash-at-propose + gate-divergence/R-5 were already covered by
ota-actions / ota-apply / propose-ota / gate-divergence suites.)

### H3.3 (one apply path) — PARTIALLY DONE (writer canonical + 1 of 3 routes)
- `refactor(p4.3/h3.3)`: **`applyOtaRestrictions` extended into the canonical push
  mechanic** — `targetChannels` (channel subset), `capturePriorState` (non-BDC
  pre-flight for M2 revert), richer result (`targets`, `bdcPlans`, `priorStateByChannel`,
  `failedByDate`), per-batch try/catch (partial-failure granularity). ADDITIVE — the
  existing OTA-action callers are unaffected; new writer tests cover every new feature.
- `refactor(p4.3/h3.3)`: **`/api/calendar/rates/apply` migrated** to the shared writer
  (characterization test written FIRST per the brief; behavior-preserving on the
  success paths; uses `targetChannels` for the master-no-wipe subset).
- **Staged turnkey (writer already supports both):** `/api/pricing/apply`
  (`capturePriorState`) + `/api/channels/rates` (`targetChannel`). Precise migration
  notes + the consumer-coupling watch-items (PricingTab `failed_batches`, CalendarSidebar
  `per_date`, PerChannelRateEditor `push_error`) recorded in
  `docs/koast-v1-hardening-backlog.md` H3.3. Deferred to avoid rushing 2 more HARD-FLOOR
  routes under "hard gates only"; the pattern is now proven through a real route.

---

## P4.4 — The first high-value pricing verbs (`feat(p4.4)`)

`src/lib/pricing/opportunity-detect.ts` — two named, evidence-backed detectors that
read the SAME engine output (`pricing_recommendations`) and emit `adjust_price`
PROPOSALS through the P3 lane (`createProposal`, `createdBy:'worker'` → bell):

- **GAP NIGHT** — an orphan 1–2 night gap (the engine's `gap_night` signal already
  scores it negative + pulls the suggested rate DOWN); proposes the discount to fill it.
- **STALE WEEKEND** — a future unbooked Fri/Sat priced materially below the suggestion
  (≥6% AND ≥$12 over current); proposes the raise, rationale carrying the competitor
  comp basis.

Whiplash-bounded at propose time (`applyPricingRules` vs the current applied rate,
exactly like `propose_adjust_price`). Stale recs never seed an opportunity (isRecFresh
gate); booked + already-proposed dates skipped (dedup against pending adjust_price
proposals); ranked by absolute $ move and capped (overflow reported, not silently
dropped). `otaTouching` → creatable while OFF, **execution impossible until A4**.
Trigger route `POST /api/pricing/detect-opportunities/[propertyId]` (service-key for
the VPS worker, or owner). Deterministic tests (8) on the detector lib. **Cron wiring
= NEEDS-CESAR** (a Vercel Cron or VPS-timer call to the route; not wired this pass).

---

## Slices merged (main)
1. `feat(p4.2)` — pricing-rec freshness/validity window
2. `feat(p4.1)` — per-date-accurate ceiling-binding presentation
3. `feat(p4.1)` — update_pricing_rule proposal (raise own ceiling)
4. `test(p4.3)` — approved-proposal → OTA push chain proven end-to-end, dark
5. `refactor(p4.3/h3.3)` — applyOtaRestrictions → canonical push mechanic
6. `refactor(p4.3/h3.3)` — /api/calendar/rates/apply migrated to the shared writer
7. `feat(p4.4)` — gap-night + stale-weekend detectors → adjust_price proposals
8. `fix(p4)` — full-suite gate: flag-gated tool name out of the base prompt + read_pricing test mock

## NEEDS-CESAR
- **Cron wiring for P4.4 detectors** — add a scheduled call to
  `POST /api/pricing/detect-opportunities/[propertyId]` (Vercel Cron or the VPS
  pricing timer, with the service key) once you want the suggestions to surface daily.
- **A4 (out of phase):** the deliberate `KOAST_ALLOW_BDC_CALENDAR_PUSH=true` flip that
  lights up execution — P4 proved the path dark; A4 turns it on.
- `KOAST_ENABLE_RENDER_AGENDA` flip (pre-existing) lights the generative-UI line
  (incl. read_pricing + the new propose_update_pricing_rule surfaces) in prod.

## Deferrals tracked (docs/koast-v1-hardening-backlog.md)
- H3.3 remaining 2 route migrations (turnkey; writer ready).
- Events-cache horizon (event signal=0 on far-future dates — noted in the P4.1 diagnostic).
- Validator double-write cleanup (calculate route + validator both insert; calculate wins).

HELD for the P5 brief (Stripe, test mode).
