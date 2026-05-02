# Belief 3 — Memory Compounds Inventory

*Belief: "Memory compounds." — structured per-entity facts with provenance/confidence/lifecycle. Not chat logs. Inspectable, exportable, portable. The host's asset.*

This is an inventory of what foundation exists in `~/koast` for that surface. Investigation only. No code changes.

Verified against the live Supabase DB on 2026-05-01 (row counts inline). 2 properties in production: Villa Jamaica + Cozy Loft.

Cross-reference: Belief 1 inventory established the schema is config-heavy by design but operationally empty. Belief 2 inventory established the agent layer is greenfield. This memory inventory completes the picture.

---

## 1. Existing memory-shaped artifacts

There are two systems in the codebase today that fit the Method definition of memory ("structured fact derived from accumulated history, used downstream as context"). Both are pricing-only.

### 1a. `pricing_rules.source = 'inferred'` + `inferred_from` JSONB

**Schema** (migration `20260418000000_pricing_rules_and_performance.sql`, schema declaration `src/lib/db/schema.ts:601-616` reflected in DB):

```
pricing_rules
  id uuid PK
  property_id uuid UNIQUE → properties (ON DELETE CASCADE)
  base_rate, min_rate, max_rate numeric(10,2)
  channel_markups jsonb DEFAULT '{}'      -- { "bdc": 0.05, "abb": 0.0 }
  max_daily_delta_pct numeric(5,4) DEFAULT 0.20
  comp_floor_pct      numeric(5,4) DEFAULT 0.85
  seasonal_overrides  jsonb DEFAULT '{}'
  auto_apply boolean DEFAULT false
  source text NOT NULL DEFAULT 'defaults'
    CHECK (source IN ('defaults', 'inferred', 'host_set'))
  inferred_from jsonb                      -- audit trail for inferred rows
  created_at, updated_at timestamptz
  CHECK (min_rate <= base_rate <= max_rate)
  CHECK (max_daily_delta_pct ∈ (0, 1])
  CHECK (comp_floor_pct ∈ [0, 1])
```

**Row count**: 2 in production (one per property — both inferred from history).

**What populates it**: `inferPricingRulesFromHistory()` at `src/lib/pricing/rules-inference.ts:41-171`. Algorithm:
1. Pull the property's `calendar_rates` for [today, today+60d] (preferred) and [today-60d, today) (fallback). Filter to `channel_code IS NULL` (base rows only) with non-null `applied_rate`.
2. Use whichever window has more rows. Require ≥30 rows or return null.
3. Sort the rates. Compute p10, p50 (median), p90 percentiles → become `min_rate`, `base_rate`, `max_rate`. Round to 2 decimals.
4. Sort by date. For each consecutive pair, compute `|cur - prev| / prev`. Take p95 → bound by `[0.05, 0.25]` → become `max_daily_delta_pct`.
5. For each non-null `channel_code`, compute median ratio `(channel_rate - base_rate) / base_rate` over same dates with both rates. Require ≥3 same-date observations per channel. Result → `channel_markups`.
6. Hardcode `comp_floor_pct = 0.85`. (Not learned.)
7. Record the audit trail in `inferred_from`:
   ```
   {
     row_count, date_range: { from, to },
     percentiles: { p10, p50, p90 },
     daily_delta_p95,
     channels_sampled: [...],
     computed_at: ISO timestamp
   }
   ```

**How retrieved**: `GET /api/pricing/rules/[propertyId]` (`src/app/api/pricing/rules/[propertyId]/route.ts`) is the single read entry point.
- If a row exists → return it as-is.
- If no row, try inference; on success insert with `source='inferred'`.
- If inference returns null (insufficient history) → seed `base_rate` from the most recent applied rate (or 150 default), insert with `source='defaults'`.

The pricing engine (`src/lib/pricing/engine.ts:167`) does its own direct read of `pricing_rules` (not via the API): `supabase.from("pricing_rules").select(...).eq("property_id", propertyId)`. The engine respects `source='host_set'` rules but otherwise uses whatever the row contains.

**Lifecycle**:
- **Supersession**: when the host edits a rule via `PUT /api/pricing/rules/[propertyId]`, the row is **upserted** with `source='host_set'`. The previous `inferred` data is overwritten in place — the `inferred_from` JSONB is left intact (still the original snapshot) but `source` flips. There is **no history table** — overwriting loses the previous host_set value.
- **Re-inference**: never automatic. There's no cron, no recompute trigger. The `inferred_from.computed_at` field is documented as "so re-inference can be audited and re-run when the algorithm improves" — but no caller invokes it. Once inferred, it's frozen until a host edit.
- **Decay**: none. No staleness check, no TTL, no "last validated against history" timestamp.
- **Audit**: the `inferred_from` JSONB is the entire audit trail. There is no separate `pricing_rules_history` table.
- **Confidence**: not modeled per-field. The `source` enum (`defaults` / `inferred` / `host_set`) is a 3-tier proxy, but without a numeric confidence score.

### 1b. `engine.learnedDow` — day-of-week conversion rate

**Where it lives**: not a column. It's a computed value at `src/lib/pricing/engine.ts:255-286` — derived inline at engine-run time from `pricing_outcomes`, never persisted as memory.

**Algorithm**:
1. Fetch the most recent 180 `pricing_outcomes` rows for the property (`SELECT date, was_booked, days_before_checkin … ORDER BY date DESC LIMIT 180`).
2. If `>= 30` rows: bucket by `getDay()` (0..6). For each DOW: `learnedDow[d] = booked_count / total_count` (with `0.5` fallback for empty buckets).
3. Pass `learnedDow: LearnedDowRates | null` into `SignalContext`. The seasonality signal at `src/lib/pricing/signals/seasonality.ts:35-40` reads it: if 7+ buckets present, computes `dowAdj = (learnedDow[dow] - avgRate) / avgRate`, clamps to `[-0.5, 0.5]`, and labels `source='learned'` in the signal's `reason` text. Otherwise falls back to a hard-coded `DOW_ADJUSTMENTS` table.
4. Same block also computes `avgLeadTimeDays` from booked outcomes (≥5 booked rows required), passed as a separate context field. Used by the lead-time signal.

**Row count substrate**: `pricing_outcomes` = **44** in production. Below the 30-row threshold per property, so neither property currently has learnedDow active — the engine is using the hardcoded fallback DOW table for both.

**Lifecycle**:
- **Persistence**: NONE. `learnedDow` is recomputed every engine run from raw outcomes. There is no `learned_dow_rates` table, no cached materialized view.
- **Supersession**: each engine run overwrites the in-memory value with whatever the latest 180 outcomes produce. No history.
- **Decay**: implicit — only the most recent 180 rows participate. No explicit decay weighting (a 6-month-old outcome counts the same as yesterday's).
- **Audit**: the seasonality signal's `reason` text says "learned DOW data" vs "default DOW data" so a host inspecting a recommendation sees the lineage at one level — but the actual conversion rates are not surfaced anywhere.

### 1c. Other source/confidence/inferred-state markers

A systematic search (`grep "source\s*[:=]\s*['\"]"` + migration sweep) finds these source-enum / quality-marker columns:

| Column | Where | Values | What it tracks |
|---|---|---|---|
| `pricing_rules.source` | migration `20260418000000` | `defaults`/`inferred`/`host_set` | Lineage of pricing guardrails (covered above) |
| `properties.comp_set_quality` | migration `20260417030000` | `unknown`/`precise`/`fallback`/`insufficient` | Quality of the comp-set match for this property |
| `market_comps.source` | migration `20260417030000` | `filtered_radius`/`similarity_fallback` | Per-comp lineage: strict bed/price/radius match vs AirROI similarity fallback |
| `bookings.source` | schema | `ical`/`channex`/etc. (default `ical`) | Where the booking row originated |
| `calendar_rates.rate_source` | migration 001 + per-channel | `manual`/`engine`/`override`/`manual_per_channel`/`ical` | Lineage of the rate (host-typed, engine-output, host-override on engine, per-channel manual, blocked from iCal sync) |
| `pricing_outcomes.rate_source` | migration 005 | text | Same as above, captured at outcome time |
| `local_events.source` | schema | `ticketmaster`/etc. (default `ticketmaster`) | Event provider |
| `market_snapshots.data_source` | schema | default `airroi` | Market data provider |
| `leads.source` | schema | default `revenue_check` | Lead funnel origin |
| `notifications.channel` | schema | default `console` | Notification delivery channel |

**Confidence scoring**: only one place. The `comp_set_quality` field is consumed by the Competitor signal (`src/lib/pricing/signals/competitor.ts` per CLAUDE.md note) which returns a `confidence` value: `precise=1.0`, `fallback=0.5`, `insufficient=0.0`, `unknown=0.0`. Engine aggregation multiplies base weight × confidence and redistributes dropped weight across remaining signals. **Other signals default to `confidence=1.0`** — only the Competitor signal uses the confidence scaffold.

**`pricing_recommendations.reason_signals.clamps` JSONB** captures `{ raw_engine_suggestion, clamped_by, guardrail_trips }` per recommendation — audit metadata for one engine run, not memory. 209 rows in production.

**`guest_reviews.ai_context` JSONB** is set exactly once at `/api/reviews/generate/[bookingId]/route.ts:136` — captures the context passed to the LLM at generation time. Audit metadata for one generation event, not accumulated knowledge.

### 1d. Sub-conclusion §1

The codebase has **two narrow learning loops** (pricing percentiles, day-of-week conversion) and **a small dictionary of "lineage" enums** (rate_source, source, quality). Together they're <1% of what Belief 3 calls memory. They share a few good shapes — `inferred_from` JSONB as audit, `source` enum as provenance, `comp_set_quality` driving signal confidence — that the future memory system can lift as conventions. But the actual memory layer (per-entity structured facts, confidence per fact, supersession trail, decay/refresh cycle, agent retrieval) is not present.

---

## 2. Data that could legitimately become memory substrate

This section asks: what already lands in the database that, with the right extraction layer, could compound into structured memory?

### 2a. Property data — what's currently captured

Direct on `properties` (3 rows in fleet, of which 2 active):
- Entity facts: name, address, lat/lng, bedrooms, bathrooms, max_guests, property_type, channex_property_id.
- `amenities jsonb DEFAULT '[]'` — schema slot exists, **no UI consumer or writer.**
- `photos jsonb DEFAULT '[]'` — schema slot exists, **no UI consumer or writer** (real photos go via `cover_photo_url` and Channex backfill).
- `default_cleaner_id` — the host-chosen default cleaner per property.
- `comp_set_quality` enum — derived from comp-fetch outcome.

`property_details` (1:1, **0 rows in production**):
- Operational facts intended for AI context: `wifi_network`, `wifi_password`, `door_code`, `smart_lock_instructions`, `checkin_time` (default 15:00), `checkout_time` (default 11:00), `parking_instructions`, `house_rules`, `local_recommendations`, `emergency_contact`, `special_instructions`, `custom_fields jsonb DEFAULT '{}'`.

What's **memory-shaped, not config-shaped** in this list:
- `house_rules` (text), `parking_instructions` (text), `special_instructions` (text), `local_recommendations` (text) — these are exactly the kind of *learned-through-edge-cases* facts the Method document's hurricane-door example calls out. Today they live as flat free-text fields with no structure, no provenance, no confidence, no entity sub-scoping. *A real memory system would extract a fact like "front door key needs to come out horizontally" as `entity=front_door, attribute=unlock_mechanism, value=…, source=host_taught, confidence=high`.*
- `custom_fields jsonb` — explicit freeform escape hatch. **No UI populates it.** It's the closest thing to a memory container in the schema, untapped.
- `amenities jsonb` on properties — same shape, same un-use.

What's **stable infra, not memory** in this list:
- `wifi_network` / `wifi_password` / `door_code` — these are facts about the property that change occasionally (wifi password rotates, door code changes after a guest leaves the property). They want to be queryable by the agent the way memory is, but they're really configuration with revision history. Best modeled as memory anyway, since the lifecycle (corrections, supersession, history-preserved) is the same.
- `checkin_time` / `checkout_time` — could go either way. Configuration today; the agent will want them as scoped facts.
- `smart_lock_instructions` — same as house_rules: text today, fact-extractable later.

### 2b. Guest data — what's captured across bookings

Direct on `bookings` (90 rows in production):
- Per-booking guest fields: `guest_name`, `guest_first_name`, `guest_last_name`, `guest_email`, `guest_phone`, `num_guests`, `notes` (text, no UI writer beyond Channex sync).
- Per-booking financial: `total_price`, `currency`.
- Per-booking lifecycle: `check_in`, `check_out`, `status`, `created_at`, `updated_at`, `revision_number`, `review_solicitation_sent`.
- Channel linkage: `platform`, `platform_booking_id`, `channex_booking_id`, `ota_reservation_code`, `source` (`ical`/`channex`).

What's missing for guest memory:
- **No `guests` table.** A guest is implicit — they exist only as columns on bookings. Two stays from "Sarah Johnson" produce two bookings with no link between them.
- No guest_id, no `(email, phone) → guest` resolver, no preferences-per-guest store. The Method document's Sarah-prefers-late-checkin example has no home in the current schema.
- No relationship modeling: if Sarah traveled with Marcus on her second visit, that's not capturable.
- Guest-facing review data is at `guest_reviews.guest_name` (free text), `guest_review_payload` (jsonb), `subratings` (jsonb), but again booking-scoped, not guest-scoped.

What's **legitimate substrate** for guest memory:
- 90 booking rows with guest_name + email/phone + dates + total_price gives a starting point for entity resolution. A worker that groups bookings by `(lower(email), lower(phone), normalized_name)` and writes a `guest_id` would seed the substrate.
- 90 messages (in `messages` — see §2c) are joinable to bookings via `booking_id`. Voice/preference signals can be extracted from the conversation history.
- 13 `guest_reviews` carry per-guest signals (rating, sub-ratings, sentiment, hidden flag).

### 2c. Message history — voice substrate

`message_threads` (16 rows) + `messages` (90 rows). Schema notes:
- `messages.direction` (`inbound`/`outbound`), `messages.sender` (`guest`/`property`/`system`), `messages.content` (text), `messages.platform`, `messages.attachments jsonb`, `messages.channex_meta jsonb`.
- `messages.ai_draft` (text, the LLM's draft), `messages.draft_status` (`none`/`generated`/`sent`/`draft_pending_approval`/`discarded`).
- Three-stage outbound timestamps (`host_send_submitted_at`, `host_send_channex_acked_at`, `host_send_ota_confirmed_at`) — proves which messages actually shipped to the OTA vs got stuck.

**Voice substrate quality**: the host's outbound messages (rows where `direction='outbound'` AND `sender='property'` AND `sent_at IS NOT NULL` AND `draft_status NOT IN ('generated','draft_pending_approval')`) are the host's actual writing samples — those are what a voice-learning loop would read. With ~half the 90 rows likely outbound, that's enough to start picking up patterns (sign-off, sentence length, vocabulary cadence) but not enough yet to drive confident voice generation.

There is also raw text in `bookings.notes` (no UI writer; only Channex flow inserts) and `cleaning_tasks.notes` (no UI writer surfaced). Marginal substrate.

### 2d. Booking pattern data — host-decision substrate

90 bookings + 209 pricing_recommendations + 44 pricing_outcomes + 667 calendar_rates is the basis for "operational memory" in the Method's Belief 3 list. Patterns that could be derived:

- **Lead time distribution per channel**: the engine already computes a single `avgLeadTimeDays` from outcomes — extending to per-channel distributions is straightforward.
- **Length-of-stay distribution per channel** (available from check_in/check_out + platform).
- **Direct-rebook rate per guest**: requires guest entity resolution (see §2b) but the data is there.
- **Acceptance rate on pricing recommendations** (`pricing_recommendations.status` enum) — already aggregated by `/api/pricing/performance`. 209 recs against 2 properties is enough sample.
- **Decision history**: which recs the host applied, which they dismissed, which they manually overrode. `pricing_outcomes.rate_source` distinguishes `engine` from `override`.
- **Vendor reliability**: `cleaning_tasks` carries assigned cleaner + status — completion-rate-per-cleaner is computable. Today 2 cleaners, ~no signal yet.
- **Seasonal pricing intuition**: the inferred percentiles capture the breadth of the host's pricing intent; the engine's monthly-adjustment table is hardcoded. Could be learned per-property.

### 2e. Sub-conclusion §2

The substrate exists — 90 bookings, 90 messages, 667 calendar_rates, 209 recommendations, 44 outcomes, 13 reviews. Volume per property is small (50-100 rows × 2 properties is enough for shape but not for confident statistical learning). The richer substrate is the message corpus and the booking timeline; the largest schema gap is **no guest entity** (everything is booking-scoped). The richest *unused* substrate is the `notes`/`special_instructions`/`amenities`/`custom_fields` text/JSONB fields that have schema but no writers.

---

## 3. Disposition of the 11 config tables (from Belief 1)

Restating the 11 from Belief 1 §2, plus a 12th (`message_automation_firings` — operationally a child of `message_templates`). For each: classification + one-sentence reasoning.

| Table | Rows | Classification | Reasoning |
|---|---:|---|---|
| `properties` | 2 | **STABLE INFRA + memory shell** | Entity facts (id, address, lat/lng, channex_property_id, default_cleaner_id) are stable infra; `amenities` jsonb and the operational descriptors should move to memory once that layer exists. |
| `property_details` | 0 | **SHOULD BECOME MEMORY** | Wifi/door_code/checkin_time/parking are revisable scoped facts; `house_rules`/`special_instructions`/`local_recommendations`/`custom_fields` are exactly the per-property quirks the Method document targets — currently flat free text with no structure or provenance. |
| `message_templates` | 0 | **SHOULD BE DEPRECATED** | Time-anchored template firings with `{var}` substitution is the wrong primitive once an agent can compose voice-aware messages from memory; the idempotency pattern in `message_automation_firings` is reusable but the template editor surface goes away. |
| `review_rules` | 0 | **SHOULD BE DEPRECATED** | A per-property "tone preference" + "target keywords" config row is exactly what voice memory should learn from the host's actual reviews — replace with structured voice + review-strategy memory. |
| `pricing_rules` | 2 | **HYBRID — stable infra wrapper, memory inside** | The guardrail invariants (min ≤ base ≤ max, daily delta cap, comp floor, auto-apply toggle) are stable safety configuration the host owns explicitly; the *values* should be inferred from history (and already are when source='inferred') with the memory layer feeding that inference. Keep the table; treat the values as memory-backed. |
| `user_preferences` | 0 | **SHOULD BE DEPRECATED** | Notification toggles via a JSONB blob is a small instance of the larger "operational preferences" memory category — better to learn the host's preferred notification patterns from interaction than to ask up-front. Keep a tiny stable-infra row for "do not notify under any circumstance" hard kills if needed. |
| `user_subscriptions` | 1 | **STABLE INFRA** | Plan tier + payment-related state is finance/legal config the host edits explicitly; not learned. |
| `property_channels` | 3 | **STABLE INFRA + small memory adjacencies** | OTA channel linkages (`channex_channel_id`, `channel_code`, `status`, the `settings.rate_plan_id`) are stable platform-level configuration; the `last_error` / `last_sync_at` columns are operational state, not memory. |
| `channex_room_types` | (cached) | **STABLE INFRA** | A cache of Channex's room-type metadata — the platform owns truth, Koast caches for read latency. Not memory. |
| `channex_rate_plans` | (cached) | **STABLE INFRA** | Same — cached Channex rate plan metadata. |
| `ical_feeds` | 2 | **STABLE INFRA** | Per-property iCal feed URLs + sync state — operational config the host edits explicitly. |
| `cleaners` | 2 | **STABLE INFRA + memory adjacencies** | The cleaner identity (name, phone, email, is_active) is stable config the host enters and the agent doesn't infer; reliability memory ("Maria has a 95% on-time completion rate, never had a quality complaint") is a *separate* layer that scopes to the cleaner_id. |
| `message_automation_firings` | 0 | **SHOULD BE DEPRECATED** | Idempotency table for the deprecated message_templates worker; the `(template_id, booking_id) UNIQUE` shape is reusable as a pattern but the table itself goes when templates do. |

**Counts**:
- STABLE INFRA: 6 (properties[partial], user_subscriptions, property_channels[partial], channex_room_types, channex_rate_plans, ical_feeds, cleaners[partial])
- SHOULD BECOME MEMORY: 1 (property_details)
- HYBRID: 1 (pricing_rules — keep the safety wrapper, memory-back the values)
- SHOULD BE DEPRECATED: 4 (message_templates, review_rules, user_preferences, message_automation_firings)

The Belief 1 finding ("most config tables are empty in production") tracks this disposition: the 4 deprecation candidates total 0 rows in production, and the 1 should-become-memory table also has 0 rows. The 6 stable-infra tables hold all the actual data.

---

## 4. Retrieval and application patterns

### 4a. Pricing engine retrieval shape

`src/lib/pricing/engine.ts` is the only "agent-shaped" code that exists today (it pulls multiple context sources and reasons across them). Its retrieval flow:

1. **Property facts**: `properties.select("latitude, longitude")` for weather lookup. Direct point-read.
2. **Pricing rules** (the "memory" config): `pricing_rules.select("*").eq("property_id", id)`. Single row. No cache. Re-fetched per engine run.
3. **Calendar rates** (the host's intent history): bulk fetch for the date window being computed.
4. **Bookings** (occupancy): bulk fetch overlapping the window.
5. **Pricing outcomes** (learnedDow substrate): `select("date, was_booked, days_before_checkin").eq("property_id", id).order("date desc").limit(180)`. Bounded by row count, not date.
6. **Market data**: `market_comps`, `market_snapshots`, `local_events` — direct queries with property_id + date filters.
7. **Weather**: cached in `weather_cache` table; signal reads from there.
8. **`comp_set_quality`**: a single text column on `properties`, read into the signal context for confidence weighting.

Pattern: **per-entity bulk-fetch + in-memory reasoning**. No retrieval-by-similarity, no embeddings, no vector search anywhere. The engine fetches everything that scopes to the property × window, then signals reduce the context into a number. The fact that `learnedDow` is recomputed every run from raw outcomes — instead of cached as memory — is wasteful but consistent with the rest of the engine.

### 4b. Messaging draft retrieval shape

`src/app/api/messages/draft/route.ts` is the closest thing to "agent-shaped" outside the pricing engine. Its retrieval before the LLM call:

1. **The triggering message**: `messages.select(...).eq("id", messageId).limit(1)`.
2. **Property facts**: `properties.select("name, city, bedrooms, bathrooms, max_guests").eq("id", property_id)`.
3. **Booking** (if linked): `bookings.select("guest_name, check_in, check_out, num_guests, total_price").eq("id", booking_id)`.
4. **Conversation history**: `messages.select("direction, content").eq("property_id", property_id).order("created_at asc").limit(20)`.
5. **Property details**: `property_details.select("wifi_network, wifi_password, door_code, checkin_time, checkout_time, parking_instructions, house_rules, special_instructions").eq("property_id", property_id).limit(1)`.

Pattern: **explicit per-call retrieval list, all by entity_id**. Property facts via property_id, booking via booking_id, conversation via property_id (NOT thread_id — broader than necessary), property details via property_id. Then `generateDraft()` flattens it into a system prompt by string-interpolation.

Critical observations for memory architecture:
- The retrieval list is **hard-coded** in the route. If the agent needs another fact ("guest's prior stay history", "host's late-checkout policy"), the route has to be edited to fetch it.
- The conversation history pull is `limit(20)` ordered by created_at — coarse. No relevance ranking, no filter on this thread, no summarization of older history.
- `property_details` is consumed as a *flat record* — every non-null field is concatenated into the prompt. The LLM doesn't query "is the wifi password set?" — it gets all 7 fields whether relevant or not.

This is the closest existing pattern to "fetch relevant context for an entity before performing an action," and **it's brittle**. A real memory retrieval layer would be a single call: `getMemoryFor({ entity: property_id, intent: "answer_guest_message", limit: K })` returning a ranked list of facts.

### 4c. Other "fetch context for entity" patterns

- **Reviews generation** (`/api/reviews/generate/[bookingId]/route.ts:60-`): fetches booking, property, review_rules. Stores `aiContext` JSONB on the resulting `guest_reviews` row capturing what was passed in. Same hard-coded shape as messaging draft.
- **Pricing audit** (`/api/pricing/audit/[propertyId]?date=`): fetches signals breakdown + rules snapshot + auto-apply blocker explainer. This is the closest thing to "show the host what was used to make this decision" that exists, and it's pricing-only.
- **Dashboard command center** (`/api/dashboard/command-center`): pulls a bundle of pulse metrics + AI insight cards + properties — but the "insight cards" are heuristic strings, not retrieved memory.
- **Channex audit log** (`channex_outbound_log`, 17 rows): every non-GET Channex call lands a row with `payload_sample`, `response_status`, `response_body`, `payload_hash`. Pattern: write-side persistence so a future incident can be reconstructed.

### 4d. Sub-conclusion §4

The codebase has two retrieval-shaped flows: pricing engine (rich, multi-source, per-property scoped) and messaging draft (small, hand-coded, flat). Both bulk-fetch by entity_id and reason in-memory. **No vector search, no relevance ranking, no fact retrieval indirection.** The future memory layer's retrieval API is greenfield, but the *call sites that will consume it* (the engine, the draft route, the future agent loop) already have the retrieval-before-action shape — they'll just route through a memory abstraction instead of hard-coded SELECTs.

---

## 5. Schema design space for fresh memory architecture

### 5a. Conventions to follow (matched to current Supabase patterns)

Migration patterns observed in `supabase/migrations/`:
- Filenames: `YYYYMMDDhhmmss_description.sql`. Memory-system migrations would be `2026MMDDhhmmss_memory_*.sql`.
- Tables use snake_case names; columns snake_case.
- Primary keys: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`.
- FKs: `references properties(id) ON DELETE CASCADE` is the dominant pattern; `ON DELETE SET NULL` for soft attachments (e.g., `cleaning_tasks.cleaner_id`).
- Timestamps: `created_at timestamptz DEFAULT now()`, `updated_at timestamptz DEFAULT now()`. The codebase has a known issue (CLAUDE.md "Known Data Quality Issues") that `updated_at` is not auto-bumped on UPDATE — only routes that explicitly set it bump it. Memory tables should either (a) carry a BEFORE UPDATE trigger, or (b) be insert-only with an explicit `valid_from`/`valid_to` shape.
- RLS: `ALTER TABLE x ENABLE ROW LEVEL SECURITY;` + per-action policies. The dominant scoping pattern for property-scoped tables is:
  ```
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()))
  ```
- JSONB for flex shapes: `factors`, `signals`, `inferred_from`, `reason_signals`, `payload_sample`, `ai_context`, `subratings` are all JSONB. Memory's per-fact metadata (provenance, source, learned_from) fits naturally as JSONB.
- Drizzle schema declarations mirror migrations 1:1 in `src/lib/db/schema.ts`. Memory tables would need both.
- Service-role writes from API routes are common: `createServiceClient()` + `from("table").insert(...)` — RLS bypass is fine since the route checks ownership upstream via `getAuthenticatedUser()` + `verifyPropertyOwnership()`. Memory writes would follow the same pattern.

### 5b. Entity scopes memory should map to

Based on what's in the schema today:

| Entity | Scope key | Today's home | Memory candidates |
|---|---|---|---|
| Host (user) | `auth.uid()` | `auth.users`, `user_preferences`, `user_subscriptions` | Voice patterns, decision tendencies, communication style, business goals |
| Property | `properties.id` | `properties` + `property_details` | Operational quirks, hardware idiosyncrasies, neighborhood notes, vendor mix, seasonal behavior |
| Listing (per-channel) | `listings.id` | `listings` | Channel-specific quirks ("BDC guests always ask about…"), per-listing rate position |
| Booking | `bookings.id` | `bookings` | Per-stay anomalies — but most facts that look booking-scoped are really guest-scoped or property-scoped |
| Guest | **does not exist as an entity** | implicit columns on `bookings` | Preferences, history, relationships — would require introducing a `guests` table with `(id, email, phone, normalized_name, ...)` and resolving bookings into it |
| Channel (OTA channel) | `property_channels.id` | `property_channels` | Channel-level ops patterns (sync issues, support response times) |
| Vendor (cleaner) | `cleaners.id` | `cleaners` | Reliability patterns, quality history, special instructions |
| Sub-entity ("front_door", "dishwasher", "AC") | none — would need invention | nowhere | Belief 1 §1 hurricane-door example: facts scoped to a specific *part* of a property, not the property as a whole |

The Method document's hurricane-door example explicitly calls for sub-entity scoping ("the front door at Brickell, not 'doors in general'"). The current schema has no sub-entity layer — every fact about a property is property-scoped. A real memory system would need either: (a) `entity_id + entity_type` polymorphic scoping with sub-entity definitions, or (b) a `sub_entity` field on memory rows that's a free-text or controlled-vocab handle (e.g., `front_door`, `wifi_router`).

### 5c. Relationship to existing audit/log tables

The codebase has 5 tables in the audit/log family:

| Table | Rows | Direction | Purpose |
|---|---:|---|---|
| `channex_webhook_log` | 102 | inbound | Channex → Koast events; columns: `event_type, booking_id, channex_property_id, guest_name, check_in, check_out, payload jsonb, action_taken, ack_sent, ack_response, revision_id` |
| `channex_outbound_log` | 17 | outbound | Koast → Channex calls; columns include `endpoint, method, date_from, date_to, entries_count, payload_hash, payload_sample jsonb, response_status, response_body jsonb, error_message` |
| `notifications` | 0 | outbound | Notification audit log; columns: `type, recipient, message, channel, sent_at, created_at` (schema declared but currently no rows) |
| `sms_log` | 1 | outbound | Twilio SMS log; columns: `user_id, cleaner_id, cleaning_task_id, phone_to, message_body, twilio_sid, status` |
| `pricing_recommendations` | 209 | derived | Engine output log (status: pending/applied/dismissed); the closest thing to a host-decision audit |

These are all **append-only event streams**, not memory. Memory and audit logs serve different roles:
- Audit log answers *"what happened, when, with what payload"* — frozen records of events.
- Memory answers *"what is true about this entity right now, and what was the basis"* — current-state facts with supersession history.

The relationship: **memory facts are often derived from audit log events.** "Host applied a pricing recommendation 4 days in a row at >+8%" is an audit-log observation that compounds into a memory fact ("this host trusts engine recs of magnitude X under conditions Y, confidence rising"). Memory's lifecycle logic (extraction, supersession, decay) reads from the audit substrate but produces its own structured rows. Don't conflate the two.

### 5d. Likely shape of the memory tables (descriptive, not prescriptive)

A memory layer that fits Koast's conventions would naturally be 2-3 tables:

- **`memory_facts`** — current-state per-entity facts. Likely shape: `id, host_id, entity_type, entity_id, sub_entity_handle, attribute, value (text or jsonb), source ('host_taught'|'inferred'|'observed'), confidence numeric, learned_from_event_id, valid_from, superseded_by, created_at, updated_at`. RLS scoped through host_id.
- **`memory_extraction_events`** — append-only log of how facts were learned. `event_type, source_message_id, source_event_id, extracted_facts jsonb, llm_run_id, created_at`. Audit substrate.
- (Optional) **`memory_fact_history`** — superseded versions of `memory_facts` rows. Could be implicit via `superseded_by` self-FK on `memory_facts` instead of a separate table.

The hard schema decision: whether `value` is text vs jsonb vs typed columns per attribute. JSONB is flexible (matches `inferred_from`, `factors`, `signals` precedent) but loses type safety. The Method document's stricter examples (door unlock instruction) want text; the looser examples (guest preferences) want jsonb. Probably jsonb with a few typed columns for the common cases.

---

## 6. Export and auditability infrastructure

### 6a. What exists today

**Account export (Settings page)**: `src/app/(dashboard)/settings/page.tsx:264-317`. Two buttons:
- *Export All Data (JSON)* — `handleExportJson()` queries `properties` and `bookings` directly via the browser Supabase client, packages them in a JSON blob with `exportedAt` timestamp, downloads as `koast-export-YYYY-MM-DD.json`.
- *Export Bookings (CSV)* — `handleExportCsv()` queries `bookings`, builds CSV, downloads.

That's it. **No other export tooling.** No GDPR-grade portable export. No "everything Koast knows about this property" download. No memory dump (because there's no memory).

**Account delete**: `POST /api/settings/delete-account` — cascades through 16 scoped tables (mirrored at `/api/properties/[propertyId]` DELETE), best-effort Channex cleanup, then `auth.admin.deleteUser`. Comprehensive deletion; no portable archive on the way out.

**Audit/history**:
- `channex_webhook_log` (102 rows) — inbound event log with payload.
- `channex_outbound_log` (17 rows) — outbound API call log with payload sample + response.
- `notifications` (0 rows) — notification log scaffold.
- `sms_log` (1 row) — Twilio SMS log.
- `pricing_recommendations` (209 rows) — engine output log; `pricing_recommendations_latest` view collapses to most recent per (property, date).
- `pricing_outcomes` (44 rows) — booking-outcome log per applied recommendation.
- `pricing_performance` (probably 0-100 rows) — applied vs actual + revenue_delta.
- `messages` (90 rows) — messaging history; `messages.draft_status` carries lifecycle.
- `bookings.revision_number` — Channex booking revisions are tracked at the column level (no separate history table).

**Inspectability**: there's no "what does Koast know about this property" UI. The host can see calendar rates, pricing recommendations, messages, bookings — but each through its own surface. The pricing audit endpoint (`/api/pricing/audit/[propertyId]?date=`) is the most memory-like inspector — it surfaces signal breakdown + rules snapshot + auto-apply blocker reason for one date. There's nothing equivalent for messaging, reviews, or operations.

### 6b. Sub-conclusion §6

The audit infrastructure is **decent for write-side reconstruction** (Channex incidents can be replayed from `channex_outbound_log`) and **thin for read-side inspection** (the host can't browse what Koast knows). The export is two narrow buttons (JSON of properties+bookings, CSV of bookings) — adequate-but-not-comprehensive for portability today, **completely absent for memory** because there's no memory to export.

For Belief 3's commitment "the host can download everything Koast has accumulated about their operation — properties, memories, conversations, decisions, voice patterns — at any time, in a structured format they could theoretically use elsewhere": the memory dump is greenfield; the conversations dump (messages + threads) needs adding (today not exported); the decisions dump (recommendations + outcomes + applied/dismissed) needs adding. The properties+bookings dump is a starting shape.

---

## 7. Keep / rebuild / greenfield verdict

### Keep (foundations the memory layer can build on)

1. **Provenance-enum convention** (`source` columns on `pricing_rules`, `market_comps`; `comp_set_quality` on `properties`; `rate_source` on `calendar_rates`). The 3-tier `defaults`/`inferred`/`host_set` shape and the 4-tier `unknown`/`precise`/`fallback`/`insufficient` shape are good precedents for memory's provenance metadata. The future `memory_facts.source` enum should match this style. Confidence: high.
2. **`inferred_from` JSONB pattern** — packed `{ row_count, date_range, percentiles, computed_at }` inside the same row as the inferred values. Reusable as `memory_facts.learned_from` shape. Confidence: high.
3. **Confidence-weighted aggregation** (the engine's `weight × confidence + redistribute dropped weight` pattern from `comp_set_quality` consumption). Generalizes cleanly to memory: facts with low confidence get used at lower weight or surface as "I'm guessing, but…". Confidence: high.
4. **The `pricing_rules` row as a memory-backed config wrapper**. Keep the table as the safety guardrail (CHECK constraints, host-explicit auto_apply toggle); have memory feed the values. The mixed config/inferred/host-set lineage works. Confidence: high.
5. **`pricing_outcomes` + `pricing_recommendations`** — already the closest thing to "decision history substrate" the host has. The memory layer can read these to infer host decision patterns. Don't replace; extend. Confidence: high.
6. **`channex_outbound_log` audit pattern** — payload_sample JSONB + response_status + payload_hash. Memory's extraction-event log should follow the same shape. Confidence: high.
7. **RLS scoping convention** (`property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())`). Memory tables should follow the same pattern, scoped through `host_id` or through the entity_type+entity_id mapping. Confidence: high.
8. **Drizzle schema + migration discipline**. Every schema change is a migration + a Drizzle declaration update. Memory tables follow the same workflow. Confidence: high.
9. **`/api/pricing/audit/[propertyId]?date=` endpoint shape** — surfaces signal breakdown + rules + blocker reasons for one date. Generalizes naturally to `/api/memory/inspect/[entity_type]/[entity_id]` for the inspectability commitment. Confidence: medium-high.
10. **Service-role write pattern from API routes** + ownership checks (`getAuthenticatedUser`, `verifyPropertyOwnership`). Reusable verbatim for memory write routes. Confidence: high.

### Rebuild fresh (built for a different model — deprecate cleanly)

1. **`message_templates` + `message_automation_firings` workflow.** Time-anchored template firings with `{var}` substitution is a 2018-era guest-comm primitive; once the agent can compose voice-aware messages from memory + voice patterns, the editor surface and the executor go. Keep the idempotency-table *pattern* for any future "agent proposed an outbound, host approves" flow but drop these specific tables. Confidence: high.
2. **`review_rules`.** Per-property "tone" + "target keywords" config is a small instance of voice memory done badly. Replace with structured voice memory derived from the host's actual reviews. Confidence: high.
3. **`user_preferences` notification toggles JSONB.** Replace with operational memory (the agent learns the host's preferred notification cadence from interaction). Keep a tiny "do not notify" hard kill row if needed for safety. Confidence: medium-high.
4. **`property_details` table as it stands.** Keep the data shape (wifi/door_code/checkin_time/parking) but reshape: each field becomes a memory fact with provenance, supersession trail, and confidence. The 7-fields-flat-row shape is wrong for the agent. Confidence: high.
5. **Settings export buttons.** The "Export All Data (JSON)" button queries 2 tables client-side. Replace with a comprehensive, server-rendered, GDPR-grade portable archive that includes memory, conversations, decisions, voice patterns. Confidence: high.

### Greenfield (nothing close exists)

1. **The `memory_facts` table** itself + its supersession + decay logic. No precedent in the codebase. Confidence: high (in greenfield-ness).
2. **Fact-extraction worker** — a background job that reads new audit events (messages, applied/dismissed recommendations, OTA actions) and emits memory facts. Today the only worker that reads conversation context is the messaging executor, which doesn't extract — it renders. Confidence: high.
3. **Memory retrieval abstraction** for the agent loop — `getMemoryFor({ entity, intent, limit })`. The current retrieval pattern is hard-coded SELECTs in each route. Confidence: high.
4. **Guest entity** + entity resolution. Today guests are implicit columns on bookings. Real guest memory needs a `guests` table + a `(email, phone, normalized_name) → guest_id` resolver. Confidence: high.
5. **Sub-entity scoping** ("front_door at Brickell"). No precedent in the schema. Choices: polymorphic `entity_type+entity_id` columns, or a `sub_entity_handle` text/enum column on memory rows. Confidence: high.
6. **Memory inspector UI** ("show me everything Koast knows about Villa Jamaica"). Closest existing surface is the pricing audit endpoint, scoped to one date of one property. Generalization is greenfield. Confidence: high.
7. **Memory portability** — comprehensive export of every fact + the source events that produced it, in a structured format the host could theoretically take elsewhere. Greenfield. Confidence: high.
8. **Voice memory** — a learned representation of the host's writing style, fed into outgoing message generation. Today the messaging draft route flat-passes 20 recent messages; voice memory would produce summarized style guidance. Confidence: high.
9. **Confidence calibration loop** — facts gain/lose confidence based on whether they're used successfully. No mechanism today. Confidence: high.
10. **Decay/refresh logic** — staleness signals on facts that haven't been observed lately, refresh prompts to the host. No mechanism today. Confidence: high.

### Partial / "exists but for an adjacent purpose"

1. **`learnedDow` recompute pattern**. Today it's recomputed in-memory every engine run from raw outcomes. The *pattern* (read substrate → bucket → derive parameter) is the right shape; the lack of caching means the work is repeated. Memory layer would persist the result with provenance + decay metadata. Confidence: medium.
2. **`pricing_recommendations.reason_signals` JSONB** — already captures the engine's reasoning for one decision. Generalizes naturally to "agent's reasoning for one action" if the agent loop adopts the same shape. Don't copy verbatim — the agent's reasoning has tool calls, intermediate results, multi-turn structure that the engine doesn't — but the convention "store the reasoning in JSONB alongside the output" is solid. Confidence: medium.
3. **`/api/settings/delete-account` cascade** — comprehensive 16-table deletion. The reverse path (comprehensive export) needs the same level of completeness. The deletion route's table list is a useful template for the export route's table list. Confidence: medium.

### Headline

The codebase has **two narrow learning loops** (pricing percentiles, day-of-week conversion) and **a small set of "lineage" enums** that point at the shape memory should have. The actual memory layer — per-entity structured facts, confidence per fact, supersession trail, decay/refresh, agent retrieval, inspector UI, portability — is greenfield. The Belief 1 inventory's "config tables are config-shaped but mostly empty" finding combines with this one's "data substrate exists but no extraction layer" finding to a single conclusion: **the host's hosting knowledge has no home in the system today, and nothing in the schema accumulates over time except outcome logs.** Building memory is a fresh, sustained engineering investment — but it doesn't fight the existing schema, conventions, or audit-log patterns. The conventions the memory layer needs to follow are already in the codebase; the layer itself isn't.
