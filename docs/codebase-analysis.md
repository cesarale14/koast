# StayCommand Codebase Analysis

**Date:** 2026-04-08
**Context:** Post-Channex production migration, live Airbnb connection, pre-launch assessment

---

## 1. Architecture Audit

### 1.1 API Routes (53 total)

| Category | Count | Notes |
|----------|-------|-------|
| Pricing | 7 | calculate, approve, push, preview, outcomes, sync-channex, override |
| Channex | 7 | full-sync, certification (3), webhook-logs, sync, setup-webhook |
| Channels | 4 | list, refresh, token, sync-log |
| Reviews | 6 | pending, approve, generate, analytics, respond, rules |
| Bookings | 3 | create, cancel, edit |
| iCal | 4 | add, status, delete, sync |
| Market | 3 | comps, refresh, snapshot |
| Dashboard | 3 | actions, stats, command-center |
| Analytics | 2 | forecast, scenarios |
| Turnover | 2 | assign, auto-create |
| Messages | 2 | draft, send |
| Settings | 2 | delete-account, preferences |
| Other | 8 | photos, cleaners, properties, onboarding, revenue-check, frontdesk, debug |

**Redundancy issues:**
- `/api/channex/sync` and `/api/channels/[propertyId]/refresh` overlap — both pull data from Channex
- `/api/channex/webhook-logs` and `/api/channels/sync-log` both query `channex_webhook_log`
- `/api/pricing/sync-channex` and `/api/pricing/push` both push rates to Channex
- 3 certification routes (`certification`, `certification/booking-test`, `certification-runner`) are dev-only tools that should be gated

**Unused/redundant:**
- `/api/channex/setup-webhook` — one-time use, webhook already configured
- `/api/debug/channex-iframe` — debug tool, should be removed before production
- `/api/properties/geocode-all` — batch tool, rarely used

### 1.2 Pages (28 total)

| Page | Status | Notes |
|------|--------|-------|
| Dashboard `/` | Ship-ready | Smart actions, property cards, activity feed |
| Calendar `/calendar` | Ship-ready | 24-month continuous scroll, booking bars |
| Inbox `/messages` | Needs polish | Claude AI drafts work, no real messaging integration |
| Properties `/properties` | Ship-ready | List, detail, settings, booking CRUD |
| Property Detail `/properties/[id]` | Ship-ready | Calendar, bookings, settings tabs |
| New Property `/properties/new` | Ship-ready | Multi-step creation wizard |
| Import Properties `/properties/import` | Needs polish | Imports from Channex |
| Pricing `/pricing` | Ship-ready | 9-signal engine, heatmap, approve/push |
| Channels `/channels` | Ship-ready | OTA cards, room types, connection status |
| Connect Channel `/channels/connect` | Ship-ready | 4-step wizard with Channex iframe |
| Sync Log `/channels/sync-log` | Ship-ready | Timeline feed with filters |
| Reviews `/reviews` | Needs polish | AI generation works, scheduling partial |
| Turnover `/turnover` | Needs polish | Kanban board, SMS works, no auto-create from webhooks |
| Market Explorer `/market-explorer` | Ship-ready | Analytics, Leaflet map, comps, demand forecast |
| Nearby Listings `/nearby-listings` | Ship-ready | AirROI data with photos |
| Comp Sets `/comp-sets` | Ship-ready | Sortable table + map |
| Revenue Check `/revenue-check` | Ship-ready | Public lead gen tool |
| Frontdesk `/frontdesk` | Placeholder | Coming soon page with waitlist |
| Settings `/settings` | Needs polish | Preferences, account deletion |
| Onboarding `/onboarding` | Partially built | Steps exist but flow not enforced |
| Certification `/certification` | Dev tool | Should be hidden from production |
| Channex Certification `/channex-certification` | Dev tool | Should be hidden from production |
| Analytics `/analytics` | Redirect | Redirects to /market-explorer |
| Bookings `/bookings` | Redirect | Redirects to /properties |
| Login `/login` | Basic | Supabase auth, functional |
| Signup `/signup` | Basic | Supabase auth, functional |
| Cleaner View `/clean/[taskId]/[token]` | Ship-ready | Public mobile view with checklist |

### 1.3 Database Tables (26 total)

| Table | Rows | RLS | Policies | Status |
|-------|------|-----|----------|--------|
| properties | 5 | On | 4 | Active |
| bookings | 186 | On | 4 | Active |
| calendar_rates | 873 | On | 4 | Active |
| market_comps | 45 | On | 4 | Active |
| market_snapshots | 5 | On | 4 | Active |
| cleaning_tasks | 76 | On | 4 | Active |
| listings | 4 | On | 4 | Active |
| message_templates | 16 | On | 1 | Active |
| guest_reviews | 4 | On | 1 | Active |
| property_details | 2 | On | 1 | Active |
| cleaners | 1 | On | 1 | Active |
| messages | 0 | On | 4 | Dormant |
| pricing_outcomes | 63 | On | **0** | Active but RLS-blocked |
| local_events | 200 | On | **0** | Active but RLS-blocked |
| property_channels | 1 | On | **0** | Active but RLS-blocked |
| channex_room_types | 2 | On | **0** | Active but RLS-blocked |
| channex_rate_plans | 5 | On | **0** | Active but RLS-blocked |
| channex_webhook_log | 8 | On | **0** | Active but RLS-blocked |
| channex_sync_state | 1 | On | **0** | Singleton |
| ical_feeds | 4 | On | **0** | Active but RLS-blocked |
| leads | 0 | On | **0** | Dormant |
| revenue_checks | 1 | On | **0** | Dormant |
| weather_cache | 0 | On | **0** | Dormant |
| review_rules | 0 | On | 0 | Empty |
| user_preferences | 0 | On | 0 | Empty |
| notifications | ? | On | ? | Unchecked |

**11 tables have RLS enabled with zero policies** — they return empty results through the auth client. Currently worked around by using `createServiceClient()` (service role), but this bypasses all row-level security.

### 1.4 VPS Workers

| Worker | Schedule | Status | Issue |
|--------|----------|--------|-------|
| booking_sync.py | Every 15 min | **Failing** | 401 Unauthorized on Channex API |
| pricing_worker.py | Every 6 hours | **Failing** | 401 Unauthorized on Vercel API |
| market_sync.py | Daily 2 AM | **Failing** | 401 Unauthorized on Vercel API |

**All 3 workers are running on schedule but failing every execution.** The booking_sync worker was updated with the production Channex key but workers hit 401 because:
- booking_sync: Channex production API may require different auth format
- pricing_worker/market_sync: Call Vercel HTTPS endpoints which require session auth (no service API key)

### 1.5 Remaining Staging References

None in application code. One reference in `docs/channel-manager-plan.md` (TODO item, non-functional).

---

## 2. Data Flow Analysis

### 2.1 Booking Ingestion (4 paths)

```
                    ┌──────────────┐
                    │   Airbnb     │
                    │   VRBO       │
                    │   BDC        │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Webhook  │ │ Revision │ │  iCal    │
        │ (instant)│ │ Poll(15m)│ │ Poll(15m)│
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │             │             │
             ▼             ▼             ▼
        ┌─────────────────────────────────────┐
        │          bookings table             │
        │  (channex_booking_id OR            │
        │   platform_booking_id)              │
        └─────────────────────────────────────┘
              ▲
              │
        ┌─────────┐
        │ Manual  │
        │ Create  │
        └─────────┘
```

**Critical issue: iCal + Webhook duplicate bookings.** When a guest books via Airbnb, the booking arrives through both webhook (with `channex_booking_id`) and iCal sync (with `platform_booking_id`). These are stored as separate rows with no deduplication. Same stay exists twice in the database.

### 2.2 Rate Flow

```
  Pricing Engine (9 signals)
         │
         ▼
  calendar_rates.suggested_rate
         │
    [User Approves]
         │
         ▼
  calendar_rates.applied_rate
         │
    [Push to OTAs]
         │
         ▼
  Channex restrictions API → Airbnb/BDC/VRBO
```

### 2.3 Availability Flow

StayCommand controls availability. On every booking create/modify/cancel, the webhook handler pushes `availability: 0` (booked) or `availability: 1` (available) to Channex for all room types.

**Gap:** iCal-synced blocked dates only set `calendar_rates.is_available=false` locally — they don't push to Channex. This means dates blocked in an iCal feed won't block on connected OTAs.

### 2.4 Pricing Outcomes (Broken)

The `pricing_outcomes` table has 63 rows populated by the booking_sync.py worker. However, the worker is currently failing (401). When working, it records: was_booked, actual_revenue, days_before_checkin — which the pricing engine's seasonality signal reads to improve over time. **With the worker down, the learning loop is broken.**

---

## 3. Feature Completeness Assessment

| Feature | Rating | Notes |
|---------|--------|-------|
| Dashboard | Ship-ready | Property cards, smart actions, events bar |
| Calendar | Ship-ready | Continuous scroll, booking bars, platform logos |
| Inbox | Needs polish | AI drafts work, but no real messaging backend (Channex messages API not integrated) |
| Properties | Ship-ready | Full CRUD, iCal/Channex connection, settings |
| Pricing | Ship-ready | 9-signal engine, heatmap, approval workflow, push to OTAs |
| Channels | Ship-ready | Overview, connect wizard, sync log — all working with production Channex |
| Reviews | Needs polish | AI generation good, but scheduling/publishing not connected to actual platforms |
| Turnover | Needs polish | Kanban works, SMS works, but auto-task creation only from iCal (not webhooks) |
| Market Explorer | Ship-ready | Analytics, Leaflet map, demand forecast, revenue scenarios |
| Nearby Listings | Ship-ready | AirROI photos, ADR, occupancy |
| Comp Sets | Ship-ready | Table + map |
| Revenue Check | Ship-ready | Public lead gen tool, works independently |
| Frontdesk | Placeholder | Coming soon page only |
| Settings | Needs polish | Basic preferences, account deletion |
| Onboarding | Partially built | Steps exist but not enforced for new users |
| Cleaner Mobile | Ship-ready | Token-based access, checklist, photo upload |

---

## 4. Strategic Gap Analysis

### Top 5 Things a Host Would Notice Are Missing

1. **No automatic rate pushing** — Host must manually approve + push rates. Hospitable/Hostaway have auto-mode where approved suggestions push automatically on schedule.

2. **No unified booking calendar with OTA logos** — The calendar works but doesn't clearly show which OTA each booking came from with visual distinction. Hostaway and Guesty show OTA icons on each booking bar.

3. **No guest messaging integration** — Inbox has AI drafts but can't actually send/receive messages through Airbnb/VRBO messaging APIs. Hospitable's entire value prop is automated guest messaging.

4. **No financial reporting** — No revenue dashboard, no payout tracking, no expense management. Guesty has comprehensive financial reporting. StayCommand shows market data but not actual P&L.

5. **No mobile app** — Every competitor has a mobile app. The cleaner mobile view exists but hosts can't manage from their phone.

### Features Not Serving the Prime Directive

- **Certification pages** — Dev tools visible in sidebar. Should be hidden or removed.
- **Revenue Check as a standalone page** — Good for lead gen but not core PMS functionality. It's positioned correctly as a growth tool.
- **Nearby Listings** — Useful for market research but not daily workflow. Could be folded into Market Explorer.

### Over-Engineering vs Under-Engineering

**Over-engineered:**
- 9-signal pricing engine is sophisticated but with only 1 real property, the learning loops can't generate meaningful data yet
- 3 booking ingestion paths (webhook + polling + iCal) when one property only needs webhook + iCal
- Revenue scenarios with 5 what-if analyses when hosts just want a simple "raise/lower" recommendation

**Under-engineered:**
- No booking deduplication between iCal and Channex
- No auto-push for pricing (manual approval required)
- No rate parity monitoring across channels
- Workers failing silently with no alerting
- 11 tables with broken RLS

### Fastest Path to 5 Real Hosts

1. Fix the "aha moment": host adds property → iCal or Channex → sees pricing suggestions → pushes to Airbnb. This flow works today but requires too many manual steps.
2. Simplify onboarding: auto-detect Airbnb listing from iCal URL, auto-geocode, auto-fetch market data, auto-run pricing engine.
3. Revenue Check → signup funnel: host enters address → sees revenue opportunity → signs up → connects Airbnb. This funnel exists but isn't optimized.
4. Fix workers so pricing runs automatically and market data stays fresh.

---

## 5. Technical Debt

### Security (P0)

| Issue | Severity | Location |
|-------|----------|----------|
| 11 tables with RLS enabled but 0 policies | High | property_channels, channex_*, pricing_outcomes, local_events, ical_feeds, leads, revenue_checks, weather_cache |
| Debug route exposed | Low | /api/debug/channex-iframe — leaks API key prefix |
| Channex OAuth tokens visible in API responses | Medium | /api/channels/[propertyId] returns settings which may include tokens |
| No rate limiting on authenticated API routes | Medium | All 47 auth routes have no throttling |

### Performance

| Issue | Impact | Location |
|-------|--------|----------|
| `getEventsForDate()` called per-date in pricing loop | 90 calls per engine run | engine.ts:199 |
| No database connection pooling in workers | New connection per query | staycommand-workers/db.py |
| PropertyDetail.tsx is 1,133 lines | Slow re-renders | Single monolithic component |
| AnalyticsDashboard.tsx is 965 lines | Same issue | Contains business logic + UI |

### Code Quality

| Issue | Count | Notes |
|-------|-------|-------|
| `eslint-disable @typescript-eslint/no-explicit-any` | 100+ | Pervasive across codebase |
| Duplicated `channexNameToCode()` function | 2 | In both channel API routes |
| Duplicated `timeAgo()` function | 3+ | In ChannelsOverview, AnalyticsDashboard, SyncLogDashboard |
| Duplicated platform label/color maps | 3+ | In PropertyDetail, PricingDashboard, ChannelsOverview |
| `DOW_ADJUSTMENTS` / `MONTH_ADJUSTMENTS` duplicated | 2 | signals/seasonality.ts + forecast.ts |
| No TypeScript strict mode | 1 | tsconfig could be stricter |

---

## 6. Recommended Action Plan

### P0: Fix Now (Bugs, Security, Broken Features)

- [ ] **Fix VPS workers** — All 3 failing with 401. booking_sync needs verified Channex prod key. pricing_worker and market_sync need a service-to-service auth mechanism (not Vercel session auth). Without these, pricing doesn't auto-run and market data goes stale.
- [ ] **Add RLS policies for 11 tables** — Or explicitly decide which should be public. Currently all reads through auth client return empty.
- [ ] **Fix iCal/Channex booking deduplication** — Same booking exists twice. Need overlap detection: if booking with matching property_id + check_in + check_out + platform exists, skip insert.
- [ ] **Remove debug route** before inviting real hosts — `/api/debug/channex-iframe` leaks API key prefix.
- [ ] **Hide dev tools** — Certification pages should not appear in production sidebar.

### P1: Fix Before Inviting Real Hosts

- [ ] **Auto-push pricing on approval** — When host approves rates, automatically push to all connected channels (don't require separate "Push to OTAs" click).
- [ ] **Fix onboarding flow** — New users should be guided: add property → connect Airbnb → see market data → see pricing suggestions. Currently all features are accessible but flow isn't guided.
- [ ] **Cleaning tasks from all booking sources** — Currently only iCal sync creates cleaning tasks. Webhook bookings and manual bookings should also auto-create turnover tasks.
- [ ] **Extract duplicated helpers** — `channexNameToCode`, `timeAgo`, platform labels/colors → shared utils.
- [ ] **Add proper error states** — Several pages silently return empty data when APIs fail.

### P2: Build Next (Highest-Impact for Host Acquisition)

- [ ] **Auto-pricing mode** — "Set and forget" option where engine runs on schedule and pushes approved rates. This is what hosts actually want — they don't want to manually approve every date.
- [ ] **Rate parity monitoring** — Show hosts when their rates differ across Airbnb/BDC/VRBO. This is a differentiator no pricing tool does well.
- [ ] **Revenue dashboard** — Simple monthly P&L: revenue by channel, occupancy rate, ADR trend. Pull from existing booking data. Hosts love seeing their numbers.
- [ ] **Guest messaging via Channex** — Channex has a Messages API. Connect it to the Inbox for real send/receive with Airbnb/BDC guests. This is Hospitable's entire moat.
- [ ] **Mobile-responsive improvements** — Not a full app, but make the dashboard usable on mobile Safari. Hosts check their phone constantly.

### P3: Nice to Have (After First 5 Hosts)

- [ ] **Frontdesk (direct booking engine)** — Big feature, needs its own timeline.
- [ ] **Multi-property portfolio view** — Dashboard aggregated across all properties.
- [ ] **Team management** — Multiple users per account with roles.
- [ ] **Native channel mapping UI** — Replace Channex iframe with fully native room/rate mapping.
- [ ] **Competitor price alerts** — Notify when a comp changes their rate significantly.
- [ ] **iCal availability push to Channex** — Currently iCal blocked dates don't sync to Channex.

---

## Summary Stats

| Metric | Count |
|--------|-------|
| API Routes | 53 |
| Pages | 28 |
| Dashboard Components | 15 (7,127 lines) |
| Database Tables | 26 |
| Active DB Rows | ~1,500 |
| VPS Workers | 3 (all failing) |
| Pricing Signals | 9 |
| Connected OTAs | 1 (Airbnb, production) |
| Properties | 5 (1 with Channex) |
| Bookings | 186 |
| Lines of Code (components) | ~7,100 |
| Tables Missing RLS Policies | 11 |
| Duplicated Utility Functions | 5+ |
