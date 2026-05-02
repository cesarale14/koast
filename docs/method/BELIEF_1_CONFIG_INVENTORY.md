# Belief 1 — Configuration Inventory

*Belief: "Koast is the agent, not the tool." — configuration is the exception, not the default.*

This is an inventory of what currently exists in `~/koast` that is configuration-shaped: settings pages, forms that capture host preferences/templates/rules, and DB tables holding host-defined rules or preferences. Investigation only — no code changes.

Verified against the live Supabase DB on 2026-05-01 (row counts inline). 2 properties in production: Villa Jamaica and Cozy Loft.

---

## 1. Configuration surfaces in the frontend

### 1a. The `/settings` route — exists, single-tenant account-level

`src/app/(dashboard)/settings/page.tsx` (758 lines) is one long monolithic page (no tabs, no nested routes). Sections it contains, top to bottom:

| Section | What it captures | Data destination |
|---|---|---|
| Profile | Full name, phone | `auth.users.user_metadata` |
| Email (read-only) | — | — |
| Plan & Billing | Read-only display of tier + property count + feature gates | `properties` count, `user_subscriptions.tier` |
| Channel Manager | Open Channex link, "Sync from Channex" button | none persisted; ephemeral sync trigger |
| Notifications | 4 boolean toggles: `email_new_booking`, `email_messages`, `email_cleaning`, `email_price_alerts` (+ 2 disabled "Coming Soon": SMS, Push) | `user_preferences.preferences` JSONB via `POST /api/settings/preferences` |
| Connected Accounts | Read-only list of `property_channels` + `ical_feeds` | — |
| Security | Reset password, delete account | Supabase auth + `/api/settings/delete-account` |
| Data & Export | Export JSON / CSV buttons | client-side download |
| Appearance | Light/Dark/System theme toggle (Dark + System are dimmed "Coming Soon") | local component state only — not persisted |

Everything in this page is either account-management or read-only display. There is **no** product-behavior configuration here.

There is no `/config` route. There is no `/preferences` route.

### 1b. Other configuration-bearing pages and forms

| Surface | File | What it configures |
|---|---|---|
| **Add Property wizard** | `src/app/(dashboard)/properties/new/page.tsx` (598 lines) | 4 steps: property facts → platform iCal/Channex listings → base/min/max rate + min_stay + pricing_mode (`manual`/`review`/`auto`) → review |
| **Onboarding wizard** | `src/app/(dashboard)/onboarding/page.tsx` (1113 lines) | 6 steps: Welcome → Property → Calendar → **Details** (`wifi_network`, `wifi_password`, `door_code`, `parking_instructions`, `house_rules`, `emergency_contact`, `special_instructions` — written to `property_details`) → **Messages** (toggles 8 default templates on, written to `message_templates`) → Done |
| **Property Settings modal** | `src/components/dashboard/PropertyDetail.tsx:870-1236` | Property entity facts only — name, address, city/state/zip, lat/lng, bedrooms, bathrooms, max_guests, property_type. **Does NOT edit `property_details`** (wifi, door_code, house_rules, etc.) — once set during onboarding, no UI to update them. |
| **Pricing Rules editor** | `src/components/polish/PricingTab.tsx:699-840` (`RulesEditor`) | Per-property `pricing_rules`: base_rate, min_rate, max_rate, max_daily_delta_pct, comp_floor_pct, auto_apply toggle. Auto-saves on blur to `PUT /api/pricing/rules/[propertyId]`. |
| **Per-channel rate editor** | `src/components/calendar/PerChannelRateEditor.tsx` | Per-channel rate overrides on calendar dates → `calendar_rates` rows |
| **Calendar Sidebar / Pricing tab / Availability tab** | `src/components/polish/calendar/PricingTab.tsx` (634 lines) + `AvailabilityTab.tsx` | Per-date base rates, min-stay, availability blocks |
| **Template manager** | `src/components/dashboard/TemplateManager.tsx` (372 lines) | Per-property message templates: per-template body editor, active toggle, preview-with-fake-vars, "Reset to default" button. Reads/writes `message_templates`. Mounted at `/messages` (likely as a subview). |
| **Reviews settings modal** | `src/components/reviews/ReviewsSettingsModal.tsx` | Per-property review rules: `auto_publish` (dimmed Coming Soon), `tone` ("warm" / "professional" / "enthusiastic"), `target_keywords` (CSV → `text[]`), `bad_review_delay`, `publish_delay_days` (1-13). PUT `/api/reviews/rules/[propertyId]`. |
| **Cleaners management** | `/api/cleaners` + page (cleaner CRUD) | Vendor records |
| **iCal feed add** | `POST /api/ical/add` + UI in property add wizard step 2 | iCal feed URLs per property/platform |

### 1c. Where configuration lives in the navigation

The sidebar nav (9 items) per `src/app/(dashboard)/layout.tsx`:
```
Dashboard, Calendar, Messages
MANAGE: Properties, Pricing, Reviews, Turnovers
INSIGHTS: Market Intel, Comp Sets
```

Account `Settings` is not in the sidebar — reached via the avatar menu / direct URL. Per-property configuration is buried in the property detail tabs (Pricing tab) and modals (Property Settings modal, Review Settings modal). Templates live inside the Messages page. There is no central "Configuration" or "Rules" navigation item — config is dispersed.

### 1d. Forms summary

The app captures host preferences in 6 distinct form clusters:

1. **Account/notification preferences** — `/settings` page, `user_preferences` JSONB.
2. **Property facts** — `/properties/new` wizard + Property Settings modal, `properties` table.
3. **Property operational details** — `/onboarding` Details step ONLY, `property_details` table. Set-once at onboarding; no edit UI elsewhere.
4. **Message templates** — onboarding Messages step + TemplateManager. `message_templates` table. Per-template body editor with `{var}` placeholders, trigger_type, days offset, time-of-day.
5. **Pricing rules** — Pricing tab → `RulesEditor`, `pricing_rules` table. Auto-save on blur.
6. **Review rules** — `ReviewsSettingsModal`, `review_rules` table. Per-property tone + keyword + auto-publish behavior.

---

## 2. The configuration data model

Schema verified against `src/lib/db/schema.ts` (685 lines) and `supabase/migrations/`. Live counts pulled from production Supabase 2026-05-01.

### Configuration-shaped tables

| Table | Rows (live) | Scope | What's in it |
|---|---|---|---|
| `user_preferences` | **0** | user (PK = `user_id`) | Single JSONB blob `preferences` containing notification toggles. Schema-shape exists; no rows yet despite the Settings UI being shipped. |
| `user_subscriptions` | **1** | user | Plan tier (`free`/`pro`/`business`). DB-trigger `enforce_property_quota` reads this on property INSERT. |
| `property_details` | **0** | property (1:1, UNIQUE on property_id) | Per-property operational facts: `wifi_network`, `wifi_password`, `door_code`, `smart_lock_instructions`, `checkin_time` (default 15:00), `checkout_time` (default 11:00), `parking_instructions`, `house_rules` (text), `local_recommendations` (text), `emergency_contact`, `special_instructions`, `custom_fields` (jsonb default `{}`). **0 rows in production** — even Villa Jamaica and Cozy Loft have nothing here. |
| `message_templates` | **0** | property | Per-property templates: `template_type`, `subject`, `body` (with `{var}` placeholders), `is_active`, `trigger_type` (one of `on_booking`/`before_checkin`/`on_checkin`/`after_checkin`/`before_checkout`/`on_checkout`/`after_checkout`), `trigger_days_offset`, `trigger_time`. Per-property by `property_id` FK. **0 rows in production.** |
| `review_rules` | **0** | property | Per-property review automation: `auto_publish` bool, `publish_delay_days` int, `tone` (warm/professional/enthusiastic), `target_keywords text[]`, `bad_review_delay` bool. **0 rows in production.** |
| `pricing_rules` | **2** | property (UNIQUE on property_id) | Per-property pricing guardrails: `base_rate`, `min_rate`, `max_rate`, `channel_markups` (jsonb default `{}`), `max_daily_delta_pct` (default 0.20), `comp_floor_pct` (default 0.85), `seasonal_overrides` (jsonb default `{}`), `auto_apply` (default false), `source` (`defaults`/`inferred`/`host_set`), `inferred_from` (jsonb capturing the stats used to infer). The only configuration table with rows in production. |
| `property_channels` | **3** | property | Per-channel state per property: `channex_channel_id`, `channel_code` (ABB/BDC/etc), `status`, `settings` JSONB (default `{}`). Mostly state, but `settings` JSONB is a configuration escape hatch. |
| `ical_feeds` | **2** | property | iCal sync configuration: `feed_url`, `platform`, `is_active`, `platform_listing_id`. Operational config. |
| `cleaners` | **2** | user | Vendor records: name, phone, email, is_active. |
| `listings` | (not counted) | property | `platform`, `platform_listing_id`, `channex_room_id`, `listing_url`, `status`. Per-property platform mapping. |
| `properties.amenities` (jsonb) | n/a | property | Default `[]`. No UI surfaces it; appears unused in writes. |
| `properties.photos` (jsonb) | n/a | property | Default `[]`. Photos write path is the cover_photo column + Channex photo backfill. |
| `bookings.notes` | n/a | booking | Free-text per booking. No UI to edit; only set via Channex sync paths. |
| `cleaning_tasks.checklist` (jsonb) | n/a | task | Task checklist seeded by `auto-create.ts` (5-item default). |
| `cleaning_tasks.notes` | n/a | task | Free-text. |

### Sub-conclusion

Of the 11 configuration-shaped tables: only 4 have any data in production (`pricing_rules`=2, `property_channels`=3, `ical_feeds`=2, `user_subscriptions`=1, `cleaners`=2). The schemas designed to hold the host's *operational* knowledge — `property_details`, `message_templates`, `review_rules`, `user_preferences` — are all **empty** despite the UI surfaces existing for each. The schema is config-heavy in design; the actual usage is config-light. The host's hosting knowledge effectively lives nowhere structured today.

The `properties.amenities` jsonb and `property_details.custom_fields` jsonb are the only true "freeform" escape hatches in the schema, and neither has any UI consumer or writer.

---

## 3. Messaging templates and automation

### 3a. Message templates

**Yes, `message_templates` exists.** Defined at `src/lib/db/schema.ts:601-616` and migration `008_property_details_and_templates.sql`. Schema:

```
message_templates
  id, property_id (FK), template_type, subject, body, is_active,
  trigger_type, trigger_days_offset, trigger_time
```

**Default template catalog**: `src/lib/onboarding/default-templates.ts` (`DEFAULT_ONBOARDING_TEMPLATES`) ships 8 stock templates: `booking_confirmation`, `pre_arrival`, `checkin_instructions`, `welcome`, `midstay_checkin`, `checkout_reminder`, `thank_you`, `review_request`. Each has a body with `{guest_name}` / `{property_name}` / `{check_in}` / `{checkin_time}` / `{door_code}` / `{wifi_network}` / `{wifi_password}` / `{parking_instructions}` / `{house_rules}` / `{special_instructions}` / `{emergency_contact}` placeholders.

**How templates get into the DB**: at `/onboarding` Messages step the host toggles which defaults to activate; the page batch-INSERTs them with `property_id` set. Outside onboarding, `TemplateManager.tsx` (in `/messages`) lets the host edit the `body` per-template, toggle active state, and reset to default. There is no "create new template" UI — templates are limited to the 8 default `template_type` values; the UI shows defaults inline as virtual rows that get persisted on first edit/toggle.

### 3b. Automation rule system

**There is one automation system: time-anchored template firings, run by a Python worker on the Virginia VPS.**

Worker: `/home/ubuntu/koast-workers/messaging_executor.py` (364 lines). Algorithm (per file header):
1. Hourly cadence via systemd timer (per CLAUDE.md — but per the worker file's own footer: "NOT systemd-enabled in this commit. Manual run + log inspection is the supervised first-run gate"). Status uncertain — needs separate verification.
2. Lookback window: now − 7 days.
3. Cross-join `message_templates` (active) × `bookings`, compute `target_fire_at = booking.<anchor> + trigger_days_offset days + trigger_time` where `<anchor>` is `created_at` (for `on_booking`), `check_in` (for `before_checkin`/`on_checkin`/`after_checkin`), or `check_out` (for `before_checkout`/`on_checkout`/`after_checkout`).
4. Filter to candidates whose target_fire_at ∈ [now−7d, now].
5. INSERT INTO `message_automation_firings (template_id, booking_id) ON CONFLICT DO NOTHING RETURNING id`. The unique constraint on `(template_id, booking_id)` is the idempotency gate.
6. If insert succeeded: regex-render `{var}` substitution against booking + property + property_details + resolved guest name. Missing vars render as `[not set]` and get logged.
7. INSERT a `messages` row with `direction='outgoing'`, `sender='property'`, `draft_status='draft_pending_approval'`, `sent_at=NULL`. Updates the firings row with `draft_message_id`.
8. Per-row try/except so a single bad template doesn't poison the run.

**Out of scope explicitly listed in the worker**: event-driven triggers (Channex webhook → fire), conditional triggers (skip-if-review-already-left), and AI personalization beyond `{var}` substitution.

**Idempotency table**: `message_automation_firings` (id, template_id FK, booking_id FK, draft_message_id FK, fired_at). UNIQUE(template_id, booking_id). 0 rows in production.

**No event-driven automation, no rule expressions, no condition trees, no skip-conditions, no logical operators.** The system is: time-of-day + offset-from-anchor-date + per-template enable flag. That's the totality of "when X then Y" today.

There is **no** trigger system for "guest says X → do Y" — i.e., no inbound classification → outbound action wiring in production. The `classifyMessage(content)` function in `src/lib/claude/messaging.ts:102-120` exists (regex-based, not LLM) and returns one of `check_in`/`wifi`/`checkout`/`early_checkin`/`late_checkout`/`general`, but no caller in the repo invokes it; it's dead infrastructure waiting for the AI messaging pipeline that CLAUDE.md lists under "UPCOMING FEATURES (Designed, Not Built)".

### 3c. Scheduled messages

Scheduled messages, today, are exactly the template firings above — drafts are queued in `messages` with `draft_status='draft_pending_approval'`, sitting until the host approves and sends. There is no separate "scheduler" table, no cron-style rule editor, no "send X at Y time" surface.

**Auto-send** (i.e., draft → sent without human approval) is part of the upcoming "AI messaging pipeline" listed in CLAUDE.md but not built. Today every executor-generated draft requires host approval.

---

## 4. Property-level configuration

### 4a. Property add — what gets captured

The `/properties/new` wizard (`src/app/(dashboard)/properties/new/page.tsx`) collects:

**Step 1 (Property Details)**: name (required), address, city, state, zip, latitude, longitude (auto-set from address autocomplete), bedrooms, bathrooms, max_guests, property_type (`entire_home`/`private_room`/`shared_room`).

**Step 2 (Platform Listings)**: per-platform (airbnb, vrbo, booking_com, direct) checkbox + connection mode (`ical` vs `channex`) + iCal URL OR (Channex listing ID + listing URL).

**Step 3 (Base Pricing)**: base_rate (required), min_rate, max_rate, min_stay, pricing_mode (`manual`/`review`/`auto`) — but **the wizard form fields are not all written to DB**. The handler INSERTs `properties`, INSERTs `listings`, then generates 90 days of `calendar_rates` at the entered base_rate. min_rate, max_rate, min_stay (other than per-row default), and pricing_mode are collected but **not persisted** — they don't go into `pricing_rules` (which is created lazily by the inference path on first GET to `/api/pricing/rules/:id`). The UI has them but the data path discards them.

**Step 4 (Review)**: read-only summary, then handleSave INSERTs.

The Onboarding flow for first-time signups (`/onboarding`) collects the same property facts plus the Details step (wifi/door/house_rules → `property_details`) and the Messages step (active templates → `message_templates`).

### 4b. Property notes / custom fields / freeform

- `properties.amenities` jsonb (default `[]`) — exists in schema. No UI writes it. No UI reads it.
- `bookings.notes` text — exists in schema. No UI writes it through the property surface; only Channex-imported notes flow in.
- `property_details.custom_fields` jsonb (default `{}`) — exists in schema. No UI writes it. No UI reads it. **This is the closest thing to a "freeform property knowledge" container in the codebase, and nothing populates or surfaces it.**

There is no "Property Notes" tab. There is no quirks/edge-case capture surface. There is no "tell Koast about this property's X" prompt. The host's idiosyncratic operational knowledge — the kind of thing in the Method document's hurricane-door example — has no home in the schema beyond `property_details.house_rules` (free text, single field) and `property_details.special_instructions` (free text, single field).

### 4c. Properties table — full column list

From `src/lib/db/schema.ts:19-45`:

```
properties
  id (uuid PK), user_id (uuid), name (required),
  address, city, state, zip, latitude, longitude (decimal),
  bedrooms (int), bathrooms (decimal), max_guests (int),
  property_type (text),
  amenities (jsonb default []),       -- unused
  photos (jsonb default []),          -- unused; photos go via cover_photo_url
  cover_photo_url,
  channex_property_id,
  default_cleaner_id (uuid),
  reviews_last_synced_at, messages_last_synced_at,
  created_at, updated_at
```

Plus the related-but-separate `property_details` table (1:1, UNIQUE on property_id) for the operational fields listed in §2.

The CLAUDE.md "Known Data Quality Issues" notes:
- `properties.updated_at` is not auto-bumped on UPDATE (no BEFORE UPDATE trigger; only the Settings PUT route bumps it manually).
- Multi-unit properties not modeled (no `parent_property_id`); Villa Jamaica + Cozy Loft are coresident on the same parcel but stored as independent rows.
- Direct-booking-enabled has no canonical column.

---

## 5. What's NOT configuration-shaped

### 5a. Structured memory / learned facts / accumulated knowledge

**There is no general-purpose "memory" table. There is no "learned facts" or "knowledge base" abstraction.**

The closest things in the codebase to "Koast learned X about this property/host/guest from interaction":

1. **`pricing_rules.source = 'inferred'` + `pricing_rules.inferred_from` jsonb.** `src/lib/pricing/rules-inference.ts:1-75`. When a property has ≥30 days of `calendar_rates` data, the inference function reads its history (last 60 days past + next 60 days future, prefer future), computes p10/p50/p90 percentiles + p95 daily delta, and writes those as base_rate/min_rate/max_rate/max_daily_delta_pct with `source='inferred'`. The `inferred_from` jsonb captures `{ row_count, date_range, percentiles, daily_delta_p95, channels_sampled, computed_at }` so the inference can be re-audited and re-run when the algorithm improves. Triggered lazily on first GET to `/api/pricing/rules/[propertyId]`.

2. **Pricing engine `learnedDow` (day-of-week seasonality).** `src/lib/pricing/engine.ts:255-308` and `src/lib/pricing/forecast.ts:57-67`. Reads `pricing_outcomes` (per-date suggested-vs-actual rate + booking outcome) and computes a per-day-of-week conversion rate. The seasonality signal at `src/lib/pricing/signals/seasonality.ts:35-40` then uses `learnedDow` if ≥7 distinct days are present; otherwise falls back to a hard-coded DOW_BASE table. Each call returns `source: "learned"` vs `source: "default"` so callers know.

3. **`pricing_outcomes` table.** Per-date `(suggested_rate, applied_rate, was_booked, booking_id, actual_revenue, booked_at, days_before_checkin, market_adr, market_occupancy, demand_score, comp_median_adr, signals jsonb, revenue_vs_suggested)`. This is the substrate the seasonality learning loop reads. It's an outcome log, not memory in the Method sense — it captures what happened, not what was learned about the host.

4. **`guest_reviews.ai_context` jsonb.** Schema slot exists. Written exactly once: `/api/reviews/generate/[bookingId]/route.ts:136`. Captures the context passed to the LLM at generation time (booking + property + tone). It's audit metadata for one generation event, not accumulated knowledge.

5. **`pricing_recommendations.reason_signals.clamps`** jsonb — captures `{ raw_engine_suggestion, clamped_by, guardrail_trips }` per recommendation. Audit trail, not memory.

6. **`market_comps` and `market_snapshots`** — external data cached locally (AirROI). Not host-derived knowledge.

That's the totality. There is **no**:
- per-property quirks/edge-cases store
- per-guest preference store (Sarah-prefers-late-checkin from the Method document)
- voice memory of the host's writing style
- operational memory of host decision patterns (late-checkout tolerance, default credit amounts, vendor reliability)
- conversation-derived structured fact extraction
- provenance/confidence/lifespan metadata layer
- correction trail (old fact preserved when new fact supersedes)
- inspectable memory browser

The system today learns *one thing*: pricing rules from rate history. Everything else the host knows about the property is either stored in flat free-text fields (`house_rules`, `special_instructions`, `parking_instructions` — none populated in production) or held entirely in the host's head.

### 5b. LLM calls in production code

**Two production LLM call sites, both Anthropic SDK, both `claude-sonnet-4-20250514`.**

#### `src/lib/claude/messaging.ts` — `generateDraft()`

- **Caller**: `POST /api/messages/draft` (`src/app/api/messages/draft/route.ts`). Triggered when the host clicks "Draft" on an inbound message in the Messages UI.
- **Inputs**: property facts (name, city, bedrooms, bathrooms, max_guests), booking context (guest name, dates, num guests, total price), `property_details` (wifi, door_code, checkin_time, parking, house_rules, special_instructions), the last 20 conversation messages, and the latest inbound message.
- **System prompt**: friendly STR host assistant for `${property.name}`, with property details inlined as "Property information you KNOW and should share when asked: …". Targets 2-4 sentences, never mention being AI.
- **Output**: a single text draft. Stored on `messages.ai_draft` with `draft_status='generated'`.
- **Max tokens**: 300. Single-turn. No tools, no streaming, no caching.

The exported helper `classifyMessage(content)` in the same file is regex-based (no LLM) and unused by any caller.

#### `src/lib/reviews/generator.ts` — three exports

- **`generateGuestReview(booking, property, rule)`** — outgoing host→guest review. Two model calls per invocation: one for the public review (max_tokens 400, system prompt enforces tone + keyword weaving + first-name + length), one for the private note (max_tokens 100). Caller: `POST /api/reviews/generate/[bookingId]`.
- **`generateReviewResponse(incomingText, incomingRating, booking, property, rule)`** — host's response to an incoming guest review. max_tokens 300; system prompt branches by rating category (positive / mixed / negative). Caller: `POST /api/reviews/respond/[reviewId]`.
- **`generateGuestReviewFromIncoming({ incoming_text, incoming_rating, private_feedback, … })`** — host review of a guest, conditioned on the guest's incoming review of the property. max_tokens 200. Caller: `POST /api/reviews/generate-guest-review/[reviewId]`.

All three read `review_rules.tone` + `review_rules.target_keywords` per property. With `review_rules` having 0 rows in production, the routes use defaults (tone='warm', keywords=['clean', 'location', 'comfortable']).

#### Worker LLM calls

`grep -rn "anthropic|claude-" /home/ubuntu/koast-workers --include="*.py"` returns nothing. Workers (booking_sync, messaging_executor, pricing_validator, market_sync, reviews_sync, ical_parser, pricing_performance_reconciler) are pure Python data-plumbing and SQL — no LLM in the worker tier. The messaging_executor renders templates with regex `{var}` substitution, not generation.

#### Total LLM surface

- **1 messaging call** per host-clicked draft (Messages UI).
- **2-3 review calls** per review generation (Reviews surface).
- **0 calls** in any worker.
- **0 calls** in any pricing or analytics path.
- **0 streaming**, **0 tool use**, **0 prompt caching**, **0 multi-turn agentic loops**.

The architecture today is "LLM as a string-generation function for two specific tasks." There is no agent, no tool-call loop, no long-running conversation, no extracting-structured-facts-from-messages step. Calls are one-shot, request/response, single-turn.

---

## Sub-conclusion

Belief 1 says configuration is the exception, not the default. The current codebase is the inverse:

- The schema was designed config-first: 11 configuration-shaped tables exist.
- Onboarding asks the host to pre-fill operational details (wifi, door_code, house_rules) and pre-toggle 8 default message templates.
- Property add is a 4-step form-based wizard.
- Per-property surfaces (pricing rules, review rules, message templates) each have their own form-based editor with their own data model.
- "AI" today is two narrow string-generation endpoints (draft a message, draft a review). No agent loop, no tool use, no memory.
- The seven configuration tables that hold the host's *operational knowledge* (`property_details`, `message_templates`, `review_rules`, `user_preferences`, `message_automation_firings`, plus `properties.amenities` and `property_details.custom_fields` as freeform escape hatches) are **all empty in production** despite the UIs being shipped. The host hasn't told the system anything yet — and the system has no way to learn it on its own.

The closest the codebase gets to "memory" today is `pricing_rules.source='inferred'` + `learnedDow` seasonality — both narrow, both pricing-only, both inference from structured calendar data, neither extracted from conversation.
