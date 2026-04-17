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

- **Live URL:** https://staycommand.vercel.app (will move to app.koasthq.com)
- **Domain:** koasthq.com (registered, not yet configured)
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
Full details in `DESIGN_SYSTEM.md` (1,119 lines). Key rules:
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

**Airbnb OAuth:** currently disconnected from Channex. Reconnect when PMS is ready for production.

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
Items here have a clear design / spec but no shipped code (or only partial wiring).

1. **Pricing Apply wiring.** Apply buttons exist in Property Detail pricing tab but don't push to Channex yet. Wire them to `/api/channels/rates/[propertyId]` mirroring the calendar rate editor's request shape + optimistic UI.
2. **AI messaging pipeline.**
   - Auto-draft on incoming messages (reply staged, human-approve).
   - Auto-send for check-in/checkout reminders.
   - Operational routing: guest says "towels" → AI drafts reply + SMS task to cleaner. Uses Claude API + Twilio + existing `cleaning_tasks`.
3. **Channel health monitoring.** Automated 5-minute checks per connected channel. New `channel_health` table. Non-dismissible alert banners on disconnect. Worker mirrors `booking_sync.py` cadence.
4. **Revenue chart data.** Daily revenue aggregation query from `bookings` → feeds the canvas chart on dashboard. Replace current empty state.
5. **`pricing_rules` / `pricing_performance` tables.** Documented shape exists in prior drafts but no migration. Write migrations before UI expects them: `pricing_rules (id, property_id, base_rate, min_rate, max_rate, channel_markups JSONB, auto_apply BOOLEAN DEFAULT false)` and `pricing_performance (id, property_id, date, suggested_rate, actual_rate, booked BOOLEAN, revenue_delta)`.
6. **Auto-apply pricing.** Gated on ≥14 days of validation. Reads `pricing_rules.auto_apply` + `pricing_performance` outcomes to decide whether to push.
7. **Direct booking website builder (Frontdesk).** `/frontdesk` is a placeholder today.
8. **Owner portal / multi-user.** Shared property access, role-based permissions.

### ChannelPopover (STATUS: SHIPPED 2026-04-16)
Prior drafts listed this as "designed, not built." It is **live**. Component at `src/components/channels/ChannelPopover.tsx`, wired into `DashboardClient`, `PropertiesPage`, `PropertyDetail`, `PerChannelRateEditor`. Hover popover on desktop, triggers on property cards, rate-panel headers, and property-detail hero badges. Uses `@floating-ui/react` for positioning. Mobile bottom sheet **behavior** is handled without `vaul` today — if vaul is later desired, it would be a new dep. Future work may add richer management actions inside the popover.

---

## DESIGN PHILOSOPHY
1. Every interaction should feel premium enough that a host would record their screen and share it.
2. Platform logos are data surfaces, not decoration — they reveal connection health and channel stats on hover.
3. AI moments use dark deep-sea cards with ambient golden glow — they stand out from the light product chrome.
4. The pricing page shows recommendations hosts can act on, not signal dashboards they have to interpret.
5. No emojis, no pulsing dots, no chart libraries — Canvas-drawn charts, solid status indicators, professional tone.
6. Entrance choreography on every page — staggered reveals, count-up numbers, chart-draw animations.

---

## COMPETITIVE EDGES
1. 9-signal pricing engine (no competitor runs all nine).
2. Per-channel rate control with real-time Channex verification (sync-status green check / amber warning per channel per date).
3. AI review generation with approve/schedule flow.
4. Market intelligence with comp-set tracking (AirROI data pipeline).
5. Interactive platform logos (ChannelPopover — no competing PMS ships this).
6. Dark AI insight cards on dashboard — the "show me the money" moment.
7. Canvas-drawn revenue chart with animated draw — video-worthy on first load.

---

## Pending Items (priority order)

### This week
*(All three rebrand-debt items shipped 2026-04-17: VRBO dropped from PLATFORMS, SMS copy rebranded + de-emoji'd, `notifications` migration added.)*

### Phase 1 — Ship to first 5 hosts (2 weeks)
- Wire pricing Apply buttons to Channex rate push.
- Fix revenue chart data query (daily aggregation from `bookings`).
- Continue pricing validation (currently at 4 days, need 14).
- Commission Koast logo.
- Domain setup (koasthq.com → app.koasthq.com on Vercel).
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
