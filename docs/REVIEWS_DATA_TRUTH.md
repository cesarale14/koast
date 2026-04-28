# Reviews Data Truth

> Diagnostic companion to `docs/REVIEWS_BLUEPRINT.md`. Produced
> 2026-04-25 between Sessions 6.8 and the render-layer rebuild.
> Read-only. PII redacted throughout.

## 0. Status

The reviews subsystem's **data layer is materially correct**. The
sync worker, schema, and helpers persist what Channex returns,
correctly attributed to the right property. **Five of the bugs Cesar
attributes to "data correctness" are actually render-layer bugs OR
artifacts of source-data scarcity that the data layer cannot solve
on its own**. One blueprint hypothesis (locked-pending) is wrong and
needs amendment.

This document is the contract for the render-layer rebuild. It
locks in what data the rebuild can rely on, what's null where, why,
and what the new render layer must handle gracefully.

Citations: `path:line`. Channex evidence: live probe at 2026-04-25
22:12 UTC against production. Probe scope honored: 2 properties + 2
review listings, no per-id GETs needed.

---

## 1. The three-column comparison

| Concept | Source of truth (Channex) | What we persist (DB) | What we render (UI) | Delta |
|---|---|---|---|---|
| **Property attribution** | review's `relationships.property.data.id` (Channex property UUID) | `guest_reviews.property_id` (Koast property UUID; mapped via `properties.channex_property_id`) | implicit — review groups under `property_id` filter | **No delta.** All 11 stored reviews map to Villa Jamaica's Koast id; all 10 currently-returned Channex reviews have `relationships.property.data.id=4d52bb8c-…` (Villa Jamaica). Cozy Loft has 0 reviews on both sides. |
| **Property display name** | `properties.attributes.title` = `"Villa Jamaica - StayCommand"` (verbatim) | `properties.name` = same string, written at import time | `ReviewCard.tsx:265` renders `review.property_name`, sourced from `properties.name` via `pending/route.ts:36-44` | **Real delta** — host has no UI to edit. Channex's title was imported verbatim and is now the host-visible label. §2.2 |
| **Guest name** | `attributes.guest_name` — **null on every Airbnb review** (10/10 confirmed); also `attributes.reviewer_name` field absent entirely | `guest_reviews.guest_name` = null (mirroring source) on all 11 rows; `guest_review.booking_id` = **null on every row** (booking-link broken — see below) | `ReviewCard.tsx:130-137,210` via `resolveDisplayGuestName()` (`src/lib/guest-name.ts:54-66`). Falls through to platform fallback "Airbnb Guest" universally | **Multi-cause delta.** Tier 3 (Channex) is null per `quirks.md #7`. Tier 2 (booking) silently fails because the join key mismatches (HM-code ≠ iCal email UID). Tier 1 (override) is the only working path today. §2.3 |
| **Channel attribution** | `attributes.ota` = `"AirBNB"` on all 10 reviews | `guest_reviews` has **no `channel_code`** column. `pending/route.ts:170-178` derives `platform` from the linked booking, with hardcoded `"airbnb"` fallback when booking is null | `ReviewCard.tsx:262` renders `<PlatformLogo platform={review.platform} />`. Today every card is "airbnb" — but **only because the fallback fires**, not because the data confirms it | **Lossy by accident.** Right answer today, wrong reason. When BDC reviews land, the missing booking link will mean every BDC review also displays as "airbnb". §2.4 |
| **Rating (overall)** | `attributes.overall_score` (0-10 scale) | `guest_reviews.incoming_rating` (numeric(2,1), 0-5) via `toFiveStar()` (`sync.ts:42-46` / `reviews_sync.py:107`) | `ReviewCard.tsx:60-66` renders rounded stars + 1-decimal numeric | **No delta** for revealed reviews. Channex rating=10 → display 5.0 ✓. |
| **Rating (subratings)** | `attributes.scores[]` — array of `{score, category}` (Airbnb categories: clean, accuracy, checkin, communication, location, value) | `guest_reviews.subratings` jsonb, persisted raw | **Not rendered anywhere.** Stored but no UI surface | **Dead persistence.** §2.8 + Tier 1 blueprint item T1.5 |
| **Review text (public)** | `attributes.raw_content.public_review` (string, 1-357c on this dataset) — also legacy `attributes.content` (concatenated public+private) | `guest_reviews.incoming_text` ← `raw_content.public_review ?? content` (`sync.ts:122`) | `ReviewCard.tsx:281-307` truncates at 200c, expand on Read more | **No delta.** |
| **Private feedback** | `attributes.raw_content.private_feedback` (only present when host's reveal threshold was met or window closed; 4/10 reviews have it, 9-375c) | `guest_reviews.private_feedback` (`sync.ts:123`) | `ReviewCard.tsx:319-323` shows "Private feedback included" amber badge when present; full text rendered inside `ReviewReplyPanel` | **No delta.** |
| **Reveal state** | **Channex does not expose unrevealed reviews.** All 10 returned have `overall_score` populated, `raw_content.public_review` present, `expired_at` set. None are "locked" with rating=0 | n/a — the row only exists post-reveal | n/a | **Blueprint hypothesis WRONG.** §2.5. Amendment recorded. |
| **Bad-review classification** | n/a — Airbnb gives the rating; "bad" is Koast's heuristic | `guest_reviews.is_bad_review` set at sync-insert via `rating5 < 3` (`sync.ts:150` / `reviews_sync.py:155`). On row `3b827c4c-…` the value is **`true` despite `incoming_rating=5.0`** — corrupted persisted state from earlier sync versions or manual approve action | `ReviewCard.tsx:129` re-derives at read time: `is_bad_review || (rating < 4)` — **threshold mismatch with sync's `<3`**, and OR-with-persisted means the corrupted flag wins | **Two-layer delta.** Persisted state is unreliable; threshold is inconsistent between sync (`<3`) and UI (`<4`). §2.6 |
| **Response state** | `attributes.is_replied` (boolean), `attributes.reply.reply` (the reply text) | `guest_reviews.response_sent`, `response_draft`, `response_final`, `status`, `published_at` (`respond/route.ts:53-72`) | `ReviewCard.tsx:70-89` StatusBadge: "Responded" / "Response ready" / "Needs response" | **Mostly correct.** One observed mismatch: review `0d9d89a3-…` has `guest_review_submitted_at` + `guest_review_channex_acked_at` set in DB but Channex returns `reply.guest_review.public_review_present=true` while local stored payload was `'Malformed test payload accepted by Channex, rejected by Airbnb.'` — a known probe-contamination artifact, not a bug. Confirmation pending. |
| **Date fields** | `attributes.received_at`, `inserted_at`, `updated_at`, `expired_at` (ISO strings) | `incoming_date` = `received_at ?? inserted_at`; `expired_at` mirrored | `relativeDate()` (`ReviewCard.tsx:43-56`) for display. `pending/route.ts:178-183` derives `is_expired = expired_at <= now() OR (expired_at NULL AND incoming_date + 14d <= now())` per `quirks.md #21` workaround | **No delta.** |
| **Booking link** | `attributes.ota_reservation_id` (Airbnb HM-code: `HM5BWFRDXB`, `HM3KACRAW4`, etc) | `guest_reviews.ota_reservation_code` (sync.ts:120). `guest_reviews.booking_id` = **null on 11/11 rows** because the join key (`bookings.platform_booking_id`) is iCal email-UID format on every booking — see §2.7 | `pending/route.ts:128-148` resolves booking via `ota_reservation_code` first then `booking_id` — both fail; downstream platform/check-in/check-out are null | **Major delta.** Booking-link is dead in production data. §2.7. Cause: join-key incompatibility, not sync logic. |
| **Outgoing-direction state** | `attributes.reply.guest_review` populated when host has submitted, else `reply.guest_review` absent or null | `guest_review_submitted_at` / `guest_review_channex_acked_at` / `guest_review_airbnb_confirmed_at` / `guest_review_payload`. Three-stage Session 6.2 pattern | `ReviewCard.tsx:338-394` renders state-conditional CTA: "Guest reviewed" / "Submitted, pending" / "Review time expired" / "Review this guest" / disabled (no channex_review_id) | **No delta.** Only one stale row from probe-contamination (review `0d9d89a3`); not a render-layer concern. |

---

## 2. Concept-by-concept deep dives

### 2.1 Property attribution — **NOT A BUG**

**Channex side:** all 10 reviews returned for Villa Jamaica's
`channex_property_id=4d52bb8c-…` carry
`relationships.property.data.id=4d52bb8c-…`. Cozy Loft's
`channex_property_id=6928213d-…` returns 0 reviews
(`/tmp/channex-reviews-cozy.json`: `data: []`).

**DB side:** all 11 stored rows have
`property_id=bfb0750e-9ae9-4ef4-a7de-988062f6a0ad` (Villa Jamaica
Koast id). Zero rows for `57b350de-…` (Cozy Loft Koast id).

**Mapping:** `sync.ts:127-130` writes `property_id: prop.id` directly
from the iterating property's Koast id. The Koast id was looked up
by joining `channex_property_id` to the iteration's
Channex-property-id seed. No cross-contamination possible — the
sync handles each property in its own iteration with its own
identifier.

**What Cesar likely saw:** the property selector defaults to
`propertyFilter='all'` (`page.tsx:40`). With Cozy Loft having zero
reviews and Villa Jamaica having 11, the "All properties" view
shows 11 cards all labeled "Villa Jamaica - StayCommand". A host
unfamiliar with the dataset reads this as "the system attributed
everything to one property". That's correct behavior for "all
properties" with one property having all the data.

**Fix shape (render layer):**
- The new render layer must make the property-scoping more explicit
  when "all" is selected (e.g. group cards under per-property
  headers, or keep the property pill prominent on each card).
- Single-property selector should be the visible default when only
  one property has reviews, rather than silently rolling up.
- This is **UX clarity work, not a data fix.**

### 2.2 Property display name

**Channex side:** Villa Jamaica's `attributes.title = "Villa Jamaica - StayCommand"` (verbatim). Cozy Loft's title `"Cozy Loft - Tampa"`. These are the strings the host (or whoever set up Channex) chose at Channex onboarding.

**DB side:** `properties.name` matches verbatim — both were written at Koast import time without transformation. `src/app/api/channex/import/route.ts:127` writes `name: attrs.title` directly. `src/app/api/properties/import/route.ts:127` reads from `propertyName` which came from import-from-url payload but BDC/auto-scaffold paths default to the Channex title.

**Render side:** `pending/route.ts:36-44` selects `properties.name`. `ReviewCard.tsx:265` renders it as `review.property_name`.

**The bug Cesar described:** "Villa Jamaica - StayCommand" is the wrong host-facing label — `StayCommand` is the rebrand-ago software, not the property. Hosts want either a clean canonical name (`"Villa Jamaica"`) or a per-property nickname they can edit.

**Fix shape:**
- Property settings UI gains a "display name" field (could re-use `properties.name`, or a new `properties.display_name` column with NULL fallback to `name`).
- Render layer reads the display name field with fallback.
- Cleanup: post-rename, edit the persisted Channex title via `PUT /properties/:id` to keep both sides aligned (`src/app/api/properties/import/route.ts:142-150` already does this on import).

**Open question:** add a column or reuse `name`? Recommend reuse `name` + add a settings UI; avoids schema churn.

### 2.3 Guest name — multi-cause failure

**Resolver:** `src/lib/guest-name.ts:54-66`. Priority:
1. `overrideName` (manual host override) — null on all 11 rows.
2. `bookingGuestName` (`bookings.guest_name` via `guest_reviews.booking_id`) — **booking_id null on 11/11**, so this branch never executes.
3. `channexGuestName` — null on 10/10 returned reviews per `quirks.md #7`. The resolver explicitly ignores this branch (line 60 `eslint-disable-next-line` comment + parameter unused) until source becomes reliable.
4. **Platform fallback** → `"Airbnb Guest"` (`guest-name.ts:39`) — fires for every review.

**Per-row trace (all 11):**

| review_id | tier 1 | tier 2 | tier 3 | rendered |
|---|---|---|---|---|
| 3b827c4c | null | booking_id NULL → fall through | guest_name NULL → ignored | "Airbnb Guest" |
| 6c4cd278 | null | booking_id NULL → fall through | guest_name NULL → ignored | "Airbnb Guest" |
| c3064d3f | null | booking_id NULL → fall through | guest_name NULL → ignored | "Airbnb Guest" |
| 321d7369 | null | booking_id NULL → fall through | guest_name NULL → ignored | "Airbnb Guest" |
| 6d19c961 | null | booking_id NULL → fall through | guest_name NULL → ignored | "Airbnb Guest" |
| b68992ef | null | booking_id NULL → fall through | guest_name NULL → ignored | "Airbnb Guest" |
| 57d3ff08 | null | booking_id NULL → fall through | guest_name NULL → ignored | "Airbnb Guest" |
| e8b5f8c3 | null | booking_id NULL → fall through | guest_name NULL → ignored | "Airbnb Guest" |
| d615cc4d | null | booking_id NULL → fall through | guest_name NULL → ignored | "Airbnb Guest" |
| e813522e | null | booking_id NULL → fall through | guest_name NULL → ignored | "Airbnb Guest" |
| 82a63851 | null | booking_id NULL → fall through | guest_name NULL → ignored | "Airbnb Guest" |

Tier 4 fires 11/11. Cesar's "every review shows 'Airbnb Guest'" is
exactly the resolver doing what it's designed to do **when there's
no source data to surface**.

**The real upstream failure: §2.7** (booking-link). Fixing §2.7 fixes
tier 2 for the subset of reviews whose booking made it into Channex
revisions feed (`booking_sync.py`). Tier 3 stays null until Channex
populates `guest_name` (likely never, per quirk #7).

**Render-layer answer:** in the new render, the platform-tagged
fallback should be muted styling + an inline "Add name" pencil
that's more discoverable than today's hover-only `Pencil` icon
(`ReviewCard.tsx:248-261`). Hosts will provide names manually for
historical reviews; tier 1 then becomes the dominant path.

### 2.4 Channel attribution — accidentally correct

**Channex side:** all 10 reviews return `attributes.ota = "AirBNB"`. The string is the source-of-truth channel.

**DB side:** `guest_reviews` has **no `channel_code` column**. `quirks.md #5` describes the three-way booking ID mismatch and recommends storing `ota` directly on the review row; we have not.

**Render side:** `pending/route.ts:170-178` derives `platform` from the linked booking with hardcoded `"airbnb"` fallback when no booking is found (line 178: `const platform = bk?.platform ?? "airbnb"`).

Today every review hits the fallback (because every booking_id is
null per §2.3). The fallback is correct because every existing
review is in fact Airbnb. But this is **a coincidence**, not a
guarantee. When BDC reviews start arriving:
- They'll have `ota_reservation_id` in BDC's numeric format, also
  unjoinable to the email-UID bookings → `bk` null → fallback `airbnb` → wrong badge.

**Fix shape (sync layer):**
- Add `channel_code` column to `guest_reviews` (`abb` / `bdc` / etc).
- Stamp at sync time using a mapping from `rv.ota` → channel_code
  (`AirBNB → abb`, `BookingCom → bdc`, ...).
- Migration: `ALTER TABLE guest_reviews ADD COLUMN channel_code text`. Backfill with `'abb'` for existing rows (all are Airbnb).
- Render layer reads `review.channel_code` with no fallback magic.

This isn't a render-layer-only fix — sync needs the migration. Note for the rebuild: the new render layer should rely on a stamped channel_code, not the booking-derived heuristic.

### 2.5 Reveal state — blueprint hypothesis was WRONG

**Blueprint §9.1 hypothesis:** "Channex returns the review entity
pre-reveal with `overall_score`/`content` zeroed or null. Locked-
pending reviews are misclassified as bad reviews."

**Probe finding:** Channex returns reviews **only post-reveal**. All 10 entries returned have:
- `overall_score`: populated (`10.0`, `8.0`)
- `raw_content.public_review`: populated (length 1-357c)
- `expired_at`: populated (ISO timestamp)
- `is_expired`: boolean — 6/10 are `true` (window closed), 4/10 are `false` (window open)
- `is_replied`: boolean independent of `is_expired`

There is **no locked-pending payload state in this dataset**. `quirks.md #21` is correct: Channex hides the review entirely until at least one party submits or the window closes. Pre-reveal reviews don't enter our DB because the sync never sees them.

**What Cesar actually saw as "rating=0 misclassified as bad":**

→ §2.6. Persisted `is_bad_review=true` on a 5-star review. Different bug, similar symptom.

**Blueprint amendment required:**
- §9.1 root-cause is wrong. The correct cause is §2.6.
- §3.4 "Locked-pending representation" question is moot — there is no locked-pending state to represent. The `is_revealed` column proposed in T1.1 is unnecessary because by definition every persisted row is revealed.
- T1.1 size becomes **smaller** — no schema migration needed. The fix is purely the §2.6 threshold normalization.

### 2.6 Bad-review classification — corrupted persisted state + threshold mismatch

**Evidence (DB row `3b827c4c`):**
```
incoming_rating: 5.0
is_bad_review:   true   ← incorrect
```

The corresponding Channex source has `overall_score: 10.0` (a 5-star review).

**Why is_bad_review=true was persisted:** unclear. Three possible causes:
1. An earlier version of the sync used `<4` instead of `<3`; the row was first inserted under that predicate. Hard to verify without git-blame; current sync (`sync.ts:150`, `reviews_sync.py:155`) is `<3`.
2. The `/api/reviews/approve/[reviewId]` route was called with `{is_bad_review: true}` (manual "Mark as bad review" menu action). Possible if Cesar tested the menu.
3. A race between sync's update path and a different writer.

**Threshold mismatch:** even if persisted state were clean, the UI re-derives:
- `ReviewCard.tsx:129` — `const isBad = review.is_bad_review || (rating != null && rating < 4)`
- `page.tsx:187,213` — same `< 4` predicate for filter chip count

**Sync writes** with `<3` (`sync.ts:150`). **UI displays** with `<4`. So a 3.5-star review:
- Sync: `is_bad_review=false` persisted
- UI: `isBad=true` rendered (because `3.5 < 4`)
- A 3.0 review: same outcome — sync `<3` is false (3.0 not <3), UI `<4` is true.

The UI predicate is the louder one. Hosts see the disagreement as inconsistency.

**Fix shape (render-layer rebuild + cleanup):**
1. **Pick one threshold.** Recommend `< 4` (Airbnb's "below 4 stars" is a meaningful bucket; `<3` is too narrow). Update sync to match.
2. **Stop OR-ing the persisted flag.** The persisted flag should reflect host-asserted classification (manual "Mark as bad review" menu), not the sync's heuristic. Render side should compute `isBadByRating = rating < 4` and `isHostMarkedBad = is_bad_review` separately, and show both with different visual treatments — or merge with explicit precedence.
3. **Backfill the corrupted row.** One-time UPDATE: `SET is_bad_review = false WHERE incoming_rating >= 3 AND is_bad_review = true AND <not host-marked>`. Or accept the noise and move on; row count is tiny.

Alternative: drop `is_bad_review` entirely as a sync concern, keep it solely as a host-marked flag (only the menu action sets it). Sync stops touching it. Heuristic moves to read time only. Cleaner. **Recommend this.**

### 2.7 Booking link — dead in production data

**Sync's join attempt:** `sync.ts:115-119` builds a map keyed by `bookings.platform_booking_id` from the property's bookings, then looks up by review's `ota_reservation_id`.

**Source format mismatch:**
- Reviews carry `ota_reservation_id = HM5BWFRDXB` (Airbnb HM-codes — `quirks.md #8`).
- Bookings carry `platform_booking_id = 1418fb94e984-dc65da7a584aa9ed9fcddf9e6a1bab5d@airbnb.com` (iCal email-UID format).

These don't intersect. Result: `localBookingId = null` on every iteration. Persisted: `booking_id = null` on every row (11/11 confirmed in DB dump).

**Why the bookings have email UIDs, not HM-codes:**
- `booking_sync.py` has two paths:
  - **Channex revisions feed** (`/booking_revisions/feed`) — pulls the canonical Channex booking entity, which DOES carry `ota_reservation_code` (HM-code). Stamps `bookings.ota_reservation_code` AND `bookings.platform_booking_id`.
  - **iCal feeds** — parses Airbnb's `.ics` export, extracts UID like `1418fb94e984-XXX@airbnb.com`, stamps that into `platform_booking_id`. Does NOT stamp `ota_reservation_code` (the iCal feed doesn't expose HM-codes).
- The current dataset's bookings are **iCal-sourced** — every row except `f0785eb1` has `platform_booking_id` in email-UID format and `ota_reservation_code = null`.
- `f0785eb1` is the lone Channex-revisions-sourced row: `platform_booking_id = HM3B9J5EAS`, `ota_reservation_code = null` (still null!), `guest_name = "Briana Ybarra"`. Wait — `ota_reservation_code` is null even on a Channex-sourced booking. Let me note this: `booking_sync.py` writes `platform_booking_id = ba.get("ota_reservation_code")` (line ~305 of booking_sync.py) but does NOT separately write the dedicated `ota_reservation_code` column. So **`ota_reservation_code` is unpopulated in `bookings` regardless of source path**.

**Implications:**
- The current sync join (`platform_booking_id == ota_reservation_id`) would work for Channex-revisions-sourced bookings (HM-codes in both fields). It does NOT work for iCal-sourced.
- The "fixed" join (`bookings.ota_reservation_code == reviews.ota_reservation_code`) would also fail today because `bookings.ota_reservation_code` is universally null.
- Most bookings on production are iCal-sourced (only HM-coded one is `f0785eb1` cancelled). `quirks.md #20` says Channex's `/bookings` excludes post-checkout >30d, so historical bookings can't be backfilled via revisions.

**Fix shape:**
1. **Backfill `bookings.ota_reservation_code`** from `bookings.platform_booking_id` for Channex-sourced rows where the format is HM-code (regex `^HM[A-Z0-9]{8}$`). One-shot SQL.
2. **Fix `booking_sync.py`** to populate `bookings.ota_reservation_code` separately on insert, alongside `platform_booking_id`. Single-line change.
3. **Switch the review-sync join key** from `bookings.platform_booking_id` to `bookings.ota_reservation_code` (which after fix #2 will be HM-code-formatted on Channex-sourced rows). Two lines in `sync.ts:115-119` and `reviews_sync.py:147-152`.
4. **Accept that iCal-sourced historical bookings remain unjoinable** (quirk #20). For those, tier 1 (manual override) is the only path to get a name on the review.

This is the **highest-leverage fix** in this entire diagnostic. Once booking_id is populated:
- Tier 2 of guest-name resolver starts working for the recent subset.
- The respond/route AI generator gets check-in/check-out context (`respond/route.ts:97-105`).
- Analytics, response-time, etc. become possible because review→booking is joinable.

This belongs in the data layer, not the render layer — but the rebuild brief said "keep the data layer unless schema changes are required". §2.7 needs sync code edits, not schema. Surfaced for explicit approval (§7).

### 2.8 Subratings — dead persistence

`guest_reviews.subratings` is populated on every row (10/10 with `scores_n=6` per Channex probe — Airbnb's six categories: clean, accuracy, checkin, communication, location, value). **Nothing reads it.** Grep for `subratings` in `src/components/reviews/`:

```
ReviewCard.tsx:31:  subratings: any;        ← typed but never used
```

The render layer should expose this via per-card expand or per-property aggregate. Tier 1 blueprint item T1.5; not a current bug but a gap.

---

## 3. Channex payload reference

### 3.1 Property payload — Villa Jamaica (relevant fields, redacted)

```json
{
  "data": {
    "id": "4d52bb8c-5bee-479a-81ae-2d0a9cb02785",
    "type": "property",
    "attributes": {
      "title": "Villa Jamaica - StayCommand",
      "address": "[ADDRESS_REDACTED]",
      "city": "Tampa", "state": "FL", "zip_code": "33614",
      "country": "US", "currency": "USD",
      "is_active": true,
      "property_category": "vacation_rental",
      "property_type": "apartment",
      "acc_channels_count": 3,
      "email": "[EMAIL_REDACTED]",
      "phone": "[PHONE_REDACTED]",
      "timezone": "America/New_York",
      "settings": {/* min-stay, allow-availability flags, etc */}
    },
    "relationships": ["users","groups","facilities","hotel_policies","cancellation_policies","tax_sets"]
  }
}
```

Notable: no `display_name` field — `title` is the only label
candidate. **Persisted as `properties.name` verbatim.**

### 3.2 Reviews listing — meta + per-entry shape

```json
{
  "data": [
    {
      "id": "<uuid>",
      "type": "review",
      "attributes": {
        "id": "<uuid>",                       // duplicates outer id
        "ota": "AirBNB",                      // channel marker
        "ota_reservation_id": "HM5BWFRDXB",   // HM-code (Airbnb)
        "guest_name": null,                   // ALWAYS null on Airbnb (quirk #7)
        "overall_score": 10.0,                // 0-10
        "is_replied": false,
        "is_expired": false,
        "is_hidden": false,
        "expired_at": "2026-05-25T14:23:49.761000",
        "received_at": "2026-04-25T14:23:49.761000",
        "inserted_at": "...",
        "updated_at": "...",
        "raw_content": {
          "public_review": "<TEXT_REDACTED>",
          "private_feedback": "<TEXT_REDACTED>"   // only present sometimes
        },
        "content": "<concatenated public+private — legacy field>",
        "scores": [
          {"score": 10.0, "category": "clean"},
          {"score": 10.0, "category": "accuracy"},
          {"score": 10.0, "category": "checkin"},
          {"score": 10.0, "category": "communication"},
          {"score": 10.0, "category": "location"},
          {"score": 10.0, "category": "value"}
        ],
        "reply": {},                          // empty when no reply; "reply" key when host replied; "guest_review" key when host submitted counter-review
        "tags": [],
        "meta": {/* opaque */}
      },
      "relationships": {
        "property": {"data": {"id": "4d52bb8c-…", "type": "property"}}
      }
    },
    /* … 9 more … */
  ],
  "meta": {"total": 111, "limit": 10, "page": 1, "order_by": "received_at", "order_direction": "desc"}
}
```

Notable from probe:
- `meta.total = 111` reported but only **10 entries returned** — `quirks.md #6` confirmed live (page-size cap, page-number ignored).
- `relationships.property.data.id` is the canonical attribution field.
- **No `locked_pending`-style state.** `is_replied` and `is_expired` are independent booleans; both false means "open window, no reply yet"; both true is impossible per Airbnb's reveal mechanic.
- `guest_name` is null in all 10 cases (no `[REDACTED]` was needed — no PII actually present).
- `reviewer_name` field does not exist; `customer_name` does not exist; `guest` field does not exist. **No alternative source for the guest name in the Channex payload.** Tier 3 of the resolver is structurally dead.

### 3.3 Locked vs revealed — N/A

Channex returned **no locked-pending entities** in the probe. Per
`quirks.md #21`, the entity is hidden until reveal. The blueprint
hypothesis to the contrary is incorrect — see §2.5.

---

## 4. Data layer audit — what's correct

| Component | Verdict | Evidence |
|---|---|---|
| `src/lib/reviews/sync.ts` upsert + onConflict | Correct | row count matches Channex `meta.total - aged-out` |
| Property attribution at sync time | Correct | per-property iteration with explicit Koast id |
| Stamp `reviews_last_synced_at` | Correct | both properties stamped at 21:58 UTC after T1.2 manual run |
| `expired_at` persistence | Correct | row matches `attributes.expired_at` ISO timestamp |
| Three-stage submission tracking | Correct | columns populated per the Session 6.2 spec |
| Booking-id resolution | **BROKEN** | join-key mismatch — §2.7. **NOT a sync logic bug** — sync code is correct given the data; data ingestion (booking_sync.py) is the upstream cause |
| `is_bad_review` writes | Suspect | one row corrupted; threshold inconsistent with UI — §2.6 |
| `channel_code` persistence | Missing column | §2.4 |

**Schema additions required to fix bugs surfaced in this diagnostic:**

- `bookings.ota_reservation_code` column already exists (`schema.ts` confirms — see DB dump rows). Migration not needed; population is.
- `guest_reviews.channel_code` does **not** exist. **Migration needed** if the rebuild wants channel attribution to be reliable when BDC reviews land. Defer the migration to T2.3 (BDC ingestion) per blueprint, since today everything is Airbnb and the "always Airbnb" fallback in `pending/route.ts:178` is correct by accident.

No other schema changes are required to fix any §1 row.

---

## 5. Render layer rebuild — scope and contract

### 5.1 What gets deleted

- `src/app/(dashboard)/reviews/page.tsx` (454L) — full rewrite.
  Existing predicate cascade, banner, refresh chrome, filter chip
  state plumbing, three-tier empty state.
- `src/components/reviews/ReviewCard.tsx` (448L) — full rewrite.
  Existing isBad threshold, status badge, action layout, per-card
  hover-pencil edit, more-menu.
- `src/components/reviews/ReviewFilterChips.tsx` (87L) — likely
  rewrite to align with new filter set; could be salvaged.
- `src/components/reviews/ReviewSkeletonCard.tsx` (26L) — likely
  redrawn to match new card silhouette.

### 5.2 What stays untouched

- `src/lib/reviews/sync.ts` — correct as audited.
- `src/app/api/reviews/sync/route.ts` — thin wrapper, correct.
- `src/app/api/reviews/pending/route.ts` — read shape is correct;
  may extend to expose new fields (e.g. `channel_code` once persisted).
- `src/app/api/reviews/respond/[reviewId]/route.ts` — three-mode
  generate / save_draft / approve, correct.
- `src/app/api/reviews/submit-guest-review/[reviewId]/route.ts` —
  three-stage rollback pattern, correct.
- `src/app/api/reviews/approve/[reviewId]/route.ts` — host-marked
  bad-review path (recommend repurposing per §2.6 fix).
- `src/lib/guest-name.ts` — resolver is correct given input data.
- `src/lib/reviews/guest-review-validation.ts` — correct.
- `src/lib/channex/guest-review-types.ts` — correct.
- `src/components/reviews/ReviewReplyPanel.tsx` (259L) — keep as-is unless rebuild wants a different reply UX; not in this scope.
- `src/components/reviews/GuestReviewForm.tsx` (373L) — keep as-is.
- `src/components/reviews/ReviewsSettingsModal.tsx` (195L) — keep as-is.
- `~/koast-workers/reviews_sync.py` — VPS worker, correct.
- All migrations.

### 5.3 Data assumptions the new render layer is allowed to make

The new render layer's contract from `pending/route.ts`:

| Field | Contract |
|---|---|
| `id` | always non-null UUID |
| `property_id` / `property_name` | always non-null. `property_name` may be a Channex-imported title that hosts find awkward — render with that string but consider truncating or running through a "display name" helper |
| `channex_review_id` | nullable for legacy/local rows; non-null for Channex-sourced |
| `guest_name` | nullable; almost always null in current production data — **design for null as the common case** |
| `guest_name_override` | nullable; manual override |
| `display_guest_name` | always non-null string; will commonly be the platform-tagged fallback "Airbnb Guest" until tier 1 or §2.7 fix populates |
| `expired_at`, `is_expired` | reliable; trust server-derived `is_expired` over re-deriving |
| `incoming_text` | nullable (rare empty string for reviews like `c3064d3f` with text "."); handle gracefully |
| `incoming_rating` | nullable; **trust this** for revealed reviews — Channex doesn't expose unrevealed rows |
| `incoming_date` | usually populated; sortable |
| `private_feedback` | nullable |
| `subratings` | jsonb array of `{score, category}` Airbnb-shape; today unused; rebuild can surface |
| `response_draft` / `response_sent` / `response_final` / `status` / `published_at` | reliable |
| `is_bad_review` | **unreliable** per §2.6; rebuild should compute its own predicate |
| `platform` | "airbnb" today, but derivation is fragile — rebuild should not branch on this for non-Airbnb-vs-Airbnb logic without §2.4 fix |
| `booking_check_in` / `booking_check_out` / `booking_nights` / `booking_platform_booking_id` | **null on 11/11 rows in production today** per §2.7. Rebuild MUST handle null gracefully and not show "0 nights" or empty date ranges |

### 5.4 New render assumptions to bake in

1. **Display-name helper** that produces a "Villa Jamaica" cleanup from "Villa Jamaica - StayCommand" — rule TBD (strip ` - StayCommand`, ` - Koast`, ` - .*`?). Or accept verbatim until a settings UI lets hosts override. Recommend the cleanup helper as a render-time stopgap.
2. **Bad-review predicate** — use a single threshold (recommend `< 4` per §2.6). Optionally separate "host-marked bad" from "rating-derived bad" with distinct visual treatments. Stop OR-ing the corrupted persisted flag.
3. **Empty-state for booking-link** — when `booking_check_in == null`, hide the dates row entirely rather than showing "0 nights" or "—" placeholders.
4. **Locked-pending is dead** — no need for a fourth state. The state machine is `revealed (with-rating) → revealed-with-reply → expired`. Drop the §9.1 hypothesis from blueprint after this rebuild.

---

## 6. Rebuild roadmap

### RDX-2 — Render-layer rebuild (Tier 1)

- **Scope:** rewrite `page.tsx` + `ReviewCard.tsx` + `ReviewFilterChips.tsx` + `ReviewSkeletonCard.tsx`. Apply §5.4 assumptions. New copy for "Villa Jamaica" cleanup. Single-source bad-review threshold. Null-safe booking line.
- **Size:** medium (~5h).
- **Dependencies:** none. The data layer is ready; the rebuild can ship independently.
- **Acceptance:** all 11 production reviews render correctly; `3b827c4c` no longer shows as "Bad review"; "Villa Jamaica" appears clean (or via override). UI lazy-loads sub-ratings panel for expanded cards.

### RDX-3 — Booking-link revival (Tier 1, parallel)

- **Scope:** `booking_sync.py` to populate `bookings.ota_reservation_code` separately from `platform_booking_id`. SQL backfill for HM-coded `platform_booking_id` rows. `sync.ts:115-119` and `reviews_sync.py:147-152` switch join key. Re-run reviews sync.
- **Size:** small-medium (~2-3h).
- **Dependencies:** none.
- **Acceptance:** post-fix, at least the recently-Channex-sourced bookings join to reviews via `ota_reservation_code`; `pending/route.ts:128-148` returns non-null `booking_check_in` for those rows. Tier 2 of guest-name resolver starts working.

### RDX-4 — Property display-name editing (Tier 1)

- **Scope:** Settings UI lets hosts rename `properties.name`. Optionally: also `PUT /properties/:channex_id` to keep Channex aligned (mirror import-time logic). Render layer reads `properties.name` as today.
- **Size:** small (~2h).
- **Dependencies:** RDX-2 (cleaner card surface).
- **Acceptance:** rename "Villa Jamaica - StayCommand" to "Villa Jamaica" via settings, refresh `/reviews`, see updated label on every card.

### RDX-5 — `channel_code` migration + sync stamp (Tier 2)

- **Scope:** `ALTER TABLE guest_reviews ADD COLUMN channel_code text;` backfill `'abb'`. Sync stamps from `rv.ota`. Render reads.
- **Size:** small (~1.5h).
- **Dependencies:** none today; **becomes blocking** when first BDC review arrives.
- **Acceptance:** future BDC review renders with BDC badge.

### RDX-6 — Subratings UI surface (Tier 1)

- Already T1.5 in blueprint. Slot under expanded-card content in RDX-2 to avoid double-touching the file.

### RDX-7 — Cleanup (Tier 2)

- Delete `is_bad_review` from sync writes (move to host-marked-only).
- Delete `/api/reviews/generate/[bookingId]` (dead code; blueprint §9.5).
- Delete `auto_publish` column or comment out (blueprint §9.4).

---

## 7. Open questions for Cesar

1. **Property display name semantics.** Edit via Settings (overwrites `properties.name`), or add a separate `display_name` column with NULL fallback? **Recommend**: edit Settings overwriting `properties.name` to keep schema simple.
2. **Bad-review threshold.** `< 4` (Airbnb's "below excellent") or `< 3` (Koast's current sync default)? **Recommend `< 4`.**
3. **`is_bad_review` semantics.** Drop the sync-side write entirely; it becomes a host-asserted classification only? **Recommend yes.**
4. **Booking-link fix scope.** §2.7 requires a sync-side change (`booking_sync.py`) plus a one-shot backfill. Is that in scope for the render-layer rebuild, or does it become its own session (RDX-3)? **Recommend RDX-3 standalone**; the rebuild ships independently.
5. **Property attribution UX.** When "All properties" is the default, should the cards group under per-property headers? Or should the default flip to single-property when only one has reviews?
6. **Display-name cleanup helper.** While editing isn't built, do we render a heuristic stripper for `" - StayCommand"` / `" - Koast"` suffix server-side? Or only after the Settings UI lands?
7. **Locked-pending blueprint amendment.** Approve the §2.5 finding to amend `docs/REVIEWS_BLUEPRINT.md` §2.1 / §3.4 / §9.1 / T1.1 in a follow-up commit (not this commit).

---

## 8. Blueprint amendments (proposed for a follow-up commit)

The following sections of `docs/REVIEWS_BLUEPRINT.md` need correction based on this diagnostic. **Not applied in this commit** per the prompt's constraint.

| Blueprint section | Amendment |
|---|---|
| §2.1 incoming state machine | Remove `locked_pending` and `expired_no_reveal` from the state diagram. Channex doesn't expose unrevealed reviews — they don't enter our DB. The state machine collapses to `revealed → responded` (with `revealed_aged` for old reviews dropped from listing). |
| §3.4 open schema questions | Drop the `is_revealed` column proposal — there is no locked-pending state to represent. |
| §9.1 locked-pending bug | Replace with the §2.6 finding: `is_bad_review` field is corrupted on at least one row, and threshold mismatch between sync (`<3`) and UI (`<4`) makes the predicate inconsistent. |
| §10 T1.1 | Reframe from "locked-pending fix" to "bad-review threshold + host-marked semantic split". Smaller scope, no migration. |
| New §9.x | "Booking-link broken in production" — covers §2.7. Severity: high; affects every review's guest name and booking context. |
| New §9.x | "Property display name is verbatim Channex title with no edit UI". Severity: medium. Maps to RDX-4. |
| New §11.x | "Channex `guest_name` is structurally null on Airbnb reviews — quirks.md #7 confirmed live 2026-04-25". Already in quirks.md but not flagged in blueprint as a Tier-1 implication. |
| §4.2 quirk reference | Add row for the locked-pending finding: "Channex does NOT expose unrevealed reviews. Pre-reveal state is hidden entirely. Confirmed via probe 2026-04-25." Cross-link to the existing quirk #21. |
| §10 T1.5 subratings | No change — still valid. |
| §10 T2.3 BDC ingestion | Note: requires `channel_code` column add (RDX-5) before BDC reviews can be attributed correctly. |

---

## Appendix A — Probe inventory (this session)

**Channex GETs (read-only):** 4 calls.
- `GET /properties/4d52bb8c-…` (Villa Jamaica)
- `GET /properties/6928213d-…` (Cozy Loft)
- `GET /reviews?filter[property_id]=4d52bb8c-…&page[limit]=10`
- `GET /reviews?filter[property_id]=6928213d-…&page[limit]=10`

No per-id `GET /reviews/:id` was needed because the listing payload
already exposed every field of interest. The optional probe budget
was conserved.

**DB queries:** read-only via psycopg2 + `~/koast-workers/db.py`. Saved to `/tmp/reviews-data-dump.txt` (453L). Queries:
- `SELECT * FROM properties WHERE user_id = $cesar`
- `SELECT * FROM guest_reviews WHERE property_id IN (…)`
- `SELECT id, ota_reservation_code, platform_booking_id, guest_name, guest_first_name, guest_last_name, platform, property_id, check_in, check_out, status FROM bookings WHERE property_id IN (…)`
- `SELECT … FROM guest_reviews LEFT JOIN bookings ON booking_id` (audit)

**No writes.** No Channex POST/PUT/PATCH. No DB UPDATE/INSERT/DELETE.

## Appendix B — Cross-reference index

- Sync helper: `src/lib/reviews/sync.ts` (305L)
- Worker: `~/koast-workers/reviews_sync.py` (~230L)
- Page: `src/app/(dashboard)/reviews/page.tsx` (454L)
- Card: `src/components/reviews/ReviewCard.tsx` (448L)
- Pending route: `src/app/api/reviews/pending/route.ts` (219L)
- Sync route: `src/app/api/reviews/sync/route.ts` (38L)
- Respond route: `src/app/api/reviews/respond/[reviewId]/route.ts` (153L)
- Guest-name resolver: `src/lib/guest-name.ts` (60L)
- Schema (review-relevant): `src/lib/db/schema.ts:19-43` (properties), `:243-323` (review_rules + guest_reviews)
- Channex client (review section): `src/lib/channex/client.ts:14-42` (types), `:736-810` (methods)
- Blueprint: `docs/REVIEWS_BLUEPRINT.md`
- Channex quirks: `~/.claude/skills/channex-expert/references/known-quirks.md` #6, #7, #8, #10, #19, #20, #21, #22

## Appendix C — Notable per-review state (reference for the rebuild's manual test path)

| review_id (short) | rating | is_replied (Channex) | is_expired | response_sent (DB) | is_bad_review (DB) | guest_review state |
|---|---|---|---|---|---|---|
| 3b827c4c | 5.0 | false | false | false | **true (corrupted)** | none |
| 6c4cd278 | 5.0 | true | false | true | false | none |
| c3064d3f | 4.0 | false | false | false | false | submitted+acked, payload was malformed test (probe-contamination) |
| 321d7369 | 5.0 | false | false | false | false | none |
| 6d19c961 | 5.0 | false | true | false | false | none |
| b68992ef | 5.0 | false | true | false | false | none |
| 57d3ff08 | 5.0 | false | true | false | false | none |
| e8b5f8c3 | 5.0 | false | true | false | false | none |
| d615cc4d | 5.0 | false | true | false | false | none |
| e813522e | 5.0 | n/a (aged out of Channex listing) | n/a (`expired_at` null in DB — quirk #21 edge) | false | false | none |
| 82a63851 | (not in current Channex listing) | — | — | — | — | — |

The rebuild's manual test should hit this set: a 5-star
miscategorized as bad (`3b827c4c`); a clean responded review
(`6c4cd278`); an expired-no-response (`b68992ef`); an aged-out row
that needs the `incoming_date + 14d` fallback (`e813522e`); the
probe-contamination row that should not regress (`c3064d3f`).
