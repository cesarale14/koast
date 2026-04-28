# Channel Manager — Implementation Plan

## Strategic Context

**Prime Directive check:** A native channel manager is the single biggest feature gap between Koast and production-ready PMS status. Every competing PMS (Hostaway, Guesty, Hospitable) has this. Without it, hosts can't manage their OTA connections from Koast, which means we're not their system of record — just a supplementary tool.

**Competitive analysis:**
- **Hostaway:** Channel manager is their core product. Clean UI, per-channel status cards, connection wizard. Weakness: no intelligent pricing built in.
- **Guesty:** Enterprise-grade multi-channel with deep mapping UI. Weakness: complex, expensive, designed for managers not individual hosts.
- **Hospitable (formerly Smartbnb):** Minimal channel management — mostly automation/messaging. Weakness: relies on iCal for many connections.
- **PriceLabs/Wheelhouse:** No channel management at all — they push rates and rely on PMS for connectivity.

**Koast advantage:** We combine channel management + 9-signal pricing + market intelligence in one product. A host connects their Airbnb, and we automatically price it, push rates, sync bookings, and show them market intelligence — all from one dashboard. No one else does this end-to-end.

---

## Architecture Overview

### Key Decision: Channex IFrame vs Native API

Channex offers two paths for channel management:

1. **IFrame embed** — Channex provides a pre-built UI at `app.channex.io/auth/exchange?oauth_session_key=TOKEN&app_mode=headless`. Quick to ship, handles all OTA-specific connection flows, mapping, and edge cases. Looks like Channex, not Koast.

2. **Native API (whitelabel)** — Use Channex Channel API endpoints directly. Full control over UX, matches our Emerald/Nunito design system. More work, but looks like a $50M SaaS product.

**Decision: Hybrid approach.**

- **Phase 1:** Use Channex IFrame for the actual OTA authentication step (OAuth redirects, credential entry, 2FA). This is the hardest part to build natively and each OTA has different auth flows. Embed it in a modal/drawer, styled to blend with our UI.
- **Phase 2+:** Build everything else natively — channel overview, mapping, availability, rates, sync log. All using Channex API + our design system.
- **Phase 3 (future):** Replace IFrame auth with fully native flows for top-3 OTAs (Airbnb, Booking.com, VRBO) using Channex API directly.

This is what Hostaway and Guesty both do — they use the channel manager's iframe for OTA auth but wrap everything else in their own UI.

### Data Flow

```
Koast UI
    │
    ├── Channel Overview ──── GET /api/v1/properties (Channex)
    │                         GET room_types, rate_plans, channels
    │
    ├── Connect Channel ───── POST /api/v1/auth/one_time_token → IFrame
    │                         IFrame handles OTA auth + initial mapping
    │
    ├── Channel Mapping ───── GET /api/v1/room_types (Channex)
    │                         GET /api/v1/rate_plans (Channex)
    │                         Channel mapping via IFrame or API
    │
    ├── Availability ──────── GET /api/v1/availability (Channex)
    │                         POST /api/v1/availability (Channex)
    │                         Merged with local calendar_rates
    │
    ├── Rates ─────────────── GET /api/v1/restrictions (Channex)
    │                         POST /api/v1/restrictions (Channex)
    │                         Pricing engine → push to channels
    │
    └── Sync Log ──────────── channex_webhook_log (local DB)
                              channex_sync_state (local DB)
                              Channel actions log (Channex API)
```

### Caching Strategy

- **Channel list & status:** Cache in local DB (`property_channels` table), refresh on page load + after any mutation. TTL: 5 minutes.
- **Room types & rate plans:** Already partially cached in Channex client. Add local `channex_room_types` and `channex_rate_plans` tables for fast rendering.
- **Availability/rates:** Always fetch fresh from Channex — these change frequently. Merge with local `calendar_rates` for the unified view.
- **Sync log:** Local `channex_webhook_log` table — already exists, just need better UI.

---

## Database Changes

### New Tables

```sql
-- Tracks connected OTA channels per property
CREATE TABLE property_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  channex_channel_id text NOT NULL,      -- Channex channel connection UUID
  channel_code text NOT NULL,            -- e.g. "ABB" (Airbnb), "BDC" (Booking.com), "VRBO"
  channel_name text NOT NULL,            -- Human readable: "Airbnb", "Booking.com"
  status text NOT NULL DEFAULT 'active', -- active, inactive, error, pending
  last_sync_at timestamptz,
  last_error text,
  settings jsonb DEFAULT '{}',           -- Channel-specific config
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, channex_channel_id)
);

-- Cache Channex room types locally for fast rendering
CREATE TABLE channex_room_types (
  id text PRIMARY KEY,                   -- Channex room type UUID
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  channex_property_id text NOT NULL,
  title text NOT NULL,
  count_of_rooms integer DEFAULT 1,
  occ_adults integer DEFAULT 2,
  occ_children integer DEFAULT 0,
  cached_at timestamptz DEFAULT now()
);

-- Cache Channex rate plans locally
CREATE TABLE channex_rate_plans (
  id text PRIMARY KEY,                   -- Channex rate plan UUID
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_type_id text NOT NULL,            -- Channex room type UUID
  title text NOT NULL,
  sell_mode text DEFAULT 'per_room',
  currency text DEFAULT 'USD',
  rate_mode text DEFAULT 'manual',
  cached_at timestamptz DEFAULT now()
);
```

### Column Additions

```sql
-- Add channel sync metadata to existing tables
ALTER TABLE properties ADD COLUMN IF NOT EXISTS channex_sync_enabled boolean DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS channel_count integer DEFAULT 0;
```

---

## Page-by-Page Breakdown

### Sidebar Placement

Add "Channels" under the MANAGE section, between "Pricing" and "Reviews":

```
MANAGE: Properties, Pricing, Channels, Reviews, Turnover
```

Icon: `Cable` or `Share2` from Lucide (represents connections/distribution).

---

### Page 1: Channels Overview (`/channels`)

**Purpose:** See all connected OTAs at a glance across all properties. This is the "command center" for distribution.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  Channels                              [+ Connect OTA]  │
│  Manage your distribution across booking platforms       │
├─────────────────────────────────────────────────────────┤
│  ┌─ Property Selector (if multi-property) ──────────┐   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ Channel Card: Airbnb ──────────────────────────┐   │
│  │  🟢 Connected  •  Last sync: 3m ago             │   │
│  │  Listing: "Stunning 4BR Villa Jamaica"           │   │
│  │  Rates: $160-$200/night  •  Avail: 412/500 days │   │
│  │  [Manage Mapping]  [Full Sync]  [Deactivate]     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ Channel Card: Booking.com ─────────────────────┐   │
│  │  🟡 Pending Mapping  •  Connected 2h ago        │   │
│  │  Property ID: 12345678                           │   │
│  │  [Complete Mapping]  [Remove]                    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ Channel Card: VRBO ───────────────────────────┐    │
│  │  ⚪ Not Connected                               │   │
│  │  [Connect VRBO →]                               │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ Available Channels ───────────────────────────┐    │
│  │  Expedia  •  Agoda  •  Trip.com  •  +25 more   │   │
│  │  [Browse All Channels]                          │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Channex API calls:**
- `GET /api/v1/properties` — get Channex property with channel relationships
- Local DB: `property_channels` for cached status
- `GET /api/v1/room_types?filter[property_id]=X` — room type summary
- `GET /api/v1/rate_plans?filter[property_id]=X` — rate plan summary

**Key UX details:**
- Status badges: green (active), yellow (pending/mapping needed), red (error), gray (inactive)
- Each card shows: channel logo, connection status, listing name, rate range, availability summary
- Quick actions: Full Sync, Deactivate/Activate, Remove
- "Not connected" cards for top-3 OTAs always visible as CTAs

---

### Page 2: Connect Channel Flow (`/channels/connect`)

**Purpose:** Step-by-step wizard to connect a new OTA.

**Step 1 — Choose Channel:**
Grid of available OTA logos with names. Top row: Airbnb, Booking.com, VRBO. Below: Expedia, Agoda, Trip.com, etc.

**Step 2 — Prerequisites:**
Channel-specific instructions:
- Airbnb: "You'll be redirected to Airbnb to authorize. Make sure you're logged into the correct account."
- Booking.com: "First, go to your Booking.com extranet → Account → Connectivity Provider → Search 'Channex' → Accept terms. Then come back here."
- VRBO: "Enter your VRBO username and password. Disconnect any other channel managers first."

**Step 3 — Connect (IFrame):**
Channex IFrame opens in a styled modal/drawer:
```
POST /api/v1/auth/one_time_token → get token
Open: app.channex.io/auth/exchange?oauth_session_key={token}
      &app_mode=headless
      &redirect_to=/channels
      &property_id={channex_property_id}
      &available_channels={channel_code}
```

The IFrame handles the OTA-specific auth flow (OAuth for Airbnb, credential entry for VRBO, hotel ID for Booking.com).

**Step 4 — Map & Activate:**
After connection, redirect to mapping page. Show room type/rate plan mapping interface.

**New API routes:**
- `POST /api/channels/token` — generates Channex one-time token for IFrame
- `POST /api/channels/sync-status/[propertyId]` — refreshes local channel cache from Channex

**Channex API calls:**
- `POST /api/v1/auth/one_time_token` — { property_id, username }

---

### Page 3: Channel Mapping (`/channels/[channelId]/mapping`)

**Purpose:** Map Koast room types and rate plans to OTA listings.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  Airbnb Mapping — Villa Jamaica                         │
├───────────────────────┬─────────────────────────────────┤
│  OTA Listing          │  Koast Room & Rate        │
├───────────────────────┼─────────────────────────────────┤
│  "Stunning 4BR Villa" │  Room: Entire Home - Standard   │
│  Listing #12345       │  Rate: Standard BAR ($160-200)  │
│                       │  [Change ▾]                     │
├───────────────────────┼─────────────────────────────────┤
│  (No more listings)   │  Room: Entire Home - Premium    │
│                       │  Rate: Premium BAR ($185-225)   │
│                       │  ⚠️ Not mapped to any listing   │
└───────────────────────┴─────────────────────────────────┘
│  [Save Mapping]  [Open in Channex]                      │
└─────────────────────────────────────────────────────────┘
```

**For Phase 1:** Use Channex IFrame for the actual mapping interaction (it handles the OTA-specific mapping UI). Wrap it in our styled container.

**For Phase 2+:** Build native mapping UI using `GET /api/mapping_details` endpoint.

---

### Page 4: Availability Manager (`/channels/availability`)

**Purpose:** Visual calendar showing availability across all channels. Push/pull availability.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  Availability Manager          [Property ▾]  [Refresh]  │
├─────────────────────────────────────────────────────────┤
│  April 2026                                             │
│  ┌───┬───┬───┬───┬───┬───┬───┐                         │
│  │Mo │Tu │We │Th │Fr │Sa │Su │                         │
│  │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │                        │
│  │ ✓ │ ✓ │ ✓ │ ✗ │ ✗ │ ✗ │ ✓ │  ← booked/available   │
│  │ABB│ABB│ABB│   │   │   │ABB│  ← channel source       │
│  └───┴───┴───┴───┴───┴───┴───┘                         │
│                                                         │
│  Channel Sync Status:                                   │
│  🟢 Airbnb: In sync (3m ago)                           │
│  🟢 Booking.com: In sync (5m ago)                      │
│  🔴 VRBO: 2 dates out of sync                          │
│                                                         │
│  [Push All to Channels]  [Pull from Channels]           │
└─────────────────────────────────────────────────────────┘
```

**Data merge:** Combine local `calendar_rates` (our source of truth) with Channex availability data to show discrepancies.

**Channex API calls:**
- `GET /api/v1/availability?filter[property_id]=X&filter[date][gte]=Y&filter[date][lte]=Z`
- `POST /api/v1/availability` — push corrections

---

### Page 5: Rates Manager (`/channels/rates`)

**Purpose:** See rate parity across channels. Push pricing engine rates to OTAs.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  Rate Parity                   [Property ▾]  [30 days]  │
├─────────────────────────────────────────────────────────┤
│  Date    │ Engine │ Applied │ Airbnb │ BDC  │ VRBO     │
│  Apr 7   │ $185   │ $180    │ $180   │ $180 │ $180     │
│  Apr 8   │ $175   │ $170    │ $170   │ $170 │ ⚠️ $165  │
│  Apr 9   │ $190   │ $185    │ $185   │ $185 │ $185     │
│  ...     │        │         │        │      │          │
├─────────────────────────────────────────────────────────┤
│  ⚠️ 3 rate parity issues found                         │
│  [Push All Engine Rates]  [Fix Parity Issues]           │
└─────────────────────────────────────────────────────────┘
```

**Key feature:** Rate parity detection — compare our `applied_rate` with what Channex has pushed to each channel. Flag discrepancies.

**Channex API calls:**
- `GET /api/v1/restrictions?filter[property_id]=X&filter[date][gte]=Y&filter[date][lte]=Z&filter[restrictions]=rate`
- `POST /api/v1/restrictions` — push rate corrections

**Integration with pricing engine:** The "Push All Engine Rates" button calls our existing `/api/pricing/push/[propertyId]` which already handles the Channex rate push.

---

### Page 6: Sync Log (`/channels/log`)

**Purpose:** Real-time feed of all channel sync activity for debugging and trust.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  Sync Log                      [Property ▾]  [Filter ▾] │
├─────────────────────────────────────────────────────────┤
│  🟢 2m ago  │ Webhook   │ New booking via Airbnb        │
│             │           │ Guest: John Smith, Apr 15-18   │
│  🟢 5m ago  │ Rate Push │ 90 dates pushed to Channex    │
│             │           │ Range: $155-$220               │
│  🟡 15m ago │ Poll      │ 0 unacknowledged revisions    │
│  🟢 1h ago  │ Webhook   │ Booking modified via BDC      │
│             │           │ Guest: Jane Doe, dates changed │
│  🔴 2h ago  │ Webhook   │ ACK failed for rev abc123     │
│             │           │ Retried via poll: ✓            │
└─────────────────────────────────────────────────────────┘
```

**Data sources:**
- `channex_webhook_log` — all webhook events + poll events
- `channex_sync_state` — poll timestamps and counts
- Channex Actions Log API (if available) — push confirmations

**Filters:** By event type (webhook, poll, rate push, availability push), by channel, by date range, by status (success, error).

---

## New API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/channels/[propertyId]` | GET | List connected channels for a property |
| `/api/channels/[propertyId]` | POST | Refresh channel cache from Channex |
| `/api/channels/token/[propertyId]` | POST | Generate Channex one-time token for IFrame |
| `/api/channels/[propertyId]/availability` | GET | Get merged availability (local + Channex) |
| `/api/channels/[propertyId]/rates` | GET | Get rate parity data across channels |
| `/api/channels/[propertyId]/sync` | POST | Trigger full sync to all channels |
| `/api/channels/[propertyId]/log` | GET | Paginated sync log from channex_webhook_log |

---

## Integration with Existing Infrastructure

### Booking Sync (booking_sync.py)
No changes needed. The revision poller already processes all booking events. Channel manager adds visibility into what the poller does.

### Webhook Handler (/api/webhooks/channex)
No changes needed. Webhook events already logged to `channex_webhook_log`. Sync Log page just reads this table.

### Pricing Engine Push
Existing `/api/pricing/push/[propertyId]` already pushes rates to Channex. Rates Manager page adds visibility and parity checking.

### Full Sync (certification-runner)
Existing full sync logic moves from certification-runner to a proper `/api/channels/[propertyId]/sync` endpoint. The certification runner keeps working for testing.

---

## Channex Client Additions

New methods needed in `src/lib/channex/client.ts`:

```typescript
// IFrame authentication
async generateOneTimeToken(propertyId: string): Promise<string>

// Channel management (whitelabel API)
async listChannels(propertyId: string): Promise<Channel[]>
async activateChannel(channelId: string): Promise<void>
async deactivateChannel(channelId: string): Promise<void>
async removeChannel(channelId: string): Promise<void>
async fullSyncChannel(channelId: string): Promise<void>

// ARI reads (for parity checking)
async getRestrictions(propertyId: string, dateFrom: string, dateTo: string, 
                      restrictions?: string[]): Promise<RestrictionData>
// getAvailability already exists
```

---

## Phased Rollout

### Phase 1: Foundation (ship first)
**Timeline target: 1-2 weeks**

- [ ] Database migrations (property_channels, channex_room_types, channex_rate_plans)
- [ ] Channex client: `generateOneTimeToken`, `listChannels`
- [ ] `/channels` overview page — channel cards with status
- [ ] `/channels/connect` — channel selection + Channex IFrame in modal
- [ ] `/channels/log` — sync log from channex_webhook_log
- [ ] Sidebar: add "Channels" under MANAGE
- [ ] API routes: `/api/channels/[propertyId]`, `/api/channels/token/[propertyId]`

**Why first:** This gives hosts a visible channel management UI and the ability to connect new OTAs. The sync log builds trust by showing "here's everything happening with your channels."

### Phase 2: Visibility & Control
**Timeline target: 1-2 weeks after Phase 1**

- [ ] `/channels/availability` — availability calendar with cross-channel view
- [ ] `/channels/rates` — rate parity table
- [ ] Channel mapping via IFrame (embedded in our UI)
- [ ] Full sync button per channel (uses existing full sync logic)
- [ ] Activate/deactivate channel controls
- [ ] Cache room types and rate plans locally

### Phase 3: Intelligence Layer
**Timeline target: 2-4 weeks after Phase 2**

- [ ] Rate parity alerts (notify host when rates diverge across channels)
- [ ] Auto-push pricing engine rates to channels on approval
- [ ] Channel performance metrics (bookings per channel, revenue per channel)
- [ ] Native mapping UI (replace IFrame for mapping)
- [ ] Channel health monitoring with error recovery suggestions

### Phase 4: Production Migration (separate track)
- [ ] Switch CHANNEX_API_URL from staging.channex.io to app.channex.io
- [ ] Connect Villa Jamaica to production Channex
- [ ] Connect to real Airbnb, Booking.com, VRBO listings
- [ ] Verify webhook endpoint receives production events

---

## Design Guidelines

- Channel logos: Use official SVGs for Airbnb, Booking.com, VRBO, Expedia at 24x24px
- Status colors: emerald-500 (active), amber-500 (pending), red-500 (error), neutral-400 (inactive)
- Cards: `card-elevated` style with shadow, rounded-xl, 24px padding
- IFrame modal: Full-height drawer from right side, 480px wide, with Koast header bar
- Rate parity: Green = matched, amber = <5% difference, red = >5% difference
- Sync log: Real-time feel with relative timestamps ("3m ago"), auto-refresh every 30s
- Font: Nunito Variable throughout, monospace for prices/IDs
