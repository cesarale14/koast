# Koast Active Tech Debt

Ongoing debt items with file:line pointers so future sessions can
pick them up opportunistically. This list is living — drop entries
as they're fixed, add new ones as they're discovered.

Current as of 2026-04-30.

## Resolved this batch (2026-04-29 → 2026-04-30)

Closed-out items kept here as historical record so future
sessions can find the context. Remove these once the resolved
items are >30 days old.

- **Reviews production-readiness (Sessions 6.7 → 6.7e).** Shipped:
  list-card and slide-over both use shared
  `resolveDisplayGuestName`, manual override editor live (6.7d),
  vocabulary unified to "reply" / "draft ready" (6.7c, 6.7e).
  Reviews subsystem reads as production-ready for first-host
  onboarding.
- **iCal cancellation defense-in-depth (Sessions 6.8 → 6.8c).**
  Diagnostic (6.8) reframed the original "missing bookings"
  premise as a stale-status drift caused by the iCal cancellation
  pass. Audit (6.8a) confirmed 0 actual data loss. Fix (6.8b)
  added `AND channex_booking_id IS NULL` guard at
  `booking_sync.py:497-520`. TS parity (6.8c) applied the same
  dual-guard at `src/lib/ical/sync.ts:223-251` so the manual
  `/api/ical/sync/[propertyId]` route can't reintroduce the bug.
  All 4 backfilled rows (Briana / Nadia / Kathy / Venus) durably
  status='confirmed'.
- **BR1 staycommand → koast brand rename.** Codebase, GitHub
  repos (cesarale14/koast and koast-workers), Vercel project,
  Supabase display name, VPS directory paths, systemd unit
  filenames + content, .env vars, log paths, skill bundle
  references — all renamed. Branch naming and path drift
  documented. The rebrand is complete; only the BR1 commit lines
  in git history reference the old name.
- **Brand identity v1.0 integration.** brand-final/ deliverables
  shipped to `~/koast/design/brand-final/` and committed on
  branch `brand/initial-identity-v1`. Two commits: initial
  integration + HANDOFF.md cleanup. Awaits review and merge to
  main; see "Pending sessions queued" below for unblocked
  follow-ups.
- **Palette evolution (branch `palette/evolution-v1`, merge
  `8529684`, 2026-04-30).** Four commits (00172bf / 4f6bec6 /
  bd99b58 / 986c188). Added `--lume-light` / `--lume` /
  `--lume-deep`, `--positive` (`#1a3a2a`), `--abyss` (`#0e2218`).
  Exposed `shore-soft` / `hairline` / `white` in tailwind config.
  Retired `--brand-{50..950}` entirely (188 occurrences across 27
  files swept; definitions removed from `globals.css` and
  `tailwind.config.ts`). Closed `--hairline` and `--shore-soft`
  migration entries below. New tech debt surfaced: VRBO color
  reconciliation + rgba/hsl alpha systematization (see "Per-file
  debt" sections). PricingDashboard rate-calendar heatmap kept
  4 inline hex literals — intentional 5-stop data-viz scale.

## Pending sessions queued (post-2026-04-30)

Session-scoped open work lined up. Each is a coherent
single-session unit, ordered by what unblocks what.

- ~~**Palette evolution session.**~~ SHIPPED 2026-04-30 in
  branch `palette/evolution-v1`, merged at `8529684`. Final
  scope: lume cluster (`--lume-light` / `--lume` / `--lume-deep`)
  added; `--positive` `#1a3a2a` and `--abyss` `#0e2218` promoted;
  `shore-soft` / `hairline` / `white` exposed in tailwind config;
  `--brand-{50..950}` fully retired (188 occurrences across 27
  files swept, definitions removed from `globals.css` and
  `tailwind.config.ts`); ~180 hex literals matching existing
  tokens swept to `var(--token)`; 9 bare Tailwind `gray-*` in
  `BookingComConnect` cleaned; `#FF5A5F` → `#FF385C` normalized;
  Logo emerald `#10b981` → Tide `#4cc4cc`. PricingDashboard
  rate-calendar heatmap kept inline literals (intentional, 5-stop
  data-viz). **Unblocked:** marketing-site session.
- **Marketing site session.** Sized 4-8 hours. Builds the
  public marketing site at koasthq.com — home + about +
  features + privacy + terms + contact. Motion-driven hero
  using the cascade animation from the brand-final/ motion
  vocabulary. Uses brand-final/ assets and `--lume-*` tokens
  (palette-evolution prerequisite is now satisfied).
  **Unblocks:** Twilio re-submission (the toll-free number
  carrier verification dissolves once koasthq.com is public
  with proper brand).
- **Brand branch awaiting merge.** `brand/initial-identity-v1`
  on koast repo holds the brand-final/ deliverables. Two
  commits live (b902c4d initial integration + fb944c7
  HANDOFF.md cleanup). Cesar reviews assets + HANDOFF.md, then
  merges to main. No code in the active product surface yet —
  the assets sit in `design/brand-final/`, not yet propagated
  into `public/`, the favicon path, OG meta, etc. Propagation
  is the marketing-site session's job.

## Worker timers not yet enabled (reviews + messaging)

Both worker subsystems shipped with their systemd unit files
present on the VPS but the timers NOT enabled. Manual run +
inspection of `/var/log/koast/<feature>.log` is the
supervised first-run gate before flipping the timer on.

- `koast-reviews-sync.timer` (`~/koast-workers/systemd/`).
  20-min cadence. Reviews use polling as the primary path
  because Channex doesn't document an `event_mask` for review
  events.
- `koast-messages-sync.timer` (same dir). 60-min cadence.
  Messaging uses the webhook as primary; this is reconciliation
  for missed deliveries and for property-originated outbound
  sends (which Channex doesn't echo via webhook per
  channex-expert quirk #25).

Enable command (when ready):
```
sudo cp ~/koast-workers/systemd/koast-<feature>-sync.* /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now koast-<feature>-sync.timer
```

Until enabled, host clicks of "Refresh now" in /reviews and
/messages are the only steady-state sync trigger. The on-connect
trigger fires once per property import.

## `auto_publish` toggle is a misleading-UI footgun (rip-out queued)

`review_rules.auto_publish` (boolean) was originally a dormant
column flagged by REVIEWS_BLUEPRINT §9.4 for deletion when no
UI surfaced it. State has changed: the column **now has a UI
toggle** (`src/components/reviews/ReviewsSettingsModal.tsx`,
wired into `/reviews/page.tsx`), the PUT route at
`/api/reviews/rules/[propertyId]` accepts and persists the
value, and `/api/reviews/generate/[bookingId]` reads
`rule.autoPublish` to set `status="scheduled"` +
`scheduledPublishAt`.

But the original deletion call is **stronger now, not weaker**.
Verified 2026-04-27 via `rg`:

- `/api/reviews/generate/[bookingId]` has **zero callers** in
  src/. Replaced by the new `/api/reviews/respond/[reviewId]`
  flow.
- **No scheduled-publish dispatcher exists.** Zero refs to
  `status="scheduled"` or `scheduledPublishAt` outside the
  generate-route writer. `reviews_sync.py` is pull-side only.

So the toggle persists a value that no live code path consumes.
A host who flips it on expecting auto-publish gets nothing.
This is **misleading-UI**, not a dormant column — sharper
framing than the blueprint's original.

**Fix (queued as a separate polish session, R2 from the
auto_publish discussion):** rip column + Settings toggle +
generate route + autoPublish branches as one coherent commit.
Don't fix the disconnected pieces individually — they're a
package.

## `/pricing` page is a dual-engine drift surface

`src/components/dashboard/PricingDashboard.tsx` (727 LOC) is the OLD
Moora-era pricing UI. It survived every polish-pass arc. Audited
2026-04-27 (full report at `/tmp/PRICING_PAGE_AUDIT.md` and prior
Telegram thread); 13 concrete bugs found and three rebuild
directions surfaced (R1 visual-only / R2 portfolio rebuild on the
new `usePricingTab` system / R3 delete the route entirely).

Key drift symptoms:
- Reads/writes `calendar_rates.suggested_rate` + `factors` JSONB
  via `/api/pricing/preview`, `/approve`, `/override`, `/push`.
- Property Detail Pricing tab (the new system) reads/writes
  `pricing_recommendations` + `reason_signals` via
  `usePricingTab` + `/api/pricing/recommendations|rules|apply|dismiss`.
- Both call `/api/pricing/calculate` for engine recompute and then
  diverge — the two surfaces can show conflicting numbers.

Worst bugs:
- Property switcher updates the dropdown but not the data
  (`useState(initialRates)` never refetches on change).
- `isFreePlan` defaults to `true` and is never overridden — Push
  to OTAs is permanently disabled with "Upgrade to Pro" tooltip
  even for paying users.
- Single-date "Set" override is a fake mutation (local state
  toast, no server call).
- "Accept Suggestion" inline button is fire-and-forget (no await,
  no error handling).
- No URL state — bookmarking / linking from Dashboard CTAs always
  shows the first property.

Open question: is the portfolio-pricing use case real? If yes, R2
(rebuild on `usePricingTab`). If no, R3 (delete + redirect to
`/properties/[firstId]?tab=pricing`).

## Per-file debt

### `property_channels.channel_name` pollution

Some rows store the property name ("Villa Jamaica") where the
channel display name ("Airbnb") belongs. Routes bypass via a local
constant:

```ts
const CHANNEL_DISPLAY_NAMES = { ABB: "Airbnb", BDC: "Booking.com", VRBO: "Vrbo", DIRECT: "Direct" };
```

Found in:
- `src/app/api/calendar/rates/route.ts`
- `src/app/api/channels/rates/[propertyId]/route.ts`

**Fix**: one-shot UPDATE script normalizing the column against the
constant, then drop the route-level workarounds. Low priority —
routes work fine with the constant.

### 8 fetch() sites missing `res.ok` checks

Silent-failure pattern: `fetch(...)` called but response status
never inspected. If the route returns 4xx/5xx, the UI hits no-op
paths without surfacing the error.

Known sites:

- `src/components/dashboard/BookingComConnect.tsx:99`
- `src/components/dashboard/BookingComConnect.tsx:123`
- `src/components/dashboard/PricingDashboard.tsx:191`
- `src/components/dashboard/PricingDashboard.tsx:680`
- `src/components/dashboard/TurnoverBoard.tsx:185`
- `src/components/dashboard/TurnoverBoard.tsx:218`
- `src/components/ui/ReviewBadge.tsx:11`
- `src/components/ui/AddressAutocomplete.tsx:63`

**Fix**: add `if (!res.ok) { throw new Error(...) }` + error toast
wiring. Mechanical. Could be a single polish session.

### Use the canonical guest-name renderer across surfaces

Two distinct guest-name renderers existed before Session 6.7
caught the gap:
- `src/lib/guest-name.ts:resolveDisplayGuestName` — used by the
  reviews surface. Handled the `ICAL_AIRBNB_SENTINEL` correctly.
- `src/components/polish/KoastBookingBar.tsx:firstAndInitial`
  (local helper) — used by the calendar pill. **Did not** know
  about the sentinel, rendered iCal-cohort `'Airbnb Guest'` as
  `"Airbnb G."`.

Session 6.7 extracted `resolveBookingPillLabel` into the same
canonical file so the calendar pill shares the sentinel +
`" None"` strip + platform-fallback logic. Convention captured
in the helper's header comment: any new surface that displays a
guest name as a short label should call into the canonical
helper, not reinvent the truncation.

**Outstanding surfaces to audit**: anywhere we render a guest
name today should be cross-checked against the canonical
helper. Likely candidates: `UnifiedInbox.tsx`'s thread list
(uses `firstNameLastInitial` locally), `PropertyDetail.tsx`'s
StatusBanner / UpcomingBookings (uses local `firstNameLastInitial`).
Each is structurally similar to the calendar bug; the iCal
sentinel + `" None"` artifact would render the wrong label
identically.

**Fix** when next touching any of those surfaces: replace the
local helper with `resolveBookingPillLabel({ guestName, platform })`
or `resolveDisplayGuestName({...})` per the use case. ~5 LOC per
surface. Defer until you're already in the file for unrelated
work.

### `GuestReviewForm` sends `tags: null` — missing per-category Airbnb tag chips

`src/components/reviews/GuestReviewForm.tsx:85` submits `tags: null`
on every host→guest counter-review. Airbnb's native form (and
Channex's admin proxy of it, screenshotted 2026-04-28) surfaces
**per-category structured tag chips** below each star rating:
positive variants for ratings ≥4, negative variants for ratings ≤3.
Channex's `POST /reviews/:id/guest_review` accepts a `tags` array
of `host_review_guest_{positive|negative}_{snake_case_label}` codes
— wire format is ready, the UI just doesn't surface it.

Examples from the screenshot:
- House Rules (negative, low rating): `arrived_too_early`,
  `stayed_past_checkout`, `unapproved_guests`, `unapproved_pet`,
  `didn_t_respect_quiet_hours`, `unapproved_filming_or_photography`,
  `unapproved_event`, `smoking`.
- Communication (negative): `unhelpful_responses`, `disrespectful`,
  `unreachable`, `slow_responses`. (Positives: `helpful_messages`,
  `respectful`, `always_responded`.)
- Cleanliness (negative): `damaged_property`, `ruined_bed_linens`,
  `messy_kitchen`, `excessive_garbage`, `ignored_check_out_directions`.
  (Positives: `neat_and_tidy`, `kept_in_good_condition`,
  `took_care_of_garbage`.)

**Fix shape (~3-4 hours):**
1. Source the canonical Airbnb tag list per category × polarity.
   Probably needs probing Channex/Airbnb docs OR submitting a few
   reviews via Channex and observing what comes back. Three categories
   today (`cleanliness`, `communication`, `respect_house_rules`); each
   has both polarities; ~8 tags per quadrant ≈ 48 codes total.
2. Extend the form state to track selected tags per category as
   `Map<category, Set<tag_code>>`.
3. Render chip rows below each star picker. Polarity swap: ratings
   ≥4 show positive chips; ≤3 show negative chips. (Channex's UI
   does this conditional render; matches Airbnb's host-side flow.)
4. Submission wiring: `tags: [...flatten all selected codes]`
   instead of `null`.

Acceptable defer because `tags: null` is accepted by Channex on the
wire — submission still succeeds. Hosts get less rich feedback
than Airbnb's native form, but reviews land. Defer to session 6.7.3
or 6.8 depending on private-beta launch priority.

### iCal cancellation by absence-from-feed is structurally fragile

`booking_sync.py:492-507` cancels local bookings when their
`platform_booking_id` disappears from the iCal feed. Worked in the
all-iCal world; broke after Channex OAuth reconnect because Airbnb
stops including OAuth-connected bookings in its iCal export.
Diagnosed 2026-04-28 (Margot Castillo's HM9JXBCTHB was the worked
example — Channex stamped status='confirmed', next iCal tick 5min
later flipped to cancelled). Fixed in commit 7518918 by restricting
the cancellation pass to `source='ical'` rows.

The deeper issue: cancellation by *absence-from-feed* is a negative
signal. If Channex/Airbnb/the network blips and a feed pull returns
empty or partial, every booking gets cancelled until the next pull.
Cancellation should rely on **positive** signals:
- Channex booking_revisions with `status='cancelled'`
- Channex webhook `booking_cancellation` / `booking_cancelled`
- iCal CANCEL event with the same UID (real cancellation per RFC
  5545)

**Fix**: rewrite the iCal-cancellation pass to require a CANCEL
sentinel rather than absence. Worth doing when next touching
`booking_sync.py`.

### Booking-revisions feed gap on Villa Jamaica — RESOLVED + RESCOPED (Sessions 6.8 → 6.8c, 2026-04-29 → 2026-04-30)

**Update 2026-04-30.** The "Outstanding fix scopes" section
below has been fully addressed: scope (2) shipped in Session
6.8b (worker-side `AND channex_booking_id IS NULL` guard at
`booking_sync.py:497-520`); scope (3) reframed and dropped
in 6.8a's audit (no real silent-ack data loss; the original
worry was misframed). Plus 6.8c added the same dual-guard to
the TS-side manual sync route at `src/lib/ical/sync.ts:223-251`
for surface symmetry. See "Resolved this batch" at top of file
for the closure summary.

**Original premise was wrong.** Session 6.8 reframed it (both
bookings WERE local) and Session 6.8a's silent-ack audit closed
the loop. Findings:

**0 actual data loss.** Of the 15 historical "Property X not in
Supabase, acknowledging and skipping" silent-acks (Apr 9-13
window):
- 11 (γ) referenced two channex_property_ids never present in
  Koast's properties table (likely the Pool House / Modern House
  / Stadium Loft "previously listed but removed" properties from
  CLAUDE.md, or onboarding scaffolds). Channex /bookings/{id}
  now 404s for all 11 — aged out of Channex's ~50-day window or
  deleted with the scaffold property. These acks were
  structurally correct (revisions for properties Koast doesn't
  manage), just unmonitored.
- 4 (α) were on Villa Jamaica or Cozy Loft. All 4 had bookings
  present locally via OTHER paths (webhook, iCal placeholder).
  The silent ack lost a SPECIFIC revision, but the booking
  itself was tracked.

**4 Briana-class drifts identified and backfilled** (status
'cancelled' locally, status 'new' on Channex):
- Briana Ybarra (HM3B9J5EAS) — Session 6.8 backfill
- Nadia Orenday (HMKQEXQKH3), Kathy Joseph (HMKDQAPJSZ),
  Venus Maldonado (HM493KQ2F9) — Session 6.8a backfill

These drifts were caused by the iCal cancellation pass at
`booking_sync.py:494-510` (NOT by the silent acks themselves).
Same class of bug the Margot Castillo postmortem comment in
that block describes — OAuth-connected Airbnb listings stop
including bookings in their iCal export, so the absence-from-
feed pass concludes "cancelled" when Channex still considers
the booking active.

**The silent-ack root cause was not Channex returning bad
JSON.** It was `properties.channex_property_id` being NULL in
Koast's DB during the OAuth onboarding window, before backfill
populated the column. The worker's startup query
`SELECT id, channex_property_id WHERE channex_property_id IS
NOT NULL` excluded the property until the column was filled,
so revisions arriving during the gap silent-acked. After
backfill, subsequent revisions resolved cleanly.

Outstanding fix scopes (separate sessions):

(2) iCal cancellation pass guard. ~5 LOC. Add
    `AND channex_booking_id IS NULL` to the cancellation SELECT
    at `booking_sync.py:497-503`. Channex-tracked rows are
    authoritative under Channex's status, not iCal's
    absence-from-feed signal. Defensive: explicit
    `source='ical'` on the iCal-side INSERT at line 481.

(3) Refined to: distinguish property-in-Koast-but-link-NULL
    from property-not-in-Koast-at-all.
    - First case (link NULL during onboarding): don't ack.
      Either defer-and-retry, OR pre-flight check that
      properties.channex_property_id is populated before the
      worker starts processing revisions, OR add a weekly
      reconciler that pulls all Channex /bookings on connected
      properties to backfill anything missed during the gap.
    - Second case (property genuinely not in Koast): ack-with-
      reason. Log to a structured skip table or extend
      channex_webhook_log with action_taken='skipped_unknown_
      property'. Surface in monitoring per the "Silent acks"
      convention.

(c1, originally property=null fallback) — DROPPED. The audit
showed no silent acks were of that shape (the property IDs
logged were real UUIDs, not "None"). The "property=null in
/bookings JSON relationships" anomaly observed in Session 6.8
is a separate Channex-side display quirk that doesn't actually
affect ingestion (filter[property_id] still works correctly).

See also "Silent acks are an invisible failure mode" and
"Transient onboarding state can look like upstream anomalies"
conventions in conventions.md.

### `properties.updated_at` not auto-bumped on UPDATE

Drizzle's `defaultNow()` only fires on INSERT, and there is no
`BEFORE UPDATE` trigger on the `properties` table. PD-B1 (commit
`7c1cce8`, 2026-04-27) added explicit `updated_at: new Date()...`
to the new `PUT /api/properties/[propertyId]` handler, so the
Settings modal is now correct. But every other writer leaves the
column stale: `booking_sync.py`, messaging sync, Channex reconnect,
`cleaning_tasks` updates that touch the property row.

**Fix**: add a Postgres `BEFORE UPDATE` trigger that bumps
`updated_at = now()`. ~5 lines of SQL migration. Then drop the
explicit set in the PUT handler.

### ~~`--hairline` token migration sweep~~ — RESOLVED 2026-04-30

Closed by palette evolution (merge `8529684`, Commit A
`00172bf`). All 24 `#E5E2DC` literals swept to `var(--hairline)`;
redundant `var(--hairline, #E5E2DC)` fallbacks collapsed.

### Drizzle inline UNIQUE constraint declared as `uniqueIndex()`

Session 8a's `message_automation_firings` table declared a
multi-column unique constraint two ways:

- Migration SQL: `UNIQUE (template_id, booking_id)` inline
  inside `CREATE TABLE`. Postgres auto-names the resulting
  constraint `message_automation_firings_template_id_booking_id_key`
  per its standard convention.
- Drizzle schema: `uniqueIndex("idx_message_automation_firings_unique").on(t.templateId, t.bookingId)`.
  This declares a separate named UNIQUE INDEX, distinct from
  the auto-named CONSTRAINT.

Live DB has the auto-named CONSTRAINT (from the SQL apply,
2026-04-27). Drizzle's view of the schema thinks there's an
INDEX named `idx_…_unique`. Next `drizzle-kit generate` may
try to rename or add a duplicate. Two-line fix:

- Either rename the SQL constraint to match Drizzle's
  declaration (`ALTER TABLE … RENAME CONSTRAINT …`).
- Or change the Drizzle declaration to `unique().on(t.templateId, t.bookingId)` (no name argument), which matches the
  Postgres auto-naming convention for inline `UNIQUE (...)`.

Recommendation: change the Drizzle side (option 2). Postgres's
auto-naming is the project's de-facto convention since most
inline UNIQUE constraints share that pattern.

Lesson for future scheduled-write idempotency tables: declare
the unique constraint in Drizzle as `.unique().on(...)`, not
`.uniqueIndex("name").on(...)`. The latter creates a separate
INDEX object alongside the constraint and produces the same
drift.

### ~~`--shore-soft` migration in KoastSegmentedControl~~ — RESOLVED 2026-04-30

Closed by palette evolution (merge `8529684`). Both
`KoastSegmentedControl.tsx:45` and `AvailabilityTab.tsx:59` now
read `var(--shore-soft)`. `--shore-soft`, `--hairline`, and
`--white` are also exposed as Tailwind utility classes now.

### VRBO color reconciliation (NEW, surfaced 2026-04-30)

Three distinct blues are in play, the canonical one is undefined:
- `--vrbo` in `globals.css` is set to `#3145F5` — does not match
  any actual VRBO brand asset.
- `#0B4DA2` (real VRBO brand blue) is used in
  `src/components/ui/PlatformLogo.tsx:59-60` for the ABB/BDC/VRBO
  platform-key map.
- `#3B5998` (originally read as Facebook brand blue, but no FB
  UI exists) is used as the VRBO color in
  `src/components/calendar/BookingBar.tsx:7` and
  `src/app/(dashboard)/onboarding/page.tsx:49` — mis-attributed.

CLAUDE.md states VRBO is intentionally omitted from PLATFORMS
("no properties use it today and the brand SVG assets are not in
the repo. Re-add when assets land"). When VRBO re-introduction
happens, reconcile to `#0B4DA2` from a single source via
`PLATFORMS.vrbo`, update `--vrbo` in `globals.css`, and delete
both `BookingBar` and `onboarding` fallbacks.

Surfaced (not fixed) in palette evolution Commit B
(`4f6bec6`) per "investigate but don't fix" anti-scope.

### Alpha-systematization pass (NEW, surfaced 2026-04-30)

381 `rgba(...)` literals in `src/` (excluding `globals.css`).
138 distinct values, mostly token-derivable variants —
`rgba(26,122,90,…)` = `--lagoon`, `rgba(196,64,64,…)` =
`--coral-reef`, `rgba(196,154,90,…)` = `--golden`, etc., across
multiple alpha levels. Tailwind opacity modifiers (`bg-token/40`)
don't compose with `var()`-defined custom colors in this config,
so direct migration loses the alpha. Real fix requires either
`color-mix()` adoption or RGB-channel tokens (`--lagoon-rgb: 26 122 90`)
that compose with `rgb(var(--lagoon-rgb) / <alpha-value>)`.

Out of scope for palette evolution per the brief. Tracked here
as the next palette-system step. Pairs naturally with adopting
Tailwind v4 (which has first-class CSS-vars-with-alpha support)
when that upgrade lands.

### `booking_sync.py` reports "9 updated" every run

`~/koast-workers/booking_sync.py` idempotent no-op upserts
count as updates. Log line is slightly misleading but harmless.

**Fix**: add a "changed rows" vs "processed rows" distinction in
the upsert path. Low priority — log noise only.

### `calendar_rates` missing `updated_at`

The table lacks an `updated_at timestamptz` column. Sessions 5a.6 /
5b.3 worked around via `last_pushed_at` (per-channel write timestamp)
and `created_at` (only populated on insert). A real `updated_at` with
a trigger would be cleaner for downstream consumers.

**Fix**: migration adding `updated_at timestamptz DEFAULT now()` +
a BEFORE UPDATE trigger. ~5 lines of SQL. Low priority — current
workarounds suffice.

### Cozy Loft Airbnb not yet onboarded via 5a.6 flow

Cozy Loft - Tampa (`57b350de-e0c7-4825-8064-b58a6ec053fb`) has a
`property_channels` row for Airbnb with stale Channex state. The
Session 5a.6 reconnect flow was only run for Villa Jamaica. Cozy
Loft's rates don't sync or push.

**Fix**: re-run the 5a.6 flow for Cozy Loft. Single session. Same
script, different property id.

### Airbnb rates running $20-30 under Koast engine base

Villa Jamaica's Airbnb listing consistently shows prices $20-30
below what the Koast pricing engine considers the base rate. The
Airbnb app has its own pricing logic (Smart Pricing, seasonal
rules) that we haven't fully overridden. Unclear whether the
right response is:

1. Push Koast rates harder / more frequently to override Airbnb.
2. Accept Airbnb's rate and let the engine treat it as the floor.
3. Add a "market-following" toggle that tracks Airbnb's rate
   instead of pushing Koast's base.

**Decision pending**. Active item in post-Session-6 discussions
(see Telegram thread around Session 5a.6 testing).

## Paused / gated infrastructure

### AirROI paused

`KOAST_DISABLE_AIRROI=true` in Vercel prod (set 2026-04-22). Market
data sync is off. The `koast-market.timer` systemd unit is
disabled on the VPS. AirROI bill hit ~$30/month during peak usage
and value-per-call was unclear; Cesar killed it pending a decision
on whether to build a replacement (Inside Airbnb has public data
for some markets, not Tampa).

Touching AirROI code without explicit instruction is a no. The
kill switch is the current approved state.

See:
- `src/app/api/market/refresh/[propertyId]/route.ts` — gated on the
  env flag.
- `~/koast-workers/market_sync.py` — disabled via systemd.

### BDC calendar-push gate still respected

`KOAST_ALLOW_BDC_CALENDAR_PUSH` gate was added after a BDC-clobber
incident (`docs/postmortems/INCIDENT_POSTMORTEM_BDC_CLOBBER.md`).
Even though `buildSafeBdcRestrictions` has been battle-tested
through Sessions 5a.6, 5b.3, 5b.4, 6, the gate stays. Per the
safety-mechanism conservatism rule. Don't rip it out until there's
real incident-free traffic evidence at scale.

## Deferred features

These aren't debt exactly — they're known gaps awaiting their turn.

- **Messaging sync** (Session 7 target) — Channex message_threads
  API exists, Koast's `/messages` UI renders from DB only. Need:
  `channex.getMessageThreads` + `sendMessageToThread`, sync route,
  webhook extension. Schema OK (`messages` table, 5 hand-seeded
  rows; `message_templates` table empty but has `trigger_type` /
  `trigger_days_offset` / `trigger_time` columns ready for an
  executor).
- **Automation engine** (Session 8+) — scheduler + trigger logic +
  Channex sender. Designed at spec level, not built.
- **Direct booking MVP** — vision tier per `PATH_TO_5K.md`. Not on
  the next 6-month plan.
- **Listing builder** — vision tier.
- **Koast AI chat (Category 12+ in FEATURE_INVENTORY)** — long
  vision, not near-term.
- **Webhook subscription for message/review events** — Channex
  hasn't documented the event_mask string for these; pending a
  support email. Polling-based sync works for the MVP.

## Minor UI things

- `/reviews` page renders from `guest_reviews.incoming_text` +
  `incoming_rating`. The 10 reviews pulled in Session 6 have
  `booking_id: null` (no local booking match) — UI doesn't care
  since it doesn't need booking context to display, but the
  AI-draft path (`/api/reviews/respond` generate action) will
  produce less-personalized drafts for these orphans.
- **Tier 2 of guest-name resolver inert until Airbnb OAuth
  reconnects through Channex.** RDX-3 (commit `2460687`) wired
  the booking-link join via `bookings.ota_reservation_code`. It
  works correctly. But Cesar's Airbnb is currently iCal-only
  (per CLAUDE.md "Airbnb OAuth currently disconnected from
  Channex"), and iCal feeds expose email-UID, not HM-codes.
  Until Airbnb-via-Channex is reconnected, every Airbnb review
  falls through to the platform-tagged "Airbnb Guest" fallback.
  The Channex revisions feed will then start delivering bookings
  with `ota_reservation_code = HM…` matching incoming review
  HM-codes, and tier 2 lights up with no Koast change needed.

## Dated removals (90-day window from 2026-04-26)

These are not bugs — they're transition-period concessions that
should be cleaned up after the new state is observed working.

- **2026-07-26: drop `guest_reviews.is_bad_review` column.**
  RDX-4 (commit `2460687`) decomposed it into `is_low_rating`
  (sync-derived) and `is_flagged_by_host` (host-asserted). The
  legacy column is kept in lockstep by the approve route
  (`src/app/api/reviews/approve/[reviewId]/route.ts`) for one
  release cycle so any in-flight reads keep working. After the
  date: drop the column, drop the `isBadReview:` field from
  `src/lib/db/schema.ts:guestReviews`, drop the lockstep write
  from the approve route, and grep for any remaining readers.
- **2026-07-26: drop `platform_booking_id` fallback in
  reviews-sync booking lookup.** RDX-3 (commit `2460687`) made
  `bookings.ota_reservation_code` the primary join key with
  `platform_booking_id` as a transition fallback. After 90 days
  every Channex-sourced booking should have re-synced through
  the helpers that populate `ota_reservation_code`. Drop the
  fallback in `src/lib/reviews/sync.ts:89-105` and the mirror
  block in `~/koast-workers/reviews_sync.py:147-157`.
  iCal-sourced rows (email-UID `platform_booking_id`) stay
  unjoinable — that's correct, not a fallback need.
- Logo hover tooltips on per-platform rate cards use native
  `title` attribute. Session 5b.3 removed the misleading
  `cursor: "help"` CSS that rendered a `?` cursor glyph. No
  popover library.

## Inert legacy Airbnb-via-credentials channel on Villa Jamaica

Discovered MSG-S2-PRE (2026-04-26). Channex shows a third Villa
Jamaica channel `6c84a037-ee9a-40a3-80ce-5f4d57b7ebff` with
`is_active=false`, settings shape `{email, password, username}`
(legacy username/password connection that pre-dates the current
OAuth Airbnb channel `93f436bc-…`). 0 rate plans, no actions
available. Not surfaced in local `property_channels` (Koast import
skipped it). Inert — does not affect rate sync, booking sync, or
messaging.

**Fix**: confirm with Cesar that this channel is genuinely unused,
then delete via the Channex dashboard (no API delete from Koast
needed). Tracking but not urgent. Reference:
MSG-S2-PRE Telegram report §1.

## Schema drift — partial unique index audit (PG-PARTIAL-AUDIT, 2026-04-26)

Two partial-unique-index drift findings surfaced during the
audit. Neither is a HIGH-risk bug today (no PostgREST upsert
intersects), but the source-of-truth is unclear and a future
session may chase the wrong file. Investigate and reconcile
within 30 days (target 2026-05-26).

- **`idx_properties_channex_id` missing from live DB.**
  `supabase/migrations/002_channex_constraints.sql:4-6` declares
  it as a partial UNIQUE on `properties(channex_property_id)
  WHERE channex_property_id IS NOT NULL`. `pg_indexes` shows no
  such index live (only `properties_pkey` on the `properties`
  table). `src/lib/db/schema.ts:44` still mirrors the declaration.
  Either the migration never reached prod, or a follow-up dropped
  it without recording. Investigate which is true; either re-apply
  the constraint (full UNIQUE per the new convention) or remove
  the dangling reference from `schema.ts` and document the drop.
- **`idx_cleaning_tasks_token` shape changed without recording.**
  `supabase/migrations/003_cleaning_tokens.sql:3` declares it
  partial (`WHERE cleaner_token IS NOT NULL`). Live DB shows it
  as a full unique index (no `WHERE`). Some follow-up promoted
  it; no migration records the change. Currently safe (full ⇒
  PostgREST-targetable), but the source-of-truth ambiguity is
  itself a debt item. Either find the missing migration or add
  one that documents the current state explicitly.

## Twilio toll-free number not verified — every SMS silently fails at carrier

Discovered TURN-S1a end-to-end test (2026-04-26). The Koast
Twilio number `+18444913860` is a US toll-free number. Since
June 2024, US carriers reject all SMS from unverified toll-free
numbers with error_code **30032 — "Toll-Free Number Not
Verified."** Twilio submission succeeds (HTTP 201, status
`queued`), Twilio attempts carrier delivery, carrier rejects;
phone receives nothing.

Affects every `notify*` helper in `src/lib/notifications/index.ts`:
`notifyCleanerAssigned`, `notifyCleanerReminder`,
`notifyHostComplete`, `notifyHostIssue`. Also the
`/api/cleaners` PUT Test SMS endpoint and `/api/turnover/notify`.
All paths submit successfully and Twilio bills for the failed
segment.

**Fix (Twilio side, no Koast code change):** complete Twilio
Toll-Free Verification (TFV) at Console → Phone Numbers →
Manage → Toll-Free Verifications. Free; approval typically
1-3 weeks. Once approved all sends from the number deliver
normally.

**Until TFV approves, surface this in any session that touches
SMS** — a "successful" send in Koast logs (`sms_log.status='sent'`,
HTTP 201, no thrown error) does NOT mean the recipient got
anything. If a host reports "the cleaner didn't get the text,"
this is the first place to look, not the Koast code.

## `sms_log.status` reconciliation gap

Discovered TURN-S1a end-to-end test (2026-04-26). The
`logSMS` helper in `src/lib/notifications/sms.ts:50-69` stamps
`sms_log.status = 'sent'` based on Twilio's initial response
(`queued` / `sent`), but never reconciles to the terminal status
(`delivered` / `undelivered` / `failed`). Result: a 30032-rejected
message looks `'sent'` in our DB, the audit trail lies.

**Fix:** add a Twilio `StatusCallback` URL to every send (a new
internal route, e.g. `/api/internal/twilio-status` that updates
`sms_log` by twilio_sid) AND a column for `error_code`. Surfaces
30032 + carrier rejections + delivery confirmations without
manual Twilio Console queries.

Should ship around the same time as Twilio TFV approval lands —
no point reconciling to "undelivered: 30032" repeatedly until
the toll-free fix turns those into "delivered."
