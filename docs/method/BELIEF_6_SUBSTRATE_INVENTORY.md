# Belief 6 — Full Digital Substrate Inventory

*Belief: "The full digital substrate." — Koast operates across the entire digital surface of the host's hosting business, in one relationship, with one accumulated memory, through one conversational interface. Where work crosses into the physical or fully-human, Koast supports but doesn't operate.*

This is a substrate coverage map of `~/koast`. For each of the ten Method-named categories: classification + reasoning. Investigation only. No code changes.

Verified against the live Supabase DB on 2026-05-01 (row counts inline).

Cross-references: Beliefs 1-5 inventories.

---

## 1. Substrate coverage grading

| Category | Classification |
|---|---|
| 1. Guest operations | **PARTIALLY READY** |
| 2. Property operations | **PARTIALLY READY** (with physical-world tail OUT OF SCOPE) |
| 3. Pricing and revenue | **INFRASTRUCTURE-READY** |
| 4. Calendar and inventory | **INFRASTRUCTURE-READY** |
| 5. Channel management | **INFRASTRUCTURE-READY** |
| 6. Direct booking | **INFRASTRUCTURE-GREENFIELD** |
| 7. Marketing and acquisition | **INFRASTRUCTURE-GREENFIELD** |
| 8. Reviews and reputation | **INFRASTRUCTURE-READY** |
| 9. Staff and team | **PARTIALLY READY** for cleaners only; **GREENFIELD** for everything else |
| 10. Strategy and growth | **PARTIALLY READY** for read-side observability; **GREENFIELD** for acquisition / market-entry / exit decisions |

### 1.1 Guest operations — PARTIALLY READY

**Today**: full guest-messaging substrate exists. `message_threads` (16 rows) + `messages` (90 rows) sourced from Channex. Three-pane `UnifiedInbox.tsx` (1,129 lines) with optimistic send, mark-read, content-filter warning. `generateDraft()` LLM call site for AI drafts. `messaging_executor.py` worker fires time-anchored template drafts (idempotent via `message_automation_firings`). `PendingDraftBubble` inline approval UI. `ConflictResolution` for double-booking remediation. Channex two-sided review submission flow.

**What's missing**: no refund/credit policy engine (today the only "refund" appearance in src is informational display in `ConflictResolution.tsx` showing the projected OTA refund — Koast doesn't issue it). No late-checkout availability checker that scans the next-day booking + decides if the request fits. No mid-stay intervention flow ("guest reports a problem → triage → cleaner dispatch + guest update"). No repeat-guest tracking (guests are columns on bookings, not entities — see Belief 3 §2). No batch outbound messaging ("send check-in details to all checking-in guests tomorrow"). No automated handling of inquiry threads pre-booking (`thread_kind='inquiry'` exists in schema but no specialized flow).

**Reasoning**: messaging is the second-strongest single subsystem in the codebase (after pricing). The substrate for "agent reads inbound, drafts response, host approves" is ~80% there; what's missing is the operational policies (refund rules, late-checkout rules, complaint triage) and the cross-entity reasoning (this guest stayed before, this complaint pattern repeats). The agent layer extends what's already shaped well; the policies and cross-entity reasoning are real product work.

### 1.2 Property operations — PARTIALLY READY (physical tail OUT OF SCOPE)

**Today**: `cleaning_tasks` table (58 rows in production — meaningful workflow), `cleaners` table (2 rows), `default_cleaner_id` on properties, `/api/turnover/*` routes (assign, auto-create, notify, update), Twilio SMS via `notify*()` helpers, `sms_log` (1 row), `cleaner_token` for public landing page (`/clean/[taskId]/[token]`), TurnoverBoard UI with status pills, auto-create-from-bookings logic in `src/lib/turnover/auto-create.ts`. Cleaning checklist JSONB on tasks (5-item default seed).

**What's missing**: no maintenance triage system (no `maintenance_tickets` table, no vendor types beyond cleaner, no triage state machine). No supply tracking (linens, toiletries, restock alerts — none modeled). No inspection scheduling beyond turnovers. No vendor relationships beyond `cleaners` (no handyman, no pool service, no landscaper). No "between-guest preparations" beyond the standard cleaning task.

**Out-of-scope by Method's scoping line**: in-person property visits, on-site emergency response, physical inspections.

**Reasoning**: cleaning/turnover is the only property-operations subsystem with mature substrate. Maintenance/supply/inspection are completely greenfield — no schema, no UI, no worker. The agent's near-term capabilities here are limited to cleaner coordination (which works well today). Bringing maintenance and supply into scope means building the operational layer first, then the agent. The physical-execution tail is correctly out of scope per the Method.

### 1.3 Pricing and revenue — INFRASTRUCTURE-READY

**Today**: the deepest subsystem in the codebase. 9-signal pricing engine (`src/lib/pricing/engine.ts` + `signals/`). `pricing_validator.py` daily worker (10:00 UTC). `pricing_recommendations` (209 rows: 208 pending, 1 applied), `pricing_outcomes` (44 rows), `pricing_performance`, `pricing_rules` (2 rows, both `source='inferred'`, both `auto_apply=false`). `calendar_rates` two-tier model (base + per-channel overrides; 667 rows in production). Per-signal confidence scaffold + confidence-weighted aggregation with dropped-weight redistribution (Belief 5 §2). Market data pipeline: AirROI for comps + market snapshots + supply (`market_comps` 20 rows, `market_snapshots` 26 rows). Ticketmaster events (`local_events` 16 rows). Weather (`weather_cache` 49 rows). `learnedDow` from outcomes. Comprehensive API surface: `/api/pricing/{calculate,rules,recommendations,performance,audit,apply,push,override,dismiss,preview-bdc-push,commit-bdc-push,sync-channex}`. `usePricingTab` client hook composes 4 reads with stale-while-revalidate. `BulkRateConfirmModal` for bulk edits. `WhyThisRate` + `KoastSignalBar` per-signal explainers. `inferPricingRulesFromHistory` lazy inference. BDC-clobber-incident defensive infrastructure: `KOAST_ALLOW_BDC_CALENDAR_PUSH` env gate, `buildSafeBdcRestrictions` pre-check helper, `concurrency_locks` 60s TTL.

**What's missing for agent operation**: not infrastructure — the substrate is rich. What's needed: agent tool wrappers (`apply_recommendation`, `dismiss_recommendation`, `set_rule`, `query_signal_breakdown`, `preview_rate_change`) and the gradient layer's per-action calibration. The seasonal-repositioning and special-event-pricing capabilities exist (events table + signal); the agent just composes them.

**Reasoning**: this is the most agent-ready surface in the entire codebase. The 9-signal engine + audit endpoint + apply/dismiss state machine + safe-restrictions + outcome capture form a complete operational loop. An agent tool layer over this surface is mostly "expose existing capabilities through typed tools with stakes metadata." The only real product gap is rate-strategy memory (e.g., "this host always discounts Sundays in shoulder season") — Belief 3 territory.

### 1.4 Calendar and inventory — INFRASTRUCTURE-READY

**Today**: `bookings` table (90 rows) with cross-channel dedup via `channex_booking_id` UNIQUE. `calendar_rates` (667 rows) two-tier per-channel model. `ical_feeds` table (2 active feeds), `booking_sync.py` worker (every 15min) that pulls iCal, dedups, pushes availability=0 to Channex for newly-imported bookings. Channex webhook handler with `revision_id` dedup (`channex_webhook_log` 102 rows). Channex outbound audit log (`channex_outbound_log` 17 rows). `bookings_channex_id_full_unique` constraint. `booking_revisions` polling alongside webhooks. `concurrency_locks` for connect operations. Calendar UI: 24-month grid (`CalendarView.tsx` 1,435 lines), `MonthlyView`, `BookingBar`, `BookingSidePanel`, `PerChannelRateEditor`, `DateEditPopover`. Conflict detection (`/api/bookings/conflicts`) + `ConflictResolution.tsx` UI for double-booking remediation. Booking edit + cancel routes that propagate to Channex. iCal ghost-booking cleanup logic. Manual booking creation route.

**What's missing for agent operation**: blocked-date semantics distinct from booked dates exist via `is_available` on calendar_rates but the host-typed "block dates because I'm using the property myself" flow is not formalized as an entity (no `owner_stays` table; no maintenance windows). Reservation modifications use the edit route but no agent flow exists for "guest wants to extend by 2 nights — check availability, draft response, prepare booking edit." The conflict-resolution flow is one specific case (double-booking); no general "calendar anomaly" detector beyond it.

**Reasoning**: calendar substrate is mature and agent-readable. The booking lifecycle (sync → store → reconcile → push availability → handle revisions → handle webhook idempotency → handle disconnects) is battle-tested per CLAUDE.md ("CERTIFIED — production approved, whitelabel active"). The agent layer wraps this with tools that read calendar state and propose changes (with the gradient layer gating the writes).

### 1.5 Channel management — INFRASTRUCTURE-READY

**Today**: Channex client (`src/lib/channex/client.ts`) with `createChannel`, `updateChannel`, `deleteChannel`, `createRatePlan`, `deleteRatePlan`, `updateAvailability`, `updateRestrictions`, `getRestrictionsBucketed`, `acknowledgeBookingRevision`. `property_channels` table (3 rows, channel state). `channex_room_types` + `channex_rate_plans` cached metadata. End-to-end Booking.com self-service connect flow: `/api/channels/connect-booking-com` (+ `/test`, `/status`, `/activate`). `BookingComConnect.tsx` modal UI. `ChannelPopover.tsx` 340px hover popover with stats per channel. Compensating rollback on failed connects (atomic creation). Per-property mutex (`bdc_connect:{propertyId}` 60s lock). Strict normalized name matching. Full Channex 14-test certification suite (`/channex-certification`). Per-channel rate editor in calendar. Channex full-sync route. Channex import route. iCal as fallback channel mode.

**What's missing for agent operation**: listing-content management (titles, descriptions, photos) not surfaced — `properties.photos` JSONB exists but unused; no listing-copy editor. Channel-specific positioning (Airbnb summary vs BDC long-form description) not modeled as separate fields. OTA performance comparison surfaces partially in PricingTab/comp-sets but not as an explicit "which channel is winning for this property" view. OTA policy compliance (Airbnb Superhost requirements, BDC content quality scores) not tracked. Disconnections/reconnections are surfaced via channex_webhook_log + sync-log page but no proactive reconnect flow.

**Reasoning**: channel-management plumbing is the second-strongest after pricing. Connect/disconnect/sync/audit all work. The agent's near-term capabilities here are operational: "reconnect this channel," "push fresh availability," "push fresh rates," "compare booking volume by channel." Listing-content management is its own deeper greenfield (touching photo uploads, copy generation, OTA-specific format adapters) that probably belongs to a later phase.

### 1.6 Direct booking — INFRASTRUCTURE-GREENFIELD

**Today**: `/frontdesk` is a static placeholder. Per CLAUDE.md "UPCOMING FEATURES (Designed, Not Built)": *"Direct booking website builder (Frontdesk): `/frontdesk` is a placeholder today."* Per Belief 4 §3: zero Stripe code in the codebase. No `direct_bookings` table. No `cancellation_policy` schema. No `refund_policy` schema. No `direct_booking_enabled` column on properties (per CLAUDE.md "Known Gaps — Direct Booking Flag"). No payment intent logic. No charge/refund/dispute handling. No booking-flow UI. No checkout page. No booking confirmation emails. No customer-facing site builder. The only `direct` references in the codebase are platform-key strings in PLATFORMS config and one obscure Channex-mapping path that flags `'direct'` as a connected platform when conditions trigger.

**What's missing for agent operation**: literally everything operational. The agent can't yet "process a direct booking" / "issue a refund per policy" / "extend a stay with a Stripe charge" because none of those primitives exist.

**Reasoning**: this is the single largest greenfield surface in the substrate map. Stripe integration alone is multi-week (account model, payment intents, webhooks, dispute handling, refund flows, payout configuration, idempotency keys, webhook signature verification). On top of that: direct-booking schema (`direct_bookings`, `cancellation_policies`, `refund_policies`, `payment_attempts`), direct-booking site builder, customer-facing checkout flow, booking-confirmation email pipeline, refund-policy applicator. The Method explicitly addresses this branch: *"For direct bookings processed through Stripe, Koast applies the host's configured refund and booking rules. The host writes the policy; Koast executes it."* — which means the policy editor itself is also greenfield.

### 1.7 Marketing and acquisition — INFRASTRUCTURE-GREENFIELD

**Today**: `/revenue-check` public page exists as lead-gen. `leads` table (0 rows). `revenue_checks` table (1 row) with `result_json` JSONB. `/api/revenue-check/lead` route. That's the entire marketing infrastructure. Zero email-campaign code. Zero CRM. Zero referral tracking (no `referrals` table). Zero paid-acquisition tracking. Zero social-content infrastructure. No outbound email sender beyond Twilio SMS for cleaners. No scheduled-send infrastructure for marketing. No template system separate from `message_templates` (which is guest-comm only, 0 rows in prod). The `/frontdesk` placeholder card mentions *"Guest CRM with automated remarketing emails"* as a future feature but nothing is wired.

**What's missing for agent operation**: everything. Email-sender infrastructure (Resend / SendGrid / SES integration). Marketing-template editor. Audience segmentation. Campaign scheduler. Referral attribution. Social-publishing integrations. Voice-consistent multi-surface generation. Brand-voice enforcement across campaigns.

**Reasoning**: marketing is greenfield comparable in size to direct booking but with different shape. The infrastructure work (email sender, audience segmentation, campaign engine, social publishing) is its own subsystem. The agent's value here is composing multi-step campaigns ("write a winter promo email to past guests, A/B-test the subject, schedule for Tuesday at 9am") — but the underlying primitives don't exist. Brand voice is partially present (DESIGN_SYSTEM.md §15 + the generateGuestReviewFromIncoming prompt) but only applies to messaging/reviews; extending it consistently to marketing surfaces requires the surfaces to exist first.

### 1.8 Reviews and reputation — INFRASTRUCTURE-READY

**Today**: `guest_reviews` table (13 rows) with the deepest state machine in the codebase (6 states: `pending` / `draft_generated` / `approved` / `scheduled` / `published` / `bad_review_held`). `review_rules` per-property (0 rows in prod, schema declared) for tone + target keywords + auto-publish + bad-review-delay. `reviews_sync.py` worker every 20 minutes pulling from Channex `/reviews`. Three LLM call sites: `generateGuestReview`, `generateReviewResponse`, `generateGuestReviewFromIncoming` (the last has the strongest existing honest-confidence prompt — see Belief 5 §1d). Two-sided review submission via Channex `/booking_revisions/feed`-derived `ota_reservation_code` join. Three-stage submission tracking (`guest_review_submitted_at`, `guest_review_channex_acked_at`, `guest_review_airbnb_confirmed_at`). `is_low_rating` / `is_flagged_by_host` decomposed signals. `is_hidden` for Airbnb's 14-day mutual-disclosure window. `expired_at` for the OTA submission deadline. UI: `ReviewsList`, `ReviewListItem`, `ReviewSlideOver` (slide-over drawer with edit + submit), `ReviewsFilterBar`, `ReviewsDashboardStrip`, `GuestReviewForm` (full guest-review editor with confirmation modal). `ReviewsSettingsModal` for review_rules. `/api/reviews/{generate,respond,approve,sync,rules,submit-guest-review,generate-guest-review,respond,analytics}`. `calculatePublishTime()` honoring bad-review-delay logic.

**What's missing for agent operation**: pattern-detection across reviews ("3 of last 5 reviews mention WiFi" — currently no aggregator). Mid-stay intervention flow (no inbound trigger that wakes the agent if a guest's tone shifts negatively mid-stay). Auto-publish scheduler isn't running (the state machine has `scheduled` but no worker honors `scheduled_publish_at` — see CLAUDE.md / Belief 4 §7c). Cross-property reputation strategy (no portfolio-level review summary).

**Reasoning**: reviews is the third-strongest agent-ready surface. State machine, sync, generation, submission, and host UI are all in place. The agent's near-term capabilities here are: pattern-spotting across recent reviews, draft tuning to tone + keywords + bias rules, batch approval. Auto-publish needs a scheduler worker; pattern-detection is a read-side aggregator.

### 1.9 Staff and team — PARTIALLY READY (cleaners) / GREENFIELD (everything else)

**Today**: `cleaners` table (2 rows). `cleaning_tasks.cleaner_id` FK. `default_cleaner_id` on properties. SMS notification path via `notify*()` helpers + Twilio. `sms_log` table. `/clean/[taskId]/[token]` public landing page for cleaners (the only public action surface outside `/revenue-check`). Cleaner-confirmed status on tasks. Auto-create-from-bookings logic.

**What's missing for agent operation**: no co-host model (the `properties.user_id` is single-tenant; no `property_users` join table; no role enum). No VA delegation primitive (no notion of "VA can read messages but not approve large refunds"). No contractor model beyond cleaners (no handymen, no photographers, no landscapers). No `vendor_payments` table. No performance tracking per vendor (cleaning_tasks status exists but isn't aggregated). No hiring conversation infrastructure. Per CLAUDE.md "UPCOMING FEATURES (Designed, Not Built)": *"Owner portal / multi-user: Shared property access, role-based permissions."* Listed but not built.

**Reasoning**: cleaners are the only staff/team primitive built. The Method's "co-host coordination, VA delegation, contractor relationships, payments to vendors, performance tracking, hiring conversations" all require a multi-user/role model that doesn't exist. Building staff substrate is moderate scope (table additions + RLS work + UI for role assignment + scoped permissions) but not as large as direct booking or marketing.

### 1.10 Strategy and growth — PARTIALLY READY (read-side) / GREENFIELD (acquisition / market entry / exit)

**Today**: `/analytics` page with `AnalyticsDashboard.tsx`, `RevenueChart` (canvas-drawn). Scenarios analysis (`src/lib/pricing/scenarios.ts`) generates 5 "what-if" revenue-optimization scenarios with categorical confidence. 90-day demand forecast (`forecast.ts`). `/market-intel` page with portfolio-level market context, demand calendar, Leaflet maps. `/comp-sets` page with sortable comparative table (3,911 listings indexed per CLAUDE.md). `/nearby-listings` AirDNA-style browser. `pricing_outcomes` substrate enables actual portfolio performance review. AirROI integration for market data. `properties.comp_set_quality` signal. `revenue_checks` lead-gen (1 row).

**What's missing for agent operation**: no acquisition analysis tooling — no MLS integration, no rental-history estimator from a property URL alone (the closest is `/api/properties/import-from-url` which scaffolds based on Airbnb URL, but doesn't model "what would I pay and what would it earn"). No financial modeling beyond per-property revenue (no IRR calc, no ownership cost model). No market entry analysis (no submarket comparison engine). No expansion planning. No exit/sale modeling.

**Reasoning**: the read-side observability surface for "how is this portfolio doing" is well built. The forward-looking acquisition / market-entry / exit decisions surface is greenfield. The Method's framing — *"property acquisition analysis, market entry, portfolio performance review, financial analysis, comp set strategic adjustments, expansion planning, exit decisions"* — has the middle three (portfolio review, financial analysis, comp set) ~50% built; the bookend three (acquisition, expansion, exit) require substantial new tooling.

---

## 2. Infrastructure-ready quick wins

Specific capabilities that are most "ready to expose through the agent" with minimal underlying work. Ordered roughly by strength of fit.

### 2.1 Pricing tools (highest yield, lowest cost)

The pricing API surface is the most agent-ready in the codebase.

| Agent capability | Existing route | Underlying work |
|---|---|---|
| `query_pricing_signals(propertyId, date)` | `GET /api/pricing/audit/[propertyId]?date=` | Wire to existing endpoint; UI doesn't call it today, so the surface is plumbed-but-unused |
| `propose_rate_change(propertyId, dates, rate)` | `POST /api/pricing/preview-bdc-push/[propertyId]` | Already a dry-run endpoint; agent can invoke and surface the plan to the host |
| `apply_recommendation(recId)` | `POST /api/pricing/apply/[propertyId]` | Existing route; agent invokes after host confirmation; gated by env flag |
| `dismiss_recommendation(recId, reason)` | `POST /api/pricing/dismiss` | Trivial wrap |
| `set_rule(propertyId, fields)` | `PUT /api/pricing/rules/[propertyId]` | Trivial wrap; respects host_set source |
| `compare_rate_to_market(propertyId, date)` | derive from `/api/pricing/audit` + comp data | Composes existing reads |
| `forecast_demand(propertyId, dateRange)` | `src/lib/pricing/forecast.ts` already used by `/analytics` | Wrap as agent tool |

The agent layer over pricing is mostly "expose tools with stakes metadata + per-tool confirmation gating from the gradient layer." Belief 4 §7a documented the pricing approval state machine as the cleanest existing precedent.

### 2.2 Calendar & booking tools

| Agent capability | Existing route | Underlying work |
|---|---|---|
| `read_calendar(propertyId, dateRange)` | direct `calendar_rates` + `bookings` query | Read-only tool |
| `read_bookings(propertyId, filter)` | direct DB query or `/api/bookings/conflicts` | Read-only |
| `block_dates(propertyId, range, reason)` | path: `calendar_rates.is_available=false` upsert | Light wrap; needs an "owner_stay" reason taxonomy that doesn't exist today (currently freeform) |
| `cancel_booking(bookingId, reason)` | `POST /api/bookings/[id]/cancel` | Existing route; high-stakes — gradient gates |
| `edit_booking(bookingId, fields)` | `POST /api/bookings/[id]/edit` | Existing route; high-stakes |
| `resolve_conflict(bookingPair)` | `ConflictResolution.tsx` flow + `/api/bookings/[id]/cancel` | Compose existing UI + route logic |

### 2.3 Channel management tools

| Agent capability | Existing route | Underlying work |
|---|---|---|
| `connect_channel(propertyId, channelType, ids)` | `/api/channels/connect-booking-com` (+ test/status/activate) | Specific to BDC today; Airbnb is OAuth |
| `reconnect_channel(channelId)` | manual today; status surfaces via webhook log | Light wrap |
| `push_rates_to_channel(propertyId, channel, dates)` | `/api/channels/rates/[propertyId]` POST | Existing route; gated for BDC |
| `read_channel_status(propertyId)` | `/api/channels/[propertyId]` + `property_channels.status` | Read-only |
| `read_sync_log(propertyId)` | `channex_webhook_log` query | Read-only |

### 2.4 Messaging tools (medium fit)

| Agent capability | Existing route | Underlying work |
|---|---|---|
| `read_thread(threadId)` | `/api/messages/threads/[id]` | Read-only |
| `draft_reply(messageId)` | `POST /api/messages/draft` | Existing LLM route; streaming would be greenfield |
| `send_reply(threadId, body)` | `POST /api/messages/threads/[id]/send` | Existing route; high-stakes (irreversible to OTA) |
| `discard_draft(messageId)` | `POST /api/messages/threads/[id]/discard` | Trivial |
| `approve_executor_draft(messageId)` | exists in UI via `PendingDraftBubble` | Wrap |

The 4 LLM call sites (Belief 5 §1) are the agent's existing string-generation primitives; they need to stay in this domain or get folded into the agent's broader generation surface.

### 2.5 Reviews tools

| Agent capability | Existing route | Underlying work |
|---|---|---|
| `generate_review(bookingId)` | `POST /api/reviews/generate/[bookingId]` | LLM route; voice is decent |
| `respond_to_review(reviewId)` | `POST /api/reviews/respond/[reviewId]` | LLM route |
| `approve_review(reviewId, finalText)` | `POST /api/reviews/approve/[reviewId]` | Existing |
| `submit_guest_review(reviewId)` | `POST /api/reviews/submit-guest-review/[reviewId]` | Channex two-sided submission; high-stakes (irreversible after Airbnb 14-day window) |
| `read_review_analytics(propertyId)` | `/api/reviews/analytics/[propertyId]` | Read-only |
| `set_review_rules(propertyId, fields)` | `PUT /api/reviews/rules/[propertyId]` | Existing |

### 2.6 Turnover / cleaning tools

| Agent capability | Existing route | Underlying work |
|---|---|---|
| `assign_cleaner(taskId, cleanerId)` | `/api/turnover/assign` | Existing |
| `notify_cleaner(taskId)` | `/api/turnover/notify` | Existing; sends Twilio SMS |
| `create_turnover(bookingId)` | `/api/turnover/auto-create` | Existing (also runs auto on booking ingest) |
| `update_turnover(taskId, status)` | `/api/turnover/update` | Existing |
| `read_pending_turnovers(propertyId)` | direct `cleaning_tasks` query | Read-only |

### 2.7 Worker orchestration (most undervalued)

The 3 mature autonomous workers are *already operating without agent orchestration*. They're not tools the agent needs to invoke — they're peer subsystems whose outputs the agent reads. But the agent can:

| Agent capability | Existing worker | What the agent does |
|---|---|---|
| Trigger a fresh pricing run | `pricing_validator.py` (daily 10:00 UTC) | Call `/api/pricing/calculate/[propertyId]` on demand instead of waiting for the timer |
| Trigger an iCal sync | `booking_sync.py` (15min) | Call `/api/ical/sync/[propertyId]` on demand |
| Trigger a Channex sync | `messages_sync.py` / `reviews_sync.py` | Call respective `/sync` routes |
| Read worker outputs | All workers write to DB | Direct query; no orchestration needed |
| Read failed pushes | `channex_outbound_log.error_message`, `ical_feeds.last_error` | Direct query |
| Trigger reconciler | `pricing_performance_reconciler.py` (`--dry-run` flag) | Manual invoke |

### 2.8 Read-side observability tools

| Agent capability | Existing surface | Underlying work |
|---|---|---|
| `get_market_context(propertyId)` | `market_snapshots` + `market_comps` | Read-only |
| `get_event_calendar(propertyId, dateRange)` | `local_events` table | Read-only |
| `get_weather_forecast(propertyId, dateRange)` | `weather_cache` | Read-only |
| `get_revenue_summary(propertyId, window)` | `/api/pricing/performance/[propertyId]` + `bookings` aggregate | Read-only |
| `get_scenarios(propertyId)` | `src/lib/pricing/scenarios.ts` | Read-only; categorical confidence already there |
| `get_pulse_metrics()` | `/api/dashboard/command-center` | Read; one mocked sparkline (Belief 5 calibration debt) |
| `get_dashboard_actions()` | `/api/dashboard/actions` (the deterministic ranker) | Read; replace ranker logic with agent later |

### 2.9 Sub-conclusion §2

A back-of-envelope count: ~40 agent tools could be wrapped over existing API routes today, covering the pricing / calendar / channel / messaging / reviews / turnover surfaces. Each wrap is small (verify the route's auth, write a typed schema, add stakes metadata). The cumulative effect — once the agent loop exists per Belief 2 — is that a host could plausibly say *"raise weekend rates 10% on the next 4 weekends"* and the agent could decompose into rule + recommendation + apply with the gradient layer gating. This is the strongest near-term narrative.

---

## 3. Infrastructure-greenfield work sizing

Rough magnitude indicators. Not estimates — directional sizing.

### 3.1 Direct booking + Stripe (largest single greenfield)

**Sizing**: multi-month subsystem.

Components:
- Stripe SDK integration: API keys, account model, payment intents, webhooks, signature verification, idempotency keys.
- Schema: `direct_bookings`, `cancellation_policies`, `refund_policies`, `payment_attempts`, `payment_intents`, `refund_requests`, `disputes`. Plus `properties.direct_booking_enabled` boolean (per CLAUDE.md "Known Gaps").
- Public-facing checkout page (price → guest info → card → confirm).
- Booking-confirmation email pipeline (touches §3.2 marketing infra).
- Site builder for the host-customizable direct-booking site (Frontdesk).
- Refund-policy DSL or structured policy schema + applicator.
- Calendar integration: direct bookings block availability across all OTAs the same way iCal-imported bookings do.
- Failure modes: card decline retries, partial-refund flows, dispute responses, chargeback handling.

Comparable to building a small standalone reservations product. Not just an agent surface.

### 3.2 Marketing & acquisition (large greenfield)

**Sizing**: multi-month subsystem.

Components:
- Email-sender integration (Resend / SendGrid / SES / Postmark).
- Domain auth (SPF/DKIM/DMARC) per host.
- Audience segmentation (past guests, by stay history, by review rating, by season).
- Campaign engine (compose → schedule → send → track opens/clicks → handle bounces / unsubscribes).
- Templates + voice-consistent generation.
- A/B-testing primitive.
- Referral attribution: `referrals` table, attribution rules, payout/credit logic.
- Social-publishing integrations (Instagram / Facebook / LinkedIn API surfaces).
- Paid-acquisition tracking (UTM parsing, conversion attribution).
- CAN-SPAM / GDPR compliance: unsubscribe lifecycle, consent tracking, regional gates.

Marketing infrastructure is a domain unto itself; many SaaS companies use third-party marketing tools (HubSpot, Customer.io). Koast's Method-stated breadth implies first-party.

### 3.3 Staff & team (medium greenfield)

**Sizing**: multi-week subsystem.

Components:
- Multi-user model: `property_users` join table, role enum, RLS rewrites for every property-scoped table.
- Vendor model expansion: `vendors` table that generalizes `cleaners`, with type enum (cleaner / handyman / landscaper / pool / etc.).
- Performance tracking: structured per-vendor outcomes (on-time, quality, communication).
- Vendor payment tracking: `vendor_payments` table, payout amounts, paid/owed states. Stripe Connect or similar for actual payouts is its own greenfield (overlaps with §3.1 Stripe scope).
- Permission UI: invite flow, role assignment, scoped access.
- Activity attribution: every action logs `actor_id` (host vs co-host vs VA vs cleaner-token).

Most of the schema work is moderate; the RLS rewrites across 30+ tables are tedious but well-scoped.

### 3.4 Strategy / acquisition tooling (medium greenfield)

**Sizing**: multi-week to multi-month, depending on depth.

Components:
- Acquisition analysis: pull a property URL or address → estimate revenue (using AirROI + comp set), estimate operating cost, IRR / cap rate. Some primitives exist (`/api/properties/import-from-url`, AirROI integration, comp set engine) but the financial modeling is greenfield.
- Submarket comparison: "if I buy in Tampa vs St. Pete, what does the substrate look like" — requires market-by-market data that AirROI provides aggregate but not analyzed.
- Expansion planning: portfolio-level "next property" analysis.
- Exit modeling: what's the property worth, what's the right time to sell (overlaps with real-estate-market data we don't have).

Real estate / financial modeling is its own domain. This may be agent-only (have the agent reason over external data) rather than primitive-heavy infrastructure.

### 3.5 Maintenance / supply / inspection (medium greenfield)

**Sizing**: multi-week subsystem.

Components:
- Schema: `maintenance_tickets` with state machine, `vendors` (broader than cleaners), `supply_items`, `restock_alerts`, `inspections`.
- Triage flow: guest reports issue → categorize → dispatch.
- Photo evidence: tickets attach photos (overlaps with photo infrastructure that has known gaps per CLAUDE.md).
- Notification: extends Twilio path beyond cleaners.
- Calendar integration: maintenance windows block availability.

Smaller scope than direct booking or marketing because it's mostly schema + workflow. The state-machine pattern from cleaning_tasks generalizes.

### 3.6 Listing-content management (smaller greenfield within Channel mgmt)

**Sizing**: multi-week subsystem.

Components:
- Per-channel listing-copy fields (title, summary, description, house manual) — each channel has its own length / format constraints.
- Photo management: ordered, tagged, per-channel selection (which 5 photos for Airbnb cover, which 8 for BDC).
- Channel-specific positioning rules.
- Schema: `listing_content` per `(property, channel)`, versioned.
- Sync to OTA via Channex or direct OTA API.

The Channex integration handles rates/availability/restrictions today; listing content goes through a separate Channex API that this codebase doesn't yet exercise.

### 3.7 Sub-conclusion §3

Two large multi-month surfaces (direct booking, marketing). Three medium multi-week surfaces (staff/team, strategy/acquisition, maintenance). One medium-small (listing content). Together that's roughly **6+ months of subsystem work** before the substrate is fully agent-addressable, even with the agent layer itself shipping in parallel. The Method's framing — *"this doesn't mean Koast is the best at any single surface at launch"* — is consistent with this: the breadth is the bet, but breadth costs.

---

## 4. Operational substrate gaps (both directions)

### 4a. Codebase substrate the Method didn't name

The codebase has built operational infrastructure that doesn't map cleanly to the 10 Method categories:

1. **Channex audit infrastructure** (`channex_outbound_log` 17 rows, `channex_webhook_log` 102 rows, BDC-clobber-incident response: env gate, safe-restrictions helper, concurrency_locks, atomic creation rollback). This is *defensive* infrastructure for OTA platform writes. The Method names "channel management" but doesn't address the safety / audit / incident-response layer that's necessary because OTAs are unforgiving. This belongs in §1.5 but is structurally distinct.

2. **iCal sync as fallback channel mode**. The codebase treats iCal as a peer of Channex for properties that aren't on the channel manager (Cozy Loft is iCal-only for some platforms). The Method's "channel management" implies the agent operates on Channex-managed channels; the iCal fallback exists but has its own quirks (push availability=0 on import, ghost-booking cleanup, 15s feed timeout).

3. **Onboarding flow** (`/onboarding` 6-step wizard: Welcome → Property → Calendar → Details → Messages → Done). The Method addresses ongoing operation but not the cold-start. Onboarding does first-time configuration that doesn't recur (set up property facts, connect first calendar, seed first templates).

4. **Settings / account management** (profile, password, plan, exports, delete account). The Method's substrate is operational, not account-administrative.

5. **Public lead-gen surfaces** (`/revenue-check`, `/clean/[taskId]/[token]`). These are auth-bypass routes for non-host actors (prospect filling out lead form, cleaner clicking task link). The Method addresses host-as-actor; these are different.

6. **Channex 14-test certification suite** (`/channex-certification`). Internal tooling for staying compliant with Channex's whitelabel requirements. Operational but for Koast as a business, not for the host.

### 4b. Method substrate with no plausible path even with agent layer

Some Method-named substrate categories require infrastructure investment that the agent layer alone won't fix:

1. **Property acquisition analysis** (Method §10). Requires real-estate market data (MLS, public records, recent sales comps) that AirROI doesn't provide. The agent could reason over external data fed in manually, but autonomous "should I buy this property at $X" requires data sources not currently integrated.

2. **Hiring conversations** (Method §9 implies it). Hiring is a fundamentally human + legal process. The agent could draft job descriptions, screen candidates' written responses, prep interview questions — but the actual hiring decision is human. Possibly *"Koast supports but doesn't operate"* per the scoping line.

3. **Exit decisions** (Method §10). Selling a property requires real-estate-market data, agent (the human kind) coordination, legal documentation, escrow. Mostly external; the agent's role is analytical not operational.

4. **Networking / partnership building** (explicitly listed as out-of-scope by the Method's scoping line). Correctly excluded.

5. **Brand voice across surfaces** for marketing (Method §7). The voice rules exist for messaging/reviews (§6 of Belief 5 inventory). Extending consistently to email campaigns, social posts, paid ads requires those surfaces to exist (greenfield per §3.2).

6. **OTA policy compliance tracking** (Method §5). Airbnb Superhost requirements, BDC content quality scores, response-rate thresholds — these are scraped/synthesized from each OTA's host dashboard. No code today; would require per-OTA UI scrapers or undocumented APIs.

7. **Voice as a real interaction mode** (Method §2 "voice will be a real interaction mode in time"). Speech-to-text + text-to-speech infrastructure plus the agent loop. Not in the codebase. Per Belief 2.

### 4c. Sub-conclusion §4

The codebase has *defensive* and *cold-start* operational infrastructure that's load-bearing but not in the Method's framing — they're prerequisites or scaffolding rather than ongoing operations. The Method has substrate categories whose execution requires either external data integrations (acquisition, exit) or surfaces that don't yet exist (marketing-content, listing-content). These don't disprove Belief 6's "full digital substrate" claim; they bound it: the substrate is *digital* but Koast doesn't yet have access to all relevant digital data sources.

---

## 5. Sequencing observations

### 5a. Natural early agent capabilities (low cost, high demonstration value)

In rough order of strength:

1. **Pricing tools** (read + reason + propose). The signal breakdown + audit endpoint + apply state machine are mature. The host saying *"why is Tuesday's rate $25 lower than my comp set"* and the agent rendering a calendar artifact with the engine's reasoning is a demo-quality interaction with no underlying gaps. Ship first.

2. **Calendar / booking inspection**. *"Show me bookings for the next 30 days"* / *"any conflicts I should know about"* — read-side tools over `bookings`, `calendar_rates`, `bookings/conflicts`. Trivial to wire.

3. **Reviews capabilities**. *"Generate a draft for the review I owe Sarah"* / *"any reviews waiting on me"* — the LLM call sites + state machine are ready. Voice is decent. Scheduler for auto-publish is a small worker addition.

4. **Channel observability**. *"Are all my channels healthy"* / *"why did the BDC sync fail last night"* — reads over `channex_webhook_log`, `property_channels`, `channex_outbound_log`. Mostly read-only.

5. **Cleaner coordination**. *"Schedule a cleaner for the Tuesday turnover"* / *"text Maria the gate code"* — `/api/turnover/*` routes ready. SMS path battle-tested.

These five together cover ~5 of the 10 Method substrate categories and require almost no new infrastructure. If the agent loop exists (Belief 2 greenfield), this is the demo-quality MVP.

### 5b. Natural mid-stage capabilities (medium cost, real value)

6. **Messaging draft + send**. The substrate is rich but the gradient layer's stakes-aware confirmation matters more here than for pricing — sending a wrong message is irreversible. Wait until the gradient layer is calibrated.

7. **Apply pricing / push to Channex**. Same — the substrate works (BDC env gate, safe-restrictions helper) but the agent should not autonomously apply rates until the gradient has earned the trust. Belief 4's auto-apply checklist gates this.

8. **Auto-publish reviews scheduler**. Small worker addition; needs the `scheduled_publish_at` honored. Low-stakes once written.

9. **Pattern detection across reviews**. Read-side aggregator over `guest_reviews` — the agent reads recent reviews and surfaces "3 of 5 mention WiFi." No new infrastructure beyond the read.

10. **Maintenance triage** (read-side first). The agent reads guest messages for keywords ("broken," "leak," "doesn't work"), surfaces a triage suggestion, then opens a ticket once the schema exists. Schema is small.

### 5c. Natural late capabilities (high cost or complex underlying work)

11. **Direct booking + Stripe**. Multi-month subsystem (§3.1).

12. **Marketing campaigns**. Multi-month subsystem (§3.2).

13. **Staff & team / multi-user**. Multi-week subsystem (§3.3); blocks 11/12 in some organizations because the host needs co-host access before marketing can be delegated.

14. **Acquisition / strategy**. Either agent-reasoning-only (over external data fed manually by the host) or a multi-month integration with real-estate data sources.

15. **Listing-content management** (titles, photos, copy per channel). Smaller greenfield than 11-14 but its own subsystem.

### 5d. Hard dependency chains

- **Voice memory (Belief 3) → personalized message drafts (Belief 6 §1.1)**. The current `generateDraft()` uses 20 recent messages flatly; voice memory would distill the host's style. Without voice memory, draft quality is mediocre.
- **Memory layer (Belief 3) → "what does Koast know about this property" (Belief 6 §1.1, §1.2, §1.10)**. Without memory, every conversation starts from scratch.
- **Gradient layer (Belief 4) → autonomous pricing apply (Belief 6 §1.3) AND autonomous send (§1.1) AND auto-publish reviews (§1.8)**. None of these can graduate to autonomy without the gradient's per-host calibration.
- **Agent loop (Belief 2) → all of the above**. The agent loop itself is greenfield; nothing here works without it.
- **Stripe integration (§3.1) → Method's "Koast applies host's policy on direct bookings"**. Direct booking financial actions can't happen without Stripe.
- **Multi-user model (§3.3) → vendor payments / VA delegation / co-host coordination**. All blocked on `property_users` / role enum.
- **Marketing infrastructure (§3.2) → "brand voice across surfaces"**. Voice rules (Belief 5) exist for messaging/reviews; marketing application requires the surfaces.

### 5e. The shipping ladder implied by the substrate map

If the agent loop ships (per Belief 2 greenfield), the natural ladder is:

1. **Tier 1 — read-side agent tools across pricing / calendar / reviews / channel / turnover**: high demo value, low cost. Ships when the agent loop ships.

2. **Tier 2 — write-side tools through the gradient layer**: requires Belief 4 calibration. Pricing apply, send message, approve review, push rates. Ships when gradient is calibrated for that action type.

3. **Tier 3 — memory-backed personalization**: voice memory, property-quirks memory, decision-pattern memory. Requires Belief 3 greenfield. Ships when memory has accumulated enough per-property data (months of operation per host).

4. **Tier 4 — substrate expansion**: maintenance, supply, listing-content, multi-user. Greenfield subsystems built outside the agent layer; agent capability follows substrate availability.

5. **Tier 5 — direct booking + marketing**: large multi-month subsystems; agent capability is incremental on top of the new substrate.

The Method's *"Koast was always there; it just becomes more present"* phrasing tracks: the agent that ships in Tier 1 is the same agent that ships in Tier 5 — just with more substrate to operate on.

### 5f. Sub-conclusion §5

Three of the ten substrate categories (pricing, calendar, channel) are infrastructure-ready and represent the natural early agent surface. Three more (reviews, guest ops, property ops/cleaning) are partially ready and graduate quickly with modest fill-in work. Two are large greenfield (direct booking, marketing) and represent multi-month subsystem investments. Two are partially ready or mostly greenfield depending on depth (staff/team, strategy/growth). The shipping ladder is roughly: read-side agent tools → gradient-gated write tools → memory-backed personalization → substrate expansion → financial / marketing greenfield. The hard dependency chains point at Beliefs 2-4 as the load-bearing prerequisites.

---

## Headline

The substrate map is **bimodal**: half the Method's 10 categories are infrastructure-ready or partially ready (pricing, calendar, channel, reviews, guest ops, property ops, partial strategy), and half are greenfield or partially greenfield (direct booking, marketing, staff/team beyond cleaners, strategy/acquisition deep work). The agent layer's near-term value can be very real over the first half — five of the ten categories have ~40 wrapeable agent tools today — while the second half represents 6+ months of subsystem work that the agent layer doesn't bypass. The Method's claim *"the architecture supports the full vision from day one. The surfaces fill in over time"* is consistent with this map: the schema and integrations cover the readiness half cleanly; the greenfield half is honest forward work.
