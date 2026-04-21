# Koast — Path to 5,000 Users

*Phase 2 strategic output, 2026-04-21. Companion to [FEATURE_INVENTORY.md](./FEATURE_INVENTORY.md).*

Where the inventory is "what Koast is," this document is "who Koast is for, how it tiers, how it reaches users, and when to change direction."

---

## Target user (beachhead)

### Primary: Power host (Type B)
- 5–15 properties
- Multi-platform (Airbnb + BDC + sometimes Vrbo + direct)
- Currently juggling 2–4 tools (Airbnb app, BDC extranet, maybe PriceLabs, spreadsheet)
- Median portfolio revenue: $200k–$1M/year
- Cesar is the v1 customer (6 properties himself, partners with more — ~24 properties across the beta group)
- Tampa/Florida geographic concentration initially, expanding as traction allows

### Aspirational: Cohost company (Type A)
- 20–50 properties managed for external owners
- Team-based operations (host + VA + cleaner + owner stakeholders)
- Requires Team & Roles, owner reporting, multi-owner financial separation
- Higher willingness to pay ($400–800/mo range); architecture already supports them, feature set still in development

### Long-term: Enterprise (Type C)
- 100+ properties, agency-scale cohost operations
- Architecture-compatible; not roadmap-driving in the first 12 months

---

## Tier structure

### Free — iCal-powered
- Unified multi-platform calendar (the hero feature)
- iCal-based channel sync, read-only
- Pricing recommendations (view only — no apply)
- Market intelligence / comp sets
- Basic dashboard analytics
- Property limit TBD (starting assumption: up to 5 properties)

### Pro — Channex-powered
- Everything in Free
- Two-way channel sync (rate push, availability push, restrictions)
- Unified messaging inbox with reply (via Channex inbox API)
- Messaging automation engine (templates + scheduled sends + conditional triggers)
- Apply pricing recommendations to channels
- Per-channel rate overrides (sidebar, Session 5a work)
- Real-time booking notifications (Channex webhooks)
- Koast-for-Cleaners sub-product (host authoring + cleaner-facing view)
- Price range: $129–199/mo per user (calibrate based on Channex cost pass-through plus margin)

### Scale (future)
- Team & Roles
- Owner reporting + multi-owner financial separation
- Market Intelligence advanced (expansion analysis, comp projections)
- Direct booking / Frontdesk (landing page builder, custom domains)
- White-label, agency tooling

### Tiering rule
Anything that calls Channex is Pro. Self-executing rule for all future feature decisions. Writing to `calendar_rates` via `/api/pricing/apply`, reading or writing messaging inbox, applying rate recommendations — all Pro. Reading iCal, viewing recommendations, market intel dashboards — all Free.

---

## Private-beta-complete feature list

### Tier 1 — blockers (must ship for private beta open)
1. Messaging reply inside Koast (Channex inbox API wire-up)
2. Messaging automation engine (templates + scheduler worker + conditional triggers)
3. Koast-for-Cleaners sub-product (host side + cleaner-facing URL)
4. Rate apply pipeline verified end-to-end (flip the `KOAST_ALLOW_BDC_CALENDAR_PUSH` gate after verification)

### Tier 2 — polish (nice-to-have for private beta)
5. Real-time notifications for new bookings
6. Review-reply flow
7. Pre-arrival message personalization (depends on 1 and 2)

### Tier 3 — cohost (Type A) unlock
8. Team & Roles
9. Owner reporting
10. Multi-owner financial separation

### Tier 4 — advanced
11. Koast AI chat MVP (read-only, ~8–10 tools)
12. Koast AI agentic actions (automation authoring via chat)
13. Direct booking / Frontdesk builder

---

## Acquisition plan

### Primary channel: Facebook hosting groups
- Daily habit: 15–20 min, 2–3 helpful answers, no Koast mentions for first 30 days
- Profile bio mentions Koast + "DM for beta access"
- Target groups: Airbnb Host Community, Superhost Community, regional Tampa/Florida groups, BiggerPockets STR
- Metric to watch: 3–5 DMs/week asking about tooling

### Secondary channel: X / Twitter build-in-public
- 2–3 posts/week showing polish pass work (screenshots + one-sentence context)
- Follow/engage 20–30 STR founder and operator accounts
- Metric to watch: 500 followers by month 4, audience mix weighted toward STR operators

### Deferred (not now)
- YouTube creator partnerships (when ≥50 paying users + case studies)
- SEO content engine (requires 6–12mo investment + bandwidth Cesar doesn't have solo)
- Paid ads (after unit economics are proven)
- VRMA conferences (when actively selling to Type A)

### Acquisition-enabling product features (roadmap lines to add)
- Shareable performance reports (free-tier loop)
- Referral program ("invite a friend, get 30 days Pro")
- Public Tampa STR market index page (SEO, authority)
- Ultra-low-friction signup (email + iCal URL, no card on file)

---

## Kill criterion

By month 6 of open beta, if Koast has fewer than **10 paying Pro users** (defined as completed at least one paid month, not trial or refunded), close the public project and continue Koast as a private tool for Cesar + partners.

### Intermediate checkpoints
- **Month 3:** 5 external free-tier users active weekly
- **Month 4:** 1 paying Pro user
- **Month 5:** 5 paying Pro users
- **Month 6 (kill check):** 10 paying Pro users

Missed by <50% → keep executing.
Missed by >50% → reassess acquisition and/or ICP before continuing.

### Fallback is real, not aspirational
Cesar uses Koast for 6 properties himself, partners use it for more. The consolation scenario if users don't materialize is "I built a PMS that works for my portfolio and got deeply better at engineering." That's a legitimate outcome, not a face-saving rationalization.

---

## Session sequencing (rough)

The 302-feature inventory maps against the tier priorities above. Proposed session sequence:

- **Current (5a.x – 5d.x):** Calendar polish — sidebar, pill mechanics, multi-date selection (session 5c is the free-tier hero completion milestone)
- **Session 6.x:** Messaging automation engine (templates + scheduler + triggers) — Tier 1 #2
- **Session 7.x:** Messaging reply UI (Channex inbox wire-up) and notifications — Tier 1 #1 + Tier 2 #5
- **Session 8.x:** Koast-for-Cleaners sub-product MVP — Tier 1 #3
- **Session 9.x:** Rate apply verification + open-beta polish — Tier 1 #4
- **Open beta opens here. Kill-criterion clock starts.**
- **Session 10.x:** Market Intelligence UI polish + Pro-tier promotion
- **Session 11.x:** Acquisition-enabling features (referral, shareable reports)
- **Session 12.x+:** Team & Roles, Owner reporting — Type A unlock
- **Session 14.x+:** Direct booking MVP
- **Session 16.x+:** Koast AI chat MVP

Real delivery will vary. This is a priority order, not a schedule.

---

## Open questions deferred from Phase 2

- Exact free-tier property limit (probably 5; may be 3 for scarcity or 10 for generosity — A/B it after first 50 users)
- Exact Pro pricing ($129 vs $149 vs $199 — set when Channex cost passed through to end user is tested)
- Three-tier split (Free / Starter / Pro) vs two (Free / Pro) — adding Starter deferred until post-launch data shows the gap
- Whether to ship Direct Booking before or after Koast AI — depends on which gets louder user pull post-beta
