# Channex Reference

Channex (`app.channex.io`) is Koast's OTA connector. Integration
quirks cost real hours to rediscover. This doc captures what
we've learned so new sessions don't repeat the mistakes.

## Client location

`src/lib/channex/client.ts`. Factory is `createChannexClient()` —
reads `CHANNEX_API_KEY` env, bails if missing. Type definitions
in `src/lib/channex/types.ts`.

## Endpoint cheat sheet

| Purpose | Method | Path | Notes |
|---|---|---|---|
| List rate plans | GET | `/api/v1/rate_plans?filter[property_id]=<uuid>` | Returns every plan linked to the property across all channels |
| List channels | GET | `/api/v1/channels?filter[property_id]=<uuid>` | Use `.data[i].attributes.rate_plans[0].rate_plan_id` to discover the active rate plan per channel |
| Restrictions (bucketed, USE THIS) | GET | `/api/v1/restrictions?filter[property_id]=<uuid>&filter[date][gte]=<>&filter[date][lte]=<>&filter[restrictions]=rate,availability,min_stay_arrival,stop_sell` | Returns `{ data: { <rate_plan_id>: { "YYYY-MM-DD": { rate: "185.00", ... } } } }`. Decimal-dollar strings. |
| Restrictions (non-bucketed) | GET | same without `filter[restrictions]` | Returns array with rates as integer cents (`19000`). **Don't use for reading rate data** — inconsistent per-endpoint formatting has bitten us. |
| Update restrictions (write) | POST | `/api/v1/restrictions` body `{ values: [{ property_id, rate_plan_id, date_from, date_to, rate: <cents int>, min_stay_arrival?, stop_sell? }] }` | Rate goes in as integer cents for non-BDC. For BDC, go through `buildSafeBdcRestrictions` which handles the safe-merge + conversion. |
| Get bookings | GET | `/api/v1/bookings?filter[property_id]=<uuid>` | Returns all bookings across channels |
| Reviews list | GET | `/api/v1/reviews?filter[property_id]=<uuid>&page[limit]=100&page[number]=N` | **Pagination is broken in the sense that `page[number]` appears ignored** — same 10 reviews returned regardless. Dedupe by id and break when no-new-ids (Session 6 pattern). `meta.total` may be higher than reachable. |
| Reply to review | POST | `/api/v1/reviews/:id/reply` body `{ reply: { reply: "<text>" } }` | Wire via `channex.respondToReview(reviewId, text)`. |
| Messages (per booking) | GET | `/api/v1/bookings/:booking_id/messages` | Per-booking; no property-wide list. |
| Message threads | GET | `/api/v1/message_threads` | Not property-filterable per docs. Messaging is Session 7 work. |
| Webhooks (list) | GET | `/api/v1/webhooks` | Check what's registered. Currently Koast subscribes to `booking_new,booking_modification,booking_cancellation` only. |

## Known quirks — read these before writing Channex code

### 1. Rate formatting: bucketed vs not

- Bucketed endpoint returns rate as **decimal string**: `"185.00"`
- Non-bucketed endpoint returns rate as **integer cents**: `18500`
- Writes via `POST /restrictions` want **integer cents** in the
  `rate` field for non-BDC channels.

The sync route was initially wrong here (used non-bucketed GET and
read `rate` as a string dollar value). Took a production diagnostic
to catch. Lesson: always use `getRestrictionsBucketed` for rate
reads, always send `Math.round(rate * 100)` for non-BDC writes.

### 2. `filter[restrictions]` is required for rate reads

Without `filter[restrictions]=rate,...`, the endpoint returns the
record skeleton but `rate` is empty. We discovered this during
Session 5a.6 debugging. The `getRestrictionsBucketed` helper in
`client.ts` already passes the filter; if you use it you're fine.
If you're calling the endpoint directly, don't forget.

### 3. Review pagination is limited

`GET /api/v1/reviews` returns ~10 per page regardless of
`page[limit]`, and `page[number]` appears ignored (same 10 returned
for any page). `meta.total` reports the real total (e.g. 110 for
Villa Jamaica) but we couldn't reach the later ones in normal
pagination. The sync loop dedupes by id and breaks when a page
adds nothing new — wastes maybe 5 Channex calls in the worst case,
correct behavior. Open item: ask Channex support for the correct
pagination params for deep history.

### 4. Rate plan IDs matter more than channel IDs

The channel (`channex_channel_id`) is the OTA connector. The rate
plan (`rate_plan_id`, stored in `property_channels.settings`) is
the rate stream Koast actually pushes to. After an Airbnb reconnect
(Session 5a.6), the channel UUID can stay the same but the rate
plan UUID changes — if Koast keeps reading/writing the old
`rate_plan_id`, changes silently go nowhere. Session 5a.6 added
`property_channels.settings.rate_plan_id` reconcile to the reconnect
flow.

### 5. Airbnb → Channex pull is slow and unreliable

Host-side Airbnb rate edits (via the Airbnb app) take minutes to
propagate to Channex, sometimes don't at all. Treat Koast as the
write surface; if a host edits rates on Airbnb directly we'll
eventually catch it via sync, but there's no real-time guarantee.

### 6. Properties can have duplicate records in Channex

Villa Jamaica had a ghost property "Home in Tampa ★4.82" in Channex
that the host cleaned up separately. We've seen the pattern where
the host's Airbnb account has multiple listings and Channex creates
multiple property records; our `property_channels` table can only
reference one of them. When troubleshooting "why isn't my rate
showing up?", check Channex UI for duplicate properties first.

### 7. The BDC `stop_sell` vs `availability` distinction

Per the incident postmortem (`docs/postmortems/INCIDENT_POSTMORTEM_BDC_CLOBBER.md`):
- `stop_sell: true` → Channex marks the room unavailable on BDC but
  **PRESERVES the rate**.
- `availability: 0` → same effect but **CLEARS the rate** as a side
  effect, triggering a rate-plan-wide recompute that can clobber
  unrelated dates.

The `buildSafeBdcRestrictions` helper only sets `stop_sell`, never
`availability: 0`. If a future session needs to touch this, read
the postmortem first.

## The safety pattern: `buildSafeBdcRestrictions`

Located in `src/lib/channex/safe-restrictions.ts`. Wraps any BDC
write with:

1. **Pre-read** — fetch current BDC state for the target date range
   via `getRestrictionsBucketed`. This is the reference for "what's
   already there."
2. **Whiplash guard** — if the new rate diverges from current by
   more than ~10% on any single date, mark that date as
   `skipped_fields` instead of pushing. Only applies to the apply
   path; the per-channel push path calls the helper with the guard
   effectively disabled (threshold is checked upstream).
3. **Safe merge** — generate `entries_to_push` by merging Koast's
   proposal with preserved host state (min_stay_arrival the host
   set manually, stop_sell flags, etc.). Never clobber
   host-editable state.
4. **Flat-response shape** — returns
   `{ entries_to_push, skipped_fields }`. Caller iterates
   `entries_to_push` through `channex.updateRestrictions`.

If you're writing to BDC and NOT going through this helper, you're
doing it wrong. Session 5a.6 and 6 both treat it as the only BDC
write path.

## Env gates

- `KOAST_ALLOW_BDC_CALENDAR_PUSH` — gate for BDC rate writes. When
  unset or `false`, BDC push paths return `{ ok: true, skipped: 'bdc_gate_off' }`
  or record BDC as failed in the response. Historical safety from
  an earlier Channex-clobber incident. Default-on in prod now but
  still respected.
- `KOAST_DISABLE_AIRROI` — kill switch for AirROI market data pulls.
  Currently **true** in Vercel prod (set 2026-04-22). Don't flip
  back without explicit instruction; see `tech-debt.md`.
- `CHANNEX_API_KEY` — required. Read from `.env.local` (dev) or
  Vercel env (prod).

## Testing Channex changes safely

- Villa Jamaica is the test property. Push a $5 delta, verify the
  BDC extranet + Airbnb host dashboard reflect within 5-15 min.
  Rollback is a second push back to the original rate.
- Never push a large delta (>$30) during testing — real guest
  reservations land against these rates, and refunding the
  difference is annoying.
- For write path diagnostics, add logging but don't commit temporary
  `console.log` that leaks PII (guest names, email). Strip before
  commit.
- Before running a migration against the live DB, test it via
  `supabase db diff` or by applying it to a throwaway schema.
  Live-DB migrations are reversible only with backup restores,
  which we don't have automated.
