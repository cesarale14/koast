# Channex Domain Concepts

Mental models for the concepts that make the API make sense. Read these
before writing integration code.

## What a channel manager actually does

A channel manager is middleware between a **PMS** (the system where the
host lives) and **N OTAs** (Airbnb, Booking.com, Vrbo, Expedia, Agoda,
…). The PMS speaks one unified API; the channel manager translates that
into each OTA's native protocol and back.

```
          ┌─────────┐   unified Channex API   ┌─────────┐
          │   PMS   │ ←───────────────────→  │ Channex │
          └─────────┘                         └────┬────┘
                                                   │ per-OTA protocols
                                ┌──────────┬───────┼────────┬──────────┐
                                ▼          ▼       ▼        ▼          ▼
                             Airbnb    BDC      Vrbo    Expedia    Agoda
```

Inbound (bookings, messages, reviews): OTAs push to Channex; Channex
normalizes and delivers to the PMS via webhooks or the
`/booking_revisions/feed` polling endpoint.

Outbound (availability, rates, restrictions): PMS writes to Channex;
Channex fans out per OTA, handling OTA-specific quirks (BDC wants
availability counts at the room-type level; Airbnb uses rate plans; etc).

Channex's value is taking N×M integrations and turning them into N+M.

## The property → room_type → rate_plan hierarchy

```
 Property
   └── RoomType (count_of_rooms, capacity, occ_*)
        └── RatePlan (linked via rate_plan.room_type_id)
             └── (optional) Derived RatePlan via parent_rate_plan_id
```

- A **Property** is an accommodation unit (or hotel). Has address,
  currency, settings, policies.
- A **Room Type** is a unit kind — "2BR Villa" or "Queen Deluxe". Owns
  the inventory count (`count_of_rooms`) and occupancy rules. For
  vacation rentals it's usually 1 room_type per property with
  `count_of_rooms=1`.
- A **Rate Plan** is a priceable unit. Hangs off a room type. Has
  weekday-indexed restriction arrays (min stay, CTA/CTD, etc) and
  per-occupancy pricing.

**Channels attach to rate plans, not to properties.** One active channel
per rate plan. If you want "Airbnb and Booking.com and Vrbo on this
property", you need at least one rate plan per OTA (or one shared rate
plan with derived per-channel markups).

## Parent / derived rate plans

A rate plan with `parent_rate_plan_id` set inherits from its parent.
Inheritance is per-attribute via the `inherit_*` booleans:
`inherit_rate, inherit_min_stay_arrival, inherit_min_stay_through,
inherit_max_stay, inherit_closed_to_arrival, inherit_closed_to_departure,
inherit_stop_sell, inherit_availability_offset, inherit_max_availability`.

`rate_mode` controls how child pricing is computed:
- `manual` — child sets its own rate.
- `derived` — child inherits primary-occupancy rate from parent.
- `cascade` — child inherits per-occupancy from parent.
- `auto` — computed from `auto_rate_settings`.

A "slave rate" / "child rate" in Channex parlance is a derived plan with
`inherit_rate: true`. **Direct writes to a slave rate are rejected with
`RATE_IS_A_SLAVE_RATE`.** Always find the parent (traverse
`parent_rate_plan_id` up to root) and write there.

`rate_plans/options` endpoint returns a lightweight list — useful for
dropdowns without pagination.

## Bookings and the three-ID problem

A single booking passes through **three different identifier systems**:

| Layer | Field on `/bookings` | Example | Stable? |
|---|---|---|---|
| Channex internal | `booking_id` (UUID) | `f7a3391d-…` | stable across revisions |
| OTA confirmation | `ota_reservation_code` | Airbnb `HM3B9J5EAS`, BDC `6385131611` | stable for the booking |
| OTA iCal UID | (not on `/bookings` — only on OTA iCal feed) | `1418fb94e984-…@airbnb.com` | stable for the booking |
| Channex composite | `unique_id` | `ABB-HM3B9J5EAS`, `BDC-6385131611` | prefix + ota_reservation_code |

These are **not interchangeable**. If your PMS stores bookings via iCal
sync, the id will be the `@airbnb.com` format. If your PMS stores via
Channex's `/booking_revisions/feed` (recommended), you get the Channex
UUID, the HM-code, and the composite.

Cross-referencing: the `/reviews` endpoint's `ota_reservation_id`
matches `/bookings.ota_reservation_code` — **not the iCal UID**. If you
resolve bookings-to-reviews by iCal UID you will get zero matches even
on properties with active guest reviews.

Channex also emits a `revision_id` on every revision of a booking. One
`booking_id` can have many `revision_id`s (new → modified → cancelled).
Always ack each revision, not just the first.

## Booking propagation: webhooks vs polling

Two delivery mechanisms:

1. **Webhooks** (`/webhooks`) — Channex pushes to your `callback_url`
   when events occur. Best for latency-sensitive flows (messaging,
   real-time dashboards). Requires a public HTTPS endpoint. No
   cryptographic signature — authenticate by secret path or custom
   headers.

2. **Polling feed** (`/booking_revisions/feed`) — your worker GETs
   unacknowledged revisions on a timer (15-minute cadence is common),
   ACKs each one after processing. Survives webhook delivery failures.
   **Unacked revisions re-appear for 30 minutes and then you get an
   email warning from Channex.**

Production systems typically run **both** — webhooks as the primary
path, polling as the reconciler. Webhook idempotency is on you; dedup
by `revision_id`.

## Applications and endpoint gating

Channex sells some capabilities as "Applications" that must be installed
on a property before their endpoints work. The catalog is at
`GET /applications`; installed apps are at `GET /applications/installed`.

**Key apps that gate endpoints:**
- `channex_messages` — gates `/message_threads` + `/reviews` + the
  reply/submit endpoints. This single app covers BOTH messaging AND
  reviews; the product name "Channex Messages & Reviews" makes that
  clear. $7/mo at probe time.
- `booking_crs` — enables Channex as a direct CRS booking source (not
  just a channel manager). Different integration path from the normal
  flow.
- `channex_pci` / `channex_payments` / `stripe_tokenization` — payment
  capture capabilities.

**Gating behavior:** without the required app, endpoints return **403
Forbidden** (per docs). For OTAs that simply don't support a capability
(e.g. Expedia Affiliate Network messaging), you get **422 Unprocessable
Entity**. You will **not** get a 404, which can be confusing.

The `application_installation` record on a property has
`application_code`, `application_id`, `settings` (usually `{}` when
unconfigured), and — per docs — `is_active`, though **the live endpoint
does not return `is_active`**. Treat "installed = present in the
response".

## Airbnb's two-sided review model

Airbnb pairs every host review with a guest review. You can only post a
host-review-of-guest in response to an incoming guest-review-of-property
you already received. Concretely:

- Channex emits the incoming review via `GET /reviews` with
  `ota: "AirBNB"`.
- POST `/reviews/:id/reply` writes your **public response** to the
  guest's review (visible on Airbnb).
- POST `/reviews/:id/guest_review` writes your **counter-review** (star
  ratings, public text, private feedback, tags, recommend-or-not). This
  is the "outgoing review". **Airbnb only.**

`:id` is the incoming review's Channex id in both cases. You cannot
create a standalone outgoing review — no incoming = no path.

**Booking.com does not support guest reviews.** No equivalent endpoint.
Hosts get reviewed on BDC; they don't review the guest.

## BDC peculiarities

Booking.com's data model differs from Airbnb's on several points; when
pushing restrictions to BDC specifically:

- **`availability: 0`** at the room-type level blocks a date. Use
  `POST /availability`.
- **`stop_sell: true` closes the entire property at BDC**, not just the
  date. Do not use it for per-date blocking.
- BDC requires rates for the full bookable window (today → 18+ months).
  Dates with $0 or missing rates produce "missing prices" warnings in
  the BDC extranet.
- BDC uses a **parent rate code** concept. Slave/child rates reject all
  writes — always target the parent.

These are operational rules. Wrap BDC writes in a safety helper (see
`operational-patterns.md`).

## Webhook event payload shapes

All events share an envelope:
```json
{ "event": "<type>", "property_id": "<uuid>", "user_id": null,
  "timestamp": "<ISO>", "payload": { ... } }
```

Per-event `payload`:

- `ari` → array of `{availability, booked, date, rate_plan_id,
  room_type_id, stop_sell}`
- `booking` / `booking_new` / `booking_modification` /
  `booking_cancellation` → `{booking_id, property_id, revision_id}`
- `booking_unmapped_room` / `booking_unmapped_rate` → `{booking_id,
  booking_revision_id}`
- `message` → `{id, message, sender, property_id, booking_id,
  message_thread_id, attachments, have_attachment}`
- `review` / `updated_review` → `{id, content, channel_id, ota,
  overall_score, booking_id, reviewer_name, received_at}`
- `sync_error` → `{channel, channel_id, channel_name, error_type,
  property_name}`
- `activate_channel` / `deactivate_channel` / `new_channel` /
  `updated_channel` / `disconnected_channel` → `{title, channel_id,
  ota_name}`

When `send_data: false` on the webhook config, you only get the
envelope — use `booking_id` / `revision_id` to fetch the full entity
yourself. Good for larger payloads or when you want to minimize
webhook-body-size on your ingress.

**Channex explicitly notes that webhook delivery order is not
guaranteed.** Design handlers to be idempotent and order-independent.
Dedup by `revision_id` (bookings), `id` (messages), or composite keys.

## Channel settings are per-OTA

The `channel.settings` object is an open schema that varies by OTA:

| OTA | Key fields |
|---|---|
| AirBNB | `tokens, token_invalid, scope, derived_option, mappingSettings` |
| BookingCom | `hotel_id, machine_account, allow_payout_*, tax_settings, mappingSettings` |
| VRBO | `password, sync_days, sync_logic, payout_type, derived_option` |

Do not attempt a unified settings view. Read per-OTA. The one field
that's reasonably consistent across OTAs is `mappingSettings` (how
room_type / rate_plan map to the OTA side), but even its shape differs.
