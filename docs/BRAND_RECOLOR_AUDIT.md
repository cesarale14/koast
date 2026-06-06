# Brand Recolor Audit + Swap Plan — Forest-green → Cool-teal

**Status:** audit only, no code changes. Awaiting mapping sign-off before execution.
**Date:** 2026-06-06
**Scope:** app-wide design-token recolor (cockpit, app shell, cleaner portal, auth, public pages). NOT the spike branch.

---

## 1. How color is wired today

Color is **token-driven, two layers**, with a small hardcoded-hex tail.

**Layer A — CSS variables** in `src/app/globals.css :root` (lines 34–187). The forest-green brand lives as named tokens:

```
--deep-sea  #132e20   --coastal #17392a   --mangrove #1f4d38   --tideline #3d6b52
--golden    #c49a5a   --driftwood #d4b47a --sandbar  #e8d5b0
--shore #f7f3ec  --dry-sand #ede7db  --shell #e2dace  --hairline #e5e2dc
--coral-reef #c44040  --amber-tide #d4960b  --lagoon #1a7a5a  --deep-water #2a5a8a
--positive #1a3a2a  --abyss #0e2218
```
Plus a large **legacy-alias block** (lines 83–151): `--forest`, `--brass`, `--linen`, `--ink`, `--neutral-*`, `--sidebar-*`, `--success/--warning/--danger/--info` all *point at* the tokens above.

**Layer B — Tailwind theme** (`tailwind.config.ts` lines 15–99) maps named utilities → those CSS vars: `bg-coastal` → `var(--coastal)`, `text-tideline` → `var(--tideline)`, etc. Every brand utility resolves through a variable. **Nothing in the Tailwind config is a raw hex** — it's all `var(--…)`.

**Consequence:** for everything that goes through tokens, the recolor is a **clean one-shot swap** — change the hex values behind `--deep-sea/--coastal/--mangrove/--tideline` (and decide golden's fate) in `globals.css` and it cascades to ~300 utility usages and every component automatically. We do **not** rename utilities (`bg-coastal` keeps its name; only its value changes), so no component edits for the token path.

### The new palette already half-exists in the repo

`globals.css` has a **second `:root` block** (lines 196–214) holding the finalized brand ramp as `--koast-*` tokens (`--koast-tide #4cc4cc`, `--koast-trench #0e7a8a`, `--koast-shore-mist #d4eef0`, …). Today **only the chat shell** (`ChatShell.module.css`) consumes them via a scoped semantic layer (`--accent: var(--koast-tide)`). So the chat surface is **already on the new teal palette**; the rest of the app is on forest-green. This recolor is really "bring the cockpit/shell/portal onto the ramp the chat shell already uses."

### Hardcoded-hex tail (the part that is NOT a clean swap)

Green hex literals appear in **9 files** (~30 literals) that bypass tokens. These need hand-editing or token-ization first:

| File | What's hardcoded | Why it bypasses tokens |
|---|---|---|
| `src/components/dashboard/RevenueChart.tsx` | `#1a7a5a` lagoon line, `#3d6b52` tideline, `#ede7db` grid | Canvas 2D context — `ctx.strokeStyle` can't read CSS vars |
| `src/components/dashboard/AnalyticsDashboard.tsx` | green hex (canvas/inline) | same canvas pattern |
| `src/components/polish/PricingTab.tsx`, `polish/calendar/PricingTab.tsx` | green hex inline | data-viz inline styles |
| `src/components/ui/Logo.tsx` | `#4cc4cc` (already teal) + `text-[#3d6b52]` "Stay" wordmark | arbitrary Tailwind value + inline SVG |
| `src/components/polish/assets/greeting/greeting.svg` | `#132e20`, `#3d6b52` | static SVG asset |
| `src/lib/platforms.ts` | platform brand hex (`#FF385C` etc.) | **intentional — do NOT touch**, these are OTA brand colors |
| `src/app/globals.css` | shadow tints `rgba(19,46,32,…)` ×40, `rgba(26,58,42,…)` ×15 | coastal-tinted shadow stacks |

The `rgba(19,46,32…)` / `rgba(26,58,42…)` shadow tints (55 occurrences, mostly in `globals.css`, some inline in components) are the forest-green shadow color baked into the elevation system. A blind hue swap leaves shadows tinted green under a teal UI — needs a deliberate decision (re-tint to ink/teal, or neutralize).

**Verdict:** ~85% clean token swap; ~15% is a contained hardcoded hunt (9 files, canvas charts + 1 SVG + shadow tints). Recommend tokenizing the canvas/SVG greens as part of the swap so this never recurs.

---

## 2. Target palette (confirmed from brand package)

Source of truth: `design/m5-handoff/colors_and_type.css` (= verbatim from `design/brand-final/guidelines/brand-one-pager.html`). The 5-band cool-teal ramp:

| Token | Hex | Role in ramp |
|---|---|---|
| `--koast-shore-mist` | `#d4eef0` | band 1 · blueish-white · newest deposit |
| `--koast-shoal` | `#a8e0e3` | band 2 |
| `--koast-tide` | `#4cc4cc` | band 3 · **BRAND PRIMARY** |
| `--koast-reef` | `#2ba2ad` | band 4 |
| `--koast-trench` | `#0e7a8a` | band 5 · deep-teal · oldest sediment |

Substrate + text + status (brand package, also already present):
```
--koast-shore #f7f3ec (light bg)   --koast-deep-sea #132e20 (dark bg)   --koast-ink #0f1815 (text)
--koast-ink-2 #4a5552  --koast-ink-3 #6e7976 (labels)  --koast-rule #e7e2d6 (hairline)  --koast-bg #fafaf7
--koast-good #2a7a4a   --koast-warn #b34141
dark-ramp lifts: --koast-shoal-dark #8ad9dc  --koast-reef-dark #3aa3aa  --koast-trench-dark #2e8c95
```

### Proposed semantic mapping (forest role → brand value)

| App role | Today (forest) | → Proposed (brand) | Note |
|---|---|---|---|
| Dark bg substrate (sidebar, login, hero) | `--deep-sea #132e20` | **keep `#132e20`** (`--koast-deep-sea`) | brand package keeps this exact dark substrate — sidebar stays dark, just loses green-tint accents |
| Primary surface dark / heading green | `--coastal #17392a` | `--koast-trench #0e7a8a` | the "primary brand" green → deep teal |
| Secondary dark / hover | `--mangrove #1f4d38` | `--koast-reef #2ba2ad` | |
| Muted text / icons / tertiary | `--tideline #3d6b52` | `--koast-ink-3 #6e7976` (text) OR `--koast-reef` (decorative) | **split by use** — green-as-text → neutral gray; green-as-fill → reef |
| Primary action / CTA / focus | `--golden #c49a5a` **+** green buttons | `--koast-tide #4cc4cc` (accent) / `--koast-trench` (filled btn) | see §4 golden decision |
| Tinted/hover surface | `--sandbar`/`--success-light` | `--koast-shore-mist #d4eef0` | blueish-white tint |
| Body bg | `--shore #f7f3ec` | **keep** (`--koast-shore`) | identical |
| Borders/dividers | `--dry-sand #ede7db` / `--hairline` | `--koast-rule #e7e2d6` | near-identical, warm→neutral |
| Primary text | `--ink` (=coastal green) | `--koast-ink #0f1815` | text goes near-black, **not** teal |
| Secondary text | `--ink-secondary #4a6355` | `--koast-ink-2 #4a5552` | de-greened gray |
| Success | `--lagoon #1a7a5a` | `--koast-good #2a7a4a` | stays green — see §4 clash note |
| Warning | `--amber-tide #d4960b` | keep, or `--koast-warn #b34141` | brand package collapses warn→red; decide |
| Error/destructive | `--coral-reef #c44040` | `--koast-warn #b34141` | |
| Info/links | `--deep-water #2a5a8a` | `--koast-trench` or keep blue | teal can double as link |

---

## 3. Surfaces the swap touches

Because almost everything routes through `globals.css` tokens, one edit cascades to all of these:

- **App shell / sidebar** — `src/app/(dashboard)/layout.tsx` (`SIDEBAR_BG` gradient `--deep-sea → --abyss`, active-item golden).
- **Cockpit** — Dashboard, Calendar, Messages, Properties, Pricing, Reviews, Turnovers, Market Intel, Comp Sets (all 9 sidebar pages + `/properties/[id]`). Heaviest token consumers: `coastal` (189 uses), `deep-sea` (55), `tideline` (45).
- **Polish primitives** — `src/components/polish/*` (KoastButton/Card/Chip/Rate/Rail/etc.) — all token-based, cascade free.
- **Cleaner portal** — `src/app/clean/[taskId]/[token]/page.tsx` — uses `bg-coastal`, `bg-deep-sea`, `bg-lagoon`, `text-coastal`. Public, token-based → cascades.
- **Auth** — `AuthShell.tsx` + login/signup — `--deep-sea`/`--abyss` gradient, golden CTA, two radial glows (`rgba(196,154,90…)` golden, `rgba(26,122,90…)` lagoon-green) hardcoded inline.
- **Chat shell** — **already on new palette**; no change (sanity-check it still matches after the global tokens move).
- **Public** — `/revenue-check`, marketing surfaces.

### Load-bearing greens a blind swap would break

1. **Golden is unaccounted for.** `--golden #c49a5a` is the documented "#1 brand signature" (section labels, CTAs, sidebar active state, logo glow) — and the brand package has **no gold at all**. The teal ramp + neutrals + status is the whole palette. Decision required: (a) retire gold → teal/neutral eyebrows per brand package, or (b) keep gold as a warm accent against teal (off-spec but softer migration). 11 `*-golden` utility uses + several inline `rgba(196,154,90…)`.
2. **Brand-primary teal collides with the "AI/lume accent."** Today teal (`--lume #4cc4cc`) means *"AI is thinking"* (dark AI cards, per DESIGN_PHILOSOPHY §3). After the swap, brand primary **is** that same teal — the AI-accent distinction collapses. Either re-scope AI moments to a different treatment (e.g. trench-deep or the dark substrate) or accept that teal is now ambient.
3. **Success-green vs brand.** Today brand=green and success=green (`--lagoon`) sit close — fine because both green. After swap, brand=teal and success stays green → **this actually improves** semantic separation. Keep success green (`--koast-good`); do not teal-ify it.
4. **Canvas charts** (`RevenueChart`, `AnalyticsDashboard`) read **literal hex**, not vars — they will stay green until hand-edited. Same for `greeting.svg` and the `Logo.tsx` "Stay" span.
5. **Shadow tints** — 55× `rgba(19,46,32…)`/`rgba(26,58,42…)` green-tinted shadows. Under teal chrome these read subtly wrong; decide whether to neutralize to ink (`rgba(15,24,21…)`, which is what the brand package's `--shadow-*` already use) or leave.
6. **Dark substrate stays `#132e20`.** The brand package deliberately keeps the deep-sea green-black as the dark bg. So sidebar/login backgrounds do **not** become teal — only their *accents* move. Worth confirming this is the intent (vs a fully teal-dark shell).

---

## 4. Recommended execution shape (when approved)

1. **Decide the 3 open questions first** (golden fate, AI-accent re-scope, warn→red collapse) — they change the mapping table.
2. **One-shot token swap** in `globals.css`: re-point `--deep-sea/--coastal/--mangrove/--tideline` (+ ink/neutral/sidebar/semantic aliases) to brand values. Single file, cascades to ~300 utilities. Optionally collapse the legacy `--koast-*` block + the forest tokens into one source of truth.
3. **Tokenize the 9 hardcoded files** — replace canvas/SVG/inline green hex with the new values (canvas can read `getComputedStyle().getPropertyValue('--…')` once, or use a JS constants mirror).
4. **Re-tint shadows** to ink per brand package.
5. **Visual QA pass** per surface (sidebar, each cockpit page, cleaner portal, auth, chat-shell parity) — entrance choreography + glass effects unaffected (structure, not hue).
6. Update `DESIGN_SYSTEM.md` + CLAUDE.md token section to make teal canonical and mark forest retired.

**No DB, no Channex, no API surface touched** — pure presentation-layer. Lowest-risk class of change; the only real risk is visual regression on the hardcoded tail, which is enumerated above.
