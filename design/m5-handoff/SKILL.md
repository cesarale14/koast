---
name: koast-design
description: Use this skill to generate well-branded interfaces and assets for Koast — the AI co-host for short-term rentals — either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc.), copy assets out of `assets/` and reference them from your HTML files. Reach for `colors_and_type.css` and `koast-mark.css` as the foundation; reach for `KoastMark.jsx` for the brand mark in any React/JSX context.

If working on production code, copy assets and read the rules in `README.md` (palette tokens, type roles, motion vocabulary, do/don't list) to become an expert in designing with this brand. The canonical specs live in `brand/brand-one-pager.html` and `brand/motion-vocabulary.html` — when those conflict with anything written elsewhere, the HTML wins.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions about the surface (in-app, marketing, social, slides), and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

**Locked rules (never violate):**
- Plus Jakarta Sans is the only sans typeface (400/500/800). JetBrains Mono is the only mono. Never substitute Inter, Roboto, or system-ui for headings.
- Tide `#4cc4cc` is the primary brand teal. The 5-band ramp (Shore Mist → Shoal → Tide → Reef → Trench) is locked — never invent new teals.
- Wordmark = Plus Jakarta Sans 800, letter-spacing -0.045em, always reads "Koast" (lowercase except leading K).
- Mark sizing: 5-band ≥48px, 3-band <48px, wordmark-only <16px.
- Motion: idle (static, default) / active (cascade, 3s, while AI processes) / milestone (deposit, one-shot, on completion). No motion below 16px. Hero variant is marketing landing ONLY.
- Never enclose the mark in a box/badge/container shape, never add stroke/glow/shadow, never recolor outside the ramp.
- Static-only surfaces: OG cards, app icons, favicons, print, email signatures.

**Tone:** honest, direct, scoped-honesty. Closer to Cursor or Linear than Slack or Intercom. No emoji unless the user opts in. Lowercase-leaning sentence case for headlines.
