# Belief 5 — Honest Confidence Inventory

*Belief: "Honest confidence." — confirmed knowledge stated plainly; high-confidence inference marked but not undercut; active guesses hedged with limitation + next step. "Let me find out" replaces "I don't know." Voice direct, calibrated, action-oriented.*

This is an inventory of confidence vocabulary, voice patterns, and calibration debt in `~/koast`. The agent loop itself doesn't exist yet (per Belief 2); this is therefore an audit of the **substrate** the future agent's confidence layer will inherit. Investigation only. No code changes.

Cross-references: Belief 1 (config), Belief 2 (chat surface), Belief 3 (memory), Belief 4 (gradient).

---

## 1. Current LLM call sites — prompts and output shapes

Four production LLM callers, all `claude-sonnet-4-20250514`, all single-turn `messages.create`, all non-streaming, all returning plain text.

### 1a. `generateDraft()` — `src/lib/claude/messaging.ts:35-91`

**System prompt** (verbatim, 5 lines):
```
You are a friendly, professional short-term rental host assistant for {property.name}{ in {property.city}}. Property details: X bed, Y bath, max Z guests.

{booking ? "Booking context: Guest {guest_name} is staying {check_in} to {check_out} (N nights) for ${total_price}." : "No active booking context."}{detailsBlock}

Respond warmly and helpfully. Keep responses concise (2-4 sentences). Include specific property details when relevant (check-in time, WiFi, parking, etc.). If you don't know something, say you'll check and get back to them. Never mention you are an AI.
```

`detailsBlock` is conditionally appended: `"\n\nProperty information you KNOW and should share when asked:\n{detail lines}"` — a flat dump of `wifi_network`, `wifi_password`, `door_code`, `checkin_time`, `checkout_time`, `parking_instructions`, `house_rules`, `special_instructions` from `property_details` (whichever are non-null).

**Output shape**: plain text, max_tokens 300. Returned as a string from `response.content.find((b) => b.type === "text").text`. Written to `messages.ai_draft` + `messages.draft_status='generated'`.

**Uncertainty handling**: one sentence. *"If you don't know something, say you'll check and get back to them."* This is closer to "honest confidence" than the alternative ("answer something plausible") but it's:
- A single behavioral instruction without structure.
- Not differentiated by stakes (a wifi password question and a refund question get the same handling).
- Not source-attributed (the model is told to use property_details but the output doesn't cite which field it came from).
- No instruction to mark hedges in the surface text. The model can choose to hedge or not.

**Note**: `classifyMessage(content)` (line 102-120) is a regex-based intent classifier (returns `check_in`/`wifi`/`checkout`/`early_checkin`/`late_checkout`/`general`). Defined but **no caller invokes it** anywhere in the repo — dead infra waiting for the AI messaging pipeline.

### 1b. `generateGuestReview()` — `src/lib/reviews/generator.ts:44-91`

Two model calls per invocation: review (max_tokens 400) + private note (max_tokens 100).

**Review system prompt** (excerpt):
```
You are writing a host review for an Airbnb/VRBO guest. The review should be:
- Unique and specific to this guest's stay (never generic)
- {rule.tone} in tone
- 2-4 sentences long
- Naturally incorporate 1-2 of these property keywords: {keywords}
- Mention the guest by first name
- Reference something specific: length of stay, time of year, or property features

Property: {name} in {city}, X BR/Y BA
Guest: {firstName}, stayed {check_in} to {check_out} (N nights)
Booking source: {platform}

IMPORTANT: Every review must be different. Vary sentence structure, opening phrases, and specific details. Never start two reviews the same way. Never use these overused phrases: 'wonderful guest', 'highly recommend', 'welcome back anytime' — find fresh ways to express the same sentiment.

Return ONLY the review text, nothing else.
```

**Uncertainty handling**: none. The prompt presupposes the booking context is sufficient. There's no "if context is thin, write less" branch.

### 1c. `generateReviewResponse()` — `src/lib/reviews/generator.ts:94-130`

Single call, max_tokens 300. System prompt branches by rating category (positive 4-5★ / mixed 3-4★ / negative 1-3★) with different per-category instructions. **No uncertainty handling.**

### 1d. `generateGuestReviewFromIncoming()` — `src/lib/reviews/generator.ts:136-178`

Single call, max_tokens 200. System prompt:
```
Write a host's review of a guest for Airbnb. Tone: {ratingTone}. Length: 100-300 characters. Honest, not performatively warm. Never fabricate specifics.

Context: ...

Bias rules:
- 5-star incoming with no flagged issues: warm, brief, mentions communication or rule-following.
- 4-star: positive but light, no over-claim.
- 3 or below: neutral, factual ("good communication" / "respectful of the space"); do not invent positive details.
- If private feedback flagged issues: acknowledge guest demeanor without praising — e.g. "communicated clearly" not "delightful guest".

Return ONLY the review text. No preamble, no quotes around it.
```

**This is the closest existing prompt to Belief 5's framing.** Explicitly: *"Honest, not performatively warm. Never fabricate specifics."* + bias rules that constrain the model's claim density to the available signal. *"do not invent positive details"* is a hallucination-prevention instruction expressed as voice guidance. Worth preserving as a reference.

### 1e. Other generation paths

A grep for `messages.create` outside Twilio shows the same 4 sites and nothing else. There are no:
- Title generation calls.
- Summarization calls.
- Embedding calls (no embedding API in use).
- Tool-using LLM calls.

The only model-adjacent text generation is the Python `messaging_executor.py` worker, which does **template `{var}` regex substitution, not LLM generation** — the host-side template body is rendered with property/booking/property_details substituted in. This isn't generation, but it does produce host-facing text — see §4 for the `[not set]` honest-fallback pattern.

### 1f. Sub-conclusion §1

The 4 LLM call sites have **5 model calls** total. Confidence handling exists in the prompts as scattered, behavior-shaped instructions (one sentence in messaging, three "bias rules" in `generateGuestReviewFromIncoming`). There is no:
- Structured confidence output (the model returns text, not `{ text, confidence, sources, hedges }`).
- Schema-enforced output validation (no JSON, no Zod).
- Source attribution preserved through to the output text.
- Differentiation by stakes or context strength.

The `generateGuestReviewFromIncoming` prompt is the strongest existing reference for honest-confidence framing; the others lean conventional.

---

## 2. Existing confidence vocabulary

### 2a. Source / lineage enums in the schema

| Column | Values | Where defined |
|---|---|---|
| `pricing_rules.source` | `defaults` / `inferred` / `host_set` | migration `20260418000000` |
| `properties.comp_set_quality` | `unknown` / `precise` / `fallback` / `insufficient` | migration `20260417030000` |
| `market_comps.source` | `filtered_radius` / `similarity_fallback` | migration `20260417030000` |
| `calendar_rates.rate_source` | `manual` / `engine` / `override` / `manual_per_channel` / `ical` | migration 001 + per-channel migration |
| `pricing_outcomes.rate_source` | text (lineage at outcome time) | migration 005 |
| `bookings.source` | `ical` / `channex` / etc. (default `ical`) | schema |
| `local_events.source` | `ticketmaster` / etc. | schema |
| `market_snapshots.data_source` | default `airroi` | schema |
| `leads.source` | default `revenue_check` | schema |

### 2b. Numeric / categorical confidence values

**Per-signal numeric confidence** in the pricing engine (`src/lib/pricing/aggregate-signals.ts:25,46`). Contract: each signal returns `{ score, weight, reason, confidence? }` where `confidence` defaults to 1.0 when omitted. Aggregator computes `effective_weight = weight × confidence` and **redistributes dropped weight proportionally across remaining signals so the final weights still sum to 1.0**. This is the cleanest confidence-aware aggregation primitive in the codebase.

Today **only the Competitor signal sets confidence**: `precise=1.0, fallback=0.5, insufficient=0.0, unknown=0.0` (from `src/lib/pricing/signals/competitor.ts:15-22`). The other 8 signals all default to 1.0. `competitor.ts:21` also surfaces a textual reason: `"No comp data available"` when comp data is missing — with `confidence: 0.0`, weight 0.20.

**Categorical confidence** in `src/lib/pricing/scenarios.ts:10`:
```typescript
confidence: "high" | "medium" | "low";
```
Set heuristically per-scenario: gap-night scenario is `high` if `gapNights >= 4` else `medium`; weekend-rate is `high` if `weekendRates.length >= 8` else `medium`; mid-week is `medium` if `openDays.length >= 14` else `low`; etc. (lines 63, 84, 110, 131, 151). All 5 scenarios use the same enum; the threshold is per-scenario and hardcoded.

**Per-signal "highConf" boolean** in the UI: `KoastSignalBar.tsx:12` defines `highConf = confidence >= 0.6` as the visual differentiator (>=0.6 renders one way, below renders another).

### 2c. Other quality / certainty markers

- `pricing_recommendations.urgency` enum: `act_now` / `coming_up` / `review`. Behavioral framing rather than confidence — what the host should do — but encodes the engine's certainty about whether the date needs immediate attention.
- `pricing_recommendations.reason_signals.clamps`: per-rec audit JSONB capturing `{ raw_engine_suggestion, clamped_by, guardrail_trips }`. Records when guardrails overrode the model's preferred output — a form of "what we wanted vs what we did."
- `messages.draft_status`: lifecycle enum (`none`/`generated`/`sent`/`draft_pending_approval`/`discarded`) — closer to gradient than confidence but distinguishes "the model produced this" from "the host produced this."

### 2d. Sub-conclusion §2

The codebase has **3 enum families** (lineage/source, comp-set-quality, rate-source) and **2 numeric/categorical confidence types** (per-signal 0..1 numeric + scenarios "high/medium/low"). The aggregate-signals.ts confidence-weighted reduction is a clean primitive ready to extend to the agent layer's confidence aggregation. Most signals don't yet emit confidence; this is calibration debt rather than missing infrastructure.

---

## 3. Confidence exposure to hosts

Where the §2 vocabulary actually surfaces in the UI:

### 3a. Surfaced

| Vocabulary | Surfaced via | Where |
|---|---|---|
| `comp_set_quality` | `KoastChip` with `success`/`warning`/`danger`/`neutral` variants | `PricingTab.tsx:464-484` — chip labeled "Comp set: precise / fallback / insufficient / pending" rendered in the rules header |
| `pricing_rules.source` | Inline copy in RulesEditor | `PricingTab.tsx:780` — "Koast inferred these from your existing pricing history. Tweak anything — your changes always win." (when source='inferred') OR "These are starter values. Personalize them to match your strategy." (when source='defaults'). NO copy when source='host_set' (host knows). |
| Per-signal `score`/`weight`/`confidence` | `KoastSignalBar` per-signal bar with `highConf >= 0.6` differentiator | `PricingTab.tsx:1131`, `PortfolioSignalSummary.tsx:55` |
| `pricing_recommendations.reason_text` | Inline on rec rows + tooltip on calendar | `PricingTab.tsx:684, 1123`, `CalendarView.tsx:1399` (`title={rec.reason_text ?? "Act now"}`) |
| `pricing_recommendations.reason_signals.clamps` | Renders inside the rec breakdown drawer | `PricingTab.tsx:1088-1218` — surfaces `guardrail_trips` so the host sees "engine wanted X but rules clamped to Y" |
| `pricing_recommendations.urgency` | Three groupings ("Act now" / "Coming up" / "Review") | PricingTab list + Dashboard insight cards |
| Scenarios `confidence` | Colored chip "high confidence" / "medium confidence" / "low confidence" | `AnalyticsDashboard.tsx:1014-1017` — high=lagoon green, medium=amber, low=neutral |

### 3b. Auto-apply readiness — quantified gap copy

`PricingTab.tsx:1224-1225` (`AutoApplyChecklist`):
```
{ label: "14+ days of validation data", ok: has14Days, current: `${validationDays}/14 days` },
{ label: "Auto-apply enabled in rules", ok: autoApplyOn, current: autoApplyOn ? "On" : "Off" },
```

Plus tooltip at `:947`: *"Unlocks after 14 days of validation + clean comp set"* and inline copy at `:961`: *"Coming soon — unlocks after 14 days of validation."*

This is the most quantified "what's needed to trust this further" copy in the codebase. **Belief 5-shaped**: the gap is named numerically (X/14 days), the gating reason is honest, the resolution path is clear.

### 3c. Honest fallback / "not enough data yet" copy

| Surface | Copy | File |
|---|---|---|
| Reviews dashboard strip | "30d delta — not enough data" | `ReviewsDashboardStrip.tsx:192` |
| Dashboard empty insight pane | "No urgent insights right now. Koast will surface pricing opportunities, gap nights, and event impacts as they appear." | `DashboardClient.tsx:768` |
| Dashboard learning-mode opportunity card | "Koast is learning your rate patterns across X properties and 90 forward dates. Once we've captured more channel rates, we'll surface real opportunities here." | `DashboardView.tsx:693` |
| PricingTab empty recs | "Koast ran at 6 AM ET and has no pending recommendations for this property." | `PricingTab.tsx:356` |
| Portfolio signal summary | `<KoastEmptyState title="No signals to aggregate" body="Run the engine to see which signals are moving rates today." />` | `PortfolioSignalSummary.tsx:51` |
| Dashboard "all caught up" | `<KoastEmptyState title="You're all caught up" body="Nothing needs your attention right now." />` | `DashboardView.tsx:815` |
| Rate cell ChannelPopover tooltip | "Rate differs from Koast's stored value" | `PerChannelRateEditor.tsx:463` |

These are well-shaped honest fallbacks: they name the gap, decline to fabricate, and (in the better cases) describe the resolution path.

### 3d. NOT surfaced

- `/api/pricing/audit/[propertyId]?date=` `auto_apply_blockers` enumeration: the endpoint returns a structured list of blocker conditions; the UI's `AutoApplyChecklist` (PricingTab) renders an aggregate version derived from `usePricingTab` data, but the endpoint itself **isn't called by any UI today**. The blocker enumeration is reachable only by direct API hit — the surface is plumbed-but-not-wired.
- `pricing_outcomes.signals` JSONB (the per-signal record at outcome time): captured but not surfaced.
- `market_comps.source` / `filtered_radius` / `similarity_fallback`: the underlying lineage is stored per-comp but not displayed per-comp in `/comp-sets` — only the aggregate `comp_set_quality` chip surfaces.
- `learnedDow` (per-DOW conversion rate): the seasonality signal's `reason` text says *"learned DOW data"* vs *"default DOW data"* (one bit), but the actual rates aren't shown.

### 3e. Sub-conclusion §3

The codebase has roughly **8 dedicated UI surfaces** for confidence/lineage exposure — all in pricing or dashboard. The `KoastSignalBar` + comp-set chip + RulesEditor "inferred from your history" copy are the strongest references. The `AutoApplyChecklist` is the strongest "X/Y until trust unlocks" precedent. Outside pricing, confidence exposure is **largely absent** — messaging draft generation surfaces no confidence, review generation surfaces no confidence, dashboard insight cards surface point-estimate dollar amounts without bands.

---

## 4. Provenance-in-output patterns

### 4a. Messaging draft

The `generateDraft()` system prompt **inlines `property_details` into the prompt** (`detailsBlock` in `messaging.ts:53-65`). The model receives:
```
Property information you KNOW and should share when asked:
WiFi: HomeNetwork / Password: abc123
Door code: 4567
Check-in time: 15:00
...
```

The model **knows the source** of these facts. But **the output doesn't preserve attribution**. A generated draft says *"Your WiFi is HomeNetwork, password abc123"* — never *"Your WiFi is HomeNetwork (from your property settings)"*. Provenance is one-way: into the prompt, not back into the output.

### 4b. Pricing recommendations

The pricing engine emits a **structured per-signal record** through the aggregation:
```
signals: {
  competitor: { score, weight, reason: "Below comp p25 by 4%", confidence: 0.5 },
  seasonality: { score, weight, reason: "Friday in March (peak season) — learned DOW data" },
  events: { score, weight, reason: "Taylor Swift at Raymond James (50k attendance)" },
  ...
}
```
Each signal's `reason` text names its source (the comp percentile, the DOW data tier, the event source). This IS **source-attributed within the engine** — the rec carries its provenance.

The synthesized `reason_text` field (the host-facing 1-2-line summary) is generated by the validator from the dominant signals + clamps; it preserves which factor mattered most ("Comp p25 floor lifted base by $12; weekend uplift added $4").

The rec drawer in PricingTab renders all signals via `KoastSignalBar` (one bar per signal with reason tooltip). This is the **strongest source-attribution UI in the codebase** — host can drill into any rec and see which signals fired with what confidence.

### 4c. Template renderer — the "[not set]" pattern

`koast-workers/messaging_executor.py:64,109-139`:
```python
DEFAULT_NOT_SET = "[not set]"

def render(body, variables):
    """
    Three outcomes per variable:
      - mapped + non-None + non-empty → substitute the value
      - mapped + None or empty       → DEFAULT_NOT_SET, key appended to `unresolved`
      - not mapped at all            → DEFAULT_NOT_SET, key appended to `unknown`
    Returns (rendered_body, unresolved_list, unknown_list).
    """
```

When `messaging_executor` renders a "Check-in Instructions" template against a property whose `door_code` is null, the rendered output is literally:
```
Door access: [not set]
WiFi: HomeWiFi / Password: [not set]
```

The host sees this in the inbox before approving. The template's missing-value visibility is the closest existing pattern in the codebase to **honest output** — when context is missing, the rendered output makes the missingness visible rather than hallucinating a value or silently dropping the line.

The trade-off: the literal `[not set]` token leaks into guest-bound text if the host approves without correcting. The pattern is honest but ergonomically rough.

### 4d. `guest_reviews.ai_context` JSONB

Set exactly once per generation event (`/api/reviews/generate/[bookingId]/route.ts:136`). Captures the booking + property + tone passed to the LLM. **Audit metadata; not surfaced in UI.** A future "show me how this draft was generated" surface could read from it.

### 4e. Sub-conclusion §4

Provenance is **stored** in three places (per-signal `reason` on pricing recs, `ai_context` JSONB on reviews, `inferred_from` JSONB on pricing_rules — see Belief 3) and **surfaced** in one (PricingTab rec drawer with KoastSignalBar). LLM-generated text **does not preserve attribution** — the model receives source-tagged context in the prompt but emits flat prose. The `[not set]` template-renderer pattern is the strongest "honest about missingness" precedent and the only one that propagates through to host-visible output.

---

## 5. Calibration debt

### 5a. Confident-sounding output without calibration

| Surface | Copy / behavior | Calibration gap |
|---|---|---|
| Dashboard pulse metrics sparkline | Renders a 7-point time series visually | **Mocked.** Per CLAUDE.md "Known Gaps — Pulse Metric Time Series": the API returns only `{ value, prior }`; the Dashboard "mocks a 7-point series client-side via linear interpolation + gentle wobble." The chart looks real; the wobble is fabricated. |
| Pricing engine `suggested_rate` | One number per date | Single point estimate. No upper/lower band, no confidence interval, no "between $145 and $165" framing. Even when Competitor signal returns `confidence=0.0` (no comp data), the final number is presented as authoritative. |
| Revenue Check public lead-gen | "$X — leaving on the table" hero figure | Point estimate from AirROI comps with significant variance, presented as a single dollar amount. By-design lead-gen marketing copy, not host-facing tooling. |
| Dashboard Revenue Opportunity card | "+$X potential" count-up animation | Point estimate. Per `AnalyticsDashboard.tsx:201-220`, computed from `suggested - applied` for forward dates. Fine math, no uncertainty band shown. |
| `/revenue-check` page hero | "How much money are you leaving on the table?" | Marketing framing. Single number presented authoritatively. |
| 90-day demand forecast | `forecast: ForecastDay[]` per-date `demand_score` + `demand_level` | Bins to high/moderate/low but doesn't expose how much data fed each bin. |
| Scenarios "estimated_impact" $/yr | Each scenario carries a $/yr impact figure + confidence chip | Confidence is bucketed (high/medium/low), but the $ impact is a point estimate with no range. |

### 5b. UI copy that overstates

A scan for `Koast knows` / `based on your data` / `definitely` / `guaranteed` / `certainly`:
- Zero matches for those exact phrases in src/.
- Several "Koast" first-person phrasings: *"Koast inferred these from your existing pricing history"* (good — names the source), *"Koast is learning your rate patterns…"* (good — says learning, not yet ready), *"Koast ran at 6 AM ET and has no pending recommendations for this property"* (good — concrete + bounded), *"Koast suggests"* (medium — first-person but no confidence framing).
- *"Koast AI"* button label in inbox (`UnifiedInbox.tsx:803, 795`) — neutral framing; the button is dimmed pending implementation.

The codebase **largely avoids overconfidence**. The phrasing tends toward "Koast did X" or "Koast is learning Y" rather than "Koast knows Z." Where confidence is asserted ("inferred from your history"), it's source-attributed. The Belief 5 voice principle is partially expressed already.

### 5c. Filler / hedging that *under*-confidence

DESIGN_SYSTEM.md §15 explicitly forbids: *"No filler: 'I hope this helps', 'Please don't hesitate', 'We look forward to'."* This rule lives in the AI tone section (review/draft generation) — but doesn't otherwise constrain UI copy. A grep for "I hope" / "Please don't" / "kindly" returns no UI-copy matches; the rule is honored.

The messaging draft prompt instructs *"warmly and helpfully"* but doesn't actively police hedge fatigue. With no test corpus or post-generation lint, drift is possible.

### 5d. Sub-conclusion §5

The biggest calibration debt is in **point-estimate dollar amounts** ("$X opportunity", "$Y leaving on the table") presented as authoritative — these are real estimates with significant variance, surfaced as count-up hero numbers. The pulse metric mocked sparkline is the most concerning single gap (visual lie in a hero chart). UI text largely avoids overconfidence; the codebase's discipline is "name the source, hedge once, stop." Where calibration is missing, it's missing because the underlying engine doesn't produce confidence intervals — not because the copy lies about them.

---

## 6. Voice register patterns

### 6a. Codified voice rules

There is **no dedicated voice doc**. Voice rules are scattered:

- **DESIGN_SYSTEM.md §15** (the closest thing to a voice guide):
  ```
  - **No emojis.** Not in AI drafts, reviews, UI, activity feed, notifications. Anywhere.
  - **No animated dots.** Status = solid dot. Only allowed animations: entrance choreography, AI ambient glow, loading skeletons.
  - **AI tone:** Warm, professional. Reference specifics (property name, guest name, dates, local places). 2-4 sentences for reviews. No filler: "I hope this helps", "Please don't hesitate", "We look forward to".
  ```
- **CLAUDE.md "Code Rules"**: "No emojis anywhere — UI, AI-generated content, or user-visible SMS bodies. No pulsing/glowing animated dots. Status indicators are solid colored dots."
- **KOAST_PRODUCT_SPEC.md:594**: *"No emojis. Professional tone throughout."*
- **`generateGuestReviewFromIncoming` system prompt**: *"Honest, not performatively warm. Never fabricate specifics."* + bias rules.

That's the entire codified voice surface. There is no:
- Dedicated voice document.
- Per-surface tone differentiation (notification vs error vs empty state vs guest-facing).
- Style guide for first-person vs third-person Koast references.
- Hedge vocabulary list ("hedge with X, not Y").

### 6b. UI copy register, by surface

Empty states and notifications across the codebase tend toward **short, declarative, action-oriented**:

- "No conversations yet"
- "No turnovers today"
- "No completed tasks yet"
- "No tasks found"
- "No bookings to export"
- "You're all caught up — Nothing needs your attention right now."
- "No urgent insights right now. Koast will surface pricing opportunities, gap nights, and event impacts as they appear."
- "Koast is learning your rate patterns across X properties..."

This register is largely **Belief 5-shaped**: short, direct, names the gap, declines to fabricate. The "Koast will surface X as they appear" phrasing is future-tense honest about current absence — closer to *"let me find out"* than *"I don't know"* without the agent layer that would actually go find out.

### 6c. AI-draft voice register

`generateDraft` (messaging) prompt: *"Respond warmly and helpfully. Keep responses concise (2-4 sentences). Include specific property details when relevant... If you don't know something, say you'll check and get back to them. Never mention you are an AI."*

`generateGuestReview`: *"Unique and specific... never generic... vary sentence structure... never use 'wonderful guest', 'highly recommend', 'welcome back anytime'."*

`generateReviewResponse`: branches by rating category — different voice per branch.

`generateGuestReviewFromIncoming`: *"Honest, not performatively warm. Never fabricate specifics... do not invent positive details."*

The strongest voice instruction is in the last prompt — explicit anti-hallucination + anti-performance directives. The other prompts are looser.

### 6d. Sub-conclusion §6

The codebase has **partial voice rules** scattered across DESIGN_SYSTEM.md §15, CLAUDE.md, KOAST_PRODUCT_SPEC.md, and the 4 LLM prompts. The empty-state register is consistently good (short, declarative, honest about gaps). The AI-draft register varies — strongest in `generateGuestReviewFromIncoming`, looser in `generateDraft`. There is no unified voice doc that the future agent can read as its single source of truth; assembling one is downstream work.

---

## 7. Hallucination-prevention infrastructure

### 7a. LLM guardrails — what's there

- **None at the call site.** Each of the 4 LLM call sites does:
  1. Build prompt.
  2. `client.messages.create(...)`.
  3. Extract `response.content.find(b => b.type === "text").text`.
  4. Write to DB or return.
  
  No JSON output. No Zod validation. No schema enforcement. No retry-on-error. No refusal fallback. If Anthropic returns an empty string, the route writes the empty string. If it returns hallucinated content, nothing checks the claims against the source data.

- **Output is plain text, not structured.** No tool use, no `tools:` parameter, no JSON mode, no XML tag enforcement.

- **No post-generation validation** (no "verify the WiFi password matches what's in property_details before sending the draft" step).

- **No retry logic.** Network or API errors propagate to the caller as 500.

### 7b. Pricing engine "not enough data" branches

The pricing engine has multiple data-sufficiency thresholds that gate output (or downgrade output) rather than fabricating:

| Threshold | Behavior when below | Source |
|---|---|---|
| `learnedDow` requires ≥30 outcomes | Falls back to hardcoded `DOW_ADJUSTMENTS` table; signal `reason` text says "default DOW data" instead of "learned DOW data" | `engine.ts:265`, `seasonality.ts:35-40` |
| `avgLeadTimeDays` requires ≥5 booked outcomes | Returns null; downstream signal handles null gracefully | `engine.ts:281` |
| `inferPricingRulesFromHistory` requires ≥30 calendar_rates rows | Returns null; route falls back to hardcoded defaults with `source='defaults'` | `rules-inference.ts:87,96` |
| Channel markups inference requires ≥3 same-date observations per channel | Excludes that channel from `channel_markups` rather than guessing | `rules-inference.ts:142` |
| Competitor signal | Returns `confidence=0.0` + `reason: "No comp data available"` when no comp data | `competitor.ts:21` |
| Scenarios | Each scenario has its own threshold (gap_nights ≥4, weekendRates ≥8, openDays ≥14, sameDayGaps ≥2, compAdrs ≥5) gating high vs medium/low confidence | `scenarios.ts:63-151` |
| Auto-apply readiness | Requires 14+ days validation + clean comp set; surfaced as quantified checklist | `PricingTab.tsx:1224-1225` |

**This is the strongest existing infrastructure for "honest about insufficient data."** The pattern is: define a threshold, check it, downgrade the output (signal confidence, scenario confidence, source enum) rather than fabricating. The agent layer can extend this style.

### 7c. Template-renderer "missing variable" pattern

`messaging_executor.py:109-139` (`render()`): tracks `unresolved` (mapped but null/empty) and `unknown` (not mapped at all) variables, renders both as `[not set]` literally in the output, returns the lists alongside the rendered body. The worker logs these:
```python
log.warning(
    "template_id=%s unresolved_vars=%s rendered as %s",
    ...
)
```

The host sees `[not set]` in the draft inbox; the host can correct or discard. **The pattern: never silently substitute, never fabricate, render the gap.**

### 7d. No grounding-check infrastructure

There is no post-LLM-generation step that:
- Verifies factual claims in the output against the source data (e.g., "the draft says the WiFi password is X — does property_details actually have password=X?").
- Counts unsupported claims.
- Refuses to commit if a claim isn't grounded in retrievable data.

This is greenfield. The agent loop (per Belief 2) will need it.

### 7e. Sub-conclusion §7

Hallucination prevention exists **in the deterministic engine** (good — multiple data-sufficiency thresholds, source enums, confidence scaling) and is **completely absent at the LLM call sites** (no validation, no retries, no grounding). The template renderer's `[not set]` pattern is the only existing host-visible "we don't have this fact" surface. The agent layer's confidence layer will extend the engine's threshold pattern to LLM outputs (Zod schemas, grounding checks, refusal fallback) and adopt the `[not set]` ergonomic.

---

## 8. Keep / extend / greenfield

### Keep — vocabulary and patterns the confidence layer should build on

1. **Source / lineage enums** (`pricing_rules.source`, `comp_set_quality`, `market_comps.source`, `rate_source`). The 3- and 4-tier enums are the right shape for memory provenance + agent confidence. The future `memory_facts.source` and `agent_output.source` should reuse this style. Confidence: high.
2. **Per-signal `{ score, weight, reason, confidence }` contract** (`aggregate-signals.ts`). Already-shaped "honest output" primitive — each contributing factor names its strength, weight, and reason. Generalizes to agent output ("here are the 3 things I considered, with confidences"). Confidence: high.
3. **Confidence-weighted aggregation with dropped-weight redistribution** (`aggregate-signals.ts:46`). The math is general; reuse it for the agent's "weighted reasoning across N memory facts." Confidence: high.
4. **`KoastSignalBar` component** with `highConf >= 0.6` visual threshold. The cleanest existing UI for "show the host how confident we are." Confidence: high.
5. **`comp_set_quality` chip** with success/warning/danger/neutral variants. Generalizes to "confidence chip" alongside any agent claim. Confidence: high.
6. **RulesEditor "Koast inferred these from your existing pricing history" copy** (`PricingTab.tsx:780`). Source-attributed, action-inviting ("tweak anything — your changes always win"), Belief 5-shaped. Pattern reusable wherever the agent surfaces an inferred fact. Confidence: high.
7. **AutoApplyChecklist quantified-gap copy** (`PricingTab.tsx:1224`). "X/Y until trust unlocks" — the strongest existing precedent for "what's needed to graduate this autonomy" framing. Reusable for the gradient layer's calibration progress. Confidence: high.
8. **"30d delta — not enough data" / "Koast is learning..." fallback copy** (`ReviewsDashboardStrip.tsx:192`, `DashboardView.tsx:693`). Honest, future-tense, names the gap. Reusable wherever the agent doesn't yet have enough signal. Confidence: high.
9. **Pricing-engine data-sufficiency thresholds** (`learnedDow` ≥30 outcomes, `avgLeadTimeDays` ≥5 booked, `inferPricingRulesFromHistory` ≥30 rows, channel markups ≥3 same-date observations). The pattern — define a threshold, downgrade rather than fabricate — is the strongest existing hallucination-prevention discipline. Replicate at the LLM call sites. Confidence: high.
10. **Template renderer `[not set]` + unresolved-tracking pattern** (`messaging_executor.py:109-139`). The literal "render the gap visibly" approach. Apply to LLM-generated text where context is missing. Confidence: medium-high (the literal `[not set]` token leaks into guest-bound text if approved without correction; ergonomically rough but honest). 
11. **`generateGuestReviewFromIncoming` prompt's bias rules** (`reviews/generator.ts:148-160`): "Honest, not performatively warm. Never fabricate specifics. Bias rules: 5★ → warm/brief; 3★ or below → neutral/factual; do not invent positive details." Best existing prompt-level confidence framing. Use as reference for the agent's system prompts. Confidence: high.
12. **DESIGN_SYSTEM.md §15 anti-filler list** ("No 'I hope this helps' / 'Please don't hesitate' / 'We look forward to'") + no-emoji rule. Already prevents the lower-confidence filler register. Generalize to the agent. Confidence: high.
13. **`pricing_recommendations.reason_signals.clamps` audit JSONB**. Captures "engine wanted X, rules clamped to Y, here's why" — the structural pattern for "the agent's preferred output vs what shipped" propagates to the gradient layer's audit feed. Confidence: high.

### Extend — close-enough but narrow

1. **Signal confidence is set on only 1 of 9 signals** (Competitor). Extend to all 9 (or formalize that signals which can't compute confidence default to 1.0 explicitly so hosts know which signals have a confidence story). Confidence: medium-high.
2. **Scenarios use `"high" | "medium" | "low"` enum**; pricing engine uses 0..1 numeric. Pick one. Belief 5's "three modes" framing (confirmed / high-confidence inference / active guess) maps cleaner to the categorical enum, but downstream math wants the numeric. Both surfaces should expose both — categorical chip for headline, numeric for inspector. Confidence: medium.
3. **`pricing_recommendations.reason_text`** is plain English. Extend to a structured `{ kind, sources, hedges, next_step }` shape so the UI can render the right chrome consistently. Confidence: medium.
4. **`generateDraft` prompt's uncertainty handling is one sentence.** Extend with `generateGuestReviewFromIncoming`-style explicit bias rules per intent: "if the host asks something that requires guest-history data, hedge — say 'let me check'." Confidence: medium-high.
5. **`property_details` source attribution**: the prompt knows which fields it pulled from, but the output text doesn't say "from your property settings." Extend the prompt to instruct: "when stating a fact from property settings, the output need not cite the source directly to the guest, but on host-side draft preview, surface which property_details fields fed which sentences." This is provenance UI extension. Confidence: medium.
6. **`/api/pricing/audit/[propertyId]?date=` `auto_apply_blockers`** — endpoint exists; UI doesn't call it. Either wire it or fold it into `usePricingTab`. Confidence: medium.

### Rebuild — built for a different model; deprecate cleanly

1. **Dashboard pulse metric mocked sparkline** (CLAUDE.md known gap). Replace with a real `series: number[]` time-series endpoint — or remove the visual until the data exists. The current behavior is the codebase's most concerning calibration debt: a chart that looks real where the wobble is interpolated. Confidence: high.
2. **Single-point dollar estimates without bands** ("+$X potential", "leaving on the table"). The math is fine; the framing is wrong for Belief 5. Replace with a range, a confidence band, or an explicit "rough estimate based on N comps" qualifier. Marketing copy on `/revenue-check` may stay punchy by intent, but in-app surfaces should be calibrated. Confidence: medium-high.

### Greenfield — nothing close exists

1. **LLM output schema enforcement.** Zod validation, JSON output mode, structured response shape. Today every LLM call returns plain text and writes it raw. Greenfield. Confidence: high.
2. **Refusal fallback** ("I don't know" → "let me find out"). Today no LLM call refuses; whatever comes back gets written. The agent loop (per Belief 2) will need a "I don't have this in memory; should I research it?" capability. Greenfield. Confidence: high.
3. **Grounding check** — verify the output's factual claims can be traced to retrieved data, count unsupported claims, refuse-or-flag if the count exceeds threshold. Today nothing. Confidence: high.
4. **Confidence calibration loop** — does the agent's stated confidence track reality? Build a feedback loop where wrong-confident answers degrade future stated confidence. Greenfield. Confidence: high.
5. **"Three modes" structured output** (confirmed knowledge / high-confidence inference / active guess). Belief 5 names them; the codebase has none of them as discriminated output types. Greenfield. Confidence: high.
6. **Stakes-aware voice register**. Different confidence floor for low-stakes ("what's the wifi") vs high-stakes ("did the booking actually post?"). Today the voice is uniform per call site. Greenfield. Confidence: high.
7. **Voice consolidation document.** The 4 codified rules are scattered. The agent layer will benefit from a single, agent-readable voice doc. Greenfield (writing only — no infrastructure). Confidence: high.
8. **Source attribution in agent output text**. Today only the engine's `KoastSignalBar` surfaces sources; the messaging draft and review draft don't. The agent's chat output should cite sources for testable claims. Greenfield. Confidence: high.
9. **Per-output `confidence`, `sources`, `hedges`, `next_step` metadata** as a first-class shape. Today the closest thing is `pricing_recommendations.reason_signals` JSONB. Greenfield as a uniform agent-output type. Confidence: high.

### Headline

The codebase's confidence story is **strong inside the deterministic engine** (multiple source enums, per-signal confidence with weighted aggregation, several "not enough data yet" thresholds, well-shaped quantified-gap UI copy) and **completely absent at the LLM call sites** (no validation, no schema, no grounding checks, no refusal fallback, source attribution in but not out). The agent layer's confidence work is **mostly extension of existing primitives** (source enums, KoastSignalBar, AutoApplyChecklist patterns, `[not set]` template-render ergonomic, `generateGuestReviewFromIncoming` prompt framing) **plus net-new infrastructure** at the LLM boundary (schema enforcement, grounding checks, "let me find out" capability, structured three-modes output). The biggest single calibration debt is the dashboard pulse metric mocked sparkline; the broader debt is point-estimate dollar amounts surfaced without confidence bands. Voice register is largely fine — the codebase already follows Belief 5's "name the gap, decline to fabricate" doctrine in empty-state copy; extending it consistently to the agent's output is the work.
