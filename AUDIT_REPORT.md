# Moora / StayCommand — Onboarding & Channel Flow Audit

**Date**: 2026-04-13
**Scope**: New user signup, property creation (manual / iCal / Channex import), channel connection, post-connection sync
**Codebase**: Next.js 14 App Router, Supabase + Drizzle, Channex.io

---

## FLOW 1 — New User Signup & First Dashboard Load

### Code Path
1. `src/app/(auth)/signup/page.tsx` → Supabase `auth.signUp()`
2. `src/middleware.ts` → `src/lib/supabase/middleware.ts` (auth refresh on every request)
3. Post-login redirect: `src/app/(auth)/login/page.tsx` line 29 → `/`
4. Dashboard: `src/app/(dashboard)/page.tsx` → wraps `<DashboardClient />`
5. `POST /api/dashboard/command-center` fetched client-side in useEffect
6. Empty state: if `!data`, `router.push('/properties')` (DashboardClient line 142)

### Happy Path
- Signup: email + password (min 8 chars)
- Supabase creates user, sends confirmation email
- User logs in, session cookie set by middleware
- Dashboard loads, command-center returns `{ empty: true }` when 0 properties
- Browser navigates to `/properties` automatically

### Failure Modes
- **P1 — Silent auth failure in middleware**: `supabase.auth.getUser()` can return null silently if env vars corrupt; user sees login page indefinitely
- **P1 — Signup form not cleared after success**: User sees "Check your email" but form stays filled; confusing
- **P2 — Dashboard redirect race**: `loading && !data` check can flip mid-render during navigation, causing flash
- **P1 — No explicit "next steps" CTA for brand-new users**: Dashboard redirects to `/properties` silently; if that page is broken, user stranded

### Hardcoded / Cesar-specific
- Free tier limit = 1 property hardcoded in `properties/new/page.tsx` line 126

---

## FLOW 2 — Adding Properties

### A. Manual Creation Path — `src/app/(dashboard)/properties/new/page.tsx`

#### Happy Path
1. Step 0: property name
2. Step 1: platforms + iCal URLs (optional "Test" button)
3. Step 2: base rate + min/max + min stay
4. Step 3: review & save
5. Inserts property, listings for enabled platforms, generates 90-day `calendar_rates` in batches of 30

#### Issues
- **P0 — Free tier quota check is non-atomic**: Lines 122-130 fetch count, check `>= 1`, then insert. Two concurrent requests can both pass the check. Should use a DB transaction or constraint.
- **P1 — Test button sends `property_id: "preview"`**: `/api/ical/add` runs `verifyPropertyOwnership(user.id, "preview")` on a literal string; either fails for all users or accidentally tests a real property named "preview".
- **P1 — Calendar_rates batched insertion has no per-batch error handling**: If batch 2 fails, batches 1 and 3+ succeed; property has partial rate data but UI shows success toast.
- **P1 — Platform listing URLs not validated**: User can enter `https://google.com` as an Airbnb listing URL with no format check.
- **P2 — Address autocomplete accepts freetext**: No geocoding confirmation, latitude/longitude can be null.
- **P2 — No explicit `platform_listing_id` field in iCal mode**: Photos/comps can't be fetched later without it.

### B. Channex Import — `src/app/api/channex/import/route.ts`

#### Happy Path
1. `GET /api/channex/import` returns preview of Channex-connected properties
2. `POST /api/channex/import` with `{ channex_ids }` fetches each, matches existing by `channex_property_id` or by name, inserts/updates property, imports room types as listings, imports bookings (90 days), imports rates

#### Issues
- **P0 — Booking insert errors silently swallowed**: Lines 333-336 log but don't throw; import reports success while missing bookings. Overbooking risk.
- **P1 — Name-matching algorithm is fuzzy and fragile**: Lines 137-150 do substring matching after stripping city suffixes ("- Tampa", "in Orlando"). User's "Pool" in DB matches "Pool House in Tampa" in Channex accidentally.
- **P1 — Scaffold migration logic (lines 222-280) leaves orphans**: If migration fails partway, old scaffold Channex property ID stays referenced in channex_room_types/channex_rate_plans/property_channels.
- **P1 — Rate import assumes `ra.stop_sell` present**: `is_available: !ra.stop_sell` — if missing, `!undefined = true` so all dates silently become available.
- **P1 — Room type fetch failure doesn't abort property import**: Lines 217-219 catch and continue; bookings/rates inserted but have no associated room type.
- **P1 — No deduplication guard on rate entries**: Channex duplicate restrictions insert duplicate calendar_rates rows.
- **P2 — Logging doesn't confirm scaffold migration completed**: Unclear from API response whether the scaffold was truly migrated or just partially.

### C. iCal Import — `src/app/api/ical/add/route.ts`

#### Happy Path
1. POST with `{ property_id, feed_url, platform }`
2. Fetches URL, validates iCal format
3. Upserts `ical_feeds` row (property+platform key)
4. Fetches Airbnb cover photo (non-blocking)
5. Runs initial `syncICalFeeds()`
6. Returns booking/blocked date counts

#### Issues
- **P1 — Ownership check runs on literal "preview" string**: Lines 26-31 when UI uses preview mode; the verifyPropertyOwnership call will fail the check on any user.
- **P1 — Feed URL fetch has no timeout**: User can submit a URL that hangs for Next.js default timeout (30s).
- **P1 — Cover photo fetch failures surface as generic errors**: Should be non-blocking.
- **P2 — Platform detection is case-sensitive**: `"AIRBNB.COM"` → detected as "direct".
- **P2 — Duplicate feed creation not prevented**: Two uploads with same URL silently overwrite.

### D. Table Write Map

| Table | Manual | iCal | Channex Import | BDC Connect |
|-------|--------|------|----------------|-------------|
| properties | ✓ INSERT | — | ✓ INSERT/UPDATE | — |
| listings | ✓ INSERT | — | ✓ INSERT (room types) | — |
| ical_feeds | — | ✓ UPSERT | — | — |
| bookings | — | ✓ INSERT | ✓ INSERT | — |
| calendar_rates | ✓ INSERT (90-day base) | — | ✓ INSERT (Channex restrictions) | — |
| property_channels | — | — | — | ✓ INSERT |
| channex_room_types | — | — | ✓ INSERT | ✓ INSERT |
| channex_rate_plans | — | — | ✓ INSERT | ✓ INSERT (dedicated BDC plan) |

---

## FLOW 3 — Connecting Channels

### A. Booking.com Self-Service Flow

Files:
- `/api/channels/connect-booking-com/route.ts` (POST — create/link)
- `/api/channels/connect-booking-com/test/route.ts` (POST — test auth)
- `/api/channels/connect-booking-com/activate/route.ts` (POST — push avail + activate)

#### Happy Path
1. User enters Booking.com Hotel ID
2. POST /connect-booking-com:
   - Verify ownership
   - If `channex_property_id` missing: try name-match existing Channex properties; if none, scaffold a new one
   - Ensure room type exists
   - **Create DEDICATED BDC rate plan** (critical — prevents rate bleed)
   - Find or create BDC channel in Channex
   - Save `property_channels` with `status: pending_authorization` and `settings.rate_plan_id`
3. UI shows authorization instructions
4. User authorizes in admin.booking.com
5. POST /test — validates Channex channel
6. POST /activate — pushes 365-day availability, ensures webhook, activates channel

#### Issues
- **P0 — Scaffold Channex properties never cleaned up**: Lines 68-88 create scaffolds but nothing ever deletes them after a later real import. They accumulate in Channex.
- **P0 — No atomic transaction across channel + rate plan + property_channels**: Failure mid-flow leaves orphaned Channex entities or DB rows.
- **P1 — Rate plan reuse validation incomplete**: Lines 142-150; if `getRatePlans()` itself throws, catch silently, bdcRatePlanId stays set to a stale value.
- **P1 — Multi-property BDC channel race**: Lines 196-203 reuse existing channel if it matches property OR hotel_id. Two rapid connects for different properties can overwrite each other.
- **P1 — Rate plan linking failure logged as warning only**: Lines 231-244; property_channels.settings.rate_plan_id saved even if Channex link failed.
- **P1 — Channel activation endpoint confusion**: Recently discovered `PUT is_active: true` silently no-ops for new BDC channels; correct endpoint is `POST /channels/{id}/activate`.
- **P1 — BDC parent/child rate plan problem**: Channex-suggested rate_plan_codes are often child/slave rates that reject pushes. We had to brute-force the parent code for both Pool House (45645116) and Villa Jamaica (48257326).

### B. Channex Import Auto-linking
- Import does NOT create `property_channels` rows for Airbnb/VRBO that came via OAuth
- Downstream: `/api/channels/rates/[propertyId]` has to synthesize entries in-memory by querying Channex
- **P0 — Synthesized property_channels rows never persisted**: Every GET re-queries Channex. POST (save rate) fails because the DB row doesn't exist.

### C. Ordering Scenarios
- **Airbnb first → BDC later**: Works. channex_property_id set from import, BDC connect uses it directly.
- **Manual create → BDC later**: Scaffold path. Later import tries name-match → potential migration mess or duplicate property.
- **BDC only, no Airbnb**: Scaffold only. User has BDC but no Airbnb until they also import.
- **Rapid parallel connect**: Race between import and connect-bdc. Whichever POST completes last wins property.channex_property_id.

---

## FLOW 4 — Post-Connection Sync

### A. iCal Sync — `src/lib/ical/sync.ts` (`syncFeedBookings`)

#### Triggers
- Manual: Sync button on calendar or property detail page
- Cron: VPS worker `~/staycommand-workers/booking_sync.py` every 15 min

#### Issues
- **P0 — Bookings with `channex_booking_id` never cancelled from iCal**: Lines 184-191. If Channex was the sync source initially but iCal later removes the booking, iCal sync skips it as "Channex owned" → booking stays confirmed in Moora, overbooking risk.
- **P1 — Dedup uses (property, check_in, check_out, platform) not UID**: Two legit bookings with identical dates create a duplicate row.
- **P1 — Blocked dates loop is N+1**: Lines 82-101 select-then-update per date; 10 bookings with 30-night blocks = 300 round-trips.
- **P1 — Cleaning task creation errors silently swallowed**: Line 161; booking synced but no task reminder.
- **P2 — No rollback if sync partially fails**: Feed marked with lastError but partial inserts remain.

### B. Channex Webhook — `src/app/api/webhooks/channex/route.ts`

#### Triggers
- Channex POSTs on booking_new, booking_modification, booking_cancellation

#### Issues
- **P0 — No idempotency check on revision_id**: Network retries cause duplicate inserts. Should check `channex_webhook_log` for revision_id before processing.
- **P1 — Platform detection fallback is fragile**: Lines 185-195; unique_id prefix is trusted but Channex doesn't always set it correctly. Vrbo bookings can get tagged as Airbnb.
- **P1 — Self-originated booking check (`SC-` prefix + `Offline`) never actually fires**: BDC connect flow doesn't prefix bookings, so the guard is dead code. Minor loop risk if we ever push bookings.
- **P1 — Modified booking avail push assumes old dates known**: If Channex API returns partial data, old range not unblocked; cross-channel blocks stale.
- **P2 — Webhook log doesn't record upsert result**: Just that the webhook arrived.

### C. Channex Revision Polling — `booking_sync.py` (VPS)

#### Issues
- **P1 — Uses direct psycopg2 connection, bypasses RLS**: Security: workers don't respect row-level security policies.
- **P2 — Availability push redundant every 15 min even with no change**: Wasted Channex API quota.

### D. Rate Push — `/api/pricing/push/[propertyId]/route.ts`

#### Trigger
- Manual via "Push to OTAs" button
- No cron; rate updates only flow when user clicks

#### Issues
- **P0 — No per-batch error handling**: Lines 168-172 push in 200-size batches; mid-batch failure leaves first N rates applied, rest missing, no error surfaced.
- **P1 — No validation that rate_plan_id is still live in Channex**: Deleted rate plan → silent push failure.
- **P1 — Per-channel override precedence not logged**: Can't trace which channel got which rate.

### E. Per-Channel Rate Editor — `/api/channels/rates/[propertyId]/route.ts`

#### Issues
- **P0 — Auto-discovered rate_plan_ids NOT persisted to DB**: GET discovers them from Channex on every request; POST has no DB row to save to.
- **P1 — `find()` picks first matching rate plan; multi-plan channels get only one updated**.
- **P1 — Synthesized property_channels entries are ephemeral (response-only)**: POST expects a DB row that doesn't exist for auto-discovered entries.

---

## CESAR-SPECIFIC ASSUMPTIONS BAKED INTO CODE

| Assumption | Location | Breaks When |
|---|---|---|
| Free tier = 1 property | properties/new line 126 | Product changes free limit |
| City names stripped: Tampa, Orlando, Miami, Jacksonville, St. Pete | connect-booking-com line 47, channex/import line 138 | User in different region |
| 90-day rate lookout | properties/new line 81, pricing/push line 43 | Long-term rentals |
| Cleaning tasks auto-created for all iCal bookings | ical/sync line 155-166 | User wants manual turnover |
| Default room occupancy 6 adults / 2 children / 1 infant | connect-booking-com line 109 | Small or shared rooms |
| Default min stay = 1 night everywhere | multiple places | Min-stay rules vary |
| Booking.com parent rate plan code guessing | connect-booking-com (manual brute force) | New hotels with slave rates |

---

## MISSING VALIDATION

| Input | Where | Missing Check |
|---|---|---|
| Email (signup) | signup/page.tsx line 61 | Domain validity, disposable email |
| Password | signup/page.tsx line 79 | Strength (caps/numbers/special) |
| Property name | properties/new line 263 | Max length |
| Address | properties/new line 273 | Actual lookup confirmation |
| iCal URL | ical/add line 36 | Format, reachability |
| Hotel ID | connect-booking-com line 20 | Numeric, length |
| Rate values | calendar_rates schema | Negatives, outliers |
| Check-in/out dates | bookings schema | checkout > checkin |
| Coordinates | properties schema | Valid lat/lng range |

---

## SEVERITY-RANKED BUG LIST

### P0 — Will Break for New Users

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | Auto-discovered rate_plan_ids not persisted | `/api/channels/rates/[propertyId]` GET | Per-channel editor cannot save; every GET re-queries Channex |
| 2 | Webhook deduplication missing | `/api/webhooks/channex/route.ts` | Duplicate bookings on Channex retry |
| 3 | Channex import booking errors silently swallowed | `/api/channex/import` POST line 333 | Missing bookings → overbooking risk |
| 4 | iCal can't cancel Channex-linked bookings | `src/lib/ical/sync.ts` line 184 | Ghost bookings persist, overbooking |
| 5 | Scaffold Channex properties never cleaned up | `/api/channels/connect-booking-com` | Orphan Channex properties accumulate |
| 6 | iCal preview button uses literal `"preview"` | `properties/new/page.tsx` line 385 | Test fails for everyone |
| 7 | Free-tier quota check non-atomic | `properties/new/page.tsx` line 122 | Two rapid creates both succeed |
| 8 | Rate push no per-batch error handling | `/api/pricing/push/[propertyId]` line 168 | Partial rate sync, no error surfaced |
| 9 | No atomic tx across channel + rate plan + property_channels | `/api/channels/connect-booking-com` | Partial setup if mid-flow failure |

### P1 — Will Confuse or Cause Data Drift

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 10 | Fuzzy name matching in Channex import | channex/import line 137 | Wrong property linked ("Pool" → "Pool House") |
| 11 | Scaffold migration leaves orphans if partial fail | channex/import line 222 | Stale Channex refs |
| 12 | iCal dedup by dates instead of UID | ical/sync line 126 | Rare dup edge case |
| 13 | Rate plan reuse validation catches silently | connect-booking-com line 142 | Stale rate plan used |
| 14 | Multi-property BDC channel race | connect-booking-com line 196 | Channels overwritten on rapid connects |
| 15 | Modified booking availability push can lose old dates | webhooks/channex | Stale unblocks |
| 16 | Manual property creation allows bogus addresses | properties/new line 273 | Geocoding silent fail |
| 17 | Calendar_rates insertion not transactional | properties/new line 188 | Partial rates if batch fails |
| 18 | Cleaning task creation errors swallowed | ical/sync line 161 | No turnover reminders |
| 19 | iCal fetch has no timeout | ical/add line 36 | Request hangs up to 30s |
| 20 | Python workers bypass RLS | booking_sync.py | Security posture hole |
| 21 | Per-channel override precedence not logged | pricing/push line 148 | Hard to audit which channel got what |
| 22 | BDC parent rate plan must be brute-forced | connect-booking-com / operational | Setup fails for hotels with slave rates |

### P2 — Tech Debt

| # | Issue | Location |
|---|-------|----------|
| 23 | Platform detection case-sensitive | ical/add line 11 |
| 24 | Blocked date loop is N+1 | ical/sync line 82 |
| 25 | Availability push every 15 min regardless of change | booking_sync.py |
| 26 | Signup form not cleared after success | signup/page.tsx |
| 27 | Free-tier limit hardcoded | properties/new line 126 |
| 28 | City suffix stripping hardcoded | multiple places |

---

## RECOMMENDED PRIORITY ORDER

1. **Rate plan persistence** (P0#1) — Blocks the newly shipped rate editor
2. **Webhook dedup** (P0#2) — Prevents duplicate bookings
3. **Channex import error surfacing** (P0#3) — No more silent losses
4. **iCal cancel for Channex-synced** (P0#4) — Prevents ghost bookings
5. **Scaffold cleanup** (P0#5) — Prevents Channex account clutter
6. **iCal preview UUID** (P0#6) — Unblocks test button
7. **Free-tier atomic quota** (P0#7) — Prevents quota bypass
8. **Rate push batch errors** (P0#8) — Surface partial failures
9. **Atomic transactions + parent rate discovery** (P0#9) — Harder, bigger refactor
