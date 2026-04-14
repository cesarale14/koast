# KOAST — Project Plan & Track Organization
# Updated: April 2026

---

## HOW TO READ THIS

Work happens in 4 parallel tracks. Each track has its own priority order.
You work on ONE item from each track at a time, not everything at once.
Some items block others — those are marked.

---

## TRACK 1: BRAND (do this first — everything else looks unfinished without it)

This track is about what people SEE before they use the product.
It's the shortest track but blocks Track 3 (marketing) and influences Track 2 (UI).

### 1A. Logo & identity [BLOCKING — do before anything public-facing]
- [ ] Design the Koast abstract symbol (for favicon, app icon, sidebar)
- [ ] Design the Koast wordmark (for marketing site, login, sidebar)
- [ ] Create the lockup (symbol + wordmark together)
- [ ] Export all variants: symbol only, wordmark only, lockup, white versions, dark versions
- [ ] Create favicon (16x16, 32x32, 192x192 for PWA)
- [ ] Place in repo at public/icons/koast/

**How to do this:** You have two options:
  A) Hire a freelance designer (Fiverr/99designs, $200-500, 3-5 days) — give them the brief: "abstract symbol + wordmark, coastal premium feel, works at 16px, deep green + golden palette"
  B) Design it here with me — we iterate on SVG concepts until you love one. Slower but free.
  
**My recommendation:** Option A for the logo, because logos need a human eye and multiple iterations. Use the saved time to validate the pricing engine (Track 4). Give the designer this brief:
- Name: Koast
- Tagline: "Your hosting runs itself"
- Palette: Deep sea green #132e20 + Golden #c49a5a
- Mood: Premium hospitality meets clean tech (Airbnb warmth + Linear precision)
- Must work as: 16px favicon, 30px sidebar mark, 44px login mark, full lockup
- Avoid: literal house/roof shapes, waves, generic SaaS marks

### 1B. Domain setup [BLOCKING — do before marketing site]
- [ ] Configure koasthq.com DNS (point to Vercel or marketing site host)
- [ ] Set up email: hello@koasthq.com (Google Workspace or Zoho)
- [ ] Update Vercel project domain from staycommand.vercel.app → app.koasthq.com
- [ ] Keep staycommand.vercel.app as redirect for now

### 1C. Social presence [NOT blocking — do anytime]
- [ ] Register @koasthq on Twitter/X, Instagram, LinkedIn
- [ ] Create a simple profile with logo + tagline
- [ ] Join 3-5 STR Facebook groups (don't promote yet — just observe and help)

---

## TRACK 2: PRODUCT UI (the rebuild)

This track is about making the product look and feel like the mockups.
The DESIGN_SYSTEM.md and mockup files are the spec. Claude Code executes.

**IMPORTANT: Don't rebuild everything at once.** Ship one page at a time, test it with real data, then move to the next. The order below is based on which pages hosts use most.

### 2A. Rebrand the shell [do first — 1 day]
- [ ] Rename all "Moora" / "StayCommand" references to "Koast" in code
- [ ] Update sidebar with Koast logo mark (use placeholder "K" until 1A is done)
- [ ] Apply new color palette (CSS variables swap — mostly done in globals.css)
- [ ] Update font if needed (Plus Jakarta Sans stays)
- [ ] Verify Vercel builds clean

### 2B. Dashboard redesign [highest impact — 2-3 days]
- [ ] Implement entrance animation choreography from DESIGN_SYSTEM.md Section 16
- [ ] Property cards with photos, status bars, metrics (real data from Villa Jamaica + Cozy Loft)
- [ ] Glass stat cards with count-up animation and sparklines
- [ ] Revenue chart (canvas-drawn with animated draw)
- [ ] Activity feed (real data from bookings, messages tables)
- [ ] AI insight cards (can be hardcoded initially, then wired to engine)

### 2C. Calendar redesign [most-used page — 3-4 days]
- [ ] Airbnb-style grid with near-square cells
- [ ] Dark booking bars with real platform logos
- [ ] Check-in/checkout overlap math (10%/90%)
- [ ] Right panel: booking info + per-channel rate editor + availability + min stay
- [ ] Property thumbnail strip on left
- [ ] Wire to real Channex rate data

### 2D. Property Detail [2-3 days]
- [ ] Hero with full-bleed property photo
- [ ] Three tabs: Overview, Calendar, Pricing
- [ ] Overview: status banner, metrics, bookings list, channel performance
- [ ] Calendar: same as 2C but single-property
- [ ] Pricing: see Track 4

### 2E. Messages redesign [2 days]
- [ ] Three-column layout (conversation list, thread, context panel)
- [ ] Real platform logos on avatars
- [ ] AI draft display (dashed golden border, Send/Edit)
- [ ] Wire to real message data

### 2F. Properties grid [1 day]
- [ ] Photo-led cards, entire card clickable
- [ ] Status bar with live context
- [ ] Grid/table toggle
- [ ] Add property card

### 2G. Remaining pages [1 day each]
- [ ] Turnovers kanban
- [ ] Reviews with AI drafts
- [ ] Market Intel map + sidebar
- [ ] Login/Signup dark theme

---

## TRACK 3: MARKETING (do AFTER Track 1A logo is done)

This track is about acquiring your first 5 hosts.
It's blocked by having a logo and a working product.

### 3A. Marketing site [3-4 days, after logo exists]
- [ ] Dark landing page on koasthq.com
- [ ] Hero: tagline + product screenshots + CTA
- [ ] Feature sections with real UI screenshots (from Track 2)
- [ ] Pricing table (Free / Pro / Business)
- [ ] "Built by a host" story section
- [ ] Mobile responsive

### 3B. Revenue Check lead gen [1-2 days]
- [ ] Public page at koasthq.com/revenue-check
- [ ] Host enters address → shows estimated revenue + comp data
- [ ] CTA: "Get these insights for all your properties — sign up free"
- [ ] Share in STR Facebook groups

### 3C. Content / outreach [ongoing]
- [ ] Post Revenue Check tool in 5 STR Facebook groups
- [ ] Answer pricing questions in groups (establish expertise)
- [ ] DM hosts who complain about their current PMS
- [ ] Ask first 5 hosts for feedback, iterate

---

## TRACK 4: VALIDATION (do in parallel with Track 2 — this is the most important track)

This track is about proving the product actually works before you scale it.
No amount of pretty UI matters if the pricing engine gives bad suggestions.

### 4A. Pricing engine validation [START NOW — 2 weeks of data needed]
- [ ] Run the 9-signal engine daily on Villa Jamaica and Cozy Loft
- [ ] Log every suggestion to pricing_recommendations table
- [ ] Compare suggestions to Airbnb Smart Pricing for same dates
- [ ] Compare suggestions to what comps are actually charging (AirROI data)
- [ ] Track: did you follow the suggestion? What happened? (booked/empty)
- [ ] After 2 weeks: analyze accuracy. Is Koast better than Smart Pricing?
- [ ] If yes: you have proof for the marketing site ("Koast hosts earn 15% more")
- [ ] If no: tune the weights, adjust signal calculations, re-validate

**THIS IS THE MOST IMPORTANT ITEM ON THIS ENTIRE LIST.**
The pricing engine is Koast's #1 differentiator. If it doesn't work, you're just another PMS.
Everything else (UI, marketing, branding) is packaging. This is the product.

### 4B. AI messaging validation [1 week]
- [ ] Enable AI drafts for all incoming messages on Villa Jamaica
- [ ] Review every draft before sending — rate them: send as-is / edited slightly / rewrote completely / useless
- [ ] After 1 week: what's the "send as-is" rate?
- [ ] Target: 70%+ send-as-is means the feature is ready
- [ ] If below 50%: the property knowledge base needs better local data, or the prompt needs tuning

### 4C. Channel sync reliability [ongoing]
- [ ] Monitor for 2 weeks: any missed bookings? Any sync delays?
- [ ] Track: how fast does a BDC booking block Airbnb? (should be <15 minutes)
- [ ] Any overbooking incidents = P0 to fix immediately
- [ ] Build the channel health monitoring system from the product spec

### 4D. Market data accuracy [1 week]
- [ ] Spot-check AirROI data against real Airbnb listings in your area
- [ ] Are the rates accurate? Occupancy estimates reasonable?
- [ ] If data is stale or wrong, the pricing engine and market intel are both compromised

---

## WEEKLY RHYTHM

Professional teams have a weekly cadence. Here's yours:

**Monday:** Plan the week. Pick 1 item from Track 2 (UI), check Track 4 (validation) data.
**Tue-Thu:** Build. Claude Code ships the UI item. You validate pricing/messaging data.
**Friday:** Review what shipped. Test with real data. Note bugs. Update CLAUDE.md if needed.
**Weekend:** Check STR Facebook groups. Share insights (not product — yet). Observe what hosts complain about.

---

## WHAT TO DO RIGHT NOW (this week)

1. **Commission a logo** (Track 1A) — hire a designer or decide to do it here. This unblocks everything public-facing.
2. **Start pricing engine validation** (Track 4A) — turn on daily runs for Villa Jamaica + Cozy Loft. This needs 2 weeks of data, so start now.
3. **Rebrand the shell** (Track 2A) — rename Moora → Koast in code, swap colors. Quick win.
4. **Ship the dashboard** (Track 2B) — first big UI win. Use the mockup as spec.

These 4 things can all happen this week in parallel. The logo is outsourced (waiting). The engine runs automatically (waiting). The shell rename is a 2-hour Claude Code task. The dashboard is a 2-3 day Claude Code task.

---

## WHAT NOT TO DO RIGHT NOW

- Don't build the marketing site yet (no logo, no validated pricing proof)
- Don't build the direct booking website (zero demand for it from current users)
- Don't optimize for mobile (your first 5 hosts are on desktop)
- Don't build the owner portal / multi-user (you have 1 user)
- Don't add VRBO/Expedia channels (you have 2 properties on 2 channels — prove those work first)
- Don't stress about the pricing page UI (validate the engine FIRST, then build the UI around proven data)

---

## MILESTONES

### Milestone 1: "I'd show this to a friend" (2 weeks)
- Koast branding live (even with placeholder logo)
- Dashboard looks like the mockup
- Calendar works with real booking data
- Pricing engine running daily with logged suggestions
- Zero overbookings for 2 weeks straight

### Milestone 2: "I'd invite 5 hosts" (4 weeks)
- Logo done and applied everywhere
- All main pages redesigned (dashboard, calendar, messages, properties)
- Pricing engine validated with 2+ weeks of data
- AI messaging validated with 70%+ send-as-is rate
- Marketing site live with product screenshots

### Milestone 3: "I'd charge money" (8 weeks)
- 5 hosts on free tier, actively using daily
- Pricing proof: "Koast hosts earn X% more" with real data
- All pages polished
- Billing/upgrade flow working
- Zero P0 bugs for 2 weeks

---

## THE HONEST TRUTH

You've built something real. The channel sync works. The booking management works. The per-channel rate control is ahead of most competitors. The 9-signal engine is architecturally sound.

What you DON'T have yet is proof that the intelligence layer works. That's the gap between "another PMS" and "the PMS hosts switch to." The pricing engine and AI messaging need real-world validation before you can confidently sell them.

The UI redesign matters — it's what makes people stop and look. But it's packaging. The pricing engine is the product. Validate it first, package it second.
