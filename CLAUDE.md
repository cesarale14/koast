# StayCommand — CLAUDE.md

## FIRST STEPS FOR EVERY SESSION
1. Read this file completely before any work
2. Run `cat ~/staycommand/repomix-output.txt | head -200` for project structure
3. If repomix is stale: `cd ~/staycommand && repomix`
4. Never run `npm run build` on VPS — use `npx tsc --noEmit` then `git push` (Vercel builds)

## Product Overview
StayCommand is a unified STR (short-term rental) operating system with AI-powered pricing, market intelligence, and channel management. It competes with Hospitable, Hostaway, and Guesty — with a 9-signal pricing engine and market intelligence layer that none of them have.

**Live URL:** https://staycommand.vercel.app
**GitHub:** cesarale14/staycommand
**Logo:** Beacon mark (upward chevron + signal pulse) in emerald

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

## Key Infrastructure
- VPS SSH: `C:\Users\cesar\Downloads\LightsailDefaultKey-us-east-1.pem`
- Supabase: US East, direct connection port 5432 (VPS), pooled port 6543 (Vercel)
- Workers: `~/staycommand-workers/` on VPS
- Logs: `/var/log/staycommand/`
- Workers status: `~/staycommand-workers/status.sh`

## Database (20+ tables)
properties, listings, bookings, calendar_rates, market_comps, market_snapshots, messages, cleaning_tasks, review_rules, guest_reviews, pricing_outcomes, local_events, ical_feeds, leads, revenue_checks, property_details, message_templates, cleaners, sms_log, weather_cache, channex_webhook_log, channex_sync_state, user_preferences

## Channex Integration (PRODUCTION CERTIFIED)
- Villa Jamaica Channex ID: cf4a8bc4-956a-4c89-a40a-14c2e56ebd96
- Room Types: Entire Home - Standard + Entire Home - Premium
- 4 Rate Plans: BAR + B&B per room type
- Webhook: POST /api/webhooks/channex (booking events)
- Revision polling: booking_sync.py every 15 min via systemd
- Booking sync: bidirectional (webhook instant + revision poll safety net)
- Availability: StayCommand controls modify/cancel availability (Channex auto-adjust disabled)
- Certification: All 14 tests passing, /channex-certification page
- API: staging.channex.io/api/v1 (switch to app.channex.io for production)
- IMPORTANT: Never push rates via CRS booking API — it overwrites restriction rates. Only push availability (0/1) on booking create/edit/cancel.

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
(no label): Dashboard, Calendar, Inbox
MANAGE: Properties, Pricing, Reviews, Turnover
GROW: Frontdesk (coming soon), Market Explorer, Nearby Listings, Comp Sets, Revenue Check ↗
Bottom: Settings, User avatar
```

## Key Pages & Features
- **Dashboard:** Visual command center with property status cards (photos + live status), smart actions, events bar, portfolio performance, activity feed
- **Calendar:** Airbnb-style monthly grid, 24-month continuous scroll, booking bars with platform logos, 3D shadows, checkout/checkin overlap, event dots, demand coloring, gap highlights
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

## Design System
- Brand color: Emerald (#10b981 scale)
- Font: Nunito Variable (rounded, Airbnb-like)
- Sidebar: 60px collapsed (icon-only with tooltips), 240px expanded
- Cards: rounded-xl, 24px padding, shadow-only (no border)
- Content max-width: 1200px centered
- Logo: Beacon mark (src/components/ui/Logo.tsx)

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

## Current Priorities
1. Get 5 real hosts on free tier
2. Share Revenue Check in STR Facebook groups
3. Build Frontdesk (direct booking engine)
4. Connect Villa Jamaica to production Channex + real OTAs
5. Polish UI based on user feedback
6. Build intelligent map with layers

## Properties in Database
- Villa Jamaica: 4BR/2BA, Tampa, Airbnb listing 1240054136658113220, Channex connected
- 123casa: Tampa property with iCal
- test vacation rental: Test property with iCal

## External API Keys (in .env.local + Vercel)
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
DATABASE_URL, DATABASE_URL_POOLED, CHANNEX_API_KEY, AIRROI_API_KEY,
ANTHROPIC_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER,
TICKETMASTER_API_KEY

## Acquisition Strategy
Target: 400+ active users, $500K ARR → $3-4M acquisition at 6-8x ARR
Pricing: Free ($0, 1 property), Pro ($79, 15 properties), Business ($149, unlimited)
Key differentiator: 9-signal pricing + market intelligence + operations in one platform
