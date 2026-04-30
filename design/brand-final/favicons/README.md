# Koast — Favicons

Multi-size favicon set covering tab, bookmark, home-screen, and PWA contexts.

## Per the size rule

5-band variant survives at ≥48px; 3-band variant preserves the strata structure below that. All outputs follow this rule mechanically:

| File | Size | Variant | Background | Use |
| --- | --- | --- | --- | --- |
| `favicon-16.png` | 16×16 | 3-band | transparent | browser tab |
| `favicon-24.png` | 24×24 | 3-band | transparent | browser tab (HiDPI) |
| `favicon-32.png` | 32×32 | 3-band | transparent | browser tab (Retina) |
| `favicon-48.png` | 48×48 | 5-band (transition) | shore #f7f3ec | Windows shortcut |
| `apple-touch-icon-180.png` | 180×180 | 5-band | shore #f7f3ec | iOS home screen |
| `android-chrome-192.png` | 192×192 | 5-band | shore #f7f3ec | Android Chrome PWA |
| `android-chrome-512.png` | 512×512 | 5-band | shore #f7f3ec | Android PWA splash, large contexts |
| `favicon.ico` | 16/24/32/48 | per size | shore #f7f3ec | Windows multi-size, legacy |

## Why solid backgrounds at ≥48px

Apple-touch and android-chrome icons render against varied OS surfaces (dark mode launchers, light mode tabs, theme tints). Solid shore prevents the banded circle from sitting on an unpredictable color and protects edge legibility. At ≤32px the icon goes transparent so the browser tab can composite naturally.

## HTML reference

```html
<link rel="icon" type="image/png" sizes="16x16"  href="/favicon-16.png">
<link rel="icon" type="image/png" sizes="32x32"  href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="48x48"  href="/favicon-48.png">
<link rel="apple-touch-icon" sizes="180x180"     href="/apple-touch-icon-180.png">
<link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192.png">
<link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512.png">
<link rel="shortcut icon" href="/favicon.ico">
```

To regenerate, run `python3 ../rasterize.py` from the brand-final root.
