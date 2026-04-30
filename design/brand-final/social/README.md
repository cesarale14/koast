# Koast — Social cards

Pre-rendered social-share assets for Open Graph, Twitter cards, LinkedIn, and Instagram.

## Files

| File | Dimensions | Use |
| --- | --- | --- |
| `og-card-1200x630.png` | 1200×630 | Open Graph default · Twitter summary_large_image · LinkedIn · Slack unfurl (light) |
| `og-card-1200x630-dark.png` | 1200×630 | Same use-cases, dark variant for properties with dark UI preview |
| `square-1080x1080.png` | 1080×1080 | Instagram post · Mastodon · square avatars · LinkedIn carousel slides |
| `square-1080x1080-dark.png` | 1080×1080 | Same, dark variant |

## Composition

Each card is wordmark-forward. The OG cards include the tagline "the AI co-host for short-term rentals." and a `app.koasthq.com` footer. The square format leads with the banded mark large and the "Koast" wordmark below.

## Meta tags

```html
<meta property="og:image" content="https://app.koasthq.com/og-card-1200x630.png">
<meta property="og:image:width"  content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://app.koasthq.com/og-card-1200x630.png">
```

## Production note on font

These PNGs were rasterized in a build environment without Plus Jakarta Sans installed. The fallback typeface is Poppins Bold (visually adjacent geometric sans). For final-production OG cards with PJ Sans 800 baked in, install the font locally and re-run `python3 ../rasterize.py`. Vector wordmark masters (in `/masters/`) reference PJ Sans correctly.
