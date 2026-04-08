# Properties Page Redesign Plan

## Architectural Constraint

Channex requires properties to exist BEFORE channels can be connected. The flow is:
Property → Room Types → Rate Plans → Connect Channel → Map Listing

This means we can't do "connect Airbnb → import properties" directly. Instead:

**Approach: Auto-scaffold on connect**
1. User clicks "Connect Airbnb" on empty Properties page
2. We auto-create a default Channex property + room type + rate plan
3. Open Channex iframe for OAuth + mapping
4. After connection, pull listing details from Channex and update our property
5. Result: property appears with OTA data populated

For users who already have properties (like Villa Jamaica), the flow is simpler:
connect channel from property card → iframe → done.

## Implementation Plan

### 1. Sidebar Change
- Remove "Channels" from sidebar MANAGE section
- Properties page absorbs all channel functionality
- Sync Log moves to `/properties/sync-log` (sub-route)

### 2. New Properties Page Layout

**Empty state (no properties):**
```
┌─────────────────────────────────────────────────────────┐
│  Connect your properties                                │
│  Link your booking platforms to manage everything here   │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Airbnb   │  │Booking   │  │  VRBO    │              │
│  │   [A]    │  │  .com    │  │   [V]    │              │
│  │          │  │   [B]    │  │          │              │
│  │ Connect  │  │ Connect  │  │ Connect  │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│                                                         │
│  ── or ──                                               │
│                                                         │
│  [Add property manually]  [Import via iCal]             │
└─────────────────────────────────────────────────────────┘
```

**Properties list (has properties):**
```
┌─────────────────────────────────────────────────────────┐
│  Properties                    [+ Connect Platform]      │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 📷 Villa Jamaica                                  │   │
│  │ Tampa, FL · 4BR/2BA · 8 guests                   │   │
│  │ [Airbnb badge] [Active] · 12 bookings · $169 ADR │   │
│  │ Last sync: 3m ago                                 │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  [View Sync Log]                                        │
└─────────────────────────────────────────────────────────┘
```

### 3. Connect Flow (Auto-Scaffold)

When user clicks a platform card:
1. **Check for Channex property:** Does user have any Channex property?
   - Yes → use it, open iframe with that property
   - No → auto-create one:
     a. POST /api/v1/properties (title: "My Property", country: "US", city: "")
     b. POST /api/v1/room_types (title: "Entire Home", occ_adults: 4)
     c. POST /api/v1/rate_plans (title: "Standard Rate", per_room, $150)
     d. Save channex_property_id to our DB
2. **Generate token:** POST /api/channels/token/[propertyId]
3. **Open iframe:** redirect_to=/channels, channels=ABB
4. **On completion:** Refresh → pull channel data → update property with listing name

### 4. API Routes

**New:**
- POST /api/properties/auto-scaffold — creates Channex property + room type + rate plan, returns IDs
- GET /api/properties/[id]/channels — returns connected channels with listing details

**Keep (renamed route):**
- /api/channels/[propertyId] → keep as-is (used internally)
- /api/channels/token/[propertyId] → keep for iframe flow
- /api/channels/sync-log → move to /api/properties/sync-log

### 5. Component Changes

- New `PropertiesPage` component replaces current properties list
- Integrates platform connection cards from ChannelsOverview
- Property cards enhanced with OTA badges
- ConnectChannelWizard simplified (no separate /channels/connect page)
- Connection modal opens inline on Properties page

### 6. Migration Path

- Villa Jamaica already has Channex + Airbnb → shows correctly in new UI
- Old /channels route → redirect to /properties
- Old /channels/connect → redirect to /properties
- Sync Log accessible from property detail or settings
