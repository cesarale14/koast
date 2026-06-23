# Koast Architecture

## Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind. Design
  system is Koast's own (coastal green + golden accents), see
  `DESIGN_SYSTEM.md`. Fraunces serif for display type, Plus Jakarta
  Sans for body.
- **Database**: Supabase (Postgres 15). Migrations in
  `supabase/migrations/` (filename timestamp-prefixed). RLS enabled
  on user-owned tables. Service role used from server routes when
  the user-auth path is too heavy.
- **Auth**: Supabase Auth (SSR via `@supabase/ssr`), cookies-based
  sessions. `getAuthenticatedUser` + `verifyPropertyOwnership` are
  the standard guards in API routes.
- **Deploy**: Vercel, auto-deploy from `main`. Production at
  `app.koasthq.com`.
- **VPS Workers** (Virginia, Koast-owned): Python workers in
  `~/koast-workers/` on the VPS. Current active workers:
  `booking_sync.py` (Channex revision poll every 15min),
  `pricing_validator.py` (daily engine validation at 06:00 UTC).
  `koast-market.timer` for AirROI market sync is **stopped**
  (see `tech-debt.md` — AirROI is paused, `KOAST_DISABLE_AIRROI`
  gate active).
- **OTA Integration**: Channex (`app.channex.io`). Primary channels
  are Airbnb and Booking.com. VRBO deferred. Direct booking is
  vision-tier.
- **Not Koast**: Ireland VPS runs BTC5MIN Polymarket bot, weather
  bots, other experiments. Separate project, separate codebase.
  Mentioned only so sessions don't conflate the two.

## Brand identity v1.0 (locked 2026-04-30)

The Koast brand identity is canonical at
`~/koast/design/brand-final/`. Reference files:

- `guidelines/brand-one-pager.html` — canonical brand reference,
  8 sections (mark / usage / color / typography / motion /
  clear-space / do-don't / asset index)
- `motion-exploration/motion-vocabulary.html` — canonical
  motion reference with live demos
- `HANDOFF.md` — integration documentation
- `rasterize.py` — PNG regeneration script (run via
  `regenerate-with-pjs.sh` for one-shot bootstrap + render)

**Brand metaphor: accumulated memory** (sediment / strata).
Distinct from the "instantaneous genius" visual register
dominating other AI brands (Anthropic swirl, OpenAI orb +
asterisk, xAI angles, ChatGPT three dots). Koast learns the
host's STR operation over time through layered sedimentation;
the logo encodes that growth.

**Logo:** "Koast" wordmark in Plus Jakarta Sans 800 with a
banded circle replacing the lowercase 'o'. 5-band variant for
≥48px contexts; 3-band variant for <48px favicons. Letter-
spacing −0.045em. Static at rest; cascade soft when active
(3.0s cycle).

**Color — cool teal cluster (shipped 2026-04-30, merge `8529684`):**
- `--lume-light` `#d4eef0`
- `--lume` `#4cc4cc` (BRAND PRIMARY — AI accent)
- `--lume-deep` `#0e7a8a`

Layered on existing PD-V1 palette (`--deep-sea`, `--coastal`,
`--shore`, `--golden`, etc.). Live in `globals.css` and
exposed in `tailwind.config.ts` as `lume-light` / `lume` /
`lume-deep`. The middle 5-stop bands (`#a8e0e3`, `#2ba2ad`)
remain in the SVG masters only — intentional, not a gap.

Same merge added `--positive` (`#1a3a2a`, "rate raised" green)
and `--abyss` (`#0e2218`, gradient terminus paired with
`--deep-sea`); retired the entire `--brand-{50..950}` legacy
scale (188 occurrences across 27 files swept; `globals.css`
and `tailwind.config.ts` definitions removed).

**Motion vocabulary v1.0 (5 registers):**
- *Idle:* static (default state)
- *Active:* cascade soft, 3.0s cycle (mid-task indicator)
- *Milestone:* deposit, 2s one-shot, 18px stack shift
  (one-time accumulation event)
- *Sub-32px:* pulse, brightness/saturation only (favicon-class
  contexts where geometry can't carry motion)
- *Marketing hero:* cascade continuous (landing-page register)

**Repo state:** brand-final/ directory committed on branch
`brand/initial-identity-v1` (koast repo). NOT YET MERGED
to main as of 2026-04-30 — awaiting Cesar's review. The
assets sit in `design/brand-final/`, not yet propagated into
`public/`, the favicon path, OG meta, etc. Propagation is the
marketing-site session's job.

## "Koast = the AI" positioning (locked)

Koast IS the AI co-host, not "a PMS with AI features."
Conversational. Learns the host's STR operation by asking
questions and remembering answers. Audience: professional STR
operators with 5+ properties — sophisticated buyers, designer-
grade expectations.

Category creation, not "another PMS." Reference brands for
visual register: **Stripe** (premium B2B), **Linear**
(designer-grade), **Anthropic / OpenAI / xAI** (AI presence
with character — but Koast's character is distinct from each).

Tagline: *"the AI co-host for short-term rentals."*

Wordmark form: "Koast" — always lowercase except the leading
'K'. Never "KOAST" or "koast".

This is the strategic frame that the brand identity (above)
sits on top of. When designing UI, copy, marketing surfaces,
or any user-facing surface: the AI is not a feature inside
Koast, the AI IS Koast. Name the product accordingly.

## Two live test properties

Owned by `cesaralejandrosantana18@gmail.com`:

| Property | Koast id | Channex id | Channels |
|---|---|---|---|
| Villa Jamaica | `bfb0750e-9ae9-4ef4-a7de-988062f6a0ad` | `4d52bb8c-5bee-479a-81ae-2d0a9cb02785` | Airbnb (listing `1240054136658113220`) + Booking.com (hotel `12783847`) |
| Cozy Loft - Tampa | `57b350de-e0c7-4825-8064-b58a6ec053fb` | `6928213d-7a2f-449c-90bc-115b1007be45` | Airbnb only (not yet reconnected post-5a.6) |

Villa Jamaica is the end-to-end verified test bed. Rate pushes,
review replies, and sync calls have been validated against it.
Cozy Loft is awaiting an Airbnb OAuth reconnect.

## Domain model: the three rate paths

All three paths are production. Knowing which one applies is the
biggest correctness prerequisite in this codebase.

### Path 1: Apply (engine → OTAs)

- **Route**: `POST /api/pricing/apply/[propertyId]`
- **Trigger**: host clicks "Apply" on a pricing recommendation in
  the /pricing page.
- **Data source**: `pricing_recommendations` table.
- **Write destinations**: `pricing_performance` (audit),
  `calendar_rates` per-channel rows (`channel_code='BDC'` or
  `'ABB'`), then Channex via `updateRestrictions`.
- **Safety**: routes through `buildSafeBdcRestrictions` —
  pre-reads BDC state, enforces the whiplash guard (caps single-day
  rate changes at 10% delta unless explicitly overridden), preserves
  host-managed BDC state. This is the ONLY path with whiplash
  guarding. It exists because the pricing engine's output can be
  mistaken; a bad rec shouldn't move rates 40% in one click.
- **Gating**: env var `KOAST_ALLOW_BDC_CALENDAR_PUSH` gates the BDC
  half. Non-BDC channels push regardless.

### Path 2: Sync (OTAs → Koast)

- **Route**: `POST /api/channex/sync` with body `{ property_id }`
- **Trigger**: calendar page's Sync button, or a manual refresh call.
- **Read source**: `channex.getRestrictionsBucketed(propertyId, dateFrom, dateTo, ["rate","availability","min_stay_arrival","stop_sell"])`.
  **MUST use the bucketed variant** — non-bucketed returns cents as
  integers AND doesn't populate rate data unless you add
  `filter[restrictions]=rate`. The bucketed endpoint returns
  decimal-dollar strings (`"185.00"`) keyed by rate_plan_id and date.
- **Write destination**: `calendar_rates` per-channel rows, looked
  up by `property_channels.settings.rate_plan_id` → channel_code
  mapping. NEVER writes the base row (channel_code IS NULL). Base
  row is engine intent, sync is platform reality; they're separate.
- **Safety**: none. Read-only from Koast's perspective.

### Path 3: Per-channel push (sidebar edit → one OTA)

- **Route**: `POST /api/channels/rates/[propertyId]` with body
  `{ dates: string[], channel_code, rate, min_stay_arrival? }`
  (or legacy `date_from`/`date_to` for single-range).
- **Trigger**: host edits the Airbnb or Booking.com rate card in
  the calendar sidebar and clicks Save (single-date) or confirms
  the BulkRateConfirmModal (multi-date).
- **Write destinations**: `calendar_rates` per-channel override
  rows, then Channex (BDC via `buildSafeBdcRestrictions`, non-BDC
  direct).
- **Safety**: **NO whiplash guard deliberately**. The host is
  expressing direct intent on this path — a $160 → $500 Airbnb
  override means that's what they want. The whiplash guard is only
  for engine-sourced writes.

### Base-rate route

- **Route**: `POST /api/calendar/base-rate/[propertyId]` with body
  `{ dates, rate, masterPush? }`
- **Default** (`masterPush=false`): DB-only upsert of the
  `calendar_rates` NULL-channel row. No Channex call. Base rate is
  engine intent; editing it is a local state change.
- **Master push** (`masterPush=true`, Session 5b.4): after the base
  upsert, also upserts per-channel override rows AND calls
  `channex.updateRestrictions` for every active channel. Respects
  the BDC env gate (BDC-off means BDC dates get marked failed in
  the response, non-BDC channels still push).

## `calendar_rates` table — the two-tier model

Single table; the `channel_code` column discriminates.

- `channel_code IS NULL` → **base row**. One per `(property_id, date)`.
  Carries `base_rate`, `suggested_rate`, `applied_rate`, `min_stay`,
  `is_available`, `rate_source` (`engine` | `manual` | `inherited`).
  This is the pricing engine's intent.
- `channel_code IN ('ABB', 'BDC', 'VRBO')` → **per-channel override**.
  Zero or more per `(property_id, date)`. Carries `applied_rate`,
  `channex_rate_plan_id`, `last_channex_rate`, `last_pushed_at`,
  `rate_source` (`manual_per_channel` | `engine`). This is what
  Channex reflects (and therefore what guests see on the OTA).

UNIQUE constraint on `(property_id, date, channel_code)`. Postgres
allows multiple NULLs in UNIQUE columns by default, so there's
exactly one base row per (property, date) but the key still allows
the per-channel siblings.

**Readers pick one explicitly**:

- Display "what's the grid rate for April 15?" → read the NULL row's
  `applied_rate`. If per-channel overrides exist AND they diverge
  from base, show a golden hairline divergence indicator on the
  grid cell (Session 5a.4 policy).
- Display "what's the per-platform rate sidebar shows?" → merge:
  for each channel in `property_channels`, look up the matching
  override row; fall back to the base row's `applied_rate` if no
  override exists.
- Push to Channex → always pick per-channel rows, never base.

## `property_channels` — the Channex channel registration

Per-property row per connected channel. Key columns:

- `channel_code`: `'ABB'`, `'BDC'`, `'VRBO'`, etc.
- `channel_name`: display name. **Historically polluted** — some
  rows have "Villa Jamaica" (the property) instead of the channel
  name. Routes bypass via the `CHANNEL_DISPLAY_NAMES` constant in
  `src/app/api/calendar/rates/route.ts` and
  `src/app/api/channels/rates/[propertyId]/route.ts`.
- `channex_channel_id`: Channex's channel UUID. For rows created
  via iCal import rather than OAuth, this is the literal string
  `"ical-import"` — Session 5a.6 reconciles that on Airbnb reconnect.
- `settings`: JSONB with `{ rate_plan_id, hotel_id }`. The
  `rate_plan_id` is the pointer to the Channex rate plan this
  channel pushes to. Critical: when rate plans change (e.g. after
  an Airbnb reconnect), this must be updated — otherwise sync pulls
  from the OLD rate plan and ignores the new one.
- `status`: `'active'`, `'pending_authorization'`, `'disabled'`.

## Key routes, at a glance

| Route | Purpose |
|---|---|
| `GET /api/calendar/rates?property_id=...&date=...` | Sidebar data: `{ master, platforms }` for one date |
| `GET /api/calendar/rates/for-grid` | Grid data: base rates + override signals per date window |
| `POST /api/calendar/rates/apply` | Multi-date bulk from sidebar (Model A base; Model B pending) |
| `POST /api/calendar/base-rate/[propertyId]` | Session 5b.3 base-rate bulk update with optional `masterPush` |
| `POST /api/channels/rates/[propertyId]` | Per-channel push, BDC via safe-restrictions |
| `POST /api/pricing/apply/[propertyId]` | Apply engine rec; whiplash-guarded; BDC gated |
| `POST /api/channex/sync` | Per-channel pull; updates `calendar_rates` overrides |
| `POST /api/reviews/sync` | Session 6: Channex reviews → `guest_reviews` |
| `POST /api/reviews/respond/[reviewId]` | Session 6: send reply via Channex, local state updates on success |
| `POST /api/reviews/submit-guest-review/[reviewId]` | Session 6.2: host→guest counter-review, three-stage write |
| `POST /api/reviews/[reviewId]/guest-name` | RDX-2: manual guest_name override surfaced via card pencil |
| `GET /api/messages/threads` | MSG-S1: user-scoped thread list with provider chip + last activity |
| `GET /api/messages/threads/[id]` | MSG-S1: single thread + ordered messages |
| `POST /api/messages/sync` | MSG-S1: manual refresh (worker covers steady state) |
| `POST /api/messages/threads/[id]/send` | MSG-S2: outbound send with in-flight dedup, three-stage write columns |
| `POST /api/messages/threads/[id]/mark-read` | MSG-S2: local-state-of-truth mark-read (Channex has no equivalent endpoint) |
| `POST /api/turnover/notify` | TURN-S1a: real notifyCleanerReminder dispatch (replaced alert() placeholders) |
| `POST /api/internal/booking-created` | TURN-S1a: pg_net trigger callback, bearer-auth-gated |
| `POST /api/webhooks/channex` | Booking + messaging webhook (event_mask widened MSG-S1 Phase E to include `message,inquiry,reservation_request,accepted_reservation,declined_reservation,alteration_request`) |

## Background workers (Virginia VPS)

Workers live in a sibling repo at
`github.com/cesarale14/koast-workers` (private, since
2026-04-27 / Session WK1). Deployed to
`/home/ubuntu/koast-workers/` on the Virginia VPS. systemd
units in `<repo>/systemd/` are symlinked into
`/etc/systemd/system/` per the supervised-first-run gate
convention.

Worker → repo cross-reference: when a session changes both
koast and worker code (e.g. messaging executor + its
corresponding API route), commit each to its own repo and
mention the companion commit hash in the body. The
two-headed-sync-subsystem playbook captures this; the new repo
split just makes it explicit. CI / auto-deploy not yet wired —
deploy is `git pull && systemctl daemon-reload` on the VPS.



- `booking_sync.py` — polls Channex revision endpoint every 15 min,
  pulls new bookings, upserts into `bookings` table. Idempotent.
  Minor tech debt: reports "9 updated" every run even on clean
  states (counts no-op upserts as updates).
- `reviews_sync.py` — 20-min cadence, polls Channex `/reviews` per
  property, upserts `guest_reviews`. Mirrors the
  `src/lib/reviews/sync.ts` helper. **Systemd timer not yet
  enabled** — needs supervised first run; see tech-debt.
- `messages_sync.py` — 60-min cadence, polls Channex
  `/message_threads` per property, upserts `message_threads` +
  `messages`. Webhook is the primary path; this is reconciliation
  for missed deliveries. **Systemd timer not yet enabled** —
  same supervised-first-run pattern as reviews.
- `pricing_validator.py` — daily at 06:00 UTC, runs the 9-signal
  pricing engine on every property, writes to
  `pricing_recommendations`. Read-only against Channex.
- `koast-market.timer` — **disabled**. AirROI market sync is
  paused (`KOAST_DISABLE_AIRROI=true` in Vercel env). Don't re-enable
  without explicit instruction; the kill-switch is deliberate.

Systemd units live on the VPS in `/etc/systemd/system/`. Check via
`systemctl list-timers --all | grep -i koast`.

## Channex disclosure signal — `is_hidden`

Pre-disclosure reviews on Airbnb (the 14-day mutual-disclosure
window) carry **three orthogonal payload signals** that
distinguish them from disclosed reviews:

- `attributes.is_hidden: true` — the canonical signal
- `attributes.content: null`
- `attributes.scores: []`
- `attributes.is_expired: false` (window still open)

After disclosure: `is_hidden` flips to `false`, `content`
populates, `scores` populates, `is_expired` flips when the
14-day window closes.

`guest_reviews.is_hidden` (added Session 6.7, migration
`20260428010000`) extracts `attributes.is_hidden` at sync time
in both `src/lib/reviews/sync.ts` and
`~/koast-workers/reviews_sync.py`. The `is_low_rating`
classifier guards on it so the `rating=0` sentinel that Channex
returns for hidden reviews doesn't trip the "Bad review" tag.
The list-card + slide-over UIs both render a "Awaiting guest
review" affordance when `is_hidden=true`.

This is the canonical Channex disclosure signal for any future
surface that needs to gate behavior on review-text visibility.
Don't rely on `incoming_text != null` (that's derived; the
authoritative bit is `is_hidden`). Don't rely on `expired_at <=
now()` (that's also derived and stales between syncs per
channex-expert quirk #21 addendum).

## Reviews subsystem (shipped)

Sessions 6 → 6.7-POST → RDX-1 through RDX-6 wired the reviews
surface end-to-end: Channex `/reviews` pull, dedup, upsert,
display, AI-drafted reply, host→guest counter-review (Airbnb
two-sided model), manual Refresh button, on-connect trigger
from import paths. Per-property `reviews_last_synced_at` stamp.

Canonical docs (read these before any reviews work):
- `docs/REVIEWS_BLUEPRINT.md` — full subsystem contract: state
  model, schema, Channex integration, API surface, UI surface,
  worker, gap analysis, open bugs, roadmap.
- `docs/REVIEWS_DATA_TRUTH.md` — companion diagnostic doc;
  three-column comparison of source-of-truth vs persisted vs
  rendered, with the lesson "stamp channel_code at sync, never
  derive at read."

Open: VPS `koast-reviews-sync.timer` not yet systemd-enabled
(supervised-first-run gate); BDC reviews not yet ingested
(deferred); `auto_publish` column footgun deletion pending.

## Messaging subsystem (shipped)

MSG-S1 + MSG-S2 wired the `/messages` surface end-to-end: Channex
`/message_threads` pull, channel-asymmetric booking link, ingest
of inbound + property-originated outbound (the latter via worker
reconciliation only — Channex doesn't echo property POSTs via
webhook), real outbound send with three-stage write + optimistic
UI + retry, mark-read (Koast-local source of truth; Channex has
no equivalent endpoint), Airbnb content-filter warning,
mobile-responsive single-column-at-a-time layout, thread.title
fallback for AirBNB null guest names.

Webhook subscription: `event_mask` widened MSG-S1 Phase E to
include `message,inquiry,reservation_request,accepted_reservation,
declined_reservation,alteration_request`. Webhook handler at
`src/app/api/webhooks/channex/route.ts` dispatches messaging
events to `src/lib/webhooks/messaging.ts:handleMessagingEvent`.

Canonical docs (read these before any messaging work):
- `docs/MESSAGING_AUDIT.md` — read-only state inventory pre-build.
- `docs/MESSAGING_DESIGN.md` — slice 1 contract (schema, ingest
  topology, route shape, channel-asymmetric booking link, slice
  cuts §4.1 / §4.2 / §4.3 for outbound / templates / search /
  attachments).

Open: per-cleaner-style index page (Tier-3); attachments;
search; templates trigger executor; AI draft K-button wiring
(slice 3 — `/api/messages/draft` route exists, button still
disabled).

## Session arc (reference)

Polish-pass arcs `5a.X` and `5b.X` built the Calendar + sidebar UI
from bare-bones to per-channel editing with bulk confirmation.
Session 6 → RDX-* shipped reviews. MSG-S1 + MSG-S2 shipped
messaging through outbound send. TURN-S1a shipped turnovers
correctness pass with the inert-trigger pg_net path; TURN-S1b
(reminder worker) and TURN-S2 (the trigger activator + post-soak
follow-up) are queued.

PD-V1 (commit `a752dfa`, 2026-04-27) — visual primitive migration
of `/properties/[id]`. TabBar adopted `KoastSegmentedControl`
(resolves the 2.8 doc/code drift documented in CLAUDE.md), StatusBanner
adopted `KoastCard` + `StatusDot` + `KoastChip`, two empty states
adopted `KoastEmptyState`, hero "Connect listing" → `KoastButton`,
`Field`/`TextInput`/`Stepper` extracted to `src/components/ui/FormControls.tsx`,
entrance keyframes moved to `globals.css`, two new tokens
(`--shore-soft #f5f1e8`, `--hairline #e5e2dc`).

PD-B1 (commit `7c1cce8`, 2026-04-27) — behavioral correctness
follow-on. New `[id]/loading.tsx`, `[id]/error.tsx` (first error
boundary in the app — sets the pattern for future ones),
`[id]/not-found.tsx`. New `src/lib/validators/properties.ts`
(first occupant of `validators/` dir, exports
`propertyUpdateSchema` + `flattenFieldErrors` helper). New
`PUT /api/properties/[propertyId]` handler with zod-validated
body, server-side Nominatim geocode lift, explicit `updated_at`
bump. `PropertyDetail.tsx` `handleSave` migrated from direct
supabase-js to fetch-PUT with field-level error plumbing.
Collapsed two redundant `bookings` queries and two redundant
`calendar_rates` queries on `[id]/page.tsx` into one wider query
each. `guest_reviews` query bounded to most recent 1000.
`zod@4.3.6` added as a new dependency.

`/pricing` audit (read-only, 2026-04-27) — surfaced 13 bugs +
dual-engine drift (the page reads/writes `calendar_rates.suggested_rate`
via legacy routes while Property Detail Pricing tab reads/writes
`pricing_recommendations` via `usePricingTab`). Three rebuild
directions identified (R1 visual / R2 portfolio rebuild on new
system / R3 delete the route). See tech-debt for details. Awaiting
scope decision; no code shipped yet.

Automation engine (Session 8+) and Tier 2 / Tier 3 from
`ROADMAP/PATH_TO_5K.md` come after.
