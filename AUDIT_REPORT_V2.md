# Moora / StayCommand — Re-Audit Report V2

**Date**: 2026-04-13
**Scope**: Verification of P0/P1 fixes from commits 436d433 (P0 batch), c0cc8d8 (P1 batch), and 25e40c2 (docs).
**Compared against**: `AUDIT_REPORT.md` (original).

---

## Section 1 — Original audit resolution status

### P0 — Was "will break for new users"

| # | Issue | Status | Evidence |
|---|-------|--------|----------|
| 1 | Auto-discovered rate_plan_ids not persisted | **RESOLVED** | `/api/channels/rates/[propertyId]` GET lines 215-272: fire-and-forget async IIFE upserts discovered plans to `property_channels.settings`. Covers both existing-row UPDATE and missing-row INSERT with synthetic `channex_channel_id`. |
| 2 | Webhook deduplication missing | **RESOLVED** | `/api/webhooks/channex/route.ts` lines 132-161: Checks `channex_webhook_log` for the revision_id before processing. On duplicate, logs `skipped_duplicate` and re-acks to Channex. |
| 3 | Channex import booking errors silently swallowed | **RESOLVED** | `/api/channex/import/route.ts`: `bookingsFailed` counter + `bookingErrors[]` array. Status flipped to `imported_with_errors` when any booking fails; response returns first 10 error messages. |
| 4 | iCal can't cancel Channex-linked bookings | **RESOLVED** | `src/lib/ical/sync.ts` lines 197-250: Removed the skip-on-channex_booking_id guard; cancelled rows also unblock affected `calendar_rates` dates so cross-channel avail stays accurate. |
| 5 | Scaffold Channex properties never cleaned up | **RESOLVED** | Import's scaffold-migration branch now calls `channex.deleteProperty(oldChannexPropertyId)` after migrating room types/rate plans/channels, and retargets stale `property_channels` rows. |
| 6 | iCal preview button uses literal `"preview"` | **RESOLVED** | `/api/ical/add`: `PREVIEW_PROPERTY_ID` sentinel; preview mode skips ownership check and returns counts without DB writes. Also added 15s AbortController fetch timeout. |
| 7 | Free-tier quota check non-atomic | **RESOLVED** | Migration `20260413010000_free_tier_property_quota.sql`: `user_subscriptions` table + `enforce_property_quota` BEFORE INSERT trigger. Existing users grandfathered to `business`. properties/new catches trigger error. |
| 8 | Rate push no per-batch error handling | **RESOLVED** | `/api/pricing/push/[propertyId]`: per-batch try/catch, `failedBatches[]` with date ranges, HTTP 207 on partial failure. |
| 9 | No atomic tx across channel + rate plan + property_channels | **RESOLVED** (see Section 2A for nuance) | `createdChannexResources[]` tracking + `rollback()` compensating-delete loop wraps the full BDC connect flow. |

### P1 — Was "will confuse or cause data drift"

| # | Issue | Status | Evidence |
|---|-------|--------|----------|
| 10 | Fuzzy name matching in Channex import | **RESOLVED** | `normalizePropertyName()` in both `channex/import` and `connect-booking-com`. Generic suffix stripping (" - X" / " in X" / Airbnb star noise). Exact normalized equality required. Ambiguous matches return `unmatched`/`multiple_channex_property_matches` with candidates. |
| 11 | Scaffold migration leaves orphans if partial fail | **RESOLVED** | Migration body wrapped in try/catch; now also deletes scaffold Channex property and retargets `property_channels`. |
| 12 | iCal dedup by dates instead of UID | **RESOLVED** | UID-based primary dedup was already correct; date-based fallback now requires `platform_booking_id IS NULL` on candidate rows and PROMOTES the matched row by stamping in the iCal UID instead of silently skipping. |
| 13 | Rate plan reuse validation catches silently | **RESOLVED** | `connect-booking-com` lines 210-219 explicitly unset `bdcRatePlanId` if the stored ID isn't found in Channex. |
| 14 | Multi-property BDC channel race | **RESOLVED** (but see Section 7 NEW-P0) | `concurrency_locks` mutex serializes concurrent connects per property. Channel update replaces properties list with `[channexPropertyId]` only. |
| 15 | Modified booking availability push can lose old dates | **NOT A BUG** | Re-read showed current webhook correctly uses DB old-dates + Channex new-dates; original audit was wrong. |
| 16 | Manual property creation allows bogus addresses | **UNRESOLVED** | Still no geocoding validation on properties/new. |
| 17 | Calendar_rates insertion not transactional | **UNRESOLVED** | Still batched inserts with no rollback. |
| 18 | Cleaning task errors swallowed | **RESOLVED** | `SyncResult.warnings[]` array; caller sees warning on cleaning task failure. |
| 19 | iCal feed fetch no timeout | **RESOLVED** | 15s AbortController in `/api/ical/add`. |
| 20 | Python workers bypass RLS | **UNRESOLVED** | `~/staycommand-workers/booking_sync.py` still uses psycopg2 direct. |
| 21 | Per-channel override precedence not logged | **UNRESOLVED** | `/api/pricing/push` doesn't log which channel got which rate per date. |
| 22 | BDC parent rate plan must be brute-forced | **UNRESOLVED** | Still manual discovery; no `POST /channels/{id}/activate` auto-retry with sibling rate codes. |

### P2 — Was "tech debt / nice-to-have"

| # | Issue | Status |
|---|-------|--------|
| 23 | Platform detection case-sensitive | **NOT A BUG** (audit was wrong — already lowercases) |
| 24 | Blocked date loop is N+1 | **UNRESOLVED** (still `ical/sync.ts` lines 87-106) |
| 25 | Availability push every 15 min regardless | **NOT A BUG** (audit was wrong — `booking_sync.py` is revision-driven) |
| 26 | Signup form not cleared after success | **UNRESOLVED** |
| 27 | Free-tier limit hardcoded | **RESOLVED** via `user_subscriptions` table + trigger |
| 28 | City suffix stripping hardcoded | **RESOLVED** via `normalizePropertyName` generic pattern |

---

## Section 2 — Regression check on the fixes themselves

### A. BDC connect compensating rollback

**Risk tested**: what happens if `rollback()` itself throws? Can `releaseLock()` run twice? Lock race?

**Findings**:
- `createdChannexResources.push()` happens immediately after each successful Channex create, so entries are always in-sync with Channex state.
- The rollback loop iterates `reverse()` over the array, catching per-item errors and logging (line 89). A single failing delete doesn't stop the rest.
- `releaseLock()` is called in both the success path (line 333) and error path (line 347). Only one of them runs per request, so no double-release risk.
- Lock acquisition uses `insert + select + maybeSingle` pattern — atomic in PostgreSQL. If another request holds the lock, the insert conflicts and `lockRow` is null → 409 returned.
- `release_stale_locks` RPC is best-effort (catch suppresses errors). No cron calls it. If it ever fails, stale rows persist until their `expires_at` passes and a future request happens to overwrite them via the PK conflict path. Since PK is `lock_key` and there's no `WHERE expires_at < now()` logic in the insert, **a lingering stale row will permanently block lock acquisition for that key until manually cleaned**. This is the worst regression in the P1 batch.

**Severity**: P1 — lock cleanup is not guaranteed.
**Recommendation**: Acquire path should be `DELETE … WHERE lock_key = X AND expires_at < now(); INSERT …` in one RPC, or use Postgres advisory transaction locks instead of a table.

### B. Webhook dedup write failure

**Risk tested**: if the `skipped_duplicate` log insert fails, is the revision re-processed?

**Findings**:
- The dedup lookup reads existing rows; if any match, we ack Channex and return. The log-write is wrapped in its own try/catch so a log failure doesn't prevent the ack.
- If logging fails but the ack succeeds, Channex stops retrying. If Channex retries anyway (network partition), the dedup check on the retry will still find the original row from the first successful processing (not the failed log). So re-processing is still prevented.
- If the first real processing successfully wrote the log but the ack failed, the retry will find the log row with action in `["created","modified","cancelled"]` and be treated as duplicate correctly.

**Severity**: safe.

### C. `concurrency_locks` cleanup

See Section 2A — stale-row issue flagged.

### D. iCal UID promotion race with Channex webhook

**Risk tested**: iCal sync promotes a Channex-sourced row by setting `platform_booking_id = entry.uid` while a webhook updates the same row with new check_in/check_out.

**Findings**:
- Both are plain UPDATEs on the same row. Postgres row locking serializes them; last-write-wins.
- If webhook wins, it overwrites the UID update. The next iCal sync finds the row by dates again (since UID wasn't set) and re-promotes.
- If iCal wins, the UID is set; webhook's later update preserves the UID because it doesn't touch that field.
- No data loss; at most one extra cycle of promotion. Acceptable.

**Severity**: P2 tech debt. Could be eliminated with a SELECT FOR UPDATE inside a transaction.

### E. Fire-and-forget rate plan persistence

**Risk tested**: write fails silently, orphaning auto-discovered rate plan state.

**Findings**:
- If the background write fails, the next GET re-runs discovery and re-persists (idempotent).
- POST `/api/channels/rates/[propertyId]` also has its own auto-discovery + persist path, so the editor's save flow doesn't depend on the GET loop having succeeded.
- No data loss; worst case is every request re-discovers, which costs Channex quota but not correctness.

**Severity**: safe, minor inefficiency.

---

## Section 3 — Integration check between fixes

### A. Webhook dedup + booking modification

The dedup check happens BEFORE fetching the full booking from Channex. For a legitimate modification with a new revision_id, the dedup lookup returns nothing, code continues, fetches the full booking, and the modification branch correctly uses DB `oldCheckIn`/`oldCheckOut` + Channex `arrival_date`/`departure_date`. Works.

### B. Scaffold cleanup + rate plan persistence

After `channex/import` migrates a scaffold, it deletes the scaffold Channex property AND retargets `property_channels.settings.rate_plan_id` to the real plan. The next GET `/api/channels/rates` reads the persisted real plan and uses it directly; no re-discovery needed. Works.

### C. Free-tier trigger + Channex import

If a free-tier user (existing_count = 0, limit = 1) imports one property, the first INSERT passes. Attempting a second import inside the same request raises `property_quota_exceeded` from the trigger. The import route's outer try/catch (line 413+) captures it and reports `status: "error"` for that property in the results array. The first property remains imported. No partial state — PostgreSQL rolls back only the failing INSERT.

Concern: the trigger doesn't check Pro/Business tiers for new users. Existing users got grandfathered as `business` by the migration, but a new user who somehow gets marked as `pro` directly in the DB would correctly hit the 15-property limit.

### D. Atomic BDC creation + dedicated rate plan + property_channels

Creation order: property → rate plan → channel. `createdChannexResources` append order matches. Rollback iterates in reverse: channel → rate plan → property. Verified correct.

Edge case: if Channex's `updateChannel` call to link the rate plan (lines 301-314) fails, that failure is caught and logged as a warning but **doesn't trigger rollback** because it's inside its own try/catch. This means the channel and rate plan exist in Channex but aren't linked. Subsequent calls to `getRestrictionsBucketed` would return no data for the BDC rate plan, and the per-channel rate editor would show an empty card.

**Severity**: P2 — mid-flow link failure should either retry on activation or trigger rollback.

---

## Section 4 — New user journey walkthrough

Simulating a brand new user (no account, no Channex connection yet):

### Step 1: Sign up → email confirmation → first login

**Path**: `/signup` → Supabase `auth.signUp` → email confirmation → `/login` → middleware session → `/`

**Issues**:
- Signup form doesn't clear on success (still open bug, P2).
- No "check your inbox" persistence; if user closes the confirmation screen, they're stranded unless they click the email.
- No "resend confirmation" link visible.

**Severity**: P1 UX, not data/breakage.

### Step 2: First dashboard load

Dashboard fetches `/api/dashboard/command-center`. Returns `{ empty: true }`. Client redirects to `/properties`.

**Issue**: No explicit "welcome, here's what to do first" UX. The redirect is silent.

**Severity**: P2 UX.

### Step 3: Add first property via Channex OAuth

User goes to `/properties/import`. GET `/api/channex/import` returns Channex properties (if they authorized Airbnb in the Channex dashboard beforehand). User selects one.

POST `/api/channex/import` with `{ channex_ids: ["xxx"] }`. Flow:
1. Fetch property from Channex → OK
2. Try to find existing Moora property by `channex_property_id` → none
3. Try normalized name match → none
4. INSERT new property → trigger checks quota, count=0, limit=1, OK
5. Fetch room types → insert listings
6. Fetch bookings (90 days) → per-booking try/catch, tracks failures
7. Fetch rates → insert calendar_rates
8. Return `results: [{ status: "imported", ... }]`

**Potential issues**:
- If the user's Airbnb has multiple listings and the user imports the first one successfully, the second one hits the free-tier trigger and fails. Response returns `{ results: [{...imported}, {...error: "property_quota_exceeded"}] }`. The import UI must recognize this and show an upgrade CTA instead of just a generic error.
- **Verified**: I couldn't locate the import results UI component to confirm how it surfaces `imported_with_errors` / `error` / `unmatched` statuses. This is the user-visible weak point.

**Severity**: P1 — the import UI likely doesn't gracefully show per-property status. Needs UI audit.

### Step 4: Connect Booking.com on the imported property

User enters Hotel ID, clicks Connect. POST `/api/channels/connect-booking-com`.

Flow:
1. Ownership check → OK
2. Acquire `concurrency_locks` row → OK (new lock)
3. `channex_property_id` is already set from import → skip scaffold path
4. Ensure room type → likely already exists from import
5. Create dedicated BDC rate plan → push to resources
6. Find/create BDC channel → push to resources
7. Link rate plan to channel → try/catch warn
8. Upsert `property_channels` with status `pending_authorization`
9. Release lock
10. Return success

**Potential issues**:
- **NEW P0 found** (see Section 7): if another Moora user has already connected the same hotel_id on a different property, step 6 will find the existing channel and REASSIGN it to this user's property, silently stealing it from the original owner.
- `POST /channels/{id}/activate` (the Channex endpoint we discovered) is NOT called in this flow. The user has to then call `/activate` (our endpoint) which calls `channex.updateChannel(channelId, { is_active: true })` — but we verified earlier in the session that THIS DOES NOT WORK for new channels; only `POST /channels/{id}/activate` does. So a brand-new user's channel will stay `is_active: false` even after clicking Activate.

**Severity**: P0 — brand-new users won't have their channels sync until this is fixed.

### Step 5: User authorizes Channex in admin.booking.com, tests, activates

`/api/channels/connect-booking-com/test` checks channel state. `/api/channels/connect-booking-com/activate` tries `channex.updateChannel(channelId, { is_active: true })`. This API returns 200 but silently does not activate newly-created channels. Earlier in the session we discovered the correct endpoint is `POST /channels/{id}/activate`. **This correct endpoint is NOT wired into the activate route.** Every new user will hit this silent failure.

**Severity**: P0.

### Step 6: First BDC booking arrives via webhook

Webhook POST → dedup check → fetch booking → insert → push availability back to Channex → ack. Verified to work end-to-end.

### Step 7: User opens calendar, clicks a date, sees rate editor

GET `/api/channels/rates/[propertyId]` → auto-discovers rate plans from Channex → persists → returns live rates. Editor shows Airbnb + BDC cards with real rates. User edits BDC rate, hits Save. POST `/api/channels/rates/[propertyId]` → upsert override row + push to Channex. Works.

### Step 8: Pricing engine overnight → user pushes rates

POST `/api/pricing/push/[propertyId]` → per-channel override-aware, HTTP 207 on partial failure. Works.

### Step 9: User tries to delete a property

**There is no per-property delete route.** Only `/api/settings/delete-account` which cascades through all property-scoped tables but **does NOT delete the Channex channel, rate plans, or property**. Every deleted user leaves Channex orphans behind.

**Severity**: P1 — billing/account hygiene issue.

---

## Section 5 — Edge cases

### A. User authorizes Airbnb OAuth but has 0 listings

GET `/api/channex/import` returns empty array. UI should show "No properties found in your Channex account." **Not verified** — need to check import page UI behavior.

### B. Channex API is down during import

Import happens per-property in a loop. If `getProperty(channexId)` throws, the outer catch captures it and returns `status: "error"` for that property. Other properties still process. Response is partial. Acceptable.

### C. User cancels mid-BDC-connect (closes browser)

Browser aborts the fetch. Server continues processing until completion, then releases the lock on either success or failure. If the server itself crashes mid-flow before reaching `releaseLock()`, the lock row persists for 60 seconds. **See Section 2A**: stale-row risk means the lock could persist indefinitely if `expires_at` is never used by a subsequent acquire.

Also: if the Channex createProperty/createRatePlan/createChannel already ran and the server crashed before `rollback()`, the Channex entities are orphaned. No cleanup happens.

**Severity**: P1.

### D. Two users try to connect the same BDC Hotel ID

**VERIFIED NEW P0**. Line 267-271 of `connect-booking-com/route.ts`:

```ts
const bdcChannel = (allChannels.data ?? []).find((ch: any) => {
  if (ch.attributes?.channel !== "BookingCom") return false;
  const chProps: string[] = ch.attributes?.properties ?? [];
  const chHotelId: string | undefined = ch.attributes?.settings?.hotel_id;
  return chProps.includes(channexPropertyId) || chHotelId === hotelId;
});
```

If User A has already created a BDC channel for hotel_id=12345 on property X, and User B (unrelated owner) tries to connect hotel_id=12345 to their property Y, line 271 returns the existing channel. Line 281 then REPLACES `properties` with `[Y's channex_property_id]`, stripping A's property from the channel. User A's BDC sync silently breaks.

Realistic severity: low probability (two Moora users would have to own the same BDC hotel, which would require shared ownership or credential theft). But the theft vector is real and should be closed before we have 100+ users.

**Recommended fix**: filter the channel match by also checking that the channel belongs to a property in the same Moora user's account.

### E. User deletes a property with active BDC channel

No per-property delete route exists. The delete-account flow (`/api/settings/delete-account`) deletes property-scoped tables but does NOT call `channex.deleteProperty` or `deleteChannel`. Channex channels and properties are orphaned permanently.

**Severity**: P1.

### F. Webhook arrives for an unknown property

Handled: lines 136-147 log `skipped_unknown_property` and return 200.

### G. Race: BDC connect running while import runs for same property

BDC connect holds a mutex on `bdc_connect:{propertyId}`. Import does NOT acquire any lock. If both run simultaneously:
- Import can update `properties.channex_property_id` from scaffold to real while BDC connect is mid-flow using the old value.
- BDC connect would then create a rate plan/channel pointing to the OLD scaffold ID.

**Severity**: P1 — import should acquire the same mutex.

### H. Free-tier user imports 4 properties in rapid succession

First import: INSERT → trigger counts 0, allows, INSERT → count becomes 1.
Second import: INSERT → trigger counts 1, raises `property_quota_exceeded`.
Third and fourth: same.
Response: `results: [{imported}, {error}, {error}, {error}]`.
**UI behavior**: unknown — need to verify the import page shows each row's status clearly.

**Severity**: P1 if UI shows generic error instead of per-row status.

---

## Section 6 — P2 / tech debt still outstanding

From the original audit, still unresolved:

| # | Issue | Severity | Promotion potential |
|---|-------|----------|---------------------|
| 16 | Bogus addresses accepted on manual create | P2 | → P1 once geocoding-dependent features ship (map, distance to comps) |
| 17 | calendar_rates batch insert not transactional | P2 | → P1 under load if a batch fails and leaves half-rates |
| 20 | Python workers bypass RLS | P2 | → P1 once we have multi-tenant users with security reviews |
| 21 | Per-channel override precedence not logged | P2 | → P1 for debugging customer pricing complaints |
| 22 | BDC parent rate plan must be brute-forced | **P0** | Already shown to break Villa Jamaica setup; should be auto-discovered on first activation |
| 24 | Blocked date loop is N+1 in ical/sync | P2 | → P1 for properties with 100+ blocked dates |
| 26 | Signup form not cleared | P2 | UX only |

---

## Section 7 — NEW issues discovered during re-audit

### NEW P0-A — `POST /channels/{id}/activate` endpoint not wired into activate route

**Location**: `/api/channels/connect-booking-com/activate/route.ts`

**Root cause**: Earlier in today's session we manually discovered that `PUT /channels/{id} { is_active: true }` silently no-ops for new BDC channels, and the correct endpoint is `POST /channels/{id}/activate`. The activate route currently calls `channex.updateChannel(channelId, { is_active: true })` which we proved does not activate new channels.

**Impact**: Every brand-new user who connects Booking.com and clicks "Activate" will hit silent failure. Channel stays inactive. Rates never sync. Booking.com shows "Closed / Not bookable" forever until someone manually runs the right API call. This was literally the first thing we hit for Villa Jamaica tonight.

**Fix**: Add an `activateChannel(channelId)` method to `channex/client.ts` using `POST /channels/${channelId}/activate` and call it from `connect-booking-com/activate/route.ts` in place of (or in addition to) the `updateChannel({is_active: true})` call.

### NEW P0-B — Multi-user BDC channel theft via `hotel_id` match

**Location**: `/api/channels/connect-booking-com/route.ts` line 267-272

**Root cause**: Channel match logic `chProps.includes(channexPropertyId) || chHotelId === hotelId` scans the entire Moora-account-wide Channex channel list. In a multi-tenant Moora deployment that uses a single Channex master key, two users connecting the same hotel_id will reuse (and overwrite) each other's channel.

**Impact**: Low probability in current state (internal user + one tester), but blocks multi-tenant production rollout. Hot hotel IDs are not unique per user.

**Fix**: Scope the channel-match to channels whose Channex property is linked to the currently-authenticated user. Or, store `property_channels.channex_channel_id` and prefer an existing mapping over hotel_id-based scanning.

### NEW P1-A — `concurrency_locks` stale row permanently blocks acquisition

**Location**: migration `20260413020000_concurrency_locks.sql` + `connect-booking-com/route.ts` lines 68-77

**Root cause**: Lock acquisition uses `INSERT ... ON CONFLICT DO NOTHING`. If a stale row with `expires_at < now()` exists, the insert conflicts and the caller sees 409 forever. `release_stale_locks` is called opportunistically before insert but is best-effort (errors suppressed), and no cron runs it. A server crash mid-BDC-connect can leave a row permanently blocking future attempts.

**Impact**: User sees "Another Booking.com connect request is already running" indefinitely after a single server crash.

**Fix**: Make lock acquisition a single RPC that does `DELETE WHERE lock_key = X AND expires_at < now()` then `INSERT`, atomically. Or switch to Postgres advisory locks.

### NEW P1-B — BDC connect rate-plan-link failure is warned, not rolled back

**Location**: `connect-booking-com/route.ts` lines 301-314

**Root cause**: After creating the rate plan and channel, the code calls `channex.updateChannel(channelId, { rate_plans: [...] })` to link them. This is wrapped in its own try/catch that logs a warning but doesn't throw, so a failure here doesn't trigger `rollback()`. Channel and rate plan exist in Channex but aren't linked.

**Impact**: Subsequent GET `/api/channels/rates` fails to fetch rates for the BDC card. User sees the channel in the list but "no rates" on every date.

**Fix**: Remove the inner try/catch so the error bubbles up to the outer catch and triggers rollback. Or retry the link on activation.

### NEW P1-C — No per-property delete flow; Channex cleanup missing from delete-account

**Location**: `/api/settings/delete-account/route.ts`

**Root cause**: Delete-account cascades through property-scoped tables but never calls `channex.deleteChannel`, `channex.deleteProperty`, or `channex.deleteRatePlan`. There's also no per-property delete endpoint at all.

**Impact**: Every deleted Moora account leaves orphaned Channex channels. In production this will accumulate quickly and may hit Channex account limits or trigger confusing "why do I still see my old listing" reports from churned users.

**Fix**: Add cleanup of Channex entities in delete-account, and add a per-property DELETE route that does the same.

### NEW P1-D — Channex import doesn't acquire BDC lock

**Location**: `/api/channex/import/route.ts` migration branch

**Root cause**: If a user is mid-BDC-connect on a property and simultaneously imports the real Channex property for the same Moora property, the import updates `channex_property_id` while BDC connect is still using the old value. Result: BDC connect creates rate plan/channel against the stale ID.

**Impact**: BDC ends up pointing to a different Channex property than Airbnb. Mirror of the original Pool House bug.

**Fix**: Import should acquire the same `bdc_connect:{propertyId}` lock (or a new `property_write:{propertyId}` lock) during its migration branch.

### NEW P2-A — Atomic BDC creation doesn't clean up local DB on rollback

**Location**: `connect-booking-com/route.ts`

**Root cause**: Rollback deletes Channex entities but doesn't revert local DB writes (e.g. `channex_room_types` upserts, `properties.channex_property_id` update).

**Impact**: Moora DB may still reference deleted Channex IDs after a failed rollback. Next connect attempt will try to reuse these stale refs.

**Fix**: Rollback should also revert `channex_room_types`, `channex_rate_plans`, and `properties.channex_property_id` when they were created during this flow.

### NEW P2-B — Import UI doesn't clearly surface new statuses

**Location**: `/properties/import/page.tsx` (UI)

**Root cause**: We added `imported_with_errors`, `unmatched`, and `multiple_candidates` response statuses. The UI almost certainly doesn't render them properly yet — it was built for the old binary `imported`/`error` statuses.

**Impact**: User sees a weird undefined state or blank row for properties that partially imported or need manual selection.

**Fix**: Audit `/properties/import/page.tsx` and add explicit rendering for each status.

---

## Section 8 — V1 → V2 comparison summary

| Severity | V1 count | V2 resolved | V2 unresolved | V2 new findings |
|----------|----------|-------------|---------------|-----------------|
| P0 | 9 | 9 | 0 | **2 new** (BDC activate endpoint, BDC channel steal) |
| P1 | ~14 | 7 | 5 | **4 new** (lock stale row, rate-plan-link no-rollback, delete-account Channex cleanup, import lock) |
| P2 | 6 | 2 | 4 | **2 new** (DB rollback, import UI statuses) |

**Net**: 18 bugs resolved, but 8 new bugs found — 2 of them P0.

### Most urgent follow-ups (in order)

1. **P0-A**: Wire `POST /channels/{id}/activate` into the activate route. Every new user hits this; absolutely blocking.
2. **NEW P1-B**: Remove the inner try/catch on the rate-plan link step so rollback triggers on link failure.
3. **P0-B**: Scope BDC channel matching to the current user to prevent cross-tenant steal.
4. **NEW P1-A**: Fix stale-lock row blocking future acquisitions.
5. **NEW P1-C**: Add Channex cleanup to delete-account (and add per-property delete).
6. **NEW P1-D**: Have Channex import acquire the BDC lock during its migration branch.
7. **P0 (from original audit P1-22)**: Auto-discover BDC parent rate plan on activation.

### Overall assessment

The P0/P1 batch significantly improved correctness. Webhook idempotency, quota enforcement, rate push error handling, and ghost-booking cleanup were all critical and are now solid. The compensating rollback pattern is a good improvement.

However, the fixes introduced 2 new P0 bugs that will block real onboarding, and 4 new P1 bugs that matter for production. The activate endpoint issue is the most urgent — it will break every single new user who tries to connect Booking.com, because we hit it ourselves during Villa Jamaica setup but forgot to roll the manual workaround back into the code.

**Do not declare onboarding production-ready until at least P0-A and P0-B are fixed.**
