# Koast — DESIGN_SYSTEM.md
# Read this file COMPLETELY before touching ANY UI code.
# Last updated: April 14, 2026

## CRITICAL RULES
1. **Never use default Tailwind grays.** All borders, backgrounds, and text use Koast tokens.
2. **Never use Tailwind shadow utilities** (`shadow-md`, `shadow-lg`, etc.). Use exact shadow stacks from Section 3.
3. **Never invent new colors.** Every color must come from the palette in Section 1.
4. **Never use generic border-radius.** Use exact values from Section 4.
5. **Copy component code exactly.** Don't "improve" or "simplify" — the details ARE the design.
6. **Platform logos must be real SVGs** from `/icons/platforms/`. Never colored circles with letters.
7. **No emojis anywhere** in UI or AI-generated content.
8. **No pulsing or glowing animated dots.** Status = solid colored dot, no animation, no box-shadow glow.
9. **Read the mockup HTML file** for the page you're building before writing code (Section 19).

---

## 1. COLOR PALETTE

### CSS Variables (globals.css)
```css
:root {
  --deep-sea: #132e20;       /* Marketing bg, hero, login */
  --coastal: #17392a;        /* Sidebar bg, headings, stat values */
  --mangrove: #1f4d38;       /* Sidebar hover, secondary dark */
  --tideline: #3d6b52;       /* Icons, muted text, secondary text */
  --golden: #c49a5a;         /* Primary accent, CTAs, section labels */
  --driftwood: #d4b47a;      /* Light accent, gold hover */
  --sandbar: #e8d5b0;        /* Accent backgrounds */
  --shore: #f7f3ec;          /* Product page background */
  --dry-sand: #ede7db;       /* Borders, dividers */
  --shell: #e2dace;          /* Input borders, disabled */
  --white: #ffffff;          /* Card backgrounds */
  --coral-reef: #c44040;     /* Errors, destructive */
  --amber-tide: #d4960b;     /* Warnings, urgency */
  --lagoon: #1a7a5a;         /* Success, synced */
  --deep-water: #2a5a8a;     /* Info, links */
  --bar-dark: #222222;       /* Booking bar bg */

  --shadow-card: 0 1px 3px rgba(19,46,32,0.08), 0 8px 32px rgba(19,46,32,0.04);
  --shadow-card-hover: 0 4px 12px rgba(19,46,32,0.1), 0 20px 60px rgba(19,46,32,0.12);
  --shadow-glass: 0 1px 1px rgba(19,46,32,0.02), 0 4px 8px rgba(19,46,32,0.04), 0 12px 36px rgba(19,46,32,0.06), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(19,46,32,0.04);
  --shadow-glass-hover: 0 2px 4px rgba(19,46,32,0.03), 0 8px 16px rgba(19,46,32,0.06), 0 24px 56px rgba(19,46,32,0.1), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(19,46,32,0.04);
  --shadow-sidebar: 4px 0 40px rgba(0,0,0,0.3);
  --shadow-logo-glow: 0 2px 12px rgba(196,154,90,0.4);
}
```

### Tailwind Config
```js
colors: {
  'deep-sea': '#132e20', 'coastal': '#17392a', 'mangrove': '#1f4d38', 'tideline': '#3d6b52',
  'golden': '#c49a5a', 'driftwood': '#d4b47a', 'sandbar': '#e8d5b0',
  'shore': '#f7f3ec', 'dry-sand': '#ede7db', 'shell': '#e2dace',
  'coral-reef': '#c44040', 'amber-tide': '#d4960b', 'lagoon': '#1a7a5a', 'deep-water': '#2a5a8a',
  'bar-dark': '#222222',
}
```

### Usage Rules
| Need | Use | NEVER |
|------|-----|-------|
| Page bg | `bg-shore` | `bg-gray-50` |
| Card bg | `bg-white` | `bg-gray-50` |
| Primary text | `text-coastal` | `text-gray-900` |
| Secondary text | `text-tideline` | `text-gray-500` |
| Disabled text | `text-shell` | `text-gray-400` |
| Borders | `border-dry-sand` or `border-shell` | `border-gray-200` |
| Section labels | `text-golden` | any gray |
| Hover bg | `bg-dry-sand/40` | `bg-gray-100` |

---

## 2. TYPOGRAPHY

Font: **Plus Jakarta Sans** (`@fontsource-variable/plus-jakarta-sans`)

| Element | Size | Weight | Tracking | Color | Class |
|---------|------|--------|----------|-------|-------|
| Greeting | 28px | 700 | -0.02em | coastal | `text-[28px] font-bold tracking-[-0.02em] text-coastal` |
| Page heading | 20px | 700 | -0.02em | coastal | `text-xl font-bold tracking-[-0.02em] text-coastal` |
| Glass stat value | 26px | 700 | -0.03em | coastal | `text-[26px] font-bold tracking-[-0.03em] text-coastal` |
| Card stat value | 17px | 700 | -0.03em | coastal | `text-[17px] font-bold tracking-[-0.03em] text-coastal` |
| Section label | 11px | 700 | 0.08em | golden | `text-[11px] font-bold tracking-[0.08em] uppercase text-golden` |
| Nav section label | 10px | 700 | 0.1em | tideline | `text-[10px] font-bold tracking-[0.1em] uppercase text-tideline` |
| Metric label | 10px | 700 | 0.06em | golden | `text-[10px] font-bold tracking-[0.06em] uppercase text-golden` |
| Body | 14px | 400 | normal | coastal | `text-sm text-coastal` |
| Secondary | 13px | 500 | normal | tideline | `text-[13px] font-medium text-tideline` |
| Small | 12px | 500 | normal | tideline | `text-xs font-medium text-tideline` |
| Tiny | 11px | 600 | normal | tideline | `text-[11px] font-semibold text-tideline` |

**Rules:** Stat numbers always `-0.03em`. Section labels always uppercase + golden. Max weight 800 (logo only). Never 900.

---

## 3. SHADOWS

Never use Tailwind shadow utilities. All shadows defined as CSS variables in Section 1.

| Token | Use |
|-------|-----|
| `--shadow-card` | White cards at rest |
| `--shadow-card-hover` | White cards on hover (with translateY(-6px)) |
| `--shadow-glass` | Glass stat cards at rest |
| `--shadow-glass-hover` | Glass stat cards on hover (with translateY(-3px)) |
| `--shadow-sidebar` | Sidebar container |
| `--shadow-logo-glow` | Logo mark |

All shadows use `rgba(19,46,32,...)`. Never `rgba(0,0,0,...)` except sidebar.

---

## 4. BORDER RADIUS (exact values only)

| Value | Use |
|-------|-----|
| `rounded-[18px]` | Glass stat cards |
| `rounded-2xl` (16px) | White cards, modals, kanban columns |
| `rounded-[14px]` | Channel rate cards, booking info, comp cards |
| `rounded-xl` (12px) | Property thumbnails, login card |
| `rounded-[10px]` | Buttons, inputs, nav items |
| `rounded-lg` (8px) | Booking bars, tags, small badges |
| `rounded-[7px]` | Logo mark, platform tile badges |
| `rounded-full` | Avatars, toggles, today circle, status dots |

---

## 5. TRANSITIONS

| Element | Duration | Curve | Hover transform |
|---------|----------|-------|-----------------|
| Property cards | 0.35s | `cubic-bezier(0.4,0,0.2,1)` | `translateY(-6px) scale(1.01)` |
| Glass cards | 0.25s | `cubic-bezier(0.4,0,0.2,1)` | `translateY(-3px) scale(1.005)` |
| Booking bars | 0.2s | `cubic-bezier(0.4,0,0.2,1)` | `brightness(1.15) translateY(-1px)` |
| Buttons | 0.15s | `cubic-bezier(0.4,0,0.2,1)` | `translateY(-1px)` |
| Entrance animations | 0.4-0.6s | `ease-out` | — |

Never use `ease`, `ease-in-out`, or `linear`. Cards hover UP only. Never change bg on hover for cards.

---

## 6. COMPONENTS

See Sections 6.1-6.4 from the previous version — Sidebar, Property Card, Glass Card, AI Card. Key changes from v1:

- **AI Card badge dot**: SOLID `bg-golden`. No `animate-pulse`.
- **Sync indicator dot**: SOLID color. No `box-shadow` glow.
- **Toggle**: SOLID `bg-lagoon` when on. No `box-shadow` glow.
- **All platform icon paths**: Use `PLATFORMS[key].tile` / `.icon` / `.iconWhite` from the config in Section 8. Never hardcode paths like `/icons/airbnb-logo.svg`.
- **Glass card hover**: Must include both `transform` change AND `boxShadow` change to `--shadow-glass-hover`.

Refer to the previous DESIGN_SYSTEM.md Sections 6.1-6.4 for full component JSX. The code there is correct EXCEPT for the three fixes above.

---

## 7. CALENDAR

Refer to the previous DESIGN_SYSTEM.md Section 7 for full calendar spec. All rules unchanged. Key reminders:
- Booking bars: always `#222222`, never platform-colored
- Check-in at 50% of cell, checkout at 40%. Same-day handoff at 10%/90%.
- Platform logos via `PLATFORMS[key]` config, not hardcoded paths
- Right panel structure: booking info → base rate → per-channel rates (glossy) → availability → min stay

---

## 8. PLATFORM ICONS

### Files at `public/icons/platforms/`
```
airbnb.svg, airbnb-white.svg, airbnb-tile.svg
booking-com.svg, booking-com-white.svg, booking-com-tile.svg
koast-tile.svg
```

> VRBO intentionally omitted — re-add when SVG assets are sourced and a property actually uses it.

### Config at `src/lib/platforms.ts`
```tsx
export const PLATFORMS = {
  airbnb: { name: 'Airbnb', color: '#FF385C', colorLight: 'rgba(255,56,92,0.1)',
    icon: '/icons/platforms/airbnb.svg', iconWhite: '/icons/platforms/airbnb-white.svg', tile: '/icons/platforms/airbnb-tile.svg' },
  booking_com: { name: 'Booking.com', color: '#003580', colorLight: 'rgba(0,53,128,0.1)',
    icon: '/icons/platforms/booking-com.svg', iconWhite: '/icons/platforms/booking-com-white.svg', tile: '/icons/platforms/booking-com-tile.svg' },
  direct: { name: 'Direct', color: '#c49a5a', colorLight: 'rgba(196,154,90,0.1)',
    icon: '/icons/platforms/koast-tile.svg', iconWhite: '/icons/platforms/koast-tile.svg', tile: '/icons/platforms/koast-tile.svg' },
} as const;
export type PlatformKey = keyof typeof PLATFORMS;
// platformKeyFrom() still accepts "vrbo"/"HMA" aliases but returns null — see src/lib/platforms.ts.
```

**ALL components MUST use this config. Never hardcode platform icon paths.**

| Context | Size | Variant |
|---------|------|---------|
| Booking bar | 20px circle | `iconWhite` on `color` bg |
| Property card badge | 22-26px square | `tile` with glassmorphism |
| Rate panel header | 22px square | `tile` |
| Platform pill | 10px inline | `icon` in `colorLight` pill |
| Avatar badge | 18px square | `tile` with white border |

---

## 9-10. ACTIVITY FEED + SECTION LABELS

See previous version — unchanged. Section labels are the #1 Koast visual signature:
```tsx
<div className="text-[11px] font-bold tracking-[0.08em] uppercase text-golden mb-[14px]">{label}</div>
```

---

## 11. STANDARD UI COMPONENTS

### Buttons
- **Primary:** `bg-coastal text-shore hover:bg-mangrove rounded-[10px] py-[9px] px-4 text-xs font-semibold`
- **Secondary:** `bg-white text-coastal border border-dry-sand hover:bg-shore rounded-[10px] py-[9px] px-4 text-xs font-semibold`
- **Golden CTA:** `bg-golden text-deep-sea hover:bg-driftwood rounded-lg py-[10px] px-6 text-[13px] font-semibold`
- **Danger:** `bg-coral-reef/10 text-coral-reef border border-coral-reef/15 rounded-[10px] py-[9px] px-4 text-xs font-semibold`
- **Ghost:** `text-tideline hover:text-coastal hover:bg-dry-sand/40 rounded-[10px] py-[9px] px-4 text-xs font-semibold bg-transparent`

### Input
```tsx
<input className="w-full py-[9px] px-3 border-[1.5px] border-dry-sand rounded-[10px] text-sm font-medium text-coastal bg-white/70 outline-none focus:border-golden focus:ring-[3px] focus:ring-golden/[0.12] transition-all placeholder:text-shell" />
```

### Toggle
```tsx
<div className={cn("w-[42px] h-[22px] rounded-full relative cursor-pointer transition-colors duration-200",
  enabled ? "bg-lagoon" : "bg-shell"  // NO box-shadow glow
)} onClick={() => setEnabled(!enabled)}>
  <div className={cn("w-[18px] h-[18px] rounded-full bg-white absolute top-[2px] left-[2px] transition-transform duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.15)]",
    enabled && "translate-x-5")} />
</div>
```

### Modal
```tsx
<div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center" style={{ backdropFilter: 'blur(4px)' }}>
  <div className="bg-white rounded-2xl w-[440px] max-h-[80vh] overflow-hidden z-41"
    style={{ boxShadow: '0 8px 40px rgba(19,46,32,0.2), 0 2px 8px rgba(19,46,32,0.1)' }}>
    <div className="p-6 border-b border-dry-sand">
      <h2 className="text-lg font-bold text-coastal">{title}</h2>
    </div>
    <div className="p-6">{children}</div>
    <div className="p-6 pt-0 flex justify-end gap-2">{actions}</div>
  </div>
</div>
```

### Toast
```tsx
<div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-[14px] bg-white"
  style={{ boxShadow: 'var(--shadow-card-hover)', animation: 'fadeSlideIn 0.3s ease-out' }}>
  <span className={cn("w-5 h-5 rounded-full flex items-center justify-center",
    type === 'success' && "bg-lagoon/10 text-lagoon",
    type === 'error' && "bg-coral-reef/10 text-coral-reef"
  )}><LucideIcon size={12} /></span>
  <span className="text-[13px] font-medium text-coastal">{message}</span>
</div>
```

### Warning Banner

> 2026-04-17 pre-work note: no formal warning-panel recipe was documented here before. The amber-tide analog of the error banner (below) was used during Track A pre-work at `src/components/dashboard/BookingComConnect.tsx` — linear-gradient from `rgba(212,150,11,0.08)` to `rgba(212,150,11,0.02)`, `1px solid rgba(212,150,11,0.2)` border, `text-amber-tide` heading + icon, `text-tideline` body. Formalize this pattern (and its dismissible/non-dismissible variants) during Track A polish.

### Error Banner (not dismissible)
```tsx
<div className="p-4 rounded-[14px] flex items-center gap-3"
  style={{ background: 'linear-gradient(135deg, rgba(196,64,64,0.08), rgba(196,64,64,0.02))', border: '1px solid rgba(196,64,64,0.15)' }}>
  <span className="w-[10px] h-[10px] rounded-full bg-coral-reef flex-shrink-0" />
  <div className="flex-1">
    <div className="text-[13px] font-semibold text-coral-reef">{title}</div>
    <div className="text-xs text-tideline mt-[2px]">{description}</div>
  </div>
  <button className="bg-coral-reef text-white rounded-[10px] py-[9px] px-4 text-xs font-semibold">{action}</button>
</div>
```

### Loading Skeleton
```tsx
<div className="rounded-2xl overflow-hidden bg-white" style={{ boxShadow: 'var(--shadow-card)' }}>
  <div className="h-[160px] bg-dry-sand animate-pulse" />
  <div className="p-4 space-y-2">
    <div className="h-4 bg-dry-sand rounded-lg w-3/4 animate-pulse" />
    <div className="h-3 bg-dry-sand/60 rounded-lg w-1/2 animate-pulse" />
  </div>
</div>
```
Skeleton uses `bg-dry-sand` (not gray). `animate-pulse` is allowed ONLY on skeletons.

### Empty State
```tsx
<div className="flex flex-col items-center justify-center py-16">
  <div className="w-14 h-14 rounded-2xl bg-golden/10 flex items-center justify-center mb-4">
    <LucideIcon size={24} className="text-golden" />
  </div>
  <h3 className="text-base font-bold text-coastal mb-1">{title}</h3>
  <p className="text-[13px] text-tideline text-center max-w-[320px] mb-5">{description}</p>
  <button className="bg-coastal text-shore rounded-[10px] py-[9px] px-5 text-xs font-semibold">{action}</button>
</div>
```

---

## 12. ICONS — Lucide React

| Context | Size | strokeWidth |
|---------|------|-------------|
| Sidebar nav | 18px | 1.5 |
| Feed items | 14px | 1.5 |
| Buttons inline | 14px | 2 |
| Action buttons | 16px | 1.5 |

Assignments: Dashboard=`LayoutDashboard`, Calendar=`CalendarDays`, Messages=`MessageSquare`, Properties=`Home`, Pricing=`DollarSign`, Reviews=`Star`, Turnovers=`Sparkles`, Market Intel=`TrendingUp`, Comp Sets=`Target`, Settings=`Settings`, Add=`Plus`, Back=`ArrowLeft`, Send=`Send`, Check=`Check`, Warning=`AlertTriangle`, Error=`AlertCircle`, Close=`X`

---

## 13. Z-INDEX

| z | Elements |
|---|----------|
| 0 | Page content |
| 2 | Selected calendar cell |
| 3 | Booking bars |
| 10 | Sidebar, hovered booking bar |
| 30 | Dropdowns, popovers |
| 40 | Modal backdrop |
| 41 | Modal content |
| 50 | Toast |

---

## 14. RESPONSIVE

| Breakpoint | Sidebar | Prop List | Calendar | Rate Panel |
|------------|---------|-----------|----------|------------|
| >= 1440px | 220px | 80px | flex | 310px |
| 1280-1439 | 220px | 80px | flex | 280px |
| 1024-1279 | 60px icons | Hidden | flex | 280px |
| < 1024 | Hidden | Hidden | full | Slides over |

---

## 15. TONE

- **No emojis.** Not in AI drafts, reviews, UI, activity feed, notifications. Anywhere.
- **No animated dots.** Status = solid dot. Only allowed animations: entrance choreography (Section 16), AI ambient glow (large radial gradient on card bg), loading skeletons (`animate-pulse` on rectangles).
- **AI tone:** Warm, professional. Reference specifics (property name, guest name, dates, local places). 2-4 sentences for reviews. No filler: "I hope this helps", "Please don't hesitate", "We look forward to".

---

## 16. ENTRANCE ANIMATIONS

Every page loads with choreographed entrance. Elements start `opacity: 0; transform: translateY(20px)` and animate in.

```css
@keyframes fadeSlideIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
@keyframes cardReveal { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
@keyframes aiGlow { 0%,100% { opacity:0.5; transform:scale(1); } 50% { opacity:1; transform:scale(1.1); } }
```

Dashboard timing: greeting (100ms) → subtitle (200ms) → label (300ms) → cards (350ms, stagger 100ms each) → stats (600ms, stagger 80ms) → chart (850ms) → feed (1000ms) → AI cards (1100ms, 1200ms). Numbers count up from 0 starting at 800ms (1200ms duration, 50 steps). Chart draws left-to-right over 1.5s.

**Rules:** Stagger 80-100ms. Duration 0.4-0.6s. Easing `ease-out`. Apply to ALL pages.

> 2026-04-17 pre-work: the three keyframes above are now implemented in `src/app/globals.css` with utility classes `.animate-fadeSlideIn` (400ms), `.animate-cardReveal` (500ms), `.animate-aiGlow` (3s infinite). Durations/easings were picked inside the spec band; aiGlow's infinite cadence was not specified here originally and was chosen as a slow ambient loop. Track D copy/motion pass should tune once there's a shipped UI to audit.

### useCountUp hook
```tsx
import { useState, useEffect } from 'react';
export function useCountUp(target: number, duration = 1200, delay = 800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const timeout = setTimeout(() => {
      const steps = 50;
      const inc = target / steps;
      let cur = 0;
      const interval = setInterval(() => {
        cur += inc;
        if (cur >= target) { cur = target; clearInterval(interval); }
        setValue(Math.round(cur * 100) / 100);
      }, duration / steps);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timeout);
  }, [target, duration, delay]);
  return value;
}
```

### Revenue chart: Canvas-drawn, no chart library
Line `#1a7a5a` 2px, area gradient `rgba(26,122,90,0.15→0.01)`, grid `#ede7db` 0.5px, labels 10px tideline. Animated draw via requestAnimationFrame. See `koast-dashboard-v3.html`.

---

## 17. PAGE PATTERNS

### 17.1 Dashboard
Greeting + sync badge (solid dot) → property cards (clickable) → glass stats (2x2 with sparklines + count-up) → revenue chart (canvas) → activity feed + AI cards (dark, ambient glow)

### 17.2 Calendar
Three columns: thumbnails 80px | grid flex | panel 310px. Airbnb-style grid, dark bars, overlap math. Panel: booking → rates → availability → min stay.

### 17.3 Messages
Three columns: conversations 340px | thread flex | context 300px. Platform logos on avatars. AI drafts: dashed golden border, solid dot badge. No emojis.

### 17.4 Properties
Photo cards, entire card clickable, NO buttons. Status bar. Channel badges. Add card: dashed golden.

### 17.5 Property Detail
Hero photo + channel badges + "Connect listing". THREE tabs: Overview | Calendar | Pricing. Settings live in Calendar panel. Gear icon for global settings.

### 17.6 Pricing
NOT signal cards with progress bars. Structure: scorecard ("leaving $X on table") → recommendations (chronological, expandable) → rules (base, min/max, markups, auto-apply) → performance tracking.

### 17.7 Turnovers: Turnovers is a tabbed list today (Today / Upcoming / Completed / All) with per-card cascade entrance. Kanban structure is a candidate for Track D Host Psychology Pass — requires workflow analysis to confirm whether kanban (movement-across-stages) or tabbed list (flow-to-completion) better matches how hosts actually coordinate cleaners. Do NOT rebuild as kanban without that analysis. Shipped structure is canonical until Track D says otherwise.
### 17.8 Reviews: Feed + AI drafts left, stats + generator right. No emojis.
### 17.9 Market Intel: Glass stats + Leaflet map (60%) + comp sidebar (40%).
### 17.10 Login: Dark deep-sea, radial glows, glass form, golden CTA, Google OAuth. "Your hosting runs itself"

---

## 18. DO / DON'T

### DO:
- Exact shadow stacks from CSS variables
- Golden section labels before every group
- Glass cards for portfolio metrics only
- Dark #222 booking bars with real logos
- `cubic-bezier(0.4,0,0.2,1)` for hover
- `ease-out` for entrance only
- Airbnb red circle for today
- Rates only on unbooked dates
- `PLATFORMS[key]` for all platform refs
- Entrance choreography on every page
- Count-up on stat numbers
- Canvas for revenue chart

### DON'T:
- Tailwind shadow utilities
- Any gray colors (gray-*, slate-*, zinc-*)
- Colored booking bars
- Top borders or progress bars on cards
- `ease` or `linear` transitions
- Glass cards on everything
- Colored circles with letters as logos
- Emojis anywhere
- `animate-pulse` on dots (only on skeletons)
- `box-shadow` glow on status dots
- Chart.js, recharts, or any chart library
- Hardcoded platform icon paths

---

## 19. REFERENCE MOCKUPS

Place in `/docs/mockups/`. Not production code — design targets.

| Page | File |
|------|------|
| Dashboard | `koast-dashboard-v3.html` |
| Calendar | `koast-calendar-v2.html` |
| Messages | `koast-messages.html` |
| Properties | `koast-properties.html` |
| Property Detail | `koast-property-detail.html` |
| Pricing, Market Intel, Cleaning, Reviews, Login | `koast-remaining-pages.html` |
