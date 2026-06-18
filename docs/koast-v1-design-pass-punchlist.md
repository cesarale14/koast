# Koast v1 — Design Pass Punch List (SCOPE, not built)

*Audit date 2026-06-18. Read-only. No code changed. This is the artifact Cesar marks up; we prioritize and direct from it.*

**Frame:** polish here is **trust infrastructure, not decoration.** Koast is an agent we're asking hosts to let run their operation — the surface determines how much they'll delegate. Every item below is ranked by *trust impact*: "does this make a stranger believe Koast is a real operator, or a prototype?"

**How to mark this up:** strike / ✅ / ❌ / re-rank / add notes inline. Items tagged **[Q]** are direction calls I will NOT assume — they're your eye to make. Evidence is `file:line` so you can look before deciding.

---

## 0. The headline finding (read this first)

Koast does **not** have a design-*quality* problem so much as a design-**coherence** problem. Audited end to end, most surfaces are individually competent — and a few are genuinely polished (Calendar, Messages, the auth screens, the Today home, and the chat spine itself). But they were built in **at least three visual languages across different eras**, with a **half-finished gold→teal rebrand** sitting on top. A new host crossing them feels the seams, and "assembled from parts" is the exact feeling that caps trust.

**The three+ languages currently coexisting:**
- **(A) Golden / glass** — the original `DESIGN_SYSTEM.md` system (Plus Jakarta, golden 11px uppercase section labels as "the #1 brand signature", glass cards, CSS-var shadow stacks). Mostly lives in the *doc* now; partially in some inspect chrome.
- **(B) Warm "Quiet"** — the dashboard/Today direction (Fraunces display face, flat plain cards, calm whitespace, StatusDots). Today + dashboard.
- **(C) Teal "agent console"** — the chat spine (`ChatShell.module.css`): mono labels everywhere, a teal accent cluster (`--koast-trench`/`--accent-deep`/`--lume`/`--koast-tide`), 0.5px hairline borders, no shadows. The most internally-consistent of the three.
- **(D) A pre-polish "prototype generation"** — onboarding, add-property, and the `/pricing` page: flat `rounded-lg`, raw native form controls, `neutral-*` washes, stock `red-*`/`indigo-*` colors, zero motion. This is the layer that actively reads as unfinished.

**The half-finished rebrand:** a June 2026 recolor (`globals.css:107`, `:222`, `:81`) remapped the "golden section label" to **teal** (`--koast-trench #0e7a8a`) and named `--lume #4cc4cc` the AI-accent "brand primary." But it was never fully applied: the design doc still says gold; surfaces mix temperatures — teal section labels next to warm gold CTAs and amber, a Messages "draft with AI" button that's a teal→bronze gradient with a hardcoded `#a87d3a` sitting beside a green Send button. Not one of the four inspect surfaces actually shows a golden label anymore, yet the doc calls gold the signature.

**Implication for sequencing:** the highest-leverage move is *not* polishing one surface harder — it's **reconciling to one system** (and answering gold-vs-teal first), then dragging the prototype-generation laggards up to it. Painting walls before choosing the color is wasted motion. The three blocking decisions are in §1; the surface-by-surface work is in §2–§5.

---

## 1. BLOCKING DECISIONS — your call, before we build [Q]

These three gate everything downstream. I'm not assuming them.

### Q1 — Gold or teal? (the brand-color reconciliation) **[Q — highest leverage]**
The running app has largely moved to **teal** (the spine commits to it fully; section labels were recolored to `--koast-trench`; `--lume` is "brand primary"). But `DESIGN_SYSTEM.md` still calls **golden** "the #1 brand signature," and warm gold/amber survive on CTAs, the Messages K-button, and Property tiles. Right now it's *both*, inconsistently, which is the single most "unfinished" cross-surface tell.
- **Decision:** Is Koast's accent **teal** (commit, retire gold to a rare warm pop), **gold** (roll back the recolor), or a **defined gold+teal split** (e.g. teal = "Koast/AI is acting", gold = "money/CTA")? 
- Whatever you pick, the deliverable is *one* reconciled token doc, and `DESIGN_SYSTEM.md` gets updated to match reality (it's currently stale and misleading — the auditors kept flagging code-vs-doc drift).
- My lean (yours to override): **teal as the system accent, gold reserved strictly for money/value moments** ("+$430 on the table", primary CTA). Teal already carries the agent identity in the spine; gold as a scarce "this is revenue" signal is honest to the Prime Directive ("show me the money") without muddying the palette.

### Q2 — What register is the agent spine? Mono "console" vs warm "host product"? **[Q]**
The spine is deliberately a Claude/Linear-style **agent console**: `font-mono` on nearly every label (turn meta, day dividers, tool calls, memory facts, composer hint, "responding…"). It's internally consistent and reads as "serious tool." But the host is a **non-technical STR operator**, not a developer — mono-everything can read as cold/eng-facing. 
- **Decision:** keep the mono-console register (it signals precision/seriousness), warm it toward the host product (sans labels, softer), or a **hybrid** (mono only for genuinely machine facts — IDs, latencies, timestamps — sans for human-facing labels like "Koast suggests")?
- My lean: **hybrid.** Mono for machine truth (timestamps, tool latencies, IDs) is a nice "real system" signal; but "Koast suggests", "Needs you", section labels, and rationale should be warm sans. Keep the precision tell, lose the coldness.

### Q3 — One system, enforced — do we converge or keep per-surface dialects? **[Q]**
Today the spine uses `ChatShell.module.css` tokens; inspect tabs use `polish/` primitives + `DESIGN_SYSTEM.md` tokens; onboarding uses neither. 
- **Decision:** commit to a single reconciled token + primitive set that ALL surfaces draw from (so a button/label/empty-state looks the same everywhere), or accept "spine language" vs "inspect language" as an intentional two-mode split (chat vs tools)?
- My lean: **one reconciled token layer** (colors, type scale, radius, shadow, motion curves) shared by all; primitives can have a "spine" and "inspect" skin but must read as one family. The two-mode split is fine for *layout*, not for *color/type/button vocabulary*.

> Everything in §2–§5 is scoped *as if* Q1=teal-with-gold-for-money, Q2=hybrid, Q3=one-token-layer. If you choose differently, the specific "should-be" targets shift, but the *issues* (what reads as prototype) stand regardless.

---

## 2. TIER 1 — THE AGENT SPINE (highest trust priority)

This is where a host decides "real operator or toy" in 30 seconds. Good news: the spine is the **best-realized** of the new languages — restrained, intentional, coherent within itself. The work here is *elevation of the trust moments* + fixing self-inconsistency, not a rebuild.

| # | Surface / element | What reads as prototype / trust-leak | What it should be | Trust rank | Evidence |
|---|---|---|---|---|---|
| 1.1 | **Proposal card** ("Koast suggests") — *the* trust artifact | Uses its own inline-styled button vocabulary (cyan `--lume` Approve, white Dismiss) that diverges from the spine's own `.btn` system AND from the inspect `KoastButton` → three button languages. The card is also minimal for "approve a change to your live prices/guest messages": label + rationale + block + buttons, but no property-context anchor, no confidence signal surfaced on the card itself, no crisp "here's exactly what changes" diff emphasis. | The single highest-trust component deserves the most deliberate treatment: one button vocabulary; a clear "what will change" line (property · channel · before→after); the confidence/Early-estimate signal surfaced ON the card; and a register that says "I'm proposing, you decide." Approve color per Q1. | **Critical** | `ProposalCard.tsx:173-326` (inline styles, `--lume` Approve `:230,:276`); diverges from `ChatShell.module.css:596-626` `.btn` system |
| 1.2 | **Cyan `--lume` Approve button** | The Approve on a price/message change is bright saturated cyan (`#4cc4cc`). Reads "techy/playful," not "trustworthy operator." The most consequential button in the app (it executes a real OTA/guest write) is the least sober. | A confident, calm primary that says "commit." Tie to Q1. If teal: a deeper teal (`--accent-deep`/trench), not the bright lume. Lume can stay as the *streaming/AI-thinking* accent, not the commit button. | **High** | `ProposalCard.tsx:276` |
| 1.3 | **Two proposal renderings exist** | There's the inline `ProposalCard` (card w/ 4px trench left-border) AND a `.proposal` CSS-module block (2px accent left-stripe, "not a card"). Two different "system is proposing" looks depending on path. | One canonical proposal visual. Pick the card (it carries more trust weight) and retire/redirect the stripe block, or vice-versa — but one. | **High** | `ProposalCard.tsx:173` vs `ChatShell.module.css:564-593` (`.proposal`) |
| 1.4 | **Confidence / envelope cues — extend the "Early estimate" register** | The "Early estimate" chip (honest, calibrated, amber) is the *right* language — but it lives only on low-confidence rate blocks. The proposal card, guest-reply drafts, and agenda items don't consistently carry a confidence/why register. The trust win of "Koast tells you how sure it is" is under-deployed. | Make calibrated honesty a *system* — a consistent confidence/why affordance across proposals, drafts, and recs (high-confidence shows quiet certainty; low shows "Early estimate / limited data"). This is a differentiator; lean in. | **High** | `confidence.ts` (`LOW_CONFIDENCE_LABEL`); chip in `CalendarChangeBlock.tsx`; absent on `ProposalCard.tsx` |
| 1.5 | **"Koast suggests" group framing on Today** | `TodaySuggests` stacks proposal cards with a bare `marginTop:40` and no group header — they just appear below the agenda. The proactivity moment ("Koast noticed something") has no framing. | A quiet but present section frame ("Koast suggests" / "Koast noticed") so proactive proposals read as the agent surfacing value, not as floating cards. | **Medium** | `TodaySuggests.tsx:65-75` |
| 1.6 | **Cold-start empty state** (`/chat` landing) | KoastMark + one prompt line + a 2×2 starter grid. Clean but *thin* — no warmth, no "here's what I can take off your plate." First contact with the agent is a near-blank screen. (Note: on `/` the cold slot is the Today home, which is warmer — so this mainly bites on `/chat`.) | A confident first contact: a short value-line in the agent's voice + the starters. Doesn't need to be busy — it needs to feel like meeting a capable operator, not an empty text box. | **Medium** | `EmptyState.tsx:32-46` |
| 1.7 | **Register/mono question realized in the spine** | Per Q2 — mono labels on turn-meta, day dividers, "responding…", composer hint, memory/guest-message labels read eng-facing. | Resolve per Q2 (hybrid lean). Mechanical, but pervasive — touches every turn. | **Medium** (gated on Q2) | `ChatShell.module.css:397-401,378-382,807-810,833-835,642-646,690-694` |
| 1.8 | **Composer affordance weight** | The input is clean (hairline, teal focus ring) but quiet to the point of timid: a 28px send button, mono hint. For the primary action surface of the whole product, it's a touch under-stated. | Keep restraint, but give the composer a hair more presence (send affordance, a calm "what can I do" cue). Low-risk. | **Low** | `ChatShell.module.css:772-827` |
| 1.9 | **Spine has no entrance choreography** | Turns reveal (nice `k-reveal` stagger), but the surface as a whole (topbar, rail, composer) has no first-paint motion. The DS mandates entrance choreography "on every page"; the spine is the one a host sees first and it's static on load. | A subtle, fast first-paint settle (the spine should feel alive, not snap in). Must respect `prefers-reduced-motion` (already a pattern here). | **Low** | `ChatShell.module.css` (no surface-level entrance; cf. `.reveal:445-456` is per-turn only) |

**Tier-1 summary:** the spine is close. The needle-mover is **1.1–1.4 — make the proposal/confidence moment the most trustworthy thing in the app**, with one button vocabulary and calibrated-honesty cues. That's where delegation is won or lost.

---

## 3. TIER 2 — THE EARLY-JOURNEY PROTOTYPE LAGGARDS (a stranger hits these first)

These are the surfaces that actively read as "unfinished," and a brand-new host meets them in the **first 5 minutes** (sign up → onboard → add property → glance at pricing). Highest "screenshot looks like a prototype" risk in the product.

### 3a. Onboarding wizard — `onboarding/page.tsx`
A visibly **older/flatter design generation** than the auth screen the host just left.

| # | Issue | Should be | Rank | Evidence |
|---|---|---|---|---|
| 2.1 | **No entrance motion, hard step-cuts, no section labels, no Fraunces** — reads as a different (older) app than auth + Today | Bring onto the current system: step transitions, section labels, confident headings, the calm-but-alive register | **Critical (first-impression)** | `onboarding/page.tsx` (grep: zero `animate-*`; H1 `text-2xl font-bold text-neutral-800` :306) |
| 2.2 | **Off-recipe inputs** — coastal focus ring + `rounded-lg` (8px) + 1px border, vs the DS golden-ring + `rounded-[10px]` + 1.5px | Adopt the DS input recipe (focus ring per Q1) | **High** | `inputClass` `onboarding/page.tsx:52-53` |
| 2.3 | **Raw native `<select>` + number inputs** | Styled Koast controls | **High** | `:498-506` (select), number inputs throughout |
| 2.4 | **Stock cold-red error block** (`bg-red-50 border-red-200 text-red-600`) — the one error a new host sees (bad iCal URL) is off-brand red | The DS coral-reef error recipe | **Medium** | `:620-621` |
| 2.5 | **Near-black `bg-neutral-800` Test-Connection button** clashes with coastal nav buttons on the same screen | One button system | **Medium** | `:597` |

### 3b. Add-property form — `properties/new/page.tsx` (densest native-control offender)
| # | Issue | Should be | Rank | Evidence |
|---|---|---|---|---|
| 2.6 | **Raw native checkboxes, radios, selects, number spinners throughout** — the single biggest "unfinished" signal; a host setting up their first property taps unstyled browser widgets | Styled Koast form controls (checkbox/radio/select primitives) | **Critical** | `:341` (checkbox), `:352,:358,:480` (radio), `:319` (select), number inputs |
| 2.7 | **`indigo-50` off-palette gradient** on the prominent "Import from Channex" banner — first colored element, non-Koast color | Koast token gradient | **High** | `:207` (`from-success-light to-indigo-50`) |
| 2.8 | **Input recipe copy-pasted inline ~14×** (off-DS) + **inline SVGs instead of Lucide** | Shared DS input primitive; Lucide icons | **Medium** | inputs `:264,:287,:304,:444…`; SVGs `:210-222,:405` |
| 2.9 | **Grey "uppercase tracking-wider" pseudo-section-labels** — the golden-label slot exists but is rendered de-gilded grey | Real section labels per Q1 | **Medium** | `:499,:513,:529` |
| 2.10 | **`text-red-500` stock error** | coral-reef recipe | **Low** | `:410` |

### 3c. Pricing page — `/pricing` → `PricingDashboard.tsx` (the WORST inspect tab; pre-polish component)
> Note: a polished `polish/calendar/PricingTab.tsx` exists but is wired into PropertyDetail, NOT the standalone `/pricing` page, which still renders the old dashboard.

| # | Issue | Should be | Rank | Evidence |
|---|---|---|---|---|
| 2.11 | **It's the DS-FORBIDDEN pattern** — "signal cards with progress bars" (`SignalBar` w/ `bg-neutral-100` track) — the exact §17.6 anti-pattern ("NOT signal cards with progress bars") | The DS Pricing structure: scorecard ("you're leaving $X on the table") → recommendations → rules → performance. Adopt the already-built polished PricingTab. | **Critical** | `PricingDashboard.tsx:76-96` (SignalBar), `:87-90` (neutral track) |
| 2.12 | **🏠 emoji** in the comp-set placeholder — hard rule violation, instantly reads as unfinished | No emoji; Lucide/empty-state | **Critical** | `:660` |
| 2.13 | **Zero entrance motion + zero count-up** — the money number ("+$X opportunity") doesn't animate; page is static/PDF-feel (violates "show me the money") | Entrance choreography + count-up on the dollar figure | **High** | root `:334` (no anim); StatCard `:383-388` |
| 2.14 | **`font-mono` numerals ×13 + ~60 `neutral-*` classes** → monospace developer-dashboard, muddy gray-brown wash, weak hierarchy | Plus Jakarta numerals; coastal/tideline hierarchy via named tokens | **High** | `:452-453,:518,:625-641…`; neutral usage pervasive |
| 2.15 | **Banned `shadow-sm` on all cards + legacy `*-3d` button classes + native `<select>`** | CSS-var shadow stacks; DS buttons; styled select | **Medium** | `shadow-sm :433,:540,:619,:721`; select `:342-350` |
| 2.16 | **Bare-text empty states** ("Click a date…", "No market data…") | DS empty-state pattern | **Medium** | `:614,:645` |

---

## 4. TIER 3 — INSPECT-TAB COHERENCE (these are mostly-good; close the seams)

| # | Surface | Issue | Should be | Rank | Evidence |
|---|---|---|---|---|---|
| 3.1 | **Properties import modal** | Genuine banned Tailwind colors (`bg-red-500/blue-600/purple-600`, `bg-red-50…yellow-50` badge pairs, `text-red-500` error) + colored-letter platform identity (the banned "colored shape + letter as logo") | Koast tokens; real platform SVGs via `PLATFORMS` config | **High** | `PropertiesPage.tsx:33-37,:40-47,:576` |
| 3.2 | **Messages — temperature clash in the compose bar** | The "Draft with AI" K-button is a teal→bronze gradient w/ hardcoded `#a87d3a` + teal glow, beside a green coastal Send — three accent temperatures in one bar | One accent system per Q1 | **Medium-High** | `UnifiedInbox.tsx:876` |
| 3.3 | **"Coming soon" dead controls** (app-wide, concentrated in Messages) | 5+ permanently-disabled buttons visible to a new host (AI-Drafted filter; Phone/More; Notify cleaner / Request review / Report issue) — inert scaffolding reads as half-built | Hide unfinished affordances entirely (DS doctrine: hidden, not greyed "Coming soon"). If kept, make them real. | **Medium-High** | `UnifiedInbox.tsx:553,:794-807,:1167-1187` |
| 3.4 | **Section-label signature is teal everywhere (or absent)** | Per Q1 — Properties metric labels, Messages context labels, Today eyebrows are all `--koast-trench` teal; Calendar/Pricing have no section label at all. The "#1 brand signature" per the doc is nowhere golden. | Resolve via Q1, then apply ONE consistent section-label treatment across all surfaces | **Medium** (gated on Q1) | `UnifiedInbox.tsx:1194-1199`; `PropertiesPage.tsx:329-331`; `TodayHome.tsx:155-161`; absent in Calendar/Pricing |
| 3.5 | **No `max-w-[1760px]` cap on Pricing + Properties** | Content runs edge-to-edge on wide monitors (DS binding rule #14/#19: dashboard-shaped surfaces cap at 1760) | Add the cap | **Low-Medium** | layout `:516-533` (p-4/p-8, no cap); per surface |
| 3.6 | **Loading states are text or nothing** | Messages "Loading…" text; Pricing/Properties pop in; no DS skeletons → layout jump on slow loads | DS `bg-dry-sand animate-pulse` skeletons on the data surfaces | **Low-Medium** | `UnifiedInbox.tsx:818`; Pricing/Calendar no skeletons |
| 3.7 | **Bare `ease` / `transition-all` curves** | Several surfaces default to CSS `ease` (DS bans it; requires `cubic-bezier(0.4,0,0.2,1)` hover / `ease-out` entrance) | Correct the curves | **Low** | `RateCell.tsx:107`, `SyncButton.tsx:100`, `AvailabilityTab.tsx:80`, `UnifiedInbox` buttons, Pricing |
| 3.8 | **App-wide Toast is off-DS shape** | Full-tint success/danger background vs the DS recipe (white card + colored icon chip) | Adopt the DS toast recipe | **Low** | `Toast.tsx` (shared) |
| 3.9 | **Calendar — missing the section-label signature + no skeletons** | Strongest surface; just lacks the brand label tell and loading skeletons | Minor polish once Q1 lands | **Low** | `CalendarView.tsx` (year label tideline/500, not the signature) |

---

## 5. CROSS-CUTTING (do once, benefits everywhere)

- **C1. Reconcile `DESIGN_SYSTEM.md` to reality.** The doc is stale (says gold; code is teal; calls out glass cards the Quiet direction dropped). After Q1–Q3, rewrite it as the single source. *Auditors repeatedly tripped on doc-vs-code drift — so will every future contributor (and every future you).*
- **C2. `neutral-*` is NOT a bug — don't mass-sweep it.** `tailwind.config.ts:68-81` remaps `neutral-*` to warm Koast sand/ink, so `text-neutral-800` renders warm, not cold-gray. The *real* banned-color offenders are narrow and specific: `red-*` (onboarding `:620`, add-property `:410`, Properties `:576`), `indigo-50` (add-property `:207`), `blue/purple` (Properties modal `:33-47`), and the `🏠` emoji (Pricing `:660`). Fix those; leave the remap.
- **C3. One button vocabulary.** Today: ChatShell `.btn` (accent-deep), ProposalCard inline (lume cyan), KoastButton (coastal), onboarding (`bg-neutral-800` / `bg-coastal` / `rounded-lg`), Pricing (`*-3d`). Converge to one (per Q1).
- **C4. "Coming soon" doctrine.** The DS says hide unfinished affordances, don't grey them. Several surfaces violate this; a sweep removes the "half-built" tell cheaply.
- **C5. Motion is uneven.** Some surfaces are choreographed (Properties cards, Messages columns, dashboard), some static (Pricing, onboarding, the spine surface-load). Define the one motion vocabulary (entrance curve/stagger, hover curve) and apply it everywhere — *the* fastest "feels alive vs feels dead" win.

---

## 6. RECOMMENDED SEQUENCE (yours to re-order)

0. **Decide Q1–Q3** (§1). Blocks everything; ~a conversation, not a build.
1. **Reconcile the token layer + rewrite `DESIGN_SYSTEM.md`** (C1–C3). The foundation every later step draws on.
2. **Agent spine trust moment** (§2: 1.1–1.4) — the proposal/confidence card is where delegation is won. Highest single-component leverage.
3. **The prototype laggards a stranger hits first** (§3: onboarding 2.1–2.3, add-property 2.6, Pricing 2.11–2.13). Biggest "looks unfinished" removal.
4. **Inspect-tab coherence sweep** (§4 + C4–C5): kill banned colors + "Coming soon" controls, unify section labels + motion, add skeletons/caps.
5. **Spine register + finish** (1.7–1.9) and the long-tail (§4 low items).

---

## 7. OPEN QUESTIONS FOR CESAR (consolidated) [Q]

1. **Q1 — Gold, teal, or a defined split?** (the brand-color reconciliation — highest leverage). My lean: teal accent, gold reserved for money/value moments.
2. **Q2 — Spine register: mono "console", warm "host", or hybrid?** My lean: hybrid (mono for machine facts, sans for human-facing).
3. **Q3 — One shared token system, or intentional spine-vs-inspect dialects?** My lean: one token layer; layout may differ.
4. **The proposal card (1.1):** how much context belongs on the "Koast suggests" card — minimal (current), or richer (property anchor + before→after diff + confidence)? This is the trust centerpiece; worth your direction.
5. **"Coming soon" controls (3.3 / C4):** hide them (DS doctrine) or are any close enough to finish in the pass?
6. **Scope ambition:** is this a *coherence* pass (reconcile + drag laggards up — faster, lower-risk) or a *signature* pass (also push the spine/proposal to genuinely best-in-class — more time, higher ceiling)? That choice sizes everything.

---

*Evidence sources: first-hand reads of the spine (`ChatShell.module.css`, `ProposalCard.tsx`, `EmptyState.tsx`, `TodaySuggests.tsx`, `Composer`) + two parallel surface auditors (inspect tabs; onboarding/auth) with `file:line` evidence. No code was modified.*
