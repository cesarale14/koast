# StayCommand — Master Rebuild Plan

**Date:** 2026-04-09
**Goal:** Transform StayCommand from prototype to production PMS that competes with Hospitable, Hostaway, and Guesty.

---

## Architecture Principle: Two-Tier System

### Tier 1 — iCal Onboarding (Free, zero friction)
- Host adds property by pasting Airbnb/BDC/VRBO listing URL
- Extract listing ID → fetch name + photo from OG tags
- Paste iCal export URL → bookings sync in seconds
- Property functional within 60 seconds
- This is the FREE tier experience

### Tier 2 — Channex Power Features (Pro $79/mo, Business $149/mo)
- Two-way rate pushing (9-signal engine → OTAs)
- Two-way availability sync (no double bookings)
- Real-time booking webhooks (instant vs 15-min polling)
- Multi-channel distribution (50+ OTAs)
- Guest messaging through OTA platforms
- Revenue tracking with real pricing data

---

## Complete Feature Spec

### 1. Onboarding Flow (new user's first 2 minutes)

**Step 1:** Welcome — "Let's add your first property"
**Step 2:** Choose platform — Airbnb, Booking.com, VRBO logos
**Step 3:** Enter listing URL — single input: "Paste your Airbnb listing URL"
  - Extract listing ID from URL
  - Auto-fetch: property name, photo, location from OG tags
  - Show preview card instantly
**Step 4:** Import bookings — "Paste your calendar export URL" (optional)
  - If provided: sync immediately, show count
  - If skipped: "Add later from property settings"
**Step 5:** Success — Property card with photo, name, bookings

**NO Channex iframe in onboarding.** Channex connection is a Pro feature in Settings.

### 2. Dashboard

- **Stats row:** Revenue (est.), Occupancy %, ADR, Upcoming Check-ins
- **Property selector** (if multiple)
- **Today's activity:** Check-ins, check-outs, pending messages
- **Quick actions:** Adjust price, send instructions, schedule cleaning
- **Upcoming bookings** (next 7 days): guest, property, dates, platform
- **Revenue chart** (30 days)
- **Mini occupancy heatmap**
- **Activity feed**

Revenue estimate: calendar_rates suggested_rate × booked nights. Label "Estimated Revenue" until Channex connected.

### 3. Calendar

- **Monthly grid** (default) + timeline view toggle
- **Property tabs** at top
- **Booking bars:** guest name, platform logo, color by platform, check-in/out overlap
- **Rate display** in each cell (from calendar_rates)
- **Demand coloring:** green (low) → yellow (medium) → red (high)
- **Gap night highlighting** (1-2 night orphans)
- **Click empty date →** quick price adjustment
- **Click booking →** detail sidebar
- **24-month range,** smooth scroll, today indicator
- **Skeleton loader** matching grid layout

### 4. Properties

- **Grid of cards:** photo, name, location, platform badges, bookings, occupancy, next check-in
- **"Add Property"** → onboarding flow (iCal-first)
- **Property detail:** Overview | Calendar | Bookings | Settings tabs
- **Settings:** name, photo, iCal feeds, Channex connection (Pro), beds/baths/guests

### 5. Pricing Engine (StayCommand's differentiator)

- **Property + date range selectors**
- **Heatmap calendar** showing suggested rates with color intensity
- **Signal breakdown** for selected date — all 9 signals with scores:
  - Demand (0.20), Seasonality (0.15), Competitor (0.20), Events (0.12)
  - Gap Night (0.08), Booking Pace (0.08), Weather (0.05), Supply (0.05), Lead Time (0.07)
- **Rate comparison chart:** your rate vs comps vs market
- **"Apply Suggested Rates"** → saves to calendar_rates
- **"Push to Channels"** (Pro) → Channex API
- **Min/max guardrails,** weekend premium, last-minute rules

### 6. Messages / Inbox

- **Conversation list** (left): guest name, property, preview, timestamp, unread
- **Message thread** (right): chat bubbles, platform indicator
- **"AI Draft"** → Claude generates response from context + booking
- **Quick reply templates:** check-in, WiFi, checkout
- **Empty state:** "Connect channels to sync messages" with CTA

### 7. Reviews

- **Review list:** rating, date, property, platform
- **AI Review Generator:** guest name + stay → personalized review
- **Schedule reviews** (post after X days)
- **Response suggestions**
- **SEO keywords**

### 8. Cleaning / Turnover

- **Kanban:** Upcoming | In Progress | Completed
- **Auto-generate** from booking check-outs
- **Assign cleaners,** SMS notifications (Twilio)
- **Checklists** per property
- **Cleaner management**

### 9. Market Intel

- **Leaflet map:** your properties (emerald), comps (gray), events (purple)
- **Market stats:** average rate, occupancy, supply, demand trends
- **Filters:** date range, property type, bedrooms
- **Data:** AirROI API

### 10. Nearby Listings

- **Grid:** photo, name, rating, reviews, nightly rate, distance
- **Sort/filter:** price, rating, distance, bedrooms
- **Data:** AirROI API

### 11. Comp Sets

- **Custom competitive sets** per property
- **Sortable table:** name, rate, occupancy, rating, reviews
- **Rate comparison chart**
- **Map view**

### 12. Revenue Check (public)

- Keep as-is — lead gen tool
- Polish for professional appearance
- No login required

### 13. Settings

- **Profile:** name, email
- **Properties:** manage all
- **Channel Connections (Pro):** Channex setup, OTA connections, sync status
- **Sync Log:** webhook/poll activity (moved from old Channels)
- **Notifications:** email/SMS preferences
- **Billing:** Free/Pro/Business plans

### 14. Sidebar

```
Dashboard
Calendar
Messages
─── MANAGE ───
Properties
Pricing
Reviews
Cleaning
─── GROW ───
Market Intel
Nearby Listings
Comp Sets
─── (bottom) ───
Settings
User avatar
```

Remove Revenue Tool from sidebar (keep as standalone /revenue-check).

---

## Visual Design Spec

| Element | Spec |
|---------|------|
| Primary color | Emerald #10b981 scale |
| Background | White #ffffff (cards), #f9fafb (page) |
| Text | #111827 (headings), #6b7280 (secondary) |
| Font | Nunito Variable |
| Cards | rounded-xl, shadow-sm, NO borders, p-6 |
| Buttons | rounded-lg, emerald primary, ghost secondary |
| Icons | Lucide React, 20px |
| Spacing | 24px between cards, 16px internal |
| Transitions | 150ms hover, 300ms page |
| Platform badges | Airbnb (red "A"), BDC (blue "B"), VRBO (purple "V"), 24x24 |

**Loading states:** Skeleton loaders matching layout (no "Loading..." text).
**Empty states:** Icon + message + CTA button (use shared EmptyState component).
**Mobile:** Sidebar → hamburger, cards stack, calendar horizontal scroll.

---

## Data Architecture

| Source | What it provides | Tier |
|--------|-----------------|------|
| **iCal** | Bookings (dates, guest, status, platform), calendar blocking | Free |
| **Channex** | Real-time bookings with revenue, rate pushing, availability sync, messages | Pro |
| **Pricing Engine** | Suggested rates (9 signals) | Free |
| **AirROI** | Market data, comps, nearby listings | Free |
| **Claude API** | AI message drafts, review generation | Free |
| **StayCommand** | Cleaning schedules, revenue estimates, gap detection | Free |

---

## Implementation Phases

### Phase 1: Foundation Reset
- Rebuild onboarding (iCal-first, no Channex iframe)
- Clean up all scaffold/test data
- Standardize design system across all pages
- Fix all broken pages from codebase analysis
- Add loading states + empty states everywhere

### Phase 2: Core Pages Polish
- Dashboard with real data + revenue estimates
- Calendar with booking bars, demand coloring
- Properties with clean cards
- Pricing engine with visual signal breakdown

### Phase 3: Operations
- Messages inbox with AI drafts
- Cleaning kanban with Twilio SMS
- Reviews with AI generation

### Phase 4: Intelligence
- Market Intel with working Leaflet map
- Nearby Listings with AirROI data
- Comp Sets with comparison charts

### Phase 5: Channex Pro Features
- Move Channex to Settings → Channel Connections
- Rate pushing from pricing engine
- Two-way availability sync
- Real-time webhooks
- Guest messaging sync

### Phase 6: Launch Prep
- Revenue Check polish
- Billing/pricing page
- First 5 hosts onboarding
- Marketing materials
