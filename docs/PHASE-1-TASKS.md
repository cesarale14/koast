# Phase 1: Foundation Reset — Task Breakdown

Each task is scoped to be executable as a single Claude Code prompt.

---

## 1. Data Cleanup

### Task 1.1: Clean database
- Delete all scaffold/test properties from Channex + local DB
- Reset channex_sync_state
- Ensure only real user-imported properties remain
- Verify with queries

### Task 1.2: Clean Channex production
- Remove unused scaffolds from Airbnb channel properties array
- Delete orphaned Channex properties (where possible — 422 on mapped ones is OK)
- Document what remains and why

---

## 2. New Onboarding Flow

### Task 2.1: Create listing URL parser utility
**File:** `src/lib/listing-url-parser.ts`
- Input: "https://www.airbnb.com/rooms/1240054136658113220"
- Output: `{ platform: "airbnb", listingId: "1240054136658113220" }`
- Support: Airbnb (airbnb.com/rooms/{id}), Booking.com, VRBO URLs
- Handle: query params, trailing slashes, mobile URLs, shortened links

### Task 2.2: Build listing details fetcher
**File:** `src/lib/listing-details.ts`
- Already have `/api/airbnb/listing-details` — generalize to a shared utility
- Input: platform + listingId
- Output: `{ name, shortName, photoUrl, location }`
- Caching: in-memory Map for repeated calls
- Retry: 3 attempts with User-Agent rotation
- Fallback: `"Airbnb Listing {id}"` + null photo

### Task 2.3: Rebuild the Add Property flow
**File:** `src/components/dashboard/PropertiesPage.tsx` — rewrite AddPropertyModal

**New 4-step flow:**

Step 1 — Choose Platform:
- Airbnb, Booking.com, VRBO cards with logos
- "Add manually" greyed out

Step 2 — Enter Listing URL:
- Single input: "Paste your listing URL"
- On paste/blur: parse URL → extract listing ID → fetch details
- Show preview card: photo + name (editable) + platform badge
- "Next" button

Step 3 — Import Bookings (optional):
- iCal URL input: "Paste your calendar export URL"
- Helper: "How to find this" expandable with platform-specific instructions
- "Skip for now" link
- "Import" button

Step 4 — Success:
- Property card preview
- Booking count (if iCal provided)
- "Add Another" / "Done" buttons

**No Channex iframe anywhere.**

### Task 2.4: Build the import API
**File:** Rewrite `src/app/api/properties/import/route.ts`

New single-purpose endpoint: POST /api/properties/import
```json
{
  "platform": "airbnb",
  "listing_id": "1240054136658113220",
  "listing_url": "https://www.airbnb.com/rooms/...",
  "custom_name": "Villa Jamaica",  // optional
  "ical_url": "https://www.airbnb.com/calendar/ical/..."  // optional
}
```

Flow:
1. Fetch listing details (name, photo) if no custom_name
2. Create property in DB (name, photo, city from OG tags, platform)
3. Create listings record (platform, listing_id)
4. If ical_url: save to ical_feeds, trigger immediate sync
5. Return: `{ property: { id, name, photo_url, booking_count } }`

No Channex scaffolding. No channel connections. Pure iCal import.

### Task 2.5: Fix Dashboard redirect
**File:** `src/components/dashboard/DashboardClient.tsx`
- Already redirects to /properties (done)
- Verify it works with the new onboarding flow

---

## 3. Design System Standardization

### Task 3.1: Card style audit + fix
**Files:** All dashboard components

Standardize ALL cards to:
```
bg-white rounded-xl shadow-sm p-6
```

No borders (remove `border border-[var(--border)]`).
No `rounded-lg` (use `rounded-xl` everywhere).

Files to update:
- `PricingDashboard.tsx` — stat cards, calendar, side panel
- `PropertyDetail.tsx` — all card sections
- `AnalyticsDashboard.tsx` — stat cards, charts, comp table
- `TurnoverBoard.tsx` — kanban columns, task cards
- `UnifiedInbox.tsx` — conversation list, message panel
- `SyncLogDashboard.tsx` — log entries
- `DashboardClient.tsx` — already uses rounded-xl (reference)

### Task 3.2: Loading skeleton audit
**Files:** All `loading.tsx` files

Verify every route has a `loading.tsx`:
- `/(dashboard)/loading.tsx` — exists?
- `/(dashboard)/pricing/loading.tsx` — ✓ (migrated)
- `/(dashboard)/channels/loading.tsx` — ✓
- `/(dashboard)/turnover/loading.tsx` — ✓
- `/(dashboard)/messages/loading.tsx` — ✓
- `/(dashboard)/market-explorer/loading.tsx` — ✓
- `/(dashboard)/reviews/loading.tsx` — create
- `/(dashboard)/comp-sets/loading.tsx` — create
- `/(dashboard)/nearby-listings/loading.tsx` — create
- `/(dashboard)/settings/loading.tsx` — create

### Task 3.3: Empty state audit
**Files:** All page server components

Verify every page uses the shared EmptyState component:
- Dashboard — redirects to /properties (OK)
- Calendar — ✓
- Messages — ✓
- Properties — ✓ (custom empty state)
- Pricing — ✓
- Reviews — ✓
- Cleaning — ✓
- Market Intel — ✓
- Nearby Listings — ✓
- Comp Sets — ✓

### Task 3.4: Remove page background border
**File:** `src/app/globals.css`

If page-level cards have borders from CSS variables, update to borderless.

---

## 4. Sidebar Cleanup

### Task 4.1: Final sidebar structure
**File:** `src/app/(dashboard)/layout.tsx`

```typescript
const navGroups: NavGroup[] = [
  {
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Calendar", href: "/calendar", icon: CalendarDays },
      { name: "Messages", href: "/messages", icon: MessageCircle },
    ],
  },
  {
    label: "MANAGE",
    items: [
      { name: "Properties", href: "/properties", icon: Home },
      { name: "Pricing", href: "/pricing", icon: DollarSign },
      { name: "Reviews", href: "/reviews", icon: Star },
      { name: "Cleaning", href: "/turnover", icon: SprayCan },
    ],
  },
  {
    label: "GROW",
    items: [
      { name: "Market Intel", href: "/market-explorer", icon: Map },
      { name: "Nearby Listings", href: "/nearby-listings", icon: MapPin },
      { name: "Comp Sets", href: "/comp-sets", icon: GitCompare },
    ],
  },
];
```

Remove: Revenue Tool (keep /revenue-check as standalone public page).
Remove: Review badge (badge: true) — clutters the sidebar.

---

## 5. Fix Broken Pages

### Task 5.1: Fix RLS-related query issues
Multiple pages use `createClient()` (auth client) which fails on Vercel due to RLS.

Pattern: Switch to `createServiceClient()` for data queries on pages where user is already verified via initial properties query.

Pages to audit:
- `/pricing/page.tsx` — check bookings/rates queries
- `/turnover/page.tsx` — check cleaning tasks query
- `/reviews/page.tsx` — check reviews query
- `/messages/page.tsx` — check messages query
- `/market-explorer/page.tsx` — check market data queries

### Task 5.2: Remove dead routes
- Delete `/analytics/page.tsx` (redirect to market-explorer)
- Delete `/bookings/page.tsx` (redirect to properties)
- Delete `/certification/page.tsx` (dev tool)
- Delete `/channex-certification/page.tsx` (dev tool)
- Keep `/channels/sync-log/page.tsx` (accessible from Settings)
- Keep `/frontdesk/page.tsx` (coming soon placeholder, but not in sidebar)

### Task 5.3: Remove unused API routes
- Delete `/api/debug/*`
- Delete `/api/channex/certification/*` — dev tools
- Keep `/api/channex/certification-runner/route.ts` for internal testing only

---

## 6. Property Detail Page Polish

### Task 6.1: Fix Connected Platforms
**File:** `src/app/(dashboard)/properties/[id]/page.tsx`
- Already fixed to read from property_channels as fallback ✓
- Verify listings table records exist for all properties

### Task 6.2: Add iCal management to Settings tab
**File:** `src/components/dashboard/PropertyDetail.tsx`
- Settings tab should show: current iCal feeds with sync status
- "Add iCal Feed" button → platform selector + URL input
- "Remove" button per feed
- Last synced timestamp
- Error status if sync failed

---

## 7. Mobile Responsiveness Pass

### Task 7.1: Sidebar mobile
- Already has hamburger menu ✓
- Verify all new pages work with collapsed sidebar

### Task 7.2: Property cards mobile
- Cards should be full-width on mobile (grid-cols-1)
- Already using responsive grid ✓

### Task 7.3: Calendar mobile
- Horizontal scroll on mobile
- Verify touch interactions work

---

## 8. Verification Checklist

After Phase 1, verify:
- [ ] New user signup → lands on /properties → sees "Add your first property"
- [ ] Paste Airbnb URL → preview card shows name + photo
- [ ] Paste iCal URL → bookings sync immediately
- [ ] Property appears on /properties with photo, Airbnb badge, bookings
- [ ] Calendar shows booking bars for the property
- [ ] Dashboard shows stats (occupancy, upcoming check-ins)
- [ ] Pricing page shows suggested rates
- [ ] All pages have loading skeletons
- [ ] All empty states guide user to take action
- [ ] Cards are consistent (rounded-xl, shadow-sm, no borders)
- [ ] Mobile: sidebar collapses, cards stack, calendar scrolls
- [ ] No scaffold junk anywhere (no "Pending Setup", "SC-Scaffold")
- [ ] No Channex iframe in the onboarding flow
- [ ] VPS workers running (booking_sync, pricing, market)
