# Koast Polish Pass — Full handoff

*Last updated 2026-04-20 after Session 5a ships (commit 10950d1).*

This doc is designed to be pasted into a fresh Claude chat so a new
agent can pick up the project without reading every prior session
transcript. Start here, then read the files it points at.

---

## 0. Orientation

- **Project**: Koast (formerly Moora / StayCommand). Short-term-rental PMS with a 9-signal pricing engine + market intelligence + channel manager. Live at `https://app.koasthq.com`. GitHub: `cesarale14/koast`.
- **Repo root**: `/home/ubuntu/koast` on the Virginia VPS (`44.195.218.19`). Branch: `main`. Always push after committing — Vercel auto-deploys.
- **Stack**: Next.js 14 App Router · TypeScript · Tailwind · Supabase (Postgres + Auth) · Channex.io channel manager · AirROI market data · Claude API for AI · Twilio · Ticketmaster · Weather.gov. Font: Plus Jakarta Sans + Fraunces (Dashboard display face).
- **Build rule (hard)**: Never run `npm run build` on this VPS — insufficient RAM. Only `npx tsc --noEmit` + `npx eslint`. Vercel builds in the cloud.
- **Two Supabase clients**: `createClient` (session-scoped, RLS-aware) and `createServiceClient` (bypasses RLS via service key). Server routes use service client after calling `verifyPropertyOwnership`.
- **Live properties (verified 2026-04-17)**: Villa Jamaica (`bfb0750e-9ae9-4ef4-a7de-988062f6a0ad`) on Airbnb + BDC; Cozy Loft - Tampa (`57b350de-e0c7-4825-8064-b58a6ec053fb`) on Airbnb.

Read in this order when picking up work:
1. `CLAUDE.md` — project-level rules, color tokens, design system, known gaps
2. `KOAST_POLISH_PASS_MASTER_PLAN.md` — the design-direction playbook + every spec correction (30+ binding rules)
3. `DESIGN_SYSTEM.md` — design system v2 (color/typography/components/animations)
4. `docs/CHANNEX_PER_PLATFORM_AUDIT.md` — per-platform rates state of the union
5. `docs/SESSION_5a_HANDOFF.md` — latest session followups
6. This file

---

## 1. Polish pass session arc (Apr 17 → Apr 20 2026)

Every session is a separate commit on `main`. The arc:

| Session | Commit(s) | What shipped |
|---|---|---|
| 1 | `ac2674c` | Calendar rebuild with 9 shared primitives in `src/components/polish/` (KoastButton/Card/Chip/Rate/BookingBar/Rail/SelectedCell/SignalBar/EmptyState) |
| 1.5 | `e48d9d8` → `1af1065` → `0365ad8` → `09e176e` → `7a0345f` → `a2327e7` | Booking bar alpha-baked colors, delta color semantics (gold up / tideline down, never red), cap padding iteration (→ 14px uniform) |
| 2 | `45911dd` | PropertyDetail + Pricing tab full rebuild (scorecard, recommendations, rules editor, performance) + PreviewModal dry-run gate |
| 2.5 | `7492683` | PropertyDetail Pricing tab layout rebuild (1760px container, 3-row grid, compact recs, persistent KoastRail) + image `next/image` fix + PortfolioSignalSummary primitive + aggregate-signals helper |
| 2.6 | `818867b` | Hero image HTML-entity decode + tab-strip visual hierarchy |
| 2.7 | `047b69a` | `next.config.mjs` `images.remotePatterns` for `a0.muscache.com` (fixed Vercel INVALID_IMAGE_OPTIMIZE_REQUEST) |
| 2.8 | `4d4ce0a` | PropertyDetail tab strip → segmented pill control + URL `?tab=` param |
| 3 | `3148768` | Dashboard rebuild (5-block layout) + KoastSegmentedControl primitive |
| 3.5 | `465841c` | Dashboard width fix (removed legacy 1200px wrapper in layout shell) + 4-up metric grid + action copy polish |
| 3.6 | `fd4a0c1` | Null-safe opportunity aggregation (upside + unmeasurable) + centered property row |
| 3.7 | `a9ccc1f` | Dashboard rebuild against "Quiet" direction: StatusDot primitive, flat containment, Fraunces greeting, `command-center/route.ts` extensions |
| 3.8 | `9072bf1` | Dashboard mobile responsive (viewport hook, conditional layouts) |
| 3.9 | `5d4f5f0` → `3fe1243` | HandwrittenGreeting animation port from Claude Design handoff (Fraunces + expressive axes + clip-path reveal) |
| Dashboard polish | `93095c4` → `5e191bc` → `21ecc3d` | Mobile greeting stack, animate-every-reload, drop pen dots |
| 4 | `3791e1a` | Top bar search (`TopBarSearch`) + PlatformPills on property cards + `command-center` `connectedPlatforms` field |
| 4.5 | `c00d6f7` | TopBarSearch → command palette trigger + CommandPalette overlay with ⌘K + PlatformPills drop eyebrow / bigger pills |
| 5.5 | `0766720` | Unified platform tiles: 22×22 brand-colored tiles with white-silhouette logos, `platforms.ts` gains `tileColor` field (Direct = deep-sea override) |
| — | `0606d3d` | **Backend cleanup**: pricing_recommendations partial unique index + backfill + validator upsert |
| — | `cbe7085` | **Doc-only audit**: docs/CHANNEX_PER_PLATFORM_AUDIT.md |
| — | `b44410f` | **Pre-Session-5a hardening**: `/api/pricing/apply` now multi-channel + writes `calendar_rates` + backfill SQL |
| 5a | `8b5e93d` | Calendar Month Grid rebuild — two-tab sidebar (Pricing / Availability), `/api/calendar/rates` + `/api/calendar/rates/apply` endpoints, six new components under `src/components/polish/calendar/`, hairline indicator on override dates |
| 5a handoff | `10950d1` | `docs/SESSION_5a_HANDOFF.md` |
| PD-V1 | (this commit) | PropertyDetail visual primitive migration: TabBar adopted KoastSegmentedControl (2.8 had only restyled the hand-rolled version, never adopted the primitive — doc drift corrected), StatusBanner → KoastCard + StatusDot (tones ok/warn/muted; nextBooking shifts golden→muted per Quiet direction) + KoastChip platform pill, UpcomingBookings + ChannelPerformance empty states → KoastEmptyState, hero Connect-listing button → KoastButton, Field/TextInput/Stepper extracted to `src/components/ui/FormControls.tsx`, entrance keyframes (`koast-fade-up-pd`, `koast-hero-in`) moved to globals.css, two new tokens `--shore-soft #f5f1e8` + `--hairline #e5e2dc`, PricingTab AccuracyChart dead-code ternary collapsed to `"#17392A"` literal, PricingTab rules-editor input border → `var(--hairline)` |

---

## 2. Architectural invariants (do NOT break)

These rules were established across the sessions above and are load-bearing for future work.

### 2.1 calendar_rates — the per-channel model
- **Base row**: `channel_code IS NULL`. One per `(property_id, date)`. Carries `base_rate`, `suggested_rate`, `applied_rate`, `factors` JSONB, `min_stay`, `is_available`, `rate_source`.
- **Override rows**: `channel_code` in `'BDC' | 'ABB' | 'VRBO' | 'DIRECT'` (upper-case). Same `(property_id, date)` as the base row. Populate `applied_rate`, `rate_source`, `is_available` only.
- **Unique index**: `calendar_rates_prop_date_chan_unique ON (property_id, date, channel_code) NULLS NOT DISTINCT` (migration `20260412010000_calendar_rates_per_channel.sql`).
- **Read convention**: every existing reader filters `.is("channel_code", null)`. If you read override rows, be explicit and document why.
- **Effective rate per channel**: "look up the channel override first; fall back to the base rate."
- DO NOT re-add the unique constraint.

### 2.2 pricing_recommendations — one row per (property, date) pending
- Partial unique index `pricing_recs_unique_pending_per_date ON (property_id, date) WHERE status = 'pending'` (migration `20260419000000_pricing_recommendations_dedup.sql`).
- Writers use delete-then-insert (Next.js) or `INSERT … ON CONFLICT (property_id, date) WHERE status = 'pending' DO UPDATE` (Python validator). The backfill in that migration is idempotent.
- `pricing_recommendations.suggested_rate` is scalar per (property, date) — NOT per-platform. Recommendations are portfolio-wide engine output; per-platform is a `calendar_rates` override story.

### 2.3 Multi-channel push pattern (from `b44410f`)
- Both `/api/pricing/apply/[propertyId]/route.ts` and `/api/calendar/rates/apply/route.ts` share the same multi-target dispatch loop:
  - Query active `property_channels` with `settings.rate_plan_id`
  - BDC targets: route through `buildSafeBdcRestrictions` (pre-flight BDC read + safe-merge per `docs/postmortems/INCIDENT_POSTMORTEM_BDC_CLOBBER.md`)
  - Non-BDC targets: push directly via `channex.updateRestrictions`
  - Per-target failure isolation; aggregate per-date per-channel success
- All Channex writes are gated by `KOAST_ALLOW_BDC_CALENDAR_PUSH=true`. Default-off returns HTTP 503 `CALENDAR_PUSH_DISABLED_MESSAGE`.

### 2.4 Apply writes calendar_rates
- `/api/pricing/apply` upserts `calendar_rates` rows (one per successful channel + one base row per applied date) so Koast's local state stays in sync with what was pushed to Channex. Same rule applies to `/api/calendar/rates/apply`.
- `channels_pushed` in `pricing_performance` uses slug convention (`'booking_com'`, `'airbnb'`, `'vrbo'`, `'direct'`) while `calendar_rates.channel_code` uses upper-case short codes (`'BDC'`, `'ABB'`, `'VRBO'`, `'DIRECT'`). The mapping helper is `channelSlugFor(code)` in the apply route.

### 2.5 Design system rules (from DESIGN_SYSTEM.md + MASTER_PLAN principles)
- **Never use default Tailwind grays** (`gray-*`, `slate-*`, `zinc-*`). Use Koast tokens (`coastal`, `tideline`, `golden`, `shore`, `dry-sand`, etc.).
- **Never use Tailwind shadow utilities**. Use CSS variable shadow stacks from globals.css.
- **No emojis** anywhere — UI, AI content, SMS.
- **No pulsing/glowing animated dots**. Status = solid colored dot.
- **Platform logos** must be real SVGs from `/public/icons/platforms/` accessed via `src/lib/platforms.ts`. Never approximate with colored circles + letters.
- **Revenue chart** uses HTML Canvas + `requestAnimationFrame`. No chart libraries.
- **Font discipline**: Plus Jakarta Sans everywhere EXCEPT:
  - Dashboard greeting + pricing-intelligence card title: Fraunces
  - Calendar sidebar date header ("Sunday, May 24"): Fraunces
  - HandwrittenGreeting: Fraunces with expressive axes (`opsz` 144, `SOFT` 100, `WONK` 1)

### 2.6 Polish-pass design principles (master plan §1-10, binding)
1. **Restraint over ambition** — Airbnb Cereal restraint, not Stripe marketing gloss
2. **Bars are the hero** on data surfaces (Calendar booking bars)
3. **Typography hierarchy via weight, not face** — Plus Jakarta only, size jumps + weight contrast
4. **Color as semantic layer, not decoration** — coastal=text, gold=Koast moments, coral=act-now, lagoon=success
5. **Persistent rails for decision-heavy pages** (Calendar, PropertyDetail)
6. **Motion is physical, not decorative** — material curve for chrome, spring curve for weight
7. **No PDF feel** — distinct default/hover/pressed/selected states, live indicators
8. **Restraint over decoration** (Dashboard Quiet direction)
9. **Single visual focal point per page** — Dashboard's dark Pricing intelligence card
10. **Status through color, not chrome** — StatusDot over chips

### 2.7 Spec corrections log (33 entries across 1.5 → 5.5)
The master plan's `## Spec corrections` section has 30+ binding rules accumulated through iteration. Don't re-argue them; read and honor. High-impact highlights:
- #4: Rate drops are never red. Gold for positive, tideline for negative.
- #5: Uniform 14px bar-root padding (no position-dependent cap padding).
- #9: `Intl.NumberFormat('en-US')` for all numeric output in KoastRate.
- #10: Never coalesce nulls with computed values — transparency over fake data.
- #14: Full-width dashboard-shaped surfaces use `max-w-[1760px] mx-auto px-10`.
- #15: Hero images use `next/image` with explicit `sizes` + `priority`.
- #17: `next.config.mjs` `remotePatterns` is a deploy-time contract.
- #19: Layout shell does NOT cap width. Each page owns its own cap.
- #22: Null-delta recs filter out of aggregations; surface "N pending measurement" honestly.
- #23: Dashboard uses plain `<article>`/`<div>`, not KoastCard.
- #24: StatusDot is the default state primitive on ambient surfaces.
- #26: Fraunces is the Dashboard display face only.
- #27: HandwrittenGreeting animates on every mount (no session gate); respects prefers-reduced-motion.
- #28: Fraunces loaded via CSS `@import` with all expressive axes (SOFT/WONK aren't in next/font's manifest, so we layer them via globals.css).
- #31: Search is a command-palette TRIGGER (`<button>`), not a live input.
- #33: Platform tiles are 22×22 brand-colored with white-silhouette logos (`{tileColor}bf` alpha hex).

---

## 3. What lives where

### 3.1 Shared primitives — `src/components/polish/`
| File | Purpose |
|---|---|
| `KoastButton.tsx` | sm/md/lg + primary/secondary/ghost/danger |
| `KoastCard.tsx` | default/elevated/quiet/dark variants |
| `KoastChip.tsx` | neutral/success/warning/danger/koast |
| `KoastRate.tsx` | hero/selected/inline/quiet/struck with delta rendering (gold+▲ / tideline+▼ / em-dash) |
| `KoastBookingBar.tsx` | 48px pill with alpha-baked platform color, position-aware border radius |
| `KoastRail.tsx` | collapsible rail with cmd+/ keyboard toggle, light/dark variants |
| `KoastSelectedCell.tsx` | hover + selected state (box-shadow, no border) |
| `KoastSignalBar.tsx` | horizontal score × weight bar |
| `KoastEmptyState.tsx` | icon + title + body + action |
| `KoastSegmentedControl.tsx` | pill toggle (tab strip + time-range switches) |
| `StatusDot.tsx` | 7–8px dot in ok/warn/alert/muted tones + optional halo |
| `PortfolioSignalSummary.tsx` | top-5 signals card |
| `PlatformPills.tsx` | brand-colored tile row for connected channels |
| `HandwrittenGreeting.tsx` | Fraunces + clip-path reveal greeting |
| `TopBarSearch.tsx` | command-palette trigger button |
| `CommandPalette.tsx` | overlay with focus trap, ⌘K listener |
| `DashboardView.tsx` | `/` home page orchestrator (5 blocks) |
| `CalendarView.tsx` | `/calendar` page orchestrator |
| `PricingTab.tsx` | PropertyDetail Pricing tab orchestrator (Session 2.5) |
| `calendar/CalendarSidebar.tsx` | Session 5a two-tab editor container |
| `calendar/PricingTab.tsx` | Session 5a per-platform rate editor |
| `calendar/AvailabilityTab.tsx` | Session 5a status + booking window |
| `calendar/WhyThisRate.tsx` | top-3 signals from factors JSONB |
| `calendar/RateCell.tsx` | inline editable rate input |
| `calendar/SyncButton.tsx` | four-state sync button shell |
| `assets/greeting/` | Claude Design handoff SVG reference |

### 3.2 Helpers
- `src/lib/platforms.ts` — canonical `PLATFORMS` config with `color`, `tileColor`, `icon`, `iconWhite`, `tile` per platform. Use `platformKeyFrom(code)` to normalize ABB/BDC/etc.
- `src/lib/pricing/aggregate-signals.ts` — `aggregateSignalContribution(recs, topN)` for portfolio signal summaries.
- `src/lib/channex/safe-restrictions.ts` — `buildSafeBdcRestrictions` (pre-flight BDC read + safe-merge plan) + `toChannexRestrictionValues`.
- `src/lib/channex/calendar-push-gate.ts` — `isCalendarPushEnabled`, `isBdcChannelCode`, `CALENDAR_PUSH_DISABLED_MESSAGE`.
- `src/hooks/usePricingTab.ts` — composes rules/recs/performance endpoints into one hook.

### 3.3 API routes touched/added in the polish arc
- `/api/dashboard/command-center` — extended with `greetingStatus`, `criticalAlerts`, `primaryStatus/secondaryStatus`, `focusActions`, `pulseMetrics`, `connectedPlatforms`
- `/api/pricing/apply/[propertyId]` — rewritten in `b44410f` to multi-channel dispatch + calendar_rates upsert (base + per-channel)
- `/api/pricing/calculate/[propertyId]` — delete-then-insert for dedup (session `0606d3d`)
- `/api/pricing/push/[propertyId]` — existing reference pattern (untouched by polish pass)
- `/api/pricing/recommendations/[propertyId]` — list by status
- `/api/pricing/performance/[propertyId]` — aggregated outcomes + daily breakdown
- `/api/pricing/audit/[propertyId]?date=` — per-date signal breakdown
- `/api/pricing/dismiss` — sets pending rec to dismissed
- `/api/pricing/preview-bdc-push/[propertyId]` — dry-run, no writes
- `/api/pricing/commit-bdc-push/[propertyId]` — idempotent commit
- `/api/channels/rates/[propertyId]` — per-channel rate editor surface used by `PerChannelRateEditor.tsx`
- `/api/calendar/rates` (**new in 5a**) — GET master + platforms bundle
- `/api/calendar/rates/apply` (**new in 5a**) — POST with mode master|platform + wipe_overrides

### 3.4 Worker scripts on VPS (`~/koast-workers/`)
- `pricing_validator.py` — daily 6 AM ET pricing validation. Writes `pricing_recommendations` with `ON CONFLICT … DO UPDATE`. Reads Airbnb live rates via Channex to populate `current_rate`.
- `pricing_performance_reconciler.py` — nightly 02:30 UTC outcome backfill.
- `pricing_worker.py` — rate calculation + market refresh.
- `booking_sync.py` — iCal sync + Channex revision polling (every 15 min). Does NOT ingest rate data.
- `market_sync.py` — AirROI comps.
- `ical_parser.py`.
- `db.py` — direct psycopg2 helpers.

---

## 4. Known gaps (with pointers)

From `CLAUDE.md` "Known Gaps" sections + the audit + session handoffs:

| Gap | Tracked at | Notes |
|---|---|---|
| Direct-booking flag | `CLAUDE.md` Known Gaps — Direct Booking Flag | No `properties.direct_booking_enabled` column yet |
| Image source resolution | `CLAUDE.md` Known Gaps — Image Assets | Airbnb CDN `?im_w=2560` upgrade needed at ingest |
| HTML-entity-encoded image URLs | same | `decodeImageUrl` helper in PropertyDetail is a render-time workaround; fix is in `booking_sync.py` |
| Pulse metric time-series | `CLAUDE.md` Known Gaps — Pulse Metric Time Series | DashboardView mocks 7-point series client-side; needs real endpoint |
| Per-rec per-platform rates | `docs/CHANNEX_PER_PLATFORM_AUDIT.md` Open Questions #1 | Would need `pricing_recommendations` schema extension |
| BDC `current_rate` caching | same Open Question #3 | Validator only reads Airbnb live rates |
| `/api/pricing/apply` uses `.insert()` not `.upsert()` on `pricing_performance` | `docs/SESSION_5a_HANDOFF.md` #2 | ~3 lines; fold into next backend session |
| `/api/calendar/rates` returns property_name where channel_name should be | same #1 | 5-minute fix |
| `/api/calendar/rates/apply` lacks `min_stay` field | same #3 | Needs endpoint + schema change |
| `calendar_rates` has no `notes` or `booking_window_days` | same #4 | Schema extension needed |
| `RateCell` arrow-boundary focus advance not wired | same #5 | Incomplete keyboard flow |
| `SyncButton` is a visual shell | same #6 | Real queue semantics in planned Session 5d |

---

## 5. Cesar's strategic observations (unresolved)

### Min-stay is a property setting, not a date-cell setting
Should follow a 3-tier hierarchy (property default → date override → per-platform override where supported). Currently rendered inside the date-scoped Calendar sidebar. **Pending decision**: 2-tier (property/date) vs 3-tier (property/date/platform).

### Dirty-state affordance should be a cross-cutting pattern
No silent saves for fields that push to Channex. Three proposed primitives:
- `KoastEditableField` — wraps any input, shows Apply/Reset on dirty, Enter=Apply, Esc=Reset, 2px golden left-border when dirty.
- `KoastPendingChangesBar` — page-level bottom bar with count + summary + Apply all / Discard all.
- `KoastBulkEditBar` — multi-select row selector with scoped action buttons.

Applies to Calendar, Property settings, Pricing rules, Channel settings. Not for search filters, ephemeral state, internal-only notes.

### Three open questions
1. Build cross-cutting primitives in Session 5c, or keep Calendar-specific patterns?
2. Where does bulk edit matter first day-to-day? (Property page / Calendar / Pricing Rules / Properties list)
3. Min-stay: 3-tier or 2-tier?

---

## 6. Revised session roadmap

- **5a.1** (small): fix channel_name bug + pricing_performance upsert
- **5b** (Gantt view): portfolio view with virtualization, sticky headers both axes, density toggle
- **5c** (Multi-date + primitives): ship KoastEditableField + KoastPendingChangesBar + KoastBulkEditBar, then adopt in Calendar
- **6** (Properties list upgrade): migrate to primitives, property-level min-stay lands here, bulk edit across properties
- **5d** (auto-sync + revert): Koast-wide after primitives exist — 90s idle auto-apply, 5-min undo toast

---

## 7. Governance + workflow

- **Commits on `main`**, always. Every polish session is its own commit. Push after committing.
- **Verification**: `npx tsc --noEmit` + `npx eslint <paths>` before every commit. Never `npm run build`.
- **Backend changes to `/api/pricing/*` or `/lib/channex/*` require a Cesar-reviewed diff** before merge. Frontend-only ships as usual.
- **Chrome MCP verification is claimant-run** from Cesar's machine, not from the VPS — recent sessions have flagged this when marking verification checklists.
- **Hard rules (from memory)**:
  - Always react to incoming Telegram messages.
  - Wait for follow-up messages before acting on truncated Telegram prompts (multi-part rule).
  - Don't run `npm run build` on the VPS.
  - Keep <10-line safety mechanisms in place until the replacement is observed working in production.
- **The safety gate `KOAST_ALLOW_BDC_CALENDAR_PUSH`** is still present as belt-and-suspenders. Flip to `true` in Vercel env only after the controlled browser-devtools test.

---

## 8. Files to read in a fresh chat

Drop this doc + these into a new Claude chat's context, in order:

1. `CLAUDE.md`
2. `KOAST_POLISH_PASS_MASTER_PLAN.md`
3. `DESIGN_SYSTEM.md`
4. `docs/CHANNEX_PER_PLATFORM_AUDIT.md`
5. `docs/SESSION_5a_HANDOFF.md`
6. This file (`docs/POLISH_PASS_HANDOFF.md`)

Then `repomix-output.xml` if you need the repo tree.

---

## 9. The "don't break these" checklist

If you touch any of these, double-check against the relevant invariant:
- `calendar_rates` queries — filter `channel_code IS NULL` unless explicitly reading overrides
- Channex pushes — always go through `buildSafeBdcRestrictions` for BDC; non-BDC direct is fine
- Platform logos — always via `src/lib/platforms.ts`
- Fonts — Plus Jakarta only; Fraunces in documented exceptions
- Default Tailwind grays — banned
- Shadow utilities — use CSS vars
- Emojis anywhere — banned
- Pulsing/glowing dots — banned
- `npm run build` on VPS — banned
- `--no-verify` / `--no-gpg-sign` — banned

Welcome to the polish pass. Ship carefully.
