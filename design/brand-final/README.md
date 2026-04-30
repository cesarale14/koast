# Koast — Brand assets (final)

Complete production-grade brand asset package for Koast. Single source of truth: this folder.

```
brand-final/
├── README.md                Top-level reference (this file)
├── HANDOFF.md               Integration brief for Claude Code on the VPS
├── masters/                 Optimized SVG sources (idle, cascade, pulse, milestone, wordmark) + 1024px raster previews
├── favicons/                PNG favicons 16/24/32/48/180/192/512 + .ico    (static)
├── social/                  OG cards 1200×630 + square 1080×1080 (light + dark)    (static)
├── app-icons/               iOS / Android adaptive / Windows tile    (static)
├── fallback/                Wordmark-only SVGs (color, mono-black, mono-white, currentColor)
├── guidelines/              brand-one-pager.html — canonical brand spec
├── motion-exploration/      motion-vocabulary.html (canonical) + 8 GIF previews + philosophy archive
├── rasterize.py             Pipeline for regenerating all static PNG outputs from spec
├── make-motion-gifs.py      Pipeline for regenerating motion preview GIFs
└── regenerate-with-pjs.sh   One-command bootstrap: installs PJ Sans on the VPS and re-runs rasterizer
```

## Locked specs

| | |
| --- | --- |
| Mark | Banded circle as the lowercase **o** in "Koast" wordmark |
| Type | Plus Jakarta Sans 800 · letter-spacing -0.045em |
| 5-band variant | font-size ≥ 48px |
| 3-band variant | font-size < 48px |
| Wordmark-only fallback | font-size < 16px or single-color contexts |
| **Motion: idle** | Static. The default state. |
| **Motion: active** | Cascade — bands fade top-down sequentially (1.0 → 0.55 → 1.0, 3s cycle, 130ms stagger). Triggered while AI is processing. |
| **Motion: active small** | Brightness pulse for 16-31px (cascade invisible at small sizes). |
| **Motion: milestone** | Deposit — one-shot ghost-band drop on positive completion events. |
| **Motion: marketing hero** | Cascade continuous (no rest) — public landing page only. |
| **Static-only surfaces** | OG cards · social · app icons · favicons · print · email signatures. Motion is for live web/app contexts only. |
| Light substrate | Shore #f7f3ec |
| Dark substrate | Deep Sea #132e20 |
| Brand teal | Tide #4cc4cc (primary), Trench #0e7a8a (deep), Shore Mist #d4eef0 (light) |

## Where to start

1. **Designers / brand consumers** → open `guidelines/brand-one-pager.html` in a browser. Single-page reference with every rule, live-animated examples, and color tokens.
2. **Motion details** → `motion-exploration/motion-vocabulary.html` is the canonical motion reference (state transitions, trigger taxonomy, implementation pattern, CSS).
3. **Developers** → use SVGs from `masters/` for any vector work. Use PNGs from `favicons/` and `social/` for static contexts. Animation CSS is documented in both the guidelines and motion-vocabulary docs.
4. **Marketing / social** → OG cards in `social/`, ready-to-upload at the right dimensions. All static — never animated.
5. **App platforms** → `app-icons/` has iOS/Android/Windows variants in their native specs. All static.

## Production note: Plus Jakarta Sans

This package was assembled in a build environment without internet access for font fetching. PNG outputs that include the wordmark (`social/og-card-*.png`, `social/square-*.png`) were rasterized using **Poppins Bold** as a visually adjacent fallback — same geometric-sans family, similar 'K' / lowercase 'a' / 's' construction. Vector masters (SVG) reference Plus Jakarta Sans correctly via `font-family` and render properly anywhere PJ Sans is loaded.

**Affected PNGs (regenerate after PJ Sans install):**
- `social/og-card-1200x630.png` and `-dark.png` (wordmark + tagline)
- `social/square-1080x1080.png` and `-dark.png` (wordmark below mark)

**Unaffected (font-independent, ready as-is):**
- All `favicons/*.png` (mark only, no wordmark)
- All `app-icons/*.png` (iOS, Android, Windows tile — mark only)
- All `masters/*-1024.png` (mark previews)

### One-command fix on the VPS

The zip ships with `regenerate-with-pjs.sh` — a bootstrap script that installs PJ Sans and re-runs the rasterizer. From the VPS:

```bash
cd ~/koast/design/brand-final
bash regenerate-with-pjs.sh
```

The script attempts three known mirrors for Plus Jakarta Sans ExtraBold (jsDelivr/fontsource, Google Fonts GitHub mirror, fontsource alternate), installs to `/usr/share/fonts/truetype/plus-jakarta-sans/`, refreshes the font cache, and re-runs `rasterize.py`. After it completes, the wordmark in OG and square social PNGs will be the correct Plus Jakarta Sans 800.

### Manual install (if the bootstrap fails)

If all download sources are blocked or the script fails:
1. Download Plus Jakarta Sans from https://fonts.google.com/specimen/Plus+Jakarta+Sans
2. Place the ExtraBold TTF at `/usr/share/fonts/truetype/plus-jakarta-sans/PlusJakartaSans-ExtraBold.ttf`
3. Run `sudo fc-cache -fv`
4. Run `python3 rasterize.py` from this directory

The rasterizer's first line of output should read `font in use: .../plus-jakarta-sans/PlusJakartaSans-ExtraBold.ttf`. If it falls back to Poppins, the font isn't being found.

## Transferring this package

### Cesar's local → VPS (sending this zip up)

```powershell
scp -i "C:\Users\cesar\Downloads\LightsailDefaultKey-us-east-1.pem" `
  C:\path\to\koast-brand-final.zip `
  ubuntu@44.195.218.19:~/
```

Then on the VPS:
```bash
cd ~
unzip koast-brand-final.zip -d koast/design/
# Result: ~/koast/design/brand-final/
cd ~/koast/design/brand-final
bash regenerate-with-pjs.sh
```

### VPS → Cesar's local (pulling the regenerated package back)

```powershell
scp -r -i "C:\Users\cesar\Downloads\LightsailDefaultKey-us-east-1.pem" `
  ubuntu@44.195.218.19:~/koast/design/brand-final `
  C:\Users\cesar\Desktop\koast-brand-final
```

Both commands target the **Virginia VPS (us-east-1)** at `44.195.218.19`. Use the corresponding `LightsailDefaultKey-us-east-1.pem` key, *not* the eu-west-1 (Ireland) key.

## File counts

| Folder | Files | Total |
| --- | --- | --- |
| masters/ | 12 SVG + 4 PNG previews + README | 17 |
| favicons/ | 7 PNG + 1 ICO + README | 9 |
| social/ | 4 PNG + README | 5 |
| app-icons/ | 4 PNG + README | 5 |
| fallback/ | 5 SVG + README | 6 |
| guidelines/ | 1 HTML | 1 |
| motion-exploration/ | 2 HTML + 8 GIF + README | 11 |
| root | rasterize.py + make-motion-gifs.py + regenerate-with-pjs.sh + README + HANDOFF | 5 |
| **TOTAL** | | **59 files** |

## Reference files

- The three final tests that locked the directional logo: `~/koast/design/logo-concepts-l4-final-tests/`
- Iter1 explorations: `~/koast/design/logo-concepts-l4-strata-iter1/`
- Original L1–L4 directional studies: `~/koast/design/logo-concepts-l1/` through `-l4/`
- Motion philosophy archive (A/B/C exploration): `motion-exploration/motion-philosophies.html`

---
*v1.0 · 2026.04.30 · brand-final*
