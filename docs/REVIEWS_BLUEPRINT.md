# Reviews Blueprint

> Source-of-truth document for the Koast reviews subsystem. Written
> 2026-04-25 after Sessions 6.5 → 6.7-POST. Replaces ad-hoc spec
> material scattered across commit bodies and Telegram threads.

## 0. Status

The reviews subsystem is **production but incomplete**. Pull, dedup,
display, AI-drafted reply, host→guest counter-review, and a manual
Refresh button are all live for Airbnb. A 20-min VPS worker
(`reviews_sync.py`) is built but **its systemd timer is not enabled**
— current production behavior is reactive (manual button + on-connect
trigger). BDC reviews are not yet ingested. The sub-rating, response-
rate, and trend-aware analytics surfaces from the original audit are
not built. The "locked-pending" state of a pre-reveal Airbnb review is
**misclassified as a bad review** — concrete bug §9.1.

This document is the contract for follow-up work. When the
implementation drifts from the document, update the document; when
the document drifts from the implementation, fix the code.

Citations are `path:line`. Skill cross-references use
`channex-expert/known-quirks.md #N` notation.

---

## 1. Product intent

### 1.1 What the surface is for

Three host questions:

1. **"Do I owe anyone a reply right now?"** — needs-response triage
   across every connected channel, sorted by deadline urgency.
2. **"Is my rating trending in the right direction?"** — overall and
   per-property rating trajectory with enough recency-weighting to
   surface a problem before it shows up on the OTA's public page.
3. **"Which property is dragging the portfolio down?"** — per-property
   ranking, plus per-subrating drill-down so a host can see whether
   it's cleanliness, communication, location, accuracy, or value
   that's costing them stars.

The system also does the host→guest counter-review path on Airbnb
(two-sided review model — `channex-expert/domain-concepts.md`),
which is operational rather than informational: get the review in
before the 14-day window closes.

### 1.2 Who uses it

- Solo hosts and small portfolios (1–10 properties). Mobile and
  desktop. The default view is "things I have to do this week".
- The dashboard surface lives at `/reviews`
  (`src/app/(dashboard)/reviews/page.tsx`).

### 1.3 Non-goals (explicit)

- **Not an analytics platform.** No SQL builder, no custom dashboard,
  no exports beyond a future "download last 90 days as CSV" if hosts
  ask for it.
- **Not multi-platform messaging.** The reviews surface is for
  reviews, not the inbox. Host↔guest pre-stay messaging is the
  separate Messages feature (§7.x roadmap).
- **Not a moderation tool.** Hosts can't dispute or flag a guest's
  review through Koast. Disputes go via OTA support.
- **Not auto-reply.** Drafts are AI-generated, but the host always
  approves before send. `auto_publish` exists in the schema
  (`review_rules.auto_publish`) but is not exposed in UI and should
  stay that way until per-property trust calibration is solved.
- **Not Vrbo, not direct.** Vrbo channel ingestion is deferred (no
  rate plans live). Direct booking has no review concept.

---

## 2. State model

### 2.1 Incoming reviews (guest → host)

A row in `guest_reviews` with `direction='incoming'`. Carries the
guest's rating + text, the host's reply state, and the Channex
synchronization state.

**State machine — Airbnb (two-sided reveal):**

```
                                       [submit/expire]                        [Channex 200]
[no_review]  ──Channex creates──▶  [locked_pending]  ──reveal──▶  [revealable]  ──host replies──▶  [responded]
   │                                     │                            │
   │                                     │                            └─not replied──▶ [revealable_aged]
   │                                     │
   │                                     ▼
   │                                  [expired_no_reveal]   (window closed without either side submitting)
   │                                     │
   ▼                                     ▼
   guest didn't review at all         text never appears
```

- **`locked_pending`** — the 14-day window is still open and neither
  side has submitted yet. Channex returns the review entity with
  `is_expired=false`, `expired_at` set, and the rating/text fields
  often **zero or null** (the bug in §9.1 — confirm via probe).
  Currently misclassified as `is_bad_review` because of the
  rating < threshold rule.
- **`revealable`** — the window has resolved (host submitted, OR
  guest submitted, OR window closed with at least one side
  submitting). Channex now exposes the real `overall_score`,
  `raw_content.public_review`, optional `private_feedback`, and
  `scores[]`. This is the steady state for completed reviews.
- **`revealable_aged`** — same data shape as `revealable`, but old
  enough that Channex stops returning it from `/reviews?filter=` —
  see `channex-expert/known-quirks.md #21` edge case. The local
  row persists; the sync drops it from update consideration.
- **`expired_no_reveal`** — window closed with **neither** side
  submitting. Today derived as `expired_at <= now() AND
  guest_review_submitted_at IS NULL AND incoming_rating IS NULL`.
  Channex stops returning the entity; we should freeze the local
  row in this state.

**Reply substate (host's response to the guest):**

```
[no_response] ──draft generated──▶ [draft]
       │                              │
       │                              ├─edit/save──▶ [draft] (idempotent)
       │                              │
       │                              └─approve──▶ Channex POST /reviews/:id/reply ──200──▶ [responded]
       │                                                       │
       │                                                       └─non-200──▶ [draft] (rolled back)
```

Persisted via `response_draft` / `response_final` / `response_sent` /
`status` / `published_at` (`schema.ts:281-286`). Approve-and-send is
`src/app/api/reviews/respond/[reviewId]/route.ts:53-72`.

**State table (incoming Airbnb)**

| State | DB predicate | Display label |
|---|---|---|
| `locked_pending` | `expired_at > now() AND incoming_rating IS NULL` (probe-confirm) | "Awaiting reveal" *(not implemented)* |
| `revealable` (no reply) | `incoming_rating IS NOT NULL AND response_sent = false` | "Needs response" — `ReviewCard.tsx:86-89` |
| `revealable` (drafted) | `response_draft IS NOT NULL AND response_sent = false` | "Response ready" — `ReviewCard.tsx:78-83` |
| `responded` | `response_sent = true` | "Responded" — `ReviewCard.tsx:71-76` |
| `revealable_aged` | `incoming_date < now()-N days AND not in latest sync` | (implicit; row is read-only) |
| `expired_no_reveal` | `expired_at <= now() AND incoming_rating IS NULL` | (no UI yet — should suppress card or label "Window closed") |
| `bad` | `is_bad_review = true OR incoming_rating < 4` | coral-bordered card + "Bad review" badge — `ReviewCard.tsx:129,312-317` |

### 2.2 Outgoing reviews (host → guest)

Always written as a property of the **paired incoming review** — never
a standalone row. This is the model Channex enforces
(`channex-expert/known-quirks.md #10`).

Persisted on the SAME `guest_reviews` row as the incoming review:
`guest_review_submitted_at`, `guest_review_channex_acked_at`,
`guest_review_airbnb_confirmed_at`, `guest_review_payload`.
`schema.ts:307-310`.

**Three-stage write pattern** (Session 6.2 + 6.5, mirrors the
authoritative example in `playbooks.md > Implementation with safety
rails`):

| Stamp | When | Meaning |
|---|---|---|
| `guest_review_submitted_at` | host clicked Submit, lock acquired | "host's intent recorded" |
| `guest_review_channex_acked_at` | Channex returned 200 | "delivered to channel manager" |
| `guest_review_airbnb_confirmed_at` | next sync's `reply.guest_review.public_review` matches what we sent | "actually accepted by Airbnb" |

Channex 200 is **not** confirmation — `channex-expert/known-quirks.md
#19`. Validation is **client+server enforced**
(`src/lib/reviews/guest-review-validation.ts`); Channex won't enforce
it for us.

**Submission state machine:**

```
[no_submission] ──host submits──▶ [submitted]
       │                              │ (Channex 200)
       │                              ▼
       │                          [channex_acked]
       │                              │ (next sync verifies match)
       │                              ▼
       │                          [airbnb_confirmed]
       │
       └─window expires before submit──▶ [submission_expired]
       └─Channex 4xx/5xx──────────────▶ [no_submission] (rollback)
```

Rollback is implemented in BOTH the inner typed-error catch
(`submit-guest-review/route.ts:120-140`) and the outer catch
(`:170-184`) per `playbooks.md > Inner-only rollback`. Conditional
on `guest_review_channex_acked_at IS NULL` so a post-ack throw can't
undo a real submission.

**BDC has no host→guest review concept.** The submit-review CTA is
gated to `platform === 'airbnb'` in `ReviewCard.tsx:338`. Trying to
post `/reviews/:id/guest_review` for a BDC review is undefined Channex
behavior — don't do it.

### 2.3 Cross-channel matrix

| State / Capability | Airbnb | Booking.com | Vrbo |
|---|---|---|---|
| Incoming review pulled via `/reviews` | Yes (today) | Yes (Channex supports; not yet ingested by Koast) | Deferred |
| Subrating fields (`scores[]`) | clean / accuracy / checkin / communication / location / value | Different category set, often empty in test data | Unknown |
| Two-sided window | 14d | None — open publish | Unknown |
| Host reply via `/reviews/:id/reply` | Yes | Yes | Unknown |
| Host→guest counter-review | Yes (`/reviews/:id/guest_review`) | **No endpoint** | No |
| Locked-pending state | Yes (this doc §9.1) | No | n/a |
| `expired_at` field | Populated | NULL on probe | Unknown |
| `is_replied` field | Populated | Populated | Unknown |
| `guest_name` populated | Almost always NULL — `quirks.md #7` | Sometimes populated | Unknown |
| `ota_reservation_id` format | HM-code (`HM3KACRAW4`) — `quirks.md #8` | Numeric string | Unknown |
| Webhook event for new review | Undocumented `event_mask` | Undocumented | Unknown |
| Polling rate-limit risk | Trivial at 20-min cadence × small fleet | Same | n/a |

---

## 3. Data model

### 3.1 `guest_reviews` (definitive column list)

`src/lib/db/schema.ts:265-319`. Migrations:

- `004_reviews.sql` — initial table.
- `009_review_dedup_and_user_scope.sql` — dedup constraint.
- `20260422010000_reviews_sync.sql` — `channex_review_id`,
  `private_feedback`, `subratings`.
- `20260423020000_add_guest_name_to_reviews.sql` — `guest_name`.
- `20260424010000_review_ota_reservation_code.sql` —
  `ota_reservation_code`.
- `20260424020000_add_guest_review_submission.sql` — three-stage
  submission columns + `guest_review_payload`.
- `20260425020000_add_review_expired_at.sql` — `expired_at`.

**Columns and semantics:**

| Column | Type | Purpose | Writers | Readers |
|---|---|---|---|---|
| `id` | uuid pk | local primary key | inserts | every read |
| `booking_id` | uuid fk → bookings.id, nullable | best-effort booking linkage via `ota_reservation_id` | sync.ts:117-118 | pending, respond, generator |
| `property_id` | uuid fk, NOT NULL | property scope | sync, generator | every read |
| `direction` | text | `incoming` \| `outgoing` (legacy — outgoing rows are dead, see §2.2) | sync hardcodes `incoming`; legacy rows exist | analytics |
| `guest_name` | text | from Channex `guest_name` (almost always NULL on Airbnb) | sync.ts:128 | resolveDisplayGuestName |
| `guest_name_override` | text | host's manual override | `/api/reviews/[reviewId]/guest-name` | resolveDisplayGuestName precedence #1 |
| `incoming_text` | text | from `raw_content.public_review` or `content` | sync.ts:122 | review card body |
| `incoming_rating` | numeric(2,1) | derived from Channex 0-10 `overall_score` via `toFiveStar()` | sync.ts:124 | rating display, bad-review predicate |
| `incoming_date` | timestamptz | from `received_at` or `inserted_at` | sync.ts:126 | sort, relative date display |
| `private_feedback` | text | from `raw_content.private_feedback` | sync.ts:123 | review card private-feedback marker |
| `subratings` | jsonb | from `scores[]` array | sync.ts:124 | (no UI today — gap §8.1) |
| `channex_review_id` | text UNIQUE | onConflict key | sync upsert | submit-guest-review, respond |
| `ota_reservation_code` | text | Channex's `ota_reservation_id` | sync.ts:120 | pending route's booking join |
| `expired_at` | timestamptz | Airbnb 14-day deadline | sync.ts:135 | is_expired derivation in pending |
| `response_draft` | text | AI draft, not yet sent | respond route generate | reply panel, status badge |
| `response_final` | text | text actually sent | respond route approve | (audit) |
| `response_sent` | boolean | did the host send it | respond route approve | filters, status |
| `status` | text | `pending` \| `published` \| (legacy) | sync initial-only, respond | filter chips |
| `scheduled_publish_at` | timestamptz | scheduled-send (legacy, unused) | (none today) | (none today) |
| `published_at` | timestamptz | when reply went out | respond approve | (audit) |
| `is_bad_review` | boolean | persisted bad-review flag | sync.ts:150 (rating < 3), `/api/reviews/approve` | filter, card highlighting |
| `ai_context` | jsonb | misc (legacy) | (none today) | (none today) |
| `guest_review_submitted_at` | timestamptz | host clicked Submit (lock) | submit-guest-review route :92 | UI gate, sync reconciliation |
| `guest_review_channex_acked_at` | timestamptz | Channex 200 | submit-guest-review :144 | UI label "Submitted, pending" |
| `guest_review_airbnb_confirmed_at` | timestamptz | sync confirmed via `reply.guest_review.public_review` match | sync.ts:172-174 | UI label "Guest reviewed" |
| `guest_review_payload` | jsonb | the payload host sent | submit-guest-review :148 | sync.ts match-check |
| `draftText` / `finalText` / `starRating` / `recommendGuest` / `privateNote` | various | LEGACY — pre-Channex outgoing-as-its-own-row model | dead code paths | analytics legacy joins |
| `created_at` | timestamptz | row insert time | default now() | sort fallback |

**Indexes:**
- `idx_guest_reviews_property` on `property_id` (filter scope).
- `idx_guest_reviews_status` on `status` (filter chips).
- `guest_reviews_channex_id_unique` on `channex_review_id` (UNIQUE,
  upsert target — `20260422010000_reviews_sync.sql`).

### 3.2 `properties` (reviews-relevant columns)

`schema.ts:19-43`.

| Column | Purpose |
|---|---|
| `channex_property_id` (text, nullable) | The pointer. NULL = no Channex linkage. **Predicate input**: `hasAnyChannexProperty` in the UI. |
| `reviews_last_synced_at` (timestamptz, nullable) | Stamped by `syncOneProperty()` (`src/lib/reviews/sync.ts:191-198`) and the Python worker on success only. Read by the "Last synced N min ago" chrome on `/reviews`. Migration: `20260425030000_properties_reviews_last_synced_at.sql` (Phase A applied 2026-04-25). |

### 3.3 `review_rules` (per-property settings)

`schema.ts:245-257`.

| Column | Purpose |
|---|---|
| `id` | uuid pk |
| `property_id` | uuid fk |
| `is_active` | gate on/off |
| `auto_publish` | DB column exists; **no UI surfaces a toggle** — explicit non-goal §1.3 |
| `publish_delay_days` | days before scheduled publish (legacy auto path) |
| `tone` | feeds `generateReviewResponse()` for AI draft tone |
| `target_keywords` | nudge AI to mention these in the draft |
| `bad_review_delay` | gate on/off for bad-review-specific behavior (legacy) |

Read by `/api/reviews/rules/[propertyId]` and the AI generator.
Settings UI at `src/components/reviews/ReviewsSettingsModal.tsx`
(195L). Modal opens from `/reviews` header gear.

### 3.4 Open schema questions (deferred decisions)

- **Locked-pending representation**: should this be a new
  `incoming_state` enum on the row (e.g. `locked_pending` /
  `revealed` / `expired_no_reveal`), or a derived boolean
  `is_revealed` written at sync time, or strictly read-time-derived?
  Recommendation: derived at sync time and persisted as
  `is_revealed boolean`. Persisting matters because filter chip
  counts, the bad-review predicate, and analytics all need the
  property without re-fetching from Channex. See §9.1 for fix path.
- **Per-platform incoming-rating scale**. Today everything is
  normalized to 0-5 via `toFiveStar()` (`sync.ts:42-46`). When BDC
  reviews land, BDC's 0-10 scale also normalizes to 0-5 — but the
  display layer should be aware of source (a 4.6 from BDC is not
  identical to a 4.6 from Airbnb, especially for trend charts).
  Recommend adding `incoming_source` column or relying on linked
  booking's `platform`. Defer until BDC ingestion.
- **`subratings` shape**. Currently raw Channex `scores[]`. To power
  the per-subrating drill-down, either define a stable normalized
  schema (`{cleanliness, communication, accuracy, ...}`) at sync
  time or store the raw shape and normalize at read time. Recommend
  raw at write, normalized at read with a small mapping helper —
  Airbnb's category set is stable; BDC's is different and the
  helper handles both.
- **Channel column**. `guest_reviews` has no `channel_code`.
  Today read paths derive `platform` from the linked booking
  (`pending/route.ts:170-178`) with fallback `'airbnb'`. When BDC
  reviews land, this becomes lossy — booking_id is often null
  (sync skips when Channex's review window outlives the booking
  feed). Recommend adding `channel_code` to guest_reviews at sync
  time using `rv.ota` mapping.

---

## 4. Channex integration

### 4.1 Endpoints used

| Channex endpoint | Where | Purpose |
|---|---|---|
| `GET /reviews?filter[property_id]=…&page[limit]=&page[number]=` | `src/lib/channex/client.ts:740-752` | Pull all reviews for a property |
| `POST /reviews/:id/reply` | `client.ts:756-762` | Send host's public reply |
| `POST /reviews/:id/guest_review` | `client.ts:778-810` | Submit host→guest counter-review (Airbnb only) |

Cross-cutting routes that exercise these:

- `POST /api/reviews/sync` → `src/lib/reviews/sync.ts:syncReviewsForUser` → loops per property → `client.getReviews()`.
- `POST /api/reviews/respond/[reviewId]` → `client.respondToReview()` (action=approve only).
- `POST /api/reviews/submit-guest-review/[reviewId]` → `client.submitGuestReview()`.
- `POST /api/properties/import` → fires `syncReviewsForOneProperty` non-blocking.
- `POST /api/channex/import` → same trigger, per imported property.
- `POST /api/channels/connect-booking-com/activate` → same trigger.

**No webhooks subscribed for review events.** `channex-expert/known-quirks.md #6` notes the `review` webhook event is documented but has no documented `event_mask` token; we haven't probed it. Polling-only.

### 4.2 Quirk reference (reviews-specific)

| Quirk | Source | How code handles it today | Open? |
|---|---|---|---|
| **#6** `/reviews` pagination silently caps at ~10/page; `page[number]` ignored beyond first batch | `quirks.md #6` | Dedup-by-id loop in `sync.ts:65-86`; bails on zero-new | No — but means no historical backfill possible |
| **#7** `guest_name` almost always NULL on Airbnb | `quirks.md #7` | `resolveDisplayGuestName()` falls through to platform-tagged label; manual override per-row | No |
| **#8** Review `ota_reservation_id` is HM-code, joins `bookings.platform_booking_id` not iCal UID | `quirks.md #8` | sync.ts:115-119 builds `bookingByOtaRes` map keyed by `platform_booking_id` | No |
| **#10** Airbnb host→guest review must be paired to incoming review id; BDC has no equivalent | `quirks.md #10` | submit-guest-review route gates `platform === 'airbnb'` (`route.ts:81-86`); UI hides CTA on BDC | No |
| **#13** `/reviews` requires `channex_messages` app installed (403 otherwise) | `quirks.md #13` | Documented; production has it installed | No |
| **#19** `/reviews/:id/guest_review` accepts shape-only — Airbnb is the real validator | `quirks.md #19` | `guest-review-validation.ts` enforces server+client; three-stage submission tracking; `airbnb_confirmed_at` only stamped after sync match | No |
| **#20** `/bookings` excludes post-checkout bookings older than ~30d → review→booking joins fail for old reviews | `quirks.md #20` | `guest_name_override` column + inline pencil edit on review cards | No |
| **#21** `expired_at` + `is_expired` exposed on `/reviews/:id`; aged reviews drop from listing entirely | `quirks.md #21` | `expired_at` stored at sync; `is_expired` derived at read time in `pending/route.ts:178-183` with `incoming_date + 14d` fallback | No |
| **#22** Outer-catch rollback required because Channex 200 is not Airbnb-confirmed | `quirks.md #22` | submit-guest-review has both inner classified rollback (`route.ts:120-140`) and outer catch-all (`:170-184`) | No |
| **(NEW)** Locked-pending state — Channex returns review entity pre-reveal with `overall_score`/`content` zeroed or null | This doc §9.1 | **Misclassified** as bad review by `sync.ts:150` and `ReviewCard.tsx:129` | **Yes** — needs probe + fix |
| **(NEW)** No documented `event_mask` for review webhook | `quirks.md #6` workaround section | Polling 20-min via worker, plus on-connect trigger; **timer not yet enabled** | **Yes** — escalate to Channex support |

### 4.3 Future Channex work

1. **Confirm review-event webhook subscription**. Probe: try
   `POST /webhooks` with `event_mask` permutations
   (`review`, `review_new`, `reviews`, `*`); see what gets accepted.
   If accepted, switch from polling to webhook + occasional
   reconciliation pull.
2. **Probe BDC `/reviews` shape**. We have Airbnb-only data. Once
   Cesar reconnects a BDC channel with reviews, capture a sample
   payload; document subrating categories; decide on normalization.
3. **Probe locked-pending payload shape** (§9.1). Read-only GET on
   a known-pending review; capture `overall_score`,
   `raw_content`, `is_replied`, `expired_at`, `is_expired`,
   `scores[]` exactly. Result drives §3.4 decision and §9.1 fix.

---

## 5. API surface

### 5.1 `/api/reviews/*`

All routes under `src/app/api/reviews/`.

| Method + Path | File | Auth | Purpose | Notable side effects |
|---|---|---|---|---|
| `GET /api/reviews/pending` | `pending/route.ts` (219L) | `getAuthenticatedUser` + property scope | Returns `{ reviews[], properties[] }` for the user. Reviews carry display-ready fields including `display_guest_name`, `is_expired`, `private_feedback`, etc. | None (read-only). |
| `POST /api/reviews/sync` | `sync/route.ts` (38L post-6.7) | Auth required | Calls `syncReviewsForUser()` helper | Upserts `guest_reviews`; stamps `properties.reviews_last_synced_at` per-property on success |
| `POST /api/reviews/respond/[reviewId]` | `respond/route.ts` (153L) | `verifyReviewOwnership` | Triple-mode: `action='generate'` (default), `action='save_draft'`, `action='approve'` | `approve` calls `client.respondToReview()`; on Channex non-200, NO local mutation. On 200, sets `response_sent`, `published_at`, `status='published'` |
| `POST /api/reviews/approve/[reviewId]` | `approve/route.ts` (61L) | `verifyReviewOwnership` | Persist edited draft text + `is_bad_review` flag (LEGACY-ish, used for "Mark as bad review" menu action) | Updates `is_bad_review` |
| `POST /api/reviews/generate/[bookingId]` | `generate/route.ts` (169L) | `verifyBookingOwnership` | LEGACY — generates an outgoing review from a booking (pre-two-sided model). Today the host→guest path goes through the incoming-review counter-review flow (§2.2), so this route is dead but not deleted | Inserts a `direction='outgoing'` row |
| `POST /api/reviews/generate-guest-review/[reviewId]` | `generate-guest-review/route.ts` (89L) | `verifyReviewOwnership` | AI-drafts only the `public_review` text for the host→guest counter-review form. Scores + recommendation are host judgment — never auto-filled | None |
| `POST /api/reviews/submit-guest-review/[reviewId]` | `submit-guest-review/route.ts` (186L) | `verifyReviewOwnership` | Three-stage submission: lock + Channex POST + ack stamp. Inner+outer rollback. Validation enforced server-side | Stamps `guest_review_submitted_at` then `guest_review_channex_acked_at`; `airbnb_confirmed_at` set later by sync |
| `POST /api/reviews/[reviewId]/guest-name` | `[reviewId]/guest-name/route.ts` (47L) | `verifyReviewOwnership` | Set/clear manual guest-name override | Updates `guest_name_override` |
| `GET/PUT /api/reviews/rules/[propertyId]` | `rules/route.ts` (73L) | `verifyPropertyOwnership` | Read/upsert `review_rules` row | Updates `review_rules` |
| `GET /api/reviews/analytics/[propertyId]` | `analytics/route.ts` (78L) | `verifyPropertyOwnership` | Returns aggregated stats (avg incoming rating, count incoming, count outgoing, response rate) | None |

### 5.2 Cross-cutting routes (trigger sites)

- `POST /api/properties/import` (single-property; `properties/import/route.ts:344-356`) — fires `syncReviewsForOneProperty` non-blocking with `.catch` log.
- `POST /api/channex/import` (bulk; `channex/import/route.ts:264-280`) — fires per imported property, including `imported_with_errors`. Same `.catch` shape.
- `POST /api/channels/connect-booking-com/activate` — fires after BDC channel activation (`activate/route.ts:283-296`).

### 5.3 Auth model

- Manual UI flows go through `getAuthenticatedUser` (Supabase SSR cookie).
- `verifyPropertyOwnership` / `verifyBookingOwnership` / `verifyReviewOwnership` (`src/lib/auth/api-auth.ts`) gate per-resource access.
- The Python worker uses `SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS — global property scope, not per-user.
- The on-connect trigger from import handlers calls the helper directly (in-process), using a service-role client for writes. No HTTP round-trip.

### 5.4 Webhook surface

`POST /api/webhooks/channex` exists but **does not handle reviews**. Today it processes booking-related events (`booking_new`, `booking_modification`, `booking_cancellation`). Quick grep: zero matches for `review` in the webhook handler. Reviews remain pull-only.

---

## 6. UI surface

### 6.1 Pages and routes

| Route | File | Notes |
|---|---|---|
| `/reviews` | `src/app/(dashboard)/reviews/page.tsx` (454L post-6.7) | Single-page list; client component; all read state via `/api/reviews/pending` |
| `/reviews/loading.tsx` | not present (no separate loading boundary; the page renders 4 skeletons internally) | |

### 6.2 Components

| File | Purpose | Key external deps |
|---|---|---|
| `src/components/reviews/ReviewCard.tsx` (448L) | Per-row card. Header (avatar + name editable + platform logo + relative date), body (truncated text + read-more), markers (bad-review, private feedback), actions (Reply, Review-this-guest, more-menu) | `ReviewReplyPanel`, `GuestReviewForm`, `PlatformLogo` |
| `src/components/reviews/ReviewReplyPanel.tsx` (259L) | Inline reply panel: AI generate, edit, save draft, approve & send | `/api/reviews/respond` (3 actions) |
| `src/components/reviews/GuestReviewForm.tsx` (373L) | Modal for host→guest counter-review: scores per category, public_review, optional private_review, recommend Y/N, AI draft public_review | `/api/reviews/submit-guest-review`, `/api/reviews/generate-guest-review`; uses `validateGuestReviewPayload` client-side too |
| `src/components/reviews/ReviewFilterChips.tsx` (87L) | Top-row chip filter: all / needs_response / responded / bad / private | None |
| `src/components/reviews/ReviewSkeletonCard.tsx` (26L) | Loading-state placeholder | None |
| `src/components/reviews/ReviewsSettingsModal.tsx` (195L) | Per-property `review_rules` editor (tone, keywords, etc.) | `/api/reviews/rules/[propertyId]` |

### 6.3 Empty state taxonomy

`src/app/(dashboard)/reviews/page.tsx:347-407` cascade (post-6.7):

| Predicate | State | Copy |
|---|---|---|
| `loading` | 4 skeleton cards | (none) |
| `!hasAnyProperty` | `Plus` icon empty state | "Add a property to see reviews" / CTA → `/properties/import?from=reviews` |
| `!hasAnyChannexProperty` | `Plug` icon empty state | "Connect a channel to see reviews" / CTA → `/properties/import?from=reviews` |
| `!hasAnyReviews` | `MailX` icon empty state | "No reviews yet" / no CTA |
| `visible.length === 0` (filters too narrow) | "Clear filters" CTA | "No reviews match these filters" |
| else | review list | (renders cards) |

`hasAnyChannexProperty` is `userProperties.some(p => !!p.channex_property_id)` (`page.tsx:146-149`). Requires `/api/reviews/pending` to return `channex_property_id` per property — added in 6.7-POST.

### 6.4 Chrome (gated on `hasAnyChannexProperty`)

`page.tsx:252-280`. Hidden when no Channex property is connected.

- **Refresh-now button** — calls `/api/reviews/sync` with optional `property_id` scope. 60s cooldown enforced client-side (`page.tsx:96`). Loading state spins the icon.
- **Last synced label** — `lastSyncedLabel` (`page.tsx:142-144`). Branches on null: `lastSyncedIso ? ` `Last synced ${formatRelativeAgo(...)}` ` : `"Never synced"`. The grammar bug from 6.6 is fixed here.
- **Tooltip** — `refreshTitle` (`page.tsx:140`) shows the absolute timestamp via `toLocaleString()`.
- **Min vs max rule** — `lastSyncedIso` uses the **OLDEST** stamp across in-scope properties (`page.tsx:115-126`). On "all" filter, the badge shows the worst-case across the portfolio. On a single-property filter, that property's stamp.

The relative label re-renders every 30s and on window focus
(`page.tsx:54-59`). When `bannerOpenedAt` is set, the auto-fade
predicate (`page.tsx:154-167`) checks `nowTick - bannerOpenedAt >
JUST_CONNECTED_BANNER_TTL_MS (5min)`.

### 6.5 Banners and toasts

| Trigger | Surface |
|---|---|
| `?just_connected=1` query param | Lagoon-tinted banner, auto-fades on first review-bearing refetch OR after 5 min OR manual X. `page.tsx:307-330` |
| Refresh success | Toast: `"Reviews up to date"` or `"Synced — N new, M updated"` (`page.tsx:91-94`) |
| Refresh failure | Toast (error variant) with surfaced error message |
| Reply send success / failure | From `ReviewReplyPanel` |
| Submit guest review success | "Review submitted. Airbnb typically confirms within 5-15 minutes." (`GuestReviewForm.tsx:97`) |
| Submit guest review failure | Surfaced error message |
| All caught up | Lagoon-tinted banner above the list when every review has a response. `page.tsx:419-426` |

### 6.6 CTAs and routing

| CTA | Where | Destination |
|---|---|---|
| "Add a property" | empty state `!hasAnyProperty` | `/properties/import?from=reviews` |
| "Connect a channel" | empty state `!hasAnyChannexProperty` | `/properties/import?from=reviews` |
| Refresh now | header | `POST /api/reviews/sync` |
| Settings gear | header | opens `ReviewsSettingsModal` |
| Property selector | header | client-only filter |
| Channel selector | filter row (only when scope has multi-channel) | client-only filter |
| Sort dropdown | filter row | client-only sort |
| Reply to guest | per-card | opens `ReviewReplyPanel` |
| Review this guest | per-card (Airbnb only, gated by lifecycle state) | opens `GuestReviewForm` |
| Mark as bad review | per-card more-menu | `POST /api/reviews/approve/[id]` with `is_bad_review:true` |
| Copy review text | per-card more-menu | clipboard |
| Edit guest name | per-card hover-pencil | `POST /api/reviews/[id]/guest-name` |
| Clear filters | empty state when filters too narrow | client-only |

The `?from=reviews` plumbing post-6.7-POST:

- `/properties/import/page.tsx:33-35` reads `from` via `useSearchParams`.
- Done button at `:266-271` branches: `fromReviews → /reviews?just_connected=1` else `/properties`.
- `/properties/new/page.tsx:71-73` reads the same param. Submit handler at `:208` uses the same branch.
- `BookingComConnect` modal accepts `redirectTo` prop (`BookingComConnect.tsx:8-13`); no caller sets it today (defensive plumbing).

---

## 7. Worker subsystem

### 7.1 `reviews_sync.py`

Lives at `~/koast-workers/reviews_sync.py` on the Virginia VPS.
~230 LOC. Mirrors `booking_sync.py` patterns: `dotenv`, service-role
Supabase client, `httpx`, file+stdout logging at
`/var/log/koast/reviews.log`.

**Behavior:**
- Reads all `properties` with `channex_property_id IS NOT NULL` (global, not per-user).
- For each property, paginates `/reviews?filter[property_id]=…` with the same dedup-by-id loop (Channex pagination cap from `quirks.md #6`).
- Preloads bookings keyed by `platform_booking_id` for `ota_reservation_id` lookup.
- Preloads existing `guest_reviews` rows by `channex_review_id` for new vs updated counting.
- Initial-insert-only defaults: `status` from `is_replied`, `is_bad_review` from `rating < 3`. (Same persisted-misclassification bug as the route — §9.1.)
- Stamps `properties.reviews_last_synced_at` on success only.
- Per-property `try/except`; one bad property does not abort the run.

### 7.2 systemd

`~/koast-workers/systemd/koast-reviews-sync.{service,timer}`.
- Service: oneshot, `User=ubuntu`.
- Timer: `OnUnitActiveSec=20min`, `RandomizedDelaySec=300`,
  `OnBootSec=2min`.
- **Not enabled.** Per Session 6.6 commit body, deliberate — needs supervised manual run before enable. As of 2026-04-25, `/var/log/koast/reviews.log` does not exist; the worker has never run on the VPS.

### 7.3 On-connect trigger pattern

Three call sites all invoke `syncReviewsForOneProperty(prop)` from `src/lib/reviews/sync.ts:285-303`:

1. `src/app/api/properties/import/route.ts:344-356`.
2. `src/app/api/channex/import/route.ts:264-280`.
3. `src/app/api/channels/connect-booking-com/activate/route.ts:283-296`.

All three follow the same `void X({...}).catch(err => console.error(...))` shape. The helper itself is internally try/wrapped — the `.catch` is defensive against module-level rejections.

### 7.4 `reviews_last_synced_at` semantics

- Stamped per-property by both the helper (any in-process call) and the Python worker.
- NULL = never synced for that property.
- The UI's "Last synced" label uses the OLDEST stamp across the in-scope set (§6.4). When any property in scope has NULL, the label shows "Never synced" (no prefix) — meaning at least one property in scope has never been synced.
- Useful as a freshness signal, not as a per-row sync timestamp; per-review freshness is implicit from `incoming_date` and the worker cadence.

---

## 8. Gap analysis vs target MVP

### 8.1 Feature matrix

| Feature | Status | Evidence | Gap |
|---|---|---|---|
| Pull reviews from Channex | **shipped** | `sync.ts`, `reviews_sync.py` | Worker timer not enabled |
| Display reviews in list | **shipped** | `page.tsx`, `ReviewCard.tsx` | No virtualization (small fleets only) |
| Filter: needs-response / responded / bad / private | **shipped** | `ReviewFilterChips.tsx`, `page.tsx:185-200` | Bad-review predicate broken on locked reviews (§9.1) |
| Filter: per-property | **shipped** | `page.tsx:198-202` | None |
| Filter: per-channel | **shipped (when multi)** | `page.tsx:204-218` | Auto-derived from review set; if no BDC reviews are present, no chip |
| Filter: per-rating bucket | **missing** | (no implementation) | Would slot into `ReviewFilterChips` |
| Filter: date range | **missing** | (no implementation) | Adds a controlled select, server unchanged |
| Sort: most-recent / lowest-rating / needs-response-first | **shipped** | `page.tsx:194-201` | None |
| AI-drafted reply | **shipped** | `respond/route.ts`, `generator.ts` | None |
| Edit & save draft | **shipped** | respond `action='save_draft'` | None |
| Approve & send via Channex | **shipped** | respond `action='approve'` | None |
| Bad-review highlighting | **shipped** | `ReviewCard.tsx:129,312-317` | Misclassifies locked-pending (§9.1) |
| Private-feedback marker | **shipped** | `ReviewCard.tsx:319-323` | None |
| Guest-name resolver + manual override | **shipped** | `guest-name.ts`, `[reviewId]/guest-name/route.ts` | None |
| Host→guest counter-review (Airbnb) | **shipped** | `submit-guest-review/route.ts`, `GuestReviewForm.tsx` | Three-stage tracked; rollback robust |
| Two-sided window expiry display | **shipped** | `expired_at` + `is_expired` in `pending/route.ts:178-183` | None |
| Locked-pending state | **MISSING** | n/a | §9.1 |
| Subratings drill-down (per-category bars) | **missing** | `subratings` jsonb stored, no UI | Slot under expanded review card |
| Dashboard strip (avg rating, count, response rate, response time) | **missing** | `analytics/route.ts` exists but no consumer in /reviews | New header strip on `/reviews` |
| Trend visualization (rolling 30/90 day rating) | **missing** | n/a | Likely `/api/reviews/analytics/[propertyId]` extension + chart component |
| Per-property ranking surface | **missing** | n/a | Pulls from analytics + properties table |
| Cross-channel rating normalization (BDC ↔ Airbnb) | **n/a until BDC data lands** | `toFiveStar()` is correct shape, just no data | §3.4 open question |
| Review-event webhook subscription | **missing** | quirks.md #6 — undocumented event_mask | Probe Channex |
| Manual Refresh button + cooldown | **shipped** | `page.tsx:252-275`, `:96` | None |
| `Last synced N min ago` chrome | **shipped** | `page.tsx:142-144` | Grammar fixed in 6.7 |
| `?just_connected=1` banner | **shipped** | `page.tsx:307-330` | None |
| On-connect sync trigger from all import paths | **shipped** | three sites | None |
| VPS background worker | **shipped, disabled** | `reviews_sync.py`, systemd files | Timer must be enabled before MVP |
| `properties.reviews_last_synced_at` | **shipped** | migration 20260425030000 + helper writes | None |
| Slide-over detail surface | **deviates from spec** | Today is **inline expand** within the card | Conscious deviation per §1.1 — cards are dense enough; revisit if hosts want a focus mode |

### 8.2 Tier 1 vs Tier 2 (private beta cut)

**Tier 1 — must ship before private beta:**

- §9.1 locked-pending fix.
- Worker timer enabled on VPS.
- Dashboard strip with the 4 numbers (avg rating, count this period, response rate, p50 response time).
- Trend chart (rolling 30/90).
- Subratings UI (at minimum, an expanded-card breakdown).

**Tier 2 — post-beta polish:**

- Date-range filter.
- Per-rating bucket filter.
- Per-property ranking surface.
- BDC ingestion.
- Review-event webhook (replace polling).
- CSV export.
- Auto-publish (only if hosts ask).

---

## 9. Open bugs

### 9.1 Locked-pending Airbnb review misclassified as bad review

**Severity:** **High.** Visible to hosts as a coral-bordered "Bad
review" card with no text, often before the guest has actually
written anything. Erodes trust in the surface.

**Root cause path:**

1. Airbnb's two-sided model holds the review in a locked state until
   the window resolves. Channex exposes the entity — but the
   rating/text fields are zeroed/null pre-reveal. (Cesar's
   observation; needs probe-confirmation against a known-pending
   review).
2. `src/lib/reviews/sync.ts:150` writes `is_bad_review = rating5 != null && rating5 < 3` at first sync. If `overall_score` is `0` (numeric, not null), `toFiveStar(0) === 0.0`, predicate returns true, **`is_bad_review` is persisted** even after the row reveals.
3. `src/components/reviews/ReviewCard.tsx:129` re-derives the same flag at read time: `const isBad = review.is_bad_review || (rating != null && rating < 4);`. Same pre-reveal misfire even if the persisted flag is fixed.
4. `src/app/(dashboard)/reviews/page.tsx:187,213` filter chip predicate uses the same `< 4` rule.

**Where the fix slots in:**

- **Sync layer (`src/lib/reviews/sync.ts:150`):** gate the predicate
  on a "review is actually revealed" check before computing `<3`.
  Concrete: `is_revealed = (overall_score != null && overall_score > 0) || !!raw_content?.public_review || (scores?.length ?? 0) > 0`. Set `is_bad_review = is_revealed && rating5 < 3`.
- **Persisted column (§3.4 schema question):** add
  `is_revealed boolean default false` and stamp at sync time so the
  UI doesn't have to recompute.
- **Read layer (`ReviewCard.tsx:129`):** branch on `is_revealed`.
  Pre-reveal cards render a distinct "Awaiting reveal" badge with no
  rating, no bad-review styling.
- **Filter (`page.tsx:187,213`):** treat `!is_revealed` as outside
  the bad-review bucket entirely.

**Probe required before fix:**

- GET `/reviews?filter[property_id]={Villa Jamaica id}` and find any
  review whose state is plausibly locked (recent check-out, no
  reply yet, no host submission). Capture: `overall_score`,
  `raw_content`, `is_replied`, `is_expired`, `expired_at`,
  `scores[]`. Document in `channex-expert/known-quirks.md` as new
  quirk + cite from this blueprint.
- DO NOT do a write probe (`channex-expert/playbooks.md > Probe-then-implement`).

### 9.2 Worker timer not enabled

**Severity:** Medium. Manual Refresh + on-connect cover the live
paths, but the steady-state safety net for new reviews arriving from
an existing connection is offline. A host who doesn't open Koast for
a week sees stale data.

**Fix:** supervised manual run + `systemctl enable --now koast-reviews-sync.timer` per Session 6.6 commit body's deploy steps.

### 9.3 Legacy `direction='outgoing'` rows still queryable

**Severity:** Low. `/api/reviews/analytics/[propertyId]` filters
`direction === 'outgoing'` (`analytics/route.ts:36`), but the model
no longer creates these (§2.2). Old rows from `004_reviews.sql` era
still exist for some properties. Either backfill them out, or accept
they pollute the count. Not user-visible today.

### 9.4 `auto_publish` column is a footgun

**Severity:** Low. Column exists (`schema.ts:249`) but no UI
exposes it. If a future session wires it without re-checking the
non-goal in §1.3, hosts could end up auto-replying without trust
calibration. Recommend either deleting the column or commenting it
out in schema.ts pending an explicit product decision.

### 9.5 `/api/reviews/generate/[bookingId]` is dead code

**Severity:** Low. 169L route that creates `direction='outgoing'`
rows. Pre-two-sided-model artifact. Today only the
counter-review-on-incoming-row path is wired (§2.2). Remove or
gate behind a feature flag in a cleanup session.

### 9.6 No virtualization on the review list

**Severity:** Low (today). With 2 properties × ≤14 reviews each,
the DOM is fine. At 50 properties × 100 reviews each, the page will
janitor. Tier 2 problem; flag for awareness.

---

## 10. Roadmap

Ordered by priority. Each item is a single session unless noted.

### Tier 1 — private beta blockers

#### T1.1 — Fix locked-pending state

- Implements §2.1, §3.1 (`is_revealed` column), §9.1.
- Probe Channex `/reviews/:id` for a known-pending review.
  Document the payload in `channex-expert/known-quirks.md` as a
  new quirk.
- Migration: add `is_revealed boolean default false` to `guest_reviews`. Backfill `true` where `incoming_rating IS NOT NULL`.
- Sync helper change: derive `is_revealed` from sync payload; gate `is_bad_review` predicate on `is_revealed`.
- UI change: `ReviewCard.tsx:129` and `page.tsx:187,213` branch on
  `is_revealed`. New "Awaiting reveal" badge style.
- **Size: medium** (~3-4h).
- **Blocking dependency:** the Channex probe.

#### T1.2 — Enable VPS reviews timer

- Implements §7.2.
- Supervised manual run; tail `/var/log/koast/reviews.log`;
  enable timer.
- No code change.
- **Size: small** (~30min).
- **Blocking dependency:** none.

#### T1.3 — Dashboard strip (4-number summary)

- Implements §1.1 q2 + q3 (rating + portfolio drag).
- New `GET /api/reviews/dashboard` (or extension of analytics) returning per-property and aggregated: `count`, `avg_rating`, `response_rate`, `median_response_time_hours`.
- New `ReviewsDashboardStrip.tsx` component above the list.
- Wired into the `/reviews` page header. Drops below empty-state cascade.
- **Size: medium** (~4h).
- **Blocking dependency:** none.

#### T1.4 — Trend chart (rolling 30/90 day rating)

- Implements §1.1 q2.
- Backend: extension to T1.3's endpoint, returning `series` per
  property over a window.
- Frontend: canvas chart per the design system (no chart libraries
  per `CLAUDE.md`). Single line per property, threshold band at
  4.5.
- **Size: medium** (~5h, mostly canvas).
- **Blocking dependency:** T1.3.

#### T1.5 — Subratings drill-down

- Implements §1.1 q3 ("which subrating is dragging me down").
- Probe BDC subratings shape if any BDC reviews exist.
- Read-time normalizer mapping Channex categories → canonical (`{cleanliness, communication, accuracy, location, value, checkin}`).
- Per-card: expand row to show six bars.
- Aggregated: per-property weakest subrating surfaced in T1.3 strip.
- **Size: medium** (~4h).
- **Blocking dependency:** T1.3 + decision in §3.4 on subratings normalization location.

### Tier 2 — post-beta polish

#### T2.1 — Date-range + per-rating filter

- Implements §1.1 q1 (refinement).
- Adds two more controls to `ReviewFilterChips`. Server unchanged
  (filter is purely client over the existing list).
- **Size: small** (~2h).

#### T2.2 — Review-event webhook

- Implements §4.3.1.
- Probe `event_mask`. If found, switch from polling to webhook; reduce worker cadence to once-daily reconciliation.
- **Size: medium** (~3h with successful probe; large if Channex support is the blocker).

#### T2.3 — BDC review ingestion

- Implements §4.3.2 + §3.4 schema decisions.
- Probe BDC-connected property for `/reviews` payload shape.
- Define + persist channel column on guest_reviews.
- Display platform pills correctly per review.
- Disable host→guest CTA on BDC.
- **Size: medium** (~4h post-probe).

#### T2.4 — Per-property ranking surface

- Implements §1.1 q3 (the actual ranking, not just the strip).
- New surface (could be a Properties tab section, or a `/reviews?view=ranking` toggle).
- **Size: medium** (~4h).

#### T2.5 — Dead code cleanup

- Implements §9.3, §9.4, §9.5.
- Delete `/api/reviews/generate/[bookingId]`. Gate or delete `auto_publish`. Backfill or filter legacy `direction='outgoing'` rows.
- **Size: small** (~2h).

#### T2.6 — Virtualization

- Implements §9.6.
- Drop in `react-window` or hand-roll with the Calendar's pattern.
- **Size: small** (~3h, mostly testing).

#### T2.7 — CSV export

- Single endpoint, single button.
- **Size: small** (~2h).

---

## 11. Skill update plan (for the follow-up commit, NOT this session)

### 11.1 `channex-expert/references/known-quirks.md`

- **Add quirk #23 (proposed):** "Locked-pending Airbnb reviews
  expose the entity with rating=0 / null content while the 14-day
  window is open. Probe-validated YYYY-MM-DD on review {id} (Villa
  Jamaica). Workaround: gate `is_bad_review` and rating display on
  an `is_revealed` predicate computed from `overall_score > 0 ||
  raw_content.public_review || scores.length > 0`. Persist this
  predicate at sync time."
- **Add quirk #24 (proposed):** "BDC `/reviews` subrating categories
  diverge from Airbnb's. Document the BDC set after first probe."
  Hold until first BDC review lands.

### 11.2 `koast-development/references/architecture.md`

- Cross-link to `docs/REVIEWS_BLUEPRINT.md` from §"Reviews subsystem"
  (does not exist yet — add a stub section pointing at this doc).

### 11.3 `koast-development/references/playbooks.md`

- "Single TS sync helper consumed by route + on-connect callers, mirrored by Python worker for steady-state" is the pattern Sessions 6.6 + 6.7 settled on. Worth promoting from this commit's note into a named playbook ("Two-headed sync subsystem"). Hold until a second example exists (booking sync or messages sync) so the playbook isn't generalized from one case.

### 11.4 `koast-development/references/tech-debt.md`

- Add §9.4 (`auto_publish` footgun) as a tracked debt item.
- Add §9.5 (dead generate route) as a tracked debt item.

**Skill commits land alongside the first build session that exercises the new pattern. Not in this blueprint commit.**

---

## 12. Open questions for Cesar

1. **Locked-pending probe.** OK to do a single read-only `GET /reviews/:id` against Villa Jamaica + Cozy Loft to capture the locked-pending payload? No write traffic, but does hit production Channex.
2. **`is_revealed` representation.** Persisted boolean (recommended) vs derived-only at read time? Persisting means we need the migration; derived means the analytics endpoint also has to recompute. Persisted wins on simplicity.
3. **Subrating normalization.** Map Channex categories to a canonical six-axis at sync time, or store raw and normalize in `pending/route.ts`? Persisted recommendation isn't free either way; sync-time normalization is more work but read paths are simpler.
4. **Slide-over deviation.** Original audit specified a slide-over detail surface; Sessions 6.x landed on inline-expand within the card. Approve the deviation, or restore slide-over for Tier 1?
5. **Dashboard strip placement.** Above the list (default), or as a sticky banner on scroll? Recommend above-the-list for the first iteration; revisit after host feedback.
6. **`auto_publish` decision.** Delete the column entirely, or hold for a future calibration session? Recommend delete + re-add when a real product decision comes in. Keeping it adds risk with zero benefit.
7. **Trend chart granularity.** Rolling 30 + 90, or rolling 7 / 30 / 90? Recommend 30 + 90 with a toggle. Avoid 7 — too noisy for small fleets.
8. **Tier 1 cut.** All five (T1.1–T1.5) feel like beta blockers. Push T1.4 (trend chart) to Tier 2 if the cut needs to be tighter? Recommend keeping all five — the trend chart is a key q2 answer.
9. **Worker enable.** Enable the timer immediately (T1.2 standalone), or bundle with T1.1 so the locked-pending fix lands in the same session that turns the timer on?

---

## Appendix A — File inventory (reviews-touching)

```
src/app/(dashboard)/reviews/page.tsx              454L
src/app/api/reviews/pending/route.ts              219L
src/app/api/reviews/sync/route.ts                  38L
src/app/api/reviews/respond/[reviewId]/route.ts   153L
src/app/api/reviews/approve/[reviewId]/route.ts    61L
src/app/api/reviews/generate/[bookingId]/route.ts 169L  (dead — §9.5)
src/app/api/reviews/generate-guest-review/[reviewId]/route.ts  89L
src/app/api/reviews/submit-guest-review/[reviewId]/route.ts   186L
src/app/api/reviews/[reviewId]/guest-name/route.ts 47L
src/app/api/reviews/rules/[propertyId]/route.ts    73L
src/app/api/reviews/analytics/[propertyId]/route.ts 78L
src/lib/reviews/sync.ts                           305L
src/lib/reviews/generator.ts                      195L
src/lib/reviews/guest-review-validation.ts        120L
src/lib/channex/guest-review-types.ts              42L
src/lib/guest-name.ts                              60L
src/components/reviews/ReviewCard.tsx             448L
src/components/reviews/ReviewReplyPanel.tsx       259L
src/components/reviews/GuestReviewForm.tsx        373L
src/components/reviews/ReviewFilterChips.tsx       87L
src/components/reviews/ReviewSkeletonCard.tsx      26L
src/components/reviews/ReviewsSettingsModal.tsx   195L
~/koast-workers/reviews_sync.py             ~230L (VPS, not git-tracked)
~/koast-workers/systemd/koast-reviews-sync.{service,timer}
```

Channex client (review-relevant section): `src/lib/channex/client.ts:736-810`.

Cross-cutting trigger sites:
- `src/app/api/properties/import/route.ts:344-356`
- `src/app/api/channex/import/route.ts:264-280`
- `src/app/api/channels/connect-booking-com/activate/route.ts:283-296`

Migrations (chronological):
```
004_reviews.sql
009_review_dedup_and_user_scope.sql
20260422010000_reviews_sync.sql
20260423020000_add_guest_name_to_reviews.sql
20260424010000_review_ota_reservation_code.sql
20260424020000_add_guest_review_submission.sql
20260425020000_add_review_expired_at.sql
20260425030000_properties_reviews_last_synced_at.sql
```

## Appendix B — Session arc (chronological context)

| Session | Commit | Scope |
|---|---|---|
| 6 | (early) | Sync infra: pull `/reviews`, dedup, upsert. Manual route only. |
| 6.1a / 6.1b / 6.1c | various | Unified feed, ota_reservation_code stamping, name resolver. |
| 6.2 | (n/a, see commit body) | Three-stage host→guest counter-review submission tracking. |
| 6.3 | 5fd31fc | Forward-looking booking pipeline, manual name override. |
| 6.3-fixup | 7893bb1, ec6575a | Cleanup. |
| 6.5 | 7513c8f | Reviews visibility paradox + outer-catch rollback gap. |
| 6.5-followup | 4ffe1cc | Fallback `is_expired` for purged Channex reviews. |
| 6.6 | e6ffda2 | Background sync worker + manual Refresh button + last_synced chrome. |
| 6.7 | 4e93d2b | Empty-state journey + on-connect sync (single-property + BDC routes). |
| 6.7-POST | c9af884 | CTA target fix, post-import redirect, bulk import trigger, consistency pass. |
| **6.8** | (this commit) | Blueprint document. |

## Appendix C — Glossary

- **Channex review id** — Channex's UUID for a review entity. Stable across the review's lifetime. Upsert key.
- **`ota_reservation_id`** — Channex's representation of the OTA's confirmation code (Airbnb HM-code, BDC numeric). Joins to `bookings.platform_booking_id`.
- **Locked-pending** (this doc) — incoming review whose 14-day Airbnb reveal window is still open and neither side has submitted. The entity is exposed by Channex but rating/content is zeroed/null.
- **Three-stage submission** — Session 6.2 pattern for host→guest counter-review writes. Three stamps: submitted_at (intent) → channex_acked_at (Channex 200) → airbnb_confirmed_at (next sync match).
- **On-connect trigger** — Session 6.7 pattern. Import handlers call `syncReviewsForOneProperty` non-blocking with `.catch` log. Three call sites.
- **Worker / route parity** — Sessions 6.6 + 6.7 ship two implementations of the same upsert logic: TypeScript helper in-process (route + on-connect) and Python worker out-of-process. They MUST stay in sync — when one changes, the other follows in the same commit when possible.
