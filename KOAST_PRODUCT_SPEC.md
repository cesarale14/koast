# KOAST — Complete Product Specification
# Version 1.0 — April 2026
# This is the single source of truth for what Koast is and how it works.

---

## PART 1: PRODUCT VISION

### What is Koast?
Koast is an AI-powered property management system for short-term rental hosts. It manages everything so the host can coast — channel sync, guest messaging, dynamic pricing, cleaning coordination, and market intelligence in one platform.

### Who is Koast for?
Independent STR hosts with 1-15 properties who currently juggle Airbnb, Booking.com, spreadsheets, and WhatsApp groups. They're not property management companies with staff — they're entrepreneurs who want professional-grade tools without professional-grade complexity.

### Why will hosts switch to Koast?
1. **They're scared of double bookings.** Multi-channel sync is the entry drug.
2. **They're leaving money on the table.** Airbnb Smart Pricing is conservative. Koast shows them how much more they could earn.
3. **They're tired of 2am messages.** AI handles "Where's the beach?" so they can sleep.
4. **They want one screen, not five tabs.** Airbnb + BDC extranet + Google Sheets + WhatsApp + their brain = Koast.

### Core principle: Koast does the work, host approves the decisions.
Every feature follows this pattern:
- Koast detects something (new booking, pricing opportunity, guest question, cleaning needed)
- Koast prepares a response (blocks availability, suggests rate, drafts reply, notifies cleaner)
- Host approves with one tap — or Koast auto-handles based on rules

---

## PART 2: THE HOST'S DAY (and how Koast maps to it)

### Morning (host opens Koast over coffee)
**What they see:** Dashboard
- Which properties have guests checking in/out today
- Any messages that need attention (with AI drafts ready)
- Revenue for the month so far
- Any pricing alerts (events coming up, rates to adjust)
- Cleaning status for today's turnovers

**What Koast already did overnight:**
- Synced all bookings from every channel
- Answered routine guest questions via AI
- Adjusted rates based on new market data
- Sent cleaning notifications for tomorrow's turnovers
- Detected and flagged a pricing opportunity for next weekend

### During the day (host checks in occasionally)
**What they do in Koast:**
- Approve/edit AI message drafts
- Review and apply pricing suggestions
- Check a specific property's calendar
- See if the cleaner confirmed

### Weekly (strategic thinking)
**What they look at:**
- Revenue trends across properties
- Market intelligence (what competitors charge, occupancy trends)
- Reviews to respond to
- Upcoming gap nights to fill

---

## PART 3: INFORMATION ARCHITECTURE

### Sidebar Navigation
```
Dashboard              — Morning command center
Calendar               — Multi-property calendar (sidebar view)
Messages               — Unified inbox across all platforms

MANAGE
  Properties           — Grid of all properties → click into Property Detail
  Pricing              — Global pricing engine view (all properties)
  Reviews              — Review management + AI response generation
  Turnovers            — Cleaning kanban board

INSIGHTS
  Market Intel         — Map + market analytics
  Comp Sets            — Competitive set management

Settings               — Account settings, billing, team
```

### Property Detail (inside a property)
```
[Hero photo + property name + connected channels]

Tabs:
  Overview             — Property-level dashboard (metrics, bookings, AI insights)
  Calendar             — Single-property calendar + right panel editor
                         Right panel contains: rates, per-channel rates, availability, 
                         min stay, and date-specific settings
  Pricing              — Property-level pricing engine config + rate review
```

Settings and availability controls live inside the Calendar tab's right panel because they're date-contextual. Global property settings (name, address, connected channels) are accessed via a gear icon in the hero.

---

## PART 4: FEATURE SPECIFICATIONS

### 4.1 DASHBOARD

**Purpose:** Answer "What do I need to know right now?" in 10 seconds.

**Layout:**
- Greeting + summary line ("2 check-ins today, 3 unread messages, all channels synced")
- Property status cards (photo-led, show who's in house / turnover / open)
- Portfolio metrics (glass cards: revenue, occupancy, avg rate, rating)
- Activity feed (recent bookings, messages, rate changes, cleaning confirmations)
- AI insights card (actionable: "Event detected, raise rates" with one-tap apply)

**Backend requirements:**
- Aggregated metrics query across all properties for current month
- Activity feed from bookings, messages, cleaning_tasks, pricing_outcomes tables
- AI insight generation: cron job that analyzes upcoming dates for opportunities
- Channel health status check (are all connections healthy?)

**Key interactions:**
- Click property card → Property Detail
- Click message in activity → Messages with that conversation open
- Click AI insight "Apply" → executes the suggestion (rate change, min stay change, etc.)
- All data real-time, no manual refresh needed

---

### 4.2 CALENDAR (Multi-Property Sidebar View)

**Purpose:** See all bookings across all properties at a glance.

**Layout:**
- Left: Property thumbnail strip (80px, photos with channel badges)
- Center: Airbnb-style monthly grid for selected property
- Right: Rate/availability editor panel (appears when clicking a date)

**Calendar grid rules (Airbnb-style):**
- Near-square cells (aspect ratio 1:0.85)
- Date number top-left, rate below (only on unbooked dates)
- Today: red circle (#FF385C) on date number
- Selected date: golden inset border
- Booking bars: dark #222222, 30px height, rounded 8px
- Each bar starts with platform logo (20px circle), then guest name + guest count
- Check-in/checkout overlap: outgoing bar takes 10% of shared cell, incoming takes 90%
- Bars that span multiple rows: continue with adjusted border-radius

**Right panel (when date selected):**
- If booked: guest info (avatar, name, platform pill, dates, payout)
- Base rate from pricing engine with "9-signal" badge
- Per-channel rate cards (glossy glass, with rate input, markup %, sync indicator)
- Availability toggle (open/closed on all channels)
- Minimum stay stepper
- If date range selected: "Save & push (N days)" bulk action

**Backend requirements:**
- GET /api/calendar/:propertyId?month=YYYY-MM → returns dates with rates + bookings
- GET /api/channels/rates/:propertyId?date_from&date_to → live rates from Channex
- POST /api/channels/rates/:propertyId → save + push rate to specific channel
- Booking data joined with guest info and platform source
- Availability push to Channex on toggle change

---

### 4.3 MESSAGES (Unified Inbox)

**Purpose:** All guest conversations from every platform in one place, with AI handling routine questions.

**Layout:**
- Left (340px): Conversation list with search + filters (All, Unread, Needs reply, AI drafted)
- Center: Message thread
- Right (300px): Guest context panel (booking details, property, quick actions, AI suggestions)

**Conversation list:**
- Guest avatar with platform logo badge (actual Airbnb/BDC logos)
- Guest name, property name + dates, message preview (2-line), timestamp
- Golden dot for unread, golden left border for active conversation
- "AI drafted" filter shows conversations where Koast prepared a response

**Message thread:**
- Guest messages: white bubbles, left-aligned, "via Airbnb" / "via Booking.com" attribution
- Host messages: coastal green bubbles, right-aligned, delivery/read status
- AI drafts: dashed golden border, "Koast AI draft" label, "Send as-is" + "Edit" buttons
- Timestamp dividers between message groups

**AI messaging rules (CRITICAL — this is a core differentiator):**
- No emojis. Professional, warm, concise.
- AI knows: property details, local area info, house rules, check-in instructions, WiFi password
- AI auto-drafts replies for: location questions, amenity questions, check-in instructions, local recommendations, checkout reminders
- AI flags for human review: complaints, damage reports, early check-in requests, booking modifications, anything that requires host judgment
- AI can auto-send (if host enables): check-in instructions (day before), checkout reminders (day before checkout), welcome messages (at check-in time)

**Operational routing:**
- If guest says "towels" / "supplies" / "broken" / "dirty" → AI drafts reply to guest AND creates a task + notifies cleaner via SMS
- If guest asks about extending stay → AI checks availability, drafts response with available dates + rate
- If guest asks about early check-in → AI checks if property is free the night before, drafts conditional approval

**Context panel (right side):**
- Guest info: name, previous stays, average review they've left
- Current booking: property, dates, guests, payout
- Property card with thumbnail
- Quick actions: notify cleaner, view booking, request review, report issue
- AI suggestions: context-aware nudges based on booking timeline

**Backend requirements:**
- Messages table synced from Channex API (Airbnb) + Booking.com messaging API
- Claude API (Haiku for simple questions, Sonnet for complex) with property context injected
- Message templates table for auto-send triggers
- Property knowledge base per property (local recommendations, house rules, FAQ)
- SMS integration (Twilio) for cleaner notifications
- Webhook from Channex for new messages → triggers AI draft generation

---

### 4.4 PROPERTIES (Grid Page)

**Purpose:** Overview of all properties, entry point to Property Detail.

**Layout:**
- Page header: title + "Add property" button
- Portfolio stats (glass cards): total revenue, avg occupancy, avg rating, active bookings
- Grid/Table view toggle
- Property cards in responsive grid

**Property card (entire card is clickable → Property Detail):**
- Photo hero (180px) with gradient overlay
- Property name + location overlaid on photo
- Channel badges on photo (actual platform logos with glassmorphism)
- Status bar: live operational context ("David K. checking out Apr 17", "Turnover today — Maria confirmed", "Open tonight — $185/night")
- 4 metrics: Revenue, Occupancy, Rating, ADR
- No quick action buttons — card click is the only interaction

**Add property flow:**
- Dashed golden border card at the end of the grid
- Click → modal with three options:
  1. Connect Airbnb (Channex OAuth flow)
  2. Connect Booking.com (Hotel ID entry → self-service flow)
  3. Import via iCal URL (fallback for any platform)

**Backend requirements:**
- Properties query with aggregated metrics (revenue, occupancy, rating for current month)
- Status bar requires: current booking (if occupied), next booking, cleaning task status
- Channel health status per property (healthy / degraded / disconnected)
- Property creation/import flows (already built, audited, P0s fixed)

---

### 4.5 PROPERTY DETAIL

**Purpose:** Everything about one property. The host's "mission control" for a single listing.

**Layout:**
- Hero: full-bleed property photo with dark gradient, property name, address, connected channel badges, "Connect listing" button
- Tab bar: Overview | Calendar | Pricing

#### 4.5.1 Overview Tab

**Content:**
- Status banner (who's in house / turnover / vacant + next guest info)
- 5 glass metric cards: Revenue, Occupancy, Avg Rate, Rating, Avg Length of Stay (all with month-over-month trend)
- Two columns:
  - Left: Upcoming bookings list (guest avatar, name, platform pill, dates, payout, nights)
  - Right: Channel performance (revenue split by platform with logos) + AI insight card

**AI insight card types:**
- Gap night detection: "Apr 17-22 is open. Lower min stay to 2 nights to fill it."
- Rate opportunity: "Gasparilla Festival is March 28. Raise rates to $290."
- Competitor alert: "3 nearby listings raised rates 20% for Memorial Day weekend."
- Review prompt: "David K. checked out 2 days ago. No review yet. Send a reminder?"
- Channel suggestion: "82% of your bookings come from Airbnb. Connect Booking.com to diversify."

#### 4.5.2 Calendar Tab

Same as the multi-property calendar but single-property focused. No property thumbnail strip on left — full-width calendar grid + right panel editor.

Right panel contains ALL date-level controls:
- Booking info (if date is booked)
- Base rate + per-channel rates
- Availability toggle
- Minimum stay
- Check-in/checkout day restrictions
- Notes (internal, not guest-facing)

#### 4.5.3 Pricing Tab — THE DIFFERENTIATOR

**Philosophy:** Hosts don't want to understand 9 signals. They want to know: "Am I charging the right amount?" and "What should I change?" Koast answers both and lets them approve with one tap.

**Layout (top to bottom):**

**Section 1: "How you're performing" (the scorecard)**
- Your avg rate vs market avg rate (are you above or below?)
- Your occupancy vs market occupancy
- Estimated revenue you're leaving on the table (calculated: nights where your rate is >15% below what comps charge × the difference)
- Revenue captured vs potential (visual bar showing actual vs what you'd earn at Koast-suggested rates)

This is the hook. "You're leaving $430 on the table this month" is more motivating than any signal breakdown.

**Section 2: "What Koast recommends" (the action center)**
A chronological list of rate change recommendations, grouped by urgency:

- **Act now** (next 7 days): specific dates where your rate differs significantly from Koast's suggestion
  - Each row shows: date range, current rate, suggested rate, reason (in plain English: "Local event +25%", "Weekend demand", "Gap night — lower to fill")
  - "Apply" button per row, or "Apply all" for the group
  
- **Coming up** (8-30 days): same format, less urgent
  
- **Review** (30+ days out): longer-term suggestions, lower confidence

Each recommendation row expands on click to show the signal breakdown for that specific date — THIS is where the 9 signals live. Not as a separate dashboard, but as the "why" behind a specific recommendation. When the host clicks "Why $290 for March 28?", they see:
- Demand: High (Gasparilla Festival) +$35
- Competitors: avg $275 (+$15 above market)
- Seasonality: Peak spring +$20
- Lead time: 14 days out (normal)
- Weather: 80F, sunny +$5
- etc.

**Section 3: "Your pricing rules" (the configuration)**
- Base rate: the starting point for the engine (host sets this)
- Min/max guardrails: "Never go below $150, never above $400"
- Channel markups: "Booking.com +15%, Direct -10%"
- Seasonal adjustments: host can set known peaks (Spring Break, holidays)
- Auto-apply toggle: "Automatically push Koast-suggested rates" (off by default — hosts need to build trust first)
- Smart Pricing comparison: show how Koast's suggestions differ from Airbnb Smart Pricing

**Section 4: "How the engine performed" (the trust builder)**
- Last 30 days: accepted suggestions vs ignored, revenue impact of accepted changes
- Accuracy tracking: "Koast suggested $245, you booked at $230 — 94% accuracy"
- Over time, this data builds confidence for the host to turn on auto-apply

**Backend requirements:**
- Pricing engine (already built — 9 signals, weights, calculation):
  - Demand (20%): AirROI market occupancy data
  - Competitors (20%): comp set avg rate from market_comps
  - Seasonality (15%): learned from pricing_outcomes after 30+ days
  - Events (12%): Ticketmaster local events, stacked, capped at +40%
  - Gap Night (8%): orphan 1-2 night detection between bookings
  - Booking Pace (8%): historical booking speed vs days-until-checkin
  - Lead Time (7%): rate position vs market at current lead time
  - Weather (5%): Weather.gov 14-day forecast
  - Supply Pressure (5%): month-over-month listing count change from AirROI

- New tables needed:
  - `pricing_recommendations`: property_id, date, current_rate, suggested_rate, reason_text, reason_signals (JSON), status (pending/applied/dismissed), created_at
  - `pricing_rules`: property_id, base_rate, min_rate, max_rate, channel_markups (JSON), seasonal_overrides (JSON), auto_apply (boolean)
  - `pricing_performance`: property_id, date, suggested_rate, actual_rate, booked (boolean), revenue_impact

- Engine workflow:
  1. Pricing worker runs daily (and on-demand when host views page)
  2. For each property, calculates suggested rate for next 90 days
  3. Compares to current rate — if diff > threshold, creates a recommendation
  4. If auto-apply is ON and diff is within guardrails, pushes immediately
  5. If auto-apply is OFF, recommendation sits in pending state
  6. Host reviews and applies/dismisses
  7. On apply: pushes rate to all connected channels (with channel markups applied)

---

### 4.6 REVIEWS

**Purpose:** Manage incoming reviews and generate AI-powered responses + host reviews of guests.

**Layout:**
- Left: Review feed (recent reviews with star ratings, text, and response status)
- Right: Stats + AI review generator + pending responses list

**Features:**
- Incoming review notifications
- AI-generated response drafts (professional, no emojis, references specific details from the stay)
- Host-to-guest review generation (based on booking data: "Was the property left clean? Any issues reported?")
- Response scheduling (post after guest also leaves a review — strategic timing)
- Review analytics: overall rating, category ratings, trends over time

**AI review response rules:**
- Reference something specific from the stay (dates, property features mentioned in messages)
- Thank the guest by name
- If negative feedback: acknowledge, explain fix, don't be defensive
- If positive: brief, grateful, invite return
- Never generic. Never templated-feeling.
- 2-4 sentences max.

**Backend requirements:**
- Reviews synced from Channex (Airbnb reviews API)
- Claude API for response generation with message history context
- Review scheduling table (post_at timestamp, auto-post if enabled)
- Review analytics aggregation

---

### 4.7 TURNOVERS (Cleaning)

**Purpose:** Coordinate cleaners without WhatsApp chaos.

**Layout:** Kanban board with 4 columns: Scheduled | Notified | In Progress | Completed

**Kanban card contents:**
- Property name + date
- Guest transition: "After: David K. (Airbnb) → Before: Michael T. (BDC)"
- Assigned cleaner with avatar
- Urgency tag: Same-day (red), Standard (green), Deep Clean (blue)
- Time info: scheduled time, started time, completed time

**Features:**
- Auto-creation: when a booking is created, if there's a checkout before it, create a cleaning task
- Cleaner assignment: default cleaner per property, or manual assignment
- SMS notifications (Twilio): auto-send to cleaner X hours before turnover
- Cleaner confirmation: cleaner replies "OK" via SMS → card moves to Notified
- Completion tracking: cleaner sends "Done" → card moves to Completed
- Guest requests: "Can we get extra towels?" → creates a task + notifies cleaner
- Special instructions per task: "Guest has a dog — extra pet cleanup needed"
- Cleaner management: add/remove cleaners, assign to properties, track performance

**Backend requirements:**
- cleaning_tasks table (already exists): property_id, booking_id, cleaner_id, status, scheduled_at, notified_at, started_at, completed_at, notes
- cleaners table (already exists): name, phone, properties (many-to-many)
- Twilio SMS: outbound notifications + inbound webhook for replies
- Auto-creation trigger: on booking insert, check for preceding checkout
- SMS parsing: "OK" / "Done" / "On my way" → status updates

---

### 4.8 MARKET INTELLIGENCE

**Purpose:** Know what the market is doing so you can price and position accordingly.

**Layout:**
- Top: Glass stat cards (market avg rate, market occupancy, active listings, supply change)
- Split: Interactive map (left, 60%) + competitor sidebar (right, 40%)

**Map features:**
- Leaflet map centered on host's properties
- Layers (toggleable):
  - Your properties (golden dots)
  - Competitors / comp set (green dots)
  - Recent events (red squares with event name on hover)
  - Market heatmap (occupancy by area)
- Click a comp dot → shows rate, occupancy, rating, link to listing

**Competitor sidebar:**
- Photo cards for nearby listings from AirROI
- Rate, occupancy, rating per listing
- "Add to comp set" button
- Sort by: distance, rate, rating, occupancy

**Backend requirements:**
- AirROI API for market data (market_comps, market_snapshots tables)
- Ticketmaster API for local events (local_events table)
- Leaflet.js map with GeoJSON layers
- Comp set management: user selects which listings to track

---

### 4.9 COMP SETS

**Purpose:** Track specific competitors over time.

**Layout:**
- Table of comp set listings with: photo, name, rate, occupancy, rating, distance
- Sortable columns
- Rate comparison chart: your rate vs comp set average over 30/90 days
- "Add comp" search → searches AirROI by location

---

### 4.10 SETTINGS (Global)

**Purpose:** Account-level configuration.

**Sections:**
- Account: name, email, password, notification preferences
- Billing: current plan (Free/Pro/Business), upgrade CTA, payment method
- Team: invite co-hosts, assign permissions (future)
- Integrations: connected Channex account status, API keys
- Notifications: email alerts for new bookings, messages, pricing opportunities, channel disconnections

---

### 4.11 LOGIN / SIGNUP

**Purpose:** First impression. Must feel premium.

**Design:** Dark deep-sea background with ambient golden/green radial glows. Glassmorphism form card. Golden gradient CTA button. Google OAuth + email/password.

**Signup flow:**
1. Create account (email + password or Google)
2. "How many properties do you manage?" (1 / 2-5 / 6-15 / 15+) → determines plan suggestion
3. "Connect your first listing" → Airbnb OAuth or iCal URL
4. Property imports → lands on Dashboard with first property loaded

**Key principle:** Host should see their property in Koast within 3 minutes of signing up.

---

## PART 5: CHANNEL HEALTH MONITORING

**This is a P0 system feature, not a page.**

When a channel disconnects (OAuth revoked, API key expired, Channex down):

**Detection:**
- Health check every 5 minutes via VPS worker
- Any failed API call immediately marks channel as degraded/disconnected
- Store in channel_health table: property_id, channel_type, status, last_check, last_success, error_message

**User notification:**
- Property card status bar turns red: "Airbnb disconnected — rates not syncing"
- Dashboard shows non-dismissible alert card
- Sidebar "Properties" nav shows warning indicator
- Email notification to host
- Property detail hero shows red banner with "Reconnect" button

**Recovery:**
- "Reconnect" starts appropriate OAuth/connection flow
- After reconnection: full availability + rate sync immediately

---

## PART 6: AI CAPABILITIES SUMMARY

Koast's AI (powered by Claude API) does four things:

### 1. Guest messaging
- Auto-drafts replies to common questions
- Routes operational requests to cleaners
- Auto-sends scheduled messages (check-in instructions, checkout reminders)
- Flags complex situations for host review

### 2. Dynamic pricing
- 9-signal rate calculations
- Plain-English recommendations ("Raise to $290 for Gasparilla weekend")
- Auto-apply with guardrails when host enables it
- Performance tracking to build trust

### 3. Review management
- Generates response drafts for incoming reviews
- Generates host reviews of guests
- Strategic timing recommendations

### 4. Operational intelligence
- Gap night detection with fill strategies
- Event-based pricing alerts
- Competitor monitoring alerts
- Channel diversification suggestions
- Cleaning task auto-creation and routing

---

## PART 7: DATA MODEL ADDITIONS

New tables needed beyond what exists:

```sql
-- Pricing engine
pricing_recommendations (
  id, property_id, date, current_rate, suggested_rate,
  reason_text, reason_signals JSONB, urgency (act_now/coming_up/review),
  status (pending/applied/dismissed), created_at, applied_at
)

pricing_rules (
  id, property_id, base_rate, min_rate, max_rate,
  channel_markups JSONB, seasonal_overrides JSONB,
  auto_apply BOOLEAN DEFAULT false, created_at, updated_at
)

pricing_performance (
  id, property_id, date, suggested_rate, actual_rate,
  booked BOOLEAN, revenue_delta, created_at
)

-- Channel health
channel_health (
  id, property_id, channel_type, status (healthy/degraded/disconnected),
  last_check TIMESTAMP, last_success TIMESTAMP, error_message TEXT
)

-- Property knowledge base (for AI messaging)
property_knowledge (
  id, property_id, category (location/amenities/rules/faq/local_recs),
  question TEXT, answer TEXT, source (manual/ai_generated)
)

-- Message automation
message_automations (
  id, property_id, trigger (check_in_day_before/checkout_day_before/booking_confirmed/custom),
  template TEXT, enabled BOOLEAN, channel (all/airbnb/booking_com)
)
```

---

## PART 8: DESIGN RULES (Summary for Claude Code)

All design details are in DESIGN_SYSTEM.md. Key principles:

1. **Koast palette only.** No Tailwind grays. Ever.
2. **Real platform logos.** From /public/icons/platforms/. No colored circles with letters.
3. **No emojis.** Professional tone throughout.
4. **No pulsing/glowing dots.** Status communicated through color alone.
5. **Glass cards for key metrics only.** Not everything.
6. **Dark booking bars (#222).** Platform identity via logo, not bar color.
7. **Golden section labels.** The #1 brand signature — uppercase, wide tracking.
8. **Cubic-bezier hover transitions.** Cards lift, never color-change.
9. **Photography as architecture.** Property photos are large, atmospheric, not thumbnails.
10. **AI cards are dark surfaces.** Radial golden glow, inside the light product space.

---

## PART 9: IMPLEMENTATION ORDER

### Phase 1: Core (ship to first 5 hosts)
1. Rebrand Moora → Koast (name, domain, design system, logo)
2. Dashboard redesign
3. Calendar redesign (Airbnb-style + right panel editor)
4. Properties page redesign
5. Property Detail (Overview + Calendar tabs)
6. Channel health monitoring
7. Onboarding flow (signup → connect → first property in 3 minutes)

### Phase 2: Intelligence (what makes hosts stay)
8. Pricing tab (recommendations, not just signals)
9. AI messaging (auto-draft, auto-send, operational routing)
10. Market Intel page
11. Reviews with AI responses

### Phase 3: Operations (what makes hosts tell friends)
12. Turnovers kanban with SMS
13. Comp Sets
14. Direct booking website builder (Frontdesk)

### Phase 4: Growth
15. Marketing site (dark, premium, product screenshots)
16. Revenue Check lead gen tool
17. Owner portal / multi-user
18. Mobile responsive optimization

---

## PART 10: SUCCESS METRICS

**For first 5 hosts (Phase 1):**
- Can they onboard in under 5 minutes?
- Do they open Koast daily? (target: 80% DAU/MAU)
- Zero double bookings
- Zero missed channel disconnections

**For 50 hosts (Phase 2):**
- Avg revenue increase vs before Koast (target: 15%+)
- AI message acceptance rate (target: 70%+ sent as-is)
- Pricing recommendation acceptance rate (target: 50%+)

**For 400 hosts / $500K ARR (Phase 3-4):**
- NPS > 60
- Churn < 3% monthly
- Organic referral rate > 30% of new signups

---

## APPENDIX: COMPETITIVE ANALYSIS

| Feature | Koast | Hospitable | Hostaway | Guesty |
|---------|-------|------------|----------|--------|
| 9-signal pricing engine | Yes | No | Basic | PriceLabs integration |
| AI guest messaging | Yes (Claude) | Yes (templates) | Yes (templates) | Yes (templates) |
| Market intelligence | Yes (AirROI) | No | Basic | No |
| Channel management | Yes (Channex) | Yes | Yes | Yes |
| Per-channel rate control | Yes | No | Basic | Basic |
| Event-based pricing | Yes (Ticketmaster) | No | No | No |
| Cleaning coordination | Yes (SMS) | Basic | Yes | Yes |
| Direct booking website | Coming | Yes | Yes | Yes |
| Starting price | Free (1 prop) | $40/mo | $29/mo | Custom |
| Design quality | Premium | Basic | Basic | Enterprise |

**Koast's moat:** 9-signal engine + market intelligence + AI operations in one product. No competitor has all three. The design quality is a second moat — hosts will screenshot it and share.
