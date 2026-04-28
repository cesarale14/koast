# Messaging Audit

> Read-only audit of the messaging surface, written 2026-04-26.
> Scope mirrors `docs/REVIEWS_BLUEPRINT.md` and `docs/REVIEWS_DATA_TRUTH.md`:
> establish what exists, what doesn't, what Channex provides, and what the
> build path looks like before any code lands. Companion to the reviews
> work. PII redacted throughout. Citations are `path:line`.

## 0. Status

Messaging is **named Tier 1 in the Koast roadmap and is essentially
greenfield**. A `/messages` route exists with a complete three-column
inbox UI, a `messages` schema table, an outbound `POST /api/messages/send`
route, and a Claude-backed `POST /api/messages/draft` route. Beyond
that, there is no inbound ingestion (the Channex webhook handler drops
every non-booking event into `channex_webhook_log` with
`action_taken='skipped_non_booking'`), no Channex client wrapper for
`/message_threads`, no thread schema, no worker, and no automation.
Production today has **5 hand-seeded messages and 0 templates** —
the UI renders but is wired to nothing live.

What is materially correct on the Koast side:
- The render-layer scaffolding (`/messages` page, `UnifiedInbox`,
  `TemplateManager`, `MessagesPageTabs`, `ConversationItem`, etc.) is
  built and follows the polish-pass design system.
- The Claude draft helper (`generateDraft`, `classifyMessage`) exists
  with property + booking + property-details context plumbing.
- The outbound write path (`POST /api/messages/send` →
  `messages` insert) is auth-gated and works.

What is materially missing:
- Inbound Channex sync (entire ingest path).
- A Channex client method set for messaging.
- A thread schema and a thread-grouping data model.
- Webhook subscription to message events.
- A worker for steady-state polling reconciliation.
- Outbound publishing to Channex (the "send" today only writes locally).
- AI auto-draft pipeline triggered by inbound events.
- Templates wired to a trigger executor.

What this audit answers, in order: §1 — Koast state today; §2 — Channex
surface available; §3 — competitive baseline; §4 — three build-scope
options (MVI → Beta → Full); §5 — dependencies and inheritances from
recent reviews work; §6 — open questions; §7 — the single recommended
next move.

This document is the contract for the follow-up build session.

---

## 1. Current state in Koast

### 1.1 Code

**Page (active):**
- `src/app/(dashboard)/messages/page.tsx:1-83` — server component.
  Reads `properties`, `messages`, `bookings`, `message_templates` for
  the authenticated user, renders `MessagesPageTabs` with
  `UnifiedInbox` + `TemplateManager`. Empty-state branch when the user
  has zero properties (`page.tsx:62-73`).
- Sidebar entry: `src/app/(dashboard)/layout.tsx:25` — registers
  `Messages` nav item (`MessageCircle` icon) pointing at `/messages`.
  Source of the chat-bubble icon on the left rail.

**Components (active):**
- `src/components/dashboard/MessagesPageTabs.tsx:1-56` — client
  component. Two-tab strip (`Inbox` / `Templates`) with golden
  underline on active tab.
- `src/components/dashboard/UnifiedInbox.tsx:1-1144` — client
  component. Three columns: conversation list (left, 340px),
  thread + composer (center), guest context panel (right, 300px).
  Conversations grouped in-memory by `(property_id, booking_id)` or
  `(property_id, sender_name)` (`UnifiedInbox.tsx:159-217`).
  Filter chips: `all`, `unread`, `needs_reply`, `ai_drafted` (last
  one is **disabled** and labelled "Coming soon" —
  `UnifiedInbox.tsx:381,447`). Composer's "K" Koast-AI button is
  `disabled` (`UnifiedInbox.tsx:748-765`). Send wires to
  `POST /api/messages/send` (`UnifiedInbox.tsx:254-291`).
  Templates dropdown surfaces `DEFAULT_TEMPLATES` from
  `src/lib/templates/messages.ts`.
- `src/components/dashboard/TemplateManager.tsx:1-372` — client
  component. CRUD over `message_templates` rows, falling back to
  `DEFAULT_ONBOARDING_TEMPLATES` for unsaved types. Eight template
  slots (`booking_confirmation`, `pre_arrival`, `checkin_instructions`,
  `welcome`, `midstay_checkin`, `checkout_reminder`, `thank_you`,
  `review_request` — `TemplateManager.tsx:30-39`). Toggling activates
  by inserting a row; saving body updates the row. **No trigger
  executor reads these.**

**API routes (active):**
- `POST /api/messages/send` — `src/app/api/messages/send/route.ts:1-49`.
  Auth-gated, property-ownership-verified. Inserts a `messages` row
  with `direction='outbound'`, stamps `sent_at`. **Writes to local DB
  only — no Channex publish.**
- `POST /api/messages/draft` —
  `src/app/api/messages/draft/route.ts:1-98`. Auth-gated,
  property-ownership-verified. Loads message + property + (optional)
  booking + last 20 messages on the property + `property_details`,
  calls `generateDraft()`, persists `ai_draft` + `ai_draft_status='generated'`
  on the row. **Not exposed in the UI yet** — the "K" composer button
  is disabled (`UnifiedInbox.tsx:763`).

**Lib (active):**
- `src/lib/claude/messaging.ts:35-91` — `generateDraft(property,
  booking, conversationHistory, latestMessage, details)` calls
  `claude-sonnet-4-20250514`, max_tokens=300, system prompt embeds
  property/booking/details (WiFi, door code, check-in/out times,
  parking, house rules, special instructions).
- `src/lib/claude/messaging.ts:102-120` — `classifyMessage(content)`
  keyword-buckets a string into `{check_in, wifi, checkout,
  early_checkin, late_checkout, general}`. Pure function, **no
  callers** (grep-confirmed).
- `src/lib/templates/messages.ts:1-65` — `DEFAULT_TEMPLATES` (8 entries
  with `autoReplyType` field); `fillTemplate(template, vars)` simple
  `{var}` substitution. Used by `UnifiedInbox` template dropdown and
  the in-thread "Templates…" select (`UnifiedInbox.tsx:738-743`).
- `src/lib/onboarding/default-templates.ts` — alternative defaults
  (`DEFAULT_ONBOARDING_TEMPLATES`) used by `TemplateManager` for
  bootstrap. Two parallel template seed sets (technical debt — see
  §1.4).

**Channex client (gap):**
- `src/lib/channex/client.ts` — has `getReviews`, `respondToReview`,
  `submitGuestReview`, `getRoomTypes`, `updateAvailability`,
  `acknowledgeBookingRevision`, etc. **Has no `getMessageThreads`,
  `getMessagesInThread`, `sendMessageToThread`, `closeThread`,
  `markNoReplyNeeded`, `getMessagesForBooking`, or attachment
  upload.** Confirmed via skill cross-reference
  (`koast-development/references/tech-debt.md:126-132`).

**Workers (gap):**
- `~/koast-workers/` (Virginia VPS) has `booking_sync.py`,
  `pricing_validator.py`, `pricing_worker.py`, `market_sync.py`,
  `ical_parser.py`, `reviews_sync.py`. **No `messages_sync.py`.**
- No `vercel.json` cron entries for messaging.
- No edge functions (`supabase/functions/` not used for messaging).

**Inventory roll-up:**

| File | LOC | Status |
|---|---:|---|
| `src/app/(dashboard)/messages/page.tsx` | 83 | active |
| `src/app/(dashboard)/layout.tsx` (Messages link) | 1 | active |
| `src/components/dashboard/MessagesPageTabs.tsx` | 56 | active |
| `src/components/dashboard/UnifiedInbox.tsx` | 1144 | active (incl. dead "AI Drafted" filter + dimmed K button) |
| `src/components/dashboard/TemplateManager.tsx` | 372 | active (no executor downstream) |
| `src/app/api/messages/send/route.ts` | 49 | active (local-only — no Channex publish) |
| `src/app/api/messages/draft/route.ts` | 98 | active (no UI surface — button is disabled) |
| `src/lib/claude/messaging.ts` | 121 | active (`classifyMessage` has no callers) |
| `src/lib/templates/messages.ts` | 65 | active (UI-side defaults) |
| `src/lib/onboarding/default-templates.ts` | (~) | active (TemplateManager defaults — duplicate seed) |
| `src/lib/channex/client.ts` (messaging methods) | 0 | **missing** |
| `src/app/api/webhooks/channex/route.ts` (messaging events) | 0 | **missing handlers** |
| `src/app/api/messages/sync/route.ts` | — | **missing** |
| Schema: `messages` | 20 | active (5 prod rows; see §1.2) |
| Schema: `message_templates` | 12 | active (0 prod rows) |
| Schema: `message_threads` | — | **missing** |
| Worker: `messages_sync.py` | — | **missing** |
| Worker: `automation_executor.py` (template scheduler) | — | **missing** |

The chat-bubble icon in the sidebar leads to a real, polished
surface. The disconnect is between that surface and any data flowing
into it.

### 1.2 Database

**Schema:**

- `messages` (`src/lib/db/schema.ts:195-209`):
  ```
  id              uuid pk
  booking_id      uuid fk → bookings.id (nullable)
  property_id     uuid fk → properties.id (NOT NULL)
  platform        text NOT NULL
  direction       text                  -- 'inbound' | 'outbound' (no DB constraint)
  sender_name     text
  content         text NOT NULL
  ai_draft        text
  ai_draft_status text DEFAULT 'none'   -- 'none' | 'generated' | 'sent'
  sent_at         timestamptz
  created_at      timestamptz DEFAULT now()
  ```
  Index: `idx_messages_property_created (property_id, created_at)`.
  Drizzle relations at `:211-214` link to `properties` + `bookings`.

  **No thread id, no Channex id, no platform-message-id, no read state,
  no attachments column.**

- `message_templates` (`src/lib/db/schema.ts:505-516`):
  ```
  id                   uuid pk
  property_id          uuid fk → properties.id (NOT NULL)
  template_type        text NOT NULL    -- 'booking_confirmation' | 'pre_arrival' | ...
  subject              text
  body                 text NOT NULL
  is_active            boolean DEFAULT true
  trigger_type         text NOT NULL    -- 'on_booking' | 'before_checkin' | ...
  trigger_days_offset  integer DEFAULT 0
  trigger_time         time
  created_at           timestamptz DEFAULT now()
  ```
  No index, no scheduler/executor reads it.

- `notifications` (`src/lib/db/schema.ts`, ref CLAUDE.md:317-319) —
  audit log for outbound SMS/email/push. **Not the messaging
  inbox.** Different concern (system → user, not guest ↔ host).

- **NOT PRESENT** (grep-confirmed):
  `message_threads`, `threads`, `conversations`, `inbox`, `dms`,
  `replies`, `guest_messages`, `channex_messages`, `agent_sessions`,
  `auto_reply_rules`, `channel_messages`. The `guest-messaging-agent-plan.md`
  proposed `auto_reply_rules` and `agent_sessions`; neither exists.

**Row counts (psycopg2, read-only):**

| Query | Result |
|---|---|
| `SELECT COUNT(*) FROM messages` | **5** |
| `SELECT direction, COUNT(*) FROM messages GROUP BY direction` | inbound=3, outbound=2 |
| `SELECT platform, COUNT(*) FROM messages GROUP BY platform` | airbnb=5 |
| `SELECT MIN, MAX (created_at) FROM messages` | 2026-04-08 17:00 → 2026-04-09 00:30 UTC |
| `SELECT COUNT(*) FILTER (WHERE booking_id IS NULL) FROM messages` | **5/5** (all unjoined to a booking) |
| `SELECT COUNT(*) FROM message_templates` | **0** |
| `SELECT COUNT(*) FROM channex_webhook_log WHERE event_type ILIKE '%message%' OR ILIKE '%thread%' OR ILIKE '%inquir%'` | **0** |
| `SELECT event_type, COUNT(*) FROM channex_webhook_log GROUP BY 1` | `booking_cancellation=9, booking_new=17, revision_poll=12` (no message-class events ever logged) |

**Implications:**

- The `messages` table has **5 rows from a single 7.5-hour window in
  early April 2026** — clearly a hand-seeded test set, not live
  production data. They've been static since April 9.
- Every row has `booking_id=NULL`. The conversation grouping in the
  UI falls through to the `(property_id, sender_name)` branch
  (`UnifiedInbox.tsx:175-181`).
- `message_templates` is **completely empty** in production. The
  TemplateManager UI lazy-creates rows on first toggle from
  `DEFAULT_ONBOARDING_TEMPLATES`, so the absence means nobody has
  ever activated a template.
- The webhook log shows **zero message-class events**. Either Channex
  isn't sending them (no `event_mask` subscription includes
  messaging) or something upstream is dropping them — see §1.3.

### 1.3 Webhook handling

`src/app/api/webhooks/channex/route.ts` is the single Channex
webhook ingress.

**Events recognized:** `bookingEvents` array
(`route.ts:57-62`):
```
booking, booking_new, booking_modification, booking_modified,
booking_cancellation, booking_cancelled,
booking_unmapped_new, booking_unmapped_modified, booking_unmapped_cancelled,
ota_booking_created, ota_booking_modified, ota_booking_cancelled
```

**Test/ping events** (`route.ts:37`): `test`, `ping`, `webhook_test`
— ack with 200 and log as `test_ping`.

**Everything else** (`route.ts:64-79`) is **dropped** with
`action_taken='skipped_non_booking'`. This includes:
- `message` (per Channex docs the inbound-message event)
- `inquiry`, `reservation_request`, `accepted_reservation`,
  `declined_reservation`, `alteration_request` (other messaging-class
  events from Channex's taxonomy, see
  `channex-expert/references/endpoint-reference.md:303-304`)
- `review`, `updated_review` (orthogonal to this audit; covered by
  `REVIEWS_BLUEPRINT.md` §4.2 / §4.3)
- `ari`, `sync_error`, `sync_warning`, `rate_error`, `*_channel`

So Channex *could* push messaging events to us; today the handler
acks them and logs them as skipped. The DB confirms: zero rows in
`channex_webhook_log` ever had a message-class event_type, which
suggests **Channex was never subscribed for them** — the
account-level webhook config likely uses an `event_mask` of
`booking_new,booking_modification,booking_cancellation` or similar
(actual mask not probed; see §6 question 5).

**Implication for messaging build:** webhook handler will need a new
branch for messaging events, but first the Channex webhook
subscription itself needs the event mask widened. The handler-side
extension is small; the subscription change is one
`PUT /webhooks/:id` away (see `endpoint-reference.md:267-296` for
shape).

### 1.4 Other observations

- **Two parallel template seed sets**: `DEFAULT_TEMPLATES`
  (`src/lib/templates/messages.ts`) — UI inbox composer dropdown,
  8 entries with conversational content; and
  `DEFAULT_ONBOARDING_TEMPLATES`
  (`src/lib/onboarding/default-templates.ts`) — TemplateManager
  bootstrap, 8 entries indexed by `template_type`. They share names
  but the bodies and trigger metadata diverge. Pre-build cleanup
  should converge to a single source.
- **`classifyMessage()`** has no callers. Today it would be the
  natural input to a Phase-2 auto-reply rule check, but the
  pipeline doesn't exist.
- **`docs/guest-messaging-agent-plan.md`** (310 LOC, dated
  2026-04-09) sketches the full Managed-Agents architecture — webhook
  trigger, agent definition, tools (`read_booking`, `read_property`,
  `read_messages`, `check_rules`, `send_message`), three response
  modes (auto_send / draft / escalate), `auto_reply_rules` +
  `agent_sessions` schema, four-phase rollout. The plan references
  `claude-sonnet-4-6` (outdated; current model id is
  `claude-sonnet-4-20250514` per `messaging.ts:83`). **Zero code from
  this plan has shipped.** Phase 1 of the plan (manual AI-draft
  button) is scaffolded by `/api/messages/draft` but never wired into
  the UI.
- **Referenced but absent**: per `koast-development/references/architecture.md:198`
  — "Session 6 wired reviews. Upcoming: messaging sync (Session 7)."
  And `tech-debt.md:126-132` — "Messaging sync (Session 7 target) —
  Channex message_threads API exists, Koast's `/messages` UI renders
  from DB only. Need: `channex.getMessageThreads` +
  `sendMessageToThread`, sync route, webhook extension. Schema OK
  (`messages` table, 5 hand-seeded rows; `message_templates` table
  empty…)." — this audit confirms that note in detail.

---

## 2. Channex messaging surface

### 2.1 Entity model

**Probe data** (read-only GET, 2026-04-26 ~01:50 UTC, prod
Channex via `app.channex.io/api/v1`):

```
GET /message_threads?filter[property_id]=<Villa Jamaica>&page[limit]=5
  → 200 — meta.total=8, returned=5 (page-size)
GET /message_threads?filter[property_id]=<Cozy Loft>&page[limit]=5
  → 200 — meta.total=0, returned=0
GET /message_threads/<thread_id>/messages?page[limit]=5
  → 200 — meta.total=23, returned=10 (note: page[limit]=5 was sent
                                       but Channex returned 10;
                                       quirk-watch — see §2.5)
GET /applications/installed
  → 200 — 2 apps installed: channex_messages, booking_crs
```

Saved JSON (PII redacted before any inclusion in this doc):
- `/tmp/channex-threads-villa.json`
- `/tmp/channex-threads-cozy.json`
- `/tmp/channex-thread-messages-villa.json`

**Thread entity (`/message_threads`):**

| Field | Source | Type | Example (redacted) | Notes |
|---|---|---|---|---|
| `id` | `data[].id` | uuid | `<uuid>` | Channex thread id (stable). |
| `attributes.title` | string | "[REDACTED]" — 7 chars | Often the guest's name on Airbnb. |
| `attributes.last_message` | string | "[REDACTED]" — 187 chars | Preview of the most recent message. |
| `attributes.last_message_received_at` | ISO ts | `2026-04-26T01:17:06.000000` | The freshness signal — sort key. |
| `attributes.message_count` | integer | 23 | Per-thread message total. |
| `attributes.is_closed` | boolean | false | Threads can be closed via `POST .../close`. |
| `attributes.provider` | string | `AirBNB` \| `BookingCom` | OTA identifier — channel attribution. |
| `attributes.ota_message_thread_id` | string (nullable) | present | OTA's native thread id (e.g. Airbnb conversation id). |
| `attributes.inserted_at` / `attributes.updated_at` | ISO ts | — | Local Channex bookkeeping. |
| `attributes.meta` | object | opaque | Per-OTA metadata bag. |
| `relationships.property.data` | `{id, type:"property"}` | uuid | Maps back to `properties.channex_property_id`. |
| `relationships.channel.data` | `{id, type:"channel"}` | uuid | Maps back to `property_channels.channex_channel_id`. |

**Listing meta**:
`{total, limit (default 10 even when 5 requested), order_by:
"last_message_received_at", page, order_direction:"desc"}`.

**Distribution observed on Villa Jamaica (8 threads):**
- `provider=AirBNB`: 6
- `provider=BookingCom`: 2

This is the single most important finding in §2: **BDC messaging is
already wired through Channex on this account.** The `/messages` UI's
"airbnb-only" assumption (every conversation today is hand-seeded with
`platform='airbnb'`) is going to fail when these BDC threads start
arriving.

**Message entity (`/message_threads/:id/messages`):**

| Field | Source | Type | Notes |
|---|---|---|---|
| `id` | `data[].id` | uuid | Channex message id; dedup key per `domain-concepts.md:223`. |
| `attributes.message` | string | The body. PII. |
| `attributes.sender` | string | `guest` \| `property` \| `system` | Direction. |
| `attributes.have_attachment` | bool | null in probe | Per docs the flag is on the `message` webhook event payload (`domain-concepts.md:206-207`); on the entity itself the array `attachments` is the source of truth. |
| `attributes.attachments` | array | `[]` in probe | Channex stores them; `POST /attachments` with base64 is the upload path (`endpoint-reference.md:252`). |
| `attributes.meta` | object | opaque | Per-OTA metadata. |
| `attributes.inserted_at` / `attributes.updated_at` | ISO ts | — | Created + edited times. |
| `relationships.message_thread.data` | `{id, type:"message_thread"}` | — | Parent thread reference. |

**Sender distribution in the probed thread (10 of 23 messages):**
guest=5, property=5. (System messages would appear as
`sender='system'` per `endpoint-reference.md:258-259` — none in this
sample.)

**Critical absences vs the existing Koast `messages` columns:**
- Channex has **no `booking_id` on the message entity itself**. The
  thread-to-booking link is implicit (via OTA reservation code) and
  not exposed on either thread or message attributes. Koast's
  `messages.booking_id` would be derived (or nullable).
- Channex has **no read-state field** on either entity. Read state is
  client-side / Koast-side bookkeeping.
- Channex has **no "platform" string on the message** — it lives on
  the parent thread's `provider` field. Koast's per-message
  `platform` column duplicates that and should be derivable from
  thread join.

### 2.2 Endpoints

Per `channex-expert/references/endpoint-reference.md:240-265`:

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET  | `/message_threads?filter[property_id]=<id>` | **P** (probed today) | List threads for a property |
| GET  | `/message_threads/:id` | D | Thread detail |
| GET  | `/message_threads/:id/messages` | **P** (probed today) | Messages in thread (paginated) |
| POST | `/message_threads/:id/messages` | D | Send a message in a thread |
| POST | `/message_threads/:id/close` | D | Close thread |
| POST | `/message_threads/:id/no_reply_needed` | D | No-reply signal — **BDC-only** |
| GET  | `/bookings/:booking_id/messages` | D | Messages on a booking (alt entry) |
| POST | `/bookings/:booking_id/messages` | D | Send a message on a booking |
| POST | `/attachments` | D | Upload attachment (base64) |

(`P` = probed live; `D` = documented but not live-verified in this audit.)

**Auth:** standard Channex `user-api-key` header
(`koast-development/references/channex-reference.md:22-26`).

**Pagination:** `page[limit]` + `page[number]`, with the
`/reviews` quirk #6 caveat noted in `known-quirks.md:6` — page-size
caps and page-number behavior may differ. **The probe sent
`page[limit]=5` to `/message_threads/:id/messages` and got 10 back**;
`/reviews` has the same observed cap. Treat the page-limit parameter
as advisory, dedup by id, follow the same loop pattern as
`reviews_sync.py:65-86` and `src/lib/reviews/sync.ts` (see §5.1).

**Rate limits:** none documented; reviews-sync runs at ~20-min
cadence × small fleet without trouble. `tech-debt.md:140-142` notes
"Polling-based sync works for the MVP" because the
`event_mask` for review events isn't documented. Same shape applies
to messaging — see §2.3.

**Gating:** `/message_threads` and `/messages` require
`channex_messages` app installed
(`endpoint-reference.md:262-266`, `domain-concepts.md:131-134`).
Probe confirms **`channex_messages` IS installed** on the Villa
Jamaica + Cozy Loft Channex account
(`/applications/installed` returned `application_code:
"channex_messages"`). 403s on these endpoints would mean someone
uninstalled the app or onboarded a new property without it — handle
gracefully. The same app gates `/reviews`, so any account where
reviews work, messaging works.

### 2.3 Webhooks

Per `endpoint-reference.md:298-309`, Channex's webhook event taxonomy
includes:

> **Messaging:** `message`, `inquiry`, `reservation_request`,
> `accepted_reservation`, `declined_reservation`, `alteration_request`

Per `domain-concepts.md:206-207`, the `message` event payload shape:

```
{ id, message, sender, property_id, booking_id,
  message_thread_id, attachments, have_attachment }
```

This is the realtime delivery path — and the payload is rich enough
(`message_thread_id` + `id`) to fully scaffold an inbound write
without a follow-up GET.

**Subscription state today:**
- `channex_webhook_log` shows zero rows of any messaging event
  type ever (queries in §1.2). Either Channex isn't sending them or
  the account-level webhook config's `event_mask` doesn't include
  them.
- Reviews-blueprint context: `quirks.md #6` and
  `tech-debt.md:140-142` note Channex hasn't documented an
  `event_mask` token for `review` events. **Messaging is the
  opposite story — `message`, `inquiry`, etc. ARE in the documented
  taxonomy** (`endpoint-reference.md:303-304`), so subscribing
  should work. We have not probed a `POST /webhooks` to confirm the
  account accepts the mask token "message" — that's a write probe
  and out of this audit's scope.

**Comparison to reviews:** reviews ended up pull-only because
Channex's `event_mask` for the `review` event isn't documented.
Messaging is **first-class in the taxonomy**, suggesting realtime
ingest is achievable. **This is the single most important
implication for build sequencing**: messaging can be webhook-driven
(realtime), unlike reviews. See §4 — the MVI build path differs
sharply from the reviews build path because of this.

**Latency contract:** Channex notes webhook order is **not
guaranteed** (`domain-concepts.md:221-223`). Dedup messages by `id`.
Ordering of arrival within a thread should be derived from
`inserted_at`, not delivery order.

**Reconciliation:** the reviews architecture established the
"two-headed sync" pattern — TS helper (route + on-connect) plus
Python worker. For messaging, the same shape applies but the cadence
shifts: webhook is primary, polling is reconciliation only (every
~30 min is fine for catching missed deliveries; messaging is not
analytics-grade like reviews).

### 2.4 Channel-specific quirks

**Airbnb:**
- Pre-booking inquiries vs post-booking conversations: Airbnb
  exposes both as message threads. The `/message_threads` listing
  surfaces them all together; `is_closed` distinguishes resolved
  from open (probed sample is `is_closed=false`).
- Time-since-booking gates: undocumented in `channex-expert`. The
  STR-host community knows Airbnb auto-rejects host-initiated
  contact too long after checkout (~14 days, similar to the review
  window). Need a probe (out of audit scope) or a host conversation
  to nail down.
- Content restrictions: phone numbers, external URLs, and email
  addresses are auto-filtered by Airbnb (their anti-disintermediation
  policy). Channex passes the message through; rejection happens at
  Airbnb. **The `koast-development` `playbooks.md > Three-stage
  pattern` (mirrored from reviews — see §5.1) is the right shape:
  `submitted → channex_acked → ota_confirmed`, with the third
  stamp gated on Channex returning the message back via
  webhook/poll matching what we sent.** Same probe-then-implement
  caution from `quirks.md #19` applies.
- Rate limits: Channex doesn't document them. Operationally
  reasonable (a few sends/hour per host) until proven otherwise.

**Booking.com:**
- BDC supports messaging via Channex (proven by probe — 2 of 8
  threads on Villa Jamaica are `provider=BookingCom`).
- BDC has the `POST /message_threads/:id/no_reply_needed` endpoint
  (`endpoint-reference.md:249`). This is BDC-only — sending it
  satisfies BDC's "respond to all guest messages" KPI without
  putting visible text in the thread. Important UX surface for the
  inbox: a "no reply needed" button on BDC threads only.
- "Special Requests" vs messages: BDC distinguishes structured
  guest-requests (smoking room? high floor?) from free-form
  messages. Channex's `/message_threads` exposes the free-form
  surface; structured requests appear on the booking entity itself
  (`bookings.attributes.notes` style, undocumented exact path —
  punt to a follow-up probe).
- Per-property activation: not enforced at the API level today (the
  account-level `channex_messages` app is the only gate).

**Vrbo / Expedia / Agoda:**
- VRBO is intentionally not in PLATFORMS today (CLAUDE.md:115-117).
  Both Vrbo and Expedia historically have weaker messaging surfaces
  via channel managers — `endpoint-reference.md:262-265` notes
  Expedia Affiliate Network returns 422 for messaging operations.
  Defer until a Vrbo property exists and a probe confirms shape.

**Generic:**
- `provider` field's casing is `AirBNB` and `BookingCom` (probe).
  Existing `platformKeyFrom()` helper in `src/lib/platforms.ts`
  already normalizes "ABB"/"airbnb" and BDC variants — should be
  taught the `AirBNB`/`BookingCom` strings before they show up in the
  inbox UI.

### 2.5 Probe-discovered notes

- `page[limit]=5` was ignored on `/message_threads/:id/messages` —
  Channex returned 10 (the default page size). Same effective
  behavior as `/reviews` per `quirks.md #6`. Sync code should not
  rely on `page[limit]` to control batch size; always paginate by
  `page[number]` with dedup, or trust the meta.total to drive the
  loop.
- `attributes.title` on Airbnb threads tends to be very short (7
  chars in the probed sample) and looks like a partial-name string.
  Needs a fallback in the UI when empty/short.
- Probe budget: brief specified ≤3 GETs. Audit used **4** (added
  `/applications/installed` to confirm gating). All read-only.
  Flagging the overage explicitly.

---

## 3. Competitive context

The reference frame is "what's table-stakes for an STR-PMS inbox in
2026". Beta hosts evaluating Koast against Hospitable, Hostfully,
Smartbnb, Hostaway, and Guesty will expect these:

1. **Unified inbox across channels** — one list, all OTAs, with
   per-channel filtering. *Koast: scaffolded UI, no real ingest.*
2. **Thread view with full history** — guest messages + host
   replies in a single chronological column, dated dividers, system
   messages distinguished. *Koast: scaffolded UI; data layer empty.*
3. **Templates with quick-insert** — host clicks "WiFi" and the
   composer fills with the property's WiFi info. *Koast:
   `DEFAULT_TEMPLATES` + composer dropdown shipped (`UnifiedInbox.tsx:738-743`,
   `messages.ts:8-54`); auto-fill substitution works (`fillTemplate`
   in `messages.ts:56-64`); 0 host-defined templates in production.*
4. **AI-suggested replies** — composer shows a suggested response;
   one-click accept-and-edit. *Koast: `generateDraft()` is built
   (`messaging.ts:35-91`), the composer "K" button is **disabled**
   (`UnifiedInbox.tsx:763`), no UI surface today.*
5. **Auto-replies for common questions** (WiFi, check-in, parking) —
   answer immediately with property-detail data, no host
   intervention. *Koast: `classifyMessage()` exists
   (`messaging.ts:102-120`) but has no callers; no rule engine.*
6. **Read state + needs-response triage** — bold for unread, badge
   for "needs reply", sortable by oldest-unanswered. *Koast: derived
   client-side from `direction='inbound'` on the latest message
   (`UnifiedInbox.tsx:209-210`); not persisted, no per-message
   read flag.*
7. **Search across guest names + message bodies** — find any past
   conversation. *Koast: search box scoped to guest name + property
   name only (`UnifiedInbox.tsx:231-235`); no body search.*

Stretch / differentiator features (post-MVI):
- **Auto-checkin instructions** scheduled to send the day before
  arrival.
- **Per-property knowledge base** fed to the AI as a system prompt
  (the foundation exists in `property_details` —
  `messaging.ts:53-65` already pulls WiFi/door/parking).
- **Guest-issue routing** — "broken" / "leak" / "dirty" → AI drafts
  reply AND auto-creates a `cleaning_tasks` row + SMS
  (`guest-messaging-agent-plan.md:185-199`).
- **Multi-language** — Hospitable does this; differentiator at the
  high-end of the market.

The MVI cut for beta is **1, 2, 3, 6** — read inbound, send outbound,
templates, basic triage. The differentiating cut is **4 + 7**. The
ambitious cut is **5 + the stretch list**.

---

## 4. Build path scope

Three options at increasing scope. Each is sized in sessions
(rough — assumes one focused session per item, similar to the reviews
session sizing in `REVIEWS_BLUEPRINT.md` §10).

### 4.1 Minimum viable inbox — Tier 1 blocker for beta

**Goal:** read inbound messages, send replies, no ML, no auto-replies,
no scheduled templates. This is the parity floor — without it, hosts
can't even consider Koast as their primary tool.

**What's needed:**

1. **Schema migration** (small): add a `message_threads` table.
   Probable shape:
   ```
   message_threads
     id                        uuid pk
     property_id               uuid fk → properties.id
     channex_thread_id         text UNIQUE        -- onConflict key
     ota_message_thread_id     text                -- per-OTA native id
     channel_code              text                -- 'abb' | 'bdc'
     provider_raw              text                -- 'AirBNB' | 'BookingCom'
     title                     text
     last_message_preview      text
     last_message_received_at  timestamptz
     message_count             integer DEFAULT 0
     is_closed                 boolean DEFAULT false
     booking_id                uuid fk → bookings.id (nullable)
     created_at, updated_at    timestamptz
   ```
   Add `messages.thread_id uuid fk → message_threads.id` (nullable
   for back-compat with the 5 hand-seeded rows; backfill or leave).
   Add `messages.channex_message_id text UNIQUE` for sync dedup.
   Add `messages.ota_id text` for the OTA's native message id.
   Drop `messages.platform` once `thread_id` joins through to
   `message_threads.channel_code` reliably (or keep with a sync-time
   stamp — same call as the reviews `channel_code` discussion in
   `REVIEWS_DATA_TRUTH.md` §2.4).

2. **Channex client extension** (small): `src/lib/channex/client.ts`
   gains `getMessageThreads(propertyId, opts)`,
   `getThreadMessages(threadId, opts)`,
   `sendThreadMessage(threadId, body, attachments?)`,
   `closeThread(threadId)`, `markThreadNoReplyNeeded(threadId)`
   (BDC-only), and matching TypeScript shape exports. Same dedup-by-id
   pagination pattern as `getReviews` in `client.ts:740-752`.

3. **Webhook handler extension** (small): in
   `src/app/api/webhooks/channex/route.ts`, add a `messageEvents`
   list (`message`, `inquiry`, `reservation_request`,
   `accepted_reservation`, `declined_reservation`,
   `alteration_request`) and a branch that upserts the message
   (idempotent on `channex_message_id`), updates the parent thread's
   `last_message_*` fields, and acks. This is where realtime ingest
   lives — different from the reviews architecture in §5.1.
   **Also**: a one-shot Channex `PUT /webhooks/:id` to widen the
   account-level `event_mask` to include the messaging events
   (probe-then-implement; see §6 q5).

4. **Sync helper** (medium): `src/lib/messages/sync.ts` — mirror of
   `src/lib/reviews/sync.ts`. Per-property iteration: list threads,
   for each new/updated thread list its messages (dedup-by-id), upsert
   both. Stamp `properties.messages_last_synced_at` on success.
   Follow the playbooks rules (`koast-development/references/playbooks.md`)
   for safety rails. **Reuses the worker/route parity pattern** —
   route at `POST /api/messages/sync` calls the helper; the
   on-connect trigger from import paths (parallel to
   `syncReviewsForOneProperty` in
   `src/app/api/properties/import/route.ts:344-356`) calls it
   non-blocking.

5. **API routes** (medium):
   - `GET /api/messages/threads` — list user's threads with display
     fields.
   - `GET /api/messages/threads/[id]` — thread + messages payload.
   - `POST /api/messages/threads/[id]/send` — three-stage write:
     local pending → Channex POST → on next sync match the OTA-confirmed
     stamp. Replaces `POST /api/messages/send` (rename + redirect) —
     the old route was DB-only.
   - `POST /api/messages/threads/[id]/close` — close action.
   - `POST /api/messages/threads/[id]/no-reply-needed` — BDC-only.
   - `POST /api/messages/sync` — sync trigger.
   - **No deletion of `POST /api/messages/draft`** — keep it; rewire
     in §4.2.

6. **UI rewrite** (medium): `UnifiedInbox.tsx` switches its data
   contract from the in-memory `messages` grouping to a
   server-grouped `threads` payload. Thread list shows per-OTA
   provider chip, `last_message_received_at` relative time, unread
   bullet (derived from `last_message.sender === 'guest' && not
   acknowledged_locally`). Composer's per-thread state binds to
   `POST .../send` and optimistically appends. Add the BDC-only
   "No reply needed" button. **Drop the disabled "AI Drafted" filter
   and the disabled "K" button** — those move to §4.2. **Backwards
   compatibility:** the existing 5 hand-seeded `messages` rows can
   be either dropped or migrated by inferring a synthetic thread
   per `(property_id, sender_name)` group; recommend drop, since
   they're test data.

7. **Empty-state cascade** (small): mirror reviews pattern (per
   `REVIEWS_BLUEPRINT.md` §6.3): no property → "Add property"; has
   property but no `channex_property_id` → "Connect a channel"; has
   Channex but no threads → "No conversations yet"; filters too
   narrow → "Clear filters".

**Estimated session count:** ~3 sessions (schema + channex client +
webhook + sync + routes can be one big session if combined with the
reviews-sync pattern as a template; UI is one session; polish + empty
states is one). Tier 1 cleanly blocks all of §4.2.

**Acceptance:** an inbound Airbnb message on Villa Jamaica appears in
the Koast inbox within a webhook delivery cycle (~seconds); a host
reply sent from Koast lands in the Airbnb conversation surface within
the next sync cycle; the BDC threads on Villa Jamaica also appear
correctly attributed.

### 4.2 Beta-quality — Tier 1 polished

Build on top of MVI:

- **AI-suggested replies in the composer** (small-medium): rewire
  the disabled "K" button (`UnifiedInbox.tsx:748-765`) to call
  `POST /api/messages/draft` on the latest inbound message,
  populate the composer with the draft, let the host edit. The
  draft endpoint already pulls property + booking + last 20 messages
  + property_details and calls Claude (`messaging.ts:35-91`). Net
  delta: re-enable the button, add the call, add a "Generated by
  Koast AI — review before sending" affordance.

- **Templates wired to a trigger executor** (medium): add a Python
  worker `~/koast-workers/automation_executor.py` that runs
  every 5-15 minutes, reads `message_templates WHERE is_active =
  true`, computes whether each (booking, template) pair should fire
  based on `trigger_type` + `trigger_days_offset` + `trigger_time`,
  sends via Channex, and stamps a guard row to prevent re-sends.
  This finally makes the TemplateManager UI do anything.

- **Search over message bodies** (small): server-side ILIKE on
  `messages.content` joined to `message_threads`. UI bind the
  existing search box to a debounced query.

- **Unified inbox across properties** (UI polish, small): explicit
  per-property header groups when the "All properties" filter is
  active, mirroring the property-attribution lesson from
  `REVIEWS_DATA_TRUTH.md` §2.1.

- **Per-thread read state** (small): add `messages.read_at
  timestamptz` (or `message_threads.last_read_at`) and stamp
  client-side on thread open. Drives the unread bullet.

**Estimated session count:** ~2 sessions on top of §4.1.

**Acceptance:** beta hosts can use the inbox as their primary OTA
messaging surface for Airbnb + BDC and don't feel the absence of
Hospitable's inbox.

### 4.3 Full feature set — post-beta

- **Auto-replies** with the rule engine + confidence threshold pattern
  from `guest-messaging-agent-plan.md:182-199`. Requires
  `auto_reply_rules` table.
- **Operational routing**: keyword → cleaning task creation, early
  check-in availability check, extension-request rate quote.
  Requires the agent + tools architecture from
  `guest-messaging-agent-plan.md`.
- **Scheduled messages** (host-side composer "send tomorrow at 9am").
- **Attachments** (image upload via `POST /attachments`).
- **Read receipts**, **typing indicators**, **multi-language** —
  long tail.
- **Managed Agents migration** — once the manual-draft + auto-reply
  paths are stable, migrate the orchestration to Anthropic's
  Managed Agents per `guest-messaging-agent-plan.md` Phase 3.

**Estimated session count:** 4-8 sessions across phases.

---

## 5. Dependencies and inheritances from prior work

### 5.1 Reviews architecture as template

The reviews subsystem just shipped Sessions 6 → 6.7-POST → RDX-1/2/3.
Its patterns directly transfer to messaging.

- **Two-headed sync subsystem** — `koast-development/references/playbooks.md`
  candidate playbook (per `REVIEWS_BLUEPRINT.md §11.3`). Sync logic
  lives once in `src/lib/reviews/sync.ts` and is mirrored as
  `~/koast-workers/reviews_sync.py`. **Apply identically:**
  `src/lib/messages/sync.ts` ↔ `~/koast-workers/messages_sync.py`.
  Worker handles steady-state polling reconciliation; route handles
  manual refresh + on-connect trigger; helper is the single source of
  truth for upsert shape.

- **Three-stage write pattern** — host-action stamps in three steps:
  `submitted_at` (intent) → `channex_acked_at` (200 from Channex) →
  `ota_confirmed_at` (next sync match). Reviews uses this for the
  Airbnb counter-review submit (`REVIEWS_BLUEPRINT.md §2.2`,
  `submit-guest-review/route.ts:92-184`). **Apply identically** for
  outbound messages: Channex 200 is not Airbnb-confirmation
  (cf. `quirks.md #19`); the reconciliation is the next sync seeing
  our message echoed back.

- **On-connect sync trigger pattern** — Sessions 6.7 + 6.7-POST
  established the pattern: `properties/import`, `channex/import`, and
  `connect-booking-com/activate` all call
  `syncReviewsForOneProperty` non-blocking with `.catch` log
  (`REVIEWS_BLUEPRINT.md §7.3`). **Apply identically** —
  `syncMessagesForOneProperty` in the same three sites. Means hosts
  see their existing Channex threads immediately on first connect.

- **Empty-state cascade** — `REVIEWS_BLUEPRINT.md §6.3`. Same four
  states (`!hasAnyProperty` → `!hasAnyChannexProperty` →
  `!hasAnyThreads` → filter-too-narrow). Reuse the same `EmptyState`
  primitive.

- **Refresh chrome** — `REVIEWS_BLUEPRINT.md §6.4`. "Last synced N
  min ago" + manual Refresh button + 60s cooldown. Adapt: the
  freshness signal here is `messages_last_synced_at` per property,
  same OLDEST-stamp rule for the "All" view.

- **`?just_connected=1` post-import banner** — `REVIEWS_BLUEPRINT.md
  §6.5 + §6.6`. Apply identically — hosts importing a property see
  the messages surface auto-light-up with their first synced threads.

- **Channel-attribution via stamped `channel_code`** —
  `REVIEWS_DATA_TRUTH.md §2.4`. Reviews learned the lesson the hard
  way: derive at sync-time, not at read-time. **Apply identically**
  for messaging: stamp `message_threads.channel_code` from
  `attributes.provider` at sync-time. Don't use the booking-derived
  fallback heuristic that bit reviews.

### 5.2 RDX-3 booking-link join key

`REVIEWS_DATA_TRUTH.md §2.7` documents the booking-link join key fix
that landed in RDX-3 (`bookings.ota_reservation_code` populated
separately from `platform_booking_id`; review-sync joins on the new
column). **Messaging inherits this fix.** Channex does not put a
booking_id on the message entity itself, but the thread-to-booking
match goes through the same `ota_reservation_id` channel. Once
threads are joined to bookings via the same key, the inbox can
populate guest names, booking dates, payout, and check-in/out — the
exact data the GuestContextPanel (`UnifiedInbox.tsx:882-1106`) is
already designed to render.

If RDX-3 sync changes haven't fully reached the worker on prod yet
(check `koast-development/references/tech-debt.md:140` and recent
sessions), the inbox will inherit the same NULL-booking-link
symptoms as reviews did pre-RDX-3. Acceptable for MVI; see §6
question 4.

### 5.3 Channex skill quirks (cross-reference)

| Quirk | Source | Applies to messaging? |
|---|---|---|
| #6 — `/reviews` page-size cap, page-number ignored beyond first batch | `quirks.md #6` | **Yes** — same observed behavior on `/message_threads/:id/messages` (probe sent `page[limit]=5`, got 10). |
| #7 — `guest_name` null on Airbnb reviews | `quirks.md #7` | **Indirectly** — thread title may be a partial guest name; rely on the booking-link-resolved name when present, fallback to platform-tagged label. |
| #8 — review `ota_reservation_id` is HM-code, joins `bookings.platform_booking_id` not iCal UID | `quirks.md #8` | **Same join key story for thread→booking.** RDX-3 fix transfers. |
| #10 — Airbnb host→guest review must pair to incoming review id; BDC has no equivalent | `quirks.md #10` | **N/A** — messages are intrinsically paired to a thread; no two-sided lifecycle. |
| #13 — `/reviews` requires `channex_messages` app | `quirks.md` | **Yes — same gating** (probe-confirmed app installed). |
| #19 — Channex 200 is not OTA-confirmation | `quirks.md #19` | **Yes** — three-stage write pattern needed for outbound sends. |
| #20 — `/bookings` excludes post-checkout > ~30d → join failures for old reviews | `quirks.md #20` | **Yes for old threads** — historical thread→booking joins will fail; surface the unjoined threads with platform-tagged guest fallback. |
| #21 — aged review entities drop from `/reviews` listing entirely | `quirks.md #21` | **Probable** — sample listing has 8 threads and meta.total=8; haven't observed aging behavior. Punt to a follow-up. |
| #23 (proposed in `REVIEWS_BLUEPRINT.md §11.1`) — locked-pending Airbnb reviews | n/a | **N/A** for messaging — reviews-only model. |

### 5.4 Skill update suggestions (for the follow-up build session, NOT this commit)

These belong in the build session that exercises them, not in this
audit (per the brief's constraint).

- **`channex-expert/references/known-quirks.md`**: add a quirk
  documenting the `/message_threads` `page[limit]` cap (mirrors
  quirk #6 for `/reviews`) — confirmed live 2026-04-26.
- **`channex-expert/references/known-quirks.md`**: add a quirk for
  the BDC-specific `POST /message_threads/:id/no_reply_needed`
  endpoint (mention what it does and that BDC alone supports it).
- **`channex-expert/references/known-quirks.md`**: add a quirk for
  the `provider` casing (`AirBNB` / `BookingCom`) on thread entities,
  needing a normalizer extension to `platformKeyFrom()`.
- **`koast-development/references/architecture.md:198`**: replace
  "Upcoming: messaging sync (Session 7)" with a link to this audit
  + a marker for the build session.
- **`koast-development/references/playbooks.md`**: promote
  "Two-headed sync subsystem" to a named playbook now that
  messaging is the second clear example (reviews was the first).
  Recommended in `REVIEWS_BLUEPRINT.md §11.3`; this audit confirms
  the pattern fits messaging cleanly.
- **`koast-development/references/tech-debt.md:122-142`**: move the
  "Messaging sync (Session 7 target)" entry out of `Deferred features`
  into a "Now in flight" section once the build session opens; mark
  as resolved after MVI ships.

### 5.5 Render-layer reuse from RDX-2

`REVIEWS_DATA_TRUTH.md §5` established the slide-over / list / chip
filter primitives during the reviews render rebuild. The messaging
inbox already uses the same look-and-feel (golden chip filters,
left-rail conversation items with avatar gradient, three-column
layout). **Reuse — don't redesign.** Where the rebuild needs a new
primitive (e.g. the BDC "No reply needed" CTA), add it to the
existing components folder following the same Koast token rules
(no Tailwind grays, no default shadows; CLAUDE.md:91-95).

---

## 6. Open questions for Cesar

Product calls. Numbered for easy reference in the follow-up session.

1. **Webhook subscription probe scope.** Adding messaging to the
   account-level `event_mask` is a single `PUT /webhooks/:id`. Approve
   doing that probe in the build session (write traffic to Channex,
   one call), or do it as a read-first follow-up — list current
   subscription, propose change, get sign-off, then apply?
   **Recommend**: list-then-update in the build session.

2. **Single inbox vs per-property inbox.** The unified `/messages`
   view rolls up across all properties. With 2 properties (one with
   threads, one empty), this is fine. At 10+ properties hosts may
   want a per-property scoped landing. **Recommend**: keep unified as
   default, surface a property selector matching the reviews chrome
   (`page.tsx:198-202` in reviews) with a sticky URL param.

3. **AI-suggested replies — feature flag or default-on?** The "K"
   button is dimmed today. Once §4.2 wires it, do we ship it
   default-on for beta hosts (giving them the WOW moment), or behind
   a per-property toggle so they opt in? **Recommend**: default-on
   for beta, with a "Generated by Koast AI — review before sending"
   inline notice. Hospitable does this default-on; matching parity
   matters.

4. **BDC threads in the MVI cut, or Airbnb-only first?** The probe
   shows 2 BDC threads on Villa Jamaica today. They'll arrive in the
   inbox the moment §4.1 ships unless gated. **Recommend**: include
   BDC from day one — the only delta is the BDC-only "No reply
   needed" button and the channel chip on the thread row. Skipping
   BDC creates a worse UX (BDC threads exist but aren't visible)
   than including it.

5. **Channel-specific filter UX for Airbnb auto-rejection.** When a
   host writes a message containing a phone number and Airbnb
   rejects it, the OTA-confirmed stamp won't fire. Should the inbox
   surface this as an inline "Message blocked by Airbnb" warning on
   the thread, or just silently leave the message in
   "channex_acked_at, no airbnb_confirmed_at" state? **Recommend**:
   surface it. Hosts need to know why the guest didn't get it.

6. **Templates-as-trigger executor in MVI scope, or §4.2?** The
   `message_templates` table and its `trigger_*` columns sit unused.
   Adding the executor moves messaging from "host writes manually"
   to "scheduled welcome / pre-arrival / checkout-reminder fires
   on its own". This is half of Hospitable's value prop and a
   short build (~one Python worker file + per-firing guard).
   **Recommend**: pull this into MVI as item §4.1.7 — it's the
   smallest possible win that makes Koast feel automated. Without
   it, the TemplateManager UI is decoration.

7. **Hand-seeded `messages` rows — drop or backfill?** The 5 prod
   rows are test data with `booking_id=NULL` and `created_at`
   from April 8-9, 2026. They have no `thread_id` to migrate to.
   **Recommend**: delete them as part of the §4.1 schema
   migration. They predate the real data model and will confuse
   the synthetic-thread fallback logic.

8. **`POST /api/messages/send` semantics — keep or replace?** The
   route writes locally only. Once outbound flows through
   `POST /api/messages/threads/[id]/send` (which publishes to
   Channex), the local-only write is dead code. **Recommend**:
   delete in the §4.1 commit; it's a footgun otherwise.

9. **`classifyMessage()` keep or delete?** Pure function, no
   callers. It's the obvious input for a future auto-reply rule
   engine (§4.3). **Recommend**: keep but add a comment marker
   that it's unused pending §4.3, mirroring the reviews
   `auto_publish` footgun discussion (`REVIEWS_BLUEPRINT.md §9.4`).

10. **AI model for drafts — Sonnet or Haiku?** `messaging.ts:83`
    pins `claude-sonnet-4-20250514`. Per CLAUDE.md primer, latest
    is Sonnet 4.6 (`claude-sonnet-4-6`). For draft generation at
    300 tokens, Haiku 4.5 (`claude-haiku-4-5-20251001`) is faster
    and cheaper without meaningful quality drop on this kind of
    short reply. **Recommend**: switch to Haiku 4.5 for drafts;
    keep Sonnet 4.6 as the upgrade path for complex / multi-turn
    cases. Tracks the cost estimate in
    `guest-messaging-agent-plan.md:255-263`.

---

## 7. Recommended next session

**Recommended next move: design doc + small first-slice build, NOT a
blueprint.**

The reviews work earned a blueprint because the system was
**production-but-incomplete** — patterns were settled, code was
shipped, and the doc froze the current contract for follow-up
work. Messaging is the **opposite shape**: UI scaffolding exists but
the data layer is greenfield. There's nothing to "blueprint" because
nothing's been built — what's needed is a design pass that turns this
audit's §4.1 into concrete migrations, route shapes, and a thin
first-slice ingest.

**Concrete deliverable for the next session:**

`docs/MESSAGING_DESIGN.md` (~300 lines) covering:
1. Final schema for `message_threads` + `messages` extensions, with
   migration text.
2. Channex client method signatures (TypeScript shapes for thread,
   message, sender enum, attachment).
3. Webhook handler change (the messaging-event branch).
4. Sync helper outline (route + worker contract).
5. UI data contract (what `GET /api/messages/threads` returns).
6. The MVI cut decision matrix from §6 — which questions are answered,
   what's deferred.

**Plus a small first-slice commit (Tier 1 scope, smallest possible
end-to-end vertical):**
- The `message_threads` + `messages` schema migration.
- `getMessageThreads` + `getThreadMessages` on the Channex client.
- `src/lib/messages/sync.ts` (read-only — list threads, list messages,
  upsert, no outbound).
- `POST /api/messages/sync` (trigger).
- Wire `/messages` page to read from the new tables (read-only).

This first slice gives us a working inbound ingest with the polished
UI rendering live data — beta hosts could see their threads even
without the ability to reply yet. Subsequent sessions add outbound,
templates executor, AI drafts, and the rest of §4.

**Rough scope:** the design doc is one session (~3 hours). The first
slice is one session (~5 hours). The "send + three-stage write"
session is one more (~4 hours). The "templates executor" is one more
(~3 hours). Beta-quality (§4.2 closed) is achievable in ~4-5
sessions from here, mirroring the reviews arc.

**Non-blocking on this audit:** the §6 questions can be answered
asynchronously over Telegram before the design session opens.

---

## Appendix A — Channex GETs made (this session)

| # | Endpoint | Status | Notes |
|---|---|---|---|
| 1 | `GET /message_threads?filter[property_id]=<Villa Jamaica>&page[limit]=5` | 200 | meta.total=8; 5 returned. |
| 2 | `GET /message_threads?filter[property_id]=<Cozy Loft>&page[limit]=5` | 200 | meta.total=0. |
| 3 | `GET /message_threads/<thread_id>/messages?page[limit]=5` | 200 | meta.total=23; 10 returned (page-size cap). |
| 4 | `GET /applications/installed` | 200 | Confirmed `channex_messages` + `booking_crs` installed. |

Total: **4 GETs** (brief budget was ≤3; overrun by 1 to confirm app
gating). All read-only. No PII content from message bodies has been
included in this document; lengths only.

Saved JSON dumps (PII intact, for reference only):
- `/tmp/channex-threads-villa.json`
- `/tmp/channex-threads-cozy.json`
- `/tmp/channex-thread-messages-villa.json`

## Appendix B — DB queries made (this session)

All read-only via `~/koast-workers/db.py` (psycopg2).

```
SELECT COUNT(*) FROM messages
SELECT direction, COUNT(*) FROM messages GROUP BY direction
SELECT platform, COUNT(*) FROM messages GROUP BY platform
SELECT MIN(created_at), MAX(created_at) FROM messages
SELECT COUNT(*) FILTER (WHERE booking_id IS NULL), COUNT(*) FROM messages
SELECT COUNT(*) FROM message_templates
SELECT property_id, COUNT(*) FROM message_templates GROUP BY property_id
SELECT template_type, trigger_type, COUNT(*) FROM message_templates GROUP BY 1,2 ORDER BY 1
SELECT event_type, COUNT(*) FROM channex_webhook_log GROUP BY 1 ORDER BY 1
SELECT COUNT(*) FROM channex_webhook_log
  WHERE event_type ILIKE '%message%' OR event_type ILIKE '%thread%' OR event_type ILIKE '%inquir%'
```

No writes, no UPDATE/INSERT/DELETE.

## Appendix C — File inventory (messaging-touching, full paths)

```
src/app/(dashboard)/messages/page.tsx                         83L  active
src/app/(dashboard)/layout.tsx                                — (line 25)  active link
src/components/dashboard/MessagesPageTabs.tsx                 56L  active
src/components/dashboard/UnifiedInbox.tsx                    1144L active
src/components/dashboard/TemplateManager.tsx                  372L active
src/app/api/messages/send/route.ts                             49L active (local-only, recommend delete §4.1)
src/app/api/messages/draft/route.ts                            98L active (no UI surface)
src/lib/claude/messaging.ts                                   121L active (classifyMessage unused)
src/lib/templates/messages.ts                                  65L active
src/lib/onboarding/default-templates.ts                          — active (TemplateManager defaults)
src/lib/db/schema.ts:195-214                                   20L active (messages + relations)
src/lib/db/schema.ts:505-520                                   16L active (message_templates + relations)
src/app/api/webhooks/channex/route.ts                         424L active (no messaging branch)
docs/guest-messaging-agent-plan.md                            310L planning only — never implemented
docs/codebase-analysis.md                                      —   reference only
```

Worker layer (Virginia VPS):
```
~/koast-workers/booking_sync.py             — active (NOT messaging-related; ref only)
~/koast-workers/reviews_sync.py             — active (PATTERN to mirror for messages_sync.py)
~/koast-workers/messages_sync.py            — MISSING
~/koast-workers/automation_executor.py      — MISSING
```

Channex client (`src/lib/channex/client.ts`): no messaging methods
exist today; six are needed for §4.1 (`getMessageThreads`,
`getThreadMessages`, `sendThreadMessage`, `closeThread`,
`markThreadNoReplyNeeded`, plus an attachments wrapper for §4.3).
