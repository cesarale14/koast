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

---

## Out of scope for polish pass

The following are intentionally deferred:
- Mobile responsive / native app — separate track
- Onboarding flow polish — session will come after Stage 2 auth work
- Drag-to-select bulk rate editing — Stage 2
- Daily digest email design — Stage 2 when C2 is built
- Host-facing insights email templates — Stage 2
- Settings pages — minimal polish, functional UI is sufficient
