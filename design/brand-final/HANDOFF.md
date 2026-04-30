# Koast Brand v1.0 — Handoff

**Audience:** Claude Code instance on the Virginia VPS, integrating this brand package into the `koast` repo (Koast product surface at app.koasthq.com).

**TL;DR:** This zip contains every brand asset for Koast — SVG masters, raster outputs, motion vocabulary, full guidelines. Place at `~/koast/design/brand-final/` (where it's already extracted if you SCP'd from Cesar's local). Then propagate cool-teal palette tokens, swap favicons, update OG meta, and wire up motion vocabulary in shared components. **No code changes have been made to the koast repo yet — that's your job.**

---

## What this zip contains

```
brand-final/
├── README.md                 ← Top-level reference, SCP commands, font notes
├── HANDOFF.md                ← THIS FILE
├── regenerate-with-pjs.sh    ← Run ONCE: installs PJ Sans, re-renders PNGs
├── rasterize.py              ← PNG pipeline (mark-only + wordmark + OG + icons). Can run directly without the bootstrap if PJ Sans is already installed system-wide.
├── make-motion-gifs.py       ← Generates the 8 motion-exploration/*.gif preview files (240×240 indexed-palette GIFs of cascade / pulse / milestone / hero motion). Pillow-only; no headless browser. Run only when the motion vocabulary itself changes — the GIFs are previews, not canonical sources (the canonical motion lives as CSS keyframes in motion-vocabulary.html). One-shot, not a build-step.
├── masters/        12 SVG + 4 PNG previews + README.md — vector source of truth
├── favicons/       7 PNG + 1 ICO + README.md — browser tabs, PWA install
├── social/         4 PNG + README.md — OG cards (1200×630), square (1080×1080), light + dark
├── app-icons/      4 PNG + README.md — iOS 1024, Android adaptive 432, Windows tile 310
├── fallback/       5 SVG + README.md — wordmark-only variants (color, mono-black, mono-white, currentColor)
├── guidelines/     1 HTML — brand-one-pager.html, canonical brand spec
└── motion-exploration/  2 HTML + 8 GIF + README.md — motion vocabulary spec + previews
```

Each sub-directory README.md documents that directory's specific contents and conventions. The top-level README.md covers cross-cutting concerns (SCP commands, font dependencies, regeneration flow).

**Total: 59 files, ~1.3 MB unpacked.**

---

## Locked brand decisions (read first)

### 1. Positioning

Koast is the AI co-host for short-term rentals (formerly StayCommand pre-BR1, now unified under the Koast brand). The wordmark is **always lowercase except the leading 'K'**: "Koast", never "KOAST" or "koast". Tagline: *"the AI co-host for short-term rentals."*

### 2. Palette — cool teal

A geological/coastal teal system. **The 9-color palette below is the locked source of truth** — these tokens propagate into product code (`globals.css`, Tailwind config, Storybook, etc.).

```
Backgrounds
  Shore       #f7f3ec   ← light bg substrate
  Deep Sea    #132e20   ← dark bg substrate
  Ink         #0f1815   ← primary text on light

Bands (light surface)
  Shore Mist  #d4eef0   ← top band (lightest)
  Shoal       #a8e0e3
  Tide        #4cc4cc   ← BRAND PRIMARY teal
  Reef        #2ba2ad
  Trench      #0e7a8a   ← bottom band (deepest)

Bands (dark surface — substituted bottom for contrast)
  band 1: #d4eef0  (same as light)
  band 2: #8ad9dc
  band 3: #4cc4cc  (Tide, same as light)
  band 4: #3aa3aa
  band 5: #2e8c95
```

### 3. Logo — banded circle as the "o"

The brand mark is a banded circle representing accumulated geological strata — visual metaphor for the AI co-host accumulating context, memory, and learning. The mark functions as the lowercase 'o' in the wordmark "Koast" *and* stands alone as a symbol.

- **Wordmark type:** Plus Jakarta Sans 800, letter-spacing -0.045em
- **Size rules:** 5-band variant ≥48px; 3-band variant <48px; wordmark-only fallback <16px
- **Vertical band proportions are precise** — see `masters/koast-mark-5band-light.svg` for the canonical y-offsets (4, 27, 47, 65, 82, 96 in viewBox-100 units). Do not eyeball.

### 4. Motion vocabulary v1.0 — five registers

| Register | Gesture | When |
|---|---|---|
| **Idle** | Static (no motion) | Default state — app chrome, headers, anywhere mark just exists |
| **Active** | Cascade — bands fade top-down (1.0 → 0.55 → 1.0, 3s cycle, 130ms stagger) | While AI is processing, sync running, async work in flight |
| **Active small (16-31px)** | Brightness pulse — whole-mark CSS filter (1.0 → 1.12, 1.6s) | Same triggers as active, fallback when cascade is too subtle |
| **Milestone** | Deposit — ghost band drops in, stack shifts 18px (one-shot, 2s) | Tier 1 host milestones + Tier 2 system milestones (see motion-vocabulary.html) |
| **Marketing hero** | Cascade continuous (no rest, 2.4s) | Public landing page hero ONLY — never propagated elsewhere |

**Below 16px: no animation, ever.** Favicons should not animate at any size as a category rule.

### 5. Static-only surfaces (locked)

Active state with motion is for **live web/app contexts only**. The following surfaces are pure static — all bands at full opacity, evenly stacked, no motion implied:

- OG / social cards
- iOS / Android / Windows app icons
- All favicon sizes including PWA 512
- Print, PDF, email signatures

The `rasterize.py` pipeline produces these as pure static by construction. Don't introduce cascade-still frames for share previews — they'd look like degraded versions of the static composition.

---

## Integration steps for Claude Code (in order)

These are the recommended next actions. Execute one at a time, get Cesar's review on each, don't batch.

### Step 1 — Place the package and run font bootstrap

If unpacking from a SCP'd zip:
```bash
cd ~
unzip koast-brand-final-v1.0.zip -d koast/design/
cd ~/koast/design/brand-final
bash regenerate-with-pjs.sh
```

The bootstrap script installs Plus Jakarta Sans ExtraBold and re-runs `rasterize.py`. After completion, `social/og-card-*.png` and `social/square-*.png` will have the correct PJ Sans wordmark instead of the Poppins fallback they ship with.

**Stop here and verify.** Open `social/og-card-1200x630.png` and confirm the "K" has PJ Sans's characteristic geometry (open lower-left counter, slightly looser construction than Poppins). If the script failed all download mirrors, see manual install instructions in `README.md`.

### Step 2 — Optionally commit to a brand branch

If Cesar wants this isolated for review:
```bash
cd ~/koast
git checkout -b brand/initial-identity
mkdir -p public/brand
cp -r ~/koast/design/brand-final public/brand/
git add public/brand/brand-final
git commit -m "brand: ship Koast identity v1.0

- 5/3-band logo system, Plus Jakarta Sans 800 wordmark
- Cool teal palette (Tide #4cc4cc primary)
- Five-register motion vocabulary: idle / active / active-small / milestone / marketing-hero
- All static + animated assets in public/brand/brand-final/
"
```

**Don't push without Cesar's confirmation.** He may want a different path structure or to keep brand-final/ outside the repo entirely (read-only reference).

### Step 3 — Propagate palette tokens

**As of 2026-04-30, none of these tokens are in globals.css yet.** Cool teal cluster locked at `--lume-light` / `--lume` / `--lume-deep` (3-stop scale). Middle bands (`#a8e0e3`, `#2ba2ad`) live ONLY in the SVG masters where the geological metaphor needs them — this is intentional, not a gap. Component code uses the 3-stop; SVG masters use the 5-stop. Propagation to globals.css is the palette-evolution session's job, not this branch's.

Find the existing design tokens in the koast codebase. Likely locations (search in this order):
1. `src/app/globals.css` — bare CSS variables under `:root` (Tailwind v3 convention used by this codebase)
2. `tailwind.config.ts` — `theme.extend.colors` referencing the CSS vars via `var(--token)`
3. `src/styles/tokens.css` — if a tokens file is broken out separately

**Read the existing tokens before writing.** PD-V1 tokens use bare coastal-feature names organized into Primary / Accent / Neutral / Semantic groups (e.g. `--deep-sea`, `--coastal`, `--golden`, `--lagoon`). Don't blow them away. Add the Koast AI-accent cluster as a new fifth group. Sample addition (matches existing PD-V1 convention):

```css
:root {
  /* AI accent — cool teal (added by palette-evolution session) */
  --lume-light: #d4eef0;
  --lume:       #4cc4cc;   /* BRAND PRIMARY — AI accent */
  --lume-deep:  #0e7a8a;
}
```

Then expose via `tailwind.config.ts`:

```ts
theme: {
  extend: {
    colors: {
      "lume-light": "var(--lume-light)",
      "lume":       "var(--lume)",
      "lume-deep":  "var(--lume-deep)",
    },
  },
},
```

If component code needs the middle-band colors (`#a8e0e3` Shoal, `#2ba2ad` Reef) for some reason, escalate to Cesar — the locked decision was deliberately to keep those out of the token system.

### Step 4 — Swap favicons and PWA icons

Move from old favicons to new ones:
- Replace `public/favicon.ico` with `brand-final/favicons/favicon.ico`
- Replace `public/apple-touch-icon.png` with `brand-final/favicons/apple-touch-icon-180.png`
- Copy `favicons/android-chrome-192.png` → `public/android-chrome-192x192.png`
- Copy `favicons/android-chrome-512.png` → `public/android-chrome-512x512.png`
  (the `x192`/`x512` suffix is Next.js convention for the `public/` destination filename; source files in `brand-final/favicons/` omit it)
- Verify `app/manifest.json` (or `manifest.webmanifest`) icon paths still resolve

In `app/layout.tsx` (or wherever `<head>` is defined), confirm favicon links point to the new files. Next.js 14 auto-detects `app/icon.png` and `app/apple-icon.png` — if those exist, they take precedence and need updating too.

### Step 5 — Update OG meta tags

Update Open Graph image references to point to the new social cards:

```tsx
// app/layout.tsx or per-page metadata
export const metadata: Metadata = {
  openGraph: {
    images: [
      {
        url: '/brand/brand-final/social/og-card-1200x630.png',
        width: 1200,
        height: 630,
        alt: 'Koast — the AI co-host for short-term rentals',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/brand/brand-final/social/og-card-1200x630.png'],
  },
};
```

If the site has dark-mode preview support (e.g., per-route OG), wire `og-card-1200x630-dark.png` into the dark variant.

### Step 6 — Implement motion vocabulary as a shared component

Create `src/components/brand/KoastMark.tsx` (or wherever the design system lives). The component should:

- Accept `size` prop (number, px) and `state` prop (`'idle' | 'active' | 'milestone'`)
- Auto-select 5-band vs 3-band SVG based on size
- Auto-select cascade vs pulse animation based on size (≥32px → cascade, 16-31px → pulse, <16px → no animation)
- Set `data-state` attribute for CSS animation hooks
- Listen for `animationend` on milestone transitions to return to idle

The full CSS reference and React implementation pattern are in `motion-exploration/motion-vocabulary.html`. Copy the keyframes into a global stylesheet or scope them within the component.

**Important:** the milestone state machine (which events fire deposit) is a separate follow-up that lives in `koast/koast-workers`. The component just needs to react to whatever state the parent passes in. Don't try to wire up event subscriptions in this initial integration.

### Step 7 — Update marketing landing hero

If the marketing landing page is in this repo (or a sister `koast-marketing` repo), wire the hero variant: continuous cascade (2.4s, no rest, negative stagger). CSS in `motion-vocabulary.html` under "Marketing hero — continuous cascade."

This is the only surface where motion runs continuously without a quiet phase. Don't propagate it to the body, pricing page, blog, or any in-app surface.

---

## Reference files (canonical sources)

When in doubt, these win over anything written here:

| File | What it covers |
|---|---|
| `guidelines/brand-one-pager.html` | Single-page brand spec — every visual rule, color tokens, do/don't, asset index |
| `motion-exploration/motion-vocabulary.html` | Motion specs — keyframes, trigger taxonomy, state transitions, React pattern |
| `masters/*.svg` | Vector source of truth for every mark variant |
| `README.md` | Build pipeline, font dependencies, transfer commands |

Open both HTML files in a browser before writing integration code. They have live animations and full CSS references that paragraph descriptions can't capture.

---

## Things NOT to do

- **Don't introduce new band gradients or color variants.** The 9-color palette is locked. If a UI element needs a teal that isn't in the palette, use opacity layering on Tide or Trench.
- **Don't animate marks below 16px.** Favicons stay static.
- **Don't fire the milestone deposit on routine events** (every booking, every message). Tier 1 fires *once per host, ever* — the trigger taxonomy in `motion-vocabulary.html` is the recommendation, but the actual state machine implementation lives in `koast/koast-workers` and is out of scope for this brand integration.
- **Don't bake Poppins into anything permanent.** If `regenerate-with-pjs.sh` failed to install PJ Sans, surface the failure to Cesar — don't silently ship Poppins-rendered PNGs to production.
- **Don't propagate the marketing-hero cascade variant beyond the public landing hero.** It's continuous motion designed for first-time visitors; in the app it would be fatiguing.

---

## Open questions to surface (don't decide unilaterally)

When you hit these, ask Cesar before proceeding:

1. **Branch strategy:** Cesar mentioned `brand/initial-identity` as one option. He may prefer a feature branch per integration step or a single PR. Confirm.
2. **Token naming:** existing `PD-V1` tokens vs new `koast-*` tokens — do they coexist, or does v2 replace v1? Could be a meaningful product decision.
3. **Icon path strategy:** Next.js convention places icons at `app/icon.png` etc. for auto-detection. The brand-final folder convention is `public/brand/brand-final/favicons/`. Pick one path-of-record.
4. **OG image hosting:** if the site has a CDN (Vercel, Cloudflare), OG images may need to live on that CDN with absolute URLs in meta tags rather than relative paths.
5. **Motion implementation framework:** plain CSS keyframes vs Framer Motion vs CSS-in-JS. Check what the existing component library uses and match it.

---

*v1.0 · 2026.04.30 · brand-final*
