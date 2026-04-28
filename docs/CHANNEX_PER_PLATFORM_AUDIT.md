# Channex + per-platform rate audit

*Pre-Session 5a. Documentation only — no code or schema changes made here.*

## 1. Executive summary

**Per-platform rates are already supported, fully, in both storage and Channex push paths.** The Calendar sidebar redesign's core assumptions (a property can have different rates per channel; Koast stores these; Channex pushes the correct rate per channel; the sidebar can read the current per-channel rate) all hold today. The `/api/channels/rates/[propertyId]` endpoint (`src/app/api/channels/rates/[propertyId]/route.ts:1-80`) is the canonical surface — it GETs per-channel Channex state + DB overrides and POSTs per-channel overrides that push to the matching Channex rate plan. The `PerChannelRateEditor` component at `src/components/calendar/PerChannelRateEditor.tsx` already consumes it.

The only gap relative to the redesign brief: **pricing_recommendations carries a single `suggested_rate` per (property, date)**, not per-platform — and `/api/pricing/apply/[propertyId]/route.ts:248` hardcodes BDC as the sole target (`channels_pushed: ["booking_com"]`). Neither blocks the Calendar sidebar: the sidebar operates on `calendar_rates` + Channex live state, not on recommendations. The minimum work to ship the redesign is **0 schema migrations** and **0 new API surfaces** — just the UI that consumes the existing endpoint.

If the redesign also wants to surface "Koast recommendation → apply per-platform," that's a separate small extension on `/api/pricing/apply` (add a `target_channels: string[]` param) and is NOT required for the sidebar itself.

## 2. Current state

### 2.1 Schema

**`calendar_rates`** — the canonical rate table. Per-channel rates live here via `channel_code`.

- Base row: `channel_code IS NULL`. One per `(property_id, date)`.
- Channel override: `channel_code = 'ABB' | 'BDC' | 'VRBO' | 'DIRECT'` (upper-case).
- Unique index: `calendar_rates_prop_date_chan_unique ON (property_id, date, channel_code) NULLS NOT DISTINCT` — see `supabase/migrations/20260412010000_calendar_rates_per_channel.sql:22-25`.
- `rate_source` extended to `'manual' | 'engine' | 'override' | 'manual_per_channel'` (same migration, `:33-34`).
- Columns added for channel sync: `channel_code`, `channex_rate_plan_id`, `last_pushed_at`, `last_channex_rate` (`:11-14`).
- Read rules (from migration comment `:7-9`): "Readers that want the base rate must filter `channel_code IS NULL`. Readers that want the effective rate for a specific channel should look up the channel override first and fall back to the base rate."

**`property_channels`** — channel registration, keyed by `(property_id, channex_channel_id)`.

- Columns: `channel_code`, `channel_name`, `status`, `last_sync_at`, `settings jsonb` (holds `rate_plan_id`).
- Migration: `supabase/migrations/20260407080000_channel_manager.sql:3-16`.
- `settings.rate_plan_id` is the per-channel rate plan pointer into Channex. This is what maps `ABB → airbnb_rate_plan_id`, `BDC → bdc_rate_plan_id`, etc.

**`channex_rate_plans`** — cache of Channex rate plans (id, property_id, room_type_id, title, sell_mode, currency, rate_mode). Migration `20260407080000_channel_manager.sql:31-41`.

**`channex_room_types`** — cache of Channex room types. Same migration.

**`listings`** — per-platform listing metadata. `platform CHECK IN ('airbnb', 'vrbo', 'booking_com', 'direct')`, `UNIQUE(property_id, platform)`. Migration `supabase/migrations/001_initial_schema.sql:44-54`.

**`pricing_recommendations`** — engine output. Single `suggested_rate` per `(property, date)`. NO per-channel suggestion column. Post-dedup, a partial unique index enforces one pending row per `(property, date)` — see `supabase/migrations/20260419000000_pricing_recommendations_dedup.sql`.

**`pricing_performance`** — apply outcomes. `channels_pushed text[]` records which channels a given apply hit (`supabase/migrations/20260418000000_pricing_rules_and_performance.sql:53`). Currently written with `["booking_com"]` by the apply route.

Row counts on staging/production: **unverifiable without DB access from this environment.**

### 2.2 Channex client

`src/lib/channex/client.ts:590-625` — `getRestrictionsBucketed(propertyId, dateFrom, dateTo, fields)`: Channex returns `{ rate_plan_id: { "YYYY-MM-DD": { rate, availability, min_stay_arrival, stop_sell } } }`. One round-trip returns every rate plan on the property.

`src/lib/channex/client.ts:627-646` — `updateRestrictions(values[])`: each value is `{ property_id, rate_plan_id, date_from, date_to, rate, min_stay_arrival, stop_sell, ... }`. **Rate plan is scoped to a single channel** — that's Channex's per-channel write path. Different rates per channel per date are supported by sending different `rate_plan_id` values.

**Channex supports per-channel rates for the same room/date by design.** This is what rate plans exist for. There is no Channex-side constraint forcing uniform rates.

### 2.3 Rate write paths

#### `/api/pricing/apply/[propertyId]/route.ts`

- Reads `pricing_recommendations` (single `suggested_rate` per date), reads `property_channels` filtered to `channel_code = 'BDC'`, picks `settings.rate_plan_id` (`:119-124`).
- Builds `koastProposed: Map<date, { rate, availability: 1, stop_sell: false }>` — rate only (`:176-180`).
- Calls `buildSafeBdcRestrictions` (`src/lib/channex/safe-restrictions.ts:87`) which does a pre-flight read of BDC state and emits a plan that never clobbers host-managed BDC state.
- Pushes via `channex.updateRestrictions(batch)` in 200-entry batches (`:211-230`).
- **Writes `pricing_performance` with `channels_pushed: ["booking_com"]`** (`:248`) — hardcoded single channel.
- **Does NOT write `calendar_rates`.** The apply path is push-only; it updates `pricing_recommendations.status = 'applied'` and inserts `pricing_performance` but does not persist the rate into `calendar_rates` as a new row.

#### `/api/pricing/push/[propertyId]/route.ts`

This is the multi-channel push path and is distinct from `/apply`.

- Reads base rates from `calendar_rates` where `channel_code IS NULL` (`:70`).
- Reads per-channel overrides from `calendar_rates` where `channel_code IS NOT NULL` (`:88-93`).
- Resolves target rate plans from every active `property_channels` row that has `settings.rate_plan_id` set (`:120-138`).
- For each target:
  - BDC routes through `buildSafeBdcRestrictions` (`:170-200+`).
  - Non-BDC (Airbnb, Direct, Vrbo) uses direct push without pre-flight read (scoped decision from Track B PR A; Airbnb's clobber profile differs from BDC's).
- `channel_code` on the override row IS the per-platform key. The route already supports per-platform overrides end-to-end.

#### `/api/channels/rates/[propertyId]/route.ts` — the per-channel rate editor surface

- GET: returns `{ base, channels: ChannelBlock[], fetched_at, cache_hit }` where each `ChannelBlock` has `channel_code`, `channel_name`, `rate_plan_id`, and a `dates` map with per-date `{ rate, availability, min_stay_arrival, stop_sell, stored_rate, mismatch, source }` (`:50-65`).
- POST: `{ date_from, date_to, channel_code, rate, min_stay_arrival? }` — saves a `calendar_rates` override and pushes to the matching Channex rate plan.
- Consumed by `src/components/calendar/PerChannelRateEditor.tsx`.

This IS the surface the Calendar sidebar redesign should consume.

### 2.4 iCal sync — rate ingestion

`~/koast-workers/booking_sync.py:567-670` — the Airbnb iCal path reads `calendar_rates` (already written by other flows) to populate `pricing_outcomes`. It does **not** ingest rate data FROM iCal. iCal carries only availability + reservation data, not pricing. The worker never writes rate rows from iCal.

### 2.5 Rate validation — current_rate source

`~/koast-workers/pricing_validator.py:68-96` — `fetch_airbnb_live_rates` calls Channex's `/restrictions?filter[property_id]=…&filter[rate_plan_id]=<ABB plan>&filter[restrictions]=rate` and records the dollar rate per date. This is the value that populates `pricing_recommendations.current_rate`. It's **Airbnb-centric** (ABB rate plan only).

BDC "current rate" is NOT recorded anywhere as a first-class column today. It's read on-demand during a BDC apply via `getRestrictionsBucketed` inside `buildSafeBdcRestrictions`.

### 2.6 Stage 1 push (May 24, Villa Jamaica BDC hotel 12783847)

- Recommendation `5a18fb28-bd6b-4920-b491-ddcb8ef03abf` — **unverifiable from this environment** (no DB access). The expected trace is:
  1. Validator run writes rec row to `pricing_recommendations` with `current_rate` = Airbnb rate (from Channex ABB plan) and `suggested_rate` = `230`.
  2. User calls `POST /api/pricing/apply/bfb0750e-...` with `recommendation_ids: ["5a18fb28-..."]`.
  3. Route reads BDC `rate_plan_id` from `property_channels` where `channel_code = 'BDC'`.
  4. `buildSafeBdcRestrictions` pre-fetches BDC state, emits a plan with one `entries_to_push` row for the target date.
  5. `channex.updateRestrictions` POSTs `{ property_id, rate_plan_id: <BDC plan>, date_from, date_to, rate: 23000 (cents) }`.
  6. `pricing_performance` insert: `applied_rate=230, channels_pushed=["booking_com"], applied_at=<timestamp>`.
  7. `pricing_recommendations.status = 'applied'`.
- **Apply stored ONE row in `pricing_performance`** with a single-channel marker. **No row was written to `calendar_rates`.** The rate lives only in Channex / BDC now; Koast doesn't have a local copy of the applied BDC rate.

## 3. Gap analysis

| Assumption (Calendar redesign) | Current reality | Gap | Remediation cost |
|---|---|---|---|
| A property can have different rates per channel for the same date | Fully supported in `calendar_rates.channel_code` (NULL = base, non-NULL = override) and in Channex rate plans | None | 0 |
| Koast stores per-platform rates | Stored as `calendar_rates` overrides keyed on `(property_id, date, channel_code)` | None | 0 |
| Channex pushes the correct per-platform rate | `updateRestrictions` takes `rate_plan_id` — one plan per channel, one rate per plan | None | 0 |
| The sidebar can read current per-platform rate for any (property, date, platform) | `GET /api/channels/rates/[propertyId]?date_from=…&date_to=…` returns bucketed per-channel live rates + local overrides + mismatch flags | None | 0 |
| Recommendations are per-platform | `pricing_recommendations.suggested_rate` is scalar, not per-channel | Recs are portfolio-wide suggestions, not per-channel suggestions | Out of scope for sidebar — recs are a distinct feature surface |
| Applying a recommendation pushes to every connected channel | `/api/pricing/apply` pushes to BDC only; `channels_pushed: ["booking_com"]` is hardcoded | Apply is BDC-scoped by Track B Stage 1 design (safe-restrictions was scoped to BDC first) | Small: add `target_channels: ('booking_com'|'airbnb'|'direct')[]` param to `/api/pricing/apply` and iterate targets. Non-BDC targets skip the safe-restrictions pre-flight. ~1 session |
| Applying a rec persists the rate locally | Apply writes `pricing_performance` only; does not write `calendar_rates` | If the sidebar treats `calendar_rates` as the source of truth, applied BDC rates won't show up there until the next `/api/pricing/push` writes the override | Small: also upsert `calendar_rates` override with `channel_code = 'BDC'` at apply time, or have the sidebar read `pricing_performance` as a supplementary source. ~0.5 session |

## 4. Recommended path

**(a) Minimal — ship multi-platform UI writing one master rate until backend catches up.** Not applicable here. The backend is already per-platform; the UI would be artificially capping itself.

**(b) Incremental — ship the sidebar consuming `/api/channels/rates/[propertyId]` directly.** Recommended. No schema changes. No new APIs. The Calendar sidebar becomes a thin React layer over the existing per-channel editor API. `PerChannelRateEditor.tsx` is already a working reference. Any new "apply this recommendation to channels X, Y, Z" flow is a separate small feature — the sidebar-primary use case (editing per-channel rates) works today.

**(c) Full — migrate to per-platform-primary storage with backfill.** Overkill. The current `(property_id, date, channel_code)` model with `NULL` as base + non-NULL as override is already per-platform-primary from a write perspective. A "per-channel suggestion" column on `pricing_recommendations` is a separate conversation about recommendation granularity, not about storage.

**Recommendation: (b).** Call it done on storage + push; just consume the existing API in the UI.

## 5. Open questions

1. **Rec-to-channel mapping.** A single recommendation has one `suggested_rate` — do we want to push that same number to every connected channel (current `/api/pricing/push` behavior)? To BDC only (current `/api/pricing/apply` behavior)? To a host-selected subset? The Calendar sidebar redesign should clarify whether recs are portfolio-wide or per-channel.

2. **Apply → `calendar_rates` persistence.** Today `/api/pricing/apply` pushes to Channex and writes `pricing_performance` but skips `calendar_rates`. If the sidebar reads `calendar_rates` to show "current Koast-stored rate," applied recs won't round-trip until the next push. Should apply also upsert an override row? (My read: yes, but it's a deliberate question.)

3. **Direct booking rate parity.** `DIRECT` as a `channel_code` is accepted throughout, but no consumer surface actually edits Direct-channel rates. Does the sidebar need to treat Direct as a first-class per-platform rate or as a derived value (e.g., "Direct = base rate")?

4. **BDC `current_rate` capture.** `pricing_validator.py` only reads Airbnb live rates into `pricing_recommendations.current_rate`. BDC's live rate is fetched ephemerally during apply but never stored. Should the validator also cache BDC current rates so the sidebar can show them without a fresh Channex round-trip?

5. **Rate override semantics.** The schema comment says "readers that want the effective rate for a specific channel should look up the channel override first and fall back to the base rate." Is this the canonical fallback rule the sidebar enforces? Or does the sidebar show base + override side-by-side without auto-collapsing?

6. **Historical rec trace.** I couldn't verify rec `5a18fb28-bd6b-4920-b491-ddcb8ef03abf` from this environment. If you want a concrete trace, a one-liner on the VPS would resolve it: `SELECT * FROM pricing_recommendations WHERE id = '5a18fb28-bd6b-4920-b491-ddcb8ef03abf';` joined with `pricing_performance` on date+property.
