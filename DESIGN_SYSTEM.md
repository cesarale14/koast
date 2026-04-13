# Koast — DESIGN_SYSTEM.md
# Read this file before touching ANY UI code.

## CRITICAL RULES
1. **Never use default Tailwind grays.** All borders, backgrounds, and text use Koast tokens.
2. **Never use `shadow-md`, `shadow-lg` etc.** Use the exact shadow stacks defined here.
3. **Never invent new colors.** Every color must come from this palette.
4. **Never use rounded-md or rounded-lg generically.** Use the exact radius tokens.
5. **Copy component code exactly.** Don't "improve" or "simplify" — the details ARE the design.
6. **Platform logos must be real.** Use actual Airbnb/BDC brand marks, never colored circles with letters.

---

## 1. COLOR PALETTE

### CSS Variables (globals.css)
```css
:root {
  /* Primary — Deep coastal greens */
  --deep-sea: #132e20;       /* Marketing bg, hero sections, login screen */
  --coastal: #17392a;        /* Sidebar bg, headings, stat values */
  --mangrove: #1f4d38;       /* Sidebar hover, secondary dark surfaces */
  --tideline: #3d6b52;       /* Icons, muted text, secondary text */

  /* Accent — Golden hour warmth */
  --golden: #c49a5a;         /* Primary accent, CTAs, active nav, section labels */
  --driftwood: #d4b47a;      /* Light accent, hover states on gold */
  --sandbar: #e8d5b0;        /* Accent backgrounds, light fills */

  /* Neutral — Sandy shore tones */
  --shore: #f7f3ec;          /* Product page background */
  --dry-sand: #ede7db;       /* Borders, card bg, dividers */
  --shell: #e2dace;          /* Input borders, disabled states */

  /* Semantic */
  --coral-reef: #c44040;     /* Errors, overbooking alerts, destructive actions */
  --amber-tide: #d4960b;     /* Warnings, cleaning tasks, urgency */
  --lagoon: #1a7a5a;         /* Success, synced, confirmed, available */
  --deep-water: #2a5a8a;     /* Info, badges, links */

  /* Platform brand colors (reference only — use for logo backgrounds) */
  --airbnb: #FF385C;
  --bdc: #003580;
  --vrbo: #3B5998;

  /* Booking bar */
  --bar-dark: #222222;       /* Standard booking bar background */
}
```

### Tailwind Config Mapping
```js
// tailwind.config.ts
colors: {
  'deep-sea': '#132e20',
  'coastal': '#17392a',
  'mangrove': '#1f4d38',
  'tideline': '#3d6b52',
  'golden': '#c49a5a',
  'driftwood': '#d4b47a',
  'sandbar': '#e8d5b0',
  'shore': '#f7f3ec',
  'dry-sand': '#ede7db',
  'shell': '#e2dace',
  'coral-reef': '#c44040',
  'amber-tide': '#d4960b',
  'lagoon': '#1a7a5a',
  'deep-water': '#2a5a8a',
  'bar-dark': '#222222',
  'airbnb': '#FF385C',
  'bdc': '#003580',
}
```

### Rules
- **Borders:** Always `border-dry-sand` or `border-shell`. NEVER `border-gray-200`.
- **Page background:** Always `bg-shore`. NEVER `bg-gray-50` or `bg-white`.
- **Text primary:** `text-coastal`. NEVER `text-gray-900`.
- **Text secondary:** `text-tideline`. NEVER `text-gray-500`.
- **Text muted:** `text-shell`. Only for disabled states.

---

## 2. TYPOGRAPHY

Font: **Plus Jakarta Sans** (via `@fontsource-variable/plus-jakarta-sans`)

| Element | Size | Weight | Tracking | Color | Class |
|---------|------|--------|----------|-------|-------|
| Page heading | 20px | 700 | -0.02em | coastal | `text-xl font-bold tracking-tight text-coastal` |
| Dashboard greeting | 28px | 700 | -0.02em | coastal | `text-[28px] font-bold tracking-tight text-coastal` |
| Stat value (large) | 32px | 700 | -0.03em | coastal | `text-[32px] font-bold tracking-[-0.03em] text-coastal` |
| Stat value (card) | 18px | 700 | -0.03em | coastal | `text-lg font-bold tracking-[-0.03em] text-coastal` |
| Section label | 11px | 700 | 0.08em | golden | `text-[11px] font-bold tracking-[0.08em] uppercase text-golden` |
| Nav label | 10px | 700 | 0.1em | tideline | `text-[10px] font-bold tracking-[0.1em] uppercase text-tideline` |
| Body text | 14px | 400 | normal | coastal | `text-sm text-coastal` |
| Secondary text | 13px | 500 | normal | tideline | `text-[13px] font-medium text-tideline` |
| Small text / captions | 12px | 500 | normal | tideline | `text-xs font-medium text-tideline` |
| Tiny text | 11px | 600 | normal | tideline | `text-[11px] font-semibold text-tideline` |

### Rules
- **Stat numbers:** Always use `-0.03em` letter-spacing. Never default tracking.
- **Section labels:** Always uppercase + wide tracking + golden color. This is the #1 visual signature.
- **Never use font-black (900).** Heaviest weight is 800, used only for logo mark.

---

## 3. SHADOWS

### Shadow Stacks (NEVER use Tailwind shadow utilities)
```css
/* Flat card (default resting state) */
--shadow-card: 0 1px 3px rgba(19,46,32,0.08), 0 8px 32px rgba(19,46,32,0.04);

/* Elevated card (hover state) */
--shadow-card-hover: 0 4px 12px rgba(19,46,32,0.1), 0 20px 60px rgba(19,46,32,0.12);

/* Glass card (glossy components) */
--shadow-glass: 0 1px 1px rgba(19,46,32,0.02), 0 4px 8px rgba(19,46,32,0.04), 0 12px 36px rgba(19,46,32,0.06), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(19,46,32,0.04);

/* Glass card hover */
--shadow-glass-hover: 0 2px 4px rgba(19,46,32,0.03), 0 8px 16px rgba(19,46,32,0.06), 0 24px 56px rgba(19,46,32,0.1), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(19,46,32,0.04);

/* Sidebar */
--shadow-sidebar: 4px 0 40px rgba(0,0,0,0.3);

/* Logo mark glow */
--shadow-logo-glow: 0 2px 12px rgba(196,154,90,0.4);
```

### Rules
- All shadows use `rgba(19,46,32,...)` (deep-sea based). NEVER pure black `rgba(0,0,0,...)` except sidebar.
- Glass cards have `inset 0 1px 0 rgba(255,255,255,1)` — this is the top highlight. Never skip it.
- Active nav indicator: `box-shadow: 0 0 12px rgba(196,154,90,0.6)` — golden glow.

---

## 4. BORDER RADIUS

| Token | Value | Use |
|-------|-------|-----|
| `rounded-lg` | 16px | Cards, modals, property photos |
| `rounded-[14px]` | 14px | Channel rate cards, booking info |
| `rounded-xl` | 18px | Glass stat cards |
| `rounded-[10px]` | 10px | Nav items, inputs, buttons, feed icons |
| `rounded-lg` (8px) | 8px | Booking bars, small badges, inner elements |
| `rounded-full` | 50% | Avatars, toggle knobs, today indicator |

---

## 5. TRANSITIONS & HOVER

### Standard hover lift (cards)
```css
transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);

/* Hover state: */
transform: translateY(-6px) scale(1.01);

/* Active/press state: */
transform: translateY(-2px) scale(0.995);
```

### Subtle hover lift (stat cards, rate cards)
```css
transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

/* Hover state: */
transform: translateY(-3px) scale(1.005);
```

### Stagger animations (on page load)
```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
/* Apply with increasing delays: */
animation: fadeUp 0.5s ease-out both;
animation-delay: 0.05s; /* increment by 0.05s per item */
```

### Rules
- ALWAYS use `cubic-bezier(0.4, 0, 0.2, 1)` for hover transitions. Never `ease` or `linear`.
- Cards hover UP (negative translateY). Never change background on hover for cards.
- Booking bars: `filter: brightness(1.15)` on hover, plus `translateY(-1px)`.

---

## 6. COMPONENT LIBRARY

### 6.1 Sidebar Navigation

```tsx
// Sidebar container
<aside className="w-[220px] flex-shrink-0 flex flex-col"
  style={{
    background: 'linear-gradient(180deg, var(--deep-sea) 0%, #0e2218 100%)',
    boxShadow: 'var(--shadow-sidebar)',
    padding: '24px 14px',
  }}>

  {/* Logo */}
  <div className="flex items-center gap-[10px] px-[10px] mb-9">
    <div className="w-[30px] h-[30px] rounded-[7px] flex items-center justify-center text-sm font-extrabold text-deep-sea"
      style={{
        background: 'linear-gradient(135deg, var(--golden), #a87d3a)',
        boxShadow: 'var(--shadow-logo-glow)',
      }}>K</div>
    <span className="text-xl font-extrabold tracking-[-0.03em] text-golden">Koast</span>
  </div>

  {/* Nav item — active */}
  <div className="relative px-[10px] py-[9px] rounded-[8px] text-[12.5px] font-medium text-golden"
    style={{ background: 'rgba(196,154,90,0.08)' }}>
    {/* Active indicator bar */}
    <div className="absolute left-0 top-[7px] bottom-[7px] w-[3px] rounded-r-[2px] bg-golden"
      style={{ boxShadow: '0 0 10px rgba(196,154,90,0.5)' }} />
    Calendar
  </div>

  {/* Nav item — inactive */}
  <div className="px-[10px] py-[9px] rounded-[8px] text-[12.5px] font-medium hover:bg-white/[0.03] transition-all"
    style={{ color: 'rgba(168,191,174,0.6)' }}>
    Messages
  </div>

  {/* Section label */}
  <div className="px-[10px] mt-4 mb-[6px] text-[10px] font-bold tracking-[0.1em] uppercase text-tideline">
    Manage
  </div>
</aside>
```

### 6.2 Property Card (Dashboard)

```tsx
<div className="rounded-2xl overflow-hidden bg-white cursor-pointer transition-all duration-[350ms]"
  style={{
    boxShadow: 'var(--shadow-card)',
    transform: 'translateY(0) scale(1)',
  }}
  onMouseEnter={e => {
    e.currentTarget.style.transform = 'translateY(-6px) scale(1.01)';
    e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)';
  }}
  onMouseLeave={e => {
    e.currentTarget.style.transform = 'translateY(0) scale(1)';
    e.currentTarget.style.boxShadow = 'var(--shadow-card)';
  }}>

  {/* Photo with gradient overlay */}
  <div className="h-[160px] bg-cover bg-center relative"
    style={{ backgroundImage: `url(${property.photoUrl})` }}>
    <div className="absolute bottom-0 left-0 right-0 h-20"
      style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.5))' }} />

    {/* Status badge (glassmorphism) */}
    <span className="absolute top-3 right-3 px-[10px] py-1 rounded-full text-[11px] font-semibold"
      style={{
        backdropFilter: 'blur(12px)',
        background: 'rgba(26,122,90,0.25)',
        color: '#b8f0d8',
        border: '1px solid rgba(26,122,90,0.3)',
      }}>
      Guest in house
    </span>

    {/* Channel logos */}
    <div className="absolute bottom-3 left-3 flex gap-[6px] z-[2]">
      <img src="/icons/airbnb-logo.svg" className="w-[22px] h-[22px] rounded-[6px]" />
      <img src="/icons/bdc-logo.svg" className="w-[22px] h-[22px] rounded-[6px]" />
    </div>
  </div>

  {/* Body */}
  <div className="p-4 px-[18px]">
    <div className="text-[15px] font-bold text-coastal mb-[2px]">{property.name}</div>
    <div className="text-xs text-tideline mb-[14px]">{property.location}</div>

    {/* Stats row with dividers */}
    <div className="flex">
      {stats.map((stat, i) => (
        <div key={i} className="flex-1 text-center py-[10px] relative">
          {i < stats.length - 1 && (
            <div className="absolute right-0 top-2 bottom-2 w-px bg-dry-sand" />
          )}
          <div className="text-lg font-bold tracking-[-0.03em] text-coastal">{stat.value}</div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-golden mt-[2px]">
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  </div>
</div>
```

### 6.3 Glass Stat Card (Portfolio Performance)

```tsx
<div className="rounded-[18px] p-[22px] relative overflow-hidden transition-all duration-[250ms]"
  style={{
    background: 'linear-gradient(165deg, rgba(255,255,255,0.95) 0%, rgba(247,243,236,0.85) 50%, rgba(237,231,219,0.7) 100%)',
    backdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.6)',
    boxShadow: 'var(--shadow-glass)',
  }}>

  {/* Glossy reflection overlay */}
  <div className="absolute top-0 left-0 right-0 h-1/2 pointer-events-none rounded-t-[18px]"
    style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 100%)' }} />

  {/* Subtle top glow line (centered, fades at edges) */}
  <div className="absolute -top-px left-[20%] right-[20%] h-px pointer-events-none"
    style={{
      background: 'linear-gradient(90deg, transparent, var(--coastal), transparent)',
      boxShadow: '0 0 20px rgba(23,57,42,0.3)',
    }} />

  <div className="text-[32px] font-bold tracking-[-0.03em] text-coastal leading-none relative z-[1]">
    {value}
  </div>
  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-golden mt-[6px] relative z-[1]">
    {label}
  </div>
  <div className={`text-xs font-semibold mt-[10px] flex items-center gap-1 relative z-[1] ${
    trend > 0 ? 'text-lagoon' : 'text-coral-reef'
  }`}>
    {trend > 0 ? '▲' : '▼'} {Math.abs(trend)}% vs last month
  </div>
</div>
```

### 6.4 AI Insights Card

```tsx
<div className="rounded-2xl p-6 relative overflow-hidden"
  style={{
    background: 'linear-gradient(135deg, var(--deep-sea) 0%, #0e2218 100%)',
    color: 'var(--shore)',
  }}>
  {/* Ambient golden glow */}
  <div className="absolute -top-1/2 -right-[30%] w-[300px] h-[300px] rounded-full"
    style={{ background: 'radial-gradient(circle, rgba(196,154,90,0.1) 0%, transparent 70%)' }} />

  {/* Badge */}
  <div className="inline-flex items-center gap-[6px] px-[10px] py-1 rounded-full text-[11px] font-semibold mb-[14px]"
    style={{
      background: 'rgba(196,154,90,0.15)',
      color: 'var(--golden)',
      border: '1px solid rgba(196,154,90,0.2)',
    }}>
    <span className="w-[6px] h-[6px] rounded-full bg-golden animate-pulse" />
    Koast AI
  </div>

  <h3 className="text-base font-bold text-white mb-2">{title}</h3>
  <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'rgba(168,191,174,0.8)' }}>
    {description}
  </p>

  <div className="flex gap-2">
    <button className="px-4 py-2 rounded-lg text-xs font-semibold bg-golden text-deep-sea hover:bg-driftwood transition-all hover:-translate-y-px">
      {primaryAction}
    </button>
    <button className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
      style={{
        background: 'rgba(255,255,255,0.08)',
        color: 'rgba(168,191,174,0.8)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}>
      {secondaryAction}
    </button>
  </div>
</div>
```

---

## 7. CALENDAR — AIRBNB-STYLE

This is the most complex component. Follow these rules EXACTLY.

### 7.1 Layout Structure
```
┌──────────┬──────┬─────────────────────────────┬──────────────┐
│ Sidebar  │ Prop │  Calendar Grid              │ Rate Panel   │
│ Nav      │ List │  (7-col grid, square cells) │ (310px)      │
│ (220px)  │(80px)│                             │              │
└──────────┴──────┴─────────────────────────────┴──────────────┘
```

### 7.2 Property List (left thumbnails)
- Width: 80px column
- Thumbnails: 56x56px, `rounded-xl` (12px), `object-cover`
- Active state: 2px golden border + `box-shadow: 0 0 0 3px rgba(196,154,90,0.2)`
- Channel logos: 16x16px badges at bottom-right corner with white 1.5px border
- Use ACTUAL platform logos (Airbnb relo mark, Booking.com "B" on navy)

### 7.3 Calendar Grid Cells
```tsx
<div className="grid grid-cols-7">
  {dates.map(date => (
    <div
      key={date.key}
      className={cn(
        "aspect-[1/0.85] border-r border-b border-dry-sand/50 p-[8px_10px] relative cursor-pointer transition-colors duration-150 flex flex-col",
        date.isToday && "bg-lagoon/[0.04]",
        date.isSelected && "bg-golden/[0.06] shadow-[inset_0_0_0_2px_var(--golden)] z-[2]",
        date.isOtherMonth && "opacity-25",
      )}
    >
      {/* Date number */}
      {date.isToday ? (
        <div className="w-6 h-6 rounded-full bg-[#FF385C] text-white text-xs font-semibold flex items-center justify-center -mt-[2px] -ml-[2px]">
          {date.day}
        </div>
      ) : (
        <div className="text-[13px] font-semibold text-coastal leading-none">
          {date.day}
        </div>
      )}

      {/* Rate (only show on unbooked dates) */}
      {!date.isBooked && date.rate && (
        <div className="text-xs font-medium text-tideline mt-[2px]">
          ${date.rate}
        </div>
      )}
    </div>
  ))}
</div>
```

**Cell rules:**
- Aspect ratio: `1 / 0.85` (near-square, slightly wider than tall)
- Border: `1px solid rgba(237,231,219,0.5)` — warm, not gray
- No border on last column (7th child)
- Today indicator: Airbnb red (#FF385C) circle, 24x24px, centered on date number
- Selected cell: Golden inset border (`inset 0 0 0 2px var(--golden)`)
- Hover: `background: rgba(196,154,90,0.03)` — barely visible golden tint
- Rates show ONLY on unbooked dates. Booked dates have booking bars covering the rate area.

### 7.4 Booking Bars (Airbnb-style)

**CRITICAL DESIGN RULES:**
1. **Color: Always `#222222` (dark/near-black).** NOT platform-colored. Platform identity comes from the logo inside the bar.
2. **Height: 30px.** Consistent across all bars.
3. **Border radius: 8px** on both ends. When a bar continues to next row, use `0 8px 8px 0` on the continuation row and `8px 0 0 8px` on the ending row.
4. **Content: Platform logo (circle, 20px) → Guest name → " · " → guest count.** Example: `[Airbnb logo] Bassem Mohammed · 7`
5. **Hover: `filter: brightness(1.15)` + `translateY(-1px)` + `z-index: 10`.**

**Check-in / Checkout overlap (MOST IMPORTANT PATTERN):**
When one booking checks out and another checks in on the same day:
- **Checkout bar** ends at ~10% into the shared cell (the checkout date). It represents checkout time (11am).
- **Check-in bar** starts at ~10% into the shared cell. It represents check-in time (3pm).
- The two bars touch but don't overlap. The shared cell shows a sliver of the outgoing bar and the full incoming bar.
- Implement with fractional cell positioning: checkout bar's width ends at `(cellIndex + 0.1) * cellWidth`, check-in bar starts at `(cellIndex + 0.1) * cellWidth`.

```tsx
// Booking bar component
<div
  className="absolute h-[30px] rounded-lg flex items-center gap-[6px] px-2 text-xs font-semibold text-white cursor-pointer z-[3] overflow-hidden whitespace-nowrap transition-all duration-200"
  style={{
    background: '#222222',
    top: `${rowTop}px`,
    left: `calc(${startCol} * 100% / 7 + 4px)`,
    width: `calc(${span} * 100% / 7 - 8px)`,
  }}
  onMouseEnter={e => {
    e.currentTarget.style.filter = 'brightness(1.15)';
    e.currentTarget.style.transform = 'translateY(-1px)';
    e.currentTarget.style.zIndex = '10';
  }}
  onMouseLeave={e => {
    e.currentTarget.style.filter = '';
    e.currentTarget.style.transform = '';
    e.currentTarget.style.zIndex = '3';
  }}
>
  {/* Platform logo in circle */}
  <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden"
    style={{ background: booking.platform === 'airbnb' ? '#FF385C' : '#003580' }}>
    <img src={`/icons/${booking.platform}-icon-white.svg`} className="w-3 h-3" />
  </div>

  <span className="truncate">
    {booking.guestName} &middot; {booking.guestCount}
  </span>
</div>
```

**Bar positioning math:**
```ts
// For a booking spanning check-in date to checkout date:
const checkInCol = getColIndex(booking.checkIn); // 0-6 within the week row
const checkOutCol = getColIndex(booking.checkOut);

// Standard bar (no same-day handoff):
const startFraction = checkInCol + 0.5; // Start at 50% of check-in cell (afternoon arrival)
const endFraction = checkOutCol + 0.4;  // End at 40% of checkout cell (morning departure)

// Same-day handoff (previous guest checks out, new guest checks in):
const outgoingEndFraction = checkOutCol + 0.1;  // Outgoing takes 10% of shared cell
const incomingStartFraction = checkOutCol + 0.1; // Incoming starts at 10%
```

### 7.5 Right Panel — Rate Editor

**Structure (top to bottom):**
1. Date header (selected date + day of week + property name)
2. Current booking info (if date is booked)
3. Base rate from pricing engine
4. Per-channel rate cards (glossy)
5. Settings (availability toggle + min stay)

**Booking detail card (clean, no colored header):**
```tsx
<div className="flex items-center gap-3 mb-[14px]">
  {/* Guest avatar */}
  <div className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold text-white"
    style={{ background: 'linear-gradient(135deg, var(--mangrove), var(--tideline))' }}>
    {initials}
  </div>
  <div className="flex-1">
    <div className="text-[15px] font-bold text-coastal flex items-center gap-2">
      {guestName}
      {/* Platform pill */}
      <span className="h-[18px] rounded px-[6px] flex items-center gap-1 text-[10px] font-semibold"
        style={{
          background: platform === 'airbnb' ? 'rgba(255,56,92,0.1)' : 'rgba(0,53,128,0.1)',
          color: platform === 'airbnb' ? '#FF385C' : '#003580',
        }}>
        <img src={`/icons/${platform}-icon.svg`} className="w-[10px] h-[10px]" />
        {platformLabel}
      </span>
    </div>
    <div className="text-xs text-tideline mt-[2px]">
      {dateRange} · {nights} nights · {guestCount} guests
    </div>
  </div>
</div>

{/* Payout grid */}
<div className="grid grid-cols-2 gap-2 mt-3">
  <div className="p-[10px_12px] rounded-[10px] bg-shore">
    <div className="text-base font-bold text-coastal tracking-[-0.02em]">{totalPayout}</div>
    <div className="text-[10px] font-semibold text-tideline uppercase tracking-[0.04em] mt-[2px]">Total payout</div>
  </div>
  <div className="p-[10px_12px] rounded-[10px] bg-shore">
    <div className="text-base font-bold text-coastal tracking-[-0.02em]">{perNight}</div>
    <div className="text-[10px] font-semibold text-tideline uppercase tracking-[0.04em] mt-[2px]">Per night</div>
  </div>
</div>
```

**Channel rate card (glossy):**
```tsx
<div className="rounded-[14px] p-[14px_16px] mb-2 relative overflow-hidden transition-all duration-[250ms]"
  style={{
    background: 'linear-gradient(165deg, rgba(255,255,255,0.95) 0%, rgba(247,243,236,0.8) 100%)',
    border: '1px solid rgba(237,231,219,0.8)',
    boxShadow: 'var(--shadow-glass)',
  }}>
  {/* Glossy overlay */}
  <div className="absolute top-0 left-0 right-0 h-1/2 pointer-events-none rounded-t-[14px]"
    style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.4), transparent)' }} />

  {/* Header: platform + sync status */}
  <div className="flex items-center justify-between mb-[10px] relative z-[1]">
    <div className="flex items-center gap-2">
      <div className="w-[22px] h-[22px] rounded-[6px] overflow-hidden">
        <img src={`/icons/${platform}-logo.svg`} className="w-full h-full" />
      </div>
      <span className="text-[13px] font-semibold text-coastal">{platformName}</span>
    </div>
    <div className={cn("flex items-center gap-1 text-[10px] font-semibold",
      synced ? "text-lagoon" : "text-amber-tide"
    )}>
      <span className={cn("w-[6px] h-[6px] rounded-full",
        synced ? "bg-lagoon shadow-[0_0_6px_rgba(26,122,90,0.4)]" : "bg-amber-tide"
      )} />
      {synced ? "In sync" : "Out of sync"}
    </div>
  </div>

  {/* Rate input + markup */}
  <div className="flex items-center gap-[10px] relative z-[1]">
    <div className="relative flex-1">
      <span className="absolute left-[10px] top-1/2 -translate-y-1/2 text-sm font-semibold text-tideline">$</span>
      <input
        type="text"
        className="w-full py-[9px] pl-6 pr-3 border-[1.5px] border-dry-sand rounded-[10px] text-[17px] font-bold text-coastal tracking-[-0.02em] bg-white/70 outline-none focus:border-golden focus:ring-[3px] focus:ring-golden/[0.12] transition-all"
        value={rate}
      />
    </div>
    <div className="text-[11px] font-semibold py-[5px] px-2 rounded-lg bg-shore text-tideline whitespace-nowrap">
      {markup}
    </div>
  </div>

  {/* Save button — always coastal green, NOT platform-colored */}
  <button className="w-full mt-2 py-[9px] rounded-[10px] text-xs font-semibold bg-coastal text-shore hover:bg-mangrove transition-all hover:-translate-y-px">
    Save & push
  </button>
</div>
```

---

## 8. PLATFORM LOGOS

**NEVER use colored circles with letters.** Always use actual platform brand marks.

Store SVG icons at `/public/icons/`:
- `airbnb-logo.svg` — Airbnb relo mark (coral background + white symbol)
- `airbnb-icon.svg` — White relo symbol only (for use on colored backgrounds)
- `airbnb-icon-colored.svg` — Coral relo symbol (for use on light backgrounds)
- `bdc-logo.svg` — Booking.com navy square with white "B.com" or stacked dots mark
- `bdc-icon.svg` — White mark only
- `vrbo-logo.svg` — VRBO logo
- `koast-icon.svg` — Koast "K" mark in golden

**Sizes:**
- Booking bar: 20px circle
- Channel indicator on property: 16px rounded square
- Rate panel header: 22px rounded square
- Platform pill: 10px inline

---

## 9. ACTIVITY FEED

```tsx
<div className="flex items-start gap-[14px] p-[14px_8px] rounded-lg hover:bg-dry-sand/40 transition-colors">
  {/* Icon */}
  <div className={cn(
    "w-9 h-9 rounded-[10px] flex items-center justify-center text-sm flex-shrink-0",
    type === 'booking' && "text-lagoon",
    type === 'message' && "text-deep-water",
    type === 'price' && "text-golden",
    type === 'clean' && "text-amber-tide",
  )} style={{
    background: type === 'booking' ? 'linear-gradient(135deg, rgba(26,122,90,0.15), rgba(26,122,90,0.05))' :
                type === 'message' ? 'linear-gradient(135deg, rgba(42,90,138,0.15), rgba(42,90,138,0.05))' :
                type === 'price' ? 'linear-gradient(135deg, rgba(196,154,90,0.2), rgba(196,154,90,0.05))' :
                'linear-gradient(135deg, rgba(212,150,11,0.15), rgba(212,150,11,0.05))'
  }}>
    {icon}
  </div>
  <div>
    <div className="text-[13px] text-coastal leading-relaxed">
      <strong className="font-semibold">{title}</strong> — {description}
    </div>
    <div className="text-[11px] text-tideline mt-[2px]">{timeAgo}</div>
  </div>
</div>
```

---

## 10. SECTION LABELS

Every content section starts with this label pattern:
```tsx
<div className="text-[11px] font-bold tracking-[0.08em] uppercase text-golden mb-4">
  {label}
</div>
```

This is the #1 visual signature of Koast. It appears before:
- "Your properties" on dashboard
- "Portfolio performance" on dashboard
- "Activity" feed
- "AI insights" card
- "Current booking" in rate panel
- "Base rate" in rate panel
- "Channel rates" in rate panel
- "Settings" in rate panel
- Every section in every page

---

## 11. PAGES NOT YET DESIGNED (use these patterns)

When building new pages, follow this hierarchy:
1. Page background: `bg-shore`
2. Page header: 28px greeting or 20px heading, both `text-coastal font-bold tracking-tight`
3. Subtitle: `text-sm text-tideline` with inline info
4. Content sections: separated by section labels (golden uppercase)
5. Cards: white bg with `--shadow-card`, rounded-2xl
6. Glass cards: only for key metrics
7. Tables: no borders, alternate row bg with `bg-shore`/`bg-white`, hover `bg-dry-sand/40`
8. Empty states: centered icon + heading + subtitle + single CTA button

### Button styles:
- **Primary:** `bg-coastal text-shore hover:bg-mangrove rounded-[10px] py-[9px] px-4 text-xs font-semibold`
- **Secondary:** `bg-shore text-coastal border border-dry-sand hover:bg-dry-sand/40 rounded-[10px] py-[9px] px-4 text-xs font-semibold`
- **Golden CTA:** `bg-golden text-deep-sea hover:bg-driftwood rounded-lg py-[10px] px-6 text-[13px] font-semibold`
- **Danger:** `bg-coral-reef/10 text-coral-reef hover:bg-coral-reef/15 rounded-[10px] py-[9px] px-4 text-xs font-semibold`
- **Ghost:** `text-tideline hover:text-coastal hover:bg-dry-sand/40 rounded-[10px] py-[9px] px-4 text-xs font-semibold`

### Input styles:
```tsx
<input className="w-full py-[9px] px-3 border-[1.5px] border-dry-sand rounded-[10px] text-sm font-medium text-coastal bg-white/70 outline-none focus:border-golden focus:ring-[3px] focus:ring-golden/[0.12] transition-all placeholder:text-shell" />
```

### Toggle:
```tsx
<div className={cn("w-[42px] h-[22px] rounded-full relative cursor-pointer transition-colors",
  enabled ? "bg-lagoon shadow-[0_0_10px_rgba(26,122,90,0.3)]" : "bg-shell"
)} onClick={() => setEnabled(!enabled)}>
  <div className={cn("w-[18px] h-[18px] rounded-full bg-white absolute top-[2px] transition-transform shadow-[0_1px_3px_rgba(0,0,0,0.15)]",
    enabled ? "translate-x-5 left-[2px]" : "left-[2px]"
  )} />
</div>
```

---

## 12. SIDEBAR ICONS (TODO — Future task)

Custom SVG icon set needed. Until then, use Lucide React icons in these sizes:
- Sidebar nav: 18px, `strokeWidth={1.5}`, color inherits from nav item text
- Feed icons: 16px inside the 36px icon container
- Action buttons: 16px

Icon choices:
- Dashboard: `LayoutDashboard`
- Calendar: `CalendarDays`
- Messages: `MessageSquare`
- Properties: `Home`
- Pricing: `DollarSign`
- Reviews: `Star`
- Cleaning: `Sparkles`
- Market Intel: `TrendingUp`
- Nearby: `MapPin`
- Comp Sets: `Target`
- Settings: `Settings`

---

## 13. RESPONSIVE BEHAVIOR

| Breakpoint | Sidebar | Prop List | Calendar | Rate Panel |
|------------|---------|-----------|----------|------------|
| ≥1440px | 220px | 80px | flex | 310px |
| 1280-1439 | 220px | 80px | flex | 280px |
| 1024-1279 | Collapsed (60px, icons only) | Hidden (integrated into nav) | flex | 280px |
| <1024 | Hidden (hamburger) | Hidden | full | Panel slides over |

---

## 14. DO / DON'T

### DO:
- Use the exact shadow stacks from Section 3
- Use golden section labels before every content group
- Use glossy glass cards for key metrics only (not everything)
- Use dark (#222) booking bars with platform logos
- Use `cubic-bezier(0.4, 0, 0.2, 1)` for all hover transitions
- Use Airbnb's red circle for today's date
- Show rates only on unbooked calendar dates
- Use real platform logo SVGs

### DON'T:
- Use Tailwind shadow utilities (shadow-md, shadow-lg, etc.)
- Use gray-based colors anywhere (gray-100, gray-500, slate-*, etc.)
- Use colored booking bars (one color per platform)
- Use colored top borders on cards (that's the old Canopy pattern)
- Use `rounded-md` or `rounded-lg` without checking the token table
- Put section labels in gray — they're ALWAYS golden
- Use `ease` or `linear` for transitions — always cubic-bezier
- Make glass cards for everything — reserve for portfolio stats only
- Use letters in circles for platform logos
- Use emojis anywhere in the UI or AI-generated content
- Use pulsing/glowing animated dots for status indicators
- Use progress bar borders on top of cards

---

## 15. TONE & CONTENT RULES

### No emojis. Anywhere.
Koast is professional and serious. No emojis in:
- AI-generated message drafts
- AI review responses
- UI labels, badges, or status text
- Activity feed descriptions
- Notification text

### No pulsing/glowing dots
Status is communicated through color alone (solid colored dot, no animation, no box-shadow glow). The only animation exceptions are the entrance choreography and the AI ambient glow (see Section 16).

### AI tone
- Warm but professional. Never casual, never corporate.
- Specific: reference property details, guest names, dates, local places.
- Concise: 2-4 sentences for reviews, 1-2 paragraphs for guest messages.
- No filler phrases: "I hope this helps", "Please don't hesitate", "We look forward to".

---

## 16. ENTRANCE ANIMATIONS (Video-worthy)

The dashboard must look impressive when recorded on video. Every page load has a choreographed entrance sequence.

### Animation keyframes
```css
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes cardReveal {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes chartDraw {
  from { stroke-dashoffset: 200; }
  to { stroke-dashoffset: 0; }
}

@keyframes aiGlow {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.1); }
}
```

### Dashboard entrance sequence (timing in ms from page load)
```
0-100ms    Greeting text fades in (fadeSlideIn, 0.6s duration)
100-200ms  Subtitle + sync badge fades in
300ms      "Your properties" section label
350ms      First property card (cardReveal, 0.5s duration)
450ms      Second property card
550ms      "Portfolio performance" section label
600ms      First glass stat card
680ms      Second glass stat card
760ms      Third glass stat card
840ms      Fourth glass stat card
850ms      Revenue chart card appears
900ms      Chart line begins drawing (progressive canvas animation)
900ms      Sparklines in glass cards begin drawing (stroke-dashoffset transition)
1000ms     Activity feed card
1100ms     First AI insight card
1200ms     Second AI insight card
800ms+     All numbers begin counting up from 0 (1200ms duration, 50 steps)
1400ms     AI dollar amount counts up separately
```

### Rules:
- **All elements start with `opacity: 0; transform: translateY(20px);`** and animate to visible.
- **Stagger delay between sibling elements: 80-100ms** (cards in a grid, stats in a row).
- **Duration: 0.4-0.6s** per element. Never faster (feels jarring) or slower (feels sluggish).
- **Easing: `ease-out`** for entrance, `cubic-bezier(0.4, 0, 0.2, 1)` for hover interactions.
- **Apply to every page**, not just the dashboard. Calendar, Properties, Messages — all have entrance choreography.

### Number count-up animation
Every numeric value on dashboard and stat cards counts up from 0 to its target value.

```tsx
// React hook for count-up
function useCountUp(target: number, duration = 1200, delay = 800) {
  const [value, setValue] = useState(0);
  
  useEffect(() => {
    const timeout = setTimeout(() => {
      const steps = 50;
      const increment = target / steps;
      let current = 0;
      const interval = setInterval(() => {
        current += increment;
        if (current >= target) { current = target; clearInterval(interval); }
        setValue(current);
      }, duration / steps);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timeout);
  }, [target]);
  
  return value;
}

// Usage in stat card:
const revenue = useCountUp(5400, 1200, 800);
<div className="glass-val">${revenue.toLocaleString()}</div>
```

**Rules:**
- Duration: 1200ms
- Steps: 50 (smooth enough, not wasteful)
- Delay: staggered per card (800ms base + card index * 80ms)
- Format: use `toLocaleString()` for comma-separated thousands, `toFixed(1)` for decimals
- Always count from 0, never from a previous value

### Sparklines in glass stat cards
Small SVG sparklines (60x24px) in the bottom-right corner of glass stat cards at 50% opacity.

```tsx
<svg className="absolute bottom-3 right-4 z-[1] opacity-50" width="60" height="24" viewBox="0 0 60 24">
  <polyline
    fill="none"
    stroke={trend === 'up' ? 'var(--lagoon)' : 'var(--coral-reef)'}
    strokeWidth="1.5"
    strokeLinecap="round"
    points={sparklinePoints}
    style={{
      strokeDasharray: 200,
      strokeDashoffset: 200,
      transition: 'stroke-dashoffset 1.2s ease-out',
    }}
    ref={el => { if (el) setTimeout(() => el.style.strokeDashoffset = '0', 1000); }}
  />
</svg>
```

### Revenue chart (Canvas-drawn, not a library)
The main revenue chart on the dashboard uses HTML Canvas for smooth animation.

**Visual spec:**
- Area fill: linear gradient from `rgba(26,122,90,0.15)` (top) to `rgba(26,122,90,0.01)` (bottom)
- Line: `#1a7a5a` (lagoon), 2px width, round join/cap
- Grid lines: `#ede7db` (dry-sand), 0.5px
- Y-axis labels: 10px, tideline color, right-aligned
- X-axis labels: 10px, tideline color, centered
- Current value dot: 4px lagoon circle with 2px white inner circle
- Period selector: pill toggle (7D / 30D / 90D)

**Animation:** Line draws progressively from left to right over ~1.5s using requestAnimationFrame. Area fill follows the line. This is the hero animation moment.

### AI insight ambient glow
The AI card's radial gradient glow uses a slow 4s breathing animation — NOT a pulsing dot.

```css
.ai-card::before {
  content: '';
  position: absolute;
  top: -40%; right: -20%;
  width: 250px; height: 250px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(196,154,90,0.08), transparent 70%);
  animation: aiGlow 4s ease-in-out infinite;
}
```

This is subtle and atmospheric. It makes the card feel alive without being distracting.

---

## 17. PLATFORM ICONS

### File Structure
```
public/icons/platforms/
  airbnb.svg            # Bélo, coral #FF385C
  airbnb-white.svg      # Bélo, white
  airbnb-tile.svg       # Coral rounded square + white Bélo
  booking-com.svg       # B+dot mark, navy #003580
  booking-com-white.svg # B+dot mark, white
  booking-com-tile.svg  # Navy rounded square + white B+dot
  vrbo.svg              # VRBO mark (TODO: need SVG)
  koast-tile.svg        # Golden rounded square + deep-sea K
```

### Platform config map
```tsx
export const PLATFORMS = {
  airbnb: {
    name: 'Airbnb',
    color: '#FF385C',
    colorLight: 'rgba(255,56,92,0.1)',
    icon: '/icons/platforms/airbnb.svg',
    iconWhite: '/icons/platforms/airbnb-white.svg',
    tile: '/icons/platforms/airbnb-tile.svg',
  },
  booking_com: {
    name: 'Booking.com',
    color: '#003580',
    colorLight: 'rgba(0,53,128,0.1)',
    icon: '/icons/platforms/booking-com.svg',
    iconWhite: '/icons/platforms/booking-com-white.svg',
    tile: '/icons/platforms/booking-com-tile.svg',
  },
  vrbo: {
    name: 'VRBO',
    color: '#3145F5',
    colorLight: 'rgba(49,69,245,0.1)',
    icon: '/icons/platforms/vrbo.svg',
    iconWhite: '/icons/platforms/vrbo-white.svg',
    tile: '/icons/platforms/vrbo-tile.svg',
  },
  direct: {
    name: 'Direct',
    color: '#c49a5a',
    colorLight: 'rgba(196,154,90,0.1)',
    icon: '/icons/platforms/koast-tile.svg',
    iconWhite: '/icons/platforms/koast-tile.svg',
    tile: '/icons/platforms/koast-tile.svg',
  },
} as const;
```

### Usage by context
| Context | Size | Which variant | Container |
|---------|------|---------------|-----------|
| Booking bar | 20px circle | `iconWhite` on `platform.color` bg | `w-5 h-5 rounded-full` |
| Property card badge | 26px square | `tile` with glassmorphism | `w-[26px] h-[26px] rounded-[7px]` |
| Property list thumb | 16px square | `tile` | `w-4 h-4 rounded border-[1.5px] border-white` |
| Rate panel header | 22px square | `tile` | `w-[22px] h-[22px] rounded-[6px]` |
| Platform pill (inline) | 10px | `icon` (colored) | Inside tinted pill |
| Conversation avatar badge | 18px square | `tile` with white border | `w-[18px] h-[18px] rounded-[5px] border-2 border-white` |

---

## 18. PAGE-SPECIFIC PATTERNS

### 18.1 Dashboard
- Greeting: 28px, bold, coastal — "Good morning, {name}"
- Subtitle: 13px, tideline — property count + booking count + sync badge
- Sync badge: inline pill, lagoon bg/border/text, solid dot (NOT animated)
- Property cards: photo-led, status bar, 4-metric row. Entire card clickable.
- Glass stat cards: 2x2 grid, with sparklines + count-up numbers
- Revenue chart: canvas-drawn, animated line + area fill, period selector
- Activity feed: white card, feed items with gradient icon circles
- AI insights: dark deep-sea cards, ambient glow, golden badge, action buttons

### 18.2 Calendar
- Three columns: property thumbnails (80px) | calendar grid (flex) | rate panel (310px)
- Grid cells: near-square, Airbnb-style, dark #222 booking bars
- Right panel: booking info → base rate → per-channel rates (glossy cards) → availability → min stay
- Availability and per-date settings live in the Calendar right panel, NOT in separate tabs

### 18.3 Messages
- Three columns: conversation list (340px) | thread (flex) | context panel (300px)
- Platform logos on guest avatars as corner badges
- AI drafts: dashed golden border, "Koast AI draft" label, Send/Edit buttons
- No emojis in AI drafts or anywhere in the thread
- Compose bar: auto-expanding textarea, golden "K" AI button, send button
- Context panel: guest info, booking details, quick actions, AI suggestions

### 18.4 Properties Grid
- Photo-led cards, entire card clickable (NO quick action buttons)
- Status bar below photo with live operational context
- Channel badges on photo (glassmorphism, real platform logos)
- Add property: dashed golden border card
- Grid/Table view toggle

### 18.5 Property Detail
- Hero: full-bleed photo, dark gradient, name, address, channel badges, "Connect listing"
- Three tabs only: Overview | Calendar | Pricing
- Overview: status banner, 5 glass metrics, bookings list, channel performance, AI insight
- Calendar: single-property grid + right panel editor (rates, availability, min stay, settings)
- Pricing: see Section 18.7

### 18.6 Turnovers (Cleaning)
- Kanban: 4 columns (Scheduled, Notified, In Progress, Completed)
- Cards: property name, date, guest transition, cleaner, urgency tags
- In-progress: amber left border accent
- Completed: dimmed opacity (0.7)
- Urgency tags: same-day (coral-reef bg), standard (lagoon bg), deep clean (deep-water bg)

### 18.7 Pricing (THE DIFFERENTIATOR)
**This page does NOT show 9 signal cards with progress bars.**

Structure (top to bottom):
1. **Scorecard** — "You're leaving $430 on the table this month" with your rate vs market rate comparison
2. **Recommendations** — Chronological list grouped by urgency (act now / coming up / review). Each row: date range, current rate, suggested rate, plain-English reason. "Apply" per row or "Apply all". Expand to see signal breakdown per date.
3. **Pricing rules** — Base rate, min/max guardrails, channel markups, seasonal overrides, auto-apply toggle
4. **Performance** — Acceptance rate, revenue impact of applied suggestions, accuracy tracking

### 18.8 Reviews
- Left: review feed with stars, text, response (posted or AI draft)
- Right: stats grid, AI review generator (dark card), pending responses list
- AI draft responses: dashed golden border, Post/Edit buttons
- No emojis in any generated content

### 18.9 Market Intel
- Top: glass stat cards (market rate, occupancy, listings, supply change)
- Split: Leaflet map (60%) + competitor sidebar (40%)
- Map layers: your properties (golden), comps (green), events (red)
- Competitor cards: photo, rate, occupancy, rating

### 18.10 Login / Signup
- Full dark deep-sea background, ambient golden + green radial glows
- Glassmorphism form card with golden focus rings
- Golden gradient CTA button
- Google OAuth
- Tagline: "Your hosting runs itself"

---

## 19. PROPERTY DETAIL TAB STRUCTURE

The property detail page has exactly THREE tabs:
1. **Overview** — metrics, bookings, channel performance, AI insights
2. **Calendar** — full Airbnb-style grid + right panel editor
3. **Pricing** — engine recommendations + rules + performance

Settings and availability live inside the Calendar tab's right panel because they are date-contextual.
Global property settings (name, address, channels) are accessed via a gear icon in the hero area.
"Connect listing" button in the hero opens the channel connection flow for adding new OTAs.

---

## 20. REFERENCE MOCKUP FILES

These HTML mockups define the visual target. Claude Code should match them as closely as possible:

- `koast-dashboard-v3.html` — Dashboard with animations, chart, sparklines, AI cards
- `koast-calendar-v2.html` — Calendar with Airbnb-style grid + rate panel
- `koast-messages.html` — Messages inbox with AI drafts + context panel
- `koast-properties.html` — Properties grid with grid/table toggle
- `koast-property-detail.html` — Property detail with overview + settings tabs
- `koast-remaining-pages.html` — Pricing, Market Intel, Cleaning, Reviews, Login
- `koast-immersive.html` / `koast-v2.html` — Earlier dashboard explorations (glass card refinements)

When implementing any page, check the corresponding mockup file first for exact spacing, colors, and component patterns.
