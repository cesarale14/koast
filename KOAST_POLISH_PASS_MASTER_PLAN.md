# Koast Polish Pass — Master Plan

Status: Planning  
Written: April 18, 2026  
Prerequisites: Stage 1 backend complete (PRs A–D shipped, 
KOAST_ALLOW_BDC_CALENDAR_PUSH=true verified via controlled test on 
Villa Jamaica May 24)  
Scope: Visual polish pass across all 8 primary pages of the 
Koast PMS, with disciplined staged execution.

---

## Why this document exists

The Koast backend is production-grade. The UI is not. Eight pages need 
to move from "competent SaaS" to "product you'd recognize as 
category-defining." That work is a design exercise, not a code 
exercise — which means it fails quickly if executed as one mega-prompt 
against Claude Code.

This document commits to the design direction, page priority, shared 
primitives, and acceptance criteria. Per-page execution prompts are 
embedded below and fired one at a time across future sessions. Each 
page's result informs the next.

Total scope: approximately 40–60 hours of Claude Code execution 
across 8 sessions. No single prompt exceeds 8 hours.

---

## Design principles (non-negotiable)

These apply to every page. Any deviation in an individual page prompt 
must explicitly call out the deviation and why.

### 1. Restraint over ambition

Koast's aesthetic target is Airbnb Cereal-level restraint. Not 
Bloomberg Terminal density. Not Stripe's marketing-page gloss. The 
product earns its presence by getting out of the way of the decisions 
hosts are making.

Concrete translations:
- White or near-white backgrounds (#FFFFFF or #FAFAF7). Never tinted 
  glass. Never backdrop-blur.
- No borders on cells, tiles, or content containers unless the border 
  carries semantic meaning (e.g. selection outline).
- No gradients anywhere. No drop shadows except functional focus rings 
  and the single ambient glow on the Pricing insight card (preserved 
  from DESIGN_SYSTEM.md Section 17.4).
- No Instrument Serif. No font-family mixing. Plus Jakarta Sans is 
  the only typeface for the entire product.
- No emoji. No pulsing dots. No celebrate-moment confetti.

### 2. Bars are the hero on data surfaces

Where data flows across time (Calendar, booking sequences, pricing 
history), the data element itself is the visual anchor. Not the 
container around it.

Concrete translations:
- Booking bars: 48px tall, pill-shaped with asymmetric corner radii 
  (33px on continuation side, 100px on capped side). Bar background: 
  platform-specific color (Airbnb pink #FF385C, Booking.com blue 
  #003580, Direct gold #C49A5A) at 70% opacity for subtlety.
- Bars span multiple date columns as single continuous elements, not 
  stitched cell-by-cell fragments.
- Container cells for bars are transparent: no border, no background, 
  no radius.

### 3. Typography hierarchy via weight, not face

One family, multiple weights. Hierarchy comes from size jumps and 
weight contrast, not from introducing a display face.

Concrete translations:
- Plus Jakarta Sans only. Weights: 400 (body), 500 (emphasis), 600 
  (headers), 700 (hero numbers).
- Hero number scale: 48px (major hero like Dashboard month revenue), 
  32px (page heroes like selected-date rate), 18px (section stats), 
  14px (body), 11px (metadata/eyebrow).
- Line-height: 1.15 on hero numbers and headers, 1.5 on body, 1.3 on 
  secondary copy.
- Letter-spacing: -0.02em on 32px+, -0.01em on 18px–31px, 0 on body, 
  +0.1em uppercase eyebrows.

### 4. Color as semantic layer, not decoration

Koast's coastal palette is preserved but used sparingly and 
semantically. Colors encode meaning (status, urgency, confidence, 
channel). Colors do not decorate containers.

Concrete translations:
- Coastal green (#17392A) is the primary text color, not a background.
- Gold (#C49A5A) is reserved for Koast-initiated moments: 
  recommendations, confidence highlights, the "Koast thinks" insight. 
  Never used for neutral UI elements.
- Lagoon green (#1A7A5A) indicates synced/healthy/positive state.
- Coral reef (#C44040) indicates act-now urgency.
- Amber tide (#D4960B) indicates partial/fallback/warning.
- Tideline (#3D6B52) is the secondary text color.
- Shore (#F7F3EC) and dry sand (#EDE7DB) are no longer used as page 
  backgrounds (previously used as surface tints). They remain 
  available for subtle callouts like inferred-rules banners.

### 5. Persistent rails for decision-heavy pages

Pages where the host makes decisions (Calendar, PropertyDetail, 
Pricing, Reviews) have a persistent right rail showing the context of 
the current selection. The rail is quiet infrastructure: white 
background, collapsible, Linear-style.

Pages that are primarily navigational (Dashboard, Properties list, 
Messages thread list) do not have a right rail.

Concrete translations:
- Rail default width: 360px. Collapsible to 0 via cmd+/ or edge drag.
- Rail background: #FFFFFF with 1px left border in hairline gray 
  (#E5E2DC).
- Rail header height: 52px. Header contains selection context + 
  collapse button.
- Rail scrolls independently of the main surface.

### 6. Motion is physical, not decorative

Transitions communicate what just happened or what's about to happen. 
They do not exist for delight alone.

Concrete translations:
- Use cubic-bezier(0.34, 1.56, 0.64, 1) — slight overshoot — for 
  interactions that have weight (dragging a bar, selecting a date, 
  opening a panel).
- Use cubic-bezier(0.4, 0, 0.2, 1) — material standard — for UI 
  chrome (button hover, background color shifts).
- Entrance animations: 180ms default, 240ms for heavy content. Never 
  longer.
- Never pulse. Never bounce. Never shimmer except for loading skeletons.

### 8. Restraint over decoration

When in doubt, remove. Every visual element must earn its weight.
Hairlines over borders, colored dots over chips, plain text over
pills where possible. This principle overrides earlier session
ambitions when they stacked visual weight (shadows + chips + filled
icon backgrounds + tinted status overlays) on a single surface.

### 9. Single visual focal point per page

Each page has exactly one dramatic moment. Dashboard's is the dark
Pricing intelligence card in "Today's focus." PropertyDetail's is
the Scorecard. Everything else is flat, light, or ambient. No
competing gradients, no competing shadows, no second dark card on
the same surface.

### 10. Status through color, not chrome

A 7–8px colored dot next to a label communicates state better than
a bordered chip with background fill. Reserve filled chips for
user-facing CTAs or high-contrast labels ("Add property"). Ambient
surfaces like Dashboard rely on StatusDot + plain text for state.

### 7. No PDF feel

A working heuristic: if a printed screenshot would look defensible as 
a document page, the design is wrong. Products feel different from 
documents because they move, respond, and indicate live state.

Concrete translations:
- Every selectable element must have distinct default, hover, 
  pressed, and selected states.
- Every data surface must show freshness (last synced timestamp, 
  "updated just now", etc.) in at least one place per page.
- Interactive affordances (draggable bars, editable rates, 
  click-to-expand sections) must signal their interactivity through 
  cursor changes and subtle motion on hover.

---

## Shared primitives

These components are built during the Calendar rebuild (page 1) and 
inherited by all subsequent pages. No page may rebuild a primitive 
that already exists; extension is allowed, rebuilding is not.

### KoastButton

Sizes: sm (30px), md (36px), lg (42px).  
Variants: primary (coastal green bg, shore text), secondary (white bg, 
coastal border, coastal text), ghost (transparent bg, tideline text, 
hover adds rgba(23,57,42,0.06) bg), danger (coral-reef bg, shore text).  
Icons left or right, 16×16 SVG. Loading state: spinner replaces left 
icon, label stays.  
Radius: 10px.  
Location: src/components/polish/KoastButton.tsx.

### KoastCard

Default: white bg, no border, no shadow. Used as content surface.  
Variant "elevated": adds 1px hairline border (#E5E2DC), 16px radius.  
Variant "quiet": #FAFAF7 bg, no border. Used for inferred/default state 
banners.  
Variant "dark": coastal green bg, shore text. Reserved for the single 
Dashboard hero moment and the Pricing insight card.  
Padding: 20px default, 24px for elevated.  
Location: src/components/polish/KoastCard.tsx.

### KoastChip

Size: 24px height, 12px font.  
Variants: neutral (hairline border), success (lagoon text on 
lagoon/10% bg), warning (amber text on amber/10% bg), danger (coral 
text on coral/10% bg), koast (gold text on gold/10% bg).  
Radius: full (pill).  
Location: src/components/polish/KoastChip.tsx.

### KoastRate

Formatted dollar amount with semantic variants.  
Variants: hero (48px, weight 700, coastal), selected (32px, weight 
600, coastal), inline (14px, weight 500, coastal), quiet (14px, 
weight 400, tideline), struck (14px, weight 400, tideline, 
line-through 60% opacity for closed dates).  
Uses font-variant-numeric: tabular-nums always.  
Accepts optional delta prop: renders arrow + delta in gold (positive) 
or tideline (negative, no color — rate drops are not failures).  
Location: src/components/polish/KoastRate.tsx.

### KoastBookingBar

The core Calendar primitive. Absolute-positioned bar spanning N days.  
Props: platform ('airbnb' | 'booking' | 'direct'), guest, checkIn, 
checkOut, position ('standalone' | 'start' | 'middle' | 'end').  
Height: 48px. Border-radius computed from position.  
Background: platform color at 70% opacity in default state, 85% on 
hover.  
Content: guest name (first name + last initial) + platform logo on 
start/standalone positions. Empty on middle. Check-out chevron on end.  
Hover: translateY(-1px), shadow 0 4px 14px rgba(19,46,32,0.18).  
Location: src/components/polish/KoastBookingBar.tsx.

### KoastRail

Persistent right-rail container. 360px default, collapsible.  
Props: open (boolean), onToggle, header (ReactNode), children.  
Keyboard: cmd+/ toggles. Escape closes.  
Animation: 220ms with standard material curve on width change.  
Location: src/components/polish/KoastRail.tsx.

### KoastSelectedCell

Semantic indicator of selected state. 2px lagoon border, inset 
box-shadow, slight lift.  
Used by Calendar, PropertyDetail, Pricing.  
Location: src/components/polish/KoastSelectedCell.tsx.

### KoastSignalBar

Horizontal bar visualization for a single pricing signal.  
Props: label, score (0–1), weight, confidence.  
Fill width = score × 100%. Weight label right-aligned. Color: gold if 
confidence ≥ 0.6, gold/40% if lower.  
Location: src/components/polish/KoastSignalBar.tsx.

### KoastEmptyState

Unified empty-state pattern for any list or grid.  
Props: title, body, action (optional button).  
Icon slot renders a single-color line SVG at 48px. Never a color 
illustration.  
Location: src/components/polish/KoastEmptyState.tsx.

---

## Page priority order

Pages are rebuilt in this order. Each informs the next.

| Order | Page | Reason | Est. hours |
|-------|------|--------|-----------:|
| 1 | Calendar | Highest visual complexity; establishes all primitives | 8 |
| 2 | PropertyDetail (Pricing tab especially) | Highest user value; consumes usePricingTab from PR D; closes the Stage 1 loop | 7 |
| 3 | Dashboard | First-impression surface; validates primitives work outside a data-heavy page | 5 |
| 4 | Properties list | Pattern-matches Dashboard's card language | 3 |
| 5 | Messages | Tests primitives in a conversation/thread context | 5 |
| 6 | Reviews | Shares layout with Messages; reinforces primitives | 3 |
| 7 | Turnovers | Operational surface; tests date-range interactions | 4 |
| 8 | Market Intel + Comp Sets | Tests signal/confidence primitives at scale | 5 |

Total estimate: 40 hours.

---

## Acceptance criteria (applies to every page)

A page passes review when all seven are true:

1. No PDF feel. Every selectable element has distinct default, 
   hover, pressed, and selected states. At least one live indicator 
   visible (sync timestamp, recency, live data freshness).
2. Primitives only. No per-page one-off components. Every button, 
   card, chip, rate, bar, chip, signal, rail, empty state comes from 
   the shared primitives library.
3. Typography compliant. Plus Jakarta Sans only. Weight scale per 
   principle 3.
4. Color compliant. Coastal palette used semantically per 
   principle 4. No decorative color.
5. Motion compliant. 180ms default transitions. Material curve 
   for chrome, spring curve for weight. No pulse or shimmer except 
   loading skeletons.
6. Decision-rail semantics. Pages with selection have persistent 
   rail. Pages that are navigational do not.
7. Console clean. No React warnings, no unhandled rejections, no 
   missing keys, no hydration mismatches.

---

## Shipping discipline

Each page ships as its own PR. No exceptions. Commit messages follow:

````
Track B polish pass: <page name>
- <high-level change 1>
- <high-level change 2>
- Shared primitives introduced: <list> (if any net-new)
- Primitives consumed: <list>
Closes polish pass session N of 8.
````

After each page ships:
1. Cesar reviews in staging. Screenshots captured in 
   docs/polish-pass/<page>/after.png for record.
2. Any breaking deviation from this master plan is noted at the 
   bottom of this document under "Spec corrections" with a reason.
3. Next page's prompt starts with: "Read the latest MASTER PLAN 
   including corrections" as its pre-flight step.

---

## Per-page execution prompts

### Session 1 — Calendar rebuild

````
Read ~/staycommand/CLAUDE.md, repomix-output.xml, 
~/staycommand/KOAST_POLISH_PASS_MASTER_PLAN.md (entire file, pay 
special attention to Shared Primitives and Design Principles), 
~/staycommand/src/app/(dashboard)/calendar/page.tsx (current), 
and ~/staycommand/src/hooks/usePricingTab.ts first.

/ultraplan

Polish pass session 1 of 8 — Calendar rebuild.

SCOPE: Rebuild the Calendar page visually. Preserves all existing 
data fetching, iCal integration, and backend behavior. No API 
changes. No new backend routes.

WHAT'S CHANGING:
- Drop the existing 3-property horizontal strip layout
- Ship a single-property monthly grid view with persistent right rail
- Single-property selector lives in the top bar (switch property ↕️)
- Four months visible by default (current + 3 forward), scroll 
  reveals more
- Booking bars become the visual hero (KoastBookingBar primitive)
- Rates are quiet supporting content (KoastRate primitive, "quiet" 
  variant)
- Persistent right rail shows selected date context (KoastRail 
  primitive)
- All 8 shared primitives are built during this session and placed 
  in src/components/polish/

LAYOUT SPECIFICS:
- Top chrome: 56px, coastal breadcrumb on left ("Koast › Properties 
  › [Property] › Calendar"), action buttons on right (switch 
  property, sync now, push to channels)
- Property hero: 132px square thumb + 48px property name + 13px 
  meta row + connection chip row. No serif. All Plus Jakarta Sans.
- Calendar surface: flex layout, NOT CSS grid (per Airbnb's pattern — 
  allows continuous bar spans)
- Day cells: transparent, no border, no radius, 168px × 132px 
  minimum at desktop width
- Day number: 14px weight 500 coastal, top-left of cell
- Rate: 18px weight 400 tideline, below day number, never below the 
  booking bar
- Booking bars: absolutely positioned, span multiple cells, pill 
  corners with asymmetric radii (33px continuation, 100px cap)
- Month headers: 32px weight 600 coastal, line-height 1.15, 
  letter-spacing -0.02em. Month year in 11px weight 500 tideline 
  eyebrow above.
- Per-month stats in header right: occupancy %, revenue potential, 
  act-now count (coral text if > 0)
- Right rail: 360px, collapsible. Shows selected date's: date (32px 
  weight 600), current rate + koast suggested rate, delta, 
  per-channel breakdown, Koast insight card (preserves dark variant 
  with ambient glow from DESIGN_SYSTEM.md 17.4), Dismiss/Apply 
  buttons, status chips, signal breakdown preview (top 5 signals).

DATA:
- Consumes usePricingTab hook from PR D as-is
- Bookings: existing /api/properties/[id]/bookings response
- Channel rates per date: existing /api/channels/rates endpoint
- Do NOT modify any API. If data shape needs adjustment, note it in 
  the report instead of changing it.

ENTRANCE CHOREOGRAPHY:
- Property hero: fadeSlideIn at 0ms
- Calendar grid: fadeSlideIn at 120ms
- Rail: slide from right at 240ms

VERIFY BEFORE COMMIT:
1. tsc + lint clean
2. Console clean against Villa Jamaica in dev
3. Six primitives rendered at least once on this page. Screenshot 
   proof in docs/polish-pass/calendar/after.png.
4. Rail collapses via cmd+/
5. Selected date updates rail content correctly
6. No reference to Instrument Serif anywhere in CSS or JSX
7. No glass/backdrop-blur in any style block
8. Acceptance criteria 1–7 pass

COMMIT MESSAGE:
"Track B polish pass: Calendar rebuild

- Single-property monthly grid with persistent right rail
- Shared primitives introduced: KoastButton, KoastCard, KoastChip, 
  KoastRate, KoastBookingBar, KoastRail, KoastSelectedCell, 
  KoastSignalBar, KoastEmptyState
- No API changes; consumes usePricingTab
Closes polish pass session 1 of 8."

OUT OF SCOPE:
- PropertyDetail polish (session 2)
- Dashboard polish (session 3)
- Drag-to-select range editing (session 7, Turnovers)
- Bulk rate editing UI (stage 2 post-polish)
- Mobile responsive (separate track)

REPORT:
1. Files created (paths + line counts)
2. Primitives built vs inherited
3. Any deviations from this prompt and why
4. Any data-shape issues surfaced that need API work later
5. Commit size
6. Screenshot saved to docs/polish-pass/calendar/after.png
````

### Session 2 — PropertyDetail + Pricing tab rebuild

Fire after session 1 ships and is reviewed.

````
[PROMPT TO BE FINALIZED AFTER SESSION 1 — review Calendar build, 
adjust primitive specs if needed, then copy-paste session 1's 
structure with PropertyDetail-specific scope. Key points: 
PropertyDetail has three tabs (Overview, Calendar, Pricing). Only 
Pricing tab needs full rebuild using all four sections from product 
spec 4.5.3 (scorecard, recommendations list, rules editor, 
performance panel). Calendar tab inside PropertyDetail can reuse 
the Calendar page primitives directly.]
````

### Session 3 — Dashboard rebuild

````
[PROMPT TO BE FINALIZED AFTER SESSION 2 — Dashboard is primarily 
navigational, no right rail needed. Hero zone shows today's 
operational summary (check-ins, departures, portfolio occupancy, 
revenue MTD). Property cards use KoastCard elevated variant. 
Action row at top. Activity feed below.]
````

### Sessions 4–8

````
[PROMPTS TO BE FINALIZED AS PRIOR SESSIONS SHIP. Each session's 
prompt is written in the session before it closes, with the benefit 
of everything learned in prior sessions. Do not attempt to write 
prompts 4–8 in advance — the learning from sessions 1–3 will change 
what they need to say.]
````

---

## Spec corrections

### After Session 1.5 (Calendar fixes, commit e48d9d8)

Visual fidelity corrections — caught via browser devtools review 
of deployed Session 1 build:

3. KoastBookingBar uses alpha-baked platform colors.
   Default state: platform color at 0.70 alpha. Hover: 0.85 alpha.
   Never apply CSS opacity to the bar element (would fade text). 
   Apply alpha in the background color value directly.

4. KoastRate delta semantics are color-encoded.
   Positive delta: gold, up-triangle. Negative delta: tideline, no 
   arrow (or quiet down-triangle in tideline). Zero: em-dash in 
   tideline. Never red. Rate drops are informational, not failures.

### After booking-bar inset fix (commit 7a0345f)

5. KoastBookingBar uses uniform 14px horizontal padding on the bar 
   root, not position-dependent cap padding. The earlier experiment
   with 32/44/56px "cap" padding overcorrected — 14px on both sides
   clears the pill curve at the bar heights used (42–48px desktop,
   28px mobile) and keeps the inset identical across start/middle/end
   segments.
   The platform logo is a plain 14×14 <Image> on desktop, 12×12 on
   mobile (compact mode). No circular chip wrapper. Border-radius
   rules (100px cap, 33px continuation) stay untouched — they encode
   position semantically.

### After Session 2 (PropertyDetail + Pricing tab rebuild)

6. CalendarView gains `showSwitcher?: boolean` (default true). When
   embedded inside PropertyDetail's Calendar tab, the consumer
   passes `showSwitcher={false}` to hide the top-chrome property
   switch button + menu (the surrounding tab already scopes to one
   property). Extension, not a new primitive.

7. KoastRate delta rendering is canonical. Every consumer on
   PropertyDetail (Scorecard, RecRow, WhyThisSuggestion audit,
   Preview Modal change rows) routes delta rendering through the
   KoastRate primitive's `delta` prop. No bespoke arrow/color logic
   lives outside the primitive.

8. PreviewModal overlay uses `position: absolute` inside a
   relative-positioned PricingTab wrapper — NOT `position: fixed` —
   per the flex-based overlay directive. Toasts still use fixed
   positioning (they are screen-anchored status, not modal content).

### After Session 2.5 (PropertyDetail Pricing tab layout rebuild)

9. KoastRate renders numeric values through `Intl.NumberFormat('en-US')`.
   All variants + delta magnitude. "$15,177" not "$15177". Applied
   once in the primitive — every consumer inherits the formatting.

10. Nullable rates flow through primitives without coalescing.
    `current_rate=null` renders as em-dash. `delta_abs=null` renders
    as em-dash. Never substitute `suggested_rate` or a computed
    value — transparency about missing data is part of the product's
    honesty.

11. Recommendations lists paginate to 20 per urgency group.
    "Show N more" expander reveals up to 20 additional rows at a
    time. Pagination state resets when the underlying rec count
    changes (new fetch).

12. PropertyDetail Pricing tab uses KoastRail (reversal of earlier
    spec — the master plan's "NOT USED on PropertyDetail" note was
    wrong). Decision-heavy surfaces warrant persistent rails;
    Calendar and PropertyDetail both qualify. Future decision-heavy
    pages (Market Intel, Reviews) should follow the same pattern.

13. KoastRail supports both dark and light surfaces via a new
    `variant: 'dark' | 'light'` prop. Light is the default and
    matches the PropertyDetail Pricing rail (white bg, hairline
    border). `variant='dark'` swaps to coastal background with a
    muted rule for the deep-sea Calendar rail or similar future
    decision surfaces. KoastRail also gains `keyboardToggle` which
    defaults to true; embedded rails pass `false` when the
    cmd+/-to-toggle binding would conflict or feel out of place.

14. Full-width dashboard-shaped surfaces use
    `max-w-[1760px] mx-auto px-10`. PropertyDetail's earlier
    1200px cap was too narrow for three-row grid layouts. Sessions
    3+ (Dashboard, Properties list, Market Intel) default to 1760
    unless their content is narrative (Messages, Reviews thread)
    in which case 900px is fine.

15. Property hero images use `next/image` with an explicit `sizes`
    prop (`(max-width: 1760px) 100vw, 1760px`) and `priority`.
    Never raw `<img>` for hero or card thumbnails — Vercel's image
    optimizer generates srcset variants at build time and the
    browser picks the right one. Source-image quality itself is
    tracked separately in CLAUDE.md → Known Gaps → Image Assets.

16. PortfolioSignalSummary is a composite extension to the polish
    primitives library, built from KoastCard + KoastSignalBar +
    KoastEmptyState. Business logic (`aggregateSignalContribution`)
    lives in `src/lib/pricing/aggregate-signals.ts` so non-UI
    callers (reports, server-side summaries) can reuse it. When a
    future surface needs a different aggregation shape, extend the
    helper rather than duplicating the math.

### After Session 3 (Dashboard rebuild)

17. Next/image + `remotePatterns` are a deploy-time contract.
    Adding a new image host requires both the `<Image>` usage AND
    an entry in `next.config.mjs` `images.remotePatterns`. Without
    the config entry, `/_next/image` returns 400 with
    INVALID_IMAGE_OPTIMIZE_REQUEST. Audit hosts with
    `SELECT DISTINCT SUBSTRING(cover_photo_url FROM '^https?://([^/]+)')
    FROM properties WHERE cover_photo_url IS NOT NULL;` before
    adding properties from a new source.

18. KoastSegmentedControl is the canonical pill-toggle primitive.
    Binary/ternary choices (Today's range, active/inactive filters,
    view switches) render through it instead of bespoke pill groups.
    The Session 2.8 PropertyDetail tab strip predates this primitive
    and will migrate to it on its next touch.

### After Session 3.5 (Dashboard width + copy fixes)

19. The (dashboard) route layout shell must NOT cap width. Each page
    in the group sets its own `max-w-[1760px]` (or narrower for
    narrative surfaces) container. The legacy `max-w-[1200px] mx-auto`
    wrapper was removed in Session 3.5 because it silently squashed
    every polish-pass page. The shell still applies consistent padding
    (`p-4 md:p-8`) and the `page-enter` animation hook.

20. Metric strips use explicit responsive column counts, not
    `auto-fit`. `auto-fit`/`auto-fill` with `minmax()` is convenient
    but produces unreliable counts at in-between breakpoints — three
    cards can unexpectedly become a 3-column/1-column hybrid.
    Prefer `grid-cols-1 md:grid-cols-2 xl:grid-cols-4` (or explicit
    `repeat(N, 1fr)` with matching media queries) so the count is
    deterministic at each breakpoint.

21. Action/task card copy follows the urgency + domain eyebrow,
    sentence-case title, action-verb CTA pattern. ALL CAPS is
    reserved for eyebrows only. When server-side copy is still
    shouty, the client-side `formatAction` helper reshapes at the
    render boundary; the proper long-term fix is to emit polished
    copy server-side in the command-center endpoint.

### After Session 3.6 (null-safe opportunity aggregation)

22. Null-delta recommendations must be filtered out of aggregations
    rather than summed as zero. Portfolio aggregators track
    `measurableCount` / `unmeasurableCount` separately and expose
    a positive-only `upside` sum. When a dominant fraction of recs
    lack measurable deltas (`current_rate=null`), surface an
    honest "N pending measurement" subtitle/chip instead of a
    misleading $0 hero. Proper long-term fix is to backfill
    `current_rate` at the data layer (booking_sync / rate history)
    so recs become measurable — tracked as a separate concern.

### After Session 3.7 (Dashboard Quiet-direction rebuild)

23. Dashboard uses plain `<article>`/`<div>` elements, not KoastCard,
    when the design calls for hairline-only containment without
    elevation. KoastCard is for elevated/dark/quiet contexts across
    PropertyDetail and PricingTab; Dashboard's Quiet direction uses
    flat containment (hairline border, 16px radius, no shadow at
    rest) for property + action cards.

24. StatusDot is the default state-language primitive on ambient
    surfaces. 7–8px colored dot, optional 3px halo, four tones: ok
    (lagoon), warn (amber), alert (coral), muted (tideline 40%).
    Replaces filled status chips and icon-background chips as the
    state-expression primitive on Dashboard and action cards.

25. Sparkline trend strokes follow the data direction, not the
    product's Koast-moment palette. Up → lagoon, flat → golden,
    down → coral-reef. This is the one Dashboard exception to the
    "never red for merely negative numbers" rule (Spec Correction 4)
    — sparklines visualize a directional signal where red for down
    is universally expected (finance convention).

26. Fraunces serif is the Dashboard display face for the Greeting
    headline and the Pricing-intelligence card title. Loaded via
    `next/font/google` in `src/app/layout.tsx`. Every other Koast
    surface stays on Plus Jakarta Sans — do not mix faces on the
    same surface outside of this carve-out.

### After Session 3.9 (handwritten greeting animation)

27. Handwritten greeting animates on first browser-session visit
    only. Session gate: `sessionStorage["koast:greeting-animated"]`.
    `prefers-reduced-motion: reduce` bypasses the animation entirely
    and renders the final state immediately. Source component
    `src/components/polish/HandwrittenGreeting.tsx` ports the Claude
    Design handoff reference at `koast-design-system/project/ui_kits/
    app/components/HandwrittenGreeting.jsx`. The handoff SVG (stroke-
    based) is archived under `src/components/polish/assets/greeting/`
    for future session use; the shipped component uses live Fraunces
    text with expressive axes + clip-path reveal instead, which is
    what the reference component renders.

28. Fraunces is loaded with its expressive variable-font axes
    (`opsz`, `SOFT`, `WONK`) via `next/font/google`'s `axes` option.
    The handwritten greeting uses `font-variation-settings: "opsz"
    144, "SOFT" 100, "WONK" 1` to get the loose pen-like cadence at
    large sizes. Other Fraunces consumers (Pricing-intelligence
    title) use the default axes and stay crisp.

### After Session 4 (Dashboard finishing touches)

29. Top bar search is a platform-level affordance. Placeholder
    "Search properties, guests, messages…" communicates cross-entity
    search. Cmd/Ctrl+K focuses the input from anywhere. Pill sits
    centered in the layout shell top bar on desktop, hidden below
    900px (mobile icon-button expansion deferred).

30. Property cards surface channel connection via a "CONNECTED ON"
    eyebrow + 22px non-interactive pill logos between the location
    line and the context block. Supported enum: 'airbnb' | 'booking'
    | 'direct'. Logos reuse canonical `/public/icons/platforms/` SVGs
    through `src/lib/platforms.ts` (DESIGN_SYSTEM.md rule: never
    approximate platform logos) — Session 4 did NOT duplicate them
    under `src/components/polish/assets/platforms/` as the session
    prompt suggested; that would have forked the source of truth.
    Superseded by Spec Correction 32 — eyebrow dropped, pills scale
    up.

### After Session 4.5 (command palette + pill polish)

31. Top bar search is a command palette TRIGGER, not a live input.
    The visible pill in the top bar is a `<button>` that opens an
    overlay command palette on click or ⌘K. This decision reserves
    the global-search feature space for a future Vercel/Linear-style
    palette. The current overlay is a placeholder shell; real search
    results land in a future session. The ⌘K listener lives inside
    CommandPalette itself so the shortcut works even when the
    trigger is hidden (mobile).

32. PlatformPills render at 32×32 pill / 18×18 logo / 10px gap with
    no eyebrow label. The logos carry their own brand recognition
    — a descriptive eyebrow dilutes the signal. Empty state stays
    a muted "No channels" italic pill. Supersedes the eyebrow +
    22×22 pattern from Spec Correction 30.

---

## Out of scope for polish pass

The following are intentionally deferred:
- Mobile responsive / native app — separate track
- Onboarding flow polish — session will come after Stage 2 auth work
- Drag-to-select bulk rate editing — Stage 2
- Daily digest email design — Stage 2 when C2 is built
- Host-facing insights email templates — Stage 2
- Settings pages — minimal polish, functional UI is sufficient
