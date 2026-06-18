# Koast v1 — Design Pass BUILD PLAN

*2026-06-18. For Cesar review BEFORE build. Companion to `docs/koast-v1-design-pass-punchlist.md`. No code changed yet.*

## Decisions locked (the contract)

- **Q1 — Teal system, gold = money ONLY.** Teal is the system accent **including primary CTAs**. Gold is reserved **exclusively for monetary/value moments** (revenue a proposal captures, "+$X on the table") — never CTAs, never emphasis. **The rule: if it's not money, it's teal.** Gold becomes a learnable signal (gold = Koast found money). Every non-money gold element → teal. The doc gets rewritten; gold-label-as-signature is dead, teal label is the system.
- **Q2 — Hybrid register.** Mono **only** for machine truth (timestamps, latencies, IDs, audit trail). Warm sans for **everything human-facing** (rationale, "Koast suggests", labels, copy). The register itself is the trust signal: precise where it matters, plain-spoken everywhere else.
- **Q3 — One reconciled token layer** (color / type / radius / motion) shared by all surfaces. Layout may still differ spine-vs-inspect. No intentional dialects — kill the three accidental ones.
- **Scope — COHERENCE everywhere + SIGNATURE on the proposal/confidence system only.** Reconcile to one system and drag the prototype laggards (onboarding, /pricing) up to it — that removes the "assembled from parts" trust cap, which is most of the gain. Spend signature-level effort on exactly one thing: the **"Koast suggests" proposal card + the confidence/honesty system.**

## Grounding fact that shapes the plan

The June recolor already remapped the legacy tokens to teal **by role** (`globals.css:48-139`): `--coastal #0e7a8a` (deep "trench" teal, white-text-safe), `--mangrove #176d7a`, `--tideline #6e7976` (neutral gray), `--deep-sea #0a262c` (cool near-black), `--brass → --koast-trench`, `--driftwood/--sandbar → teal`. So `bg-coastal`/`text-tideline`/etc. **already render teal** — ~300 usages recolored with no class renames. **The incoherence is at the USAGE layer, not the token values:** literal hardcoded hexes (`#a87d3a`, `bg-red-500`), `--golden`/`--amber-tide` used for non-money emphasis, and a sprawl of overlapping teal aliases (`--lume`, `--koast-trench`, `--koast-tide`, `--accent`, `--coastal`). That makes Phase 1 lighter than a recolor and mostly about **consolidation + the gold=money sweep + register + doc.**

---

## The reconciled system (target spec — Phase 1 produces this; everything builds toward it)

### Teal accent ramp (3 roles, from existing values — no new hues)
| Role | Token (canonical) | Value | Use |
|---|---|---|---|
| **Commit / primary CTA** | `--accent-deep` = `--coastal`/`--koast-trench` | `#0e7a8a` | Approve, primary buttons, send, "commit" actions. White text safe. This replaces the bright-cyan Approve. |
| **Interactive / active** | `--accent` = `--koast-tide` | mid teal | links, active nav, focus rings, hover accents, selected states |
| **AI / thinking / proposing accent** | `--lume` | `#4cc4cc` | streaming caret, in-flight tool pulse, the "Koast is acting" accent — used sparingly as a highlight, NOT as a button fill |
| AI tint (bg wash) | `--accent-tint` / `--lume-light` | `#d4eef0` | quiet AI-surface tints (memory artifact, proposal frame wash) |

**[Q-A — your eye, shown early]** How deep is "primary teal"? My proposal: commit/CTA = `--coastal #0e7a8a` (deep, sober, trustworthy); `--lume #4cc4cc` demoted to accent-only. You'll see this on the deployed spine + proposal card in Phase 1/2 and can dial it.

### Gold = money (the learnable signal)
- Gold (`--golden #c49a5a`, `--driftwood`, `--amber-tide #d4960b`) appears **only** on monetary/value content: the revenue a proposal captures, "+$X opportunity", the money figure on the pricing scorecard, realized-value moments.
- Every other current gold/amber usage → teal: section labels (already teal), the Messages K-button bronze `#a87d3a`, Property metric accents, any `bg-yellow-*`, amber "urgency" that isn't money → teal or coral as appropriate.
- Mechanical sweep: grep `--golden|golden|--amber-tide|amber-tide|#c49a5a|#a87d3a|#d4960b|yellow-` → classify money vs not → non-money to teal.

### Type + register (Q2)
- One type scale (merge the DS table + the spine's). Plus Jakarta Sans for all human-facing text.
- **Mono (`--font-mono`) only for machine truth:** timestamps, durations/latencies, IDs, audit-trail values. Everything else (turn-meta "who", "Koast suggests", section labels, rationale, day dividers as words, composer hint copy) → sans. This is a spine-wide sweep of `font-mono` usages, keeping it on the genuinely-machine ones.

### Radius / motion / shadow (one ramp)
- **Radius:** reconcile to one ramp (proposal: 7 small / 10 controls / 12 cards / 14 large / full). Spine already uses 7/10/12/14 — inspect's `rounded-lg`(8) onboarding usages move onto it.
- **Motion:** one vocabulary — entrance `ease-out` 0.4–0.6s with stagger; hover/interaction `cubic-bezier(0.4,0,0.2,1)`; never bare `ease`/`linear`. Spine's `--ease-default`/`--dur-base` become the canonical interaction curve. Sweep bare-`ease` offenders.
- **Shadow:** hairline-first (the spine's restraint) is the default; CSS-var shadow stacks (`--shadow-card` etc.) for genuinely-elevated inspect cards only. Ban Tailwind shadow utilities (sweep `shadow-sm`/`shadow-md`).

### Doc rewrite
`DESIGN_SYSTEM.md` rewritten to the above: teal system + gold=money rule + mono=machine rule + the one token ramp. The stale golden/glass framing is removed. This is the single source future work (and future-you) reads.

---

## PHASES

### Phase 1 — Token reconciliation + register + doc  *(foundation; you see the reconciled spine here)*
**Goal:** one documented token layer; gold=money enforced; spine register hybrid (Q2); doc rewritten.
**Work:**
1. Consolidate the teal ramp in `globals.css` (canonical `--accent`/`--accent-deep`/`--lume` roles; collapse redundant aliases) — mostly a no-visual-change refactor since values already render teal.
2. Point the spine `.shell` semantic layer (`ChatShell.module.css:20-93`) at the canonical ramp explicitly (it already references `--koast-tide`/`--koast-trench` — confirm + document).
3. **Gold=money sweep** (the one visible change): non-money gold/amber → teal across all surfaces.
4. **Q2 register sweep in the spine:** `font-mono` → sans on human-facing labels; keep mono on machine truth.
5. Rewrite `DESIGN_SYSTEM.md`.
**Key files:** `globals.css`, `tailwind.config.ts`, `ChatShell.module.css`, `DESIGN_SYSTEM.md`, + the gold-usage hotspots (`UnifiedInbox.tsx`, `PropertiesPage.tsx`, any amber).
**Tier/risk:** TIER 1 (architecture-class token layer; visual ripple bounded). **Your review:** the reconciled token doc + the deployed spine (register + teal) **before Phase 4's broad sweep**.
**Gate:** tsc + eslint + jest; grep-verify no non-money gold remains.
**Direction calls:** **[Q-A]** primary-teal depth (above).

### Phase 2 — The proposal + confidence SIGNATURE  *(the centerpiece; you see the card here)*
**Goal:** make "Koast suggests" the most trustworthy-feeling thing in the app.
**Work:**
1. **One proposal rendering.** Unify the two ("inline `ProposalCard`" card + the `.proposal` CSS-module left-stripe block) into one canonical card. Pick the card (carries trust weight); redirect the stripe usages to it.
2. **One button vocabulary.** Kill ProposalCard's inline cyan vocabulary; Approve = deep-teal commit (`--accent-deep`), Dismiss/Edit = the secondary/ghost from the shared system. Same buttons the rest of the app uses.
3. **Richer trust frame (proposal card layout)** — **[Q-B, shown early]**. My proposal: a quiet card with (a) "Koast suggests" sans label, (b) the **property anchor** (which property/channel), (c) a **"what changes" line** — before→after (e.g. "BDC $218 → $210") so the host sees exactly what they're approving, (d) the **confidence cue**, (e) rationale in the agent's voice, (f) one-vocab Approve / Edit / Dismiss. You'll see a built version and direct it.
4. **The confidence/honesty SYSTEM** (detail below) — a shared envelope + cue rendered consistently across proposals, guest-reply drafts, and rate recs.
**Key files:** `ProposalCard.tsx`, `TodaySuggests.tsx`, `ChatShell.module.css` (`.proposal`), `ActionProposal.tsx`/`GuestMessageProposal.tsx`, the chat `blocks/*`, `src/lib/pricing/confidence.ts` (→ generalized), `PendingDraftBubble`, a new shared `ConfidenceCue` + envelope module.
**Tier/risk:** TIER 1 (trust-decisive). **Your review:** the built proposal card + confidence cue, early — before I extend the cue across every surface.
**Direction calls:** **[Q-B]** card content richness; **[Q-C]** confidence coverage + the "unfamiliar guest" signal (below).

### Phase 3 — Prototype laggards up to the system  *(remove the "unfinished" tells a stranger hits first)*
**Goal:** onboarding, add-property, and `/pricing` read as the same product as everything else.
**Work:**
1. **Form controls → DS.** Styled select / number / checkbox / radio / input primitives (golden-ring → **teal**-ring per Q1; `rounded-[10px]`; 1.5px). Adopt across `onboarding/page.tsx` + `properties/new/page.tsx`. Kill raw native controls.
2. **Onboarding + add-property onto the system:** section labels (teal), confident headings, entrance motion, fix the stock `red-*`/`indigo-50` colors → coral/teal, one button system.
3. **`/pricing` rebuild** — **[Q-D]**. Replace the DS-forbidden signal-cards-with-progress-bars `PricingDashboard` with the scorecard→recommendations→rules→performance structure. My recommendation: **adopt + extend the already-built polished `polish/calendar/PricingTab.tsx`** rather than a fresh build (faster, already on-system). Kill the 🏠 emoji, the monospace numerals, add count-up on the money figure + entrance motion.
**Key files:** `onboarding/page.tsx`, `properties/new/page.tsx`, `FormControls.tsx` (extend), `PricingDashboard.tsx` (→ replaced), `polish/calendar/PricingTab.tsx` (adopt), `pricing/page.tsx`.
**Tier/risk:** TIER 2 for form-control swaps (merge-on-green); TIER 1 for the `/pricing` rebuild. **Your review:** the `/pricing` approach (Q-D) + result.

### Phase 4 — Coherence sweep  *(close every remaining seam)*
**Goal:** no banned colors, no dead controls, one label + motion language.
**Work (mostly mechanical, merge-on-green):**
1. Kill banned literal colors: Properties import modal `bg-red-500/blue-600/purple-600` + `bg-red-50…yellow-50` + colored-letter logos → `PLATFORMS` config + tokens; `text-red-500` → coral.
2. Kill the `🏠` emoji (if not already in Phase 3) and any other emoji.
3. Remove "Coming soon" dead controls (DS doctrine: hide unfinished, don't grey) — **[Q-E]** confirm hide-all vs finish any.
4. Unify section labels (one teal treatment) across all surfaces; add where missing (Calendar/Pricing).
5. Motion curve sweep (bare `ease` → cubic-bezier); add entrance choreography where static; add DS skeletons on data surfaces; add `max-w-[1760px]` caps on Pricing/Properties.
6. Toast → DS recipe (white card + colored icon chip).
**Key files:** `PropertiesPage.tsx`, `UnifiedInbox.tsx`, `calendar/*`, `Toast.tsx`, layout, misc.
**Tier/risk:** TIER 2, merge-on-green in small batched commits.

---

## The confidence / honesty SYSTEM (Phase 2 detail — the signature)

**Today:** `isLowConfidenceRec(reasonSignals)` + `LOW_CONFIDENCE_LABEL="Early estimate"` (`src/lib/pricing/confidence.ts`) — rate recs only. A separate draft-confidence badge exists in `PendingDraftBubble` (Phase D S8). Two disconnected signals.

**Target:** one shared envelope + one cue, consistent across proposals / drafts / recs.
```
ConfidenceEnvelope = {
  tier: "confident" | "early",
  reason?: "thin_comps" | "new_guest" | "limited_history",
  label: string,   // "Early estimate", "First message to this guest", …
  note?: string,   // one calibrated line
}
```
- **Rate proposals/recs:** map existing `isLowConfidenceRec` (comp_set_quality insufficient/fallback → `thin_comps`).
- **Guest-reply drafts:** unify the existing draft confidence badge → the same cue. `new_guest` = first interaction / no prior thread for this guest.
- **Cue visual:** `confident` = quiet (subtle or silent — certainty needs no chrome); `early` = the "Early estimate"-register chip + the one-line note. One `ConfidenceCue` component, rendered on the proposal card, the draft bubble, and rate-rec blocks.

**[Q-C — your eye]:** Coverage for v1 of the system. `thin_comps` (rates) and the draft signal already exist — unifying them is in-scope and low-risk. **"unfamiliar guest" / `new_guest`** likely needs a small new signal (does Koast have prior thread history with this guest?) — derivable from message history but not currently surfaced as a confidence input. **Decision:** include `new_guest` in v1 (I build the small signal) or ship the system with the two existing signals and add `new_guest` next? My lean: include it — "first message to this guest, drafted from your voice" is a strong honesty moment and the signal is cheap.

---

## Direction-call checkpoints (where I pause for your eye mid-build)

| Tag | Decision | When |
|---|---|---|
| **Q-A** | Primary-teal depth (deep `--coastal` commit vs brighter) | Phase 1, on the deployed spine |
| **Q-B** | Proposal card content richness (property anchor + before→after diff + confidence) | Phase 2, on the built card |
| **Q-C** | Confidence coverage — include `new_guest` signal in v1? | Phase 2 start |
| **Q-D** | `/pricing` — adopt the polished PricingTab vs fresh build | Phase 3 start |
| **Q-E** | "Coming soon" controls — hide-all vs finish any | Phase 4 |

I'll deploy and ping you at **Q-A (reconciled spine)** and **Q-B (proposal card)** early and explicitly, since those are the trust-decisive surfaces you want to see first. Visual review is yours (claimant-run from your machine against app.koasthq.com) — I verify tsc/eslint/jest + diffs, you eyeball the render.

## Out of scope (explicit)
- Pushing every inspect tab to best-in-class (Calendar/Messages/Properties get coherence, not signature).
- New product features; substrate beyond the small `new_guest` confidence signal (and only if Q-C says yes).
- The known-gaps backlog (pulse time-series, image source res, etc.) — unrelated to design coherence.

## Discipline
- **Code written directly** (no sub-agents, per CLAUDE.md). The audit used read-only agents; the build does not.
- Gate every commit: `npx tsc --noEmit` + `npx eslint <paths>` + `npx jest`; never `npm run build` on the VPS; push to main; Vercel deploys.
- Phases 1, 2, and the `/pricing` rebuild get your review; the mechanical sweeps (Phase 4, form-control swaps) ship merge-on-green in small batched commits.
- No new dependencies.
