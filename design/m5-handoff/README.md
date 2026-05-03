# Koast Design System · v1.0

> **Koast** — the AI co-host for short-term rentals.
> A consumer brand wrapping the underlying StayCommand product. Hosts converse with Koast like they would with a human co-host; Koast accumulates context, memory, and learning about each property over time.
>
> The visual metaphor is **geological strata** — layers of accumulated knowledge.

This system is the source of truth for how Koast looks, sounds, and moves. When in doubt, the canonical specs at `brand/brand-one-pager.html` and `brand/motion-vocabulary.html` win over anything written here.

---

## Index

| Path | What it is |
|---|---|
| `colors_and_type.css` | All design tokens — palette, semantic colors, type roles, spacing, radii, motion easings |
| `koast-mark.css` | Animation CSS for the brand mark (idle / active / milestone / hero registers) |
| `KoastMark.jsx` | React component — `<KoastMark>` and `<KoastWordmark>`, auto-picks 5-band/3-band/wordmark-only by size |
| `SKILL.md` | Skill manifest for use as a portable design skill |
| `brand/brand-one-pager.html` | **Canonical brand spec** — every visual rule, live examples, do/don't |
| `brand/motion-vocabulary.html` | **Canonical motion spec** — registers, triggers, CSS reference, state transitions |
| `brand/HANDOFF.md` | Original integration brief (verbatim) for the StayCommand product team |
| `brand/source-README.md` | Original asset-package README (verbatim, includes Plus Jakarta Sans regenerate notes) |
| `assets/logos/` | All SVG masters + 1024px PNG previews — 5/3-band, cascade, pulse, milestone, wordmark, fallback variants |
| `assets/favicons/` | 16/24/32/48/180/192/512 PNGs + .ico |
| `assets/social/` | OG 1200×630 + square 1080×1080, light + dark |
| `assets/app-icons/` | iOS 1024, Android adaptive (foreground+background), Windows tile 310 |
| `assets/motion/` | Animated GIF previews of every motion register, light + dark |
| `preview/` | Design-system cards (registered for the Design System tab) |
| `ui_kits/marketing/` | Marketing site UI kit (`koasthq.com`-style hero, features, footer) |
| `ui_kits/app/` | In-app UI kit (chat with Koast, dashboard, milestones) |

**Sources given:** `uploads/koast-brand-final-v1.0.zip` — extracted into `brand/` and `assets/` above. No codebase, no Figma file, no slide deck were provided. The two HTML files in `brand/` are the canonical brand specifications and were authored by the brand team.

---

## Content fundamentals

**Voice:** honest, direct, scoped-honesty. The agent doesn't make up specifics. Closer to **Cursor or Linear** than **Slack or Intercom**. Not warm-AI-assistant, not chirpy-app, not generic-SaaS-chat.

**Casing:** sentence case across the board. The wordmark is **always "Koast"** (lowercase except leading K) — never "KOAST", never "koast". Headings often start lowercase mid-sentence to soften ("A layered motion vocabulary."). Section eyebrows are uppercase JetBrains Mono.

**Pronouns:** "you" addresses the host. "Koast" refers to the agent — third-person mostly, never "I'm Koast" warmth. Status statements describe what's happening, e.g. "Koast is drafting a reply" or "synced 4 listings, 2 days ago". Avoid "I'll help you with…" or "Sure!".

**Specificity over warmth.** Real numbers beat reassurance. "$184/night for next weekend, +$12 vs last weekend" beats "Great pricing for you!". When data is missing, say so plainly: "no booking history yet" rather than inventing a placeholder.

**Punctuation:** periods on full sentences. Em-dashes welcomed. Don't end every CTA with an exclamation. JetBrains Mono carries hex values, file paths, technical metadata, eyebrow labels — never body copy.

**Emoji:** none. Unicode arrows (`→ ↗ ↘`) are fine sparingly in CTAs and table cells. Bullet glyphs (`·`) used in metadata strings.

**Examples (lifted from the brand docs):**
- *"the AI co-host for short-term rentals."* (tagline)
- *"A living rule-set for how the Koast mark, wordmark, color, and motion are deployed."*
- *"Static is the default. Animate intentionally, not constantly."*
- *"Reads as memory just deposited."*
- *"Don't fire the milestone deposit on routine events. Tier 1 fires once per host, ever."*

**Anti-references for copy:**
- "Hi there! 👋 I'm Koast, your AI assistant! How can I help today?" — wrong tone, wrong person, wrong emoji.
- "🚀 Crushing it! Your bookings are up 24%!" — chirpy slop.
- Anything starting with "Let me help you…" or ending with "Got it ✨".

---

## Visual foundations

### Palette
Cool teal, anchored. **Tide `#4cc4cc`** is the primary brand teal — accents, hover, focus, primary CTAs. The 5-band ramp `Shore Mist → Shoal → Tide → Reef → Trench` is the brand's tonal signature; **never introduce teals outside it**. On dark substrate, bands 4-5 lighten (`#3aa3aa`, `#2e8c95`) so the bottom doesn't disappear.

Substrates: **Shore `#f7f3ec`** for light, **Deep Sea `#132e20`** for dark. Body bg sits a touch above shore at `#fafaf7` so chrome separates cleanly. Text is **Ink `#0f1815`** on light, Shore on dark.

### Type
**Plus Jakarta Sans** for everything (400 body, 500 headings, 800 wordmark/display). **JetBrains Mono** for code, hex tokens, eyebrows, technical metadata. Tracking is meaningfully tight on display (`-0.025em` to `-0.022em`); body sits at default. **Never substitute** Inter, Roboto, or system-ui for headings.

Both families are self-hosted as variable fonts in `/fonts` (`PlusJakartaSans-VariableFont_wght.ttf` + italic, `JetBrainsMono-VariableFont_wght.ttf` + italic). No external font CDN — the system works fully offline.

### Backgrounds & imagery
Solid substrates. **No photographic backgrounds, no patterns, no gradients, no textures.** Tinted teal surfaces (Shore Mist) are used very sparingly for hover states, success states, and subtle callouts. The mark is never placed on photographic / patterned backgrounds — always solid.

### Cards & rules
Hairline rules carry the structure — `0.5px solid var(--rule)` (which is `#e7e2d6` on light). Cards are flat: white surface, 12-14px radius, hairline border, **no drop shadow** by default. When elevation is needed (popovers, menus), use a soft, low-contrast shadow only — never a thick or dark drop.

### Corner radii
Restrained. **6px** small, **10px** default (buttons, inputs), **12-14px** for cards and tiles. Pills (`999px`) used only for tags/badges. Nothing should look "round" — these are quiet rectangles with softened corners.

### Spacing
4-px base. Section gutters around 56px. Card interior padding 20-26px. The brand docs use a 1080-px max-width body with 32-px gutters — match that for content-dense surfaces.

### Animation & motion
**Three registers, locked.** See `brand/motion-vocabulary.html` for the canonical reference.
- **Idle** — static. The default. App chrome, favicons, signatures, anywhere the mark just exists.
- **Active (cascade)** — top-down opacity wave on the bands, 1.0 → 0.55 → 1.0, 3s cycle, 130ms stagger, `cubic-bezier(0.45, 0, 0.55, 1)`. Triggered while AI is processing / sync running. Reads as *consulting layers*.
- **Active small (16-31px)** — brightness pulse fallback, `filter: brightness(1) → brightness(1.12) saturate(1.1)`, 1.6s ease-in-out. Cascade is invisible at small sizes.
- **Milestone (deposit)** — one-shot, 2s, ghost band drops in from above and the stack shifts 18px. Reserved for **rare** completion events (Tier 1 fires once per host, ever). Reads as *memory just deposited*.
- **Hero variant** — continuous cascade, 2.4s, no rest. **Public marketing landing hero only.** Never propagated.
- **<16px: no motion, ever.** Favicons stay static at every size as a category rule.

UI transitions outside the mark stay quiet: 120-200ms, ease-in-out, opacity / transform only. No bounces, no springy easing.

### Hover & press states
- **Hover (text/icon button):** opacity drops to ~0.7, or color shifts to `--accent` (Tide).
- **Hover (filled button):** background darkens one teal step (Tide → Reef, or Trench stays Trench but lifts opacity).
- **Hover (card):** hairline border thickens slightly (`--rule` → `--rule-strong`); no drop shadow appears.
- **Press:** `transform: scale(0.98)` 80ms, ease-out. No color change beyond the hover state.
- **Focus:** `box-shadow: 0 0 0 3px rgba(76, 196, 204, 0.45)` — Tide ring, not the OS default.

### Borders, shadows, transparency, blur
- **Borders carry the structure.** Hairline `0.5px` on retina, `1px` otherwise.
- **Shadows are used very sparingly.** Default to flat. When used (popovers, menus), keep them soft and low-contrast.
- **Transparency** is for tinted surfaces (`rgba(76, 196, 204, 0.06)` for callouts, `0.18` for badges) and the focus ring. Never used to weaken the mark.
- **Backdrop blur** is not part of the system — avoid it.

### Imagery vibe
There is no first-party photography in the asset package. When third-party photos must appear, prefer cool/neutral tones, soft natural light, lived-in interiors (the audience is short-term-rental hosts). Avoid stock-photo over-saturation, lifestyle clichés, and AI-generated illustrations.

### Layout rules
- Max content width 1080px for prose-heavy surfaces; 1280px for app surfaces.
- Hairline-divided sections, generous vertical rhythm (`56px` gutters in the brand docs).
- Eyebrow → h2 → lede → body — the consistent header rhythm in the canonical docs.
- Fixed elements (top nav) sit on Shore at hairline borders; never on a tinted bar, never with a drop shadow.

---

## Iconography

**No proprietary icon set was shipped with the brand package.** The brand mark itself is the only locked iconographic element. For UI iconography we recommend **Lucide** (`https://unpkg.com/lucide@latest`) — same restrained, geometric, even-stroke aesthetic as the rest of the system, and what the Cursor/Linear-adjacent reference points use.

**FLAGGED SUBSTITUTION:** Lucide is a substitution choice, not a brand-owned set. If the StayCommand codebase already standardises on a different icon family (Heroicons, Tabler, Feather, etc.), swap to that — but keep the stroke weight at 1.5-2px and the sizing at multiples of 4 (16, 20, 24, 32). Documented uses across this system:
- Lucide via CDN: `<link rel="stylesheet" href="https://unpkg.com/lucide-static@latest/font/lucide.css">` — or render inline SVG via React.
- Stroke 1.75px, color inherits from `currentColor`, default size 18px in nav, 20-24px in feature lists.

**No icon font, no emoji, no unicode-as-icons.** Unicode arrows `→ ↗ ↘` are allowed sparingly in CTAs and table cells — that's it.

The brand mark itself comes in many production-rendered forms in `assets/logos/` — use those SVGs, never hand-redraw them. PNG previews at 1024px exist for raster-only contexts.

---

## Asking the user to iterate

Once you've reviewed the system, the things most likely to need polish are listed in the closing summary on the chat. Open `brand/brand-one-pager.html` first — it carries every locked rule with live examples and is the highest-fidelity reference in the system.
