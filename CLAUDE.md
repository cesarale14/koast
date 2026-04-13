# Moora (StayCommand) — CLAUDE.md

## FIRST STEPS FOR EVERY SESSION
1. Read this file completely before any work
2. Run `cat ~/staycommand/repomix-output.xml | head -200` for project structure
3. If repomix is stale: `cd ~/staycommand && repomix`
4. Never run `npm run build` on VPS — use `npx tsc --noEmit` then `git push` (Vercel builds)

## Prompt Format
Every prompt to Claude Code must start with:
"Read ~/staycommand/CLAUDE.md and repomix-output.txt first."

## Planning Mode
- Use **/ultraplan** for multi-file architecture changes (5+ files, new subsystems, API+UI+DB changes)
- Skip ultraplan for small fixes (1-3 files, UI tweaks, single bug fixes)
- Examples that warrant /ultraplan: design system rollout, channel connection flows, direct booking website, owner portal
- Examples to skip: fix a logo, change a color, add a button, fix a single API endpoint

## Code Rules
- **Never use sub-agents** — write all code directly
- Always run `npx tsc --noEmit` before committing
- Always push to main after committing
- Return actual error messages in API responses — never return empty 500s
- Wrap all API handlers in try/catch
- Never run `npm run build` on VPS (times out, insufficient RAM)
- ESLint: unused variables cause Vercel build failures — always check before push

## Product Overview
Moora (formerly StayCommand) is a unified STR (short-term rental) operating system with AI-powered pricing, market intelligence, and channel management. It competes with Hospitable, Hostaway, and Guesty — with a 9-signal pricing engine and market intelligence layer that none of them have.

**Live URL:** https://staycommand.vercel.app
**GitHub:** cesarale14/staycommand

## Tech Stack
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Database:** Supabase PostgreSQL + Auth + Drizzle ORM
- **Deployment:** Vercel (auto-deploy from GitHub)
- **VPS:** Virginia 44.195.218.19 (background workers, Python)
- **Channel Manager:** Channex.io (CERTIFIED, production approved)
- **Market Data:** AirROI API
- **AI Messaging:** Claude API (Anthropic)
- **SMS:** Twilio
- **Events:** Ticketmaster API
- **Weather:** Weather.gov API (free, no key)
- **Font:** Plus Jakarta Sans (via @fontsource-variable)

## Canopy Design System (ACTIVE)
The app uses the "Canopy" design direction — deep forest green, warm brass, soft linen.

### Color Palette
| Token | Hex | Use |
|-------|-----|-----|
| Forest | #1a3a2a | Primary, sidebar bg, headings, stat values |
| Forest Light | #264d38 | Sidebar hover, secondary surfaces |
| Forest Muted | #3d6b52 | Icons, secondary text |
| Brass | #c9a96e | Accents, active states, sidebar active indicators |
| Brass Light | #d4bc8a | Light accent backgrounds |
| Linen | #f8f6f1 | Page background |
| Linen Dark | #efe9dd | Borders, card backgrounds, dividers |
| Danger | #c44040 | Error states, overbooking alerts |
| Warning | #b8860b | Cleaning assignments, urgency |
| Info | #2a5a8a | Informational badges |

### Typography
- Font: Plus Jakarta Sans Variable
- Stat numbers: -0.03em letter-spacing, 700 weight
- Section labels: 11px, 700 weight, +0.06em tracking, uppercase, brass color
- Page headings: 20px, 700 weight, forest color

### Sidebar
- Dark forest green (#1a3a2a) background
- Brass (#c9a96e) active indicator bar + text
- Muted linen-green (#a8c4b4) inactive text
- "M Moora" brass logo mark

### Borders & Shadows
- All borders: linen-toned (#efe9dd), never gray
- Shadows: warm forest-tinted rgba(26,58,42,...)
- Stat cards: forest green gradient top border via ::before

### CSS Variables
All colors are defined as CSS variables in `globals.css` (:root). Components reference them via `var(--forest)`, `var(--brass)`, `var(--linen)`, etc. Tailwind config maps these to utility classes (`bg-forest`, `text-brass`, `bg-linen`).

## Key Infrastructure
- VPS SSH: `C:\Users\cesar\Downloads\LightsailDefaultKey-us-east-1.pem`
- Supabase: US East, direct connection port 5432 (VPS), pooled port 6543 (Vercel)
- Workers: `~/staycommand-workers/` on VPS
- Logs: `/var/log/staycommand/`
- Workers status: `~/staycommand-workers/status.sh`

## Database (28 tables)
properties, listings, bookings, calendar_rates, market_comps, market_snapshots, messages, cleaning_tasks, review_rules, guest_reviews, pricing_outcomes, local_events, ical_feeds, leads, revenue_checks, property_details, message_templates, cleaners, sms_log, user_preferences, property_channels, channex_room_types, channex_rate_plans, notifications, weather_cache, channex_webhook_log, user_subscriptions, concurrency_locks

## Channex Integration (PRODUCTION)
- Current state: FRESH START — 0 properties in StayCommand, 4 properties in Channex (can't be deleted while mapped to Airbnb channel)
- Airbnb channel ID: fa3398a3-e7a4-4ff6-b770-1663d8affd45 (active, OAuth connected, 4 listings mapped)
- Channex properties exist but StayCommand DB is clean — re-import will reconnect them
- Webhook: POST /api/webhooks/channex (booking events)
- Revision polling: booking_sync.py every 15 min via systemd
- Booking sync: bidirectional (webhook instant + revision poll safety net)
- Availability: StayCommand controls availability. On import, pushes avail=1 for 365 days then blocks booked dates
- API: app.channex.io/api/v1 (PRODUCTION — whitelabel access active)
- IMPORTANT: Never push rates via CRS booking API — it overwrites restriction rates. Only push availability (0/1) on booking create/edit/cancel.
- IMPORTANT: Moora pushes rates to ALL connected channels including Airbnb via Channex rate plans. The calendar's per-channel rate editor can target Airbnb, Booking.com, and Vrbo independently; saving pushes to the channel's dedicated Channex rate plan.
- IMPORTANT: To block specific dates on BDC, use availability=0 (BookingLimit=0) at the room type level — NOT stop_sell=true, which BDC interprets as closing the entire room/property. Ensure rates are pushed for the full bookable window (today through 18+ months out) — any date with $0 rate triggers "missing prices" warnings in the BDC extranet.
- IMPORTANT: BDC child/slave rates reject all pushes with RATE_IS_A_SLAVE_RATE. Always identify and target the parent rate code (brute-force candidates around the rate code Channex first reports if needed). Use `POST /channels/{id}/activate` to activate BDC channels — `PUT is_active: true` does not work.
- IMPORTANT: Channex property and rate plan IDs for new channels come from `GET /rate_plans?filter[property_id]=X` intersected with the channel's `rate_plans` array. Multi-property channels (single Airbnb account covering many listings) expose every linked property's rate plans, so filtering by the property-owned ID set is required to avoid picking the wrong rate plan.

### Booking.com Self-Service Connection
- Flow: User enters Hotel ID → API creates Channex BDC channel → tests connection → if Booking.com hasn't authorized Channex, shows instructions (admin.booking.com → Account → Connectivity Provider → search "Channex") → retry → on success, pushes availability + activates
- API routes: `/api/channels/connect-booking-com` (create), `/api/channels/connect-booking-com/test` (test auth), `/api/channels/connect-booking-com/activate` (push avail + activate)
- UI: `BookingComConnect.tsx` modal with form → progress → authorization → success states
- Channex client methods: `createChannel`, `updateChannel`, `testChannelConnection`, `deleteProperty`, `getRestrictionsBucketed`
- Channel creation is atomic: a compensating-rollback try/catch tracks every Channex resource created (scaffold property, rate plan, channel) and deletes them on later failure so orphaned entities don't accumulate.
- Per-property mutex via `concurrency_locks` table prevents two simultaneous connect requests from racing.
- Connect flow creates a DEDICATED BDC rate plan — it never reuses an existing one, which prevents rate bleed between Airbnb and Booking.com.
- Name matching (Moora ↔ Channex) uses strict normalized equality (strips " - X" / " in X" / Airbnb rating noise). Ambiguous matches surface as candidates instead of auto-picking.

## Reliability Infrastructure
- **Webhook idempotency**: Every incoming Channex webhook is dedup'd via `channex_webhook_log.revision_id`. Duplicate deliveries (Channex network retries) are acked and skipped without re-processing — no more duplicate bookings or double availability pushes.
- **Free-tier enforcement**: `enforce_property_quota` DB trigger (`supabase/migrations/20260413010000_free_tier_property_quota.sql`) blocks at-limit property inserts atomically. Client-side count check remains for fast UX but the trigger is authoritative. Per-tier limits: free=1, pro=15, business=unlimited. Tiers live in `user_subscriptions` (default free for new rows).
- **BDC connect mutex**: 60-second advisory locks in `concurrency_locks` table keyed `bdc_connect:{propertyId}`. Concurrent requests return 409 `connect_in_progress`. Released on both success and failure paths.
- **Atomic BDC channel creation**: Compensating rollback on failure deletes scaffold properties, rate plans, and channels that were created before the error. The orphan-scaffold problem that gave us Pool House's misrouted BDC channel is prevented at source.
- **Rate push partial failure handling**: `/api/pricing/push` wraps each 200-entry batch in try/catch, collects per-batch failures with date ranges, and returns HTTP 207 Multi-Status with `partial_failure: true` instead of silently claiming success after batch N fails.
- **Scaffold cleanup on import**: When a Channex import matches a Moora property that was previously linked to a scaffold Channex property, the import retargets all `channex_room_types` / `channex_rate_plans` / `property_channels` rows to the real property AND deletes the orphaned scaffold via `channex.deleteProperty`.
- **iCal preview mode**: `POST /api/ical/add` with `property_id: "preview"` runs the parse/validate flow without writing to the DB and without ownership checks — used by the properties-new Test button. 15-second AbortController timeout prevents hung feeds.
- **iCal ghost booking cleanup**: Sync cancels bookings whose UID disappears from the feed regardless of whether they were originally iCal-sourced or Channex-sourced. For Channex-linked rows, it also unblocks the affected `calendar_rates` dates so cross-channel availability stays accurate.

## 9-Signal Pricing Engine
Weights (sum = 1.0):
- Demand: 0.20 (AirROI market occupancy)
- Seasonality: 0.15 (learnable from pricing_outcomes after 30+ days)
- Competitor: 0.20 (comp set percentile)
- Events: 0.12 (Ticketmaster local events, stacked, capped +40)
- Gap Night: 0.08 (orphan 1-2 night detection)
- Booking Pace: 0.08 (smart baseline from historical data)
- Weather: 0.05 (Weather.gov 14-day forecast, cached in weather_cache)
- Supply Pressure: 0.05 (month-over-month listing count change)
- Lead Time: 0.07 (rate position vs market at days-until-check-in)

## Sidebar Structure
```
(no label): Dashboard, Calendar, Messages
MANAGE: Properties, Pricing, Reviews, Cleaning
INSIGHTS: Market Intel, Nearby Listings, Comp Sets
Bottom: Settings, User avatar (Cesar)
```

## Key Pages & Features
- **Dashboard:** Visual command center with property status cards (photos + live status), smart actions, events bar, portfolio performance, activity feed
- **Calendar:** Airbnb-style monthly grid (ONLY monthly view — timeline removed), 24-month continuous scroll, booking bars with platform logos, check-in/checkout overlap, Airbnb-style partial-cell offsets, conflict detection with red stripes, full-width layout with property sidebar (left) and rate/availability settings panel (right). Per-channel rate editor in the right panel shows LIVE rates fetched from Channex per connected channel with sync status indicators (in-sync green check / out-of-sync amber warning), supports per-channel rate overrides stored in `calendar_rates.channel_code`, and includes markup % helpers that auto-derive from the engine base rate.
- **Pricing:** 9-signal engine, heatmap, signal breakdown, push to OTAs
- **Market Explorer:** Analytics + interactive Leaflet map (properties, comps, events)
- **Nearby Listings:** AirDNA-style browse with real Airbnb photos from AirROI
- **Comp Sets:** Manage competitive set with sortable table + map
- **Inbox:** AI messaging with Claude-powered drafts
- **Reviews:** AI-generated reviews with SEO keywords, scheduling
- **Turnover:** Kanban board, Twilio SMS to cleaners, cleaner management
- **Revenue Check:** Public lead gen tool at /revenue-check
- **Frontdesk:** Direct booking website builder (placeholder, coming soon)
- **Channex Certification:** /channex-certification (14 test runner)

## Calendar Architecture
- `CalendarGrid.tsx` — Main container, monthly-only (timeline removed), manages state
- `MonthlyView.tsx` — 24-month scrolling grid with sticky month headers
- `BookingBar.tsx` — Airbnb-style partial-cell bars (check-in at 50%, checkout at 40%)
- `CalendarToolbar.tsx` — Thin header bar with title + Today button
- `DateCell.tsx` — Individual cell with rate display
- `BookingSidePanel.tsx` — Booking details slide-out
- Right settings panel: always-visible price/availability settings, date-specific editing on click
- Booking bars use floatStart/floatEnd fractional cell coordinates for Airbnb-style check-in/checkout offsets
- Turnover detection: follower/predecessor sets drive 10% overlap seam on same-day handoffs
- Conflict detection: separate from visual overlap — real overbookings get red diagonal stripes

## Property Photos
- User properties: auto-pulled from Airbnb via OG image tag (listing ID from iCal URL)
- Comp properties: cover_photo_url from AirROI API (stored in market_comps.photo_url)
- Refresh needed after adding properties: POST /api/market/refresh/{propertyId}

## VPS Workers (~/staycommand-workers/)
- booking_sync.py: iCal sync + Channex revision polling (every 15 min)
- pricing_worker.py: Rate calculation + market data refresh
- market_sync.py: AirROI market data collection
- All use direct PostgreSQL (psycopg2), not HTTP API routes
- Systemd services with timers

## Development Workflow
1. Make changes in ~/staycommand
2. Type check: `npx tsc --noEmit 2>&1 | head -20`
3. If clean: `git add -A && git commit -m "message" && git push`
4. Vercel auto-builds with 8GB RAM (~30 seconds)
5. NEVER run `npm run build` on VPS (times out, insufficient RAM)

## Common Gotchas
- Drizzle ORM returns camelCase, client expects snake_case — normalize in API routes
- calendar_rates.rate vs suggested_rate vs applied_rate — suggested is engine output
- Channex availability for vacation rentals: 1 = available, 0 = booked (not 10/9/8)
- Full sync should run AFTER certification tests to reset realistic rates
- iCal feeds: Airbnb has listing ID in URL, Booking.com uses opaque UUID (can't get photos)
- ESLint: unused variables cause Vercel build failures — always check before push
- Auth middleware: /revenue-check and /clean are public routes (no auth required)
- Calendar: GAP constant in MonthlyView.tsx must match --col CSS variable formula: `calc((100% + GAP) / 7)`
- Calendar bars: width = `calc(var(--col) * span - GAP)` to prevent overflow
- Booking.com connection requires hotel owner to authorize Channex at admin.booking.com → Account → Connectivity Provider

## Current Priorities
1. Get 5 real hosts on free tier
2. Share Revenue Check in STR Facebook groups
3. Build Frontdesk (direct booking engine)
4. Connect Villa Jamaica to production Channex + real OTAs
5. Polish UI based on user feedback
6. Build intelligent map with layers

## Future
- Direct booking website builder
- Owner portal / multi-user access
- Channex rate pushing from pricing engine (Pro tier feature)
- Revenue Check landing page for lead gen
- DESIGN_SYSTEM.md skill file for Claude Code
- VRBO self-service connection (same pattern as Booking.com)

## Properties in Database
- Pool House - Tampa: live on Airbnb (listing 1610418232676616622, rate plan c0f71fee) + Booking.com (hotel 12213286, rate plan 40c81f09, channel 80940967). Parent BDC rate code: 45645116.
- Villa Jamaica: live on Airbnb (listing 1240054136658113220, rate plan 3070d2ad) + Booking.com (hotel 12783847, rate plan 7439f86d, channel 4c7852e8). Parent BDC rate code: 48257326. VRBO channel exists but inactive.
- Cozy Loft - Tampa, Modern House - Tampa, Stadium Loft - Tampa: manually created, no Channex link yet.

## External API Keys (in .env.local + Vercel)
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
DATABASE_URL, DATABASE_URL_POOLED, CHANNEX_API_KEY, AIRROI_API_KEY,
ANTHROPIC_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER,
TICKETMASTER_API_KEY

## Acquisition Strategy
Target: 400+ active users, $500K ARR → $3-4M acquisition at 6-8x ARR
Pricing: Free ($0, 1 property), Pro ($79, 15 properties), Business ($149, unlimited)
Key differentiator: 9-signal pricing + market intelligence + operations in one platform

## Strategic Decision Framework

### Prime Directive
Every feature, architecture choice, and UX decision must be evaluated against one question: "Does this move Moora closer to being the best PMS on the market?"

### Decision Criteria (in priority order)
1. Host Time Savings — Will this reduce manual work for hosts? Quantify minutes saved per week if possible.
2. Revenue Impact — Does this directly help hosts earn more? (pricing optimization, occupancy lift, direct bookings, reduced OTA fees)
3. Competitive Moat — Does this create something Hospitable, Hostaway, or Guesty can't easily replicate? (9-signal engine, market intelligence, AI-powered operations)
4. Scalability — Will this work for 1 property AND 50 properties without redesign?
5. User Delight — Is the UX so good hosts would screenshot it and share in STR Facebook groups?
6. Data Flywheel — Does this generate data that makes Moora smarter over time? (pricing outcomes, booking patterns, market trends)

### Build Philosophy
- Ship features that are 90% polished, not 60% shipped fast
- Every screen should look like it belongs in a $50M SaaS product
- If a feature doesn't clearly serve the Prime Directive, defer it
- Prefer deep integration over surface-level features (e.g., don't just show data — act on it automatically)
- Always consider: "What would make a host switch FROM their current PMS TO Moora?"

### Channex Production
- Production API: app.channex.io/api/v1 (NOT staging)
- Whitelabel access: ACTIVE
- All new Channex integration work should target production endpoints
- Villa Jamaica should be migrated from staging to production
