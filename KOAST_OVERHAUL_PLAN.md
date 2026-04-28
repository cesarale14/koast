# Koast Overhaul Plan
*Drafted 2026-04-17 — plan only, no code changed, no migrations applied.*

## Executive Summary

Koast is operationally healthy — the 9-signal engine runs daily on the Virginia VPS with four days of validated recommendations in `pricing_recommendations` (480 rows across 2 properties × 60 dates × 4 runs), the cutover to `app.koasthq.com` landed cleanly, Channex webhook is re-registered, and the design system is documented. What's left for the next wave of polish + pipeline is three tracks:

- **Track A — UI Fluidity**: a polish pass against the existing design system. Three pages have concentrated drift (Pricing, Properties' AddPropertyModal, Reviews), Calendar + Turnovers + Pricing are missing entrance choreography, `globals.css` is missing the three keyframes the spec calls for (`fadeSlideIn`, `cardReveal`, `aiGlow`), and the onboarding SMS templates contain 12+ emoji that explicitly violate the "no emojis anywhere" rule. ~25-35 focused hours of work, no redesigns needed.
- **Track B — Pricing Pipeline**: wire the Apply buttons, add `pricing_rules` + `pricing_performance` tables, harden guardrails, build the outcome capture loop, and stage auto-apply behind a 14-day shadow mode. The engine and the validator don't change — they're already correct. What's new is the rules/apply/outcome/auto-apply layer on top. ~40-60 hours, phased rollout.
- **Track C — Net-new Proposals**: eight opinionated proposals, biased toward riding existing infrastructure (ChannelPopover, the pricing pipeline, the AI messaging scaffold). Two are filed as "don't build" with reasoning.

**Not in scope for this plan**: the AI messaging pipeline (Phase 2 per CLAUDE.md — its spec is already captured under UPCOMING FEATURES and deserves its own ultraplan), Frontdesk direct booking, owner portal/multi-user, marketing site. Track C surfaces some adjacent nudges but the full feature belongs in a separate planning pass.

Tracks A and B can run mostly in parallel. Track B has one hard dependency on Track A (the Pricing page needs the Apply-button visual polish before it becomes the primary apply surface). Track C is strictly optional — review, pick or cut, slot between A and B sprints.

---

## Track A — UI Fluidity

Evidence base: grepped every sidebar-route component + Property Detail for legacy `brand-*` tokens, legacy `neutral-*`/`gray-*`/`slate-*`/`zinc-*` classes, shadow utilities, `useCountUp` usage, and entrance animation refs. DESIGN_SYSTEM.md Section 16 says every page must have entrance choreography; the file has 16 sections covering typography, shadows, radius, transitions, components, and patterns.

### Dashboard (/)
- **Severity: low**
- **Issues**: zero brand/gray/neutral drift, 4 `useCountUp` uses, 4 entrance animation refs. Clean against the spec.
- **Watch items**: dashboard greeting may still show auth username instead of display name on some paths (noted in CLAUDE.md Known Gaps). Not a design-system issue but worth a polish-pass check.
- **Effort**: 1 hour (smoke test + greeting fix if still broken).
- **Blocking**: no.

### Calendar (/calendar) — `components/calendar/CalendarGrid.tsx` (826 lines)
- **Severity: medium**
- **Issues**:
  - **Zero entrance choreography** — 0 references to `fadeSlideIn` / `cardReveal` / `animation:` anywhere in 826 lines. DESIGN_SYSTEM.md Section 16 explicitly says "Apply to ALL pages." Cold load lands with no stagger, no reveal.
  - `components/calendar/MonthlyView.tsx:556` has `⚠︎` in a tooltip title for overbookings — violates "No emojis anywhere" (Section 15). Should become plain text like "Overbooking".
- **Effort**: 3-4 hours. Wrap the three-column layout in a choreographed container (thumbs stagger 80ms, grid fade in at 250ms, right panel at 400ms); replace the overbooking character with text.
- **Blocking**: no.

### Messages (/messages) — `components/dashboard/UnifiedInbox.tsx` (1,128 lines)
- **Severity: low-medium**
- **Issues**:
  - 3 entrance animation refs but no `useCountUp`. No stats on this page need count-up — that's fine, it's not a gap.
  - No specific drift findings; needs a manual walkthrough for AI draft card styling (dashed golden border, solid-dot badge per Section 17.3).
- **Effort**: 2 hours — walkthrough + touch-ups.
- **Blocking**: no.

### Properties (/properties) — `components/dashboard/PropertiesPage.tsx` (785 lines)
- **Severity: medium**
- **Issues**:
  - 28 `neutral-*` references, concentrated in the AddPropertyModal section (lines ~500-600 — `text-neutral-800`, `bg-neutral-50`, `border-neutral-0`). These are Koast-aliased via tailwind.config.ts and visually correct, but they hide the design system's intent. Modal was built pre-rebrand and never touched.
  - `components/dashboard/PropertiesPage.tsx:92` uses `focus:ring-[#1a3a2a]` — a hardcoded hex that's close to `--coastal` (#17392a). Swap to `focus:ring-coastal/30`.
  - 3 entrance refs — good.
- **Effort**: 4-5 hours. Token migration sweep + ring-color fix + AddPropertyModal visual audit against mockup.
- **Blocking**: no.

### Pricing (/pricing) — `components/dashboard/PricingDashboard.tsx` (727 lines)
- **Severity: HIGH — biggest drift target in the codebase.**
- **Issues**:
  - **15 `bg-brand-*` / `text-brand-*` occurrences.** Worst is the heatmap color ramp (lines 56-62): `bg-brand-100 / brand-50 / brand-200 / brand-300 / brand-400`. Literally using legacy brand scale as a data ramp. Design system has no heatmap spec — either (a) replace with a coastal-to-golden ramp using actual Koast tokens, or (b) defer until Track B rebuilds this page's structure (see Observability section).
  - **44 `text-neutral-*` / `bg-neutral-*` references**, including page headings (`text-neutral-800 mb-1` for "Dynamic Pricing" on line 334) and secondary text (`text-neutral-500` for the subtitle). These are aliased-to-Koast but the headings should be `text-coastal` per Section 2.
  - **Zero entrance animations**. No stagger, no count-up on the scorecard. The page the product spec calls "THE DIFFERENTIATOR" is the one that loads flat.
  - Mode toggle on line 356 uses `bg-brand-500 text-white` for the active state — should be `bg-coastal text-shore` per Button.Primary spec in Section 11.
  - Page heading "Dynamic Pricing" + "AI-powered rate optimization" (lines 334-335) — product spec 4.5.3 says the Pricing tab should lead with **a scorecard** (leaving $X on the table), not a page title. Open question whether this global /pricing view should align with /properties/[id]#pricing or diverge intentionally.
- **Effort**: 10-14 hours. Separate token sweep from heatmap-color decision. If Track B is going to rebuild the page anyway (new scorecard, new recommendations list, rules editor, performance tracker), fold this into Track B instead of double-touching.
- **Blocking**: **Coupled to Track B.** Polish it once, not twice.

### Reviews (/reviews) — `app/(dashboard)/reviews/page.tsx` (665 lines, no client-component wrapper)
- **Severity: medium**
- **Issues**:
  - 3 `text-brand-*` / 23 `text-neutral-*` references — table/feed rendering and the stars rating component (line 189 uses `text-neutral-300` for un-filled stars; should be `text-shell`).
  - `bg-neutral-50 rounded-lg p-3` on line 338 for the guest message preview — should be `bg-shore rounded-[14px] p-3` per Section 4 radius + Section 1 neutral usage.
  - Entrance animations missing.
- **Effort**: 4 hours. Token sweep + radius fix + stagger the review cards.
- **Blocking**: no.

### Turnovers (/turnovers) — `components/dashboard/TurnoverBoard.tsx` (830 lines)
- **Severity: low-medium**
- **Issues**:
  - Zero brand/gray drift — clean tokens.
  - **Zero entrance animations.** Kanban cards should stagger in by column.
- **Effort**: 2 hours. Wrap columns in cascading reveals.
- **Blocking**: no.

### Market Intel (/market-intel) — `components/dashboard/AnalyticsDashboard.tsx` (1,027 lines)
- **Severity: low**
- **Issues**: 3 `useCountUp`, 2 animation refs. No drift. Biggest product-spec gap vs CLAUDE.md: the spec 4.8 says "Map + market analytics" with glass stats up top and a Leaflet map 60/40 with comp sidebar. Worth a spot-check that the layout matches the mockup.
- **Effort**: 2 hours (walkthrough).
- **Blocking**: no.

### Comp Sets (/comp-sets) — page.tsx (68 lines) + `components/dashboard/CompMap.tsx` (146 lines)
- **Severity: low**
- **Issues**:
  - `CompMap.tsx:92` + `:134` use `text-brand-500` — should be `text-coastal` or `text-golden` depending on context.
  - 3 `text-neutral-*` references — low volume, quick sweep.
- **Effort**: 1 hour.
- **Blocking**: no.

### Property Detail (/properties/[id]) — `components/dashboard/PropertyDetail.tsx` (1,863 lines)
- **Severity: medium** (sprawling, needs a walkthrough)
- **Issues**:
  - Zero `bg-brand-*` / zero gray drift in the top-level component — clean at the file level.
  - 2 `useCountUp`, 2 animation refs. Hero has some choreography. The three tabs (Overview/Calendar/Pricing) likely need stagger audits individually.
  - Product spec 4.5.3 (the Pricing tab) is THE differentiator page — scorecard → recommendations → rules → performance. Today's Pricing tab shows a scorecard + chronological recommendations but no rules editor (pricing_rules doesn't exist yet) and no performance tracker (pricing_performance doesn't exist).
- **Effort**: 6-8 hours across all three tabs + the hero. The Pricing tab rebuild is Track B work (same blocking note as /pricing).
- **Blocking**: Pricing tab coupled to Track B.

### Global / Design System Gaps found during this audit

These aren't per-page fixes — they're one-time infrastructure gaps.

1. **`globals.css` is missing the three keyframes DESIGN_SYSTEM.md Section 16 specifies**: `fadeSlideIn`, `cardReveal`, `aiGlow`. Current file has `fadeIn`, `slide-in-right`, `slide-in-left`, `shimmer`. Any page trying to match the spec will fall back to `fadeIn` (wrong curve/transform) or `slide-in-*` (wrong direction). **Ship the three keyframes first.** One-file fix, unblocks all per-page entrance work.
2. **DESIGN_SYSTEM.md line count drift**: CLAUDE.md says "Full details in `DESIGN_SYSTEM.md` (1,119 lines)" — actual count is **459 lines**. Update CLAUDE.md. (Noted: the 1,119-line version may have existed and been compacted; docs should reflect current state.)
3. **DESIGN_SYSTEM.md Section 8 still documents VRBO** (`vrbo.svg (TODO)` in the file list and full `vrbo:` config in the TS export). We dropped VRBO from `PLATFORMS` on 2026-04-17 — update Section 8 to remove the VRBO block and add the "intentionally omitted" note.
4. **Onboarding SMS templates contain 12+ emoji**: `src/lib/onboarding/default-templates.ts` lines 14, 18-19, 35-36, 49-50, 54, 65, 70-71, 104, 130 — 🎉 📅 🔑 📶 📋 🏡 🙏 🌟. These are user-visible (they're auto-sent to guests). Violates Section 15 "No emojis anywhere in AI drafts, reviews, UI, activity feed, notifications." This is a rebrand-debt finding missed in prior sweeps because I only grep'd for user-visible StayCommand strings earlier. **Highest-severity single finding in Track A.**
5. **`src/components/dashboard/BookingComConnect.tsx:227`** uses `⚠` (U+26A0). Same rule violation. Swap for solid coral-reef dot or AlertTriangle Lucide icon.
6. **`src/components/calendar/MonthlyView.tsx:556`** uses `⚠︎` in the overbooking tooltip. Same fix.
7. **Design System Gap suggestion** (not fix, flag): there's no documented spec for heatmap color ramps. PricingDashboard invented one using `bg-brand-50→400`. A coastal→golden or shore→amber-tide ramp would match the palette; add to DESIGN_SYSTEM.md when Track B lands the new Pricing page.

### Track A effort estimate
- Per-page polish (10 pages, bullets above): **~30 hours**
- Global infra (keyframes + emoji sweep + doc fixes): **~4 hours**
- **Total: ~34 hours.** Can split across 4-5 focused sessions, no cross-page coupling except Pricing-tab (which waits on Track B).

---

## Track B — Pricing Engine + Automation Pipeline

### Current state — verified facts (not assumptions)
- **Engine**: `src/lib/pricing/engine.ts` + `signals/` + `forecast.ts` + `scenarios.ts`. 9 signals documented and weighted in `CLAUDE.md`. Exposed via `/api/pricing/calculate/[propertyId]`.
- **Validator**: `~/koast-workers/pricing_validator.py` — runs daily 6 AM ET (10:00 UTC), calls `/api/pricing/calculate/{property_id}` via HTTP, fetches live Airbnb rate from Channex, writes `pricing_recommendations`. Read-only by design.
- **Data today**: 480 rows in `pricing_recommendations` (2 props × 60 dates × 4 runs Apr 13-16). `pricing_recommendations_latest` view exists.
- **Tables present**: `pricing_outcomes` (used by seasonality signal after 30+ days). `pricing_recommendations`. `calendar_rates` (has `rate` / `suggested_rate` / `applied_rate` columns; `channel_code` added per the calendar per-channel migration).
- **Tables missing**: `pricing_rules`, `pricing_performance` (documented but no migration).
- **Existing API surface**:
  - `/api/pricing/calculate/[propertyId]` — trigger engine run
  - `/api/pricing/approve` — exists
  - `/api/pricing/outcomes` — exists
  - `/api/pricing/override` — exists
  - `/api/pricing/preview` — exists
  - `/api/pricing/push` — exists (hardened with HTTP 207 partial-failure per CLAUDE.md Reliability Infrastructure)
  - `/api/pricing/sync-channex` — exists
  - `/api/pricing/[propertyId]` — exists
  - `/api/channels/rates/[propertyId]` — the calendar rate editor's save path; BDC parent-rate-only, full-window aware
- **UI today**: `components/dashboard/PricingDashboard.tsx` (global /pricing) + PropertyDetail Pricing tab. Apply buttons exist but don't POST. Heatmap, mode toggle, signal breakdown cards present.

### Signal weights — are they right?
The four days of validator data are too thin to propose weight changes with evidence. The current split (Demand 20, Competitor 20, Seasonality 15, Events 12, Gap 8, Pace 8, Lead 7, Weather 5, Supply 5) is defensible. After 14 days, the data should tell us:
- Villa Jamaica stabilized around +7% vs market → signals may be over-weighting demand (it's been consistently high)
- Cozy Loft stays flat +$6/night +8.7% every day → the engine may be applying a constant "rate is too low by ~9%" signal without variance; worth inspecting whether Seasonality/Events/Weather are actually firing for Cozy Loft or if it's pure Competitor+Demand math.

**Proposal**: no weight changes now. Add an observability dashboard (Section 7 below) that surfaces which signals fired and by how much per (property, date). At 14+ days, revisit weights with the data.

### Pipeline architecture

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                  DAILY VALIDATOR (10:00 UTC)            │
                    │  VPS cron → POST /api/pricing/calculate/{propertyId}    │
                    │  engine.ts computes 9 signals → writes calendar_rates   │
                    │  fetch live Channex rates → write pricing_recommendations│
                    └──────────────────────────┬──────────────────────────────┘
                                               │ (read-only today)
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   RULES ENFORCEMENT LAYER (NEW)                             │
│  pricing_rules (per property): base, min, max, channel_markups, guardrails, │
│                                auto_apply                                   │
│                                                                             │
│  Given a recommendation (suggested_rate):                                   │
│    1. Clamp to [min_rate, max_rate]                                         │
│    2. Enforce per-day-delta guardrail: abs(new − previous_applied) ≤ cap    │
│    3. Enforce comp-set floor: new ≥ (min_rate OR comp_set_p25)              │
│    4. If auto_apply AND all guardrails pass AND validation_days ≥ 14:       │
│         → Queue for APPLY                                                   │
│       Else:                                                                 │
│         → Write row to pricing_recommendations with status='pending'        │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        APPLY LAYER                                          │
│  Host clicks Apply (or auto-apply queues it)                                │
│    → POST /api/pricing/apply (new, replaces /pricing/push for this path)    │
│    → Compute per-channel rate = base × (1 + channel_markups[channel])       │
│    → Batch into 200-entry chunks per channel rate_plan                      │
│    → Push via existing channex.updateRates (Airbnb + BDC parent rate)       │
│    → HTTP 207 on partial failure with per-date ranges                       │
│    → Write pricing_performance row: suggested_rate, applied_rate,           │
│       applied_at, channels_pushed[]                                         │
│    → Update pricing_recommendations.status='applied', applied_at=now()      │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│               OUTCOME CAPTURE (BOOKING-TIME, async)                         │
│  Existing Channex webhook / revision poll fires for booking_new             │
│    → For the booking's date range, find pricing_performance rows            │
│    → Update: booked=true, actual_rate=booking.price, revenue_delta=         │
│       (actual − suggested) × nights                                         │
│                                                                             │
│  pricing_outcomes (already exists, used by seasonality) — extend with       │
│    occupancy-at-this-rate data for the learning loop                        │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              SEASONALITY FEEDBACK (EXISTING, NOW WIRED)                     │
│  engine.ts signals/seasonality.ts already reads pricing_outcomes.           │
│  After 30+ days of pricing_performance rows, seasonality weight kicks in.   │
│  No change — just needs the upstream data flowing.                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Migration SQL (draft — do not apply until approved)

```sql
-- supabase/migrations/<ts>_pricing_rules_and_performance.sql

CREATE TABLE IF NOT EXISTS pricing_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         uuid NOT NULL UNIQUE REFERENCES properties(id) ON DELETE CASCADE,
  base_rate           numeric(10, 2) NOT NULL,
  min_rate            numeric(10, 2) NOT NULL,
  max_rate            numeric(10, 2) NOT NULL,
  -- JSON: { "airbnb": 0.0, "booking_com": 0.15, "direct": -0.10 }
  channel_markups     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Max absolute swing allowed in one push, as a fraction. 0.20 = ±20%/day.
  max_daily_delta_pct numeric(5, 4) NOT NULL DEFAULT 0.20,
  -- Floor relative to comp-set. 0.85 = never push below 85% of comp-set p25.
  comp_floor_pct      numeric(5, 4) NOT NULL DEFAULT 0.85,
  -- JSON: seasonal override map { "2026-12-20/2027-01-05": 1.35, ... }
  seasonal_overrides  jsonb DEFAULT '{}'::jsonb,
  auto_apply          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (min_rate <= base_rate AND base_rate <= max_rate),
  CHECK (max_daily_delta_pct > 0 AND max_daily_delta_pct <= 1.0),
  CHECK (comp_floor_pct >= 0 AND comp_floor_pct <= 1.0)
);

CREATE TABLE IF NOT EXISTS pricing_performance (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  date              date NOT NULL,
  suggested_rate    numeric(10, 2) NOT NULL,
  applied_rate      numeric(10, 2),              -- null if not yet applied
  actual_rate       numeric(10, 2),              -- null until a booking closes on this date
  applied_at        timestamptz,
  booked            boolean NOT NULL DEFAULT false,
  booked_at         timestamptz,
  revenue_delta     numeric(10, 2) GENERATED ALWAYS AS (
    CASE WHEN booked AND actual_rate IS NOT NULL AND suggested_rate IS NOT NULL
         THEN actual_rate - suggested_rate ELSE NULL END
  ) STORED,
  channels_pushed   text[] DEFAULT ARRAY[]::text[],
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_performance_property_date
  ON pricing_performance(property_id, date);

CREATE INDEX IF NOT EXISTS idx_pricing_performance_applied
  ON pricing_performance(applied_at DESC) WHERE applied_at IS NOT NULL;

-- Extend pricing_recommendations to track status (pending/applied/dismissed)
ALTER TABLE pricing_recommendations
  ADD COLUMN IF NOT EXISTS status       text    NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS applied_at   timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS urgency      text,  -- act_now / coming_up / review
  ADD COLUMN IF NOT EXISTS reason_text  text;  -- plain-English summary

CREATE INDEX IF NOT EXISTS idx_pricing_recommendations_status_pending
  ON pricing_recommendations(property_id, date) WHERE status = 'pending';
```

Notes on the migration shape vs CLAUDE.md's documented sketch:
- Added `max_daily_delta_pct` and `comp_floor_pct` (guardrails) — not in prior sketch, essential for auto-apply safety.
- Added `CHECK` constraints to prevent impossible rule configs.
- Extended `pricing_recommendations` rather than duplicating data in `pricing_performance`. The "latest view" stays useful; status fields enable the "act now / coming up / review" UI in the product spec 4.5.3 Section 2.

### API route inventory

| Route | Status | Change |
|---|---|---|
| `GET /api/pricing/calculate/[propertyId]` | exists | no change |
| `GET /api/pricing/[propertyId]` | exists | extend to include rules + recent performance summary |
| `POST /api/pricing/apply` | **new** | applies one recommendation (single date or range). Body: `{ property_id, date_range, channels }`. Returns 207 on partial. |
| `POST /api/pricing/dismiss` | **new** | `{ recommendation_id }` → `status='dismissed'` |
| `GET /api/pricing/rules/[propertyId]` | **new** | returns the row from `pricing_rules` (or 404 if unset — triggers onboarding prompt) |
| `PUT /api/pricing/rules/[propertyId]` | **new** | upsert row |
| `GET /api/pricing/performance/[propertyId]` | **new** | last 30/60/90 days of `pricing_performance` + accepted-vs-ignored + revenue impact |
| `/api/pricing/approve`, `/preview`, `/override`, `/outcomes`, `/push`, `/sync-channex` | exist | audit — some may be redundant with the new /apply. Don't delete until Track B ships, but flag for consolidation after. |
| `/api/channels/rates/[propertyId]` | exists | no change — calendar rate editor keeps using this. The pricing /apply route calls the same underlying `channex.updateRates` helper. |

### UI changes per page

**/properties/[id] Pricing tab** (PropertyDetail.tsx — the designated home for the pipeline UI per product spec 4.5.3):
- Section 1: Scorecard — "You're leaving $X on the table this month" + revenue-captured bar. Dollar counts up. Uses data from new `GET /api/pricing/performance` + `pricing_recommendations_latest`.
- Section 2: Recommendations list, grouped by urgency (`act_now` / `coming_up` / `review`). Each row: date range, current, suggested, reason_text. Expand → signal breakdown. Per-row Apply + per-group "Apply all".
- Section 3: Rules editor — form backed by `pricing_rules`. Base/min/max, per-channel markup sliders, guardrail inputs, seasonal override list, auto-apply toggle (disabled until validation_days ≥ 14).
- Section 4: Performance panel — last 30 days accepted vs ignored, "Koast suggested $X, you booked at $Y — Z% accuracy", chart of suggested-vs-actual over time.

**/pricing (global)** — keep for portfolio rollup but stop duplicating the per-property editor. Strip the heatmap back to an overview grid; the per-property work happens on the detail page.

**Dashboard AI insight card** — already exists; once pricing_performance has data, surface "Act-now recommendation worth +$X this week" as a top-priority insight.

### Rollout plan (three stages, gated on evidence)

1. **Stage 1 — Shadow mode (ship Track B code, auto_apply disabled)**
   - All migrations applied; new routes live; UI wired
   - `pricing_rules` defaults auto_apply=false
   - Validator continues writing `pricing_recommendations`
   - Apply-layer writes `pricing_performance` on every manual Apply
   - Guardrails enforced on manual Apply too (clamp to min/max, reject if Δ > max_daily_delta_pct)
   - **Exit criteria**: ≥14 daily recommendation runs per property with ≥70% guardrail-passable recommendations

2. **Stage 2 — Gated auto-apply (per-property opt-in)**
   - Host can toggle `auto_apply` per property once the property has 14+ validation days
   - Auto-apply respects ALL guardrails; if any fail, writes `status='pending'` instead of applying
   - Email notification on every auto-apply ("Koast adjusted Villa Jamaica rate for Apr 28 — $230 → $245, +6.5%")
   - 7-day grace period: any auto-applied change can be reverted via "Revert" in the recommendations list for 7 days
   - **Exit criteria**: ≥30 days of auto-apply data per property, ≥85% of applied rates result in bookings OR the unbooked rate is within the max_daily_delta band

3. **Stage 3 — Full auto (default on for new properties)**
   - New properties default to auto_apply=true (with host seeing a "Koast is pricing this property automatically" badge and a one-click off)
   - Keep guardrails in place
   - Add notification throttling (summary email daily, not per-change)

### What breaks if we ship and we're wrong

| Scenario | Blast radius | Mitigation | Rollback |
|---|---|---|---|
| Engine produces a bad suggestion + auto-apply pushes it | One property's rates for the affected date range. No double bookings, no channel disconnect — just a bad price. | `max_daily_delta_pct` caps the damage at ≤20%/day by default. Guardrails reject `actual_rate < comp_floor_pct × comp_set_p25`. | Set `auto_apply=false` on `pricing_rules`. Existing "Revert" flow (manual calendar rate editor) can push a corrective rate via the same `/api/channels/rates` path. |
| Migration applied but API routes ship with a bug | API 500s on /apply and /rules. Calendar rate editor still works (different code path), so hosts aren't blocked from pricing their properties manually. | Feature-flag the new routes. Keep existing `/api/pricing/push` live during Stage 1. | Revert the migration's ADD COLUMN IF NOT EXISTS — safe. `CREATE TABLE IF NOT EXISTS` — drop them if needed (zero rows during shadow mode). |
| Outcome-capture webhook handler crashes during a booking_new event | Booking still created (webhook idempotency already hardened per CLAUDE.md Reliability Infrastructure). pricing_performance row missed. | Accept the miss — it just means seasonality won't learn from that booking. No user-facing failure. | N/A — non-blocking failure. |
| Guardrails too strict, every suggestion gets clamped to min_rate | Host sees no rate movement despite engine suggesting otherwise. | Surface guardrail-clamped suggestions in the UI ("Koast wanted to suggest $310 but hit your max of $290") so the host can relax rules. | Host edits pricing_rules; no code rollback needed. |
| Apply pushes to BDC but hits a slave rate | Channex returns `RATE_IS_A_SLAVE_RATE`. | Parent-rate discovery already implemented per CLAUDE.md Channex section. | Existing 207 partial-failure handling surfaces the offending date range. |

### Observability (Section 7 of Track B requirements)

Deep Q for the host: "What did the engine do today, why, and should I trust it?"

**Recommendation**: Build into Property Detail Pricing tab as Section 4, rather than a separate `/pricing/audit` route. Three reasons:
1. Single-property context is the natural unit — audit is meaningful per property, not portfolio-wide.
2. The host is already on the Pricing tab when they want to trust the engine; don't make them navigate to a separate page to verify.
3. The design system's Section 17.6 says "Pricing tab shows actions, not dashboards" — but performance tracking IS a trust-builder, not a dashboard in the signal-cards sense. It's revenue proof.

**Contents**:
- "Today's run" block: last `pricing_recommendations.created_at` with count of suggestions, how many applied, how many dismissed, how many sitting pending.
- "Last 30 days": chart of suggested vs applied vs actual. Uses `pricing_performance`.
- Signal firings heatmap: for a selected date, which signals contributed what (reason_signals JSONB from `pricing_recommendations`). Expandable per date.
- "Why not auto-apply?" block: if auto_apply=false OR validation_days < 14 OR recent guardrail violations, explain which condition blocks it.

One new route: `GET /api/pricing/audit/[propertyId]?date=YYYY-MM-DD` — returns the full signals breakdown for a single date, JSONB unpacked to UI-friendly shape.

### Track B effort estimate
- Migrations + new API routes: **10-14 hours**
- Apply layer + guardrail logic + outcome capture wiring: **8-12 hours**
- UI rebuild of PropertyDetail Pricing tab (4 sections per product spec): **16-22 hours** (polish-pass absorbed here)
- Observability Section 4 (uses same scaffolding as UI): **3-5 hours**
- Stage 1 rollout + monitoring setup: **3-5 hours**
- Stages 2 and 3 unlock over time, no additional build work after Stage 1 ships
- **Total build: ~45-60 hours** for Stage-1-ready code.

---

## Track C — Net-new Proposals

Bias applied: only surface things that either (a) ride existing infrastructure or (b) would be visibly painful to ship without. Two proposals filed as "don't build" at the end.

### Proposal C1: ChannelPopover extension — show pricing delta on hover
- **What**: When hovering a platform badge on a property card, add a third stat ("Avg rate: $230, +$15 vs market") alongside the existing bookings/revenue/rating. Uses `pricing_recommendations_latest` + `market_comps`.
- **Why now**: ChannelPopover is already the only interactive platform-logo in the industry (per CLAUDE.md competitive edges). Adding pricing is one more reason to hover. Zero new components — extend the existing Stats row.
- **Prime Directive fit**: Revenue Impact (showing the rate-vs-market gap motivates Apply), Competitive Moat (deepens the "data surface" philosophy).
- **Scope**: ~2 hours. Single component edit, one additional query in the existing `useChannelDetails` hook. No new tables.
- **Blocks**: depends on Track B's `pricing_recommendations` population to be meaningful; ships best after Stage 1.
- **Risk**: null-handling if a channel hasn't been validated yet. Reversibility: trivial — remove the stat row field.

### Proposal C2: Daily pricing digest email
- **What**: Once/day email to each host summarizing: N pending recommendations worth $X combined, 1-click Apply-all link that deep-links into Property Detail.
- **Why now**: Hosts don't live in Koast. A 30-second email at 9am beats requiring them to open the app daily. Per CLAUDE.md Decision Criteria, "Host Time Savings" is the top criterion.
- **Prime Directive fit**: Host Time Savings, Revenue Impact (accept rate likely doubles when the prompt comes in email vs requires app visit).
- **Scope**: ~6 hours. New cron worker on VPS (same pattern as pricing_validator.py), SendGrid or Resend integration (new dep), email template. One new table `email_digest_log` for dedup + unsubscribe state.
- **Blocks**: needs Track B Stage 1 (pending recommendations need to exist). No Track A dependency.
- **Risk**: deliverability (if we use a free-tier email provider). Unsubscribe must be one-click. Reversibility: kill the cron, no rollback needed.

### Proposal C3: Pricing recommendations feed on Dashboard AI Insight card
- **What**: Surface the single highest-dollar pending recommendation as the Dashboard's primary AI insight card. "Act now: +$185 on Villa Jamaica Apr 25-27. Apply?"
- **Why now**: DashboardClient already has AI insight card scaffolding (dark deep-sea + golden glow per design philosophy principle #3). Filling it with the single-best recommendation is the "Show me the money" principle in action.
- **Prime Directive fit**: Host Time Savings (answers the morning question in 3 seconds), User Delight (dollar amounts count up — video-worthy).
- **Scope**: ~3 hours. New query (top-1 pending recommendation by absolute revenue delta) + existing card styling. No new tables.
- **Blocks**: Track B Stage 1.
- **Risk**: stale data if no recent run; show "No actions needed" state instead of empty card. Reversibility: trivial.

### Proposal C4: Per-property knowledge-base seed from Airbnb listing data
- **What**: When a property is imported from Airbnb, scrape the listing's description + house rules + amenities and seed a `property_knowledge` table. Prep work for the AI messaging pipeline.
- **Why now**: AI messaging is Phase 2. Seeding the KB during Phase 1 imports means when Phase 2 ships, every existing property already has context. No manual host data entry.
- **Prime Directive fit**: Host Time Savings (zero-setup AI messaging), Competitive Moat (no other PMS ships with pre-filled local knowledge from listing data), Data Flywheel.
- **Scope**: ~6 hours. New `property_knowledge` table (already sketched in product spec Part 7). Extend the existing Airbnb listing-details scraper at `src/app/api/airbnb/listing-details/route.ts`. Claude API call to structure the raw text into categories.
- **Blocks**: no hard deps. Slots naturally after Track A properties-polish.
- **Risk**: scraping TOS. Mitigate by only writing fields the host has already explicitly listed publicly, never private data. Reversibility: drop the table, remove scraper hook.

### Proposal C5: "What changed overnight" activity feed entry
- **What**: Dashboard activity feed currently shows bookings + messages + cleaning confirmations. Add one more: "Koast adjusted 3 rates overnight" with a click-through to see what.
- **Why now**: Once auto-apply ships (Track B Stage 2), hosts need visibility into what Koast did without them asking. Currently invisible.
- **Prime Directive fit**: User Delight (confidence that Koast is working), data flywheel (host sees the dollar impact).
- **Scope**: ~2 hours. Extend activity feed query to include pricing_performance rows with applied_at in last 24h. Existing feed scaffolding.
- **Blocks**: Track B Stage 2.
- **Risk**: low. Reversibility: remove the feed entry type.

### Proposal C6: Comp-set auto-bootstrap from AirROI on property import
- **What**: When a property is imported, automatically add the nearest N matching AirROI listings (same bed count, ±20% nightly rate) as the comp set. Host can edit later.
- **Why now**: Today the comp set starts empty, which breaks the Competitor signal (20% weight!). Every new host has a cold-start problem.
- **Prime Directive fit**: Host Time Savings, Revenue Impact (engine is 20% more accurate immediately), Data Flywheel.
- **Scope**: ~5 hours. New helper in `src/lib/pricing/signals/competitor.ts` (or adjacent). Runs on property INSERT via DB trigger or app-layer hook. No new tables.
- **Blocks**: no hard deps. Can ship in Track A's Properties polish window.
- **Risk**: bad comp picks if AirROI data is sparse in the property's market. Mitigate: fall back to "No comp set — add one to enable competitor signal" banner if <3 matches found. Reversibility: trivial.

### Proposal C7: Sidebar disconnect indicator (visual precursor to channel health monitoring)
- **What**: Dot indicator on "Properties" sidebar nav when any property has a degraded/disconnected channel. Precursor to full channel-health worker (UPCOMING FEATURES).
- **Why now**: The full 5-min health worker is Phase 2+ scope. A read-only "did any sync fail in last 24h" query from `channex_sync_state` + `channex_webhook_log` is a cheap precursor that lights up the indicator pattern, even before the dedicated table exists.
- **Prime Directive fit**: Host Time Savings (surfaces issues without requiring them to check each property).
- **Scope**: ~3 hours. Sidebar component extension. One aggregate query runs on dashboard mount + polls every 60s.
- **Blocks**: no.
- **Risk**: false positives if `channex_sync_state` has stale rows. Accept: better to false-alarm than silently miss a disconnect.

### Proposal C8 — FILED AS "DON'T BUILD": Chart library fallback for revenue chart
- **What**: Suggest adding chart.js as a fallback for the Canvas-drawn revenue chart, in case the canvas implementation has edge cases.
- **Why NOT**: Design system Section 18 explicitly lists "Chart.js, recharts, or any chart library" under DON'T, and the Canvas chart is a competitive edge per the COMPETITIVE EDGES table. Adding a fallback would erode the moat it's supposed to be.

### Proposal C9 — FILED AS "DON'T BUILD": /pricing/audit as separate route
- **What**: A dedicated `/pricing/audit` route showing signal breakdowns.
- **Why NOT**: Audit is meaningful per-property, not portfolio-wide. A separate route would force context-switching. Already folded into Track B's Property Detail Section 4. Don't double-surface.

---

## Track D — Host Psychology Pass (DEFERRED — plan after Track B Stage 1)

Status: Stub only. Full planning pass happens AFTER Track B Stage 1 ships, because psychological copy audits need a real shipped experience to audit against — writing copy for an unshipped Pricing tab produces guesses; writing it for a real tab with real data produces surgical fixes.

Scope preview (to be expanded in a dedicated /ultraplan session):

1. **First-run experience** (the 3-minute show-the-money goal). Target: from "host completes signup" to "host sees a real dollar opportunity they can act on in one click" in under 3 minutes. Today the first-run likely lands on an empty dashboard. Needs an emotional arc: connect → immediate revealed value → feel smart for choosing Koast. Touches onboarding flow, first dashboard state, first PropertyDetail visit.

2. **Copy audit across every UI state.** Loading, empty, error, success, "why this suggestion," guardrail-clamped, auto-applied, reverted. Explicit tone guidelines (warm but precise, confident but not salesy, transparent about reasoning). Today copy is ad-hoc per component.

3. **The "rescue moment" feature.** When the engine detects a host-set rate severely below market on a high-demand date, surface it as a rescue alert ("You have Villa Jamaica at $180 for Gasparilla weekend — market is $340. Apply $295?") rather than a normal recommendation. Psychologically, "Koast saved me from losing $200" is a stronger retention driver than "Koast found $50." Uses existing `pricing_recommendations` data; just a UI + threshold addition.

4. **Durable proof surfaces.** "You've earned $X with Koast in 2026" persistent on dashboard. Not a chart — an identity statement. Computed from `pricing_performance.revenue_delta` summed. Anchors the relationship over time.

5. **Decision-fatigue patterns.** Recommendations list today shows everything. For a host with 5 properties × 60 dates = 300 potential items, default to "top 5 by revenue impact" with progressive disclosure to "show all." Respects host attention budget.

6. **Transitional state copy.** Instead of generic loading spinners during pricing recalculation, show "Analyzing 14 comps and 3 events for this weekend..." — trust compounds in these micro-moments. Requires exposing what the engine is doing to the UI layer.

7. **"Meet your pricing engine" walkthrough.** One-time onboarding flow introducing each of the 9 signals with a concrete example for the host's own property. Converts the black box from intimidating abstraction to transparent competitive moat. Hosts don't know what "supply pressure" or "gap night" means today — and they won't trust what they don't understand.

8. **Negative-space anxiety handling.** When the engine suggests a rate *drop*, host instinct is to override. The `reason_text` field exists (Track B), but whether "Market softened 8% this week based on 14 comps" vs "Demand signal: 0.32" gets written is a copy decision that determines whether the host overrides or trusts. Audit every downward-suggestion path.

9. **Multi-unit property structure.** If 10%+ of hosts have multi-unit setups (e.g. main house + casitas at same address, like Villa Jamaica + Cozy Loft today), design parent-child property modeling, shared-field inheritance (address, lat/lng, photos, channel mappings where appropriate), and UX for switching between units without losing context. Until that threshold, accept the current flat model and the co-location caveats in CLAUDE.md Known Data Quality Issues.

### Out of scope for Track D (noted here to prevent scope creep)
- Social proof claims ("X hosts accepted similar recs") — requires cross-account data aggregation and careful privacy handling; defer until Koast has >50 active hosts.
- Gamification (streaks, badges, leaderboards) — not aligned with the premium tone in DESIGN_SYSTEM.md.
- Referral mechanics — separate growth project.

### Effort estimate (rough, will refine during dedicated planning)
~20-30 hours spanning copy rewrites, a new onboarding flow, a rescue-moment detector query + UI, and the signal walkthrough. Zero new tables; all work rides existing `pricing_recommendations` / `pricing_performance` / `properties` data.

### Trigger to begin
Track B Stage 1 has shipped AND at least one property has 7+ days of `pricing_performance` rows AND first-run flow has been walked by a real test user (not Cesar) so the gaps are visible rather than theoretical.

---

## Execution Sequencing

### Parallelism
| Track pair | Can run parallel? | Reason |
|---|---|---|
| Track A (non-Pricing pages) + Track B | yes | Zero file overlap. 8 of 10 Track A pages don't touch pricing code. |
| Track A Pricing pages + Track B UI rebuild | NO | Same files. Track B rebuilds the Pricing tab; polishing it separately is wasted work. Fold Track A's pricing polish into Track B. |
| Track C proposals | mostly yes | Each is independent. C1/C3/C5 depend on Track B Stage 1 data. C6 can ship during Track A window. C2/C4/C7 are fully parallel. |

### Suggested order
1. **Pre-work (2 hours)**: add `fadeSlideIn` / `cardReveal` / `aiGlow` keyframes to globals.css + fix 3 emoji strings + drop VRBO from DESIGN_SYSTEM.md Section 8 + fix DESIGN_SYSTEM.md line-count mention in CLAUDE.md. Unblocks all per-page animation work.
2. **Track A sprint 1 (10 hours)**: Calendar, Turnovers, Dashboard greeting, Messages polish + on-boarding emoji sweep. Ship as one PR.
3. **Track A sprint 2 (10 hours)**: Properties AddPropertyModal, Reviews, Comp Sets. Ship as one PR.
4. **Track B Stage 1 (45-60 hours, can split 3-4 PRs)**: migrations → rules API → apply API → outcome capture → UI rebuild of PropertyDetail Pricing tab → observability. Absorbs Pricing page polish.
5. **Track C C6 (comp-set bootstrap) in parallel with Track A sprint 2** — 5 hours, touches different files.
6. **Track C C4 (knowledge-base seed)** after Track A lands — 6 hours.
7. **Track C C1/C3/C5/C7** after Track B Stage 1 — each 2-3 hours.
8. **Track C C2 (daily digest)** after Stage 1 is proven (2 weeks of data) — 6 hours.
9. **Track D planning pass** (separate /ultraplan session) — once Track B Stage 1 is live and has 7+ days of real `pricing_performance` data. This pass audits the SHIPPED experience, not the planned one, and produces a full Track D execution plan.
10. **Track D execution** (~20-30 hrs) — after its own planning pass.

Total path to "Tracks A, B, C shipped" + Track D planned: ~5-6 focused weeks. Track D execution adds another ~2 weeks after Stage 1 data accumulates.

---

## Open Questions for Cesar

1. **Pricing polish strategy**: fold Track A's Pricing drift into Track B's rebuild, or do the polish pass first to make progress visible? My recommendation is fold-into-B; the token sweep happens "for free" during the rebuild. Confirm.
2. **`/pricing` vs `/properties/[id]#pricing` divergence**: should the global view eventually be a read-only portfolio rollup (my recommendation per product spec 4.5.3 "per-property pricing is the differentiator"), or stay as a power-user editor?
3. **Track C cuts**: of the seven "do build" proposals, any you want to cut upfront? C6 (comp-set bootstrap) has the biggest engine-quality impact and I'd push for it ASAP. C2 (email digest) is the easiest retention lever.
4. **Auto-apply default**: Stage 3 proposes "default on for new properties." Is that too aggressive? Alternative is opt-in forever, with a prominent toggle.
5. **DESIGN_SYSTEM.md line-count drift**: was there a longer version that got compacted, or is 1,119 a typo in CLAUDE.md? I'll correct CLAUDE.md either way but want to know if there's a richer design doc I should be reading.
6. **Onboarding SMS templates** — user-visible emoji on 12+ lines. Biggest single rebrand-debt finding. Approve rewrite as part of Track A pre-work, or defer as a separate strip since the templates may be intentionally friendly-guest-voice?
7. **Mockups fidelity**: the six HTML mockups in `docs/mockups/` were built for the redesign cycle. Should they be updated to reflect Track B's new Pricing tab, or are they frozen design artifacts (and the new Pricing tab is designed fresh against DESIGN_SYSTEM.md alone)?
8. **`/api/pricing/*` consolidation**: existing routes (`/approve`, `/preview`, `/override`, `/push`, `/sync-channex`) have semantic overlap with Track B's new `/apply`. Audit + consolidate after Track B ships, or during?

---

*Ready for review. No files changed other than this plan doc.*
