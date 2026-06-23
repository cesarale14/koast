# Channex Endpoint Reference

Base URL: `https://app.channex.io/api/v1`  
Auth: `user-api-key: <key>` header. `accept: application/json`.  
Response envelope: JSON:API — `{ "data": <entity or entity[]>, "meta": {...} }`
for success; `{ "errors": {...} }` for errors.

Pagination: most list endpoints default to 10 items. `page[limit]` and
`page[number]` (or `pagination[limit]` on /bookings). Some endpoints cap
`page[limit]` silently (see /reviews in known-quirks).

`P` tag = probe-validated (live probe 2026-04-24 against a real property).  
`D` tag = docs-only.

---

## Properties — `/properties`

| Method | Path | Purpose | Status |
|---|---|---|---|
| GET | `/properties` | List (paginated) | P |
| GET | `/properties/:id` | Detail | P |
| POST | `/properties` | Create | D |
| PUT | `/properties/:id` | Update | D |
| DELETE | `/properties/:id` | Delete (supports `?force=true`) | D |

**Entity attributes (probe):** `id, currency, is_active, address, city, state,
country, latitude, longitude, email, phone, settings, content, property_type,
property_category, min_stay_type, acc_channels_count, max_count_of_*,
default_cancellation_policy_id, default_tax_set_id, hotel_policy_id, logo_url`

## Room Types — `/room_types`

| Method | Path | Purpose | Status |
|---|---|---|---|
| GET | `/room_types?filter[property_id]=<id>` | List for property | P |
| GET | `/room_types/options?filter[property_id]=<id>` | Options (no pagination) | D |
| GET | `/room_types/:id` | Detail | D |
| POST | `/room_types` | Create | D |
| PUT | `/room_types/:id` | Update | D |
| DELETE | `/room_types/:id` | Delete (`?force=true`) | D |

**Entity attributes (probe):** `id, title, count_of_rooms, capacity,
occ_adults, occ_children, occ_infants, default_occupancy, room_kind, codes,
content, meta, position`. `room_kind` is `"room"` or `"dorm"`; `capacity`
only applies to dorms. Newly created room types default to availability=0 —
you must POST `/availability` separately.

## Rate Plans — `/rate_plans`

| Method | Path | Purpose | Status |
|---|---|---|---|
| GET | `/rate_plans?filter[property_id]=<id>` | List for property | P |
| GET | `/rate_plans/options?filter[property_id]=<id>` | Options (no pagination) | D |
| GET | `/rate_plans/:id` | Detail | D |
| POST | `/rate_plans` | Create | D |
| PUT | `/rate_plans/:id` | Update | D |
| DELETE | `/rate_plans/:id` | Delete (`?force=true` required if mapped to a channel) | D |

**Entity attributes (probe):** `id, title, currency, parent_rate_plan_id,
rate_mode, sell_mode, meal_type, tax_set_id, cancellation_policy_id,
children_fee, infant_fee, options, auto_rate_settings, ui_read_only, meta`
plus seven-day arrays for `min_stay_arrival, min_stay_through, max_stay,
closed_to_arrival, closed_to_departure, stop_sell` and the `inherit_*`
flags.

**Rate modes:** `manual` (rate set directly in `options.rate`), `derived`
(child inherits primary occupancy rate from parent), `cascade` (child
inherits per-occupancy), `auto` (computed from `auto_rate_settings`).

**Sell modes:** `per_room` or `per_person`. Affects how `options` are
interpreted.

## Availability & Rates (ARI) — `/restrictions` + `/availability`

| Method | Path | Purpose | Status |
|---|---|---|---|
| GET | `/restrictions?filter[property_id]=<id>&filter[restrictions]=<csv>&filter[date][gte]=<d>&filter[date][lte]=<d>` | Read rates + restrictions, bucketed by rate_plan_id | P |
| POST | `/restrictions` | Write rates/restrictions | D |
| GET | `/availability?filter[property_id]=<id>&filter[date][gte]=<d>&filter[date][lte]=<d>` | Read room-type availability counts | D |
| POST | `/availability` | Write room-type availability | D |

**Required filter params for GET /restrictions:** `filter[property_id]`,
`filter[restrictions]`, and a date (`filter[date]=<d>` or the gte/lte
range). Omitting `filter[restrictions]` returns **400 "restrictions is
required"**. See quirks.

**Supported restriction types for `filter[restrictions]`:**
`availability, rate, min_stay_arrival, min_stay_through, min_stay,
closed_to_arrival, closed_to_departure, stop_sell, max_stay,
availability_offset` (read-only), `max_availability` (read-only).

**GET /restrictions response shape (probe):**
```json
{ "data": {
  "<rate_plan_id>": {
    "<YYYY-MM-DD>": {
      "availability": 1,
      "min_stay_arrival": 1,
      "rate": "200.00",
      "stop_sell": false,
      "unavailable_reasons": []
    }
  }
}}
```
`rate` is a decimal-formatted string. `availability` is integer. `stop_sell`
is boolean. `unavailable_reasons` is an array (empty on a clean bookable
date). Other restrictions appear when included in `filter[restrictions]`.

**POST /restrictions body:**
```json
{ "values": [ {
  "property_id": "<uuid>",
  "rate_plan_id": "<uuid>",
  "date": "YYYY-MM-DD",
  "rate": 20000,
  "min_stay_arrival": 2,
  "stop_sell": false
} ] }
```
Multiple `values` entries supported; last-write-wins inside a single POST.
Use `date_from`/`date_to` for ranges. Optional `days: ["mo","tu","we","th","fr","sa","su"]`
to target specific weekdays within a range.

**Rate format:** integer minor units (`20000` = $200.00 USD) **OR**
decimal string (`"200.00"`). Both accepted on input. Reads always return
the decimal string. See quirks for the trap.

**POST /availability body:**
```json
{ "values": [ { "property_id": "<uuid>", "room_type_id": "<uuid>",
                "date": "YYYY-MM-DD", "availability": 1 } ] }
```
For BDC: `availability: 0` blocks a date at the room-type level. Do NOT
use `stop_sell: true` to block BDC dates — that closes the entire property
at BDC.

## Channels — `/channels`

| Method | Path | Purpose | Status |
|---|---|---|---|
| GET | `/channels?filter[property_id]=<id>` | List channels for property | P |
| GET | `/channels/:id` | Detail | D |
| POST | `/channels` | Create (whitelabel-only) | D |
| PUT | `/channels/:id` | Update (mapping, settings) | D |
| POST | `/channels/:id/activate` | Activate — required after create/reconnect | D |
| POST | `/channels/:id/test` | Test connection | D |
| DELETE | `/channels/:id` | Delete | D |

**Entity attributes (probe):** `id, title, channel, currency, is_active,
inserted_at, updated_at, settings, properties, rate_plans, actions`.

`channel` is the OTA name: `"AirBNB"`, `"BookingCom"`, `"VRBO"`, etc. See
`channel-codes.md` for the full list.

`rate_plans` is an array of `{room_type_id, rate_plan_id, ...mapping}`
entries — this is how you inspect what's mapped.

`settings` is an object that varies per OTA. See quirks #11.

**Status signals (read in priority order):**
1. `is_active: false` — channel deactivated, no traffic flows.
2. `settings.token_invalid: true` — OAuth credential broken (Airbnb,
   VRBO). Reconnect flow needed.
3. `inventory_mode` — documented but **null in live probes**. Don't rely
   on it.

## Bookings — `/bookings` + `/booking_revisions`

| Method | Path | Purpose | Status |
|---|---|---|---|
| GET | `/bookings?filter[property_id]=<id>&pagination[limit]=N` | List (paginated, default 10) | P |
| GET | `/bookings/:id` | Detail | D |
| GET | `/booking_revisions` | List all revisions | D |
| GET | `/booking_revisions/feed` | **Poll unacknowledged revisions** — primary integration path | D |
| GET | `/booking_revisions/:id` | Revision detail | D |
| POST | `/booking_revisions/:id/ack` | Acknowledge a revision | D |
| POST | `/bookings/:booking_id/no_show` | Report no-show (BDC only) | D |
| POST | `/bookings/:booking_id/invalid_card` | Report invalid card (BDC only) | D |
| POST | `/bookings/:booking_id/cancel_due_invalid_card` | Cancel (BDC only) | D |

**Entity id fields (probe):**
- `id` — Channex revision UUID (unique per revision).
- `booking_id` — Channex booking UUID (stable across revisions of the
  same OTA booking).
- `revision_id` — synonymous with `id` on the revision entity.
- `ota_reservation_code` — the OTA's human-readable confirmation code
  (Airbnb `HM5MBZ1AVA`, BDC `6385131611`, Expedia `EXP-…`).
- `unique_id` — composite `<OTA_PREFIX>-<ota_reservation_code>`, e.g.
  `ABB-HM5MBZ1AVA`, `BDC-5297726638`, `EXP-1695093244`.
- `system_id` — OTA's internal message id (rarely useful for PMS code).

**Date + money fields:** `arrival_date`, `departure_date` (ISO date),
`arrival_hour` (`HH:MM` or null), `amount` (numeric string), `currency`,
`ota_commission` (numeric string or null).

**Feed pattern:** poll `/booking_revisions/feed` → process each → POST to
`/booking_revisions/:id/ack`. Unacked revisions re-appear for 30 minutes
then Channex emails a warning.

## Reviews — `/reviews`

| Method | Path | Purpose | Status |
|---|---|---|---|
| GET | `/reviews?filter[property_id]=<id>` | List reviews | P |
| GET | `/reviews/:id` | Detail | D |
| POST | `/reviews/:id/reply` | Reply to a guest review (host → guest public response) | D |
| POST | `/reviews/:id/guest_review` | Submit outgoing guest review (**Airbnb only**) | D |

**Entity attributes (probe):** `id, ota, ota_reservation_id, received_at,
inserted_at, updated_at, expired_at, is_hidden, is_replied, is_expired,
guest_name, overall_score, content, raw_content, scores, reply, tags, meta`.

`ota_reservation_id` matches the confirmation-code format seen in
`/bookings.ota_reservation_code` — use this for cross-reference.
`overall_score` is 0–10. `raw_content.public_review` and
`raw_content.private_feedback` split the review text. `scores` is an
array of `{category, score}` per-subrating.

**POST /reviews/:id/reply body:**
```json
{ "reply": { "response": "<text>" } }
```

**POST /reviews/:id/guest_review body (Airbnb only):**
```json
{ "review": {
    "scores": [{"category":"cleanliness","rating":5}, ...],
    "public_review": "<text>",
    "private_review": "<text>",
    "is_reviewee_recommended": true,
    "tags": ["host_review_guest_positive_neat_and_tidy"]
} }
```
`:id` is the **incoming review's id** — Airbnb's two-sided review model
pairs host-review-of-guest with the incoming guest-review-of-property.
You cannot create a standalone outgoing review.

## Messages — `/message_threads` + `/bookings/:id/messages`

| Method | Path | Purpose | Status |
|---|---|---|---|
| GET | `/message_threads?filter[property_id]=<id>` | List threads | P |
| GET | `/message_threads/:id` | Thread detail | D |
| GET | `/message_threads/:id/messages` | Messages in thread | P |
| POST | `/message_threads/:id/messages` | Send a message | P |
| POST | `/message_threads/:id/close` | Close thread | D |
| POST | `/message_threads/:id/no_reply_needed` | No-reply signal (BDC only) | D |
| GET | `/bookings/:booking_id/messages` | Messages on a booking | D |
| POST | `/bookings/:booking_id/messages` | Send on a booking | D |
| POST | `/attachments` | Upload attachment (base64) | D |

**Thread entity (probe):** `id, title, provider, is_closed,
ota_message_thread_id, message_count, last_message, last_message_received_at,
inserted_at, updated_at, meta`. `provider` is the OTA name.
`last_message` is itself an OBJECT (`{message, sender, inserted_at,
attachments}`), not a string — extract `.message` for the text
preview.

**Message entity (probe):** `id, message, sender (guest|property|system),
attachments, inserted_at, updated_at, meta` (inquiry details when
applicable). On BDC sends the response also includes
`relationships.user.data.id`; on AirBNB sends the `relationships`
key may be absent.

**Send body (`POST /message_threads/:id/messages`)** — probe-confirmed
2026-04-26 against an active AirBNB thread + a previously-closed BDC
thread:

```json
{ "message": { "message": "<plain text body>" } }
```

Same wrapper-singular pattern as `/reviews/:id/reply`
(`{reply: {reply}}`) and `/reviews/:id/guest_review`
(`{review: {…}}`). Channex returns the created message entity in
`data` on 200. No `idempotency-key` header is honored (silence on
docs + probe); callers must dedupe on their side.

**Gating:** **requires the `channex_messages` application installed on
the property.** Without it: **403 Forbidden**. For OTAs that don't
support messaging via the channel manager (e.g. Expedia Affiliate
Network): **422 Unprocessable Entity**. See Applications below.

## Webhooks — `/webhooks`

| Method | Path | Purpose | Status |
|---|---|---|---|
| GET | `/webhooks` | List (paginated) | P |
| GET | `/webhooks/:id` | Detail | D |
| POST | `/webhooks` | Create | D |
| PUT | `/webhooks/:id` | Update | D |
| DELETE | `/webhooks/:id` | Delete | D |
| POST | `/webhooks/test` | Test delivery | D |

**Create body:**
```json
{ "webhook": {
  "callback_url": "https://your-app/api/webhooks/channex",
  "event_mask": "booking_new,booking_modification,booking_cancellation",
  "property_id": "<uuid or null>",
  "is_global": false,
  "is_active": true,
  "send_data": true,
  "headers": {},
  "request_params": {},
  "protected": false
} }
```

Set `property_id: null` and `is_global: true` for account-wide webhooks.

**event_mask separator:** docs show `;` (semicolon). Live account uses
`,` (comma). Both appear to be accepted. See quirks #4.

**Event taxonomy (full list):**
- ARI: `ari`
- Bookings: `booking`, `booking_new`, `booking_modification`,
  `booking_cancellation`, `booking_unmapped_room`,
  `booking_unmapped_rate`, `non_acked_booking`
- Messaging: `message`, `inquiry`, `reservation_request`,
  `accepted_reservation`, `declined_reservation`, `alteration_request`
- Reviews: `review`, `updated_review`
- Sync: `sync_error`, `sync_warning`, `rate_error`
- Channels: `new_channel`, `updated_channel`, `disconnected_channel`,
  `disconnect_listing`, `activate_channel`, `deactivate_channel`
- Wildcard: `*` — subscribe to everything

**Payload envelope (all events):**
```json
{ "event": "<type>", "property_id": "<uuid>", "user_id": null,
  "timestamp": "<ISO>", "payload": { ... } }
```

Per-event payload shapes in `domain-concepts.md`. No cryptographic
signature — authenticate by pinning the `callback_url` to a secret path
or using a custom `headers` secret and verifying server-side.

## Applications — `/applications`

| Method | Path | Purpose | Status |
|---|---|---|---|
| GET | `/applications` | List available apps (catalog) | P |
| GET | `/applications/installed` | List apps installed on account | P |
| POST | `/applications/install` | Install an app to a property | D |
| DELETE | `/applications/:installation_id/uninstall` | Uninstall | D |

**GET /applications (probe, 2026-04-24):** returns 13 apps in catalog
including `channex_messages` ($7/mo — covers **both Messages + Reviews**),
`booking_crs`, `channex_payments`, `channex_pci`, `stripe_tokenization`,
`pricelabs`, `room_price_genie`, `make_com`, `zapier`, `mews`, `apaleo`,
`vhp`, `authorize_net`.

**GET /applications/installed response (probe):**
```json
{ "data": [ {
  "id": "<installation_id>",
  "type": "application_installation",
  "attributes": {
    "id": "<same>",
    "application_code": "channex_messages",
    "application_id": "<app_uuid>",
    "property_id": "<uuid>",
    "settings": {},
    "relationships": { ... }
  }
} ] }
```

**`is_active` field is absent from live responses** despite docs claiming
it exists. Treat "installed" = "appears in the response". See quirks #12.

## Channel Codes — reference doc

`channel-codes.md` enumerates Channex's OTA identifier strings:
`AirBNB, BookingCom, Expedia, Agoda, VRBO, TripAdvisor, Ctrip, HomeAway,
Hotelbeds, MakeMyTrip, Goibibo, …` Use the exact casing — `BookingCom`
is one word with mid-cap B; `AirBNB` is all-caps BNB.

## Out of scope (add when first used)

Groups, Group Users, Property Users, Photos, Policies, Facilities, Taxes,
Availability Rules, Payments/Stripe Tokenization, Booking CRS (as a
create-bookings source — differs from the channel-manager flow),
`/api-reference.md` (envelope + error conventions — read when you hit
unexpected responses), `/rate-limits.md`, `/property-size-limits.md`,
`/channel-iframe.md`.
