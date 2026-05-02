# Belief 4 — The Control Gradient Inventory

*Belief: "The control gradient." — actions are stakes-tiered, calibrated per-host from observed approval patterns, with high-stakes always confirmed and low-stakes eventually autonomous. Host can always inspect and override.*

This is an inventory of the current "action layer" of `~/koast` — what operations Koast actually executes, how they're authorized, where the gradient layer would naturally insert. Investigation only. No code changes.

Verified against the codebase + live Supabase (row counts inline) on 2026-05-01. Cross-references Belief 1 (config inventory), Belief 2 (chat inventory), Belief 3 (memory inventory).

---

## 1. Current action catalog

The `src/app/api/` tree contains **72 routes** with at least one write method (POST/PUT/PATCH/DELETE). Plus 10 Python workers under `~/koast-workers/` that perform autonomous DB and Channex writes via psycopg2 / httpx. Catalog by category:

### 1a. Pricing actions

| Action | Route | Trigger | Platform target |
|---|---|---|---|
| Recompute engine output | `POST /api/pricing/calculate/[propertyId]` | User click + worker (`pricing_validator.py`) | DB only (`calendar_rates.suggested_rate` + `factors`) |
| Read-or-infer pricing rules | `GET /api/pricing/rules/[propertyId]` | First read of rules tab | DB write if missing (insert `inferred`/`defaults`) |
| Edit pricing rules | `PUT /api/pricing/rules/[propertyId]` | RulesEditor blur-save | DB upsert (`source='host_set'`) |
| Apply recommendations to BDC | `POST /api/pricing/apply/[propertyId]` | "Apply" button in PricingTab | Channex `updateRestrictions` (BDC), gated by env `KOAST_ALLOW_BDC_CALENDAR_PUSH` (default off) |
| Approve a recommendation | `POST /api/pricing/approve/[propertyId]` | UI button (variant of apply) | DB-only status flip |
| Override a recommendation | `POST /api/pricing/override/[propertyId]` | UI button | DB-only — host-typed rate replaces engine suggestion |
| Dismiss a recommendation | `POST /api/pricing/dismiss` | UI dismiss button | DB-only (`status='dismissed'` + `dismissed_at`) |
| Push rates to channel(s) | `POST /api/pricing/push/[propertyId]` | Per-channel rate editor | Channex per-channel, gated for BDC by `buildSafeBdcRestrictions` |
| Per-channel rate set | `POST /api/channels/rates/[propertyId]` | Calendar per-channel editor | Channex per channel |
| Calendar rate edit (bulk) | `POST /api/calendar/rates/apply` | Calendar Pending Changes Bar | Channex (per-channel dispatch) + DB upsert |
| Base-rate edit | `PATCH /api/calendar/base-rate/[propertyId]` | RulesEditor | DB-only |
| Preview a BDC push (dry-run) | `POST /api/pricing/preview-bdc-push/[propertyId]` | Read-only preview | None — read-only, NOT gated by env flag |
| Commit a BDC push (idempotent) | `POST /api/pricing/commit-bdc-push/[propertyId]` | Companion to preview | Channex, gated by `KOAST_ALLOW_BDC_CALENDAR_PUSH` |
| Sync rates from Channex | `POST /api/pricing/sync-channex/[propertyId]` | UI sync button | Channex read → DB write |

**Authorization**: every route checks `getAuthenticatedUser` + `verifyPropertyOwnership`. There is **no approval gate beyond authentication** for these routes — they execute on user click immediately. The only kill-switch is the env gate on BDC writes.

### 1b. Messaging actions

| Action | Route | Trigger | Platform target |
|---|---|---|---|
| Generate AI draft for an inbound | `POST /api/messages/draft` | User clicks "Draft" in inbox | Anthropic API call → DB write (`ai_draft` + `draft_status='generated'`) |
| Send to thread | `POST /api/messages/threads/[id]/send` | User clicks Send | Channex `POST /message_threads/:id/messages` → DB row insert |
| Discard draft | `POST /api/messages/threads/[id]/discard` | User clicks Discard on a `draft_pending_approval` | DB-only status flip |
| Mark thread read | `POST /api/messages/threads/[id]/mark-read` | Thread open | DB-only |
| Send (legacy/internal) | `POST /api/messages/send` | Internal | Channex |
| Inbound sync | `POST /api/messages/sync` + worker `messages_sync.py` (60min) | Scheduled + on-demand | DB writes from Channex polling |
| Auto-draft from template | worker `messaging_executor.py` (hourly) | Time-anchored on bookings | DB insert with `draft_status='draft_pending_approval'` — **NEVER sends autonomously** |

**Authorization for outbound**: only the host's click via `/api/messages/threads/[id]/send` actually commits to Channex / OTA. The hourly worker stops at draft creation.

### 1c. Booking / calendar actions

| Action | Route | Trigger | Platform target |
|---|---|---|---|
| Create booking | `POST /api/bookings/create` | User (manual entry) | Channex CRS booking + availability push |
| Edit booking | `POST /api/bookings/[id]/edit` | User | Channex |
| Cancel booking | `POST /api/bookings/[id]/cancel` | User (e.g. from ConflictResolution) | Channex cancel + availability restore |
| Conflict resolution | `POST /api/bookings/[id]/cancel` from `ConflictResolution.tsx` | User picks which side to cancel | Channex |
| Block dates | (via calendar editor `is_available=false`) | User | Channex availability |
| Auto-block from iCal | worker `booking_sync.py` (every 15 min) | Scheduled | Channex availability=0 push for newly-imported iCal bookings |

### 1d. Channel / integration actions

| Action | Route | Trigger | Platform target |
|---|---|---|---|
| Connect Booking.com | `POST /api/channels/connect-booking-com` | User onboarding flow | Channex create channel + room type + rate plan |
| Test BDC connection | `POST /api/channels/connect-booking-com/test` | User | Channex test endpoint |
| Activate BDC channel | `POST /api/channels/connect-booking-com/activate` | User | Channex `POST /channels/{id}/activate` + push availability — gated by `KOAST_ALLOW_BDC_CALENDAR_PUSH` |
| Channel refresh | `POST /api/channels/[propertyId]/refresh` | User | Channex |
| Setup webhook | `POST /api/channex/setup-webhook` | User / onboarding | Channex |
| Full sync | `POST /api/channex/full-sync` | User / onboarding | Channex read |
| Bookings sync | `GET /api/channex/sync-bookings` | User Settings button | Channex pull |
| iCal feed add | `POST /api/ical/add` | User in property add wizard | DB insert (preview mode skips writes) |
| iCal feed delete | `DELETE /api/ical/[feedId]` | User | DB |
| iCal sync | `POST /api/ical/sync/[propertyId]` | User + worker `booking_sync.py` | DB + Channex availability |
| Channex import | `POST /api/channex/import` | User onboarding | Channex read → bulk DB insert |
| Property auto-scaffold | `POST /api/properties/auto-scaffold` | Internal during connect-flow | Channex create property |
| Scaffold cleanup | `POST /api/properties/cleanup-scaffolds` | Recovery / manual | Channex deleteProperty |

### 1e. Property actions

| Action | Route | Trigger | Platform target |
|---|---|---|---|
| Create property | client supabase `from('properties').insert` in `/properties/new` | User | DB only (no Channex side) |
| Update property | `PUT /api/properties/[propertyId]` | Property Settings modal save | DB + auto-geocode if address changed |
| Delete property | `DELETE /api/properties/[propertyId]` | User (name-typing confirmation) | DB cascade + Channex deleteChannel/deleteRatePlan/deleteProperty |
| Import from URL | `POST /api/properties/import-from-url` | User onboarding | Channex create property |
| Import from Channex | `POST /api/channex/import` | User onboarding | Channex read |
| Geocode all (admin) | `POST /api/properties/geocode-all` | Internal | Nominatim |

### 1f. Other action categories

| Category | Routes | Notable |
|---|---|---|
| Reviews | `/api/reviews/generate`, `/respond`, `/approve`, `/submit-guest-review`, `/[reviewId]/guest-name`, `/sync`, `/rules`, `/generate-guest-review` | LLM calls inline; review state machine has 6 states (pending/draft_generated/approved/scheduled/published/bad_review_held); `submit-guest-review` writes to Channex's two-sided review API |
| Cleaners + Turnover | `/api/cleaners`, `/api/turnover/assign`, `/auto-create`, `/notify`, `/update` | `/turnover/notify` sends Twilio SMS to a cleaner |
| Webhooks (incoming) | `POST /api/webhooks/channex` | Channex → Koast event ingest; deduped via `channex_webhook_log.revision_id` |
| Settings | `/api/settings/preferences` (POST), `/api/settings/delete-account` (POST) | Account-level |
| Onboarding | `/api/onboarding/setup-templates` | Templates seed |
| Photos | `/api/photos/backfill` | Bulk image source fix |
| Internal | `/api/internal/booking-created` | Internal RPC |
| Frontdesk waitlist | `/api/frontdesk/waitlist` | Placeholder |
| Cleaner token landing | `/api/clean/[taskId]/[token]/update` | Public token-based — **the only public action** outside revenue-check |

**Total write routes**: 72 + ~10 worker write paths. **Trigger pattern is overwhelmingly user-initiated** — the host clicks a button, the route runs, the action executes. The autonomous workers (booking_sync, messaging_executor) run on systemd timers and DO write to the platform but only in narrowly-defined ways (block dates from iCal, draft messages with pending-approval status).

---

## 2. Stakes profiles + existing confirmation gates

### 2a. Stakes profile per category

Rough heuristic (Reversible? Visible to guests? Touches money? Hard-to-undo platform state? Multi-property?):

| Category | Reversibility | Guest-visible | Money | Platform state | Multi-property |
|---|---|---|---|---|---|
| Edit pricing rules | reversible (DB only) | not directly | indirect (future bookings) | no | no |
| Per-date rate apply (BDC) | partially (push new rate, but BDC is sticky) | yes — affects published rates | indirect | yes — Channex restrictions | no |
| Bulk multi-date rate apply | partially | yes | indirect | yes | no |
| Send message to guest | irreversible | YES — guest reads it | no (but content can offer money) | yes — OTA-inscribed | no |
| Cancel booking | partially (re-book possible) | YES — guest sees | YES — typically refund triggers on platform | yes | no |
| Create booking (manual) | reversible (cancel) | yes | yes — locks dates | yes | no |
| Block dates / calendar hold | reversible | yes (via OTA) | indirect | yes | no |
| Connect channel | reversible (disconnect) | no | no | yes | no |
| Activate BDC channel | reversible (deactivate) | YES — listing goes live | yes | yes — pushes availability | no |
| Add property | reversible (delete) | yes | no | yes | no |
| Delete property | IRREVERSIBLE (cascade across 16 tables + Channex deletes) | yes | yes — historical bookings gone | yes | yes |
| Submit guest review | irreversible (Airbnb 14-day window finality) | YES (after host disclosure window) | no | yes | no |
| Send SMS to cleaner | irreversible | no | no | no | no |
| Update review rules | reversible | no | no | no | no |

The blast radius spans roughly: low-stakes DB-only → medium-stakes single-platform-write → high-stakes irreversible-platform-state → terminal-stakes account-or-property-delete.

### 2b. Existing confirmation gates in the code

A grep across `src/components` for `setShowConfirm`/`setShowDelete`/`window.confirm`/`setConfirmOpen` returns 5 distinct gates total:

| Gate | Where | Stakes shape |
|---|---|---|
| Property delete | `PropertyDetail.tsx:885-1232` | "Type the property name to confirm" — name-string equality before enable. Two-step (Settings → Danger zone → name-typing modal). |
| Account delete | `settings/page.tsx:643-700` | "Type DELETE to confirm" — string equality before enable. Two-step. |
| Guest review submit | `GuestReviewForm.tsx:316-355` | Modal confirmation; framing emphasizes "Airbnb confirms within 5-15 minutes" — communicates irreversibility. |
| Discard guest review draft | `GuestReviewForm.tsx:59` | Native `window.confirm("Discard this draft?...")` — only fires if `dirty=true`. |
| Bulk rate confirm | `polish/calendar/BulkRateConfirmModal.tsx` | Modal showing diffs before commit, used by the calendar Pending Changes Bar. |

**That's all.** Critical observations:
- **No confirmation on individual rate apply** (the host clicks "Apply" and the rate goes to BDC immediately, modulo the env kill switch).
- **No confirmation on send message** (host clicks Send, message goes live to OTA).
- **No confirmation on cancel booking** (despite being effectively irreversible from the guest's perspective and triggering platform refund flow).
- **No confirmation on activate channel** (despite making a listing live).
- **No confirmation on adding a property** (low stakes, fine).
- **No "this is going to N guests" modal** anywhere — there's no batch outbound messaging today, but if there were, no infrastructure exists for batch-send confirmation.

The 5 gates that exist were added on a per-component basis with bespoke patterns (`useState` + modal + name-typing or `window.confirm`). **There is no shared "ConfirmGate" primitive.** The patterns don't speak to stakes or learning — they're just "are you sure" prompts.

### 2c. Sub-conclusion §2

Confirmation today is binary, manual, and ad-hoc. The 5 gates are all on terminal-stakes irreversible actions (delete, submit-to-Airbnb), and they all use string-typing or native confirm. The medium-stakes operations (rate push, send message, cancel booking) have **no gate at all** beyond authentication — they execute immediately on user click. The gradient layer is greenfield: there's no existing primitive that classifies actions, no per-host calibration substrate, no reversibility window infrastructure. The confirmation patterns that DO exist are useful as visual references for the high-stakes-confirmation tier of the gradient, but they need to be replaced with a unified primitive.

---

## 3. Platform boundary confirmation

### 3a. OTA financial code paths — none

Comprehensive search across `src/`, `koast-workers/`, `package.json`, migrations:

```
grep "stripe\|Stripe\|payment_intent\|PaymentIntent\|charge\|refund\|payout\|connect_account"
  → src/: 0 matches in functional code
  → koast-workers/: 0 matches
  → package.json: stripe NOT in dependencies
  → migrations/: 0 matches
```

The only "refund" string in `src/` is in `ConflictResolution.tsx:298,380,400` where it's **purely informational display text** — when a host is choosing which side of a double-booking to cancel, the UI shows the projected refund amount as context: `"Refund ~${refundFor(b)} — restores availability via Channex."` Koast does not issue the refund — the cancel goes to Channex which propagates to the OTA, and the OTA refunds the guest through its own resolution-center / payout system.

The only other "Stripe" references are:
- `KOAST_METHOD.md` (the manifesto itself).
- `KOAST_POLISH_PASS_MASTER_PLAN.md`, `POLISH_PASS_HANDOFF.md`, `design/brand-final/...README.md` — design references citing Stripe Press / Stripe brand as quality benchmarks.
- `ROADMAP/FEATURE_INVENTORY.md:128` — explicit "Stripe / billing not started."
- `FEATURE_INVENTORY.md:77` — billing/plan upgrade UI noted as 🔵 (not started).
- `frontdesk/page.tsx:14` — placeholder marketing copy "Built-in booking engine with Stripe payments" — this is the **Frontdesk page, which is itself a placeholder** with no functionality wired (per CLAUDE.md "Direct booking website builder (Frontdesk): `/frontdesk` is a placeholder today").

### 3b. OTA-side write surface (Channex client)

The Channex client `src/lib/channex/client.ts` exposes these write methods:
```
createChannel, updateChannel, deleteChannel
createRatePlan, deleteRatePlan
updateAvailability, updateRestrictions
acknowledgeBookingRevision
```

Plus thread-shaped: `channexSendMessage` for outbound messages.

**None of these touch money, payment terms, refund flows, or payout configuration.** They cover: rate (price-per-night), availability (1=open / 0=closed), restrictions (min-stay, stop-sell, closed-to-arrival/departure), channel activation, room-type metadata, and message content.

### 3c. Bank account / payout

Zero hits anywhere. No code references host bank accounts, Stripe Connect accounts, payout schedules, transfer destinations, or any financial routing primitive.

### 3d. Sub-conclusion §3

The platform-boundary discipline Belief 4 prescribes is **already correctly drawn in the codebase, by absence rather than by design**. There is no Koast code attempting OTA-side refunds, financial term modifications, or bank-account / payout operations — and there is no Stripe integration at all (so the "Koast applies the host's policy on direct bookings" branch of Belief 4 doesn't have any code today either).

This is a clean starting point: when the gradient layer ships, it never has to decide whether a refund is high-stakes-but-allowed, because Koast doesn't have refund execution authority. The dichotomy is: OTA financial flows happen on the OTA (resolution centers); direct-booking financial flows don't exist yet (Frontdesk is a placeholder). When Stripe lands, the gradient will need policy-application logic — but it lands on a clean field.

---

## 4. Stripe / direct booking action paths

### 4a. Stripe integration today

**There is no Stripe integration today.** No SDK, no webhook handler, no env vars, no schema columns for charges/intents/refunds, no ChargeIntent state machine, no payment audit table.

### 4b. Frontdesk placeholder

`/frontdesk` is `src/app/(dashboard)/frontdesk/page.tsx` — a static marketing placeholder. The card text mentions "Built-in booking engine with Stripe payments" as a future feature; no underlying functionality is wired. Per CLAUDE.md "UPCOMING FEATURES (Designed, Not Built)": "Direct booking website builder (Frontdesk): `/frontdesk` is a placeholder today."

`POST /api/frontdesk/waitlist` exists but per the route source it captures lead emails into a waitlist — not a booking action.

### 4c. Direct booking refund/cancellation rules

Not configured anywhere. The schema has no `direct_booking_rules` table, no `cancellation_policy_id`, no `refund_policy_id`. Per CLAUDE.md "Known Gaps — Direct Booking Flag": "No canonical flag for 'direct booking enabled.' `propertyCards[].connectedPlatforms` (Dashboard) should include `'direct'` when a property accepts direct bookings, but the schema has no `direct_booking_enabled` column on `properties` (nor a counterpart on `property_channels`)." Today the only way a property is tagged "direct" is via an obscure Channex mapping path.

### 4d. Sub-conclusion §4

The "Koast applies the host's configured refund and booking rules for direct bookings" branch of Belief 4 has no code today — Stripe, direct-booking routing, refund-policy schema, charge/refund execution paths, and payout configuration are all greenfield. When that work lands, it lands clean: nothing existing has to be retrofitted because nothing exists. The greenfield surface needs to include a stakes-aware policy-applier (the host writes the policy; the agent applies it; the gradient enforces "high-stakes by default unless the host has approved this exact policy outcome before"), but the underlying execution layer is fresh.

---

## 5. Worker action patterns

10 Python workers under `~/koast-workers/`. systemd timers in `~/koast-workers/systemd/`. Schedule + autonomy summary:

### 5a. Worker schedule and writes

| Worker | Cadence | Reads | Writes | Platform writes | Kill-switch / dry-run |
|---|---|---|---|---|---|
| `booking_sync.py` | every 15 min | iCal feeds | `bookings` insert/update/cancel; `ical_feeds.last_synced` | **Yes — pushes `availability=0` to Channex for newly-imported iCal bookings** | none observed |
| `pricing_validator.py` | daily 10:00 UTC | calendar_rates + Channex live rate | `pricing_recommendations` upsert; `calendar_rates.suggested_rate + factors` (via internal API call) | **NO — purposely read-only**: per its file header *"The validator purposely does NOT push rates to any channel — it's a read-only observability feedback loop."* | n/a |
| `pricing_worker.py` | every 6 h | market data, properties | market_snapshots, market_comps, calendar_rates suggestions | none | none |
| `pricing_performance_reconciler.py` | daily 02:30 UTC | bookings webhook misses | pricing_performance backfill | none | **YES — `--dry-run` argparse flag**, only worker that has it |
| `market_sync.py` | nightly | AirROI API | market_comps, market_snapshots | none | none |
| `messages_sync.py` | every 60 min | Channex /messages, /message_threads | message_threads, messages, message_threads aggregates | none | none |
| `messaging_executor.py` | hourly | message_templates × bookings | messages with `draft_status='draft_pending_approval'`; `message_automation_firings` idempotency | **NO — never sends, only drafts**. Drafts await host approval. | none observed (per file header: "NOT systemd-enabled in this commit. Manual run + log inspection is the supervised first-run gate") |
| `reviews_sync.py` | every 20 min | Channex /reviews | guest_reviews insert/update | none | none |
| `ical_parser.py` | (called by booking_sync) | iCal feeds | none directly (parsing helper) | none | n/a |
| `db.py` | (helper) | n/a | n/a | n/a | n/a |

### 5b. Autonomous platform-write surface

**The only worker that writes to Channex (and through Channex, to the OTA) autonomously is `booking_sync.py`.** Specifically: when an iCal feed reveals a new booking that Channex doesn't know about (e.g., direct booking imported via iCal, or a booking that landed on a feed we sync), the worker pushes `availability=0` to Channex for those dates so the cross-channel block stays consistent.

This is narrow and well-defined: it's enforcing availability invariants based on already-confirmed bookings. It's not making decisions; it's translating a fact (this date is taken) into the platform side.

`messaging_executor.py` writes to the DB (drafts) but never to the OTA. The host approves before anything goes out.

`pricing_validator.py` does not push — it explicitly states this in its file header.

### 5c. Kill-switches and gates

- **`KOAST_ALLOW_BDC_CALENDAR_PUSH`** env gate (Vercel-side) — guards every `/api/pricing/apply`, `/api/pricing/commit-bdc-push`, and `/api/channels/connect-booking-com/activate` route. Default off. Routes return HTTP 503 with the documented message until flipped. This is the BDC clobber-incident response and is documented in `INCIDENT_POSTMORTEM_BDC_CLOBBER.md`.
- **`buildSafeBdcRestrictions`** helper — pre-fetches current BDC state and only emits writes that are safe (BDC-closed dates preserved in full; rate deltas >10% skipped; min-stay weakening refused). Wraps every BDC-targeting write path. This is a soft kill-switch — bad write attempts are dropped silently.
- **`concurrency_locks`** advisory locks (60s TTL) — prevent concurrent retries of the same idempotent operation (BDC connect, pricing apply).
- **`enforce_property_quota`** DB trigger — hard-reject INSERTs that exceed the user's plan tier.
- **`pricing_performance_reconciler.py --dry-run`** — explicit dry-run flag.
- **Per-channel status guard**: `property_channels.status='active'` is checked before pushes.

These are good safety primitives but are **per-action and per-codepath**, not a unified "gradient layer" — there's no abstraction that would let a future agent layer say "this action is high-stakes; require host confirmation regardless of who's calling."

### 5d. Worker logging surfaces

- `pricing_validator.py` writes to `/var/log/koast/pricing-validator.log` + stdout.
- `messaging_executor.py` writes to `/var/log/koast/messaging-executor.log` + stdout.
- Per-worker log files; no centralized log aggregation.
- DB-side logging: `channex_outbound_log` (102 rows) captures every non-GET Channex call from the Next.js side; **workers do NOT write to this table** — they call Channex directly via httpx, bypassing the logged client.
- `channex_webhook_log` (102 rows) captures inbound. `notifications` (0 rows) captures outbound user notifications. `sms_log` (1 row) captures Twilio.

### 5e. Sub-conclusion §5

The autonomous-action surface today is small, narrow, and mostly safe by design: 1 worker writes to the OTA (only translating already-confirmed bookings into platform-side availability), 1 worker writes drafts that require host approval, the rest are read-side ingest. The kill-switch infrastructure is real but per-codepath. The biggest visibility gap is that **workers don't write through `channex_outbound_log`** — when the gradient layer later asks "what autonomous platform writes happened in the last 24h?", today's answer is split between the Next.js outbound log (which captures user-triggered writes) and the worker logs on the VPS filesystem (which capture autonomous writes). Unifying the audit substrate is part of the gradient work.

---

## 6. Existing audit / visibility infrastructure

### 6a. Surfaces showing "what Koast did recently"

**Just one**: `/channels/sync-log` (`src/app/(dashboard)/channels/sync-log/page.tsx` + `SyncLogDashboard.tsx`). Surfaces `channex_webhook_log` events to the host, paginated, scoped to the user's property channex_property_ids. Shows: event_type, booking_id, dates, action_taken, ack status. **Inbound only — Channex → Koast events.**

That's the entire host-facing "what happened" surface today.

### 6b. Audit/log tables surfaced vs hidden

| Table | Rows | UI surface | Notes |
|---|---:|---|---|
| `channex_webhook_log` | 102 | `/channels/sync-log` | The only log surfaced to hosts |
| `channex_outbound_log` | 17 | **NOT surfaced** | Outbound Channex API call log; only DB-introspectable |
| `notifications` | 0 | **NOT surfaced** | Notification audit log (SMS/email/push); schema declared but unused |
| `sms_log` | 1 | **NOT surfaced** | Twilio SMS log |
| `pricing_recommendations` | 209 | yes — listed in PricingTab | pending+applied recs; status enum is the visible lifecycle |
| `pricing_performance` | (modest) | partially — feeds the scorecard | Aggregate metrics, not a feed |
| `pricing_outcomes` | 44 | NOT surfaced as feed | Used by engine; not "what Koast did" |
| `messages.draft_status` | 90 (all 'none' today) | yes — PendingDraftBubble inline | Draft lifecycle visible inline |

### 6c. "What autonomous decisions has Koast made for me this week?"

There is **no UI that answers this question.** The existing surfaces are per-domain and per-entity:
- A host can see pending pricing recommendations on the Pricing tab — but that's a queue of *what the engine wants to do*, not a log of what Koast did.
- A host can see the Channex webhook log on `/channels/sync-log` — but that's *Channex's events*, not Koast's actions.
- A host can see their messages in the inbox — but that's a chat history, not a "Koast handled this for you" feed.
- The pricing audit endpoint `/api/pricing/audit/[propertyId]?date=` returns the engine's reasoning for one date — closest to a "why" inspector but extremely narrow scope.
- `pricing_performance` with `applied_at` lets a host theoretically see "Koast applied N rate changes last week" — but no UI surfaces it as such.

### 6d. The pricing audit endpoint

`GET /api/pricing/audit/[propertyId]?date=YYYY-MM-DD` returns:
- The recommendation row (if any) for that date.
- Per-signal breakdown (which signals fired, with what scores/weights/reasons).
- The rules snapshot used (base/min/max, comp_floor, etc.).
- `comp_set_quality` confidence flag.
- An `auto_apply_blockers` array enumerating why auto-apply wouldn't fire (auto_apply disabled, insufficient days of validation data, comp set quality issues, etc.).

This is the **most "gradient-shaped"** existing endpoint — it's a per-action explainer. But it's pricing-only and per-date, and the comment in the source notes *"auto_apply itself isn't wired; the UI uses it to show 'Koast can't apply this autonomously yet because…'"* In other words, the auto-apply logic is plumbed-but-not-armed.

### 6e. Sub-conclusion §6

The audit surface is **decent for write-side reconstruction** (every Channex outbound call has a payload+response row in `channex_outbound_log`, every inbound webhook has a row in `channex_webhook_log`) but **thin-to-absent for host-facing visibility**. One UI page (sync-log) shows one log table. The `/api/pricing/audit` endpoint is the closest existing model for "explain what Koast would do / did" but it's pricing-only and per-date. A "what Koast did this week" feed is greenfield.

---

## 7. Pattern precedents — the two existing approval lifecycles

### 7a. `pricing_recommendations.status` lifecycle

**State machine**: `pending → applied | dismissed`. Created by `pricing_validator.py` daily.

| State | Created by | Transition out |
|---|---|---|
| `pending` | `pricing_validator.py` writes new rows daily; status defaults to `pending` | Apply button → `applied` (+ `applied_at`); Dismiss button → `dismissed` (+ `dismissed_at`) |
| `applied` | `POST /api/pricing/apply` after successful Channex push | Terminal |
| `dismissed` | `POST /api/pricing/dismiss` | Terminal |

**Live counts**: 208 pending, 1 applied, 0 dismissed (the env gate is off, so the host hasn't been able to apply more than the one that slipped through).

**UI**: `PricingTab` lists pending recs with Apply + Dismiss buttons. Applied recs are shown separately as a recent-activity strip. The `usePricingTab` hook composes pending + applied + performance into one read.

**Auditability**: every status flip records its timestamp (`applied_at`, `dismissed_at`). The `reason_signals` JSONB on each rec captures why the engine recommended it. The `pricing_performance` row created on apply captures the outcome.

**Strengths**: clean state machine, two-sided (apply + dismiss), idempotent via `concurrency_locks`, env-gated, audit-trail intact.

**Limitations as a gradient precedent**:
- Binary host action (apply / dismiss) — no calibration; the host's pattern of approval doesn't feed back into anything autonomous.
- `pricing_rules.auto_apply` is the only learned-trust signal, and even it isn't wired (the route doesn't read it; the audit endpoint enumerates why it can't fire).
- No "act now" reversibility window — once applied, the only recourse is to push a new rate.
- Stakes are uniform: every recommendation is treated identically regardless of `delta_pct`, weekend vs weekday, etc.

### 7b. `messages.draft_status` lifecycle

**State machine**: `none → generated | draft_pending_approval → sent | discarded`.

| State | Created by | Transition out |
|---|---|---|
| `none` | Default for inbound + system messages | LLM draft → `generated`; template fire → `draft_pending_approval` |
| `generated` | `POST /api/messages/draft` (host clicks "Draft" on an inbound) | Send → `sent`; Discard → `discarded` |
| `draft_pending_approval` | `messaging_executor.py` (hourly worker firing on time-anchored templates) | Approve → `sent` + Channex outbound; Discard → `discarded` |
| `sent` | After successful Channex outbound | Terminal |
| `discarded` | Discard button | Terminal |

**Idempotency**: `message_automation_firings (template_id, booking_id) UNIQUE` prevents the executor from firing the same template+booking twice, even after the draft is discarded.

**Live counts**: all 90 `messages` rows have `draft_status='none'` today — neither the LLM draft path nor the executor has produced any drafts in production yet.

**UI**: `PendingDraftBubble.tsx` renders a `draft_pending_approval` message inline in the conversation as a chat bubble visually distinct from sent messages — 92% opacity, "SUGGESTED · PENDING APPROVAL" tag, inline Approve & Send + Discard buttons. This is the **best existing visual reference for "the agent proposed an action, here's what it would do, you choose"** in the codebase.

**Strengths**: state machine with both LLM-draft and template-draft flows; inline UI that doesn't break the conversation context; idempotency table that survives discard (re-fire is prevented even after hard delete); three-stage sent-tracking (`host_send_submitted_at`, `host_send_channex_acked_at`, `host_send_ota_confirmed_at`).

**Limitations as a gradient precedent**:
- Binary again (approve / discard) — no calibration.
- No reversibility — once sent, message is at the OTA.
- Stakes are uniform — a template "checkout reminder" gets the same approval flow as a hypothetical auto-drafted refund offer.

### 7c. Bonus: `guest_reviews.status` lifecycle (the deepest state machine)

**State machine**: `pending → draft_generated → approved → scheduled → published`, plus `bad_review_held` as a parallel state.

This is the **most complex** approval lifecycle in the codebase. Adds a *scheduled* state — the rule is "auto-publish 3 days after checkout, but bad reviews wait until the last 2 hours of the 14-day window." Wired in `src/lib/reviews/generator.ts:calculatePublishTime()`.

**However**: per CLAUDE.md and `ReviewsSettingsModal.tsx:104-106`, **auto-publish is dimmed "Coming soon — requires a scheduler worker."** The state machine exists; the scheduler that would honor the `scheduled_publish_at` timestamp doesn't run yet. Today the host approves manually and the `published_at` is set on approval.

**Strengths as gradient precedent**: explicitly differentiates stakes (`bad_review_delay` flag holds negative reviews longer — this is the *only* place in the codebase where a value-of-the-content choice changes the timing of the action). Closest thing to "content-aware stakes" that exists today.

**Limitations**: the differentiation is hard-coded ("if bad, delay") rather than learned. No host-specific calibration.

### 7d. Sub-conclusion §7

The codebase has **three approval lifecycles** today: pricing, messaging, reviews. All three follow "host clicks Approve, action commits" — none of them learn from the host's pattern, none of them reduce friction over time. They're good ergonomic precedents (the inline `PendingDraftBubble` UI is the strongest visual model) and good state-machine precedents (the review state machine handles content-aware delay), but they're each binary and uniform-stakes within their domain. The gradient layer must generalize across domains and add the calibration loop.

---

## 8. Where the gradient layer naturally inserts

### 8a. Choke points where actions converge

| Choke point | Coverage | Fit for gradient hook |
|---|---|---|
| `src/lib/channex/client.ts` `request()` method | Every non-GET Channex call from Next.js | **Excellent.** Already inserts `channex_outbound_log` rows. Wrap with stakes classification + gradient check. |
| `src/lib/notifications/index.ts` `notify*()` helpers | Every SMS/notification | **Good.** Single place to gate outbound notifications. |
| Anthropic SDK call sites | 4 routes (1 messaging, 3 reviews) | **Manual** — only 4 sites; per-call wrapping is feasible. |
| Per-route handler functions | 72 routes | **Scattered.** No single middleware boundary. Each route currently does `getAuthenticatedUser → verifyOwnership → execute`. The "execute" step is where gradient checks would slot. |
| Direct `supabase.from(...)` writes from API routes | 50 routes | **Bypasses** the Channex client — most are DB-only. Lower stakes but still need classification (e.g., changing `pricing_rules` is reversible but affects autonomous decisions). |
| Direct `supabase.from(...)` writes from client components | 7 sites (settings, properties/new, onboarding, TemplateManager, CalendarGrid, login, signup) | **Bypasses** the API layer entirely. Hard to gate without rerouting through API. |
| Worker `db.py` DB writes | 10 workers | **Off-process.** systemd-scheduled. Gradient checks would have to be *in-process* in each worker (Python-side). |
| Worker httpx Channex calls | `booking_sync.py` (the one autonomous Channex writer) | **Off-process.** Doesn't go through `client.request()`, so won't get audit-logged or gradient-gated unless the worker is rewritten or the gating is duplicated. |

### 8b. Action surface scattered or centralized?

**Scattered, but with two strong centralization candidates**:

1. **`channex/client.request()`** — the natural choke for OTA-side platform writes. ~95% of Next.js platform writes already go through it (the `/api/channels/rates` POST and the `/api/pricing/apply` route both call into channex methods which all funnel through `request()`). Gradient hook here covers most platform-stakes writes from the Next.js layer.

2. **The agent loop boundary** (per Belief 2 — currently greenfield) — when the future agent dispatches a tool, that's the natural insertion point for the gradient. The agent's tool registry can carry stakes metadata per tool ("`apply_rate_to_bdc` is high-stakes; `dismiss_recommendation` is low-stakes"); the gradient consults learned host calibration; the chat surface either commits, surfaces a confirmation block, or skips based on the result.

The inelegant truth: **today's action surface predates the gradient as a concept.** Each route was built to do its own thing, and the choke points exist only because of unrelated concerns (`channex_outbound_log` was built for incident reconstruction, `concurrency_locks` for idempotency, `enforce_property_quota` for plan tiers). Retrofitting a unified gradient layer without rebuilding the action layer would require:
- A "stakes registry" that maps each route + tool to a stakes profile (greenfield).
- A "calibration store" that records host approval patterns per (host_id, action_type) (greenfield).
- A "gradient resolver" that takes (action_type, host_id, content) and returns "auto-execute" / "confirm with summary" / "ask first" / "refuse without explicit override" (greenfield).
- Hooks at the choke points: `channex/client.request()` for OTA writes, `notifications/index.ts` for outbound notifications, agent tool dispatcher for chat-initiated actions.

### 8c. Sub-conclusion §8

Choke points exist for OTA writes (Channex client) and notifications (notify helpers). The agent tool dispatcher (when built per Belief 2) is the cleanest insertion point for chat-initiated actions because it's greenfield — no retrofit. The 72 API routes are scattered and would each need either a per-route gradient hook (intrusive) or a shared `executeAction(type, payload)` wrapper (would require rewriting routes through it). The 7 client-side direct-Supabase writes are the worst — they bypass the API layer entirely and would need to either be rerouted through API or the gradient would need to live in browser code (infeasible for trust-sensitive checks). The 10 workers are off-process; gating them requires duplicating the gradient logic in Python or rewiring them to call API routes (which would slow them down significantly).

The pragmatic insertion plan: **gate at three choke points (Channex client, notify helpers, agent tools), accept that direct DB writes are low-stakes-by-construction (no platform side effects), and treat workers as a separate audited surface with their own narrowly-scoped autonomous-action mandates.**

---

## 9. Keep / rebuild / greenfield

### Keep — strong precedents the gradient can build on

1. **`pricing_recommendations.status` state machine** + `applied_at` / `dismissed_at` audit columns. Cleanest existing approve/dismiss lifecycle. Pattern reusable for any "agent proposes an action, host confirms" tool. Confidence: high.
2. **`messages.draft_status` state machine** + `PendingDraftBubble` inline rendering. Best existing UI precedent for "the agent's proposal is the artifact you act on." When the chat-as-spine surface ships, this rendering style generalizes. Confidence: high.
3. **`message_automation_firings (template_id, booking_id) UNIQUE`** idempotency table pattern. The shape — INSERT ON CONFLICT DO NOTHING RETURNING id, then write the dependent draft only if the insert succeeded — is a clean primitive for "fire this autonomous action exactly once." Reusable. Confidence: high.
4. **`channex_outbound_log`** schema + writer pattern (`src/lib/channex/client.ts:request()` writes a row per non-GET call with payload sample, response status, payload hash). Best existing audit substrate. The gradient layer's "what Koast did this week" feed reads from this (extended to cover worker writes). Confidence: high.
5. **`KOAST_ALLOW_BDC_CALENDAR_PUSH` env gate pattern**. Default-off, single env flip to enable, every call returns 503 until armed. Good model for high-stakes actions that the gradient is not yet calibrated to handle — "ship the capability behind a flag, leave the flag off until trust is calibrated." Confidence: high.
6. **`buildSafeBdcRestrictions`** pre-check pattern. Pre-fetch the platform's current state, only emit writes that are safe, drop bad attempts silently. Good model for "before I commit this action, check the world state and refuse if dangerous." Generalizable to non-BDC contexts. Confidence: high.
7. **`concurrency_locks`** with 60s TTL on `(scope, key)`. Idempotency primitive for any action that should not double-fire. Confidence: high.
8. **The `/api/pricing/audit/[propertyId]?date=` endpoint shape** — per-action explainer with per-signal breakdown, rules snapshot, and blocker enumeration. Generalizes to "explain what Koast would/did do for action X." Confidence: medium-high.
9. **The platform-boundary discipline** (no Stripe, no OTA refunds, no bank-account access in src). Belief 4's clean platform-boundary claim is already true by absence — keep it true. Confidence: high.
10. **The 5 existing confirmation gates** as visual references for the high-stakes-confirmation tier (property delete, account delete, guest review submit, discard draft, bulk rate confirm). The patterns (name-typing, modal with diff preview, native confirm) are useful starting points for the "always ask" tier of the gradient. Confidence: medium — the patterns are bespoke; the unified primitive is greenfield.

### Rebuild — built for a different model; deprecate cleanly

1. **`pricing_rules.auto_apply` boolean.** Too coarse for the gradient. A single boolean per property doesn't express "trust me to apply small midweek changes; ask me on weekends; never auto-apply during peak." Replace with calibrated, per-action-type, per-condition trust signals. Confidence: high.
2. **The 5 bespoke confirmation patterns.** Each was built for one component. The gradient layer needs a unified `<ConfirmGate stakes={...} action={...} />` primitive. Keep the visual cues (name-typing for terminal stakes, modal with diff for medium stakes), drop the per-component reinvention. Confidence: high.
3. **`/channels/sync-log` page.** Useful for one debugging task (Channex inbound events) but not the right shape for "what autonomous decisions did Koast make this week" — it's per-event, scoped to one log table, hidden three nav levels deep. The gradient's audit feed should be cross-domain and surfaced prominently. Confidence: medium-high.
4. **Worker httpx Channex writes that bypass `channex_outbound_log`.** `booking_sync.py` calls Channex availability APIs directly without writing to the outbound log. When the gradient needs a unified audit feed, this gap matters. Either route worker Channex calls through a logged client, or duplicate the logging in the worker. Either way, today's bypass is wrong for the gradient. Confidence: medium-high.

### Greenfield — nothing close exists

1. **Per-host action calibration substrate.** A table tracking host approval/dismissal/override patterns per action_type (and per condition, e.g., delta_pct bucket, day-of-week, time-of-day, content category). Today only `pricing_recommendations` records the binary outcome; no per-host distillation. Confidence: high.
2. **The gradient resolver itself.** Function: `(action_type, host_id, content_payload, world_state) → { mode: 'auto'|'confirm'|'ask'|'refuse', confidence, reason, eta_to_autonomy }`. Today the resolver is hardcoded ("env gate off → refuse" / "env gate on → auto"). The learned, per-host gradient is fully greenfield. Confidence: high.
3. **Stakes registry per action_type.** A typed registry mapping each action ("apply_rate_to_bdc", "send_message", "cancel_booking", …) to a stakes profile (reversibility, guest-visibility, money-touch, platform-state, blast-radius, content-sensitivity). Today every route handler is its own implicit stakes profile. Confidence: high.
4. **Reversibility window infrastructure.** "I just did X autonomously; you have N minutes to undo before it's final." No precedent today. Requires: (a) per-action reversibility deadline + reversal logic, (b) UI to surface "this just happened" notifications, (c) one-tap undo flow. Confidence: high.
5. **Content-aware stakes.** "Send a message to all checking-out guests tomorrow" vs "Send 'we're closing for renovation, your booking is cancelled' to all guests" — the first is medium-stakes, the second is high-stakes regardless of category. The gradient must reason about content. Today no code reasons about content of an outbound message. Confidence: high (greenfield); requires LLM cooperation from the agent layer.
6. **"What did you do silently?" host introspection UI.** "Show me every autonomous decision Koast made for me this week, with the reasoning, with one-tap undo where applicable." No surface today. Confidence: high.
7. **Calibration overrides.** "Stop doing X autonomously" / "I trust you on Y from now on." Settings UI that surfaces the gradient's current calibration and lets the host prune/reinforce. No precedent. Confidence: high.
8. **Cold-start handling.** New host with no calibration data — gradient defaults must be conservative-but-not-useless. No infrastructure today; not even a "trust level" concept. Confidence: high.
9. **Notification thresholds for autonomous actions.** "Even if this action is autonomous, notify the host if it exceeds X." Infrastructure for "this just happened" pings doesn't exist. Confidence: high.
10. **Cross-worker action audit.** A unified "actions Koast took on your behalf" feed that includes: Next.js route writes (already in `channex_outbound_log`), worker Channex writes (currently bypassed), worker SMS sends (in `sms_log` but not surfaced), worker draft creation (in `messages` table but not as a feed). Greenfield. Confidence: high.

### Headline

The action layer today is **scattered, manual, mostly-low-stakes-by-construction, and ergonomically thin on confirmation**. The platform-boundary discipline Belief 4 prescribes (no OTA refund / financial / payout code) is already correctly drawn — by absence rather than design, but correctly nonetheless. The two existing approval lifecycles (pricing apply/dismiss, messaging draft approve/discard) are decent ergonomic precedents but binary and uniform within their domains. The gradient itself — per-host calibration, content-aware stakes, reversibility windows, autonomous-action audit feed, cold-start handling, learned trust over time — is fully greenfield. The pragmatic insertion strategy is: **gate the three natural choke points (Channex client, notify helpers, future agent tool dispatcher), keep the existing approval state machines as the per-domain UI patterns, and build the gradient resolver + calibration substrate as a fresh layer that reads from a unified audit feed.**
