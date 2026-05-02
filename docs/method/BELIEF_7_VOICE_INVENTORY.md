# Belief 7 — The Host's Voice Inventory

*Belief: "The host's voice." — Mode 1 (host's own voice, learned from existing messages) or Mode 2 (neutral host-approved tone). Voice is learned from observation, corrected through use, inspectable. The host chooses the mode.*

This is the final Method investigation, focused on voice as a host-scoped, learnable property of agent communication. Voice doctrine (DESIGN_SYSTEM.md §15, the four LLM prompt patterns, no-emojis rule) was already covered in Belief 5 — this report doesn't re-cover it. Investigation only. No code changes.

Verified against the live Supabase DB on 2026-05-01 (row counts inline). Cross-references Beliefs 1-6.

---

## 1. Message data available for voice learning (Mode 1)

### 1a. Schema and host-author filter

`messages` table (90 rows). Authorship-relevant columns:

| Column | Values | Source |
|---|---|---|
| `direction` | `inbound` / `outbound` (computed) | derived from `sender` in `src/lib/messages/sync.ts:135`, `webhooks/messaging.ts:127`: `sender === 'guest' ? 'inbound' : 'outbound'` |
| `sender` | `guest` / `property` / `system` / future enum widening | from Channex `attributes.sender`, defaults to `'guest'` if absent (`sync.ts:134`, `webhooks/messaging.ts:126`) |
| `sender_name` | hardcoded `"Host"` for non-guest | `sync.ts:146`, `webhooks/messaging.ts:150`, `send/route.ts:101` |
| `platform` | `airbnb` / `booking_com` / `vrbo` / `direct` | mapped from `channel_code` (`abb` / `bdc` / etc.) |
| `ai_draft` | text or null | populated when `/api/messages/draft` runs OR by `messaging_executor.py` |
| `draft_status` | `none` / `generated` / `sent` / `draft_pending_approval` / `discarded` | lifecycle enum |

**Clean host-authored filter**:
```sql
SELECT content FROM messages
WHERE direction = 'outbound' AND sender = 'property'
```

Live distribution:
```
direction | sender   | count | avg_len
outbound  | property |    53 |    176
inbound   | guest    |    37 |     65
```

53 host-authored messages. Avg 176 chars. ~9,300 chars of substrate. Inbound guest messages are shorter (65 chars avg) which fits the "guest asks short, host answers longer" pattern.

**Caveats**:
- `sender_name` is hardcoded `"Host"` — does not preserve actual author identity at human-name granularity. Once multi-user (co-host / VA) lands, this column needs to carry the actor_id, otherwise voice memory will conflate co-host voice into the host's.
- `system` messages are theoretically possible per the Channex enum but none in production. Voice extraction should explicitly filter `sender = 'property'` rather than `direction = 'outbound'` alone.
- `ai_draft` is populated for executor-generated drafts. If the host approves an AI draft as-is, the resulting outbound message's `content` is identical to a previously-set `ai_draft` on a *different* row (the inbound that triggered it). Voice extraction should *exclude* messages where the body matches a recent `ai_draft` — those are Koast's voice, not the host's.

### 1b. Sample messages — is the voice learnable?

Real production samples (PII redacted to first names):

> *"Hi Sam, we have a beach nearby at approximately 2 miles. No beach access directly."*

> *"Hi Sam, 8 minutes/2.5 miles"*

> *"Hi Jessie, hope you're all settled in and enjoying your stay.\n\nIf there's anything you need, please don't hesitate to ask."*

> *"Hello Sam,\n\nThank you so much for booking your stay at our home! We're thrilled to have you and can't wait for you to experience all that our place has to offer..."* (~515 chars)

> *"Hi James!\n\nHope you enjoyed your stay 😊\n\nIf you loved your time here, it would mean the world to us if you could leave a 5-star review..."*

> *"Yes! Feel free to check in. Let me know if you'd like me to resend your check in instructions or if you have any questions, thanks 🙏🏻"*

> *"Hi James! Let me check and get back to you."*

**Voice patterns visible from this sample**:
- Greetings: `"Hi {first_name}"` (default), `"Hi {first_name}!"` (warmer), `"Hello {first_name},"` (more formal — used for the long welcome template). Mixed register on greeting choice.
- First-person plural ("we", "our home", "our place") rather than singular — establishes host identity.
- Contractions throughout (`you're`, `we're`, `don't`, `can't`, `let me know`).
- Emojis present in some messages: 😊 🙏🏻. Note the tension with CLAUDE.md *"No emojis anywhere — UI, AI-generated content, or user-visible SMS bodies"*. The Koast no-emoji rule applies to Koast's own voice; the host's actual voice uses emojis. Voice extraction must observe but not propagate this — Mode 1 should preserve the host's emoji habit; Mode 2 should follow Koast's no-emoji rule.
- Specific operational language: *"approximately 2 miles"*, *"8 minutes/2.5 miles"*, *"the 2 assigned parking spots in the driveway"*. The host is precise and concrete.
- "I'll check and get back to you" pattern — when uncertain, defer with a promise. This is the pattern Belief 5 §1 names as honest-confidence and the existing `generateDraft` prompt already prescribes. Real host already speaks this way.
- Templated welcome message. There are **4-5 verbatim repeats** of *"Thank you so much for booking your stay at our home! We're thrilled to have you and can't wait for you to experience all that our place has to offer..."* across different bookings. The host already has manual-paste templates. Voice learning should NOT just promote this template (the agent shouldn't produce verbatim copies); it should learn the *style underneath* (warm, "we"-plural, future-positive).

**Conclusion**: the 53 outbound messages are substantive enough to learn from. Voice signal is real, not auto-text. The corpus is thin (~9,300 chars) — enough to identify patterns, not enough for confident voice modeling without more data accumulation. Voice memory will sharpen over months of real operation.

### 1c. Platform corruption / system noise

- Channex sender enum is `'guest' | 'property' | 'system'`. System messages (booking confirmations, OTA notifications) are possible but absent in the current 90-row sample. Filter on `sender = 'property'` explicitly — not `direction = 'outbound'` — to exclude system noise.
- Airbnb auto-greeting prefixes / signature blocks: not visible in this sample. The Airbnb messaging API delivers the message body without auto-decoration on the read side; on the write side, Airbnb may modify outbound messages (anti-disintermediation filter for phone numbers / emails / URLs — see UnifiedInbox.tsx:450 `EMAIL_RE` regex used pre-send for warning). The captured `content` is what was sent; the host's actual typed voice may have included contact info that was filtered.
- Booking.com auto-text: not visible in the current sample because the test fleet is 1 BDC channel and messages are mostly Airbnb. BDC's API doesn't auto-decorate body content per `MESSAGING_DESIGN.md`.
- `messaging_executor`-generated drafts (where `draft_status='draft_pending_approval'`) need explicit exclusion: they're host-approved-but-not-host-authored. In production today, 0 messages have `draft_status='draft_pending_approval'` because the executor hasn't fired. When it does, voice extraction must filter them out.

### 1d. Other host-authored text

Beyond `messages.content`:

| Source | Live data | Substrate quality |
|---|---|---|
| `guest_reviews.draft_text` (host's outgoing review draft) | 0 rows populated in production | None today |
| `guest_reviews.final_text` (host's approved/edited review) | 0 rows in production | None |
| `guest_reviews.response_final` (host's response to incoming review) | 1 row, 188 chars | Marginal |
| `guest_reviews.response_draft` (LLM draft of response) | 0 rows | None — and this is Koast's voice anyway |
| `guest_reviews.private_note` (host's private guest note) | mostly null | Marginal |
| `property_details.house_rules` | NULL (0 rows in production) | None |
| `property_details.special_instructions` | NULL | None |
| `property_details.local_recommendations` | NULL | None |
| `properties` description / amenities | none stored | None |
| `bookings.notes` | mostly null | None |
| Listing copy on OTAs | not stored in Koast | Would require Channex listing-content API integration (greenfield per Belief 6 §3.6) |

**Net corpus available for Mode 1 voice learning today**: 53 messages × ~176 chars + 1 review response × 188 chars ≈ **9,500 chars**. Single host. Single property family. Thin.

### 1e. Sub-conclusion §1

The substrate is **clean and learnable but thin**. The filter is well-defined (`direction='outbound' AND sender='property'` minus `draft_status IN ('draft_pending_approval', 'sent')` to exclude executor-generated drafts that were approved without edit). Voice patterns in the existing 53 messages are real — warm-direct-precise register with the host's emoji habit and "we" first-person plural and "I'll check and get back to you" honest-confidence pattern. Volume per host (~9.5k chars) is adequate for shape but not for confident generation. Voice extraction should pre-allocate scoping (host_id + optional property_id) but defer per-property variation until corpus per property exceeds ~5,000 chars — which Villa Jamaica + Cozy Loft are not yet at.

---

## 2. Existing voice-learning scaffolding

### 2a. Voice-extraction code today

**None.** A `grep -rn "voice|style.*pattern|tone.*learn|voice_pattern" src/` returns empty. There is no code today that processes message archives to extract style patterns, vocabulary, cadence, sign-off, greeting register, sentence-length distribution, emoji frequency, contraction rate, first-person plurality, or any voice-shaped property.

The closest existing "extract from message archive" code is `messaging_executor.py:render()` which does **template variable substitution** against booking + property + property_details. That's not voice extraction; it's parameterized rendering of the host's pre-written templates. The voice in those templates is the host's only insofar as the host wrote/approved the template — which is exactly the corpus voice memory should be reading from anyway.

### 2b. Architectural precedents that extend cleanly

**The strongest precedent is `pricing_rules.source='inferred'` + `inferred_from` JSONB** (Belief 3 §1a). The shape:

```
pricing_rules
  source: 'defaults' | 'inferred' | 'host_set'
  inferred_from JSONB: {
    row_count, date_range: { from, to },
    percentiles: { p10, p50, p90 },
    daily_delta_p95,
    channels_sampled: [...],
    computed_at: ISO timestamp
  }
```

A `voice_patterns` table could mirror this almost exactly:
```
voice_patterns
  host_id (and/or property_id NULLABLE for per-property override)
  source: 'defaults' | 'inferred' | 'host_set'
  patterns JSONB: {
    greeting_style, sign_off_style, emoji_use, contraction_rate,
    first_person_register, sentence_length_distribution,
    common_phrases, formality_score, ...
  }
  inferred_from JSONB: {
    message_count, date_range, message_ids_sampled,
    platforms_sampled, computed_at
  }
```

The architectural template is mature — the algorithmic content (what counts as a "pattern", how to extract it from text, how to express it back to a generation prompt) is the greenfield part.

**The `learnedDow` pattern** (Belief 3 §1b, recompute every engine run from raw outcomes) is a cheaper variant: skip persisting voice patterns; recompute from message archive on each LLM call. Costs: latency + compute per call. Benefits: no schema, no extraction worker, no decay logic. Probably the wrong trade-off for voice (extraction is more expensive than computing a DOW conversion bucket) but worth noting as a precedent shape.

### 2c. Embeddings / vector / similarity infrastructure

**Zero.** Comprehensive grep across `src/` for `embedding`, `Embedding`, `vector`, `pgvector`, `cosine`, `similarity_score`, `openai`: no functional matches. No `pgvector` extension in Supabase migrations. No OpenAI SDK in `package.json` (only `@anthropic-ai/sdk`). No semantic-similarity functions anywhere.

This means voice fingerprinting today would either:
- Be handcrafted feature extraction (string-level patterns, no embeddings) — works for shallow voice signals (greeting, sign-off, emoji frequency) but misses semantic register.
- Require introducing an embeddings stack — OpenAI / Anthropic / Voyage embeddings + pgvector or external vector DB. Greenfield.

The Method's bar (*"Voice is learned the way a human assistant would learn it: by reading hundreds of messages the host has actually sent, picking up patterns, getting corrected occasionally"*) suggests the LLM itself is the extraction engine — pass a sample of messages into an extraction call, return structured voice patterns, persist them. No vectors needed for that path.

### 2d. Sub-conclusion §2

Voice-learning infrastructure is **fully greenfield**. The architectural template (`source`/`inferred_from` shape from `pricing_rules`) extends cleanly. Embeddings are absent and probably not required if the LLM-as-extractor path is chosen. The first-cut voice extraction is conceptually small: query messages → pass to an extraction prompt → store JSONB patterns → use the patterns to instruct generation prompts. That's three new pieces (extraction worker, schema, generation-prompt parameterization), and all three precedents exist nearby (`pricing_validator.py` worker shape, `pricing_rules` schema shape, `review_rules.tone` prompt parameterization).

---

## 3. Voice-correction loop substrate

### 3a. Reviews — the diff IS preserved

Reviews schema has **two-stage capture by design**:

| Column | What it holds |
|---|---|
| `guest_reviews.draft_text` | LLM-generated draft (`generateGuestReview` output) |
| `guest_reviews.final_text` | Host's approved-and-submitted text (after any edits) |
| `guest_reviews.response_draft` | LLM-generated response (`generateReviewResponse` output) |
| `guest_reviews.response_final` | Host's approved-and-published response |

When the host edits a draft before approving, both columns are populated independently. The diff `(final - draft)` is the voice-correction signal. Live data: 1 of 13 reviews has `response_final` populated (188 chars). `draft_text` is mostly empty in production because review_rules has 0 rows and most reviews haven't been generation-flowed yet.

**For reviews, voice correction is architecturally ready** — needs only the data accumulation. When the agent ships and reviews flow through it, every host edit becomes signal.

### 3b. Messages — the diff is NOT preserved

The send route (`src/app/api/messages/threads/[id]/send/route.ts:91-114`) inserts a new outbound `messages` row with:
- `content` = the host's final body (whatever was in the composer at send time).
- `ai_draft` = NOT set on the outbound row.
- `host_send_submitted_at`, `host_send_channex_acked_at`, `sent_at` = timestamps.

The original LLM-generated draft (when one existed) lives on a *different* row — the inbound message that triggered the draft (`messages.ai_draft` populated by `/api/messages/draft`). There is **no link between the outbound row and the draft that preceded it.** When the host edits a draft and sends, the route doesn't:
1. Look up the most recent `ai_draft` on the same thread.
2. Compute `content !== ai_draft` (was it edited?).
3. Persist either `original_draft` on the outbound row or an `edits` table row capturing the diff.

For executor-generated `draft_pending_approval` drafts, the situation is worse: the draft IS already a `messages` row (`draft_status='draft_pending_approval'` with `ai_draft` populated). When the host clicks Approve & Send (`UnifiedInbox.tsx:351 approveDraft`), the code reads the body from `draftMsg.ai_draft ?? draftMsg.content`, sends it via `/api/messages/threads/[id]/send`, and then the same row is flipped to `draft_status='sent'` (UnifiedInbox.tsx:368). **Crucially**: if the host edits the body in the textarea before clicking Approve, the edited text goes — but `ai_draft` is preserved (so a `content !== ai_draft` comparison would work). For executor drafts, the diff IS extractable today; just not extracted.

For `/api/messages/draft`-generated drafts (host clicks "Draft" on an inbound), the draft is on the inbound row's `ai_draft`. The outbound is a new row with no link. Diff extraction for this path requires either:
- A new `original_draft` column on outbound rows captured by the send route.
- A new `messages_drafts` table that stores `(thread_id, draft_text, generation_source, used_in_outbound_id, edit_distance, created_at)`.

### 3c. Pricing override — implicit diff

Pricing has a different shape: the host's correction is implicit in the `pricing_recommendations.status` flip (`pending → applied`/`dismissed`) plus `pricing_outcomes.suggested_rate vs applied_rate`. The diff isn't text — it's numeric — but the signal is captured cleanly. The override route (`src/app/api/pricing/override/[propertyId]/route.ts`) accepts `dates + rate` and writes via `engine.overrideRates()`. The engine's previously-suggested rate vs the host's typed rate is recoverable post-hoc by joining `calendar_rates` (`suggested_rate` vs `applied_rate`).

`pricing_recommendations.reason_signals.clamps.guardrail_trips` audit JSONB (Belief 5 §3a) records "engine wanted X, rules clamped to Y" — a different kind of correction (rules-mediated, not host-mediated) that's already structured.

### 3d. Calendar bulk-edit confirm modal

`BulkRateConfirmModal.tsx` shows a diff before commit ("Base rate updates apply to Koast's pricing engine only..."). The diff is a UX surface (the user reviews changes before confirming) but isn't persisted as a "host edited the engine's proposal" record. The post-commit state is just calendar_rates with new values.

### 3e. Sub-conclusion §3

**Reviews**: diff preservation architecturally complete (`draft_text` + `final_text` columns), production data thin (1 row populated). When the agent ships, every review edit becomes correction signal automatically.

**Messages**: diff preservation **partially possible for executor-drafts** (`ai_draft` + `content` on the same row, comparison trivial) and **fully greenfield for inbound-LLM-drafts** (original draft on inbound row, sent body on outbound row, no link captured). Architectural work to enable: either add `original_draft` on outbound rows (+ link from send route), or add a `message_edits` table (composer state on Approve, sent body on send, diff computed async). Both are small.

**Pricing**: implicit diff already captured at the recommendation status + outcomes level. Useful but not text-shaped — won't directly help voice but will help operational-decision-pattern memory.

The voice-correction loop's near-term work: (a) wire executor-draft `ai_draft` vs `content` comparison in the send/approve path (small), (b) add inbound-draft → outbound-edit link (medium), (c) consume reviews `draft_text` vs `final_text` for review-voice signal (already there, just needs a reader).

---

## 4. Mode 2 (neutral host-approved tone) scaffolding

### 4a. Existing tone presets

**`review_rules.tone`** is the only "tone preset" in the codebase. Defined at migration `004_reviews.sql`:
```
tone text DEFAULT 'warm' CHECK (tone IN ('warm', 'professional', 'enthusiastic'))
```

UI: `ReviewsSettingsModal.tsx:115` exposes the dropdown with the 3 options. Per-property scoped (one row per property in `review_rules`). Live: 0 rows populated.

`generateGuestReview` prompt parameterizes `${rule.tone} in tone` (`reviews/generator.ts:61`). The other 3 review prompts don't read it.

That's the entire tone-preset infrastructure today.

### 4b. Other prompt parameterization

**Messaging draft**: not parameterized. The system prompt at `messaging.ts:67-71` hardcodes *"You are a friendly, professional short-term rental host assistant for {property.name}..."* + *"Respond warmly and helpfully."* Tone is a string baked into the prompt; no field accepts host-chosen register.

**`generateReviewResponse`**: branches by rating category (positive/mixed/negative) — not by host-chosen tone. The `rule.tone` field is read but not used in the system prompt.

**`generateGuestReviewFromIncoming`**: branches by `ratingTone` (computed from `incoming_rating >= 4`) and `flagged` (private feedback flag) — neither is a host-chosen tone.

So the prompts mostly hardcode their voice instructions. `review_rules.tone` is the one parameterization point and only `generateGuestReview` honors it.

### 4c. Default templates as a Mode 2 starting register

`src/lib/onboarding/default-templates.ts` ships 8 stock templates:
1. `booking_confirmation` — *"Hi {guest_name}, Your stay at {property_name} is confirmed!..."*
2. `pre_arrival` (3 days before) — *"Hi {guest_name}, Your trip to {property_name} is coming up in 3 days..."*
3. `checkin_instructions` — *"Hi {guest_name}, here are your check-in details for tomorrow..."*
4. `welcome` (on check-in) — *"Welcome to {property_name}, {guest_name}!..."*
5. `midstay_checkin` (2 days into stay) — *"Hi {guest_name}, just checking in..."*
6. `checkout_reminder` (1 day before checkout) — *"Hi {guest_name}, A friendly reminder that checkout is tomorrow..."*
7. `thank_you` (after checkout) — *"You're always welcome back. Safe travels."*
8. `review_request` — (template request for guest review)

The register is consistent: warm, direct, contraction-heavy, no emojis, *"Hi {guest_name}"* greeting throughout, future-positive sign-offs. **This IS Mode 2's starting voice.** It already follows DESIGN_SYSTEM.md §15 ("Warm, professional. No filler."). It's the curated default register the Method describes — *"warm enough to feel human, efficient enough to respect guests' time, never falling into corporate hospitality boilerplate or AI-detectable repetition."*

The 8 templates can serve as both the message_templates seed (their current job) and as canonical examples that the agent's neutral-mode generation prompts use as voice anchors.

### 4d. Preview / "how would Koast sound saying X" UI

**None.** No preview surface exists for "show me how this voice would express X." The closest UI is:
- `TemplateManager.tsx:67-73` `fillPreview()` — substitutes hardcoded sample values (`{guest_name} → Sarah`, `{property_name} → Beachfront Villa`, etc.) into a template body and renders. Show-the-template-with-fake-data, not show-this-voice-saying-X.
- `BulkRateConfirmModal.tsx` shows pricing diffs — not a voice preview.
- `PendingDraftBubble.tsx` shows a draft with Approve/Discard buttons — preview of one specific generation, not a register preview.

### 4e. Sub-conclusion §4

`review_rules.tone` is a small but real precedent for "Mode 2 voice variants." `DEFAULT_ONBOARDING_TEMPLATES` is the actual canonical Mode 2 starting voice — already shaped, already following the DESIGN_SYSTEM rules, already used in production for new hosts. The messaging prompt isn't parameterized for tone; this is the simplest extension (add a `voice` parameter to `generateDraft`, swap in either the host's learned voice patterns OR the neutral-tone instructions). Preview UI is greenfield.

---

## 5. Host-facing voice inspection surface

### 5a. Current settings/preferences UI

The Settings page (`src/app/(dashboard)/settings/page.tsx`, 758 lines, single monolithic page — Belief 1 §1a) has 8 sections: Profile, Plan & Billing, Channel Manager, Notifications, Connected Accounts, Security, Data & Export, Appearance. **No voice section.** No "tone preferences." No "how does Koast sound."

`ReviewsSettingsModal.tsx` has the per-property review-tone dropdown (`warm`/`professional`/`enthusiastic`) — that's the closest existing "voice preference" UI. It's a select control, not a pattern-introspection surface.

### 5b. Pattern-surfacing precedents

The codebase has a small number of UI surfaces that show "patterns derived from your data":

| Surface | Pattern | File |
|---|---|---|
| Pricing rules header | `"Koast inferred these from your existing pricing history. Tweak anything — your changes always win."` | `PricingTab.tsx:780` |
| AutoApplyChecklist | `"14+ days of validation data: X/14 days"` quantified-gap display | `PricingTab.tsx:1224` |
| Reviews dashboard strip | `"30d delta — not enough data"` | `ReviewsDashboardStrip.tsx:192` |
| Dashboard learning-mode opportunity card | `"Koast is learning your rate patterns across X properties and 90 forward dates. Once we've captured more channel rates, we'll surface real opportunities here."` | `DashboardView.tsx:693` |
| Pricing audit endpoint | Per-date signal breakdown + auto-apply blockers + rules snapshot — the most "explain what Koast knows" surface in the codebase | `/api/pricing/audit/[propertyId]?date=` |

The pattern: **named gap + named source + invitation to correct**. *"Koast inferred X from Y. Tweak anything — your changes win."* This vocabulary generalizes to voice. The voice inspection surface could be:

> *"Koast has read 53 of your messages. Patterns I've noticed: you greet with 'Hi {first name}' (87% of messages), you use first-person plural ('we', 'our home') when describing the property, you use emojis sparingly (3 of 53 messages), you tend toward 100-200 character responses for routine questions. Tweak any of this — your changes always win."*

That's a direct port of the RulesEditor copy pattern to voice. The vocabulary is shipped; the surface is greenfield.

### 5c. Existing pattern-introspection beyond pricing

Outside pricing, there's nothing close. Reviews has the pricing-shaped scorecard (`/api/reviews/analytics/[propertyId]`) but no "voice patterns we noticed about your reviews." Calendar has bookings + rates view but no "your guests usually book N days ahead" insight surface. The Dashboard has insight cards (`/api/dashboard/actions`) but they're action-shaped, not pattern-shaped.

### 5d. Sub-conclusion §5

Voice inspection UI is **fully greenfield as a surface** but the **vocabulary already exists** in the pricing rules editor's "Koast inferred these from your existing pricing history. Tweak anything — your changes always win." copy. Place a voice section in Settings (or as a tab in the future agent's preferences surface), use the pricing-rules-editor copy pattern, render a JSON-shaped voice_patterns row as human-readable bullets. The greenfield work is the surface, the renderer, and the underlying voice_patterns table populated by the extraction worker.

---

## 6. Per-property or per-context voice variation

### 6a. Codebase signals about per-property voice need

| Signal | Suggests per-property variation? |
|---|---|
| `review_rules.tone` is per-property (FK to property_id) | YES — review tone variation already modeled per property |
| `message_templates.property_id` FK (per-property templates) | YES — message templates are per-property |
| `property_details.special_instructions` (per-property text) | Marginal — operational context, not voice |
| Properties in the test fleet: Villa Jamaica + Cozy Loft (same parcel, same operator) | NO — same host, same property family, no register diversity expected |
| 53 outbound messages across the test fleet | All from one host, mostly Airbnb | NO observable register diversity in production |
| `properties.property_type` enum (`entire_home`/`private_room`/`shared_room`) | Maybe — a shared-room host might write differently than an entire-home host, but not differentiated in code |
| Multi-tenant host scenarios | `properties.user_id` is single-tenant; no co-host model | NO — multi-user is greenfield (Belief 6 §1.9) |

The schema is **scoping-pre-allocated** for per-property review tone via `review_rules.property_id`, and per-property templates via `message_templates.property_id`. Neither has any production data. There is no current evidence of multi-brand-register hosts in the fleet, and the existing 53 messages don't show register diversity within the host's own corpus.

### 6b. Method's framing

Belief 7 names this as a future-tense possibility: *"some hosts run luxury vs budget properties and might want different voices per property; some might want different register for new vs returning guests, problem vs routine messaging."* Then explicitly notes *"At v1 we collapsed this to 'one chosen mode (host's voice OR neutral)' without per-context variation."*

Single-voice-per-host with situational register adjustments handled inside one prompt is the right v1. The schema should pre-allocate per-property scoping (`voice_patterns.property_id NULLABLE`, where NULL means host-default and a non-NULL row overrides for that property) so per-property voice can land later without migration. This is the same shape `review_rules` already uses.

### 6c. Situational register adjustments

The prompts can already do situational register inside a single voice mode. `generateGuestReviewFromIncoming` (Belief 5 §1d) demonstrates: branching by `ratingTone` (positive vs neutral-to-critical) and `flagged` flag, with explicit bias rules per branch. The same shape extends to messaging: branching the system prompt by message_kind (problem-report vs routine-question), guest_relationship (returning vs first-time), urgency (now vs ahead-of-time). All of that lives inside one voice mode.

The Method's framing — *"different register for problem vs routine"* — is an in-prompt branching concern, not a new voice mode. Single-voice-per-host with prompt-level situational branching is sufficient for v1.

### 6d. Sub-conclusion §6

Single-voice-per-host is the right v1 simplification. Schema should pre-allocate per-property override scoping (mirror `review_rules.property_id`). Situational register (problem vs routine, returning vs first-time) is in-prompt branching, not a new voice mode — `generateGuestReviewFromIncoming` is the working precedent. Production data shows zero need for per-property voice diversity today; defer until multi-brand hosts surface.

---

## 7. Keep / extend / greenfield

### Keep — shipped infrastructure the voice layer reuses

1. **DESIGN_SYSTEM.md §15 voice doctrine** + CLAUDE.md no-emojis rule + KOAST_PRODUCT_SPEC.md "professional tone." Already covered in Belief 5; consolidate into a voice doc the agent reads at runtime. Confidence: high.
2. **`generateGuestReviewFromIncoming` bias-rules prompt structure** — *"Honest, not performatively warm. Never fabricate specifics. Bias rules: 5★ → warm/brief; 3★ or below → neutral/factual; do not invent positive details."* This is the strongest existing prompt-level voice framing AND demonstrates situational register inside one voice mode. Reusable as a template for the agent's messaging prompts. Confidence: high.
3. **`review_rules.tone` enum + ReviewsSettingsModal dropdown** — the only "tone preset" UI in the codebase. Per-property scoping precedent. Generalize to host-level voice mode setting (Mode 1 vs Mode 2) plus per-property override. Confidence: medium-high.
4. **`DEFAULT_ONBOARDING_TEMPLATES`** — 8 stock templates already shaped to Mode 2's neutral-warm-direct register. Use as voice anchors for Mode 2 generation prompts AND as the host's first-pass templates if they don't yet have their own corpus. Confidence: high.
5. **`pricing_rules.source='inferred'` + `inferred_from` JSONB pattern** — the architectural template for `voice_patterns.source` + `inferred_from`. Reuse the migration shape, the source enum vocabulary, the JSONB audit metadata. Confidence: high.
6. **Reviews `draft_text` + `final_text` two-column diff capture** — the existing voice-correction signal preservation pattern. Generalize to messaging by adding `original_draft` (or equivalent) to outbound rows. Confidence: high.
7. **PricingTab "Koast inferred these from your existing pricing history. Tweak anything — your changes always win." copy pattern** — reuse verbatim for the voice inspection surface, with "messages" substituted for "pricing history". Confidence: high.
8. **`pricing_validator.py` worker shape** — read substrate, derive parameters, persist with provenance, log warnings. Voice-extraction worker mirrors this. Confidence: high.
9. **`/api/pricing/audit/[propertyId]?date=` endpoint shape** — per-action explainer with structured breakdown. Generalize to `/api/voice/audit/[hostId]` for the inspection surface. Confidence: medium-high.
10. **Channex `sender = 'property'` filter** — clean host-author identification. Stable. Just exclude `draft_status IN ('draft_pending_approval', 'sent')` where the body equals a recent `ai_draft` to avoid learning Koast's voice as the host's. Confidence: high.

### Extend — close-enough but narrow

1. **`messaging.ts:generateDraft()` prompt is unparameterized.** Extend with a `voice` parameter equivalent to `generateGuestReview`'s `rule.tone`, but richer (accept the structured `voice_patterns` JSONB or a Mode 2 sentinel). Then: hand the prompt either Mode 1 (host's learned patterns) or Mode 2 (neutral-tone bias rules in the style of `generateGuestReviewFromIncoming`). Confidence: high.
2. **`review_rules.tone` 3-option enum is too coarse for the agent's voice scope.** Extend to a host-level `voice_mode` enum (`mode_1_host_voice` / `mode_2_neutral` / `inferred`) on a new `host_voice_preferences` row, with the per-property override slot inheriting the schema shape. Confidence: medium-high.
3. **Send route's lack of `original_draft` capture on outbound messages.** Extend the send route to: (a) look up the most recent `ai_draft` on the same thread, (b) if `content !== ai_draft`, persist the original draft on the outbound row (or in a new `message_edits` table). The diff-extraction worker reads this asynchronously. Small change with large signal yield. Confidence: high.
4. **`UnifiedInbox.approveDraft` flow already has both `ai_draft` and the host's edited body in scope.** Today line 353 reads `body = (draftMsg.ai_draft ?? draftMsg.content ?? "").trim()` — the executor draft body. If the host edits the textarea before clicking Approve & Send, the textarea state isn't currently captured. Extend to record the textarea state in `composers[threadId]` at Approve time and post both `original_draft` + `final_body` to the send route. Confidence: high.
5. **`fillPreview()` template-rendering function** in `TemplateManager.tsx`. Extend to "voice preview" — render a sample message in the host's voice mode for inspection. The infrastructure is half there; the substitution map is hardcoded ({guest_name → Sarah}, etc.) and would need a "voice mode" switch. Confidence: medium.

### Greenfield — nothing close exists

1. **`voice_patterns` table** — host-scoped + property-scoped (NULLABLE) + JSONB patterns + JSONB inferred_from + supersession history. Mirrors `pricing_rules` shape but with text-pattern content. Confidence: high.
2. **Voice-extraction worker** — reads message archives, runs an extraction prompt against the LLM (or builds handcrafted features), persists `voice_patterns` rows. Hourly or daily cadence. Mirrors `pricing_validator.py`. Confidence: high.
3. **Voice-inspection UI** — Settings tab or dedicated voice page that reads `voice_patterns` and renders human-readable bullets. Borrows pricing-rules-editor copy pattern. Confidence: high.
4. **Voice-preview UI** — "How would Koast sound saying X in your voice / in neutral mode?" Side-by-side rendering of the same message in both modes. No precedent in the codebase. Confidence: high.
5. **Voice-correction loop** — extraction worker reads `draft_text vs final_text` (reviews) and `original_draft vs content` (messages, after the §extend work) and updates voice patterns based on the diff. Mirrors the pattern-from-substrate worker but with feedback signal. Confidence: high.
6. **Voice mode switch in agent system prompts** — when the agent generates outbound text, it consults the host's `voice_patterns.source` and inlines either host-voice patterns or Mode 2 neutral-tone instructions. Greenfield prompt engineering. Confidence: high.
7. **Cold-start voice handling** — new host with <N messages of substrate. Mode 2 default. Surface "Koast hasn't read enough of your messages yet — using neutral tone for now. We'll switch to your voice once we've seen at least N messages." Mirrors PricingTab `AutoApplyChecklist` "14/14 days" pattern. Confidence: high.
8. **Multi-actor voice attribution** (when multi-user lands per Belief 6 §1.9). Today `sender_name` is hardcoded "Host" for any non-guest sender; the column needs to carry actor identity so co-host A's voice doesn't get conflated with host B's. Greenfield once the multi-user model exists. Confidence: high.
9. **Embeddings-based voice fingerprinting** — optional path. If voice patterns aren't captured well by handcrafted features + LLM extraction, embeddings + similarity search become useful. Greenfield: requires an embedding stack (none today) and a similarity-search index. Confidence: medium (greenfield-ness high; necessity low — the LLM-as-extractor path is probably sufficient for v1).

### Sub-conclusion §7

Voice work decomposes cleanly. The doctrine layer is shipped (Belief 5 inventory). The architectural template (`pricing_rules.source` + `inferred_from`) is shipped and extends 1:1. The Mode 2 starting register (`DEFAULT_ONBOARDING_TEMPLATES`) is shipped. The diff-capture half-pattern is shipped (reviews `draft_text` / `final_text`). The greenfield work is roughly: 1 new table + 1 new extraction worker + 1 new inspection UI + 1 prompt parameterization + 1 send-route extension to capture diffs. The greenfield work is comparable in scope to the per-Belief work for memory (Belief 3) — much smaller than the chat surface (Belief 2) or direct-booking subsystem (Belief 6 §3.1).

---

## Headline

The host's voice is the cleanest greenfield-on-existing-precedent in the seven Beliefs. The substrate is **clean and learnable** (53 host-authored messages with real voice signal, sender-filter well-defined, platform corruption manageable) but **thin** (~9.5k chars per host today; sharpens with months of accumulated operation). The architectural template for voice memory is already in the codebase as `pricing_rules.source='inferred'` + `inferred_from` JSONB; the cleanest extension is to mirror that shape into a `voice_patterns` table with host_id + nullable property_id scoping. The Mode 2 register is already shipped as `DEFAULT_ONBOARDING_TEMPLATES`. The diff-capture pattern is already shipped for reviews and is half-shipped for executor-drafts in messages (extending to inbound-LLM-drafts is a small route-level change). The voice inspection surface is greenfield UI but the vocabulary is shipped (PricingTab's "Koast inferred these from your existing pricing history. Tweak anything — your changes always win." copy ports verbatim with "messages" substituted for "pricing history"). Per-property voice variation is correctly deferred to v2 — the schema should pre-allocate the scoping (`voice_patterns.property_id NULLABLE`) but production data shows zero current need. With Beliefs 1-6 mapped, voice is the lowest-cost-per-impact piece left; ship it after the agent loop (Belief 2) and memory layer (Belief 3) exist — at that point voice slots in beside them as a typed memory category, fed by an extraction worker, instructed into the agent's generation prompts, surfaced in an inspection panel.
