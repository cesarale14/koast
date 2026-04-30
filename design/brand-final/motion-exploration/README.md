# Koast — Motion vocabulary (v1.0 LOCKED)

**Status:** Locked. Cascade as primary active state, deposit as milestone gesture. Production deliverables can resume.

## What this is

The locked motion vocabulary for the Koast banded-O. Three registers: idle, active, milestone. Plus a small-size active fallback (pulse) and a marketing-hero variant.

The full canonical reference is `motion-vocabulary.html` — open in a browser for live demos with light + dark, CSS code blocks, trigger taxonomies, and implementation pattern.

## The vocabulary at a glance

| Register | Gesture | When | File prefix |
| --- | --- | --- | --- |
| **Idle** | Static (no motion) | Default state | `koast-mark-5band-*` / `koast-mark-3band-*` |
| **Active** | Cascade | AI processing, sync running, async work | `koast-mark-cascade-*` |
| **Active small** | Brightness pulse | Same triggers as active, at 16-31px | `koast-mark-pulse-*` |
| **Milestone** | Deposit | Tier 1/2 milestone events (one-shot) | `koast-mark-milestone-*` |
| **Marketing hero** | Cascade continuous | Marketing landing page hero only | (CSS variant of cascade) |

## Locked specs

### Idle — static
No animation. The composed brand mark at rest. Why static (not 1-2% breath): with cascade as a strong active signal, breath either doesn't register or competes for "motion = active" semantics. Industry convention favors static marks (Stripe, Linear, Vercel, Anthropic). Most defensible, accessible by default.

### Active — cascade soft
- **Opacity:** 1.0 → 0.55 → 1.0 (never below 0.55 — readability preserved)
- **Cycle:** 3.0s
- **Stagger:** 130ms top-to-bottom
- **Wave duration:** ~650ms; rest ~1.7s (~57% rest, ~43% wave)
- **Easing:** cubic-bezier(0.45, 0, 0.55, 1)
- **Direction:** top-down (natural scan order)
- **Size threshold:** ≥32px

### Active fallback — pulse
- **Filter:** brightness(1.0 → 1.12 → 1.0), saturation(1.0 → 1.10 → 1.0)
- **Cycle:** 1.6s
- **Easing:** ease-in-out
- **Size range:** 16-31px (below 16px, no active state)

### Milestone — deposit (one-shot)
- **Gesture:** ghost band drops from y=-23 to y=0; stack shifts down 18px (full band-height)
- **Event duration:** 2.0s
- **Easing:** cubic-bezier(0.4, 0, 0.6, 1)
- **Production deployment:** one-shot fired by JS state change, returns to idle on `animationend`

### Marketing hero — continuous cascade
- **Same gesture as active**, but no rest period
- **Cycle:** 2.4s with negative stagger delays creating immediate desync
- **Single context:** public landing page hero only

## Where motion does NOT live (locked)

Active state with motion is for **live web/app contexts only**. The following surfaces are pure static — all bands at full opacity, evenly stacked, no motion implied:

- OG / social cards (1200×630, 1080×1080)
- iOS app icon (1024×1024)
- Android adaptive icon (foreground + bg)
- Windows tile, Apple touch icon, all favicon sizes
- Print / PDF brand assets
- Email signatures

**Why:** first-time viewers seeing the brand on a share preview need the cleanest read of what Koast is. A cascade-still — a single mid-fade frame — would look like a degraded version of the static composition. The motion vocabulary earns its place in live product surfaces because users see it across time; in a single frame, motion is invisible at best, broken-looking at worst.

The `rasterize.py` pipeline renders all of these as pure static by construction (bands drawn at full opacity from the spec — there is no animation state to capture). This is the locked rule, not an implementation detail.

## Trigger conditions for milestone deposit (locked)

### Active fires for:
- AI generating a guest message reply
- Pricing engine recalculating
- Booking sync in flight (Channex / Airbnb)
- Channel manager re-sync
- Property data refresh / iCal poll
- Onboarding initial analysis

### Milestone fires for:

**Tier 1 — Host milestones (once per host, ever)**
- First listing onboarded
- First booking received
- First AI-drafted message approved
- First public reply published
- First successful guest review submitted

**Tier 2 — System milestones (natural cadence)**
- Daily pricing sync completed (~once/day)
- Weekly reviews wrap-up sent
- Monthly summary email delivered
- Major bug fix or feature launch (admin manual trigger)

### Silent (no animation):
- Every individual booking after the first (cascade only during sync)
- Every individual AI message after the first (cascade only during gen)
- Routine API calls / page loads
- Background polling without user impact
- Errors / warnings / failures (different visual entirely)

**Rule of thumb:** Tier 1 fires *once per host, ever* — a host who's been on Koast for two years should never see a Tier 1 deposit again. Tier 2 fires on natural cadence, so a typical active host sees roughly 1-3 deposits per day. If you find yourself firing on every booking, every message, or every pricing recommendation, the bar's too low and the gesture loses meaning.

### Implementation note

The product-side state machine that fires these events lives in `koast/koast-workers` and is implemented as a follow-up. The brand layer defines *which events deserve the gesture*; the product layer wires them up. Tier 1 events should be deduplicated via persistent storage — a host who's seen "first booking" should never see that deposit again, even across sessions, devices, or account re-logins.

## Implementation pattern

```jsx
<span className="koast-mark"
      data-state={state}              // 'idle' | 'active' | 'milestone'
      data-size={size < 32 ? 'small' : 'normal'}>
  <svg viewBox="0 0 100 100">
    {/* bands with classes b1..b5, plus a ghost rect for milestone */}
  </svg>
</span>
```

CSS handles transitions. Backend sets `data-state` based on async work in flight. Component listens for `animationend` to return milestone to idle.

## Files in this directory

| File | Purpose |
| --- | --- |
| `motion-vocabulary.html` | **Canonical reference.** Open in browser for live demos, CSS code, trigger tables, implementation pattern. |
| `motion-philosophies.html` | Historical record of the philosophy exploration (A/B/C) that led to this vocabulary. Kept for context. |
| `README.md` | This file — quick-reference summary of the locked decisions. |

## What changed from earlier specs

| Old | New |
| --- | --- |
| Single deposit animation (variant A, 4s) used for all active states | Cascade for active, deposit reclassified as milestone-only |
| `koast-mark-animated-A.svg` | Deleted; superseded by `koast-mark-milestone-light/dark.svg` |
| `koast-mark-animated-B.svg` | Deleted; marketing hero now uses CSS variant of cascade |
| Idle was implied static (Philosophy C from prior exploration) | Idle is explicitly static (locked, no breath variant) |
| No small-size fallback | Pulse register added for 16-31px contexts |

## What's pending

- [ ] `guidelines/brand-one-pager.html` Section 05 (Motion) update to reflect layered vocabulary (current copy describes single-animation system)
- [ ] Animated GIF previews of each register (cascade, pulse, milestone, hero) — for sharing in non-browser contexts
- [ ] Regenerate social/OG cards if any reference active state implicitly *(deferred per Cesar)*

## Sign-off

This vocabulary is locked. Production deliverables can resume from this point.

---
*v1.0 · 2026.04.30 · supersedes the v0.1 philosophy exploration*
