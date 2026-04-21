# Koast — Feature Inventory

*Generated 2026-04-20 — source commit `672c97d`.*

Comprehensive, categorized inventory of every feature, capability, field, page, route, DB table, worker, integration, and API endpoint that exists in Koast today **or** is explicitly planned in handoff docs. This is a source-of-truth audit for Phase 1 of the roadmap work — **no tier recommendations, no prioritization**. Readers draw their own conclusions.

Sources consulted:
- `CLAUDE.md`, `docs/POLISH_PASS_HANDOFF.md`, `docs/SESSION_5a_HANDOFF.md`, `docs/CHANNEX_PER_PLATFORM_AUDIT.md`
- `KOAST_PRODUCT_SPEC.md`, `KOAST_POLISH_PASS_MASTER_PLAN.md`, `KOAST_PROJECT_PLAN.md`, `KOAST_OVERHAUL_PLAN.md`, `DESIGN_SYSTEM.md`, `PLATFORM_ICONS.md`
- Every `supabase/migrations/*.sql` file (27 migrations)
- Every `src/app/api/**/route.ts` (85 routes)
- Every `src/app/(dashboard)/**/page.tsx` and public page
- `~/staycommand-workers/` (7 Python modules + systemd units)
- `docs/postmortems/INCIDENT_POSTMORTEM_BDC_CLOBBER.md`

---

## Legend

| Symbol | Meaning |
|---|---|
| ✅ **SHIPPED** | Working end-to-end in production; users can exercise it today |
| 🟡 **PARTIAL** | Built, wired, and in the UI/API but with an explicit known gap (see source column) |
| 🔵 **PLANNED** | Detailed design spec exists + a named roadmap slot, no shipped code |
| 🟣 **ROADMAPPED** | Mentioned as a follow-up in handoff/roadmap docs without a full spec |
| ⚪ **VISION** | Aspirational direction in product spec/vision; no design artifact, no code |
| ❌ **NOT STARTED** | Documented as a known gap or competitive need, nothing yet |

---

## Summary table

| # | Category | ✅ | 🟡 | 🔵 | 🟣 | ⚪ | ❌ | Total |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Onboarding & Account | 6 | 3 | 3 | 1 | 1 | 2 | 16 |
| 2 | Calendar & Availability | 14 | 5 | 3 | 4 | 0 | 0 | 26 |
| 3 | Pricing Engine | 18 | 4 | 2 | 3 | 1 | 0 | 28 |
| 4 | Channel Management | 17 | 3 | 1 | 1 | 1 | 1 | 24 |
| 5 | Messaging & AI Inbox | 5 | 3 | 5 | 0 | 2 | 1 | 16 |
| 6 | Market Intelligence | 10 | 2 | 1 | 2 | 0 | 0 | 15 |
| 7 | Operations (Turnovers / Cleaning) | 9 | 1 | 2 | 1 | 0 | 0 | 13 |
| 8 | Reporting & Analytics | 6 | 3 | 2 | 2 | 1 | 0 | 14 |
| 9 | AI Capabilities | 3 | 2 | 5 | 1 | 2 | 0 | 13 |
| 10 | Team & Roles | 1 | 0 | 0 | 1 | 2 | 1 | 5 |
| 11 | Infrastructure & Platform | 17 | 3 | 3 | 2 | 0 | 0 | 25 |
| 12 | Direct Booking (Frontdesk) | 0 | 1 | 0 | 0 | 6 | 0 | 7 |
| | **Totals** | **106** | **30** | **27** | **18** | **16** | **5** | **202** |

Status distribution: 52% ✅ SHIPPED · 15% 🟡 PARTIAL · 13% 🔵 PLANNED · 9% 🟣 ROADMAPPED · 8% ⚪ VISION · 2% ❌ NOT STARTED.

---

## 1. Onboarding & Account

Entry path: signup → connect first channel → first property in app. Goal per spec: "host should see their property in Koast within 3 minutes."

### Features

| Feature | Status | Description | Source | Gap |
|---|---|---|---|---|
| Email + password signup | ✅ | Supabase Auth backs `/signup`. Dark AuthShell theme landed in `dd2bb15`. | `src/app/(auth)/signup/page.tsx`, `src/components/auth/AuthShell.tsx` | — |
| Email + password login | ✅ | Same shell at `/login`. | `src/app/(auth)/login/page.tsx` | — |
| Google OAuth button | 🟡 | Button present on login; Supabase Google-provider config not yet completed. | CLAUDE.md "Known Gaps / Not Wired" | Provider config |
| Onboarding page (`/onboarding`) | ✅ | First-run signup → connect → first property. | `src/app/(dashboard)/onboarding/page.tsx` | — |
| Setup default SMS templates | 🟡 | `POST /api/onboarding/setup-templates` seeds `message_templates` on first property. | `src/app/api/onboarding/setup-templates/route.ts` | 12+ emoji in `src/lib/onboarding/default-templates.ts` violate "no emojis" rule (Overhaul Plan Track A #4) |
| Property import from URL | 🟡 | Airbnb listing URL scraper; paste-a-URL flow. | `src/app/api/properties/import-from-url/route.ts` | Tampa-downtown lat/lng heuristic at lines 103-117 (CLAUDE.md "Known Data Quality Issues") |
| Airbnb listing details fetch | ✅ | Retrieves listing metadata on import. | `src/app/api/airbnb/listing-details/route.ts` | — |
| Property import via iCal URL | ✅ | `POST /api/ical/add` with `property_id: "preview"` parses/validates without DB writes. | `src/app/api/ical/add/route.ts`, CLAUDE.md Reliability Infrastructure | — |
| Manual property creation | ✅ | `/properties/new` page. | `src/app/(dashboard)/properties/new/page.tsx` | — |
| Property import page | ✅ | `/properties/import`. | `src/app/(dashboard)/properties/import/page.tsx` | — |
| Auto-scaffolding Channex shells | ✅ | `POST /api/properties/auto-scaffold` creates Channex property shell. | `src/app/api/properties/auto-scaffold/route.ts` | — |
| Scaffold cleanup on re-import | ✅ | Retargets `channex_room_types` / `channex_rate_plans` / `property_channels` + deletes orphan via `channex.deleteProperty`. | CLAUDE.md Reliability Infrastructure, `/api/properties/cleanup-scaffolds/route.ts` | — |
| Geocoding | 🟡 | `POST /api/properties/geocode-all` Nominatim pass. Street-level, not parcel-level. | `src/app/api/properties/geocode-all/route.ts`, CLAUDE.md Known Data Quality | No Google Places Autocomplete; parcel-level precision missing |
| Settings — Account | ✅ | `/settings` with name/email/password. | `src/app/(dashboard)/settings/page.tsx` | — |
| Settings — Preferences | ✅ | `GET/PUT /api/settings/preferences`. | `src/app/api/settings/preferences/route.ts`, `user_preferences` table | — |
| Delete account | ✅ | `POST /api/settings/delete-account`. | `src/app/api/settings/delete-account/route.ts` | — |
| Billing / plan upgrade UI | 🔵 | Product Spec §4.10 describes Free / Pro / Business billing page. Enforcement trigger exists but no Stripe / payment UI. | KOAST_PRODUCT_SPEC.md 4.10, CLAUDE.md Acquisition Strategy | No payment method integration |
| Free-tier property quota | ✅ | `enforce_property_quota` DB trigger. Free=1, Pro=15, Business=unlimited. | `supabase/migrations/20260413010000_free_tier_property_quota.sql`, `user_subscriptions` table | — |
| Signup flow property-count branching | 🔵 | Product Spec: "How many properties do you manage?" question → determines plan suggestion. | KOAST_PRODUCT_SPEC.md §4.11 | — |
| 3-minute time-to-first-property | 🔵 | Onboarding polish milestone. | CLAUDE.md Phase 1 | Not measured |
| Notifications prefs | 🟣 | Email alerts for new bookings, messages, pricing ops, channel disconnects. | KOAST_PRODUCT_SPEC.md §4.10 | — |
| Team invite / co-host permissions | ⚪ | Product Spec flags "future" in Settings §4.10 Team section. | KOAST_PRODUCT_SPEC.md §4.10 | — |
| Revenue Check (public lead-gen) | ✅ | `/revenue-check` public page + `/api/revenue-check` + `/api/revenue-check/lead`. | `src/app/revenue-check/page.tsx`, `leads` table | — |
| Frontdesk waitlist | ✅ | `POST /api/frontdesk/waitlist` collects interest for direct booking builder. | `src/app/api/frontdesk/waitlist/route.ts` | — |
| Koast brand logo | ❌ | Placeholder "K" mark until commissioned design lands. | KOAST_PROJECT_PLAN.md Track 1A, CLAUDE.md Phase 1 | Logo commissioning |
| Domain + email (koasthq.com, hello@) | 🟡 | App cut over to `app.koasthq.com`; marketing email not yet documented as live. | KOAST_PROJECT_PLAN.md Track 1B | — |

### DB tables

- `auth.users` (Supabase managed)
- `user_preferences` (`supabase/migrations/20260329040211_add_user_preferences.sql`)
- `user_subscriptions` (referenced by `enforce_property_quota`)
- `leads` (`supabase/migrations/006_leads.sql`)
- `revenue_checks`
- `concurrency_locks` (`supabase/migrations/20260413020000_concurrency_locks.sql`) — used in connect flow

### API routes

- `POST /api/onboarding/setup-templates`
- `POST /api/properties/import-from-url`
- `POST /api/properties/import`
- `POST /api/properties/auto-scaffold`
- `POST /api/properties/cleanup-scaffolds`
- `POST /api/properties/geocode-all`
- `GET /api/airbnb/listing-details`
- `GET/PUT /api/settings/preferences`
- `POST /api/settings/delete-account`
- `GET /api/revenue-check`, `POST /api/revenue-check/lead`
- `POST /api/frontdesk/waitlist`

### UI pages

- `/login`, `/signup` (auth shell)
- `/onboarding`
- `/properties/new`, `/properties/import`
- `/settings`
- `/revenue-check` (public), `/frontdesk` (placeholder)

### Workers

- None (onboarding is synchronous)

### Explicit gaps

- Direct-booking flag column missing on `properties` (CLAUDE.md Known Gaps — Direct Booking Flag).
- Multi-unit modeling: Villa Jamaica + Cozy Loft share one parcel, no `parent_property_id`. Deferred per `KOAST_OVERHAUL_PLAN.md` Track D item 9.
- Google OAuth flow incomplete.
- Stripe / billing not started.
- Logo not commissioned.

---

## 2. Calendar & Availability

Core day-to-day surface. Airbnb-style monthly grid, 24-month scroll, per-channel rate editor, dark `#222` booking bars.

### Features

| Feature | Status | Description | Source | Gap |
|---|---|---|---|---|
| Multi-property Calendar page (`/calendar`) | ✅ | Polish Session 5a rebuild. | `src/app/(dashboard)/calendar/page.tsx`, `src/components/polish/CalendarView.tsx` | — |
| Airbnb-style month grid | ✅ | Near-square cells, date top-left, rate below. | `CalendarView.tsx` | — |
| 24-month scrollable calendar | ✅ | DESIGN_SYSTEM.md Section 17 pattern. | `CalendarView.tsx` | — |
| Dark #222 booking bars with platform logos | ✅ | `KoastBookingBar` 48px pill. | `src/components/polish/KoastBookingBar.tsx` | — |
| Check-in / checkout overlap (10/90 split + 20% overhang) | ✅ | Apr 20 iteration (commit `672c97d`). `borderRadius` + `hasOverhang` + `hasSeam` props. | `KoastBookingBar.tsx`, `CalendarView.tsx` | — |
| Same-day turnover seam (1.33px white border) | ✅ | All-edges white border on incoming pill. | `KoastBookingBar.tsx` lines 134-144 | — |
| Two-tab Calendar sidebar (Pricing / Availability) | ✅ | Session 5a. | `src/components/polish/calendar/CalendarSidebar.tsx`, `PricingTab.tsx`, `AvailabilityTab.tsx` | — |
| "Base rate across all channels" editor | ✅ | Master rate editor in sidebar. | `src/components/polish/calendar/PricingTab.tsx` | — |
| Per-channel rate overrides in sidebar | ✅ | Hairline indicator on override dates. | `src/components/polish/calendar/PricingTab.tsx` | — |
| Per-channel rate editor (`PerChannelRateEditor`) | ✅ | Legacy component wired to `/api/channels/rates`. | `src/components/calendar/PerChannelRateEditor.tsx` | — |
| `/api/calendar/rates` GET | ✅ | Returns master + platforms bundle. | `src/app/api/calendar/rates/route.ts` | Returns `channel_name: "Villa Jamaica"` where it should be "Airbnb" (SESSION_5a_HANDOFF #1) |
| `/api/calendar/rates/apply` POST | ✅ | Mode `master` or `platform`, `wipe_overrides` flag. | `src/app/api/calendar/rates/apply/route.ts` | Does not accept `min_stay` (SESSION_5a_HANDOFF #3) |
| `calendar_rates` two-tier model | ✅ | Base row (`channel_code IS NULL`) + override rows (`'BDC' | 'ABB' | 'VRBO' | 'DIRECT'`). | `supabase/migrations/20260412010000_calendar_rates_per_channel.sql` | — |
| Unique index on `(property_id, date, channel_code)` NULLS NOT DISTINCT | ✅ | Prevents duplicate overrides. | Same migration lines 22-25 | — |
| Hairline indicator on cells with overrides | ✅ | Visual cue in month grid. | `src/components/polish/calendar/RateCell.tsx` | — |
| RateCell inline editable input | ✅ | Per-cell rate editing. | `src/components/polish/calendar/RateCell.tsx` | Arrow-boundary focus advance not wired (SESSION_5a_HANDOFF #5) |
| WhyThisRate panel | ✅ | Top-3 signals from `factors` JSONB. | `src/components/polish/calendar/WhyThisRate.tsx` | — |
| SyncButton shell | 🟡 | Four-state visual shell only. | `src/components/polish/calendar/SyncButton.tsx` | Real queue semantics deferred to Session 5d (SESSION_5a_HANDOFF #6) |
| Date-cell selected state | ✅ | `KoastSelectedCell` box-shadow pattern. | `src/components/polish/KoastSelectedCell.tsx` | — |
| Property thumbnail strip (multi-prop cal) | ✅ | 80px photo strip with channel badges. | `src/components/calendar/PropertyThumbStrip.tsx` | — |
| Min-stay per date | ✅ | `calendar_rates.min_stay` column. | `supabase/migrations/001_initial_schema.sql:92` | UI in sidebar, no write path through `/api/calendar/rates/apply` |
| Availability toggle per date | ✅ | `calendar_rates.is_available` + Availability tab. | Same migration | — |
| Bulk date-range editing (rate + availability) | 🟡 | Multi-date selection in sidebar. | `CalendarView.tsx` | `KoastBulkEditBar` primitive not yet built (POLISH_PASS_HANDOFF §5) |
| Overbooking tooltip flag | 🟡 | Shown in legacy `MonthlyView.tsx:556`. | Code | Uses ⚠︎ emoji — violates "no emojis" rule (Overhaul Plan Track A #6) |
| Calendar entrance choreography | ❌ | Zero `fadeSlideIn` / `cardReveal` refs in 826-line `CalendarGrid.tsx`. | Overhaul Plan Track A (Calendar) | — |
| Booking panel (date → guest info) | ✅ | `BookingSidePanel`. | `src/components/calendar/BookingSidePanel.tsx` | — |
| DateEditPopover | ✅ | Quick-edit popover. | `src/components/calendar/DateEditPopover.tsx` | — |
| Gantt / portfolio view | 🟣 | Session 5b plan: virtualized, sticky headers both axes, density toggle. | POLISH_PASS_HANDOFF §6, SESSION_5a_HANDOFF | — |
| `KoastEditableField` / `KoastPendingChangesBar` / `KoastBulkEditBar` primitives | 🟣 | Session 5c proposal for dirty-state affordance across Koast. | POLISH_PASS_HANDOFF §5, SESSION_5a_HANDOFF | — |
| 90s idle auto-apply + 5-min undo toast | 🟣 | Session 5d. | POLISH_PASS_HANDOFF §6 | — |
| 3-tier min-stay hierarchy (property → date → platform) | 🟣 | Open question: 2-tier vs 3-tier. | POLISH_PASS_HANDOFF §5 ("Min-stay is a property setting"), SESSION_5a_HANDOFF | — |
| `calendar_rates.notes` column | 🔵 | UI placeholder in AvailabilityTab. | SESSION_5a_HANDOFF #4 | Schema extension needed |
| `calendar_rates.booking_window_days` column | 🔵 | UI placeholder in AvailabilityTab. | SESSION_5a_HANDOFF #4 | Schema extension needed |
| Check-in/checkout day restrictions | 🔵 | Product Spec §4.5.2 lists as right-panel control. | KOAST_PRODUCT_SPEC.md | Not implemented |

### DB tables

- `calendar_rates` — `id, property_id, date, base_rate, suggested_rate, applied_rate, min_stay, is_available, rate_source, factors, channel_code, channex_rate_plan_id, last_pushed_at, last_channex_rate, created_at`
- `ical_feeds` (`supabase/migrations/007_ical.sql`)
- Indexes: `idx_calendar_rates_property_date`, `calendar_rates_prop_date_chan_unique`

### API routes

- `GET /api/calendar/rates`
- `POST /api/calendar/rates/apply`
- `POST /api/ical/add`
- `POST /api/ical/sync/[propertyId]`
- `GET /api/ical/status/[propertyId]`
- `DELETE /api/ical/[feedId]`

### UI pages / components

- `/calendar` — `CalendarView` orchestrator
- `/properties/[id]?tab=calendar` — same grid, single-property
- Components: `CalendarSidebar`, `PricingTab`, `AvailabilityTab`, `WhyThisRate`, `RateCell`, `SyncButton`, `KoastBookingBar`, `KoastSelectedCell`, `CalendarGrid`, `MonthlyView`, `BookingBar`, `DateCell`, `DateEditPopover`, `PerChannelRateEditor`, `PropertyRow`, `PropertyThumbStrip`, `ChannelLogo`, `BookingSidePanel`, `CalendarToolbar`

### Workers

- `booking_sync.py` — iCal sync + Channex revision polling (every 15 min)
- `ical_parser.py` — iCal feed parsing

### Explicit gaps

- `channel_name` bug in `/api/calendar/rates` (SESSION_5a_HANDOFF #1).
- `min_stay` write path missing in `/api/calendar/rates/apply` (SESSION_5a_HANDOFF #3).
- `notes` + `booking_window_days` columns missing (#4).
- Arrow-boundary keyboard flow incomplete (#5).
- SyncButton queue not wired (#6).
- Entrance choreography missing on Calendar page.

---

## 3. Pricing Engine

The #1 competitive differentiator. 9-signal engine + per-property rules + apply pipeline + outcome capture.

### Features

| Feature | Status | Description | Source | Gap |
|---|---|---|---|---|
| 9-signal pricing engine | ✅ | Demand 0.20, Competitor 0.20, Seasonality 0.15, Events 0.12, Gap Night 0.08, Booking Pace 0.08, Lead Time 0.07, Weather 0.05, Supply Pressure 0.05. | `src/lib/pricing/engine.ts`, CLAUDE.md 9-Signal Pricing Engine | — |
| Quality-aware weighting (per-signal confidence) | ✅ | `{score, weight, reason, confidence}` tuple; dropped weight redistributes. Currently only Competitor uses confidence. | CLAUDE.md Quality-aware weighting | Other signals default confidence=1.0 |
| `pricing_recommendations` table | ✅ | `current_rate`, `suggested_rate`, `reason_signals JSONB`, `delta_abs`, `delta_pct`, `status`, `applied_at`, `dismissed_at`, `urgency`, `reason_text`. | `supabase/migrations/20260414010000_pricing_recommendations.sql` + `20260418000000` extensions | — |
| `pricing_recommendations_latest` view | ✅ | Newest snapshot per (property, date). | Same migration | — |
| Partial unique index on pending recs | ✅ | `pricing_recs_unique_pending_per_date ON (property_id, date) WHERE status='pending'`. | `supabase/migrations/20260419000000_pricing_recommendations_dedup.sql` | — |
| `pricing_rules` table | ✅ | `base_rate`, `min_rate`, `max_rate`, `channel_markups`, `max_daily_delta_pct`, `comp_floor_pct`, `seasonal_overrides`, `auto_apply`, `source`, `inferred_from`. | `supabase/migrations/20260418000000_pricing_rules_and_performance.sql` | — |
| `pricing_rules.source` markers | ✅ | `defaults` \| `inferred` \| `host_set`. | Same migration | — |
| Pricing rules inference from history | ✅ | Runs when property has ≥30 days of `calendar_rates`. Uses empirical percentiles. `inferred_from` JSONB stores summary stats. | CLAUDE.md Known Data Quality Issues | — |
| Auto-create pricing rules on first GET | ✅ | Inference-or-defaults fallback. | `GET /api/pricing/rules/[propertyId]` | — |
| `pricing_performance` table | ✅ | `suggested_rate`, `applied_rate`, `actual_rate`, `booked`, `booked_at`, generated `revenue_delta`, `channels_pushed[]`. | `supabase/migrations/20260418000000` | — |
| `pricing_outcomes` table | ✅ | Feeds seasonality signal after 30+ days. | `supabase/migrations/005_pricing_outcomes_events.sql` | — |
| Validator worker (daily 6 AM ET) | ✅ | `pricing_validator.py` + `koast-pricing-validator.service`/`.timer`. 480 rows logged across 4 runs × 2 props × 60 dates. | `~/staycommand-workers/pricing_validator.py` | — |
| Validator UPSERT on (property_id, date) | ✅ | `ON CONFLICT … DO UPDATE`. | Same | — |
| Pricing performance reconciler (nightly 02:30 UTC) | ✅ | `pricing_performance_reconciler.py` + systemd timer. | `~/staycommand-workers/pricing_performance_reconciler.py`, CLAUDE.md Reliability Infrastructure | — |
| Multi-channel apply dispatch | ✅ | `/api/pricing/apply` routes BDC through `buildSafeBdcRestrictions`, non-BDC direct. Writes `calendar_rates` base + per-channel rows. | `src/app/api/pricing/apply/[propertyId]/route.ts` (commit `b44410f`) | `pricing_performance.insert()` should be `.upsert()` (SESSION_5a_HANDOFF #2) |
| Safe BDC restrictions helper | ✅ | Pre-flight BDC read + safe-merge plan. Protects host-managed state. | `src/lib/channex/safe-restrictions.ts`, postmortem | — |
| BDC preview (dry-run) | ✅ | `POST /api/pricing/preview-bdc-push/[propertyId]`, no writes. | `src/app/api/pricing/preview-bdc-push/[propertyId]/route.ts` | — |
| BDC commit (HTTP 207 on partial failure) | ✅ | `POST /api/pricing/commit-bdc-push/[propertyId]`, idempotent via `concurrency_locks`. | `src/app/api/pricing/commit-bdc-push/[propertyId]/route.ts` | — |
| Per-channel rate push (batched) | ✅ | `POST /api/pricing/push/[propertyId]` — 200-entry batches, HTTP 207 on partial failure. | `src/app/api/pricing/push/[propertyId]/route.ts` | — |
| Recommendation list endpoint | ✅ | `GET /api/pricing/recommendations/[propertyId]?status=pending|applied|dismissed`. | `src/app/api/pricing/recommendations/[propertyId]/route.ts` | — |
| Per-date signal audit endpoint | ✅ | `GET /api/pricing/audit/[propertyId]?date=` returns signal breakdown + rules snapshot + auto-apply blocker explainer. | `src/app/api/pricing/audit/[propertyId]/route.ts` | — |
| Performance aggregates endpoint | ✅ | `GET /api/pricing/performance/[propertyId]?window=7|30|60|90`. | `src/app/api/pricing/performance/[propertyId]/route.ts` | — |
| One-off engine recalculation | ✅ | `GET /api/pricing/calculate/[propertyId]`. Not persisted. | `src/app/api/pricing/calculate/[propertyId]/route.ts` | — |
| Dismiss recommendation | ✅ | `POST /api/pricing/dismiss` — affects acceptance rate. | `src/app/api/pricing/dismiss/route.ts` | — |
| Rules read/update endpoint | ✅ | `GET/PUT /api/pricing/rules/[propertyId]`. | `src/app/api/pricing/rules/[propertyId]/route.ts` | — |
| Legacy `/api/pricing/approve` | ✅ | Pre-apply route, still present. | `src/app/api/pricing/approve/[propertyId]/route.ts` | — |
| Legacy `/api/pricing/outcomes` | ✅ | Reads `pricing_outcomes`. | `src/app/api/pricing/outcomes/[propertyId]/route.ts` | — |
| Legacy `/api/pricing/override` | ✅ | Manual rate override. | `src/app/api/pricing/override/[propertyId]/route.ts` | — |
| Legacy `/api/pricing/preview` | ✅ | Pre-apply preview. | `src/app/api/pricing/preview/[propertyId]/route.ts` | — |
| `/api/pricing/sync-channex` | ✅ | Pull Channex state into Koast. | `src/app/api/pricing/sync-channex/[propertyId]/route.ts` | — |
| `usePricingTab` hook | ✅ | Composes rules + recs + performance; stale-while-revalidate. | `src/hooks/usePricingTab.ts` | UI layer must only use this hook, never raw routes |
| Pricing tab (PropertyDetail) | ✅ | Scorecard + recommendations + rules editor + performance. | `src/components/polish/PricingTab.tsx` | Apply/Dismiss buttons not yet wired to live routes (CLAUDE.md Known Gaps / Not Wired) |
| Global Pricing page (`/pricing`) | 🟡 | Legacy `PricingDashboard.tsx`. | `src/components/dashboard/PricingDashboard.tsx` | 15 `bg-brand-*` + 44 `text-neutral-*` drift (Overhaul Plan Track A HIGH severity); zero entrance animations |
| `KOAST_ALLOW_BDC_CALENDAR_PUSH` safety gate | ✅ | Default-off on Vercel; HTTP 503 when disabled. | `src/lib/channex/calendar-push-gate.ts` | Flag flip pending browser-devtools controlled test; removal after production observation |
| Auto-apply toggle | 🟡 | Column exists on `pricing_rules.auto_apply`; UI toggle dimmed "Coming soon". | CLAUDE.md Known Gaps / Not Wired | Gated on ≥14 days of validation data (currently 4-16) |
| Outcome capture on booking (webhook) | ✅ | Channex `booking_new` backfills matching `pricing_performance` rows. | CLAUDE.md Reliability Infrastructure | — |
| Booking Pace smart baseline | ✅ | Part of 9-signal engine. | `src/lib/pricing/signals/` | — |
| Lead Time vs market signal | ✅ | Rate position at days-until-check-in. | Same | — |
| Gap Night detection | ✅ | Orphan 1-2 night detection. | Same | — |
| Event-based pricing (Ticketmaster) | ✅ | Stacked, capped +40%. | `local_events` table, Same | — |
| Weather-based pricing | ✅ | Weather.gov 14-day, cached in `weather_cache`. | Same | — |
| Supply Pressure signal | ✅ | Month-over-month listing count change. | Same | — |
| Competitor signal with confidence | ✅ | Reads `properties.comp_set_quality` for precise/fallback/insufficient. | Same | — |
| Per-recommendation per-platform rates | 🔵 | `pricing_recommendations.suggested_rate` is scalar today. | `docs/CHANNEX_PER_PLATFORM_AUDIT.md` Open Question #1 | Schema extension for per-platform suggestions |
| BDC `current_rate` caching | 🔵 | Validator only reads Airbnb live rates. BDC fetched ephemerally during apply. | `docs/CHANNEX_PER_PLATFORM_AUDIT.md` Open Question #4 | — |
| Signal weight tuning post-14-day data | 🟣 | Engine weights static today; revisit after data. | KOAST_OVERHAUL_PLAN.md Track B | — |
| Signal observability dashboard | 🟣 | Proposed in overhaul plan: surface which signals fired per (property, date). | KOAST_OVERHAUL_PLAN.md Track B §7 | — |
| Pricing scorecard "leaving $X on the table" | ✅ | Scorecard in PropertyDetail Pricing tab. | `PricingTab.tsx` | — |
| Smart Pricing comparison (Airbnb) | ⚪ | Product Spec §4.5.3: "show how Koast's suggestions differ from Airbnb Smart Pricing." | KOAST_PRODUCT_SPEC.md | Not started |

### DB tables

- `pricing_recommendations` + `pricing_recommendations_latest` view
- `pricing_rules`
- `pricing_performance`
- `pricing_outcomes`
- `calendar_rates` (shared with Calendar)

### API routes (13)

- `GET /api/pricing/calculate/[propertyId]`
- `GET/PUT /api/pricing/rules/[propertyId]`
- `GET /api/pricing/recommendations/[propertyId]`
- `GET /api/pricing/performance/[propertyId]`
- `GET /api/pricing/audit/[propertyId]?date=`
- `GET /api/pricing/outcomes/[propertyId]`
- `POST /api/pricing/apply/[propertyId]`
- `POST /api/pricing/dismiss`
- `POST /api/pricing/preview-bdc-push/[propertyId]`
- `POST /api/pricing/commit-bdc-push/[propertyId]`
- `POST /api/pricing/push/[propertyId]`
- `POST /api/pricing/approve/[propertyId]`
- `POST /api/pricing/override/[propertyId]`
- `POST /api/pricing/preview/[propertyId]`
- `POST /api/pricing/sync-channex/[propertyId]`

### UI pages

- `/pricing` — `PricingDashboard`
- `/properties/[id]?tab=pricing` — `PricingTab`
- Sidebar sub-panel of `/calendar` Pricing tab

### Workers

- `pricing_validator.py` (daily 6 AM ET)
- `pricing_performance_reconciler.py` (nightly 02:30 UTC)
- `pricing_worker.py` (rate calc + market refresh)

### Explicit gaps

- Apply/Dismiss buttons in global `/pricing` page don't call live routes.
- `pricing_performance.insert()` → `.upsert()` in `/api/pricing/apply` (~3-line fix).
- Recommendations are portfolio-wide, not per-channel (CHANNEX_PER_PLATFORM_AUDIT §5 Open Q #1).
- BDC current_rate not cached anywhere (Open Q #4).
- Smart Pricing comparison not built.
- Auto-apply dim until 14-day threshold.
- Validator data only covers 4 runs — not enough to tune weights.

---

## 4. Channel Management

Channex.io integration — the channel sync that keeps Airbnb + BDC in lockstep. Certified production whitelabel.

### Features

| Feature | Status | Description | Source | Gap |
|---|---|---|---|---|
| Channex certified integration | ✅ | Production whitelabel at `app.channex.io/api/v1`. | CLAUDE.md Channex Integration | — |
| `property_channels` table | ✅ | Per-channel registration (`channel_code`, `channel_name`, `status`, `last_sync_at`, `settings.rate_plan_id`). | `supabase/migrations/20260407080000_channel_manager.sql` | — |
| `channex_rate_plans` cache | ✅ | `id, property_id, room_type_id, title, sell_mode, currency, rate_mode`. | Same migration | — |
| `channex_room_types` cache | ✅ | Room type metadata. | Same | — |
| `channex_sync_state` | ✅ | Revision polling checkpoint. | `supabase/migrations/20260407050000_channex_revision_polling.sql` | — |
| `channex_webhook_log` (idempotency) | ✅ | `revision_id` dedup. | Same + `supabase/migrations/002_channex_constraints.sql` | — |
| `channex_outbound_log` | ✅ | Writes to Channex are logged. | `supabase/migrations/20260417020000_channex_outbound_log.sql` | — |
| `listings` per-platform metadata | ✅ | `(property_id, platform) UNIQUE`; platforms: airbnb/vrbo/booking_com/direct. | `supabase/migrations/001_initial_schema.sql:44-54` | VRBO is accepted in schema but dropped from `PLATFORMS` config |
| Airbnb connection via Channex | ✅ | Rate plans + reservations flow through Channex. | CLAUDE.md Channex Integration | Airbnb OAuth currently disconnected for live properties |
| Booking.com self-service connect | ✅ | Hotel ID entry → `createChannel` → `testChannelConnection` → activate flow. | `/api/channels/connect-booking-com/*` + `BookingComConnect.tsx` | — |
| Atomic channel creation w/ compensating rollback | ✅ | Deletes scaffold property/rate plan/channel on later failure. | CLAUDE.md Channex Integration | — |
| BDC connect mutex (60s) | ✅ | Advisory lock in `concurrency_locks` keyed `bdc_connect:{propertyId}`. HTTP 409 on concurrent. | Same | — |
| Dedicated BDC rate plan (no reuse) | ✅ | Prevents rate bleed between Airbnb and BDC. | Same | — |
| Name matching (Koast ↔ Channex) | ✅ | Strict normalized equality; ambiguous matches surface as candidates. | Same | — |
| Channel activation endpoint | ✅ | `POST /channels/{id}/activate` (Channex). | CLAUDE.md Common Gotchas #2 | — |
| `POST /api/channels/connect-booking-com` | ✅ | Create. | `src/app/api/channels/connect-booking-com/route.ts` | — |
| `POST /api/channels/connect-booking-com/test` | ✅ | Test auth. | Same dir | — |
| `POST /api/channels/connect-booking-com/activate` | ✅ | Push availability + activate. `channex.updateAvailability` (NOT safe-wrapped — known Stage 1.5 gap per CLAUDE.md). | Same dir | — |
| `GET /api/channels/connect-booking-com/status/[propertyId]` | ✅ | Check connection state. | Same | — |
| `GET /api/channels/[propertyId]` | ✅ | Channel list for a property. | `src/app/api/channels/[propertyId]/route.ts` | — |
| `GET /api/channels/[propertyId]/refresh` | ✅ | Re-poll Channex. | `src/app/api/channels/[propertyId]/refresh/route.ts` | — |
| `GET /api/channels/details/[propertyId]/[platform]` | ✅ | Per-channel details. | `src/app/api/channels/details/[propertyId]/[platform]/route.ts` | — |
| `GET /api/channels/group-token` | ✅ | Channex group tokens. | `src/app/api/channels/group-token/route.ts` | — |
| `GET /api/channels/listings` | ✅ | Channex listings directory. | `src/app/api/channels/listings/route.ts` | — |
| `GET /api/channels/status` | ✅ | All channels status. | `src/app/api/channels/status/route.ts` | — |
| `GET /api/channels/sync-log` | ✅ | Sync events feed. | `src/app/api/channels/sync-log/route.ts` | — |
| `GET/POST /api/channels/rates/[propertyId]` | ✅ | Per-channel rate editor surface with mismatch flags + push. | `src/app/api/channels/rates/[propertyId]/route.ts` | — |
| `GET /api/channels/token/[propertyId]` | ✅ | OAuth token fetch. | `src/app/api/channels/token/[propertyId]/route.ts` | — |
| Channex webhook receiver | ✅ | `POST /api/webhooks/channex` — dedup via `revision_id`. | `src/app/api/webhooks/channex/route.ts` | — |
| Channex full sync | ✅ | `POST /api/channex/full-sync`. | `src/app/api/channex/full-sync/route.ts` | — |
| Channex booking sync | ✅ | `POST /api/channex/sync-bookings`, `/api/channex/sync`. | Same dir | — |
| Channex webhook setup | 🟡 | `POST /api/channex/setup-webhook` calls `createWebhook` **ungated** (not in BDC clobber class per postmortem scope). | CLAUDE.md Known Data Quality Issues | If audit finds webhook writes affect guest-facing behavior, add to gate list |
| Channex import | ✅ | `POST /api/channex/import`. | `src/app/api/channex/import/route.ts` | — |
| Channex webhook-logs viewer | ✅ | `GET /api/channex/webhook-logs`. | `src/app/api/channex/webhook-logs/route.ts` | — |
| Channex certification endpoints | ✅ | `/api/channex/certification`, `/api/channex/certification-runner`, `/api/channex/certification/booking-test`. Internal cert tooling. | Three routes | — |
| `/channex-certification` page (14-test runner) | ✅ | Internal cert tooling UI. | `src/app/(dashboard)/channex-certification/page.tsx`, `/certification/page.tsx` | — |
| Channel health table + monitoring | 🔵 | Product Spec §4.3 Channel Health Monitoring. `channel_health (property_id, channel_type, status, last_check, last_success, error_message)`; 5-min VPS worker; red non-dismissible banner; email alerts; "Reconnect" OAuth re-trigger. | KOAST_PRODUCT_SPEC.md PART 5, CLAUDE.md Known Gaps / Not Wired | No table, no worker, no banner |
| ChannelPopover | ✅ | Desktop hover + mobile bottom sheet. Platform header, stats row, connection details, actions. `@floating-ui/react`. | `src/components/channels/ChannelPopover.tsx`, CLAUDE.md UPCOMING FEATURES | Intended `vaul` library not yet installed — mobile handled without it |
| Channels page (`/channels`) | ✅ | Main page. | `src/app/(dashboard)/channels/page.tsx` | — |
| Channels connect page (`/channels/connect`) | ✅ | Connect flow entry. | `src/app/(dashboard)/channels/connect/page.tsx` | — |
| Channels sync log page (`/channels/sync-log`) | ✅ | Sync history viewer. | `src/app/(dashboard)/channels/sync-log/page.tsx` | — |
| PlatformPills on property cards | ✅ | 22×22 brand-colored tiles, white silhouettes. Session 4.5/5.5. | `src/components/polish/PlatformPills.tsx` | — |
| iCal feeds as fallback channel | ✅ | `ical_feeds` table; 15s `AbortController` timeout. | `supabase/migrations/007_ical.sql` | — |
| iCal ghost booking cleanup | ✅ | UIDs removed from feed get cancelled; Channex rows unblock `calendar_rates`. | CLAUDE.md Reliability Infrastructure | — |
| VRBO support | ⚪ | Schema accepts `'vrbo'` in `listings.platform` CHECK; `PLATFORMS` config intentionally omits VRBO. | CLAUDE.md Design System — Platform Config | Re-add when SVG assets land + a property needs it |
| BDC `updateAvailability` safe-wrapping | 🟡 | Only `updateRestrictions` goes through `buildSafeBdcRestrictions` today. `updateAvailability` called by `/connect-booking-com/activate` is bare. | CLAUDE.md Known Data Quality Issues | Scheduled for Stage 1.5 / early PR B |
| Remove `KOAST_ALLOW_BDC_CALENDAR_PUSH` flag | 🟣 | After controlled browser-devtools test. | CLAUDE.md Phase 1, POLISH_PASS_HANDOFF §7 | — |
| Reconnect Airbnb OAuth (live properties) | ❌ | Currently disconnected for Villa Jamaica + Cozy Loft. | CLAUDE.md Phase 1 | — |

### DB tables

- `property_channels`
- `channex_rate_plans`, `channex_room_types`, `channex_sync_state`, `channex_webhook_log`, `channex_outbound_log`
- `listings`
- `ical_feeds`
- `concurrency_locks`

### API routes (20+)

All `/api/channels/*`, `/api/channex/*`, `/api/ical/*`, `/api/webhooks/channex`.

### UI pages

- `/channels`, `/channels/connect`, `/channels/sync-log`
- `/certification`, `/channex-certification`

### Workers

- `booking_sync.py` (iCal + Channex revision polling)

### Explicit gaps

- No `channel_health` table, no 5-min health worker, no disconnect banners.
- `updateAvailability` unsafe-wrapped.
- Airbnb OAuth disconnected.
- `KOAST_ALLOW_BDC_CALENDAR_PUSH` still gating.

---

## 5. Messaging & AI Inbox

Three-column unified inbox. AI draft scaffolding in UI, pipeline not automated.

### Features

| Feature | Status | Description | Source | Gap |
|---|---|---|---|---|
| Messages page (`/messages`) | ✅ | Three-column inbox (conversation list, thread, context panel). Redesigned `546fbf9`. | `src/app/(dashboard)/messages/page.tsx`, `src/components/dashboard/UnifiedInbox.tsx` | — |
| `messages` table | ✅ | `direction`, `sender_name`, `content`, `ai_draft`, `ai_draft_status` (`none`/`pending`/`generated`/`approved`/`sent`). | `supabase/migrations/001_initial_schema.sql:135-147` | — |
| `message_templates` table | ✅ | Seeded on onboarding. | `supabase/migrations/008_property_details_and_templates.sql` | — |
| `POST /api/messages/send` | ✅ | Outbound send. | `src/app/api/messages/send/route.ts` | — |
| `POST /api/messages/draft` | ✅ | AI draft generation endpoint (scaffold). | `src/app/api/messages/draft/route.ts` | Not wired to Claude pipeline |
| Conversation filters (All / Unread / Needs reply / AI drafted) | 🟡 | UI present; "AI drafted" filter dimmed. | CLAUDE.md Known Gaps / Not Wired | AI pipeline not active |
| Real platform logos on avatars | ✅ | From `PLATFORMS` config. | `src/lib/platforms.ts` | — |
| AI draft display (dashed golden border) | ✅ | UI scaffold. | `UnifiedInbox.tsx` | — |
| Guest context panel | ✅ | Guest info, booking, property card, quick actions. | `UnifiedInbox.tsx` | — |
| Template manager | ✅ | `src/components/dashboard/TemplateManager.tsx`. | Same | — |
| Messages-from-Channex sync | 🔵 | Product spec says messages synced from Channex Airbnb API + BDC messaging API. | KOAST_PRODUCT_SPEC.md §4.3 | Not implemented |
| AI auto-draft with Claude (Haiku/Sonnet split) | 🔵 | Spec: Haiku for simple (hours, wifi, code), Sonnet for complex (extensions, early check-in, conflict). | CLAUDE.md UPCOMING FEATURES, KOAST_PRODUCT_SPEC.md | Not started |
| Property knowledge base per property | 🔵 | Local recs, house rules, FAQ. Fed to Claude as system prompt. Table `property_knowledge (property_id, category, question, answer, source)`. | KOAST_PRODUCT_SPEC.md PART 7 | No table, no UI |
| AI auto-send (check-in instructions, checkout reminders, welcome) | 🔵 | Day-before send. Host-toggled. | CLAUDE.md UPCOMING FEATURES | Not started |
| Operational routing — "towels/broken/dirty" → cleaner SMS + task | 🔵 | AI drafts reply AND creates `cleaning_tasks` + SMS via Twilio. | KOAST_PRODUCT_SPEC.md §4.3 | — |
| Operational routing — extension request | 🔵 | AI checks availability, drafts response with dates + rate. | Same | — |
| Operational routing — early check-in | 🔵 | AI checks prior night availability, drafts conditional approval. | Same | — |
| `message_automations` table | ⚪ | Spec: `(property_id, trigger, template, enabled, channel)`. | KOAST_PRODUCT_SPEC.md PART 7 | Not started |
| Webhook from Channex for new messages → trigger draft | ⚪ | Wired to AI pipeline. | KOAST_PRODUCT_SPEC.md §4.3 backend reqs | — |
| 70%+ "send as-is" validation target | ❌ | Needs 1 week of real data. | KOAST_PROJECT_PLAN.md Track 4B | No validation run yet |

### DB tables

- `messages`
- `message_templates`

### API routes

- `POST /api/messages/send`
- `POST /api/messages/draft`

### UI pages / components

- `/messages`
- `UnifiedInbox.tsx`, `MessagesPageTabs.tsx`, `TemplateManager.tsx`

### Workers

- None today (design calls for a Channex-webhook → draft worker)

### Explicit gaps

- AI pipeline not automated.
- `property_knowledge`, `message_automations` tables not created.
- No Channex→messages sync wired.
- No validation data.

---

## 6. Market Intelligence

AirROI-backed market data + Ticketmaster events + Weather.gov + comp sets. Interactive map planned.

### Features

| Feature | Status | Description | Source | Gap |
|---|---|---|---|---|
| Market Intel page (`/market-intel`) | ✅ | Glass stats, occupancy/ADR charts, revenue-opportunity AI card. | `src/app/(dashboard)/market-intel/page.tsx`, `AnalyticsDashboard.tsx` | Layout spot-check vs mockup (Overhaul Plan Track A) |
| Comp Sets page (`/comp-sets`) | ✅ | Glass stats, pinned your-property row, sortable competitive table. | `src/app/(dashboard)/comp-sets/page.tsx`, `CompMap.tsx` | 3 `text-brand-500` + 3 `text-neutral-*` drift |
| Nearby Listings browse (`/nearby-listings`) | ✅ | AirDNA-style browse with AirROI photos. | `src/app/(dashboard)/nearby-listings/page.tsx` | — |
| `market_comps` table | ✅ | `comp_listing_id, comp_name, comp_bedrooms, comp_adr, comp_occupancy, comp_revpar, distance_km`. Extended with `source` marker. | `supabase/migrations/001_initial_schema.sql:104-115` + `20260417030000_market_comps_source.sql` | — |
| `market_snapshots` table | ✅ | Daily snapshot of market ADR / occupancy / RevPAR / supply / demand score. | `supabase/migrations/001_initial_schema.sql:117-129` | — |
| `local_events` table | ✅ | Ticketmaster events. | `supabase/migrations/005_pricing_outcomes_events.sql` | — |
| `weather_cache` table | ✅ | Weather.gov 14-day cache. | `supabase/migrations/20260330180000_weather_cache.sql` | — |
| `comp_photos` | ✅ | AirROI property photos for comp sidebar. | `supabase/migrations/20260331010000_comp_photos.sql` | — |
| `market_comps.source` marker | ✅ | `filtered_radius` \| `similarity_fallback` — feeds Competitor confidence. | `supabase/migrations/20260417030000_market_comps_source.sql` | — |
| `properties.comp_set_quality` flag | ✅ | `precise` \| `fallback` \| `insufficient`. Feeds engine confidence weighting. | CLAUDE.md Known Data Quality | — |
| Unified comp-set builder | ✅ | `buildFilteredCompSet` in `src/lib/airroi/compsets.ts` serves import-from-url, market refresh, comps endpoint. Legacy `buildCompSet` + `storeCompSet` deleted. | Same | — |
| AirROI API integration | ✅ | 3,911 listings covered. | CLAUDE.md Competitive Edges | — |
| Ticketmaster API integration | ✅ | Local events for Event signal. | CLAUDE.md Tech Stack | — |
| Weather.gov API integration | ✅ | Free, no key. | Same | — |
| `GET /api/market/snapshot/[propertyId]` | ✅ | Market stats. | Route | — |
| `GET /api/market/comps/[propertyId]` | ✅ | Comp set. | Route | — |
| `POST /api/market/refresh/[propertyId]` | ✅ | Force refresh AirROI data. | Route | — |
| Interactive map with layers | 🔵 | Product Spec §4.8: Leaflet map, toggleable layers (your properties, comps, events, heatmap). | KOAST_PRODUCT_SPEC.md §4.8 | Not implemented |
| Comp sidebar w/ photo cards + add-to-comp-set | 🟡 | Sidebar exists; "Add to comp set" action not verified. | Same | Needs UI audit |
| Market data accuracy validation | 🟣 | Spot-check AirROI rates vs real Airbnb. | KOAST_PROJECT_PLAN.md Track 4D | Not run |
| Comp-set rate-over-time chart | 🟣 | Your rate vs comp set avg over 30/90 days. | KOAST_PRODUCT_SPEC.md §4.9 | — |

### DB tables

- `market_comps`, `market_snapshots`, `local_events`, `weather_cache`, `comp_photos`

### API routes

- `/api/market/snapshot/[propertyId]`
- `/api/market/comps/[propertyId]`
- `/api/market/refresh/[propertyId]`

### UI pages

- `/market-intel`, `/comp-sets`, `/nearby-listings`
- Components: `AnalyticsDashboard`, `CompMap`, `IntelMap`

### Workers

- `market_sync.py` — AirROI market data collection

### Explicit gaps

- No Leaflet map layers shipped.
- Market data accuracy validation not run.

---

## 7. Operations (Turnovers / Cleaning)

Kanban cleaning coordination + SMS + cleaner management.

### Features

| Feature | Status | Description | Source | Gap |
|---|---|---|---|---|
| Turnovers page (`/turnovers`) | ✅ | Task list, status pills, cleaner management, auto-create from bookings. | `src/app/(dashboard)/turnovers/page.tsx`, `TurnoverBoard.tsx` | Zero entrance animations (Overhaul Plan Track A) |
| `cleaning_tasks` table | ✅ | `property_id, booking_id, next_booking_id, cleaner_id, status, scheduled_date, scheduled_time, checklist, photos, notes, completed_at`. | `supabase/migrations/001_initial_schema.sql:153-167` | — |
| `cleaners` table | ✅ | `name, phone, properties (many-to-many)`. | `supabase/migrations/20260330030000_cleaners_and_sms.sql` | — |
| Auto-create cleaning task on booking | ✅ | `POST /api/turnover/auto-create`. | `src/app/api/turnover/auto-create/route.ts` | — |
| `GET /api/cleaners` | ✅ | Cleaner directory. | Route | — |
| `POST /api/turnover/update` | ✅ | Task status update. | Route | — |
| `POST /api/turnover/assign` | ✅ | Cleaner assignment. | Route | — |
| Cleaner token landing page (public) | ✅ | `/clean/[taskId]/[token]` — cleaner-side flow. | `src/app/clean/[taskId]/[token]/page.tsx` + `/api/clean/[taskId]/[token]` + `/update` | — |
| Cleaning tokens migration | ✅ | Token generation/validation. | `supabase/migrations/003_cleaning_tokens.sql` | — |
| SMS notifications via Twilio | ✅ | Auto-send to cleaner X hours before turnover. `sms_log` table. | CLAUDE.md Reliability Infrastructure | — |
| `notifications` audit log | ✅ | Writes via `storeNotification()` after each `notify*` call. | `supabase/migrations/20260417010000_notifications.sql`, `src/lib/notifications/index.ts` | — |
| Cleaning task RLS policies | ✅ | Both standard + cleaner-token scoped. | `supabase/migrations/20260410000000_cleaning_tasks_rls.sql`, `20260408010000_fix_rls_policies.sql` | — |
| Kanban card: Scheduled / Notified / In Progress / Completed | ✅ | Visual kanban. | `TurnoverBoard.tsx` | — |
| Cleaner SMS parsing ("OK" / "Done" / "On my way") | 🟡 | Inbound Twilio webhook parses status updates. | KOAST_PRODUCT_SPEC.md §4.7 | UI automation coverage not verified |
| Guest request → cleaner task ("extra towels") | 🔵 | Part of AI messaging operational routing. | KOAST_PRODUCT_SPEC.md §4.3 | Depends on AI pipeline |
| Special instructions per task | 🔵 | "Guest has a dog — pet cleanup." | Same | Not wired |
| Performance / tracking per cleaner | 🟣 | Cleaner management w/ performance view. | KOAST_PRODUCT_SPEC.md §4.7 | — |

### DB tables

- `cleaning_tasks`, `cleaners`, `sms_log`, `notifications`

### API routes

- `POST /api/turnover/auto-create`
- `POST /api/turnover/update`
- `POST /api/turnover/assign`
- `GET /api/cleaners`
- `GET /api/clean/[taskId]/[token]`
- `POST /api/clean/[taskId]/[token]/update`

### UI pages

- `/turnovers`
- `/clean/[taskId]/[token]` (public)

### Workers

- None (triggered from API)

### Explicit gaps

- Entrance choreography missing.
- AI-routed cleaner tasks depend on AI pipeline.

---

## 8. Reporting & Analytics

Dashboards, bookings list, analytics page, portfolio view.

### Features

| Feature | Status | Description | Source | Gap |
|---|---|---|---|---|
| Dashboard (`/`) | ✅ | 5-block Quiet-direction rebuild. HandwrittenGreeting, PortfolioSignalSummary, PlatformPills, command-palette search. | `src/app/(dashboard)/page.tsx`, `src/components/polish/DashboardView.tsx` | — |
| Canvas revenue chart w/ requestAnimationFrame | 🟡 | Component exists with animated draw. | `src/components/dashboard/RevenueChart.tsx` | Daily revenue aggregation query from `bookings` needs fixing — shows empty state (CLAUDE.md Known Gaps) |
| `/api/dashboard/stats` | ✅ | Portfolio aggregates. | Route | — |
| `/api/dashboard/actions` | ✅ | Focus actions feed. | Route | — |
| `/api/dashboard/command-center` | ✅ | `greetingStatus`, `criticalAlerts`, `primaryStatus/secondaryStatus`, `focusActions`, `pulseMetrics`, `connectedPlatforms`. | `src/app/api/dashboard/command-center/route.ts` | — |
| Pulse metric 7-point series | 🟡 | Client-mocked via linear interpolation + gentle wobble. | CLAUDE.md Known Gaps — Pulse Metric Time Series | Needs real `/api/dashboard/pulse?range=30d` endpoint backed by `bookings` aggregations |
| `/analytics` — portfolio analytics dashboard | ✅ | `AnalyticsDashboard.tsx` with `useCountUp`, entrance refs. | `src/app/(dashboard)/analytics/page.tsx` | — |
| `/bookings` list | ✅ | Bookings page. | `src/app/(dashboard)/bookings/page.tsx` | — |
| Bookings create / edit / cancel | ✅ | `POST /api/bookings/create`, `POST /api/bookings/[id]/edit`, `POST /api/bookings/[id]/cancel`. | Routes | — |
| Bookings conflict detection | ✅ | `GET /api/bookings/conflicts` + `ConflictResolution.tsx`. | Route + component | — |
| Forecast endpoint | ✅ | `GET /api/analytics/forecast/[propertyId]`. | Route | — |
| Scenarios endpoint | ✅ | `GET /api/analytics/scenarios/[propertyId]`. | Route | — |
| Reviews analytics | ✅ | `GET /api/reviews/analytics/[propertyId]`. | Route | — |
| AI insights with dollar amounts | ✅ | "+$765 potential" count-up. | CLAUDE.md Competitive Edges | — |
| Portfolio signal summary card | ✅ | Top-5 signals primitive. | `src/components/polish/PortfolioSignalSummary.tsx` | — |
| "Leaving $X on the table" estimate | ✅ | In PricingTab scorecard. | `PricingTab.tsx` | — |
| Revenue captured vs potential bar | 🟡 | Described in Product Spec §4.5.3. | KOAST_PRODUCT_SPEC.md | Exact layout vs spec not audited |
| Revenue increase vs pre-Koast | 🟣 | "Koast hosts earn 15% more" proof metric. | KOAST_PROJECT_PLAN.md Track 4A | Needs 2 weeks of validation data |
| Accuracy tracking ("Koast suggested X, booked at Y") | 🟣 | In Pricing tab Section 4. | KOAST_PRODUCT_SPEC.md §4.5.3 | — |
| Koast-vs-Smart-Pricing comparison | ⚪ | Shown in Pricing tab. | Same | Not built |

### DB tables

- `bookings`, plus everything aggregated from pricing/calendar/market tables

### API routes

- `/api/dashboard/*` (3)
- `/api/analytics/*` (2)
- `/api/bookings/*` (4)
- `/api/reviews/analytics/[propertyId]`

### UI pages

- `/` (Dashboard)
- `/analytics`
- `/bookings`

### Workers

- None (computed on-demand)

### Explicit gaps

- Revenue chart daily aggregation broken.
- Pulse time-series mocked client-side.
- Smart Pricing comparison not built.

---

## 9. AI Capabilities

Cross-cutting AI features backed by Claude API. Pricing engine is a separate category.

### Features

| Feature | Status | Description | Source | Gap |
|---|---|---|---|---|
| AI review response generation | ✅ | Claude API. Professional, no emojis, references stay details. | CLAUDE.md What's Working | — |
| AI host review of guest | ✅ | Based on booking data + message history. | Same | — |
| AI insight cards (dark gradient + golden glow) | ✅ | "Event detected, raise rates" etc. | CLAUDE.md Design Philosophy #3 | — |
| AI guest-message auto-draft | 🟡 | `ai_draft` column on `messages`; UI scaffold. | CLAUDE.md Known Gaps / Not Wired | Not automated |
| AI auto-send scheduled messages | 🔵 | Check-in instructions (day before), checkout reminders (day before), welcome (at check-in time). | KOAST_PRODUCT_SPEC.md §4.3 | — |
| Gap night detection with fill strategy | 🔵 | AI insight on Property Detail Overview. | KOAST_PRODUCT_SPEC.md §4.5.1 | Shown as static insight, no automated remediation action |
| Event-based pricing alert | ✅ | Signal fires in engine. | Engine | — |
| Competitor rate-change alert | 🔵 | "3 nearby listings raised rates 20% for Memorial Day weekend." | KOAST_PRODUCT_SPEC.md §4.5.1 | — |
| Review prompt ("David checked out, send reminder") | 🔵 | AI insight. | Same | — |
| Channel diversification suggestion | 🔵 | "82% of bookings come from Airbnb. Connect BDC to diversify." | Same | — |
| Property knowledge-base ingestion (per-property FAQ) | 🔵 | System prompt for Claude on each message. | KOAST_PRODUCT_SPEC.md §4.3 | No table, no UI |
| Claude Haiku vs Sonnet routing | 🔵 | Haiku for simple, Sonnet for complex. | CLAUDE.md UPCOMING FEATURES | Not implemented |
| AI message "send as-is" rate metric | 🟣 | Target 70%+. | KOAST_PROJECT_PLAN.md Track 4B | No telemetry yet |
| Claude API (Anthropic) integration | ✅ | `ANTHROPIC_API_KEY` live. | CLAUDE.md External API Keys | — |
| AI review schedule (post after guest also reviews) | ⚪ | "Strategic timing" per product spec §4.6. | KOAST_PRODUCT_SPEC.md | — |
| AI drafts for booking modification requests | ⚪ | AI flags for human review vs drafts. | KOAST_PRODUCT_SPEC.md §4.3 | — |

### DB tables

- `messages.ai_draft` / `ai_draft_status`
- Planned: `property_knowledge`, `message_automations`

### API routes

- `POST /api/messages/draft`
- `POST /api/reviews/generate/[bookingId]`
- `POST /api/reviews/respond/[reviewId]`
- `POST /api/reviews/approve/[reviewId]`
- `GET /api/reviews/pending`
- `GET/PUT /api/reviews/rules/[propertyId]` — per-property response rules (review_rules table)

### UI pages

- `/reviews`
- `/messages` (AI draft UI)
- Dashboard AI insight cards

### Workers

- None today

### Explicit gaps

- No property knowledge base.
- No automated drafting on inbound webhook.
- "Send as-is" metric not instrumented.

---

## 10. Team & Roles

Multi-user / co-host / owner portal. Single-user today.

### Features

| Feature | Status | Description | Source | Gap |
|---|---|---|---|---|
| Single-user auth (Supabase) | ✅ | Each property has a single `user_id` owner. | `supabase/migrations/001_initial_schema.sql:21` + RLS policies | — |
| Co-host invite / role permissions | ⚪ | "Future" per Product Spec §4.10. | KOAST_PRODUCT_SPEC.md | Not started |
| Owner portal / multi-user access | ⚪ | Shared property access, role-based permissions. Phase 3 per CLAUDE.md. | CLAUDE.md UPCOMING FEATURES | — |
| Cleaner identity separate from hosts | 🟣 | `cleaners` table exists with phone; no Supabase Auth account. | `supabase/migrations/20260330030000_cleaners_and_sms.sql` | Not treated as a role yet |
| User scope for reviews | ✅ | `review_rules` table w/ user-scoped RLS. | `supabase/migrations/009_review_dedup_and_user_scope.sql` | — |
| Row-level security on all user-owned tables | ✅ | Properties RLS cascades through listings, bookings, calendar_rates, etc. | `supabase/migrations/001_initial_schema.sql` + subsequent | — |
| Auth token verification helper | ✅ | `verifyPropertyOwnership` guard used by server routes. | POLISH_PASS_HANDOFF §0 | — |
| Team / permissions UI | ❌ | No Team section in Settings. | KOAST_PRODUCT_SPEC.md §4.10 | Not started |

### DB tables

- Supabase-managed `auth.users`
- `cleaners`
- RLS policies on every user-owned table

### API routes

- None specific to team yet

### UI pages

- `/settings` (scaffolded without team section)

### Workers

- None

### Explicit gaps

- Team/co-host/roles entirely absent.

---

## 11. Infrastructure & Platform

Everything under the app: deploys, workers, webhooks, idempotency, design system, reliability.

### Features

| Feature | Status | Description | Source | Gap |
|---|---|---|---|---|
| Next.js 14 App Router | ✅ | TypeScript + Tailwind + Drizzle. | CLAUDE.md Tech Stack | — |
| Vercel auto-deploy from main | ✅ | `app.koasthq.com` production. | Same | — |
| Supabase Postgres + Auth + Drizzle ORM | ✅ | Two clients: session-scoped + service-role. | POLISH_PASS_HANDOFF §0 | — |
| Design System — Koast palette | ✅ | Coastal/tideline/golden tokens, shadows via CSS vars. | `DESIGN_SYSTEM.md` | 132 `brand-*` refs still present across 24 files — migration in progress |
| Polish-pass primitives | ✅ | 18+ shared components in `src/components/polish/`. | POLISH_PASS_HANDOFF §3.1 | — |
| Plus Jakarta Sans + Fraunces fonts | ✅ | Jakarta everywhere; Fraunces for Dashboard display face + Calendar sidebar date header + HandwrittenGreeting. | POLISH_PASS_HANDOFF §2.5 | — |
| Fraunces expressive axes (opsz/SOFT/WONK) | ✅ | Via CSS `@import`. | Spec correction #28 | — |
| Canvas animated revenue chart (no chart libs) | ✅ | Ideological choice; requestAnimationFrame. | CLAUDE.md Design Philosophy #6 | — |
| Entrance animation library | 🟡 | Keyframes `fadeSlideIn`, `cardReveal`, `aiGlow` specified. | DESIGN_SYSTEM.md §16 | Actual globals.css only has `fadeIn`, `slide-in-*`, `shimmer` (Overhaul Plan Track A Global Gap #1) |
| `next/image` + explicit `sizes` for hero images | ✅ | Spec correction #15. | Same | — |
| `next.config.mjs` remote patterns | ✅ | `a0.muscache.com` allowed. | Spec correction #17 | — |
| `src/lib/platforms.ts` canonical config | ✅ | `platformKeyFrom()` normalizer. | CLAUDE.md Platform Config | VRBO intentionally omitted |
| `@floating-ui/react` positioning | ✅ | `ChannelPopover` uses it. | `@floating-ui/react@0.27.19` | — |
| Concurrency locks (advisory) | ✅ | `concurrency_locks` table, BDC connect mutex, apply idempotency. | `supabase/migrations/20260413020000_concurrency_locks.sql` | — |
| Free-tier property quota DB trigger | ✅ | `enforce_property_quota`. | `supabase/migrations/20260413010000_free_tier_property_quota.sql` | — |
| RLS fix migration | ✅ | Reviewed + patched. | `supabase/migrations/20260408010000_fix_rls_policies.sql` | — |
| Properties list endpoint | ✅ | `GET /api/properties/list`. | Route | — |
| Properties detail endpoints | ✅ | `GET /api/properties/[propertyId]`, `POST /api/properties/[propertyId]/sync-bookings`. | Routes | — |
| Photo backfill | ✅ | `POST /api/photos/backfill`. | Route | — |
| Property covers migration | ✅ | `cover_photo_url`. | `supabase/migrations/20260331020000_property_cover_photos.sql` | Source resolution ≈720px vs 2560px needed (CLAUDE.md Known Gaps — Image Assets) |
| HTML-entity decoded image URLs | 🟡 | `decodeImageUrl` helper in `PropertyDetail.tsx`. | CLAUDE.md Known Gaps | Fix at ingest in `booking_sync.py` |
| systemd timers on VPS | ✅ | `koast-pricing-validator.service/.timer`, `koast-pricing-performance-reconciler.service/.timer`. | CLAUDE.md VPS Workers | — |
| Repomix output up-to-date | ✅ | `~/staycommand/repomix-output.xml`. | CLAUDE.md FIRST STEPS | — |
| Sidebar navigation (9 items) | ✅ | Dashboard, Calendar, Messages \| MANAGE: Properties, Pricing, Reviews, Turnovers \| INSIGHTS: Market Intel, Comp Sets. | `src/app/(dashboard)/layout.tsx` | — |
| Keyboard shortcuts (⌘K, ⌘+/) | ✅ | CommandPalette, KoastRail collapse. | `src/components/polish/CommandPalette.tsx`, `KoastRail.tsx` | — |
| Keyframes `fadeSlideIn` / `cardReveal` / `aiGlow` in globals.css | 🔵 | Specified; globals.css currently has different set. | DESIGN_SYSTEM.md §16 | One-file fix; unblocks page entrance choreography |
| `brand-*` token migration (24 files, 132 refs) | 🟣 | Rolling migration each time a file is touched. | CLAUDE.md Legacy Token Cleanup | — |
| VRBO re-enablement | 🟣 | SVG assets + properties needed. | DESIGN_SYSTEM.md Platform Config | — |
| DESIGN_SYSTEM.md line-count correction | 🟣 | CLAUDE.md claims 1,119 lines, actual 462. | KOAST_OVERHAUL_PLAN.md Track A Global Gap #2 | — |
| DESIGN_SYSTEM.md VRBO removal | 🟣 | Section 8 still documents VRBO. | Same #3 | — |
| Onboarding SMS template emoji sweep | ❌ | `src/lib/onboarding/default-templates.ts` has 12+ emoji. | KOAST_OVERHAUL_PLAN.md Track A Global Gap #4 | User-visible, violates no-emojis |
| `BookingComConnect.tsx:227` emoji | ❌ | Uses ⚠ (U+26A0). | Same #5 | — |
| Mobile responsive optimization | 🟣 | Phase 3 per CLAUDE.md. Dashboard 3.8 landed mobile layout; rest TBD. | CLAUDE.md Phase 3 | — |
| Marketing site on koasthq.com | 🟣 | Phase 2. | CLAUDE.md Phase 2 | — |
| Incident postmortem — BDC clobber | ✅ | Reference document for safety invariants. | `docs/postmortems/INCIDENT_POSTMORTEM_BDC_CLOBBER.md` | — |

### DB tables

- `concurrency_locks`
- `properties` (core)
- `property_details`
- `user_preferences`

### API routes (infra-tier)

- `/api/properties/list`, `/api/properties/[propertyId]`, `/api/properties/[propertyId]/sync-bookings`
- `/api/properties/cleanup-scaffolds`, `/api/properties/geocode-all`, `/api/properties/auto-scaffold`
- `/api/photos/backfill`

### UI / system

- Sidebar `layout.tsx`
- `next.config.mjs` remote patterns
- Global Tailwind + Fraunces CSS `@import`

### Workers

- `db.py` — shared psycopg2 helpers
- `status.sh` — health check
- VPS: Virginia `44.195.218.19`

### Explicit gaps

- Three entrance keyframes missing in `globals.css`.
- 132 `brand-*` refs pending migration.
- Two emoji violations (onboarding SMS templates + BookingComConnect).

---

## 12. Direct Booking (Frontdesk)

Koast-branded direct booking website builder. Placeholder today.

### Features

| Feature | Status | Description | Source | Gap |
|---|---|---|---|---|
| `/frontdesk` placeholder page | 🟡 | Route exists as placeholder; waitlist CTA. | `src/app/(dashboard)/frontdesk/page.tsx`, CLAUDE.md Shipped Pages | No builder |
| Frontdesk waitlist capture | ✅ | `POST /api/frontdesk/waitlist`. | `src/app/api/frontdesk/waitlist/route.ts` | — |
| Direct booking website builder | ⚪ | Phase 3 per CLAUDE.md. | CLAUDE.md Phase 3, KOAST_PRODUCT_SPEC.md PART 9 | Not started |
| Direct booking flag column | ⚪ | `properties.direct_booking_enabled` column needed. | CLAUDE.md Known Gaps — Direct Booking Flag | No schema, no UI |
| DIRECT channel rate handling | ⚪ | `DIRECT` channel_code accepted in `calendar_rates`; no consumer edits it. | CHANNEX_PER_PLATFORM_AUDIT §5 Open Q #3 | — |
| Direct booking checkout flow | ⚪ | Full booking flow on host's own page. | KOAST_PRODUCT_SPEC.md PART 9 | — |
| Koast-managed payment capture for direct bookings | ⚪ | Implied by direct booking. | Implicit | — |
| Custom domain per property | ⚪ | Implied by direct booking. | Implicit | — |

### DB tables

- None yet (DIRECT is accepted in `listings.platform` CHECK + `calendar_rates.channel_code` but unused end-to-end)

### API routes

- `POST /api/frontdesk/waitlist`

### UI pages

- `/frontdesk` (placeholder)

### Workers

- None

### Explicit gaps

- No direct-booking flag column.
- No consumer surface for DIRECT channel rates.
- No builder, no checkout, no custom domain routing.

---

# Cross-cutting observations

These are patterns that span categories — worth seeing once before reading any one category in isolation.

1. **The pricing engine is done; the polish is packaging it.** All 9 signals, the validator, the rules table, the apply pipeline, and outcome capture are shipped. What's missing is roughly two things: (a) the Apply/Dismiss button in the global `/pricing` page actually calling the live routes, and (b) 14 days of validator data before `auto_apply` can unlock. Every other pricing gap is either cosmetic (entrance animations on `/pricing`) or incremental (per-platform suggestion granularity, BDC current_rate caching). The infrastructure under the intelligence is mostly load-bearing, not speculative.

2. **Calendar owns the "Apr 17–20" polish-pass energy.** Of 27 polish-pass commits, ~14 touched Calendar. The result is a Session-5a grid that's production-calibrated (two-tab sidebar, per-channel overrides with hairline indicator, opaque booking bars with proper turnover seams). Session 5b/5c/5d are queued. The open debates — 2-tier vs 3-tier min-stay, Koast-wide dirty-state primitives vs Calendar-specific, bulk edit's first home — are design questions, not build questions. Once Cesar picks, the implementation is scoped.

3. **Channel management is the most shipped-looking category, with one production risk.** 17 ✅ features, including atomic BDC connect with compensating rollback, safe-restrictions for every BDC write, 60s mutex, HTTP 207 partial-failure responses, and certified Channex whitelabel. The open risk is `channex.updateAvailability` (called by `/connect-booking-com/activate`) — not wrapped by `buildSafeBdcRestrictions`. This is the `Stage 1.5` Track B item. After that, the `KOAST_ALLOW_BDC_CALENDAR_PUSH` flag becomes the last belt-and-suspenders before it gets removed.

4. **AI is the biggest "designed-not-built" surface.** Messaging, operational routing, knowledge base, auto-send, and Haiku/Sonnet routing all have detailed specs but zero automation. What *is* shipped under the AI banner: review generation (Claude API wired), host review drafting, and the AI-insight card pattern on the dashboard. The pipeline spec is stable enough that a single focused session could stand up property-knowledge tables and a Channex-webhook → draft worker. The validation bottleneck is data — "70%+ send-as-is" needs a week of real drafts on Villa Jamaica.

5. **Team/roles and Direct Booking are the two "not yet a product" categories.** Both score mostly ⚪ VISION with zero or near-zero ✅ SHIPPED features. Everything else in the app has RLS enforced to a single user_id per property, and DIRECT shows up as a `channel_code` constant nobody reads. These are the categories where there's no forward momentum today — useful to know before treating them as roadmap items.

6. **Roadmap intent lives in many places.** Phase 1/2/3 in `CLAUDE.md`, "Upcoming Features" sub-sections in `CLAUDE.md`, Session 5b→6 in `docs/POLISH_PASS_HANDOFF.md`, Track B/C in `KOAST_OVERHAUL_PLAN.md`, Implementation Order in `KOAST_PRODUCT_SPEC.md`, and the Milestones section of `KOAST_PROJECT_PLAN.md`. They are mostly compatible but not single-sourced. Phase 2 of this audit should pick one canonical location; otherwise future sessions will re-argue the stack order.

7. **"Safety-mechanism conservatism" is a cultural invariant, not a feature.** Six places in the codebase hold <10-line safety scaffolding (`KOAST_ALLOW_BDC_CALENDAR_PUSH`, `buildSafeBdcRestrictions` pre-flight, BDC connect mutex, `pricing_performance` idempotent apply, `channex_webhook_log` dedup, `ical_feeds` 15s AbortController). The rule is: remove them only after observing a replacement in production. Every roadmap item that reads "remove X flag" belongs in the queue *after* the feature it protects ships and settles.

8. **Known-gap velocity is uneven.** Pricing + Calendar have gaps with named owners and session slots. Marketing, mobile, team, direct booking, and AI pipeline have gaps with no current track. That asymmetry isn't necessarily wrong — Phase 1's explicit focus is the first five hosts, and those are desktop-only single-user flows — but it's worth naming so downstream planning doesn't assume all "planned" items have equal momentum.

9. **Legacy UI drift is concentrated in three files.** `PricingDashboard.tsx` (15 `bg-brand-*` + 44 `text-neutral-*`), `PropertiesPage.tsx` AddPropertyModal section (28 `neutral-*`), and `reviews/page.tsx` (3 `text-brand-*` + 23 `text-neutral-*`). Touching any of those files already implies a token sweep. The remaining ~85 `brand-*` references are spread across 21 files, trickling out with each polish session.

10. **The validator is the most load-bearing worker and the thinnest evidence base.** Four days of data across two properties is enough to confirm the pipeline runs end-to-end; it is not enough to tune weights or flip auto-apply. Everything downstream of "trust the engine" (the trust-builder scorecard, auto-apply unlock, pricing proof for marketing) is currently blocked on data volume, not code volume. This is the cheapest ongoing unlock — the worker already runs daily.

---

*End of inventory.*
