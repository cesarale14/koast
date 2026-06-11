# Koast v1 — P4 ultraplan (revenue actions made real)

**Mode:** nonstop, merge-on-green, hard gates only. OTA flag (`KOAST_ALLOW_BDC_CALENDAR_PUSH`) stays **OFF in prod through the entire phase** — P4 builds + proves the revenue path dark; A4 flips it. No OTA writes anywhere (staging/mocks only). Additive migrations autonomous; destructive held. NEEDS-CESAR surfaced as they arise.

## Architecture facts established in P4.1 diagnostic (grounding)
- **The TS engine is the real writer of `pricing_recommendations`.** `pricing_validator.py` (VPS) just `POST`s `/api/pricing/calculate/{id}`; that route runs `PricingEngine.calculateRates` and INSERTs the recs with `reason_text` + `urgency` + `reason_signals.clamps`. So fixes in `engine.ts` / `apply-rules.ts` reach prod on the next daily run. (The validator's own `log_recommendations` ON CONFLICT path is secondary; the calculate route's insert is what lands.)
- **Past-date pending recs never get swept.** The calculate route DELETEs pending rows only for `date IN (today..+90)` before re-inserting, so future rows are always fresh but rows whose date has gone *past* linger forever (108 such rows today, Apr 18–Jun 10). This is the P4.2 staleness root cause.
- **The write lane is LOCKED** (P2.3/P3): propose tool (`requiresGate:false`) → `createProposal(createdBy:'agent'|'worker')` → proposals table → host approves → `executeProposal` dispatches to a `PROPOSAL_ACTIONS[type].execute` that calls an EXTRACTED shared lib fn (no side-door). OTA actions are `otaTouching:true` and execution-impossible while OFF (3 belts). `proposals.action_type` is free text (no CHECK) — new action types need no migration.

---

## Slice 1 — P4.2 rec freshness / validity window
**Files:** new `src/lib/pricing/freshness.ts`; `src/lib/agent/tools/read-pricing.ts`; `src/app/api/pricing/recommendations/[propertyId]/route.ts`; `src/app/api/pricing/calculate/[propertyId]/route.ts` (sweep); `src/components/polish/calendar/WhyThisRate.tsx` (+ any pricing-page price_diff consumer); tests.

- `freshness.ts`: `REC_VALIDITY_DAYS = 2`; `isRecFresh({date, createdAt}, nowISO)` → `date >= today(now)` AND `createdAt >= now - REC_VALIDITY_DAYS`. Pure → deterministic-testable. (date-past = expired; created-stale = the daily run stopped, don't scream act_now on a 10-day-old future rec.)
- read_pricing: add `.gte("date", todayStr)` to the query + drop the rows failing `isRecFresh`; order urgency→date so the biggest live opportunity leads (not the stalest past date). Keep limit but only over fresh future rows.
- recommendations route: default-filter `date >= today` (pending status); freshness applied post-query.
- calculate route: after the insert, DELETE pending rows with `date < today` for that property (expire the past). Additive, no migration (DELETE, not a new status value — avoids a `status` CHECK migration).
- price_diff consumers (WhyThisRate + pricing page): filter stale before render.
- Tests: `freshness.test.ts` (boundary: today=fresh, yesterday=expired, created 3d ago future=stale); read_pricing test (past rows excluded, fresh future surfaced).

## Slice 2 — P4.1-fix (A): per-date-accurate ceiling presentation + urgency
**Files:** `src/lib/pricing/apply-rules.ts`; `src/lib/pricing/engine.ts`; tests.

- apply-rules: only emit the `comp_floor_exceeds_max_rate` guardrail trip when **the date actually clamped to max** (`clamped_by.includes('max_rate')`) AND `floor > max_rate`. On sub-ceiling dates (raw < max) the ceiling isn't binding → no conflict trip, no forced act_now, honest reason. (Today the trip is property-global → fires on all 91 dates incl. $210 ones reading "holding at $210" while claiming a $238 floor binds.)
- engine: `classifyUrgency` act_now override already keyed on the trip → now only fires on bound dates. `buildReasonText` conflict branch unchanged (only fires when the trip is present). Verify the non-conflict urgency path (raw-vs-current gap) governs sub-ceiling dates.
- Tests: raw<max date → no conflict trip, urgency from gap, coherent reason; raw≥max date → conflict trip + act_now + "holding at $230". Add to `engine.test.ts` / new `apply-rules.test.ts`.

## Slice 3 — P4.1-fix (B): `update_pricing_rule` proposal action + propose tool
**Files:** new `src/lib/pricing/update-rule.ts` (extracted single-writer); `src/lib/proposals/server.ts` (action); new `src/lib/agent/tools/propose-pricing-rule.ts`; `src/lib/agent/render/blocks.ts` (new `rule_change` block kind + component + registry); `src/lib/agent/tools/index.ts` (register); `src/lib/agent/system-prompt.ts` (advertise); tests.

- `updatePricingRule(svc, {propertyId, hostId, patch:{max_rate?,min_rate?,base_rate?}})`: validates min≤base≤max, updates `pricing_rules`, sets `source='host_set'` (host approved). Single-writer reusable by a future manual settings route.
- action `update_pricing_rule`: `otaTouching:false` (writes the host's own config, NOT Channex — safe to ship executable + host-gated like assign_cleaner), stakes `medium`. `execute` → `updatePricingRule`.
- `propose_update_pricing_rule` tool: resolves property by name, validates the proposed field/value, builds a `rule_change` display block (field, old→new) + action payload. The P4.1 conflict already carries `comp_floor_value` + `max_rate` so the agent can propose the right new ceiling.
- Register + advertise. Deterministic tests: propose→pending; approve→`pricing_rules.max_rate` updated, `source='host_set'`.

## Slice 4 — P4.3: apply path proven dark + H3.3 one-apply-path migration
**Files:** tests first for the 3 routes; then `/api/pricing/apply`, `/api/calendar/rates/apply`, `/api/channels/rates` migrated to `applyOtaRestrictions`; re-assert invariant tests at the proposal→ota-apply layer.

- Invariant re-assertion: approved `adjust_price` with flag OFF → all 3 belts refuse (ProposalCard !executable, executeProposal refusal, applyOtaRestrictions refusal). With a MOCKED Channex + flag ON → BDC routes through `buildSafeBdcRestrictions`, whiplash bound holds at propose time. No live sends.
- H3.3: characterization tests for each route's current behavior FIRST (none exist), then refactor the inline BDC→safe / non-BDC→direct loop to call `applyOtaRestrictions`, preserving each route's own DB writes (calendar_rates upsert, pricing_performance, audit). Goal: ONE apply path in the codebase by phase end.

## Slice 5 — P4.4: gap-night + stale-weekend detectors → adjust_price proposals
**Files:** new `src/lib/pricing/opportunity-detect.ts`; thin trigger route `/api/pricing/detect-opportunities/[propertyId]` (service-key); tests. (Cron wiring = NEEDS-CESAR / follow-up.)

- Reuse the engine: gap-night via the existing `gap_night` signal (orphan 1–2 night gaps between bookings → discount proposal); stale-weekend = future unbooked Fri/Sat in the booking window where `suggested_rate` materially exceeds `applied_rate` (leaving money) → raise proposal.
- Emit `adjust_price` proposals via `createProposal(createdBy:'worker')` (fires the bell), whiplash-bounded at propose time (reuse the propose-ota whiplash path), rationale carries evidence (gap dates / comp basis / bound applied). otaTouching → creatable, not executable while OFF (matches dark requirement).
- Deterministic tests on the detector lib (fixture calendars → expected proposals).

---

## Test gate every slice
`npx tsc --noEmit` + `npx jest <touched suites>` green before commit. ESLint-clean (unused vars break Vercel). Pre-flight `git status` (intentionally-untracked design/ + docs remain untracked). Commit per slice, push to main.

## Deferrals tracked
- H3.2 (non-BDC room-type availability wrapper) — only if non-BDC block is wanted before A4; not P4.
- Events-cache horizon (event signal=0 on far-future dates) — noted in P4.1 diagnostic, out of scope.
- Validator double-write cleanup (calculate route + validator both insert) — note; not blocking.
