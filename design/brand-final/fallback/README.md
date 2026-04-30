# Koast — Fallback wordmarks

Wordmark-only SVG variants for contexts where the banded-O cannot be used: sub-16px sizing, single-color reproduction, monochrome print, embroidery, fax, etc.

## When to use these

The full Koast wordmark (with banded-o) requires color reproduction and a minimum size of 16px to maintain band legibility. When neither is possible, fall back to the plain-text wordmark.

| Variant | When to use |
| --- | --- |
| `koast-wordmark-only-light.svg` | Brand-color contexts on light backgrounds (Ink #0f1815) |
| `koast-wordmark-only-dark.svg` | Brand-color contexts on dark backgrounds (Shore #f7f3ec) |
| `koast-wordmark-mono-black.svg` | Single-color reproduction, light bg — newspaper, fax, embroidery, single-color print |
| `koast-wordmark-mono-white.svg` | Single-color reproduction, dark bg — etched signage, dark merchandise |
| `koast-wordmark-currentcolor.svg` | Embedded in icon systems where color comes from CSS — inherits `color` from parent |

## Sizing

These are pure-text wordmarks at any rendering size. The 540×200 viewBox preserves the canonical proportions (Plus Jakarta Sans 800, letter-spacing -0.045em). Scale with `width`/`height` attributes or CSS.

## Font dependency

All variants reference Plus Jakarta Sans 800 via `font-family`. If PJ Sans isn't loaded in the rendering context, they fall back to `system-ui` then `sans-serif` — readable but not on-brand. For guaranteed PJ Sans rendering, ensure the host page imports the font (Google Fonts CDN or self-hosted TTF).

For raster contexts where font rendering is unreliable (legacy print workflows, embroidery digitization), the recommended path is to convert these SVGs to outlines/paths in Illustrator or Inkscape before handoff.
