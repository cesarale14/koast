# Koast (formerly Moora / StayCommand) — CLAUDE.md

## FIRST STEPS FOR EVERY SESSION
1. Read this file completely before any work.
2. Read `DESIGN_SYSTEM.md` before any UI work. Every component, color, shadow, animation, and spacing must match the design system exactly.
3. Read `KOAST_PRODUCT_SPEC.md` for feature requirements before implementation.
4. Run `cat ~/staycommand/repomix-output.xml | head -200` for project structure. If stale: `cd ~/staycommand && repomix`.
5. Never run `npm run build` on the VPS — use `npx tsc --noEmit` then `git push`. Vercel builds with 8GB RAM.

## Prompt Format
Every prompt to Claude Code should start with:
"Read ~/staycommand/CLAUDE.md and repomix-output.xml first."

## Planning Mode
- Use **/ultraplan** for multi-file architecture changes (5+ files, new subsystems, API + UI + DB changes).
- Skip ultraplan for small fixes (1-3 files, UI tweaks, single bug fixes).

## Code Rules
- **Never use sub-agents** — write all code directly.
- Always run `npx tsc --noEmit` before committing.
- Always push to `main` after committing. Vercel auto-deploys.
- Return actual error messages in API responses — never return empty 500s.
- Wrap all API handlers in try/catch.
- Never run `npm run build` on VPS (times out, insufficient RAM).
- ESLint: unused variables break the Vercel build — check before push.
- **Never use default Tailwind grays, shadows, or generic border-radius** — see DESIGN_SYSTEM.md.
- **No emojis anywhere** — UI, AI-generated content, or user-visible SMS bodies.
- **No pulsing/glowing animated dots.** Status indicators are solid colored dots.

---

## Product Overview
Koast is a unified STR (short-term rental) operating system with AI-powered pricing, market intelligence, and channel management. Competes with Hospitable, Hostaway, and Guesty — with a 9-signal pricing engine and market intelligence layer that none of them have. Tagline: "Your hosting runs itself."

- **Live URL:** https://app.koasthq.com
- **Domain:** koasthq.com (apex 308s to app.koasthq.com)
- **GitHub:** cesarale14/staycommand

## Tech Stack
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Database:** Supabase PostgreSQL + Auth + Drizzle ORM
- **Deployment:** Vercel (auto-deploy from GitHub main)
- **VPS (Virginia, 44.195.218.19):** Koast workers (pricing validator, booking sync, market sync). Cleaned 2026-03-24 (legacy projects removed). BTC5MIN bot is NOT on this VPS — it runs on Ireland.
- **Channel Manager:** Channex.io (CERTIFIED, production whitelabel active at app.channex.io)
- **Market Data:** AirROI API
- **AI Messaging:** Claude API (Anthropic)
- **SMS:** Twilio
- **Events:** Ticketmaster API
- **Weather:** Weather.gov API (free, no key)
- **Font:** Plus Jakarta Sans via `@fontsource-variable`
- **Floating UI:** `@floating-ui/react@0.27.19` (positioning for popovers)

---

## Design System — Koast
Full details in `DESIGN_SYSTEM.md` (462 lines). Key rules:
- NEVER use default Tailwind grays (`gray-*`, `slate-*`, `zinc-*`). Use Koast tokens.
- NEVER use Tailwind shadow utilities (`shadow-md`, `shadow-lg`). Use the CSS-variable shadow stacks.
- NEVER use generic border-radius — see DESIGN_SYSTEM.md Section 4.
- Platform logos must be real SVGs from `/icons/platforms/` via `src/lib/platforms.ts`. Never approximate with colored circles + letters.
- Revenue chart uses HTML Canvas + `requestAnimationFrame` — no `recharts`, no `chart.js`.
- Every page has entrance choreography: staggered card reveals, count-up numbers, chart draw animations.
- Entrance animations use `ease-out`. Hover transitions use `cubic-bezier(0.4, 0, 0.2, 1)`.

### Color Palette (quick reference)
```
Deep Sea   #132e20    Coastal   #17392a    Mangrove  #1f4d38    Tideline  #3d6b52
Golden     #c49a5a    Driftwood #d4b47a    Sandbar   #e8d5b0
Shore      #f7f3ec    Dry Sand  #ede7db    Shell     #e2dace
Coral Reef #c44040    Amber Tide#d4960b    Lagoon    #1a7a5a    Deep Water#2a5a8a
Bar Dark   #222222  (booking bars — NEVER platform-colored)
```

### Platform Config
All platform references must go through `src/lib/platforms.ts`. Never hardcode `/icons/platforms/*` paths or brand hex codes.

```ts
PLATFORMS.airbnb.tile / .icon / .iconWhite        // coral #FF385C
PLATFORMS.booking_com.tile / .icon / .iconWhite   // navy  #003580
PLATFORMS.direct.tile / .icon / .iconWhite        // uses koast-tile.svg, golden #c49a5a
// VRBO intentionally omitted from PLATFORMS — no properties use it today and
// the brand SVG assets are not in the repo. Re-add when assets land.
```

`platformKeyFrom(code)` normalizes `"ABB" / "airbnb"`, `"BDC" / "booking" / "booking.com" / "booking_com" / "booking-com"`, `"direct" / "koast"`. Returns `null` for `"HMA" / "vrbo"` (alias accepted but maps to nothing, since VRBO isn't in PLATFORMS).

### Legacy Token Cleanup (in progress)
`bg-brand-500` resolves to `var(--coastal)`, `bg-brand-600` to `var(--deep-sea)`. Current count: **43 `bg-brand-500` occurrences across 17 files; 16 files with `bg-brand-600`; 65 `text-brand-*` occurrences; 132 total `brand-*` references across 24 files.** Migrate each file to Koast tokens when you touch it; deletion of the aliases is a phase-1 milestone.

---

## Active Properties (verified in DB 2026-04-17)
| Property | Airbnb | Booking.com | channex_property_id |
|---|---|---|---|
| **Villa Jamaica** (`bfb0750e-9ae9-4ef4-a7de-988062f6a0ad`) | Listing 1240054136658113220, rate plan `3070d2ad-23a2-4de2-9fab-23840c23908c`, status=active | Hotel 12783847, channel `4c7852e8-122c-4276-a4f2-31960a9a34e4`, rate plan `7439f86d-001f-4557-a181-6c51c01d4c91`, parent rate code **48257326**, status=active | `4d52bb8c-5bee-479a-81ae-2d0a9cb02785` |
| **Cozy Loft - Tampa** (`57b350de-e0c7-4825-8064-b58a6ec053fb`) | active (ABB), rate plan `17e74f6d-2381-45b8-929d-7174d0290a72` | — | `6928213d-7a2f-449c-90bc-115b1007be45` |

**Previously listed but removed from DB:** Pool House - Tampa, Modern House - Tampa, Stadium Loft - Tampa. Do not reintroduce in docs without checking DB first.

**Co-located parcel:** both properties share `4105 N Jamaica St, Tampa, FL 33614`. Cozy Loft is a 1BR back unit of the Villa Jamaica main house — same physical parcel, different rentable units. Multi-unit modeling (`parent_property_id`, shared amenities/photos/location) is deferred — see Known Data Quality Issues.

**Airbnb OAuth:** currently disconnected from Channex. Reconnect when PMS is ready for production.

---

## Known Data Quality Issues
- **Multi-unit properties not modeled.** Villa Jamaica + Cozy Loft share a physical address (same parcel, different rentable units). No `parent_property_id` on `properties` table, no shared-field inheritance. Works for now because the fleet is 2 properties with human operators; will need modeling once a real host has multi-unit listings. Deferred to post-MVP — see `KOAST_OVERHAUL_PLAN.md` Track D item 9.
- **Comp set quality markers.** Each property has `properties.comp_set_quality` (`precise` | `fallback` | `insufficient`) reflecting whether its `market_comps` come from the strict `filtered_radius` path (precise match on bed/price/radius) or the `similarity_fallback` path (AirROI `/comparables` similarity search, used when precise matches <3). Every `market_comps` row is tagged with `source` (`filtered_radius` | `similarity_fallback`) so downstream consumers can read the quality and down-weight the Competitor pricing signal on fallback data. Track D will surface this to the host and down-weight the signal. Unified single-writer `buildFilteredCompSet` in `src/lib/airroi/compsets.ts` serves `/api/properties/import-from-url`, `/api/market/refresh`, and `/api/market/comps`. Legacy `buildCompSet` + `storeCompSet` deleted.
- **Import-from-url heuristic coordinates.** `src/app/api/properties/import-from-url/route.ts:103-117` applies Tampa-downtown lat/lng (`27.9506, -82.4572`) to any property whose name contains "tampa". Produces wrong coords for any non-Tampa property that happens to include the word. Should be replaced with Google Places Autocomplete-based geocoding during the Channex connection polish — see `KOAST_PROJECT_PLAN.md`.
- **Property coords are Nominatim street-level, not parcel-level.** Both Villa Jamaica and Cozy Loft (same parcel, `4105 N Jamaica St`) are set to `27.9873607, -82.4944434` — a street-level point from Nominatim, not the specific building. Adequate for 2km AirROI comp radius + Ticketmaster event radius use cases. If parcel-level precision ever matters (walkability scoring, parking instructions, etc.), pull from Google Maps or a paid geocoder.
- **`/api/channex/setup-webhook` writes to Channex (`createWebhook`) ungated.** Webhook config is NOT in the BDC calendar clobber class per the postmortem scope table — it controls routing, not guest-facing state. Intentionally left unguarded by Stage 0. If a future audit finds webhook writes can affect guest-facing behavior, add to the gate list via `src/lib/channex/calendar-push-gate.ts`.
- **BDC restrictions safety — Track B Stage 1 PR A.** All three BDC-writing routes (`/activate`, `/pricing/push`, `/channels/rates` POST) now route through `buildSafeBdcRestrictions` in `src/lib/channex/safe-restrictions.ts` when the target channel is BDC. The helper pre-fetches current BDC state and only emits writes that are safe (BDC-closed dates preserved in full; rate deltas >10% skipped; min-stay weakening refused). Two new endpoints complement the pipeline: `POST /api/pricing/preview-bdc-push/[propertyId]` (dry-run, no writes) and `POST /api/pricing/commit-bdc-push/[propertyId]` (idempotent via concurrency_locks, HTTP 207 on partial failure). Env gate `KOAST_ALLOW_BDC_CALENDAR_PUSH` kept as belt-and-suspenders (still default-off on Vercel) per the "safety-mechanism conservatism" rule until real traffic confirms the helper works. Drop the gate in a follow-up commit after observation. KNOWN GAP: `/activate` also pushes room-type availability via `channex.updateAvailability` — that endpoint is NOT wrapped by safe-restrictions (restrictions ≠ room-type availability) and scheduled for Stage 1.5 / early PR B.

---

## Channex Integration (CRITICAL LEARNINGS)
- **CERTIFIED** — production approved, whitelabel active at `app.channex.io/api/v1`.
- **BDC rates:** use `availability=0` at the room-type level to block dates — NOT `stop_sell=true` (BDC interprets that as closing the whole property).
- **BDC requires rates for the full bookable window** (today → 18+ months). Any date with $0 triggers "missing prices" warnings in BDC extranet.
- **Slave/child rates reject all pushes** with `RATE_IS_A_SLAVE_RATE`. Always identify and target the parent rate code.
- **Channel activation:** `POST /channels/{id}/activate` is required. `PUT is_active:true` silently no-ops.
- **Airbnb rate pushing works** via Channex rate plans. The old "read-only" assumption was wrong.
- **Webhook idempotency:** dedup every incoming Channex webhook via `channex_webhook_log.revision_id`. Duplicate deliveries ack and skip without re-processing.
- **Property + rate plan lookup:** `GET /rate_plans?filter[property_id]=X` ∩ the channel's `rate_plans` array. Multi-property channels (one Airbnb account, many listings) expose every linked property's rate plans — filter by property-owned ID set or you'll pick the wrong one.

### Booking.com Self-Service Connection
- **Flow:** user enters Hotel ID → API creates Channex BDC channel → tests connection → if BDC hasn't authorized Channex, shows instructions (admin.booking.com → Account → Connectivity Provider → search "Channex") → retry → on success, pushes availability + activates.
- **API routes:** `POST /api/channels/connect-booking-com` (create), `.../test` (test auth), `.../activate` (push avail + activate).
- **UI:** `BookingComConnect.tsx` modal (form → progress → authorization → success).
- **Channex client methods:** `createChannel`, `updateChannel`, `testChannelConnection`, `deleteProperty`, `getRestrictionsBucketed`.
- **Atomic channel creation:** compensating try/catch rollback deletes scaffold property, rate plan, and channel on later failure. Orphans are prevented at source.
- **Per-property mutex:** 60-second advisory lock in `concurrency_locks` keyed `bdc_connect:{propertyId}`. Concurrent requests return HTTP 409 `connect_in_progress`.
- **Dedicated rate plan:** every BDC connect creates a NEW rate plan — never reuses an existing one. Prevents rate bleed between Airbnb and Booking.com.
- **Name matching (Koast ↔ Channex):** strict normalized equality. Strips `" - X"`, `" in X"`, Airbnb rating noise. Ambiguous matches surface as candidates instead of auto-picking.

---

## Reliability Infrastructure
- **Webhook idempotency:** `channex_webhook_log.revision_id` dedup.
- **Free-tier enforcement:** `enforce_property_quota` DB trigger (`supabase/migrations/20260413010000_free_tier_property_quota.sql`). Limits: free=1, pro=15, business=unlimited. `user_subscriptions` (default free) is authoritative — client-side count check is fast-UX only.
- **BDC connect mutex:** 60s advisory locks in `concurrency_locks` (migration `20260413020000_concurrency_locks.sql`).
- **Atomic BDC creation:** compensating rollback on failure.
- **Rate push partial-failure handling:** `/api/pricing/push` wraps each 200-entry batch in try/catch, returns HTTP 207 multi-status with `partial_failure: true` and per-batch failure date ranges.
- **Scaffold cleanup on import:** re-import retargets `channex_room_types` / `channex_rate_plans` / `property_channels` rows to the real property AND deletes the orphaned scaffold via `channex.deleteProperty`.
- **iCal preview mode:** `POST /api/ical/add` with `property_id: "preview"` parses/validates without DB writes or ownership checks. 15s `AbortController` timeout prevents hung feeds.
- **iCal ghost booking cleanup:** UIDs removed from a feed get cancelled regardless of original source. Channex-linked rows also unblock affected `calendar_rates` to keep cross-channel availability accurate.

---

## 9-Signal Pricing Engine
Weights (sum = 1.0):
- Demand 0.20 (AirROI market occupancy)
- Competitor 0.20 (comp-set percentile)
- Seasonality 0.15 (learnable from `pricing_outcomes` after 30+ days)
- Events 0.12 (Ticketmaster, stacked, capped +40)
- Gap Night 0.08 (orphan 1-2 night detection)
- Booking Pace 0.08 (smart baseline from historical data)
- Lead Time 0.07 (rate position vs market at days-until-check-in)
- Weather 0.05 (Weather.gov 14-day, cached in `weather_cache`)
- Supply Pressure 0.05 (month-over-month listing-count change)

### Pricing Validator (LIVE — Virginia VPS)
- **Script:** `~/staycommand-workers/pricing_validator.py`
- **Unit:** `koast-pricing-validator.service` + `.timer`
- **Schedule:** daily at 6:00 AM ET / 10:00 UTC
- **Writes to:** `pricing_recommendations` table (+ `pricing_recommendations_latest` view)
- **Current data:** 480 rows across 4 daily runs × 2 properties × 60 dates

**Results so far (Apr 14-16, 2026):**
| Day | Cozy Loft delta | Villa Jamaica delta |
|---|---|---|
| Apr 14 | +$6.00 (+8.70%), higher 60/60 | +$14.10 (+8.21%), higher 46/60 (76%), lower 14 |
| Apr 15 | +$6.00 (+8.70%), higher 60/60 | +$11.60 (+7.07%), higher 42/60 (70%), lower 17 |
| Apr 16 | +$6.00 (+8.70%), higher 60/60 | +$11.25 (+6.87%), higher 42/60 (70%), lower 17 |

**Status:** collecting daily data. Need ≥14 daily snapshots before confident auto-apply.

### Pricing Tables — actual state
```sql
-- Present (migration + DB):
pricing_recommendations (id, property_id, date, current_rate, suggested_rate,
                         reason_signals JSONB, delta_abs, delta_pct, created_at)
pricing_recommendations_latest   -- view, newest snapshot per (property, date)

-- Present (in schema.ts + DB):
pricing_outcomes  -- used by seasonality signal after 30+ days of data

-- Planned (NO migration yet — do not treat as available):
-- pricing_rules      -- base/min/max rate + channel markups + auto_apply toggle
-- pricing_performance -- suggested vs actual vs booked vs revenue_delta
```

---

## Shipped Pages
All redesigned April 2026 to the Koast design system.

| Sidebar label | Route | Notes |
|---|---|---|
| Dashboard | `/` | Glass cards, canvas revenue chart, AI insight cards (dark deep-sea + golden glow), entrance animations, count-up numbers |
| Calendar | `/calendar` | Airbnb-style monthly grid, 24-month scroll, dark #222 booking bars with platform logos, per-channel rate editor right panel |
| Messages | `/messages` | Three-column inbox, AI draft scaffolding, context panel |
| Properties | `/properties` | Photo-led cards, status bars, channel badges, ChannelPopover on hover |
| Pricing | `/pricing` | Rate calendar with signal cards, market-context sidebar, apply-suggestion flow |
| Reviews | `/reviews` | AI review generation (Claude), approve/schedule/edit flow |
| Turnovers | `/turnovers` | Task list, status pills, cleaner management, auto-create from bookings |
| Market Intel | `/market-intel` | Glass stats, occupancy/ADR charts, revenue-opportunity AI card |
| Comp Sets | `/comp-sets` | Glass stats, pinned your-property row, sortable competitive table |

**Not in the sidebar but reachable by URL:**
| Route | Purpose |
|---|---|
| `/properties/[id]` | Property Detail — 280px hero, 3 tabs (Overview / Calendar / Pricing), pricing scorecard with recommendations |
| `/properties/new` / `/properties/import` | Onboarding entry points |
| `/nearby-listings` | AirDNA-style browse with AirROI photos |
| `/analytics` | Portfolio analytics dashboard |
| `/bookings` | Bookings list |
| `/channels` / `/channels/connect` / `/channels/sync-log` | Channel management + connect flow + sync log |
| `/frontdesk` | Direct booking website builder (placeholder) |
| `/onboarding` | First-run signup → connect → first property |
| `/certification` / `/channex-certification` | Channex 14-test runner + internal cert tooling |
| `/settings` | Account settings |
| `/login` / `/signup` | Dark theme, AuthShell, golden CTA, Google OAuth button (not yet configured) |
| **Public (no auth):** `/revenue-check` | Lead-gen tool |
| **Public (no auth):** `/clean/[taskId]/[token]` | Cleaner token landing page |

### Sidebar Structure (actual)
```
(no label):   Dashboard, Calendar, Messages
MANAGE:       Properties, Pricing, Reviews, Turnovers
INSIGHTS:     Market Intel, Comp Sets
```
Source: `src/app/(dashboard)/layout.tsx`. Nine items total.

### Key UI Components
- `src/lib/platforms.ts` — PLATFORMS config
- `src/hooks/useCountUp.ts` — animated number count-up
- `src/components/auth/AuthShell.tsx` — shared dark auth shell
- `src/components/dashboard/RevenueChart.tsx` — canvas-drawn animated chart
- `src/components/dashboard/` — AnalyticsDashboard, BookingComConnect, CompMap, ConflictResolution, DashboardClient, IntelMap, MessagesPageTabs, PricingDashboard, PropertiesPage, PropertyDetail, SyncLogDashboard, TemplateManager, TurnoverBoard, UnifiedInbox, WeekCalendar
- `src/components/channels/ChannelPopover.tsx` — **SHIPPED.** Hover popover (desktop) + mobile bottom sheet. Wired into DashboardClient, PropertiesPage, PropertyDetail, PerChannelRateEditor. Uses `@floating-ui/react`
- `src/components/calendar/` — CalendarGrid, MonthlyView, BookingBar, BookingSidePanel, CalendarToolbar, DateCell, DateEditPopover, PerChannelRateEditor, PropertyRow, PropertyThumbStrip, ChannelLogo
- `src/components/ui/` — AddressAutocomplete, EmptyState, EventBadge, Logo, PageSkeleton, PlatformLogo, PropertyAvatar, ReviewBadge, Skeleton, StatCard, Toast

### Design Spec Files
- `DESIGN_SYSTEM.md` — colors, tokens, components, animations, page patterns
- `KOAST_PRODUCT_SPEC.md` — full product spec, every page, every feature
- `KOAST_PROJECT_PLAN.md` — 4 parallel tracks, milestones, priorities
- `PLATFORM_ICONS.md` — platform logo usage + SVG sourcing
- `docs/mockups/*.html` — 6 HTML visual targets (koast-dashboard-v3, koast-calendar-v2, koast-messages, koast-properties, koast-property-detail, koast-remaining-pages)

---

## Database (30 tables, verified 2026-04-17)
`bookings, calendar_rates, channex_rate_plans, channex_room_types, channex_sync_state, channex_webhook_log, cleaners, cleaning_tasks, concurrency_locks, guest_reviews, ical_feeds, leads, listings, local_events, market_comps, market_snapshots, message_templates, messages, notifications, pricing_outcomes, pricing_recommendations, properties, property_channels, property_details, revenue_checks, review_rules, sms_log, user_preferences, user_subscriptions, weather_cache`.

The `notifications` table is an audit log for every outbound SMS/email/push. Written by `storeNotification()` in `src/lib/notifications/index.ts` after each `notify*` call (migration `20260417010000_notifications.sql`).

---

## VPS Workers (`~/staycommand-workers/` on Virginia 44.195.218.19)
- `booking_sync.py` — iCal sync + Channex revision polling (every 15 min via systemd timer)
- `pricing_validator.py` — daily 6 AM ET, writes to `pricing_recommendations` (480 rows so far)
- `pricing_worker.py` — rate calculation + market refresh
- `market_sync.py` — AirROI market data collection
- `ical_parser.py` — iCal feed parsing
- `db.py` — direct PostgreSQL (psycopg2) shared connection helpers
- `status.sh` — health check

All workers use direct PostgreSQL (psycopg2), **not** HTTP API routes.

### Unrelated VPS (not Koast infra)
Ireland VPS (54.220.193.50) runs BTC5MIN MACD+CVD Polymarket bot (`~/BTC5MIN/`), Pump.fun memecoin collector, and weather/Kalshi/sports bots. Separate SSH key, separate codebase — do not touch from Koast sessions.

---

## Development Workflow
1. Make changes in `~/staycommand`.
2. `npx tsc --noEmit 2>&1 | head -20`.
3. If clean: `git add -A && git commit -m "message" && git push`.
4. Vercel auto-builds (~30s).
5. Never run `npm run build` on the VPS.

---

## What's Working (production-ready)
- Channel sync: Airbnb + BDC via Channex (webhooks + iCal + polling)
- Booking management: create, import, dedup, cross-channel blocking
- Per-channel rate editing + pushing to Channex
- Calendar with real booking data and rate display
- AI review generation (Claude API)
- Cleaning task auto-creation + Twilio SMS to cleaners
- Market data from AirROI (comps, ADR, occupancy, demand score)
- Events from Ticketmaster, weather from Weather.gov
- ChannelPopover interactive platform badges (desktop hover + mobile bottom sheet)
- Pricing engine daily validation runs (Virginia VPS timer)

## Known Gaps / Not Wired
- **Pricing Apply wiring** — Apply buttons exist in Property Detail pricing tab but don't push to Channex yet. Need to call `/api/channels/rates/[propertyId]` with the same flow the calendar rate editor uses.
- **AI messaging pipeline** — scaffolded in Messages UI, no automation. "AI Drafted" filter is dimmed.
- **Revenue chart data query** — canvas chart exists; daily revenue aggregation from `bookings` needs fixing. Currently shows empty state.
- **Dashboard greeting** — may still show auth username instead of display name on some paths.
- **Channel health monitoring** — no `channel_health` table, no 5-minute worker, no disconnect alert banners.
- **Auto-apply pricing** — toggle dimmed ("Coming soon"). Unlock after ≥14 days of validation data.
- **Airbnb OAuth** — disconnected from Channex; reconnect when ready.
- **Google OAuth** — button on login, needs Supabase Google-provider config.

---

## UPCOMING FEATURES (Designed, Not Built)
Items here have a detailed design spec but no shipped code (or only partial wiring). Specs here are the canonical contract — when implementing, don't deviate without updating this section.

### ChannelPopover — STATUS: SHIPPED 2026-04-16 (spec preserved as the design contract)
Component at `src/components/channels/ChannelPopover.tsx`; wired into `DashboardClient`, `PropertiesPage`, `PropertyDetail`, `PerChannelRateEditor`. This spec documents the intended design so future edits don't regress it.

- **Desktop**: floating popover, 340px wide, `@floating-ui/react` positioning, 200ms hover delay, 100ms grace period before close.
- **Mobile**: bottom sheet, tap trigger, 70vh max, draggable handle. *Intended library: `vaul` — not yet installed; today's mobile behavior is handled without it. Add vaul when the sheet gets polish work.*
- **Content**:
  - Platform header with status dot (healthy / degraded / disconnected).
  - Stats row: bookings, revenue, rating for this channel this month.
  - Connection details: listing ID (copyable), last synced, sync method, expandable Advanced section.
  - Actions: Edit rates · Push rates now · View listing on platform · Reconnect (if disconnected). **No Disconnect button** — that stays in Settings.
- **Triggers ONLY on**: property card channel badges, rate panel platform headers, property detail hero badges.
- **Does NOT trigger on**: booking bars, conversation avatar badges, inline platform pills.
- **Keyboard**: focusable; Enter/Space opens; Escape closes; Tab cycles actions.

### Pricing Apply wiring
Apply buttons exist in the Property Detail pricing tab but don't push to Channex yet. Wire to `/api/channels/rates/[propertyId]` using the same flow the calendar rate editor uses. Per-channel markups from `pricing_rules` should be applied before pushing. **Dependency:** requires the `pricing_rules` migration below to land first.

### `pricing_rules` / `pricing_performance` tables
Documented shape exists but no migrations. Write before UI features depend on them:
- `pricing_rules (id uuid, property_id uuid, base_rate numeric, min_rate numeric, max_rate numeric, channel_markups jsonb, auto_apply boolean default false)`
- `pricing_performance (id uuid, property_id uuid, date date, suggested_rate numeric, actual_rate numeric, booked boolean, revenue_delta numeric)`

### AI messaging pipeline
- **Auto-draft** on incoming messages via Claude API — Haiku for simple (hours, wifi, code), Sonnet for complex (extensions, early check-in, conflict).
- **Property knowledge base** per property: local recs, house rules, FAQ. Stored per-property; fed to Claude as system prompt.
- **Auto-send** (no human approval): check-in instructions (day before), checkout reminders (day before checkout), welcome messages (at check-in time).
- **Operational routing**:
  - Guest says "towels" / "broken" / "dirty" → AI drafts reply to guest AND creates `cleaning_tasks` row + SMS to cleaner.
  - Guest asks about extending → AI checks availability, drafts response with dates + rate.
  - Guest asks early check-in → AI checks if property is free the night before, drafts conditional approval.

### Channel health monitoring
5-minute health check worker on the Virginia VPS. New table:
- `channel_health (property_id uuid, channel_type text, status text, last_check timestamptz, last_success timestamptz, error_message text)`
- **Status**: `healthy` (<15 min since success) / `degraded` (15-60 min) / `disconnected` (>60 min or failed).
- **UI**: red non-dismissible banner on dashboard + property card status bar turns red + email notification.
- **Recovery**: "Reconnect" button triggers OAuth flow, then a full availability + rate resync.

### Revenue chart data
Daily revenue aggregation query from `bookings` (sum payouts grouped by checkout date per day) → feeds the canvas chart on Dashboard. Replaces today's empty-state placeholder.

### Auto-apply pricing
Gated on ≥14 days of validation data. Reads `pricing_rules.auto_apply` + `pricing_performance` outcomes to decide whether to push the engine's suggestion automatically.

### Direct booking website builder (Frontdesk)
`/frontdesk` is a placeholder today.

### Owner portal / multi-user
Shared property access, role-based permissions.

---

## DESIGN PHILOSOPHY
These principles guide every UI decision in Koast.

1. **Video-worthy on first load.** Every page has choreographed entrance animations — staggered card reveals, count-up numbers, chart draws. When a host records their screen for a Facebook group, the app should make people stop scrolling and ask "what PMS is that?"
2. **Platform logos are data surfaces, not decoration.** They reveal connection health, channel stats, and management actions on hover (ChannelPopover). No other PMS treats channel logos as interactive.
3. **AI moments use dark cards.** Deep-sea gradient with ambient golden glow — they break visually from the light product chrome and feel like the system is thinking. Never generic white cards for AI content.
4. **The pricing page shows actions, not dashboards.** Hosts don't want to interpret 9 signal cards with progress bars. They want "you're leaving $430 on the table" and a one-tap Apply button. Signal breakdowns are expandable "why" details behind each recommendation.
5. **Show me the money.** Every AI insight leads with a dollar amount. "+$765 potential" is more motivating than "29 dates below market." The dollar amount counts up on entrance.
6. **No emojis. No pulsing dots. No chart libraries.** Professional tone throughout. Status via solid colored dots only. Revenue chart is Canvas-drawn with `requestAnimationFrame`. These constraints are what make the design feel intentional rather than assembled.
7. **Glass cards for key metrics only.** The glossy gradient + reflection effect is reserved for portfolio stats and market overview. Using it everywhere dilutes the premium feel.
8. **Golden section labels are the #1 brand signature.** 11px bold uppercase golden text before every content group — "YOUR PROPERTIES", "PORTFOLIO PERFORMANCE", "AI INSIGHTS", "CHANNEL RATES". This is what makes Koast look like Koast.
9. **Photography as architecture.** Property photos are large (160-280px), atmospheric, with gradient overlays and channel badges. Not thumbnails in a table.

---

## COMPETITIVE EDGES
What Koast has that competitors don't.

| Edge | Koast | Hospitable | Hostaway | Guesty |
|---|---|---|---|---|
| 9-signal pricing engine | Yes (demand, comps, seasonality, events, gap night, pace, lead time, weather, supply) | No | Basic | PriceLabs integration only |
| Per-channel rate control with live Channex verification | Yes | No | Basic | Basic |
| AI review generation with approve/schedule | Yes (Claude API) | Templates only | Templates only | Templates only |
| Market intelligence with comp-set tracking | Yes (AirROI, 3,911 listings) | No | Basic | No |
| Event-based pricing (Ticketmaster) | Yes | No | No | No |
| Interactive platform logos (ChannelPopover) | Yes (shipped 2026-04-16) | No | No | No |
| Canvas-drawn animated revenue chart | Yes | No | No | No |
| AI insight cards with dollar amounts on dashboard | Yes | No | No | No |
| Dark AI card design language | Yes | No | No | No |
| Entrance choreography on every page | Yes | No | No | No |
| Design quality (premium vs enterprise-gray) | Yes — coastal green, golden accents, glass effects | Basic | Basic | Enterprise gray |
| Starting price | Free (1 property) | $40/mo | $29/mo | Custom |

---

## Pending Items (priority order)

### This week
*(All three rebrand-debt items shipped 2026-04-17: VRBO dropped from PLATFORMS, SMS copy rebranded + de-emoji'd, `notifications` migration added.)*

### Phase 1 — Ship to first 5 hosts (2 weeks)
- Wire pricing Apply buttons to Channex rate push.
- Fix revenue chart data query (daily aggregation from `bookings`).
- Continue pricing validation (currently at 4 days, need 14).
- Commission Koast logo.
- Channel health monitoring worker + `channel_health` table + disconnect banners.
- Onboarding polish: signup → connect → first property in 3 minutes.
- Reconnect Airbnb OAuth (Villa Jamaica + Cozy Loft).
- First `brand-*` → Koast-token migration sweep (start with the 17 files touching `bg-brand-500`).

### Phase 2 — Intelligence layer (4 weeks)
- AI messaging pipeline (auto-draft, auto-send, operational routing).
- Marketing site on koasthq.com.
- Revenue Check lead-gen polish (`/revenue-check`).

### Phase 3 — Operations (8 weeks)
- Pricing auto-apply (after 14+ days validation).
- Direct booking website builder (Frontdesk).
- Owner portal / multi-user.
- Mobile responsive optimization.

---

## Common Gotchas
1. BDC child/slave rates reject all pushes — find the parent rate code.
2. `POST /channels/{id}/activate` is required (PUT `is_active:true` silently no-ops).
3. `availability=0` blocks dates on BDC, NOT `stop_sell=true`.
4. Rates must cover today → 18+ months — missing dates trigger BDC warnings.
5. iCal BDC events look like blocks but are real bookings — the parser must treat them as bookings.
6. iCal sync must push availability to Channex after inserting bookings.
7. Revenue chart is HTML Canvas + `requestAnimationFrame` — no chart libraries.
8. Entrance animations use `ease-out`; hover transitions use `cubic-bezier(0.4, 0, 0.2, 1)`.
9. Drizzle returns camelCase; client expects snake_case — normalize at API route boundary.
10. Channex availability for vacation rentals: 1=available, 0=booked (not 10/9/8).
11. `calendar_rates` columns: `rate` vs `suggested_rate` vs `applied_rate` — suggested is engine output.
12. `/revenue-check` and `/clean` are public routes (auth middleware skips them).
13. Calendar layout: GAP constant in `MonthlyView.tsx` must match the `--col` formula `calc((100% + GAP) / 7)`; bar width is `calc(var(--col) * span - GAP)` to prevent overflow.
14. `bg-brand-500` → `var(--coastal)` aliased in `globals.css`; visually correct but each use should be migrated to `bg-coastal` when the file is touched.
15. ChannelPopover positioning uses `@floating-ui/react` — don't re-implement with raw `position: absolute`.

---

## External API Keys (`.env.local` + Vercel)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DATABASE_URL_POOLED`, `CHANNEX_API_KEY`, `AIRROI_API_KEY`, `ANTHROPIC_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TICKETMASTER_API_KEY`.

---

## Acquisition Strategy
- **Target:** 400+ active users, $500K ARR → $3-4M acquisition at 6-8× ARR.
- **Pricing tiers:** Free ($0, 1 property), Pro ($79, 15 properties), Business ($149, unlimited). Enforced by `enforce_property_quota` DB trigger.
- **Key differentiator:** 9-signal pricing + market intelligence + operations in one platform.

## Strategic Decision Framework

### Prime Directive
Every feature, architecture, and UX decision must be evaluated against: **"Does this move Koast closer to being the best PMS on the market?"**

### Decision Criteria (priority order)
1. **Host Time Savings** — quantify minutes/week saved.
2. **Revenue Impact** — does this directly help hosts earn more?
3. **Competitive Moat** — can Hospitable / Hostaway / Guesty easily replicate?
4. **Scalability** — works for 1 property AND 50 without redesign?
5. **User Delight** — good enough that hosts screenshot and share in STR Facebook groups?
6. **Data Flywheel** — generates data that makes Koast smarter over time?

### Build Philosophy
- Ship 90%-polished, not 60%-shipped-fast.
- Every screen should look like it belongs in a $50M SaaS product.
- Defer features that don't clearly serve the Prime Directive.
- Prefer deep integration over surface features — don't just show data, act on it.
- Always ask: "What would make a host switch FROM their current PMS TO Koast?"

---

## Recent Commit History (Rebrand + Redesign, Apr 14-16 2026)
| Commit | Summary |
|---|---|
| `a930c7a` | Wire ChannelPopover into dashboard property card badges |
| `8d8cc21` | Build ChannelPopover with hover popover + mobile bottom sheet |
| `93c91fc` | Remove duplicate top bar greeting + Sync Now, fix button patterns |
| `18ef6e6` | Reskin Market Intel + Comp Sets to Koast |
| `3bf5311` | Reskin Reviews + Turnovers to Koast |
| `9ab5844` | Property Detail: 280px hero, new Pricing tab, back arrow |
| `dd2bb15` | Redesign Login + Signup (dark theme, AuthShell) |
| `546fbf9` | Redesign Messages (three-column inbox) |
| `3bc11f6` | Redesign Property Detail to Koast mockup |
| `65f11f7` | Redesign Properties grid to Koast mockup |
| `3139db4` / `2e681fa` | Calendar v2 redesign + quick fixes |
| `159a497` / `096e926` | Dashboard quick fixes + unused import cleanup |
| `ef29f8d` | Redesign Dashboard to Koast v3 mockup |
| `1132922` | Rebrand Moora/StayCommand shell to Koast |
| `e681a26` | Koast design system v2, product spec, project plan, mockups, platform icons |
| `d9223ca` | Pricing engine validation via `pricing_recommendations` table |
| `1572620` | Add DESIGN_SYSTEM.md + PLATFORM_ICONS.md, rename Moora→Koast in CLAUDE.md |
