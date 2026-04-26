# Messaging Design

> Design document for the messaging build path. Companion to
> `docs/MESSAGING_AUDIT.md` (commit `94b96eb`). Written 2026-04-26.
> This is **not a blueprint** — there's no production implementation
> at the data layer to reverse-engineer. This document establishes
> intent, schema, ingest topology, and the first-slice scope that the
> next session will build. Citations are `path:line`. PII redacted
> throughout. Channex evidence: live read-only probes
> 2026-04-26 ~02:30 UTC against production.

## 0. Status

Messaging on Koast today is a polished UI (`/messages` page,
three-column `UnifiedInbox`, `TemplateManager`) wired to a static
hand-seeded `messages` table — five rows from a 7.5-hour window in
early April 2026, all with `booking_id=NULL`, never refreshed.
Production Channex meanwhile holds **8 live threads on Villa
Jamaica** (6 AirBNB + 2 BookingCom) with the most active thread at
23 messages and last-message activity in the last hour. The Channex
`channex_messages` app is installed; messaging endpoints are
gated open. The webhook subscription is alive but listens only for
`booking_new,booking_modification,booking_cancellation` — every
messaging-class event Channex would push is dropped at source
(confirmed live by a `GET /webhooks` in this session).

This document plans a **webhook-first** ingest with a polling worker
as fallback, a fresh `message_threads` table, an extended `messages`
table, six new Channex client methods, and a single-session
first-slice cut: read-only ingest that lights up the existing UI.
Outbound send, AI drafts, templates-as-trigger, search, and
attachments are explicitly deferred to subsequent slices and listed
in §8.

This document is the contract for the next session. When the build
deviates, update the document; when the document drifts from
implementation, fix the code.

---

## 1. Intent

### 1.1 What we're building

A host with N properties across Airbnb and Booking.com opens Koast
and sees a unified inbox of guest conversations grouped per
conversation thread. Every inbound message lands in the inbox
within seconds of receipt (webhook delivery time). Threads carry
provider attribution, last-activity timestamps, and link to the
underlying booking when the channel makes that link available.

The render layer at `src/components/dashboard/UnifiedInbox.tsx`
(1144L, see `MESSAGING_AUDIT.md` §1.1) is reused — the design is to
make that surface display real data, not to redesign the surface.

### 1.2 What slice 1 is NOT

Stated explicitly so scope creep has something to push against:

- **No outbound send via Channex.** `POST /api/messages/send`
  (`src/app/api/messages/send/route.ts:1-49`) writes locally only;
  slice 1 does not change that. Recommend deleting the route in
  slice 2 once the real send path lands.
- **No AI-drafted replies.** The "K" composer button stays disabled
  (`UnifiedInbox.tsx:748-765`). `POST /api/messages/draft`
  (`src/app/api/messages/draft/route.ts:1-98`) keeps existing —
  unwired — until slice 3.
- **No templates execution.** `message_templates` table stays at
  zero rows in production; the TemplateManager UI is a no-op
  beyond local CRUD. Slice 3 adds the trigger executor.
- **No search.** The existing search box scopes to guest name +
  property name client-side (`UnifiedInbox.tsx:231-235`); slice 1
  doesn't add server-side body search.
- **No attachments.** Channex's `POST /attachments` wrapper is not
  in slice 1 even though the message entity includes the
  `attachments` array.
- **No mark-read API.** Read state in slice 1 is derived from the
  thread's `unread_count` server-side; mark-read is slice 2 work.
- **No scheduled messages, no auto-replies, no Managed Agents.**
  Vision-tier per `docs/guest-messaging-agent-plan.md`; not in this
  arc.

### 1.3 Acceptance for slice 1

- An inbound Airbnb message arriving at Channex appears in the
  Koast inbox within one webhook delivery cycle (~seconds).
- An inbound BDC message does the same.
- All 8 currently-live Villa Jamaica threads appear in `/messages`
  on first load with correct provider chips, last-activity
  timestamps, and per-thread message previews.
- Cozy Loft (no threads) renders an empty state, not an error.
- Polling worker catches a missed delivery within 60 minutes if a
  webhook is dropped.

---

## 2. Architecture

### 2.1 Ingest topology

**Webhook-first.** Worker is a fallback for delivery outages, not
the primary load.

```
                                 (realtime)
   Channex (OTA event)  ─────►  POST /api/webhooks/channex  ───► dispatch by event type
                                            │
                                            ├─► booking_*       (existing handler — unchanged)
                                            ├─► message         ──► upsert thread + message
                                            ├─► inquiry         ──► upsert thread + message  (see §6.1)
                                            └─► reservation_*   ──► upsert thread + message  (see §6.1)


                                 (reconciliation, every 60min)
   Cron timer (Virginia VPS)  ─►  ~/staycommand-workers/messages_sync.py
                                            │
                                            └─► for each property:
                                                  list threads → upsert
                                                  for each thread changed since last sync:
                                                    list messages → upsert (dedup-by-id)
                                                  stamp properties.messages_last_synced_at
```

Read paths are unaffected by the topology — `GET /api/messages/threads`
and `GET /api/messages/threads/[id]` read from the local DB and don't
talk to Channex on the request path. This is the same shape as the
reviews subsystem (`REVIEWS_BLUEPRINT.md` §5.1).

### 2.2 Why webhook-first changes the build order

Reviews ended up worker-primary because Channex's documented webhook
event taxonomy doesn't include a working `event_mask` token for
review events (`channex-expert/references/known-quirks.md` #6
workaround section, plus
`koast-development/references/tech-debt.md:140-142`). Polling at a
20-minute cadence was the only viable path.

Messaging is the **opposite story**. Per
`channex-expert/references/endpoint-reference.md:303-304`, the
documented messaging events are:
`message`, `inquiry`, `reservation_request`, `accepted_reservation`,
`declined_reservation`, `alteration_request`. Per
`domain-concepts.md:206-207`, the `message` event payload carries
`{id, message, sender, property_id, booking_id, message_thread_id,
attachments, have_attachment}` — a full enough envelope that the
handler can upsert without a follow-up GET in the common path.

**Implication for build order:** the webhook handler and its
idempotency strategy are **the first thing to design and build**,
not an afterthought. The reviews build went `worker → route → UI`;
messaging goes `webhook handler → worker as fallback → UI rewire`.

### 2.3 Idempotency

Channex retries non-2xx deliveries. The handler must dedupe.
**Strategy:** upsert on `messages.channex_message_id` (UNIQUE) and
`message_threads.channex_thread_id` (UNIQUE). A duplicate event is
a no-op write that still ack's 200.

Unlike booking webhooks (which dedupe via `revision_id` —
`channex_webhook_log.revision_id` per CLAUDE.md:158), messages don't
appear to carry revisions in Channex's data model — the entity is
immutable post-create modulo `updated_at` bumps. **`channex_message_id`
alone is the dedup key.** Confirmed via probe: each of the 24
messages observed across three threads has a distinct UUID `id`.

Channex also explicitly notes webhook delivery order is **not
guaranteed** (`domain-concepts.md:221-223`). The handler cannot
assume in-thread ordering by arrival; persist `inserted_at` from the
payload and let the read layer sort.

### 2.4 No-talk-back guarantee on the request path

The webhook handler must not call back to Channex synchronously. The
booking handler does (it calls `getBooking`, `getRoomTypes`,
`updateAvailability` — `src/app/api/webhooks/channex/route.ts:193,
:306, :328`) and pays for it in latency + retry-cascade risk. The
messaging handler upserts directly from the webhook envelope and
returns. Anything missing from the envelope (e.g. attachment URLs)
is fetched lazily by the read path or the worker's reconciliation
pass.

---

## 3. Schema

### 3.1 `message_threads` (new)

```sql
CREATE TABLE message_threads (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id                 uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  booking_id                  uuid REFERENCES bookings(id) ON DELETE SET NULL,
  channex_thread_id           text NOT NULL UNIQUE,
  channex_channel_id          text,                       -- relationships.channel.data.id
  channex_booking_id          text,                       -- BDC threads carry this; AirBNB do not
  ota_message_thread_id       text,                       -- OTA's native id (Airbnb conversation id, BDC thread id)
  channel_code                text NOT NULL,              -- 'abb' | 'bdc' (stamped at sync from provider)
  provider_raw                text NOT NULL,              -- 'AirBNB' | 'BookingCom' (source of truth from Channex)
  title                       text,                       -- attributes.title (often short partial guest name)
  last_message_preview        text,                       -- attributes.last_message (truncated body)
  last_message_received_at    timestamptz,                -- the freshness signal
  message_count               integer NOT NULL DEFAULT 0, -- attributes.message_count
  unread_count                integer NOT NULL DEFAULT 0, -- derived from messages where direction='inbound' AND read_at IS NULL
  is_closed                   boolean NOT NULL DEFAULT false,
  status                      text NOT NULL DEFAULT 'active',  -- 'active' | 'archived' (host action) | 'no_reply_needed' (BDC)
  thread_kind                 text NOT NULL DEFAULT 'message', -- 'message' | 'inquiry' | 'reservation_request' (see §6.1)
  meta                        jsonb,                       -- raw provider-specific bag (Airbnb meta etc)
  channex_inserted_at         timestamptz,
  channex_updated_at          timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
```

**Indexes:**
```sql
CREATE UNIQUE INDEX idx_message_threads_channex_id
  ON message_threads(channex_thread_id);
CREATE INDEX idx_message_threads_property_last
  ON message_threads(property_id, last_message_received_at DESC);
CREATE INDEX idx_message_threads_booking
  ON message_threads(booking_id) WHERE booking_id IS NOT NULL;
```

**Field-by-field rationale:**

- `channex_thread_id` — the upsert dedup key. UNIQUE.
- `channex_channel_id` — every thread carries
  `relationships.channel.data.id` (probe-confirmed across all 8
  threads). Stored to enable per-channel filtering and to map back
  to `property_channels` when needed.
- `channex_booking_id` — **BDC threads carry
  `relationships.booking.data.id`; AirBNB threads do not**
  (probe-confirmed: 2/8 threads have the relationship, both
  `provider=BookingCom`). The `booking_id` FK to `bookings.id` is
  derived: for BDC, look up `bookings WHERE channex_booking_id =
  $1`; for AirBNB, fall through to the `ota_message_thread_id` →
  `bookings.platform_booking_id` join. Both branches go through
  RDX-3's join-key fix (see §5.2).
- `ota_message_thread_id` — Channex preserves this; useful for
  cross-platform debugging and for the AirBNB booking-link path.
- `channel_code` — stamped at sync time from
  `attributes.provider`: `AirBNB → 'abb'`, `BookingCom → 'bdc'`.
  This is the **same lesson learned from reviews** in
  `REVIEWS_DATA_TRUTH.md` §2.4 — derive at sync time, not at read
  time. Store the raw `provider_raw` separately so the casing
  surprise (`AirBNB`/`BookingCom`) is recoverable.
- `provider_raw` — Channex's casing is non-obvious; preserve it
  alongside the normalized `channel_code`.
- `last_message_preview` — Channex's `attributes.last_message` is a
  truncated body suitable for list view. No need to recompute from
  `messages` rows.
- `unread_count` — server-derived, written at message ingest and
  on mark-read. Drives the unread badge in the UI without a
  per-render aggregate.
- `is_closed` vs `status` — Channex's `is_closed` is OTA-side state
  (the conversation is closed at the OTA). `status` is Koast-side
  state — `archived` is host-driven, `no_reply_needed` reflects
  the BDC `POST .../no_reply_needed` action being applied. Keep
  separate.
- `thread_kind` — see §6.1 product question. Slice 1 stamps
  `'message'` for `message` events and `'inquiry'` /
  `'reservation_request'` for the others, even if the UI surfaces
  them in a single bucket initially.
- `meta` jsonb — captures per-OTA fields (Airbnb threads carry an
  `attributes.meta` object; BDC threads do not in the probe
  sample). "Better to capture and ignore than to miss."

### 3.2 `messages` (extend existing)

Existing schema (`src/lib/db/schema.ts:195-209`):
```
id, booking_id, property_id, platform, direction, sender_name,
content, ai_draft, ai_draft_status, sent_at, created_at
```

Migration adds:
```sql
ALTER TABLE messages
  ADD COLUMN thread_id           uuid REFERENCES message_threads(id) ON DELETE CASCADE,
  ADD COLUMN channex_message_id  text UNIQUE,                         -- ingest dedup key
  ADD COLUMN ota_message_id      text,                                -- OTA's native id
  ADD COLUMN sender              text,                                -- 'guest' | 'property' | 'system' (raw from Channex)
  ADD COLUMN attachments         jsonb NOT NULL DEFAULT '[]'::jsonb,  -- raw Channex attachments[]
  ADD COLUMN channex_meta        jsonb,                               -- per-OTA leak-through
  ADD COLUMN read_at             timestamptz,                         -- mark-read; NULL = unread
  ADD COLUMN channex_inserted_at timestamptz,
  ADD COLUMN channex_updated_at  timestamptz;

CREATE INDEX idx_messages_thread_inserted
  ON messages(thread_id, channex_inserted_at);
CREATE UNIQUE INDEX idx_messages_channex_id
  ON messages(channex_message_id) WHERE channex_message_id IS NOT NULL;
```

**Notes:**

- **Don't drop `direction`.** Keep it — derive at ingest from
  `sender`: `sender='guest' → 'inbound'`, `sender in ('property',
  'system') → 'outbound'`. The existing UI keys off `direction`
  (`UnifiedInbox.tsx:209-210, :848-877`); preserving keeps the
  rewrite small.
- **Don't drop `platform` either.** The UI uses it for the platform
  chip on each conversation row (`UnifiedInbox.tsx:487-488`).
  Stamp at ingest from the parent thread's `channel_code`. Strictly
  redundant with the join, but cheap and the UI already reads it.
- `sender` (raw) and `direction` (derived) coexist for clarity —
  same dual-write pattern reviews uses for raw vs computed fields.
- `read_at` instead of `is_read` boolean: timestamps are strictly
  more informative and the slice-2 mark-read flow gets a free
  audit trail.
- `ota_message_id` mirrors the thread's `ota_message_thread_id`
  pattern for cross-platform debugging.
- `attachments jsonb DEFAULT '[]'` so `array_length`-style queries
  always return zero, not null, even before slice 4 wires
  attachment ingest.
- Existing 5 hand-seeded rows: drop in the migration. Per the audit's
  §6.7 recommendation, they predate the real model and confuse the
  synthetic-thread fallback. Migration body:
  `DELETE FROM messages WHERE thread_id IS NULL;`
  (run after the column is added but before the NOT NULL would
  otherwise be enforced — column stays nullable per back-compat).

### 3.3 Index summary

| Table | Index | Purpose |
|---|---|---|
| `message_threads` | UNIQUE `(channex_thread_id)` | Upsert key |
| `message_threads` | `(property_id, last_message_received_at DESC)` | List view sort within property scope |
| `message_threads` | `(booking_id) WHERE booking_id IS NOT NULL` | Booking-link lookups (slice 3 AI drafts) |
| `messages` | `(thread_id, channex_inserted_at)` | Thread-detail render |
| `messages` | UNIQUE `(channex_message_id) WHERE NOT NULL` | Ingest dedup; partial allows legacy rows without ids |
| `messages` (existing) | `(property_id, created_at)` | Kept for back-compat with `/api/messages/draft` history pull |

### 3.4 `properties.messages_last_synced_at` (new)

Same shape as `properties.reviews_last_synced_at`
(`REVIEWS_BLUEPRINT.md` §3.2). Stamped per-property by the helper +
worker on success only. Drives the "Last synced N min ago" chrome
on `/messages` (mirrors `REVIEWS_BLUEPRINT.md` §6.4 with the
OLDEST-stamp rule for the "All" view).

```sql
ALTER TABLE properties ADD COLUMN messages_last_synced_at timestamptz;
```

### 3.5 Schema decisions taken

These are noted explicitly so reviewers don't re-litigate them in
the build session:

- **Thread is its own table, not a derived view over `messages`.**
  Channex models it that way; the UI groups by thread already; the
  freshness signal is per-thread; per-thread `unread_count` needs a
  durable home.
- **`channex_thread_id`/`channex_message_id` are the upsert keys**,
  not OTA-native ids. OTA ids exist for cross-platform debug. Same
  pattern reviews uses (`channex_review_id` UNIQUE).
- **Booking link is derivation, not Channex authority.** BDC gives
  it directly; AirBNB requires the join. We resolve at sync time
  and persist on the thread.
- **No separate `inquiries` or `reservation_requests` tables.**
  Slice 1 uses `thread_kind` on `message_threads`. Promoting to
  separate tables is a slice-3+ call (see §6.1).

---

## 4. Webhook handler design

### 4.1 Current state

`src/app/api/webhooks/channex/route.ts` (424L). Today's behavior
(`MESSAGING_AUDIT.md` §1.3):

- Recognized event names (`route.ts:57-62`):
  `booking, booking_new, booking_modification, booking_modified,
  booking_cancellation, booking_cancelled, booking_unmapped_new,
  booking_unmapped_modified, booking_unmapped_cancelled,
  ota_booking_created, ota_booking_modified, ota_booking_cancelled`.
- Test/ping events (`route.ts:37`): `test`, `ping`, `webhook_test`.
- Everything else (`route.ts:64-79`): logged with
  `action_taken='skipped_non_booking'` and acked.
- All booking handling synchronously calls Channex
  (`getBooking`, `getRoomTypes`, `updateAvailability` —
  `route.ts:193, :306, :328`) and writes
  `pricing_performance` (`route.ts:286-296`).
- Per-handler outcome logged to `channex_webhook_log`
  (`route.ts:354-366`).

**Confirmed in production today** (psycopg2 read-only,
`MESSAGING_AUDIT.md` §1.2): `channex_webhook_log` has
`booking_new=17`, `booking_cancellation=9`, `revision_poll=12`, and
**zero rows of any messaging-class event_type ever**. The handler
is silent on messaging because Channex isn't sending anything (see
§4.4).

### 4.2 New event handlers

Add three branches to the handler, structured as their own dispatch
file to avoid bloating `route.ts` further. Proposed location:
`src/lib/webhooks/messaging.ts` — `handleMessageEvent(envelope,
supabase)`, called from a single new `if (messageEvents.includes(event))`
branch in `route.ts`.

```
messageEvents = [
  "message",
  "inquiry",
  "reservation_request",
  "accepted_reservation",
  "declined_reservation",
  "alteration_request",
]
```

Per-event behavior (slice 1):

- **`message`** — primary path. Payload shape per
  `domain-concepts.md:206-207`:
  ```
  { id, message, sender, property_id, booking_id,
    message_thread_id, attachments, have_attachment }
  ```
  Action: upsert thread (look up by `channex_thread_id =
  message_thread_id`; if absent, fetch via `GET
  /message_threads/:id` to populate); upsert message (dedup on
  `channex_message_id = id`); recompute thread's `unread_count` if
  `sender='guest'`; bump `last_message_received_at`. **Stamp
  `direction = sender === 'guest' ? 'inbound' : 'outbound'`** so
  the existing UI doesn't have to re-derive.

- **`inquiry`** — same upsert path but stamp
  `thread_kind='inquiry'` on the thread when it's first created.
  Subsequent `message` events on the same thread don't downgrade
  `thread_kind`.

- **`reservation_request`** / **`accepted_reservation`** /
  **`declined_reservation`** / **`alteration_request`** — same
  treatment, stamp `thread_kind='reservation_request'` (or extend
  the enum if §6.1 product call wants finer granularity).

**One-time bootstrap fetch**: when the handler sees a
`message_thread_id` we don't have locally, it must fetch the parent
thread's metadata (title, channel rel, booking rel, provider,
ota_message_thread_id) before the upsert. Single
`GET /message_threads/:id` per new thread, cached forever after via
the UNIQUE index. **This is the only synchronous Channex call in
the messaging handler**; subsequent messages on the same thread
upsert without a callback.

### 4.3 Failure semantics

Per-event try/catch around the handler call. A single bad event
must not 500 the whole webhook request — Channex retries on 500
and we'd cascade. Pattern (mirrors the existing booking handler's
defensive error logging at `route.ts:385-405`):

```ts
try {
  await handleMessageEvent(envelope, supabase);
  return ack200("ok");
} catch (err) {
  console.error("[webhook/messaging] error:", err);
  await logToChannexWebhookLog({ ..., action_taken: "messaging_error",
                                  ack_response: err.message });
  return ack200("processed_with_error");  // still ack 200 — same
                                          // pattern booking handler
                                          // uses (route.ts:400)
}
```

**Idempotency under retry:** the upsert keys (`channex_thread_id`,
`channex_message_id`) are unique. Re-delivery with the same payload
is a no-op write. `unread_count` recompute must be a `SELECT
COUNT(*)` against the messages table (not an `+1` increment) so
re-deliveries can't double-count.

**Out-of-order delivery:** Channex notes order is not guaranteed
(`domain-concepts.md:221-223`). The handler ingests with
`channex_inserted_at` from the payload; render layer sorts by that
ascendingly within a thread. `last_message_received_at` on the
thread updates only when the new message's `inserted_at` is `>
current`.

### 4.4 Channex webhook subscription change

**Current account-wide subscription** (live probe `GET /webhooks`
this session, saved to `/tmp/channex-webhooks.json`):

| Field | Value |
|---|---|
| `id` | `c64f7450-…` (8-char prefix shown — full id in saved JSON) |
| `callback_url` | `https://app.koasthq.com/api/webhooks/channex` |
| `event_mask` | `booking_new,booking_modification,booking_cancellation` |
| `is_active` | `true` |
| `is_global` | `true` (account-scoped, not per-property) |
| `property_id` | `null` |
| `meta.total` | 1 (sole subscription on the account) |

**Proposed final state** (slice 1 build session, **PUT to be
greenlit at session start**):

| Field | New value |
|---|---|
| `event_mask` | `booking_new,booking_modification,booking_cancellation,message,inquiry,reservation_request,accepted_reservation,declined_reservation,alteration_request` |

All other fields stay. Single `PUT /webhooks/c64f7450-…` with the
widened mask. This is the only Channex write the slice 1 session
needs.

**Risk assessment:** widening the mask cannot lose existing
behavior — all current event types remain. New event types arriving
before the handler ships will be logged as `skipped_non_booking`
(existing behavior), so even an order-of-operations mistake is
recoverable.

**Mask separator quirk:** docs show `;` semicolon; live account uses
`,` comma. Both appear accepted (`endpoint-reference.md:295-296`).
Match the current account's comma to be safe.

### 4.5 Handler test plan

For the build session — not in this design doc to execute. Capture
verbatim payloads from the first three live deliveries (per event
type) into `/tmp/channex-webhook-{message,inquiry,reservation_request}-sample.json`,
then write idempotency tests against fixed payloads. Mirror reviews'
fixture pattern.

---

## 5. Channex client extension

New file: `src/lib/channex/messages.ts`. Companion to the existing
`src/lib/channex/client.ts:740-810` reviews methods. Same auth
plumbing, same pagination + dedup style.

### 5.1 Method signatures

```ts
// List threads for a property — used by sync helper + worker.
export async function listThreads(
  client: ChannexClient,
  propertyId: string,
  opts?: { limit?: number; page?: number },
): Promise<MessageThread[]>;

// Single thread fetch — used by webhook handler when we see a new
// channex_thread_id not in our DB.
export async function fetchThread(
  client: ChannexClient,
  threadId: string,
): Promise<MessageThread>;

// Messages within a thread — used by sync helper for new/changed
// threads. Pagination is dedup-by-id loop because page[limit] is
// advisory (probe confirmed: page[limit]=5 returned 10).
export async function listMessages(
  client: ChannexClient,
  threadId: string,
  opts?: { limit?: number; page?: number },
): Promise<ChannexMessage[]>;

// Subscribe / update webhook event_mask — used once at slice 1
// to widen the account subscription (greenlit per §4.4).
export async function getWebhooks(
  client: ChannexClient,
): Promise<ChannexWebhook[]>;
export async function updateWebhookEventMask(
  client: ChannexClient,
  webhookId: string,
  eventMask: string,
): Promise<ChannexWebhook>;

// SLICE 2 — outbound send. Stub interface here for forward-compat;
// actual implementation deferred.
export async function sendMessage(
  client: ChannexClient,
  threadId: string,
  body: { message: string; attachments?: ChannexAttachment[] },
): Promise<ChannexMessage>;

// SLICE 3+ — close thread, no-reply-needed. Listed for shape
// continuity, not implemented in slice 1.
export async function closeThread(
  client: ChannexClient,
  threadId: string,
): Promise<void>;
export async function markThreadNoReplyNeeded(  // BDC-only
  client: ChannexClient,
  threadId: string,
): Promise<void>;
```

### 5.2 TypeScript shape exports

```ts
export interface MessageThread {
  id: string;                              // channex_thread_id
  attributes: {
    title: string | null;
    last_message: string | null;
    last_message_received_at: string;       // ISO ts
    inserted_at: string;
    updated_at: string;
    is_closed: boolean;
    message_count: number;
    provider: "AirBNB" | "BookingCom" | string;  // accept future strings
    ota_message_thread_id: string | null;
    meta?: Record<string, unknown>;          // AirBNB threads only in probe
  };
  relationships: {
    property: { data: { id: string; type: "property" } };
    channel: { data: { id: string; type: "channel" } };
    booking?: { data: { id: string; type: "booking" } };  // BDC only in probe
  };
}

export interface ChannexMessage {
  id: string;                              // channex_message_id
  attributes: {
    message: string;
    sender: "guest" | "property" | "system";
    inserted_at: string;
    updated_at: string;
    attachments: ChannexAttachment[];      // empty array on probe
    meta?: Record<string, unknown>;        // AirBNB messages may carry
  };
  relationships: { message_thread: { data: { id: string } } };
}

export interface ChannexAttachment {
  // Shape unverified — placeholder until slice 4. Channex
  // /attachments endpoint accepts base64; entity shape TBD.
  url?: string;
  filename?: string;
  size?: number;
}

export interface ChannexWebhook {
  id: string;
  attributes: {
    callback_url: string;
    event_mask: string;
    is_active: boolean;
    is_global: boolean;
    property_id: string | null;
    send_data: boolean;
    headers: Record<string, string>;
    request_params: Record<string, unknown>;
    protected: boolean;
  };
}
```

### 5.3 Pagination pattern

Mirror `src/lib/reviews/sync.ts` dedup-by-id loop
(`REVIEWS_BLUEPRINT.md` §4.2 quirk #6 row): never trust
`page[limit]`, dedup by id, bail when a page returns no new ids.
Confirmed live in this session: `page[limit]=5` against
`/message_threads/:id/messages` returned 10 (the default cap).

### 5.4 What does NOT belong here

- Webhook subscription **probing** (write traffic) — not in slice 1
  beyond the single one-shot mask widening.
- Attachment uploads — slice 4.
- Thread-search filters — Channex's `/message_threads` doesn't
  support body search per the endpoint reference; defer to a
  Koast-side ILIKE in slice 3+.

---

## 6. Open questions

Product calls. Numbered for reference in the build session.

### 6.1 Inquiry / reservation_request bucketing

**Background.** Channex emits `inquiry`, `reservation_request`,
`accepted_reservation`, `declined_reservation`, `alteration_request`
as distinct event types alongside `message`
(`endpoint-reference.md:303-304`). The skill is thin on their
semantics — only the event names are catalogued. Inferred meaning,
based on Airbnb's own API conventions:

- **`inquiry`** — pre-booking message thread where the guest is
  asking about a property without an active reservation. Airbnb
  exposes these as their own object. May or may not be paired to a
  later booking.
- **`reservation_request`** — a guest has formally requested a
  booking that needs host approval (Airbnb's "Request to Book"
  flow). Has booking-shape data attached but isn't confirmed yet.
- **`accepted_reservation` / `declined_reservation`** — host has
  responded to a reservation_request. Channex emits as a
  state-change.
- **`alteration_request`** — guest is asking to modify dates / guest
  count on an existing booking. Carries proposed-change data.

**Question for Cesar.** Three options:
1. **All-in-one inbox.** Slice 1: stamp `thread_kind` on the thread
   but the UI shows everything together with a small "Inquiry" /
   "Booking request" badge on threads where applicable. **Recommend
   for slice 1** — minimal UX surface, host sees all guest
   communication in one place, badges convey intent.
2. **Tabbed inbox.** Top of `/messages` gets `Inbox | Inquiries |
   Booking requests` tabs. More explicit but more UI work; defer
   to slice 3+.
3. **Separate tables.** Promote `inquiries` and
   `reservation_requests` to their own tables when they need
   booking-action plumbing (accept/decline buttons in the inbox).
   Defer that decision until we see real volumes.

**Recommend option 1 for slice 1.** The schema (`thread_kind`)
makes promoting later cheap.

### 6.2 Read state semantics

Slice 1 stamps `messages.read_at` server-side based on what? The
two reasonable models:

- **Server-side via mark-read API.** UI calls `POST
  /api/messages/threads/[id]/read` when the host opens a thread.
  Server stamps `read_at = now()` for all unread inbound messages
  in that thread, recomputes `unread_count` to 0.
- **Client-side optimistic only.** Read state lives in localStorage
  per device. No server commitment.

**Recommend server-side.** Reviews has the same shape (response_sent
is server-authoritative); read state is the "have I seen this"
analogue and belongs in the same place. Mark-read API arrives in
slice 2 alongside outbound send. Slice 1 ingests messages with
`read_at = NULL` (everything starts unread); UI shows the unread
count from the thread but can't clear it yet — acceptable for the
ingest-only slice.

### 6.3 Cross-channel inbox semantics

When the host views "All threads" (no property filter), do BDC and
AirBNB threads mix in one chronological list, or stay grouped per
channel?

**Recommend mixed.** The existing `UnifiedInbox`
(`UnifiedInbox.tsx:219-221`) sorts conversations by
`lastMessage.created_at` desc with no per-channel grouping.
Preserves the "single inbox" mental model. Channel chip on each
row provides attribution.

### 6.4 Per-property vs unified inbox at the page level

`/messages` shows everything. Should `/properties/[id]` also gain a
"Messages" tab showing that property's threads only, mirroring the
"Pricing" tab?

**Recommend defer.** Slice 1 ships `/messages` only; the per-property
view is a slice 3+ surface once host volume justifies it. Cesar's
fleet is 2 properties; there's no signal yet that per-property
context is needed.

### 6.5 Slice 1 boundary

Confirm the slice 1 cut as stated in §1.2 + §7: **read-only ingest
that lights up the existing UI**. No outbound send. No mark-read
API. No AI drafts. No templates execution.

**Recommend confirming.** The ingest surface is the load-bearing
piece; everything else builds on it. Slice 1 is narrow enough to
ship in one session and gives hosts immediate value (a working
inbox, even if read-only).

### 6.6 Thread-aging confirmation (probe)

Probed live this session (3rd GET): the oldest thread by
`last_message_received_at` (BDC, 2026-04-17 — 9 days stale at
probe) returned 200 on `/message_threads/:id/messages`. **Threads
do NOT age out at the same rate as `/bookings`** (which excludes
post-checkout > ~30d per `quirks.md #20`). Inferred behavior:
threads are retained for at least 9 days post-last-message; full
TTL unknown.

**Implication:** no aging-edge handling needed in slice 1 schema.
Surfaces as a quirk for the channex-expert skill update (§9).

### 6.7 Hand-seeded `messages` rows

**Recommend deleting** the 5 rows in production as part of the
schema migration (per `MESSAGING_AUDIT.md` §6.7). They have no
`thread_id` to migrate to and predate the real model. SQL:

```sql
DELETE FROM messages WHERE thread_id IS NULL AND created_at < '2026-04-10';
```

### 6.8 Webhook subscription PUT — explicit greenlight

The slice 1 session's single Channex write is one
`PUT /webhooks/c64f7450-…` to widen `event_mask` per §4.4.
**Cesar to confirm** as the build session opens. Full proposed mask
in §4.4 table.

### 6.9 Outbound send semantics for slice 2

Forward-looking, not blocking slice 1. The three-stage write pattern
from reviews (`REVIEWS_BLUEPRINT.md` §2.2 — submitted → channex_acked
→ ota_confirmed) applies cleanly to outbound messages. The
ota_confirmed stamp comes from the next sync (worker or webhook)
seeing our message echoed back as `sender='property'` with a
matching `inserted_at`/body. Preserve the columns at slice 1
schema-time:

```sql
ALTER TABLE messages
  ADD COLUMN host_send_submitted_at      timestamptz,   -- slice 2
  ADD COLUMN host_send_channex_acked_at  timestamptz,   -- slice 2
  ADD COLUMN host_send_ota_confirmed_at  timestamptz;   -- slice 2
```

Adding now is cheap; back-filling later is annoying.

---

## 7. First-slice build scope

Concrete deliverables for the next session. Single commit (or a
small commit chain). Sequence matters — don't reorder.

1. **Migration** (~150 LOC SQL).
   - `CREATE TABLE message_threads` per §3.1.
   - `ALTER TABLE messages` per §3.2 + §6.9.
   - `ALTER TABLE properties ADD COLUMN messages_last_synced_at`
     per §3.4.
   - `DELETE FROM messages WHERE thread_id IS NULL AND created_at <
     '2026-04-10';` per §6.7.
   - All indexes per §3.3.

2. **Channex client extension**
   (`src/lib/channex/messages.ts`, ~250 LOC).
   - `listThreads`, `fetchThread`, `listMessages`, `getWebhooks`,
     `updateWebhookEventMask` per §5.1.
   - Stub `sendMessage`, `closeThread`,
     `markThreadNoReplyNeeded` (throw "not implemented") so slice 2
     just fills bodies.
   - TypeScript shapes per §5.2.

3. **Webhook handler extension** (~200 LOC across two files).
   - `src/lib/webhooks/messaging.ts` — new file with
     `handleMessageEvent(envelope, supabase)`.
   - `src/app/api/webhooks/channex/route.ts` — add `messageEvents`
     list and dispatch branch per §4.2.
   - Per-event try/catch + idempotency per §4.3.

4. **One-shot mask widening** (~10 LOC of script).
   - `scripts/widen-channex-webhook-mask.ts` — calls the new
     `getWebhooks` + `updateWebhookEventMask`. Run once via
     `npx tsx`. Greenlit per §6.8.
   - Confirm in the channex_webhook_log post-run that messaging
     events start arriving.

5. **Sync helper** (`src/lib/messages/sync.ts`, ~250 LOC).
   - `syncMessagesForUser(userId)` and
     `syncMessagesForOneProperty(prop)` mirroring
     `src/lib/reviews/sync.ts` API surface.
   - Dedup-by-id pagination loops per §5.3.
   - Stamps `properties.messages_last_synced_at` on success.

6. **Polling worker** (~250 LOC Python).
   - `~/staycommand-workers/messages_sync.py` — mirror of
     `reviews_sync.py`.
   - `~/staycommand-workers/systemd/koast-messages-sync.{service,timer}`
     — `OnUnitActiveSec=60min`, `RandomizedDelaySec=300`,
     `OnBootSec=2min`.
   - **NOT enabled in commit** — needs supervised first run, same
     pattern as reviews `tech-debt.md`.

7. **API routes** (~150 LOC).
   - `GET /api/messages/threads` — list threads for user, with
     `display_provider`, `display_last_message`, `unread_count`,
     and any UI-friendly derivations.
   - `GET /api/messages/threads/[id]` — thread + messages payload.
   - `POST /api/messages/sync` — trigger helper, optional
     `property_id` scope.

8. **UI rewire** (~200 LOC delta).
   - `src/app/(dashboard)/messages/page.tsx` — switch from raw
     `messages` table query to `/api/messages/threads` fetch in
     a small server component or client-side via the hook pattern
     reviews uses.
   - `UnifiedInbox.tsx` — change props from `{messages,
     properties, bookings}` to `{threads, properties, bookings}`,
     drop the in-memory grouping helper at
     `UnifiedInbox.tsx:159-217`, render directly from
     server-grouped threads. Most of the file (avatars, filter
     pills, compose bar, message bubbles, context panel) stays.
   - Disable the composer's send action with a tooltip
     ("Coming in slice 2") rather than ripping out the UI.
   - Drop the disabled "AI Drafted" filter and the dimmed "K"
     button comment refs (or leave with a TODO).

9. **Empty-state cascade + chrome** (~50 LOC).
   - Mirror `REVIEWS_BLUEPRINT.md` §6.3 four-state cascade.
   - "Last synced N min ago" + Refresh button + 60s cooldown per
     `REVIEWS_BLUEPRINT.md` §6.4. OLDEST-stamp rule for "All".

**Estimated total: ~1500 LOC across ~10 files. One focused
session.** The reviews subsystem at session 6 was a similar-sized
commit; pattern-matched effort.

**Acceptance gate:** every Villa Jamaica thread visible in
`/messages` with correct provider chip, last-activity time, message
preview, and message count. Sending a real Airbnb test message lands
in the inbox within ~30 seconds of receipt (webhook latency +
Vercel cold-start). Cozy Loft renders the empty state.

**What slice 1 explicitly does NOT do:**

- No host send to Channex.
- No AI draft.
- No template execution.
- No mark-read API (server stamps `read_at` from the upcoming slice
  2 work; slice 1 leaves `read_at = NULL`).
- No search beyond the existing client-side guest-name filter.
- No attachment ingest beyond storing the raw `attachments` jsonb
  array.

---

## 8. Subsequent slices (rough)

Don't over-spec — these will evolve with slice 1 learnings. Listed
for context only.

### Slice 2 — Outbound + read state

- `sendMessage` Channex client wrapper (real implementation).
- `POST /api/messages/threads/[id]/send` with three-stage write
  pattern from §6.9.
- `POST /api/messages/threads/[id]/read` mark-read.
- Composer wired to `/send`. Real send action.
- Sync helper handles outbound-confirmation matching (stamp
  `host_send_ota_confirmed_at` when the next sync sees the
  property-side message echoed back).
- Delete `POST /api/messages/send` (the local-only dead route).

Estimated: one session.

### Slice 3 — AI drafts + templates execution

- "K" composer button → `POST /api/messages/draft` → fill
  composer with the AI draft. Reuse the existing helper
  (`src/lib/claude/messaging.ts:35-91`); switch model to
  `claude-haiku-4-5-20251001` per `MESSAGING_AUDIT.md` §6.10
  recommendation.
- Templates trigger executor — Python worker reading
  `message_templates WHERE is_active=true`, computing fire times
  per `trigger_type`/`trigger_days_offset`/`trigger_time`,
  sending via Channex, stamping a guard row per (booking,
  template_type) to prevent re-sends.
- BDC-only "No reply needed" CTA on threads.

Estimated: 1-2 sessions.

### Slice 4 — Search + attachments + filters

- Server-side ILIKE on `messages.message` joined with thread.
- Date-range filter, per-channel filter (already partially
  derivable; explicit chip), `thread_kind` filter.
- Attachment download (Channex's `attachments[]` array — `url`
  field). Upload (slice 4+).

Estimated: one session.

### Post-beta

- Auto-replies with confidence threshold per
  `guest-messaging-agent-plan.md:182-199`.
- Operational routing — keyword → cleaning_tasks creation, etc.
- Scheduled host-side messages.
- Read receipts, typing indicators, multi-language.
- Managed Agents migration per `guest-messaging-agent-plan.md`
  Phase 3.

---

## 9. Skill update plan (for the build session, NOT this commit)

These belong alongside the build session that exercises them, not
in this design commit. Listed here so they're not forgotten.

### 9.1 `channex-expert/references/known-quirks.md`

Proposed new quirks (numbering follows current quirks.md sequence):

- **#23 (proposed)** — `/message_threads/:id/messages`
  `page[limit]` is advisory; cap is the documented default (10).
  Mirrors quirk #6 for `/reviews`. Confirmed live 2026-04-26.
- **#24 (proposed)** — `relationships.booking` is present on BDC
  threads but absent on AirBNB threads (probe-confirmed: 2/8
  threads have it, both `provider=BookingCom`). AirBNB
  thread-to-booking joins must derive via `ota_message_thread_id`
  → bookings join (RDX-3 join-key fix transfers).
- **#25 (proposed)** — Channex retains threads longer than
  bookings. Probe of a 9-day-stale BDC thread returned 200 on
  `/message_threads/:id/messages` despite the bookings feed having
  pruned the related booking per `quirks.md #20`. Implication:
  thread-aging is more forgiving than booking-aging.
- **#26 (proposed)** — `BookingCom` exposes the BDC-only `POST
  /message_threads/:id/no_reply_needed` action for satisfying
  BDC's "respond to all messages" KPI without sending text.
- **#27 (proposed)** — `provider` field uses non-standard casing
  (`AirBNB`, `BookingCom`). Normalizer required if joining to
  Koast's `platforms.ts` keys.
- **#28 (proposed)** — Webhook event payload shapes for
  `message`, `inquiry`, `reservation_request` to be captured from
  the first three live deliveries during slice 1 build.

### 9.2 `channex-expert/references/endpoint-reference.md`

Promote the `/message_threads` table from `D` (documented) to `P`
(probed) on the rows for `/message_threads`, `/message_threads/:id/messages`
(both probed live 2026-04-26).

Add a one-line note clarifying that `inquiry`,
`reservation_request`, `accepted_reservation`,
`declined_reservation`, `alteration_request` are documented webhook
event types but their payload shapes haven't been probed yet.

### 9.3 `koast-development/references/architecture.md:198`

Replace "Upcoming: messaging sync (Session 7)" with: "Messaging
slice 1 in flight — schema + ingest + UI rewire. See
`docs/MESSAGING_DESIGN.md` for the contract; follow-up slices in
§8 of that doc." Update once slice 1 ships.

### 9.4 `koast-development/references/playbooks.md`

Promote "Two-headed sync subsystem" to a named playbook —
recommended in `REVIEWS_BLUEPRINT.md §11.3` and now that messaging
is the second clear example, the pattern is general.

### 9.5 `koast-development/references/tech-debt.md`

Move "Messaging sync (Session 7 target)" out of `Deferred features`
into "Now in flight" once slice 1 opens; mark resolved when slice 1
ships.

### 9.6 `koast-development/references/channex-reference.md:25-26`

Update the "Messages" rows — the audit and design have probed
`/message_threads` and `/message_threads/:id/messages`. Add the
note that the property-filter argument works
(`?filter[property_id]=`) — corrects the existing
"Not property-filterable per docs" remark.

---

## Appendix A — Channex GETs made (this session)

Read-only. PII not included in this document; redacted.

| # | Endpoint | Status | Saved |
|---|---|---|---|
| 1 | `GET /message_threads/<BDC-largest>/messages?page[limit]=10` | 200 | `/tmp/channex-thread-bdc-big.json` |
| 2 | `GET /message_threads/<oldest-thread>/messages?page[limit]=10` | 200 | `/tmp/channex-thread-oldest-bdc.json` |
| 3 | `GET /webhooks` | 200 | `/tmp/channex-webhooks.json` |

Total: **3** GETs, within the brief's budget. (Plus re-inspection
of the audit's saved JSON dumps under `/tmp/channex-threads-*.json`
— not new GETs.)

## Appendix B — Probe-backed shape notes

Confirmed live 2026-04-26:

- `/webhooks` returns 1 active subscription, account-wide
  (`is_global=true`), event mask
  `booking_new,booking_modification,booking_cancellation`.
  Callback URL `https://app.koasthq.com/api/webhooks/channex`.
- `/message_threads/:id/messages` returns the same shape across
  AirBNB and BookingCom (modulo the AirBNB-only `meta` attribute
  on the entity).
- Sender enum observed: `guest`, `property`. `system` documented
  but not observed in the 24 messages probed across 3 threads.
- Attachment array is empty on every probed message.
- `meta` on messages is `{}` in every probed sample (BDC) or
  unobserved (AirBNB messages — only thread-level `meta`
  observed).
- Thread `relationships.booking` present on 2/8 threads, both
  `provider=BookingCom`. AirBNB threads have only `property` and
  `channel` relationships.
- 9-day-stale BDC thread (last activity 2026-04-17) is still
  accessible via `/message_threads/:id/messages` — threads
  outlive `/bookings` aging (quirk #20 doesn't transfer).

## Appendix C — File inventory after slice 1

What slice 1 will touch / create. Reference for slice 1 reviewers.

```
NEW
  supabase/migrations/<ts>_messaging_schema.sql
  src/lib/channex/messages.ts
  src/lib/messages/sync.ts
  src/lib/webhooks/messaging.ts
  src/app/api/messages/threads/route.ts                  GET
  src/app/api/messages/threads/[id]/route.ts             GET
  src/app/api/messages/sync/route.ts                     POST
  scripts/widen-channex-webhook-mask.ts                  one-shot
  ~/staycommand-workers/messages_sync.py
  ~/staycommand-workers/systemd/koast-messages-sync.service
  ~/staycommand-workers/systemd/koast-messages-sync.timer

EDITED
  src/app/api/webhooks/channex/route.ts                  +messageEvents branch
  src/app/(dashboard)/messages/page.tsx                  switch data source
  src/components/dashboard/UnifiedInbox.tsx              props change, drop in-memory grouping
  src/lib/db/schema.ts                                   add messageThreads, extend messages, add properties.messages_last_synced_at

UNCHANGED (slice 1)
  src/app/api/messages/draft/route.ts                    (slice 3)
  src/app/api/messages/send/route.ts                     (delete in slice 2)
  src/components/dashboard/TemplateManager.tsx           (slice 3)
  src/components/dashboard/MessagesPageTabs.tsx          (slice 3)
  src/lib/claude/messaging.ts                            (slice 3)
  src/lib/templates/messages.ts                          (slice 3)
  src/lib/onboarding/default-templates.ts                (slice 3 cleanup)
```

## Appendix D — Cross-reference index

- `docs/MESSAGING_AUDIT.md` — read-only audit input (commit `94b96eb`).
- `docs/REVIEWS_BLUEPRINT.md` — pattern source for two-headed sync,
  three-stage write, on-connect trigger, empty-state cascade,
  refresh chrome.
- `docs/REVIEWS_DATA_TRUTH.md` — pattern source for sync-time
  channel-code stamping, render-against-data-truth approach.
- `docs/guest-messaging-agent-plan.md` — vision-tier reference for
  post-beta automation; not in slice scope.
- `~/.claude/skills/channex-expert/references/{endpoint-reference.md,
  domain-concepts.md, known-quirks.md, operational-patterns.md}` —
  Channex source of truth.
- `~/.claude/skills/koast-development/references/{architecture.md,
  conventions.md, playbooks.md, channex-reference.md, tech-debt.md}`
  — Koast conventions and pattern catalogue.
- `src/lib/channex/client.ts:740-810` — reviews methods on the
  Channex client; the shape messaging methods will mirror.
- `src/lib/reviews/sync.ts` — sync helper structure to mirror.
- `~/staycommand-workers/reviews_sync.py` — Python worker structure
  to mirror.
