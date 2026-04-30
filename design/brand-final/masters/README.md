# Koast — SVG Masters

Optimized vector source files for the Koast brand mark and wordmark. All other production assets (favicons, social cards, app icons) derive from these.

## Static marks (no font dependency)

| File | Use |
| --- | --- |
| `koast-mark-5band-light.svg` | **Idle / static**, light bg, ≥48px |
| `koast-mark-5band-dark.svg` | **Idle / static**, dark bg, ≥48px |
| `koast-mark-3band-light.svg` | **Idle / static**, light bg, <48px (favicon) |
| `koast-mark-3band-dark.svg` | **Idle / static**, dark bg, <48px (favicon) |

## Active state — cascade (production "thinking" indicator)

| File | Use |
| --- | --- |
| `koast-mark-cascade-light.svg` | **Active**, light bg, ≥32px |
| `koast-mark-cascade-dark.svg` | **Active**, dark bg, ≥32px |

Soft top-down cascade through the bands. Opacity 1.0 → 0.55 → 1.0. 3s cycle, 130ms stagger, ~43% wave / ~57% rest. Reads as *consulting layers*. Triggered while AI is processing, sync running, or any background work the user should know about.

## Active state — pulse (small-size fallback)

| File | Use |
| --- | --- |
| `koast-mark-pulse-light.svg` | **Active**, light bg, 16-31px |
| `koast-mark-pulse-dark.svg` | **Active**, dark bg, 16-31px |

3-band base + whole-mark CSS filter pulse (brightness 1.0 → 1.12, saturation 1.0 → 1.1). 1.6s cycle, ease-in-out. Used when the cascade's per-band opacity changes are too subtle to perceive at small sizes. Below 16px (favicon territory) the active state is omitted entirely — favicons should not animate.

## Milestone — deposit (rare celebration events)

| File | Use |
| --- | --- |
| `koast-mark-milestone-light.svg` | **Milestone**, light bg |
| `koast-mark-milestone-dark.svg` | **Milestone**, dark bg |

Single ghost band drops in from above; stack shifts 18px downward (full band-height); everything settles. 5s cycle in this preview file (50% rest, 2s event). In production, deployed as a one-shot via state management, not looped. Reserved for specific events: onboarding completion, first guest message handled, daily pricing sync complete, etc. See `motion-exploration/` for trigger taxonomy.

## Wordmarks (font-dependent)

| File | Use |
| --- | --- |
| `koast-wordmark-light.svg` | Full wordmark with banded-o, light bg |
| `koast-wordmark-dark.svg` | Full wordmark with banded-o, dark bg |

These reference **Plus Jakarta Sans 800** via `font-family`. Static. The banded-o inside the wordmark uses the 5-band variant; switch to 3-band for `font-size < 48px` deployments.

## Motion vocabulary at a glance

```
        STATE                    GESTURE                FILE PREFIX
        -----------------------  --------------------   -----------------
        idle                     no motion              koast-mark-5band / -3band
        active (≥32px)           cascade                koast-mark-cascade
        active (16-31px)         pulse                  koast-mark-pulse
        active (<16px)           — (omit)               (no file)
        milestone                deposit                koast-mark-milestone
        marketing hero ambient   continuous cascade     (CSS variant of cascade)
```

For full motion vocabulary specs, trigger conditions, and CSS reference, see `../motion-exploration/`.

## Color palette (locked)

```
Light backgrounds (#f7f3ec base):
  band 1 (top):    #d4eef0   ← lightest, "newest deposit"
  band 2:          #a8e0e3
  band 3 (mid):    #4cc4cc   ← brand primary teal
  band 4:          #2ba2ad
  band 5 (bottom): #0e7a8a   ← deep teal, "oldest sediment"

Dark backgrounds (#132e20 base):
  band 1 (top):    #d4eef0
  band 2:          #8ad9dc
  band 3 (mid):    #4cc4cc
  band 4:          #3aa3aa
  band 5 (bottom): #2e8c95   ← lightened bottom for contrast
```

## File history

| Old file | Replaced by | Reason |
| --- | --- | --- |
| `koast-mark-animated-A.svg` | `koast-mark-milestone-light.svg` (gesture relabeled) | Deposit reclassified from "production active" to "milestone" |
| `koast-mark-animated-B.svg` | CSS variant of cascade (no separate SVG needed) | Marketing hero now uses continuous cascade rather than slow deposit |

These old files have been removed. Update consumers to use the new descriptive filenames.
