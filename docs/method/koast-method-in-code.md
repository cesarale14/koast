# The Method in Code

*Working draft — substance complete, will be refined as the work progresses.*

---

## What this document is

The Koast Method describes what we are building. This document describes how we will build it.

It is the bridge between the Method's seven Beliefs and the engineering work each Belief implies. For every Belief, it answers four questions: what does this Belief require to be true, what is the minimum viable version, what fills in over time, and what architectural commitments must be right from day one. It synthesizes those answers into a coherent phasing — what ships first, what ships next, what depends on what — and names the specific pre-launch fixes that are not architectural work but must ship before Koast launches honestly.

The audience for this document is in this order: us (the team building Koast), future Claudes and future hires (so they can step in without losing the thread), and eventually our investors and serious partners (so they understand that the Method is buildable, not aspirational). Unlike the Method itself, this document is not customer-facing. It is technical, specific, and honest about gaps. It uses the codebase's vocabulary because the work happens in the codebase.

The document is organized in three layers. First, the foundation Beliefs map (the seven Belief-by-Belief mappings, each with its four answers). Second, the cross-cutting architecture (the non-negotiable commitments that span multiple Beliefs). Third, the phasing (how the work sequences, what depends on what, what ships when).

The grounding for everything in this document is the seven inventory investigations conducted against the actual koast codebase, saved at `~/koast/docs/method/BELIEF_*_*_INVENTORY.md`. When this document makes specific claims about what exists in the codebase or what needs to be built, those claims are grounded in those investigations rather than in speculation.

---

## Operating principles for the work

A few principles shape how the work proceeds, surfaced from the investigations and our session work.

**Erase legacy, build fresh.** Where existing code or schema was built for a different product than the one the Method describes, the right move is to deprecate cleanly and rebuild from zero. Retrofitting legacy carries the assumptions of the original purpose into the new architecture, where they leak everywhere and become invisible later. The cost of clean rebuild is paid upfront; the cost of retrofitting compounds forever.

**Extend existing patterns where they fit.** The pricing engine has already established Method-quality patterns inside its narrow domain — structured memory with provenance, confidence-weighted aggregation, data-sufficiency thresholds, source attribution. The agent layer extends these patterns to the rest of the system rather than inventing parallel ones. The team has the agent thinking already; it is just concentrated in one part of the system, and the work is generalizing it.

**Ship architectural commitments at v1, even if visible features are thin.** The seven Beliefs each carry "non-negotiable architectural commitments" that must be present from day one. These are the seams that let the product grow without rewriting itself. Visible features can be sparse at launch; architecture cannot be retrofitted. When forced to choose between feature breadth at v1 and architectural depth at v1, depth wins.

**Defensive infrastructure carries forward unchanged.** The codebase has scar tissue from real incidents — the BDC-clobber-incident response, the env-gate model, safe-restrictions, atomic Channex operations. These are non-negotiable carry-forwards. The agent layer flows through them; it does not bypass them. Institutional memory of why specific safeguards exist is the kind of thing that gets lost in architecture transitions if not held carefully.

**Calibration debt is paid before launch, not deferred.** Some specific items in the codebase today produce fabricated or misleadingly-confident host-facing output. These are not architectural commitments and they cannot wait for the agent layer. They ship fixed before the Method-shaped product launches, because the Method commits to honest confidence and a fabricated hero chart contradicts the commitment from the host's first session.

---

## The foundation Beliefs map

### Belief 1: Koast is the agent, not the tool.

**What this Belief requires to be true.**

Configuration is the exception, not the default. Most things hosts currently configure should be learned through conversation and structured memory instead. Hosting knowledge lives in structured memory scoped to entities (properties, guests, vendors), not in form fields and settings pages. The agent applies learned knowledge automatically when relevant, retrieving from memory in the moment of need rather than firing pre-configured automation rules. Things that genuinely should be configuration — bank accounts, tax IDs, regulatory artifacts, OTA credentials, legal entity info — remain configuration cleanly separated from learned state.

For this to be true in code, the agent layer has to exist as the operational substrate. The current 2-call-site LLM surface (`messaging.ts:generateDraft` and three review-generation functions) expands into an integrated agent loop with conversational context, tool dispatch, multi-turn reasoning. The 11 config tables identified in the inventory get clean dispositions: stable infrastructure (kept as configuration), should-become-memory (transformed and migrated), or deprecated (retired with migration plans where any data exists).

**The minimum viable version.**

At least one substantial workflow moved from config-shaped to conversation-shaped. The strongest candidate is property knowledge — hosts teach Koast property quirks through chat (the hurricane door, the dishwasher trick, the AC drain), facts get extracted into structured memory, applied to guest interactions automatically. The chat surface exists as the entry point for at least this use case. The empty config tables are either populated through conversation patterns or marked for deprecation; nothing sits as ghost UI in the product.

Honest framing in the product: wherever configuration still exists, it is framed as "this lives in your settings because it should be stable" — not as the default mode of using Koast. The host's primary interaction is conversational; configuration is the named exception.

**What fills in over time.**

The full LLM-surface-to-agent expansion: the agent operates across all infrastructure-ready substrate categories, can hold conversational context across long timeframes, can call into existing capabilities through the structured tool layer. Most current config surfaces transform or retire as their conversational equivalents mature. The deprecation work for legacy config tables completes — anything not "stable infrastructural setting" gets either migrated to memory or formally deprecated.

**Architectural commitments from day one.**

The data model supports structured memory as a first-class concept, designed alongside the existing schema as a peer system rather than tacked on later. New tables, designed for the agent-first model with the right primitives (entities, facts, relationships) and provenance metadata. The agent layer is designed to compose existing capabilities, not duplicate them — when the agent decides to push a rate to Channex, it calls the existing pricing apply path; when it sends a message, it goes through the existing messaging substrate. The agent is the composition layer; the existing operational systems are the execution layer. Configuration that remains is cleanly separated from learned state in a clearly distinct part of the data model. The 11 legacy config tables are either kept (as configuration), transformed (into structured memory), or deprecated — no retrofitting, no "evolution" of schema into something it was not designed for.

**Codebase grounding.** The 11 config tables in BELIEF_1_CONFIG_INVENTORY.md break down as: 6 stable infrastructure (`properties` partial, `user_subscriptions`, `property_channels`, `channex_room_types`, `channex_rate_plans`, `ical_feeds`, `cleaners`), 1 hybrid (`pricing_rules` — keep safety wrapper, memory-back values), 1 should-become-memory (`property_details`), 4 deprecate (`message_templates`, `review_rules`, `user_preferences`, `message_automation_firings`). All four of the deprecated tables are empty in production today, which makes the deprecation work straightforward.

---

### Belief 2: Conversation is the spine.

**What this Belief requires to be true.**

The chat is the primary interaction surface, omnipresent across views — pinned to every screen, summonable from anywhere. Tabs above the chat (Dashboard, Calendar, Messages, Properties, and others as the host's operation grows) are peer surfaces where the host inspects directly when they want to see something rather than ask. The chat is a rendering surface for inline interactive artifacts, not just text and buttons — calendars, property cards, comparison views, editable drafts, photo galleries, all rendered in context. Two foregrounding modes: chat-default and orb-mode. The experiential bar is high: streaming responses, motion, crafted visualizations, considered voice — comparable to Claude or Cursor.

For this to be true in code, an agent loop with streaming output exists. A persistent chat surface is integrated into the app shell (a layout slot, not a route). A streaming infrastructure delivers token-level response text and event-level tool-call updates. An artifact registry and rendering frame let the agent declare "render this artifact type with this data" and have it appear inline. Real-time delivery of agent progress to the frontend exists. The frontend's app shell is reorganized to reserve chat real estate without disrupting existing page surfaces.

**The minimum viable version.**

One chat surface, persistent, in the app shell. A bottom-anchored chat bar that expands to full surface on tap, present on every route, with both mobile and desktop layouts reserving the slot from day one. An agent loop capable of at least three things well: answering questions about the host's operation, executing a small set of operational actions (rate change, message send, calendar inspection), and learning property-level facts through the Belief 1 example. Token-level streaming for response text. Three to five artifact types implemented in the registry: the calendar-rate-change artifact, a property-knowledge confirmation block, and a guest-message-draft artifact, plus possibly a comp-set comparison view and a property-search results artifact. The orb-mode toggle exists. Voice register at the considered bar — system prompts and response shaping worked through with care.

What is not required at v1: full substrate coverage from the agent, voice input as a real interaction mode, multi-user contexts (cleaner/co-host accounts), sophisticated artifact composition where the agent generates novel artifact layouts for unprecedented requests. A fixed registry of well-built artifact types is enough at v1.

**What fills in over time.**

Voice input as a real interaction mode with the experiential bar voice deserves. Multi-user contexts with permission-scoped chat surfaces per user role. Dynamic tabs that appear and disappear as the host's operation grows. A growing artifact library — every new substrate area introduces new artifact types. Mobile-specific UX refinement around the chat bar's behavior on small screens, the orb's tap targets, gesture handling. Sophisticated context handoff between artifact-mode and conversation-mode with motion-considered transitions. Long-conversation handling with pagination, summarization, context window management.

**Architectural commitments from day one.**

Streaming-first infrastructure. The agent loop is designed around streaming output (Server-Sent Events or websocket-based) from the start. Adding streaming to a non-streaming agent later means rebuilding the request flow, the frontend rendering, and the state model. This is the single most architecturally consequential decision in the Belief 2 work.

The agent layer is a peer to the existing API layer, not buried inside it. The agent gets its own dedicated routes with its own state model, calling into the existing data and operational layers rather than being scattered across them.

The artifact registry is a structured contract, not ad-hoc rendering. When the agent decides to render a calendar artifact, it emits a structured payload that the frontend consumes through a known schema. Artifact components are registered, typed, validated. Doing this loosely creates a system that fights the team forever.

The chat surface is a layout slot, not a route. The frontend's app shell is reorganized so a persistent chat bar exists across every route. This is meaningful frontend work — it touches the layout architecture, mobile responsive behavior, focus management, keyboard and scroll handling. Doing this in v1 is much easier than retrofitting because every page built in the meantime would assume full-screen real estate that does not actually exist.

Tool use is structured from day one. When the agent calls into existing capabilities, calls go through a structured tool-use layer with typed schemas, validation, and error handling. Improvising this leads to the same sprawl problem the legacy config schema represents.

Memory hooks exist in the agent loop, even if memory is thin at v1. The agent's request handling has explicit memory-fetch and memory-write points so memory can deepen without rewriting the agent.

The frontend reorganization happens during/as part of the agent work, not before. The new architecture is built fresh on the polish-primitive foundation, with the new brand applied and the persistent chat layout slot reserved. Reorganizing the frontend without the agent layer being designed yet means reorganizing it twice.

**Codebase grounding.** Per BELIEF_2_CHAT_INVENTORY.md: ~17 polish primitives plus the calendar suite are mature and on-brand, the embed vocabulary (createPortal modals, slide-over drawers, @floating-ui popovers) is proven. The existing `/messages` route stays as the guest-messaging inbox alongside the host-agent chat — they are structurally different surfaces and conflating them imports the wrong protocol into the wrong audience. CommandPalette is a placeholder shell, not an agent surface. Streaming infrastructure is zero today. The 50 supabase.from API routes plus 5 Drizzle routes plus 3 patterns of data flow (RSC prefetch, client fetch, direct Supabase from client) coexist; the agent layer sits alongside this rather than replacing it.

---

### Belief 3: Memory compounds.

**What this Belief requires to be true.**

Koast accumulates structured knowledge that grows with every interaction across four core categories: property memory (operational facts about specific properties, scoped to sub-entities), guest memory (per-guest preferences, history, relationships), voice memory (the host's communication style — covered in detail in Belief 7), and operational memory (the host's decision patterns, vendor reliability, market patterns, decision history). Memory is structured (entity-scoped facts with provenance, confidence, lifecycle metadata), not chat logs with vector search. Memory is the host's asset — fully inspectable, exportable, portable. Memory cannot be transferred at acquisition, copied by competitors, or shortcut with capital.

For this to be true in code, a memory architecture exists with Tier 1 commitments (structured fact extraction, entity scoping, auditability, provenance) from day one. A `memory_facts` table or equivalent with the right primitives. A `guests` table (which does not exist today; guests are implicit columns on bookings). Sub-entity scoping for facts attached to "Villa Jamaica's front door" rather than just "Villa Jamaica." A fact-extraction pipeline that runs against agent conversations. A retrieval abstraction the agent loop calls. A read-side inspection UI where hosts can answer "what does Koast know about Villa Jamaica?" Portability tooling beyond the current two narrow settings buttons.

**The minimum viable version.**

The `memory_facts` table designed and shipped with Tier 1 metadata: entity scoping (host_id, property_id, sub_entity_type, sub_entity_id, guest_id where applicable), attribute, value, source enum (host_taught/inferred/observed), confidence, learned_at, last_used_at, superseded_by, status. Following existing Supabase conventions (snake_case, RLS via property_id→user_id, JSONB for flexible value shapes, timestamptz timestamps, Drizzle declarations matching migrations).

The `guests` table shipped, with back-population from existing booking columns. This is foundational Tier 1 work, not deferrable.

Sub-entity scoping primitive shipped. The schema supports facts scoped to "Villa Jamaica's front door" or "Cozy Loft's dishwasher" — even if v1 only uses this for a handful of canonical sub-entities (front_door, lock, parking, wifi, hvac, kitchen_appliances).

Fact extraction running for at least one conversation surface. When the host teaches Koast something in chat, structured facts are extracted and written. The canonical Method examples (the hurricane door pattern) work reliably.

One retrieval path built and used in production. The strongest candidate is replacing the messaging.ts hard-coded SELECTs with a memory-backed retrieval call. This demonstrates the abstraction works, removes brittle code, gives the team a felt-sense of the new architecture.

An inspection UI shipped at MVP quality. A route showing facts grouped by entity, with provenance and last-used metadata visible. Not pretty yet, but real and host-accessible.

Honest scope of what is not yet learned. The product's onboarding tells the host: "Koast learns as we go. Right now I know your properties' basic info from your platforms. I'll learn the rest from our conversations."

**What fills in over time.**

Confidence calibration based on observed accuracy — which inferred facts have held up, which have been corrected. Contradiction detection and supersession workflows. Decay and refresh logic for facts that go stale (vendor relationships becoming inactive, restaurants closing). Cross-entity inference for patterns that span properties or guests. Voice memory specifically (its own work stream, builds on the same memory primitives — covered in Belief 7). Operational memory at full breadth: vendor reliability, market patterns, decision history, all becoming first-class memory categories. Memory-backed advanced operations (strategic conversations, market analysis, acquisition support). Full export surface with structured formats and migration tooling.

**Architectural commitments from day one.**

Memory schema follows existing Supabase conventions, does not introduce a new paradigm. Snake_case, RLS via property_id→user_id, JSONB for flexible values, timestamptz, Drizzle declarations matching migrations. Doing this natively is much cheaper than introducing a parallel data layer.

Provenance-enum convention extends across all memory writes. Every fact has a source — `host_taught`, `inferred`, `observed`, eventually more. The pattern is already established in `pricing_rules.source` and the lineage enums; memory extends this discipline systematically. No fact lacks provenance. Ever. This is the single most important piece of memory architecture and the one most often skipped in lazy implementations.

The retrieval abstraction is a real contract, not a convenience function. Defined input shape (entity scope, query type, filters), defined output shape (facts with provenance, confidence, freshness), versioned. The agent loop calls this contract; it does not hard-code SELECTs the way `messaging.ts` does today.

Memory writes flow through a single path, not scattered across the codebase. When facts get extracted, they go through one extraction → validation → write pipeline. This pipeline is where confidence assignment, supersession checks, and audit logging happen.

The inspection UI is a first-class surface, not a debug tool. It is host-facing and clears the same quality bar as the chat — considered, polished, navigable. The Method commits to memory being the host's asset; the surface they inspect it through has to be worthy of the claim.

Memory is designed for portability from day one. The fact schema is structured for clean export. Provenance metadata is included in exports. The host can theoretically reconstruct their accumulated knowledge from the export file.

**Codebase grounding.** Per BELIEF_3_MEMORY_INVENTORY.md: existing memory-shaped artifacts are 2 narrow learning loops (`pricing_rules.source='inferred'` with `inferred_from` JSONB audit, and `engine.learnedDow` computed in-memory from `pricing_outcomes`). Substrate today: 90 messages, 16 threads, 90 bookings, 667 calendar_rates, 209 recommendations, 44 outcomes, 13 reviews — rich enough for shape, thin for confident statistical learning at 2 properties. The `pricing_rules.source/inferred_from` pattern is the architectural template that extends 1:1 to the broader memory system. Sub-entity scoping has zero precedent and is greenfield. The `guests` table does not exist.

---

### Belief 4: The control gradient.

**What this Belief requires to be true.**

Different operations carry different stakes (low/medium/high). Routine work runs autonomously once the host's pattern is established. Operational decisions surface initially and become quicker as Koast learns the host's preferences. High-stakes actions always surface for confirmation regardless of how routine. The gradient is learned, not configured — Koast watches host approval patterns and calibrates per host, per operation. Two hosts on Koast do not have the same gradient. For OTA bookings, refunds and bank-touching operations happen on the platforms themselves; Koast does not operate there at all, by API design. For direct bookings via Stripe, Koast applies the host's configured refund and booking rules. The host writes the policy; Koast executes it. The host can always inspect and override the gradient.

For this to be true in code, a unified action-gating substrate exists that all gated operations flow through. A per-host action-pattern store records every approval, dismissal, and modification. A gradient resolver returns confirmation requirements given (host, action_type, payload). A stakes registry classifies action types by their default stakes profile. Content-aware stakes evaluation exists for actions where stakes depend on payload. A "what did Koast do silently" host introspection surface exists. An override surface lets the host adjust autonomy levels per action type. Reversibility windows exist on autonomous actions where technically possible. A cross-worker audit feed unifies all autonomous Koast actions across the system.

**The minimum viable version.**

A unified action-gating substrate, even if narrow. A TypeScript module that exposes `requestAction(host, action_type, payload) → confirmation_required | silent | blocked`, called by the agent's tool dispatcher and by the existing approval lifecycles (pricing_recommendations, messages.draft_status, guest_reviews wrap into the same substrate). The substrate itself is small at v1; what matters is that everything goes through it.

A stakes registry, manually populated for v1. A typed catalog of action types with default stakes (low/medium/high). Not learned at v1; explicitly classified by the team. Examples: rate change <$20 = low, rate change >$20 = medium, send guest message = medium, cancel booking = high, mass message = high, delete property = high.

Per-host calibration substrate, even if calibration logic is minimal. A `host_action_patterns` table records every approval, dismissal, and modification. Calibration logic at v1 can be simple ("this host has approved 10 in a row of this action type with no modification → can become silent"). The calibration sophistication grows; the substrate has to exist from the start.

A `/koast/recent-activity` surface that shows what Koast has done. Reading from a unified action audit feed. Filterable by category, time, autonomy level. The host-facing answer to "what's Koast been up to."

An override surface, simple at v1. A settings surface showing per-action-type current calibration with an "always confirm" toggle. The principle is "the host has visibility and final say"; the v1 implementation just has to make it real.

High-stakes hard floor. Certain action types — cancel booking, delete property, mass message — are flagged in the registry as "never silent." The gradient does not promote them regardless of calibration. Enforced at substrate level.

Reversibility windows where free. For autonomous actions with natural reversibility (a draft scheduled to send in 30 minutes is naturally reversible during that window), the substrate exposes the reversibility. For actions without natural reversibility, the substrate does not fake it.

The `KOAST_ALLOW_*` env-gate pattern extends to gradient features. New autonomous capabilities ship dark, get enabled cautiously per-host, become defaults only after calibration data validates them.

**What fills in over time.**

Sophisticated calibration models — Bayesian updates, decay over time, recovery from corrected mistakes. Content-aware stakes evaluation that is learned rather than rule-based. Anomaly detection — autonomous-by-calibration actions flagged when payload deviates from established patterns. Multi-user gradient with different autonomy thresholds for primary host vs delegated co-hosts vs cleaners. Cross-action-type inference. Sophisticated reversibility with automated rollback flows. Worker-side gradient enforcement — Python workers integrated with the gradient substrate. Autonomy "pulse" — periodic review surfaces where Koast asks "you've been letting me handle X for 3 months silently — want to keep that arrangement?"

**Architectural commitments from day one.**

One action substrate, no fragmentation. Every action that could be gated flows through one TypeScript module. The three existing approval lifecycles (pricing_recommendations, messages.draft_status, guest_reviews) get reframed as instances of the substrate, not parallel systems.

The substrate is host-aware from day one. Even if calibration logic is minimal, the substrate's interface accepts `host_id` and consults per-host data. The shape `requestAction(host, action_type, payload)` is the contract.

The audit feed is unified across all action sources. Frontend API writes, agent tool calls, worker-initiated writes — all log to the same audit feed with the same shape. The current fragmentation (channex_outbound_log, notifications, sms_log, pricing_performance) gets unified into one feed that the host introspection UI reads from.

Stakes are explicit, not implicit. The stakes registry is a real artifact in the codebase — a typed catalog. Adding a new action type means adding it to the registry. Forgetting to classify an action means it cannot be gated.

High-stakes hard floor enforced at substrate level, not at calibration level. A bug in calibration logic cannot accidentally promote a high-stakes action to silent.

Platform-boundary discipline preserved as new financial capabilities ship. When Stripe integration eventually lands, refund operations follow the host's pre-configured policy automatically — but the substrate ensures the policy is applied, not decided. Agent applies policy, host writes policy. Never reversed.

Reversibility is a substrate-aware property. Each action type in the registry declares its reversibility profile (instantly reversible, reversible within window, irreversible). Autonomous actions in the "reversible within window" category surface a notification with a clear undo affordance during the window.

**Codebase grounding.** Per BELIEF_4_GRADIENT_INVENTORY.md: 72 write-method API routes plus 10 Python workers. Pricing routes are the densest cluster. Trigger pattern is overwhelmingly user-initiated; only one autonomous platform-writer (booking_sync pushing availability=0 from iCal). Five confirmation gates total in the entire codebase, all bespoke, no shared primitive. Three approval state machines (pricing_recommendations, messages.draft_status, guest_reviews) become the substrate. Two natural choke points: `channex/client.request()` for OTA-bound writes (~95% of Next.js OTA writes), and `notifications/index.ts` for host-facing alerts. Platform-boundary discipline is correct by absence: zero Stripe code, zero refund/payment_intent/payout/bank-account references in functional code.

---

### Belief 5: Honest confidence.

**What this Belief requires to be true.**

Koast communicates what it knows and what it does not. Three modes for outputs internal to the host's business: confirmed knowledge (plain statement), high-confidence inference (marked but not undercut), active guess (hedge upfront, limitation explicit, next step suggested). For things outside the host's accumulated knowledge — broader market data, weather, industry news — the honest response is "let me find out," with Koast acting to close the gap rather than reporting absence. The host knows their business; Koast does not ask the host questions about their own operation. Voice register: direct, calibrated, action-oriented; not over-apologetic, not vague, not meta. Architecturally: confidence propagates through reasoning, source attribution preserved, hallucination detection active.

For this to be true in code, every LLM call site enforces output schemas with grounding checks. Refusal fallbacks exist. Source attribution flows through reasoning into outputs. A consolidated voice doctrine exists and propagates to all output channels. Calibration debt is fixed before launch. The data-sufficiency threshold pattern from the pricing engine extends to all agent capabilities.

**The minimum viable version.**

One voice document, consolidated. A single living artifact (`docs/voice.md` or similar) that captures: anti-filler rules from DESIGN_SYSTEM.md §15, the `generateGuestReviewFromIncoming` bias rules generalized, the "name the gap, decline to fabricate" empty-state pattern, the three-modes register from the Method (confirmed/inferred/guess) with example phrasings, the "let me find out" replacement for "I don't know." One document. Authoritative. Referenced by every prompt.

Output schema enforcement on all LLM call sites. Zod schemas for `generateDraft`, the three review-generation functions, and every new agent tool call. The model returns structured output (text plus metadata: confidence level, source attributions, hedges, suggested next step). Frontend rendering reads the metadata.

Grounding checks on all LLM-generated text. Before any generated text gets surfaced, a grounding check verifies that named facts appear in the input context. If a generated response contains a property quirk or guest detail that was not in the retrieved memory, the response is rejected and regenerated.

Refusal fallbacks at every LLM call. When the model cannot produce grounded output, the fallback is structured: "Need X to proceed — host, can you provide?" rather than fabrication.

Confidence metadata in agent outputs. Every host-facing output carries a confidence indicator. Not as ugly disclaimers — as structured metadata that the rendering surface translates into appropriate UI treatment.

Calibration debt fixed before launch. The mocked pulse sparkline replaced with real data or removed. Point-estimate dollar amounts converted to bands with confidence indicators. Any other fabricated host-facing data identified and addressed.

Source attribution in agent text outputs. When the agent says "your typical response time is 12 minutes," the rendering shows the source ("from last 30 days of messages").

Data-sufficiency thresholds at every agent capability. Each new agent tool declares: how much data does it need to produce a confident output? Below that threshold, the tool downgrades or defers rather than fabricating.

**What fills in over time.**

Calibration learning loop — tracking which of Koast's hedged claims have been validated vs corrected, refining future hedge thresholds. Hallucination detection that is behavior-based rather than schema-based. Cross-output calibration consistency. Voice doctrine extensions for stakes (a refund-related message has a different register than a check-in message), variations for context. Confidence pulse — periodic surfaces where Koast tells the host "here's where I've been most/least confident this month." Source attribution rendering depth with interactive provenance views.

**Architectural commitments from day one.**

No fabricated data in host-facing surfaces. Period. Calibration debt is paid before launch. Every host-facing visualization or claim has a documented data source; if it does not, it does not ship.

Every LLM call site enforces structured output with grounding checks. No exceptions. The "single-turn plain text with no validation" pattern that exists today is incompatible with Belief 5 and gets retired entirely.

Confidence is propagated structurally, not appended as disclaimer text. Outputs carry typed confidence metadata. The rendering layer reads the metadata and produces appropriate UI treatment. Disclaimers tacked onto the end of responses are anti-pattern.

The data-sufficiency threshold pattern from the pricing engine generalizes to every agent capability. When a new tool ships, it declares minimum data threshold, behavior below threshold, behavior above threshold. No tool ships without these declarations.

Source attribution preserved through reasoning, not stripped. When the agent retrieves memory facts, the source IDs flow through the reasoning chain into the output. The host can always ask "where did you get that?" and get an honest answer.

One voice doctrine, authoritative and referenced. The consolidated voice document is in the repo, referenced by every system prompt, updated when register patterns evolve. Voice does not drift across surfaces.

Refusal fallbacks are first-class agent behavior, not error states. Structured response shape with its own UI treatment.

**Codebase grounding.** Per BELIEF_5_CONFIDENCE_INVENTORY.md: confidence is strong inside the deterministic engine (9 source-marker enums, weighted aggregation, 7 data-sufficiency thresholds, source-attributed reasoning) and completely absent at the LLM call sites (no validation, no schema, no grounding, no refusal fallback). Voice register already follows Belief 5's "name the gap, decline to fabricate" doctrine in empty states. The strongest existing prompt precedent is `generateGuestReviewFromIncoming`'s bias rules ("Honest, not performatively warm. Never fabricate specifics. Do not invent positive details."). DESIGN_SYSTEM.md §15 has anti-filler rules. Two pre-launch calibration debts identified: pulse sparkline (mocked client-side via linear interpolation plus sine wave wobble — most concerning single gap), and point-estimate hero dollar amounts ("+$X potential" surfaced authoritatively without ranges).

---

### Belief 6: The full digital substrate.

**What this Belief requires to be true.**

Koast operates across the full digital surface of running an STR business — guest operations, property operations, pricing and revenue, calendar and inventory, channel management, direct booking, marketing and acquisition, reviews and reputation, staff and team, strategy and growth, reporting and finance — in one relationship, with one accumulated memory, through one conversational interface. The substrate is digital. Where work crosses into the physical or fully-human domain (in-person property visits, on-site emergency response, networking, partnership building), Koast supports but does not operate. The architecture supports the full vision from day one; the surfaces fill in over time. The host who only needs one surface should use a bounded tool; Koast is for the integrated operator. Capabilities the host does not yet need stay invisible.

For this to be true in code, the agent's tool dispatcher exposes capabilities across all infrastructure-ready substrate categories at v1. Memory architecture spans all surfaces — one accumulated knowledge per host, not siloed per capability. The chat surface is the entry point for all categories. The defensive Channex infrastructure is preserved through the agent layer migration. Capability surface visibility is shaped per host. Greenfield substrate categories ship in coherent surfaces when they ship.

**The minimum viable version.**

Agent capability across the five infrastructure-ready substrate categories. Pricing (query, propose, apply, set rules — all gated by Belief 4 substrate). Calendar (read, propose changes, surface conflicts). Channel (read connection state, surface health, propose reconnections). Reviews (draft response, schedule, surface bad reviews for host). Guest messaging (the existing draft pipeline plus agent-driven sending under gradient-gating).

The ~40 tool catalog implemented with structured schemas, gradient-gated, memory-aware. Each tool follows the Belief 4 substrate (one action layer, one audit feed) and the Belief 5 commitment (data-sufficiency thresholds, structured confidence output).

Property operations agent capability scoped to digital coordination. Cleaner notification, turnover scheduling visibility, conflict resolution between guests and turnovers. Maintenance and supply explicitly out-of-scope at v1, framed as "I'll learn this as you teach me."

Read-side strategy and growth. The agent answers questions about the host's operational performance using existing data (revenue, occupancy, channel mix, comp performance, pricing outcomes). Cannot do acquisition analysis or market entry support yet — those require substrate that does not exist.

Honest framing about what is not yet covered. Direct booking, marketing campaigns, staff/team beyond cleaners, deep strategic acquisition support — these are visible as "coming" surfaces or simply absent from the host's interface. The Method's scoping holds: substrate is full at the architecture level; visible interface is shaped to what has actually been built.

Defensive infrastructure preserved. Every agent action that touches Channex flows through the existing safe-restrictions, env-gate, and audit patterns. The agent layer does not bypass operational discipline established by prior incidents.

**What fills in over time.**

Substrate expansion (months post-launch): maintenance request and supply tracking (generalize from cleaning_tasks state machine), listing-content management (exercise the unused Channex API surface for per-channel copy and photos), multi-user model (co-host accounts, VA accounts, vendor accounts, RLS rewrites across the data layer).

Greenfield subsystems (multi-month each): direct booking via Stripe (checkout page, refund-policy applicator, returning-guest discounts, direct outreach, the full subsystem), marketing and acquisition (email sender, segmentation, campaign engine, referral tracking, social publishing), staff and team operations (beyond cleaners, into vendor payments, performance tracking, hiring workflows).

External-data-dependent surfaces: property acquisition analysis (requires MLS or public records data), exit and expansion decisions (requires real-estate market data), OTA policy compliance tracking (requires per-platform dashboard scrapers).

Voice as interaction mode: STT/TTS as a separate work stream after text-mode agent is mature.

**Architectural commitments from day one.**

The agent's tool dispatcher is designed for the full substrate, even if only the ready half is implemented at v1. The contract for "register a tool with the agent" is general enough that direct-booking tools, marketing tools, staff-coordination tools, acquisition tools all fit the same pattern when they ship. One dispatcher, general from the start.

Memory architecture spans all substrate categories from day one, even if the accumulated facts are sparse outside the operational core. The fact extraction pipeline does not have a "this is a pricing fact" or "this is a marketing fact" partition. Facts are scoped to entities, not to substrate categories.

The defensive Channex infrastructure carries forward unchanged. Every Channex-bound write goes through the existing safe-restrictions check, env-gate, audit log, and atomic operation patterns. The agent layer does not get to bypass these for "convenience."

Capability visibility is host-driven, not product-roadmap-driven. The interface shows the host what their operation actually has. UI components check whether the relevant entity types or activity exist for this host, not whether the feature has shipped.

Honest scoping is preserved as new capabilities ship. Each new substrate category that comes online does so with its own data-sufficiency thresholds, confidence calibration, and refusal-fallback behavior. A marketing capability shipping in month nine does not bypass the Belief 5 commitments because "we shipped fast."

Greenfield subsystems ship in coherent slices, not fragmented half-builds.

**Codebase grounding.** Per BELIEF_6_SUBSTRATE_INVENTORY.md: substrate map is bimodal. Three categories infrastructure-ready (pricing, calendar, channel management; reviews also ready). Three partially ready (guest operations ~80%, property operations with cleaning/turnover mature but maintenance/supply greenfield, strategy/growth read-side built). Two greenfield (direct booking entirely zero, marketing/CRM entirely zero). One mostly greenfield with cleaner-shaped sliver (staff/team — cleaners table exists, everything else greenfield). ~40 wrappable agent tools today across the ready half.

---

### Belief 7: The host's voice.

**What this Belief requires to be true.**

Two modes: Mode 1 (the host's own voice, learned from existing messages) and Mode 2 (a neutral host-approved tone — friendly, direct, not corporate, not repetitive). The host chooses which mode fits them. Both clear the same quality floor: communication that does not sound like generic AI, does not repeat itself, treats guests as people not ticket numbers. Voice is learned from observation, not configured. Voice is corrected through use — host modifications to drafts become signal that converges the agent's voice toward the host's. Voice is inspectable: "How do you think I sound?" returns honest patterns from observed messages. Voice memory is one of the four core categories from Belief 3.

For this to be true in code, a `voice_patterns` table extends the established `inferred_from` JSONB pattern. A voice-extraction worker reads host-authored messages and extracts patterns with provenance. A voice-inspection UI surfaces extracted patterns to the host. Prompt parameterization across all four existing LLM call sites and every new agent tool that produces text. A correction-loop reader captures the diff between drafts and approved-and-sent text, feeding back into voice learning. Foundational hygiene fixes — `actor_id` on messages, exclusion of Koast-generated templates from voice extraction. A `voice_mode` setting at host level with Mode 1 and Mode 2 options. Cold-start handling.

**The minimum viable version.**

The two-mode switch shipped at host level. A simple host-level setting: voice_mode = "neutral" | "learned". Default neutral. Available in a settings surface, also conversationally adjustable.

Mode 2 (neutral) shipped with `DEFAULT_ONBOARDING_TEMPLATES` voice as the source. The voice properties extracted from those eight templates (booking_confirmation, pre_arrival, checkin_instructions, welcome, midstay_checkin, checkout_reminder, thank_you, review_request) become the agent's default communication register. All four existing LLM call sites and every new agent tool that produces text read from this setting and apply the appropriate register.

Mode 1 (learned) shipped with shape-recognition, not generation-from-scratch. At launch, learned voice surfaces the host's existing patterns ("you tend to open with 'Hi {first_name}' and sign off without a closing") and applies them as transformations on top of the neutral baseline. Not "Koast writes original prose in your voice" yet; "Koast applies your patterns to its drafts."

Foundational hygiene fixed. `actor_id` added to messages, wired through send paths. Koast-generated drafts explicitly excluded from voice extraction.

Voice extraction worker shipped, narrow scope. Reads host-authored messages, extracts pattern features (greeting style, closing style, contractions, emoji habits, sentence length distribution, vocabulary fingerprint). Writes to `voice_patterns` with `source='inferred'` and `inferred_from` JSONB pointing to source message IDs. Confidence scored against data sufficiency thresholds.

Send route captures `original_draft` on outbound. Whether the message originated from an executor draft or an inbound-response draft, the agent's proposed text is preserved alongside the host's approved-and-sent text.

Voice inspection surface shipped. A real host-facing screen showing current voice mode, extracted patterns with provenance, the data-sufficiency state ("learning from 53 messages — patterns sharpen with use"), and override affordances.

Cold-start handling honest. New hosts default to Mode 2. The Mode 1 option is visible but flagged: "Koast learns your voice from messages you send through me. Once I've seen enough of your communication style, I can start applying your patterns to my drafts."

**What fills in over time.**

Generative Mode 1 once voice substrate has accumulated to the threshold where confident generation is honest. Per-property voice variation when the first multi-brand operator joins. Per-context register sophistication beyond what in-prompt branching can do. Voice-correction sophistication — distinguishing meaningful edits from typo fixes. Multi-actor voice attribution when multi-user lands. Embeddings as a complement if pattern-feature extraction proves insufficient. Voice export per the portability commitment.

**Architectural commitments from day one.**

Voice is a typed memory category, sharing the architecture of Belief 3's memory system, not a separate parallel system. `voice_patterns` lives alongside the broader memory tables. Same provenance discipline, same confidence metadata, same auditability.

Voice extraction has provenance from day one. Every extracted pattern points to source message IDs. Every confidence score has a data-sufficiency justification.

Foundational hygiene fixes ship before voice learning. `actor_id` on messages, wired through the send paths. Koast-generated draft exclusion from voice extraction. Pre-requisites, not nice-to-haves.

Mode setting propagates through one path. A single host-level `voice_mode` that every LLM call site and every agent tool reads from. No drift. No prompt that hardcodes its own register.

The correction loop ships as part of the send path. There is no version of voice learning that is honest if the correction signal is not being captured from day one.

Voice memory pre-allocates per-property scoping. `voice_patterns.property_id NULLABLE`. The schema does not have to be re-migrated when the first multi-brand operator joins.

Cold-start is honest. Below threshold, the agent defaults to neutral voice with explicit acknowledgment that voice is still learning. No fake voice.

**Codebase grounding.** Per BELIEF_7_VOICE_INVENTORY.md: 53 outbound host-authored messages averaging 176 chars, total ~9,500 chars for the single host today — enough for shape-recognition, thin for confident generation. The `pricing_rules.source='inferred'` pattern extends 1:1 to voice memory. `DEFAULT_ONBOARDING_TEMPLATES` already implements the canonical Mode 2 register. Reviews subsystem already captures the diff (`draft_text` + `final_text`); messaging captures it for executor-drafts but not for inbound-LLM-drafts. Decomposes to: 1 new table + 1 new worker + 1 new UI + 1 prompt parameterization + 1 send-route extension. Comparable in scope to memory (Belief 3); much smaller than chat surface (Belief 2) or direct-booking (Belief 6).

---

## The cross-cutting architecture

Several architectural commitments span multiple Beliefs. They are the seams that hold the system together — designed once, used everywhere. These are non-negotiable foundations.

### The agent loop

The single most consequential architectural piece. A streaming, multi-turn, tool-using agent that holds conversational state across requests, calls into structured tools, returns structured outputs (text plus metadata), and supports both immediate and gradient-gated actions. Built on Anthropic's SDK with tool use, prompt caching, and streaming response handling. Designed as a peer to the existing API layer with its own dedicated routes and state model. Composes existing capabilities through structured tool calls rather than duplicating them.

This unblocks Beliefs 2, 4, 5, 6, and 7. Without it, none of the other agent-shaped commitments are possible. It is the foundation work.

### The memory architecture

A `memory_facts` table (or equivalent) with Tier 1 metadata: entity scoping (host_id, property_id, sub_entity_type, sub_entity_id, guest_id), attribute, value, source enum, confidence, learned_at, last_used_at, superseded_by, status. Plus a `guests` table with back-population from existing booking columns. Plus the `voice_patterns` table with the same architectural shape. All following existing Supabase conventions (snake_case, RLS via property_id→user_id, JSONB for flexible values, timestamptz, Drizzle declarations matching migrations).

Plus a fact-extraction pipeline, a retrieval abstraction with a real contract, and a memory-write pipeline with provenance discipline.

This is the backbone of Belief 3 and the substrate of Belief 7. It feeds Beliefs 5 (source attribution flows from memory through reasoning into outputs) and 6 (memory spans all substrate categories with one accumulated knowledge per host).

### The action substrate (gradient layer)

A unified TypeScript module that exposes `requestAction(host, action_type, payload) → confirmation_required | silent | blocked`. Every action that could be gated flows through it. The three existing approval lifecycles (pricing_recommendations, messages.draft_status, guest_reviews) become instances of the substrate. New gated actions register with the substrate. A stakes registry classifies action types. A per-host calibration store records approvals, dismissals, modifications. A high-stakes hard floor is enforced at substrate level.

This is the backbone of Belief 4. It depends on the agent loop (which calls through it) and feeds Belief 6 (every agent tool routes through the substrate).

### The unified action audit feed

Every autonomous Koast action — frontend API writes, agent tool calls, worker-initiated writes — logs to the same audit feed with the same shape (action_type, payload, autonomy_level, outcome, confidence, source). The current fragmentation (channex_outbound_log, notifications, sms_log, pricing_performance) gets unified. The host introspection UI reads from this feed.

This is required by Belief 4 (the "what did Koast do silently" surface) and Belief 6 (the substrate-spanning record of action). It also enables export per Belief 3's portability commitment.

### The artifact registry

A typed contract for inline interactive artifacts. The agent emits structured payloads; the frontend renders matching components. Artifact types: calendar-with-rates, property-listing-grid, comp-set-comparison, guest-message-draft-with-edit, property-photo-carousel, map-with-pinned-locations, chart-of-occupancy-trend, property-knowledge-confirmation-block, plus more as substrate grows. Composed of the existing polish primitives.

This is the backbone of Belief 2. It enables Belief 5 (confidence rendered through structured artifacts rather than disclaimer text) and Belief 6 (each substrate category eventually introduces new artifact types).

### The voice doctrine document

A consolidated `docs/voice.md` (or similar) capturing all voice rules, register patterns, anti-filler discipline, the three-modes pattern from Belief 5, the host-voice-vs-neutral-tone framing from Belief 7. Authoritative. Referenced by every system prompt. Updated when register patterns evolve.

This is required by Belief 5 (one voice doctrine, no drift) and Belief 7 (Mode 2 register sourced from doctrine; Mode 1 corrections feed back into doctrine over time).

### The defensive Channex infrastructure

The BDC-clobber-incident response, the env-gate model (`KOAST_ALLOW_BDC_CALENDAR_PUSH` and similar), `buildSafeBdcRestrictions` pre-check, atomic Channex operation patterns, `channex_outbound_log` audit shape. Carries forward unchanged. Every agent action that touches Channex flows through these. The agent layer extends the patterns with agent-specific audit metadata.

This is required by Beliefs 4 and 6. It is institutional memory the team holds as non-negotiable carry-forward.

### The pre-launch calibration debt

Items in the codebase today that produce fabricated or misleadingly-confident host-facing output, which must be fixed before launch:

1. **The mocked pulse sparkline.** Currently fabricated client-side via linear interpolation plus sine-wave wobble. Replace with real data backed by existing tables (probably `pricing_outcomes` or revenue metrics), or remove the chart entirely.
2. **Point-estimate hero dollar amounts.** Currently surfaced authoritatively without ranges or confidence indicators. Convert to bands with confidence metadata; the engine already produces ranges, the surface just needs to render them.
3. **Send-route diff capture.** Capture `original_draft` on outbound for inbound-LLM-drafts. This is a small, high-yield extension that has to ship before voice learning is honest.
4. **`actor_id` on messages.** Add the column and wire it through the send paths. Pre-requisite for multi-user voice attribution; cheap to do now, expensive to retroactively disambiguate later.
5. **Koast-template exclusion from voice extraction.** Filter applied at the extraction pipeline so the agent does not learn its own templates as the host's voice.

These are not architectural commitments. They are debts. They ship fixed before launch.

---

## The phasing

The cross-cutting architecture defines the foundation. The individual Belief mappings define the work each Belief implies. Together, they sequence into four phases plus a continuous quality bar.

### Phase 1: Foundation

**The agent-first core, built fresh on the existing primitive foundation.**

The work in this phase is the architectural commitment from every Belief, built together because they depend on each other. Approximate scope: months 1-4 of focused engineering, depending on team size and parallel work streams. Not a timeline commitment — a sense of magnitude.

What ships:

- The agent loop with streaming, tool dispatch, structured output, multi-turn context. Built fresh; calls into existing operational layers (Channex, pricing engine, messaging substrate) through structured tools.
- The frontend reorganized with the new brand, the persistent chat layout slot reserved across every route, both chat-default and orb-mode foregrounding modes working. The existing polish primitives carry forward; the page-shaped legacy surfaces get replaced with chat-summoned equivalents or kept as inspection peers (Dashboard, Calendar, Messages, Properties).
- The memory architecture: `memory_facts`, `guests`, `voice_patterns` tables shipped following existing Supabase conventions. Sub-entity scoping primitive. Fact-extraction pipeline running for property knowledge (the canonical Method example). Retrieval abstraction with a real contract, replacing the messaging.ts hard-coded SELECTs.
- The action substrate: `requestAction()` module exposed, three existing approval lifecycles wrapped as instances. Per-host calibration store. Stakes registry manually populated. High-stakes hard floor enforced. Reversibility windows where free.
- The unified audit feed: existing fragmented logs unified. `/koast/recent-activity` surface reading from the feed. Override surface for autonomy adjustment.
- The artifact registry: structured contract defined, 3-5 initial artifact types built (calendar-rate-change, property-knowledge-confirmation, guest-message-draft, plus 1-2 more).
- The voice doctrine consolidated: single document referenced by every prompt. All four existing LLM call sites parameterized to read from `voice_mode` setting plus voice doctrine. Output schema enforcement (Zod) on every LLM call. Grounding checks before surface. Refusal fallback structured as first-class agent behavior.
- Voice learning Mode 2 shipped with `DEFAULT_ONBOARDING_TEMPLATES` voice as source. Voice-extraction worker for Mode 1 narrow scope (greeting style, closing style, contractions, emoji habits). Voice-inspection UI shipped. Send-route diff capture wired in.
- Calibration debt fixed: pulse sparkline replaced or removed, point-estimate dollar amounts converted to bands with confidence. `actor_id` on messages. Koast-template exclusion from voice extraction.
- Defensive Channex infrastructure carried forward, integrated into the agent's tool layer (every Channex-bound agent action flows through existing safe-restrictions, env-gate, audit patterns).
- Legacy config table dispositions executed: 4 deprecated (`message_templates`, `review_rules`, `user_preferences`, `message_automation_firings`), 1 transformed (`property_details` migrates to memory facts), 1 hybrid kept with safety wrapper (`pricing_rules`).

What does not ship in this phase: full substrate breadth, sophisticated calibration learning, generative Mode 1 voice, multi-user model, direct booking, marketing capability, deep strategic surfaces.

### Phase 2: Operational launch

**The substrate-ready capabilities exposed through the agent.**

Approximate scope: months 4-7 of focused engineering, possibly partially overlapping with late Phase 1. The ~40 wrappable agent tools identified in BELIEF_6_SUBSTRATE_INVENTORY.md get implemented and shipped.

What ships:

- Pricing tools: query_pricing_signals (wraps `/api/pricing/audit`), propose_rate_change, apply_recommendation, set_rule, override_recommendation, push_rates_to_channel. All gated by the action substrate. All using structured output with confidence metadata.
- Calendar tools: read_calendar_window, propose_calendar_change, surface_conflicts, block_dates_for_maintenance. Read-side first; write-side gradient-gated.
- Channel tools: read_channel_health, surface_disconnections, propose_reconnection, query_channel_performance.
- Reviews tools: draft_review_response, schedule_review_response, surface_bad_review_for_host_attention, query_review_patterns.
- Guest messaging tools: agent-driven send under gradient-gating, batch-checkout-coordination, repeat-guest recognition.
- Property operations tools: cleaner_notify, turnover_visibility, conflict_resolution. Maintenance and supply explicitly out-of-scope, framed honestly.
- Read-side strategy tools: revenue_query, occupancy_analysis, channel_mix_review, comp_performance, pricing_outcomes_analysis. The agent can answer "how am I doing" questions using existing data.

This is the launchable Koast — operationally credible across the substrate's center of gravity, honest about what is not yet built. Hosts running 5+ properties professionally get a meaningfully different experience from any bounded tool.

### Phase 3: Substrate expansion

**Filling in the partial-ready and substrate-greenfield categories.**

Approximate scope: ongoing post-launch, parallel work streams. No single timeline; each substrate area lands when it is ready at the quality bar.

What ships, roughly in order:

- Maintenance request and supply tracking. Generalize from the cleaning_tasks state machine. Schema extension. Agent capability over the new operational layer.
- Listing-content management. Exercise the unused Channex API surface for per-channel copy and photo management. New artifact types for content review.
- Multi-user model. Co-host accounts, VA accounts, vendor accounts. RLS rewrites across 30+ tables. Multi-actor voice attribution lands here. Permission-scoped chat surfaces per user role.
- Voice learning Mode 1 deepens to generative once substrate accumulates past confident-generation thresholds.
- Confidence calibration learning loop. The agent tracks which of its hedged claims have been validated vs corrected.
- Contradiction detection and supersession workflows in memory.
- Per-property voice variation when the first multi-brand operator joins.
- Decay and refresh logic for stale memory facts.

### Phase 4: Greenfield subsystems

**The substrate categories that require building entire new subsystems beyond the agent layer.**

Approximate scope: multi-month each, parallel work streams. Each shipped as a coherent slice when its underlying subsystem is mature.

What ships, no required order:

- **Direct booking.** Stripe integration. Schema for direct bookings. Checkout page. Refund-policy applicator. Returning-guest discounts. Direct outreach campaigns. Booking-rule application. The full subsystem. Months of engineering. Once shipped, the agent's direct-booking tool catalog becomes available.
- **Marketing and acquisition.** Email sender (CAN-SPAM/GDPR compliant). Segmentation engine. Campaign engine. Referral tracking. Social publishing. Brand voice across surfaces (extends voice doctrine to marketing channels). Months of engineering.
- **Staff and team operations beyond cleaners.** Vendor model. Vendor payments. Performance tracking. Hiring conversations (digital portion). Multi-month work, requires multi-user model from Phase 3.
- **Deep strategic surfaces.** Property acquisition analysis (requires MLS or public-records data partnerships — external dependency). Exit and expansion decisions (requires real-estate market data). OTA policy compliance tracking (requires per-platform dashboard scrapers). Each of these depends on external data sources the team does not control; they ship when the data partnerships or scrapers exist.
- **Voice as interaction mode.** STT/TTS integration. Mobile-first work. Separate work stream after text-mode agent is mature.

### Continuous: Quality bar maintenance

**The standards every shipped piece of work clears.**

Not a phase. A continuous discipline.

- Belief 5 honest confidence applied to every new agent capability. Every tool declares data-sufficiency thresholds. Every LLM call enforces output schemas. Grounding checks before surface. Refusal fallbacks where appropriate.
- Belief 7 voice quality applied to every output channel. Voice doctrine referenced. Mode setting honored. Pattern application or neutral baseline depending on host preference. No drift.
- Belief 2 experiential bar applied to every new surface. Streaming. Motion. Crafted visualizations. Considered voice. Failures with dignity. Confirmations with weight.
- Defensive Channex infrastructure preserved through every Channex-bound capability addition.
- The "How we work" principles from the Method document — diagnose before building, ship in marathons not sprints, ship at 90% polish not 99%, be honest about quality, skeptical of speculation, considered not vibe-coded, decisions written down, build with the long arc in mind, be honest about scope.

---

## Hard dependencies and ordering

A few dependencies are hard. They determine the only viable phasing.

- **The agent loop blocks all agent capability.** Belief 2's foundation work has to land before Beliefs 3 (memory feeds the agent), 4 (gradient gates agent tools), 5 (honest confidence is agent communication discipline), 6 (substrate is the agent's capability surface), or 7 (voice is what the agent sounds like) can be honest. The agent loop is Phase 1 work; everything substantive depends on it.
- **Memory architecture blocks personalization.** Without the memory substrate, the agent cannot remember property quirks, guest history, voice patterns, or operational preferences. Belief 3's Tier 1 commitments are Phase 1 work; deeper memory features fill in over time.
- **Gradient substrate blocks autonomous-write graduation.** Without the action substrate, gated actions either always confirm (useless time-savings) or always execute (terrifying). Belief 4's foundation is Phase 1 work; calibration sophistication grows over time.
- **Stripe blocks direct-booking financial actions.** No direct-booking tools can ship until the underlying Stripe substrate exists. Phase 4 work; depends on the underlying subsystem.
- **Multi-user model blocks staff/team capability beyond cleaners.** Without multi-actor scoping, co-host and VA capabilities cannot exist coherently. Phase 3 work; blocks parts of Phase 4.
- **Marketing infrastructure blocks "brand voice across surfaces."** The voice doctrine extends to marketing channels only when those channels exist. Phase 4 work; depends on the underlying subsystem.
- **Foundational hygiene fixes block voice learning.** `actor_id` on messages and Koast-template exclusion from extraction must ship before voice extraction begins, or the extracted patterns are corrupted. Phase 1 pre-launch work.
- **External data partnerships block deep strategic surfaces.** MLS data, public records data, real-estate market data, OTA policy dashboards — these come from outside the team's direct control. Phase 4 work that depends on partnerships or scraper infrastructure.

---

## What this map is not

A few things this document deliberately avoids.

It does not commit to specific timelines. The phases are sized roughly ("months 1-4 of focused engineering" for Phase 1, etc.), but those are sense-of-magnitude indicators, not project plans. Real timelines depend on team size, parallel work streams, hiring, partnerships, and the natural rhythm of building things at the quality bar. Pretending otherwise produces fiction.

It does not commit to specific implementation choices below the architecture layer. Whether the agent loop uses Server-Sent Events or websockets, whether memory retrieval uses Postgres full-text search or vector similarity, whether the artifact registry uses tRPC or REST contracts — these are decisions that get made at implementation time with the full context the team has at the moment. The architectural commitments are the contracts; the implementations honor them.

It does not commit to a shipping order within phases. The work in Phase 1 is interdependent enough that it ships as a coherent unit; the work in Phase 2 can ship in roughly any order across the five infrastructure-ready substrate categories; the work in Phase 4 ships in whatever order the subsystem investments mature. Forcing a specific order within a phase creates fragility without adding value.

It does not commit to feature breadth at v1. The Phase 1 + Phase 2 launch is operationally credible across the substrate's center of gravity but visibly thin in several areas (direct booking, marketing, deep strategy, multi-user). The Method document is honest about this; this document is honest about it. The product ships with the architecture supporting the full vision and the visible interface shaped to what has actually been built.

What it does commit to: the architectural foundations that make every later piece of work possible. Get those right at v1 and everything that comes later is faster, cleaner, and more honest. Get them wrong and the work compounds into rebuilds.

---

## A note on what comes next

This document is a synthesis of the seven inventory investigations and the Method's seven Beliefs. It is the engineering-facing companion to the customer-facing Method document.

What it enables, immediately:

- The team has a shared map of what the work involves. Across humans, sessions, and tools (Claude Code, Claude itself, future hires), the substantive plan is captured in writing rather than in conversational context that gets lost.
- New engineering work has a reference. When a Claude Code prompt asks for guidance on "how should I build X," this document provides the architectural commitments X has to honor.
- Investor and partner conversations have an honest substrate. The Method describes the destination; this document describes how we get there. Both are real.

What it does not enable, on its own:

- Building. The work itself is the work itself; this document is the map, not the building. Phase 1 represents months of focused engineering across multiple work streams.
- Accurate timeline projections. Real projections come from estimating actual work against actual team capacity, not from sense-of-magnitude phases.
- Feature decisions inside phases. Each substrate category has its own micro-decisions about what ships first within the category.

The map will be revised as the work progresses. The Beliefs are stable; the engineering implications get sharper as we build them. When implementation reveals architectural assumptions that need adjustment, this document gets updated. The next revision is scheduled when Phase 1 is far enough along to validate the foundational architecture against real implementation.

For now, what matters: we have a coherent picture of the work. The Method describes Koast as we mean it. This document describes how we build it. The substantive thinking is captured, in writing, in our own words.

---

*Working draft. Last revised May 1, 2026. Next revision when Phase 1 implementation reaches an architecturally-validatable state.*
