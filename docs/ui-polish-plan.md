# UI Polish Plan — Pre-Launch

**Date:** 2026-04-08
**Goal:** Make every screen look like it belongs in a $50M SaaS product before inviting real hosts.

---

## 1. Sidebar & Navigation

### Current Structure
```
(no label)
  Dashboard        /
  Calendar         /calendar
  Inbox            /messages

MANAGE
  Properties       /properties
  Pricing          /pricing
  Channels         /channels
  Reviews          /reviews (badge)
  Turnover         /turnover

GROW
  Frontdesk        /frontdesk (placeholder)
  Market Explorer  /market-explorer
  Nearby Listings  /nearby-listings
  Comp Sets        /comp-sets
  Revenue Check    /revenue-check (external ↗)
```

### Recommended Changes

**Remove from sidebar:**
- **Frontdesk** — Placeholder "coming soon" page. Adds clutter and makes the product feel unfinished. Keep the page accessible via direct URL for waitlist, but don't advertise an unbuilt feature in the nav.

**Hide (not in sidebar, keep routes):**
- `/certification` and `/channex-certification` — Dev tools. Route should work for internal use but not appear in navigation.
- `/api/debug/channex-iframe` — Delete this route entirely before launch.

**Rename:**
- "Inbox" → "Messages" — Clearer for hosts. The icon is MessageCircle, label should match.
- "Turnover" → "Cleaning" — Hosts think in terms of "cleaning" not "turnover". Turnover is industry jargon.
- "Market Explorer" → "Market Intel" — Shorter, fits collapsed tooltip better.
- "Revenue Check" → "Revenue Tool" — Clearer purpose.

**Reorder — GROW section:**
- Move "Comp Sets" and "Nearby Listings" under Market Intel as sub-features (or fold them into Market Intel page as tabs). Three separate pages for market data is fragmented.

**Proposed new structure:**
```
(no label)
  Dashboard        /
  Calendar         /calendar
  Messages         /messages

MANAGE
  Properties       /properties
  Pricing          /pricing
  Channels         /channels
  Cleaning         /turnover
  Reviews          /reviews

GROW
  Market Intel     /market-explorer
  Nearby Listings  /nearby-listings
  Comp Sets        /comp-sets
  Revenue Tool     /revenue-check (external ↗)
```

**Bottom section (no change needed):**
- Settings icon + user avatar — works well.

---

## 2. Page-by-Page Audit

### Dashboard `/`
**Status: Ship-ready with minor polish**
- Smart actions, property cards, events bar, activity feed all work
- Cards use `rounded-xl shadow-sm` (different from rest of app which uses `rounded-lg border`)
- **Fix:** Align card style to `rounded-lg border border-[var(--border)]` OR decide Dashboard is the one place where elevated shadow cards are the pattern
- **Fix:** Loading skeleton exists — good
- **Fix:** Empty state redirects to onboarding — good

### Calendar `/calendar`
**Status: Ship-ready**
- 24-month continuous scroll with booking bars
- Good empty state with CTA
- No issues found

### Messages `/messages`
**Status: Needs polish**
- AI drafts work but no real messaging integration
- **Missing:** Empty state when no properties (currently shows empty tabs)
- **Missing:** Loading state while messages fetch
- **Fix:** Add "No messages yet" empty state with explanation that messaging requires Channex channel connection

### Properties `/properties`
**Status: Ship-ready**
- List view with photos, metadata, connection status
- Good empty state with CTA to add property
- Detail view (PropertyDetail) is the largest component (1,133 lines) — works but very dense

### Pricing `/pricing`
**Status: Ship-ready**
- Heatmap, signal breakdown, approve/push workflow
- Good empty state
- Uses `btn-primary-3d` class for visual depth on key buttons — intentional design choice

### Channels `/channels`
**Status: Ship-ready with minor fixes**
- OTA cards, room types, connection status all working
- **Fix:** Empty state when no Channex connection could be more helpful — link directly to property settings
- Connect wizard works end-to-end with Channex iframe

### Reviews `/reviews`
**Status: Needs polish**
- AI generation works, incoming/outgoing tabs
- **Missing:** No auth check at page level (client component)
- **Missing:** Loading state during initial data fetch
- **Fix:** Tab content can flash empty before data loads

### Cleaning (Turnover) `/turnover`
**Status: Needs polish**
- Kanban board works, SMS to cleaners works
- **Missing:** Empty state when no cleaning tasks — should guide user to enable auto-creation
- **Fix:** Auto-create cleaning tasks from Channex webhook bookings (currently only from iCal)

### Market Explorer `/market-explorer`
**Status: Ship-ready**
- Analytics, Leaflet map, demand forecast, revenue scenarios
- Comprehensive empty state with CTA
- Stat cards rebuilt inline instead of using StatCard component

### Nearby Listings `/nearby-listings`
**Status: Ship-ready**
- AirROI data with real Airbnb photos
- **Minor:** Empty state is minimal ("Add a property first") — should match other pages' empty state pattern

### Comp Sets `/comp-sets`
**Status: Ship-ready**
- Sortable table + map view
- **Minor:** Same minimal empty state issue

### Settings `/settings`
**Status: Needs polish**
- Preferences, account deletion work
- **Missing:** No loading state while user data fetches (can flash empty)
- **Fix:** Theme grid too cramped on mobile

### Onboarding `/onboarding`
**Status: Partially built — needs enforcement**
- 6-step wizard works: Welcome → Property → Calendar → Details → Messages → Done
- Not enforced at route level (only Dashboard redirects empty users)
- **Fix:** After completion, should set a flag so user isn't re-redirected
- **Fix:** No Channex connection step — should add for hosts who want OTA sync

---

## 3. Component Consistency Issues

### Card Styles (HIGH priority)
Two competing patterns exist:
1. **Border pattern:** `bg-neutral-0 rounded-lg border border-[var(--border)] p-6` — used by most components
2. **Shadow pattern:** `bg-neutral-0 rounded-xl shadow-sm` — used by DashboardClient

**Decision needed:** Pick one and apply everywhere. Recommendation: Use border pattern for data cards, shadow pattern for hero/summary cards.

### Button Styles (MEDIUM priority)
- Primary: `bg-brand-500 text-white rounded-lg hover:bg-brand-600` — consistent
- Some buttons add `btn-primary-3d` class for depth effect
- **Fix:** Apply `btn-primary-3d` to all primary action buttons (Run Engine, Push to OTAs, Connect Channel) or remove it entirely

### Padding Variance (MEDIUM priority)
Cards use p-3, p-4, p-5, p-6 inconsistently:
- **AnalyticsDashboard:** 18+ instances with mixed padding
- **TurnoverBoard:** p-3 and p-4 mixed
- **Fix:** Standardize: p-6 for full cards, p-4 for compact cards, p-3 for inline elements

### Loading States (HIGH priority)
Only DashboardClient has a proper loading skeleton. Every other page either:
- Shows "Loading..." text
- Shows nothing (blank flash)
- Doesn't handle loading at all

**Fix:** Create a shared `PageSkeleton` component and use it in every page's Suspense boundary.

### Empty States (HIGH priority)
5 different empty state patterns exist with different padding (p-6, p-12, p-16) and styling.

**Fix:** Create a shared `EmptyState` component:
```tsx
<EmptyState
  icon={Cable}
  title="No channels connected"
  description="Connect your first OTA to start syncing bookings."
  action={{ label: "Connect Channel", href: "/channels/connect" }}
/>
```

### StatCard Reuse (LOW priority)
`StatCard.tsx` exists but AnalyticsDashboard and PropertyDetail rebuild stat cards inline.
**Fix:** Replace inline stat cards with the shared component.

### Tables (LOW priority)
No shared table component. Each component builds tables differently.
**Fix:** Not worth extracting now — too many variations. Standardize styling but keep inline.

---

## 4. Missing UI Elements

### Must-add before launch:
1. **Loading skeletons** for Pricing, Channels, Reviews, Settings pages
2. **Empty states** for Messages, Cleaning, Channels (when no Channex)
3. **Error boundaries** — no page has error recovery UI. If an API call fails, user sees nothing.
4. **Favicon** — check if Koast favicon is set (beacon logo)
5. **Page titles** — check if `<title>` tags are set per page via metadata exports

### Nice to have:
1. **Breadcrumbs** on property detail and channel detail pages
2. **Keyboard shortcuts** — Cmd+K for search, Cmd+P for pricing
3. **Toast on page actions** — some actions don't show feedback
4. **Tooltips** on stat cards explaining what each metric means

---

## 5. Quick Wins (Biggest Visual Impact, Smallest Effort)

| Change | Impact | Effort | Files |
|--------|--------|--------|-------|
| Remove Frontdesk from sidebar | Feels more polished | 1 line | layout.tsx |
| Rename Turnover → Cleaning | More intuitive | 1 line | layout.tsx |
| Rename Inbox → Messages | Matches icon | 1 line | layout.tsx |
| Add empty states to Messages, Cleaning | No blank pages | 30 lines each | 2 pages |
| Standardize card padding to p-6 | Visual consistency | Find/replace | 5 components |
| Add loading skeleton to Pricing page | No blank flash | 20 lines | 1 page |
| Delete debug API route | Security | Delete file | 1 file |
| Hide certification pages from sidebar | Cleaner nav | Already hidden (not in sidebar) | N/A |

---

## 6. Recommended Implementation Order

### Wave 1: Sidebar & Navigation (30 min)
- Remove Frontdesk from sidebar
- Rename: Inbox→Messages, Turnover→Cleaning, Market Explorer→Market Intel
- Delete `/api/debug/channex-iframe` route

### Wave 2: Empty States (1 hour)
- Create shared `EmptyState` component
- Add to Messages, Cleaning, Channels, Nearby Listings, Comp Sets
- Standardize existing empty states to use the shared component

### Wave 3: Loading States (1 hour)
- Create shared `PageSkeleton` component
- Add to Pricing, Channels, Reviews, Settings, Cleaning pages
- Wrap in Suspense boundaries

### Wave 4: Card Consistency (1 hour)
- Standardize all cards to `rounded-lg border border-[var(--border)] p-6`
- Or explicitly define two tiers: summary cards (rounded-xl shadow) and data cards (rounded-lg border)
- Fix padding inconsistencies in AnalyticsDashboard and TurnoverBoard

### Wave 5: Polish Details (1 hour)
- Add page metadata (titles) to all pages
- Verify favicon is set
- Add error boundaries
- Fix mobile grid issues on Properties/New and Settings
- Test all pages at 375px width

---

## Summary

**Pages ready to ship:** Dashboard, Calendar, Properties, Pricing, Channels, Market Explorer, Nearby Listings, Comp Sets, Revenue Check, Cleaner Mobile (10/15)

**Pages needing polish:** Messages, Reviews, Cleaning, Settings, Onboarding (5/15)

**Pages to remove/hide:** Frontdesk (from sidebar), Certification (2 pages, already hidden)

**Biggest visual impact:** Sidebar cleanup + empty states + loading skeletons. These 3 changes will make the entire product feel complete and professional.
