# Belief 2 — Chat-as-Spine Inventory

*Belief: "Conversation is the spine." — chat is the primary surface, omnipresent, renders interactive artifacts inline, with the experiential bar of Claude/Cursor.*

This is an inventory of what foundation exists in `~/koast` for that surface. Investigation only. No code changes.

---

## 1. Current chat surface

### 1a. Does any chat exist?

**Yes — but it's a guest-messaging inbox, not a host-agent chat.** No agent-facing conversation surface exists today.

The chat-shaped UI lives at `/messages` (`src/app/(dashboard)/messages/page.tsx`) and renders `src/components/dashboard/UnifiedInbox.tsx` (1,129 lines). It's a three-pane inbox keyed off `message_threads` (Channex sync), with bookings + properties joined in:

- Left pane: thread list, sortable by last_message_received_at, filter chips for `all` / `unread` / `needs_reply` / `ai_drafted` (the last is intentionally dimmed — comment `"// The Koast-AI 'K' button stays disabled (slice 3 wires AI drafts)."`).
- Middle pane: per-thread message stream. Optimistic send: a clientId-tagged temp message inserts immediately with `__optimistic.status='sending'`, flips to `'sent'` on `POST /api/messages/threads/[id]/send` success or `'failed'` with retry button on error. Mark-read fires `POST /api/messages/threads/[id]/mark-read` on thread open. Composer surfaces a content-filter warning (phone/email/URL regex) for Airbnb threads.
- Right pane: `ConversationContextCard` — booking facts, property facts, action shortcuts.

There is **no host-agent chat surface.** No `/chat` route. No `/agent` route. No persistent chat dock. The closest thing globally mounted is the `CommandPalette` (⌘K), which is a "coming soon" shell whose body says *"Global search is coming."* It has no chat or agent functionality today.

### 1b. Implementation details (of the guest inbox, since that's what exists)

- `"use client"` React component, no library framework — hand-rolled with `useState`/`useEffect`/`useCallback`.
- State management: local `useState` for active thread, optimistic message list, composer drafts (`Record<threadId, string>` — survives thread switches so half-typed drafts don't get lost).
- No state library (no Redux, Zustand, Jotai). No conversational-UI library (no `assistant-ui`, no Vercel AI SDK).
- Templates tab inside Messages renders `TemplateManager` (the per-property message_templates editor — see Belief 1 inventory).

### 1c. Connected to act on host operation?

**Effectively no.** The inbox can:
- Send a message (POST `/api/messages/threads/[id]/send`) — this writes to `messages` and pushes outbound to Channex.
- Approve a `draft_pending_approval` template draft (POST send with the rendered body).
- Discard a draft (POST `/api/messages/threads/[id]/discard`).

It **cannot**: change a rate, accept a recommendation, add/edit a property, search comps, schedule a turnover, generate a review, etc. None of those routes are wired to the inbox. Each lives behind a different page (Pricing tab, Properties, Comp Sets, Turnovers, Reviews) and is operated through bespoke per-page UI.

### 1d. Streaming?

**No.** Every Anthropic call in the codebase is `client.messages.create({ model, max_tokens, system, messages })` with no `stream: true`. The two LLM modules are:

- `src/lib/claude/messaging.ts` `generateDraft()` — max_tokens 300, single non-streaming call.
- `src/lib/reviews/generator.ts` — four exports (`generateGuestReview`, `generateReviewResponse`, `generateGuestReviewFromIncoming`, plus the private-note follow-up call) — all max_tokens 100-400, all non-streaming.

The frontend awaits the JSON response. The user sees a spinner, then the entire draft appears at once. No token-by-token reveal. No streaming consumer hook. Zero `EventSource`/`ReadableStream`/`TransformStream` references in the codebase (`src/`-wide grep returns nothing relevant).

### 1e. Sub-conclusion §1

The current "chat" is a guest-messaging inbox built for the wrong audience (guests, not the host) and the wrong protocol (Channex thread sync, not agent turn-taking). It has nice optimistic UX and well-thought composer behavior, but the data model and component shape are not a foundation for the agent chat in Belief 2 — they are a *separate product feature* that should remain as the guest comms surface even after the agent chat exists.

---

## 2. Current tab / navigation structure

### 2a. Top-level navigation

`src/app/(dashboard)/layout.tsx` declares a 9-item sidebar in three groups:

```
(no label):  Dashboard (/), Calendar (/calendar), Messages (/messages)
MANAGE:      Properties (/properties), Pricing (/pricing),
             Reviews (/reviews), Turnovers (/turnovers)
INSIGHTS:    Market Intel (/market-intel), Comp Sets (/comp-sets)
```

Reachable by URL but not in the sidebar: `/properties/[id]`, `/properties/new`, `/properties/import`, `/onboarding`, `/settings`, `/analytics`, `/bookings`, `/nearby-listings`, `/channels`, `/channels/connect`, `/channels/sync-log`, `/frontdesk` (placeholder), `/certification`, `/channex-certification`, `/login`, `/signup`. Public (no auth): `/revenue-check`, `/clean/[taskId]/[token]`.

### 2b. Implementation

Layout is a flex-row split: `<DesktopSidebar />` fixed-position left + `<main>` content area to the right. Sidebar:
- Desktop: collapsed (60px) by default, expandable to 240px via the toggle pill on the right edge. Preference persisted in `localStorage` (`sidebar-expanded`).
- Mobile (`<md`): hidden — replaced by a hamburger button in the top bar that opens a slide-in `<MobileSidebar />` (240px, animated `slide-in-left`, with backdrop).
- Active-route detection: exact match for `/`, `pathname.startsWith(item.href)` for everything else. Active item gets a 3px golden left rail + golden text/icon.
- Per-item badge slot: today only Messages gets a live coral badge from `/api/bookings/conflicts`, polled every 60 seconds.

Top bar (`<header>` h-14, white, hairline border-bottom):
- Mobile: hamburger + active-page-name label.
- Center: `<TopBarSearch />` — a button-shaped affordance that dispatches a `koast:open-command-palette` CustomEvent.
- Right: bell icon (no functionality wired).

`<CommandPalette />` is mounted globally at the bottom of layout — full-screen overlay, ⌘K/Ctrl+K shortcut, focus trap, ESC to close, but the body is the placeholder "Global search is coming."

### 2c. Per-route purpose / data

| Route | Purpose | Data source |
|---|---|---|
| `/` | Dashboard (greeting, pulse metrics, AI insight cards, revenue chart, top properties, action queue) | Mostly client-fetched: `POST /api/dashboard/command-center` returns the full bundle |
| `/calendar` | 24-month Airbnb-style grid, per-property booking bars, rate cells, side panel for editing | Server component prefetch of properties + bookings + calendar_rates + per-channel overrides |
| `/messages` | Guest inbox (see §1) | Server component reads `message_threads` + `bookings` + `properties` |
| `/properties` | Photo-led property cards with channel badges and ChannelPopover hover | Server component reads `properties` + counts |
| `/pricing` | Rate calendar with engine signal cards, market context, apply flow | Server component + client `usePricingTab` hook |
| `/reviews` | Review queue with AI generation + approve/schedule | Server component reads `guest_reviews` + `review_rules` |
| `/turnovers` | Cleaning task list, status pills, cleaner assignments | Server component reads `cleaning_tasks` + `cleaners` |
| `/market-intel` | Glass stats, occupancy/ADR charts, market opportunity AI card | Server component + Leaflet map (`<IntelMap />`) |
| `/comp-sets` | Comp-set table sorted by performance | Server component reads `market_comps` + `properties` |
| `/properties/[id]` | Property detail with 280px hero + 3 tabs (Overview / Calendar / Pricing) | Server component prefetch + `usePricingTab` hook |
| `/settings` | Account-level settings (see Belief 1 §1a) | Mixed: auth + REST + direct Supabase |

### 2d. Responsive

- Sidebar: visible only on `md+`; replaced with hamburger overlay on mobile.
- Most pages have explicit responsive rules — `grid-cols-1 sm:grid-cols-3`, `hidden sm:block`, mobile breakpoints in calendar (44px cells vs 168px desktop). Mobile is functional but visibly less dense.
- Top bar layout collapses logo into hamburger on mobile.
- ChannelPopover: hover popover on desktop, switches to a bottom-sheet UX on mobile (per design spec, but `vaul` is not yet installed).

### 2e. Sub-conclusion §2

The navigation today is **page-shaped, not chat-shaped.** The host navigates *to* a page to perform an operation. There is no persistent affordance for "ask Koast something" anywhere in the chrome — the closest is the ⌘K palette, which is a placeholder. To deliver Belief 2, the layout needs a new persistent surface (a right-rail or always-mounted dock) that survives route changes and stays one tap away. The current layout doesn't reserve real estate for it.

---

## 3. Rendering capabilities in the frontend

### 3a. Component libraries in use

From `package.json`:
- **No shadcn-ui, no radix-ui, no headless-ui, no Material/Mantine/Chakra.** Everything custom.
- `@floating-ui/react@0.27.19` — popover/tooltip positioning. Used by `ChannelPopover`, `DateEditPopover`, sidebar tooltips.
- `lucide-react@1.7.0` — icon set. Used everywhere.
- `recharts@3.8.0` — present in deps but per CLAUDE.md the revenue chart deliberately uses HTML Canvas + `requestAnimationFrame` instead. Active recharts callsites: `AnalyticsDashboard`, `PricingDashboard` use it for some charts; the dashboard hero uses Canvas.
- `leaflet@1.9.4` + `react-leaflet@4.2.1` — maps. Two map components: `CompMap`, `IntelMap`.
- `@fontsource-variable` — Plus Jakarta Sans + Nunito self-hosted; Fraunces is a CSS variable (display face).
- `tailwindcss@3.4.1` — CSS framework.
- No animation library (no Framer Motion, no `motion`). Animations are `@keyframes` in `globals.css` + `requestAnimationFrame` for canvas drawing.
- No drag-and-drop library (no `dnd-kit`, no `react-dnd`).
- No virtualization library (no `react-window`, no `tanstack-virtual`) — the calendar is 24 months × 30-ish days × N properties rendered without virtualization.

### 3b. Reusable primitives

#### Polish primitives (`src/components/polish/`, brand-vetted, mature)

```
KoastButton, KoastCard (4 variants), KoastChip (5 variants),
KoastRate (5 variants: hero/selected/inline/quiet/struck + delta),
KoastBookingBar, KoastRail (light/dark), KoastSelectedCell,
KoastSignalBar, KoastEmptyState, KoastSegmentedControl,
StatusDot, PortfolioSignalSummary, PlatformPills,
HandwrittenGreeting, TopBarSearch, CommandPalette
```

Plus calendar-specific: `CalendarSidebar`, `PricingTab` (1,792 lines), `AvailabilityTab`, `WhyThisRate`, `RateCell`, `SyncButton`, `BulkRateConfirmModal`.

These were built in the polish-pass sessions 1-5a and clear a high quality bar (per CLAUDE.md's "considered" rule). They're brand-on, pixel-tuned, and reusable. The chat could render artifacts that compose these.

#### Calendar (mature)

`src/components/polish/CalendarView.tsx` (1,435 lines) is a full Airbnb-style monthly grid with per-property booking bars, rate cells, drag-select, per-channel rate overrides, sidebar editor. Data input: a `bundleByDate Map<date, RateBundle>`. This is the most sophisticated single component in the codebase. An "agent renders a calendar artifact in chat" use case has a credible base here — but the component currently expects to fill the full content area; embedding it inside a chat bubble would require layout rework.

#### Property cards (mature)

`PropertyDetail.tsx` (1,237 lines) — 280px hero, tab strip, settings modal. `PropertiesPage` — photo-led card grid with `PlatformPills` + `ChannelPopover`. These are full pages, not artifact-shaped — they assume the route owns the screen.

#### Charts (split)

- `RevenueChart.tsx` — HTML `<canvas>` + `requestAnimationFrame` rather than recharts. Animated draw on entrance. ~170 lines. Reusable as-is for "show me revenue over a period" artifacts.
- `PricingDashboard` rate-calendar heatmap uses 4 inline hex literals for a 5-stop data-viz scale (per CLAUDE.md).
- `AnalyticsDashboard` uses recharts for some panels.
- No "sparkline" primitive — the dashboard pulse metric mocks one client-side via linear interpolation (CLAUDE.md "Known Gaps").

#### Maps (basic)

`CompMap`, `IntelMap` use `react-leaflet`. Markers + popups. Not chat-embeddable as-is; both are full-bleed inside their pages.

#### Photo galleries

**None.** Property hero is a single `next/image`. Card thumbs are single images. There is no carousel, lightbox, or gallery primitive. CLAUDE.md "Known Gaps — Image Assets" notes the source-resolution issue but no gallery is planned.

#### Editable drafts

- `PendingDraftBubble.tsx` — renders messaging_executor template-rendered drafts inline in the conversation; the host can Approve & Send or Discard. This is the closest thing to an "editable artifact rendered in a chat-like surface" that exists today. Roughly 100-200 lines. Mature.
- Composer textarea in `UnifiedInbox` — plain `<textarea>`, optimistic send, content-filter regex warning. Not rich-text.

#### Comparison views

- `/comp-sets` page — sortable HTML table, pinned your-property row.
- No side-by-side comparison primitive. No diff component. Comparing two dates' rates in the calendar is done by selecting dates; nothing renders them side-by-side.

### 3c. "Render a component inside another context" patterns

Multiple, all bespoke:

- **Modal via `createPortal`**: `ReviewsSettingsModal.tsx` mounts via `createPortal(node, document.body)` to escape ancestor stacking contexts. Same pattern in `GuestReviewForm`, `BulkRateConfirmModal`. Pattern is established.
- **Slide-over drawer**: `ReviewSlideOver.tsx` (right-side panel that slides in from the edge). `BookingSidePanel.tsx` (calendar booking detail). Both hand-rolled, no library.
- **Inline popover**: `ChannelPopover` (340px floating popover via `@floating-ui/react`, 200ms hover delay, 100ms grace period, mobile bottom-sheet fallback). `DateEditPopover` for calendar cells. Same `@floating-ui/react` foundation.
- **Property settings modal**: defined inline in `PropertyDetail.tsx:870-1236`, uses standard fixed-position overlay pattern.
- **Expandable card**: `TemplateManager` — accordion-style expand/collapse for each template row.
- **Tab switcher**: `KoastSegmentedControl` + per-page `tab` URL param (e.g., `?tab=pricing`).

There is **no generic "artifact frame"** that wraps an arbitrary component for embedding in a chat bubble. Every embed today is a hand-built modal/drawer/popover targeting a specific use case. The vocabulary exists; the abstraction does not.

### 3d. Sub-conclusion §3

The visual primitives are well-built and on-brand, especially the calendar and the polish-pass `Koast*` set. The patterns for embedding interactive components (portal, drawer, popover) are established and proven. **The gap is the abstraction layer**: there is no `AgentArtifact` component that takes a typed payload (`{ kind: "calendar", propertyId, dateRange }` or `{ kind: "comp-grid", listingIds }`) and renders the right component, scoped to the chat's layout, with consistent affordances (refine, expand to full screen, dismiss). Building that registry plus the per-artifact wrappers is the bulk of the rendering work.

---

## 4. State and data flow

### 4a. How the frontend gets data

Three patterns coexist:

**Pattern A — RSC (React Server Component) prefetch.** `app/(dashboard)/<route>/page.tsx` is a server component that calls `createClient` (server) or `createServiceClient` (service-role), queries Supabase directly, joins shapes server-side, and passes typed props to a client component. Used by: `/messages`, `/calendar`, `/properties`, `/pricing`, `/reviews`, `/turnovers`, `/market-intel`, `/comp-sets`, `/channels/sync-log`. This is the dominant pattern. ~9 of the 15 dashboard pages.

**Pattern B — Client fetch via custom hook + REST.** Client components call `fetch('/api/...')`. Custom hooks like `usePricingTab` parallelize calls and implement stale-while-revalidate via a module-level `Map` cache. Used by: PropertyDetail's pricing tab, calendar editing flows, dashboard command center.

**Pattern C — Client-direct Supabase.** Client component calls `createClient()` from `@/lib/supabase/client` and queries/mutates through RLS. Used by: `/settings`, `/properties/new`, `/onboarding`, `TemplateManager`, `CalendarGrid`, login/signup. ~7 callsites.

In API routes themselves: 50 routes use `supabase.from(...)` (PostgREST through service-role); 5 routes use Drizzle's typed `db.select()`. Mixed — there's no enforced single ORM.

**No SWR. No React Query. No tRPC.** Hand-rolled fetch + setState everywhere.

### 4b. Pattern for "load → edit → validate → commit"

Closest existing example is the Pricing rules editor (`src/components/polish/PricingTab.tsx:699-840` `RulesEditor`):

1. **Load** — `usePricingTab(propertyId)` parallelizes 4 fetches (rules, pending recs, applied recs, performance) with stale-while-revalidate.
2. **Local edit state** — local `useState` for each editable field (`base`, `min`, `max`, `delta`, `floor`).
3. **Validate** — server-side via Zod schemas in `src/lib/validators/properties.ts` and the rules PUT route. Server returns 400 with `field_errors` map; client surfaces inline.
4. **Commit** — `scheduleSave({ field: value })` debounces and `PUT /api/pricing/rules/[propertyId]` on field blur. On success, refetch.
5. **Optimistic** — for the `auto_apply` toggle and for blur-saves, the local state updates immediately; server confirms in background.

Other examples of similar but not identical loops:
- `UnifiedInbox` send: optimistic clientId-tagged temp message → flips to sent/failed.
- Calendar pricing tab: drag-select dates → Pending Changes Bar → Apply confirms → POST batch.
- Property settings modal: form state → PUT → toast + refetch parent.

The pattern works but is **rebuilt per-feature**. There's no shared hook like `useArtifactDraft<T>` that all artifacts could use. Each editor reinvents debounced save, error handling, optimistic state.

### 4c. Realtime / streaming

**Zero realtime infrastructure in src.** No `supabase.channel(...)`, no `postgres_changes` subscriptions, no `.subscribe(`, no `EventSource`, no SSE consumer. `@supabase/realtime-js` is in node_modules transitively (via `@supabase/supabase-js`) but unused.

Polling is the only "live" pattern: the `conflictCount` poller (60s interval) on Messages, the iCal sync polling. Nothing uses websockets or SSE end-to-end.

For the agent's "thinking, intermediate steps, tool calls" stream, there is **no foundation at all** — frontend, API routes, and workers are all request/response. This is greenfield.

### 4d. Sub-conclusion §4

The data layer is readable and consistent within Pattern A (RSC prefetch + client component). The mutation pattern (debounced save + Zod validation + refetch) is solid where it exists but is not centralized. **For chat-as-spine the largest gap is realtime/streaming** — neither the frontend nor the API layer streams anything today, and the agent loop will need to. Adding SSE per artifact-emitting endpoint, plus a token/event consumer hook, is greenfield work that touches both client and server.

---

## 5. Agent-layer infrastructure

### 5a. LLM call sites — call flow

**All 4 callers are Next.js API routes. Workers do zero LLM work.**

| Route | Module | Behavior |
|---|---|---|
| `POST /api/messages/draft` | `lib/claude/messaging.ts` `generateDraft` | 1 model call, max_tokens 300, system prompt = property context + booking + property_details + last 20 conversation messages. Response written to `messages.ai_draft` + `draft_status='generated'`. Returns JSON with `{ draft, messageId }`. |
| `POST /api/reviews/generate/[bookingId]` | `lib/reviews/generator.ts` `generateGuestReview` | 2 model calls in series: review (max_tokens 400, branching tone) + private note (max_tokens 100). Writes the row. |
| `POST /api/reviews/respond/[reviewId]` | `lib/reviews/generator.ts` `generateReviewResponse` | 1 model call, max_tokens 300, system prompt branches by rating (positive/mixed/negative). |
| `POST /api/reviews/generate-guest-review/[reviewId]` | `lib/reviews/generator.ts` `generateGuestReviewFromIncoming` | 1 model call, max_tokens 200, conditioned on the guest's incoming review. |

Frontend pattern in every case: button click → `fetch(...)` → spinner → JSON arrives → render. The browser sees no intermediate state.

The Python worker tier (`~/koast-workers/`) — `booking_sync.py`, `messaging_executor.py`, `pricing_validator.py`, `market_sync.py`, `messages_sync.py`, `reviews_sync.py`, `pricing_performance_reconciler.py`, `pricing_worker.py`, `ical_parser.py` — has **zero** Anthropic imports. Confirmed by `grep -rn "anthropic" ~/koast-workers --include="*.py"` returning nothing. Workers are pure SQL / HTTP plumbing. The `messaging_executor` renders templates with regex `{var}` substitution, not LLM generation.

### 5b. Agent framework / orchestration

**None.** No LangChain, no LlamaIndex, no AI SDK (`ai` package is not in deps). No custom agent loop. No tool dispatcher. No `tools:` parameter, no `tool_use` / `tool_choice` / `tool_result` content blocks anywhere in the codebase (`grep -rn "tool_use\|tool_choice\|tools:" src` returns nothing relevant).

The Anthropic SDK is invoked as a string-generation function. Single turn per request. The system prompt is always built fresh in the route — **no prompt caching** (no `cache_control` references anywhere).

The closest thing to "a layer that decides what the agent should do next" is `src/app/api/dashboard/actions/route.ts` — a hand-coded rule cascade that ranks action items by counting pending recommendations, overdue tasks, etc., and returns a top-5 list. It's a deterministic ranker, not an agent. No LLM involvement.

### 5c. Frontend subscription to agent progress

**None.** No way for the frontend to observe partial output, intermediate reasoning, tool-call dispatch, or tool-call results. The model's output is opaque until the route's JSON response lands. This applies to all 4 LLM callsites.

There is a `src/lib/events/client.ts` file (the only file matching `events/`), but it's a thin client-event helper, not a server-side event stream.

### 5d. Sub-conclusion §5

The agent layer is **almost entirely greenfield.** The Anthropic SDK is in the project and the call patterns are simple, but everything that would make the SDK feel "agentic" — tools, multi-turn loops, streaming, prompt caching, event channels for intermediate state, tool-result handling — has to be built. There is no existing scaffolding to retrofit. The pricing engine is a separate (non-LLM) deterministic engine; the dashboard actions route is a hand-coded ranker. Neither is on the path to becoming the agent.

---

## 6. Keep vs. rebuild — honest assessment

### Keep (credible foundations for chat-as-spine)

1. **Polish design primitives** (`src/components/polish/Koast*`). Tasteful, brand-vetted, on-spec. Chat artifacts should compose these. Confidence: high.
2. **Token system + Tailwind palette + Fraunces/Plus Jakarta Sans typography.** The visual identity is set. Confidence: high.
3. **Calendar primitives** (`CalendarView`, `KoastBookingBar`, `KoastRate`, `KoastSelectedCell`, `RateCell`, calendar sidebar). Sophisticated and recent. The "agent summons a calendar artifact" use case has a real base — though the component currently assumes it owns the page width, so artifact-mode embedding needs layout work. Confidence: medium-high.
4. **Embed-component vocabulary**: `createPortal` modals, slide-over drawers, `@floating-ui/react` popovers. Patterns are proven across `ReviewSlideOver`, `BookingSidePanel`, `ChannelPopover`, `ReviewsSettingsModal`. The chat's artifact frame can stand on these. Confidence: high.
5. **Optimistic-UI patterns** (UnifiedInbox composer, RulesEditor scheduleSave). Good reference shape for "edit, optimistically commit, reconcile on server response." Confidence: medium-high.
6. **API surface for pricing** (`/api/pricing/rules`, `/recommendations`, `/performance`, `/apply`, `/dismiss`, `/preview`, `/audit`). The agent can call these as tools — they have stable contracts, validation, idempotency. Confidence: high.
7. **API surfaces for reviews + messages**. Same — agent-tool-shaped. Confidence: medium-high (the messaging routes are tied to Channex's thread model, which constrains what tools the agent can expose; reviews are cleaner).
8. **Server-component prefetch pattern** (Pattern A in §4a). Good foundation for "render a tab the way it always rendered, alongside the chat." The tabs survive even if the chat becomes the spine. Confidence: high.
9. **Channex integration layer** (`src/lib/channex/`, `getRestrictionsBucketed`, `buildSafeBdcRestrictions`). The OTA write paths are battle-tested and gated. Agent-tool wrappers around these are credible. Confidence: high.

### Rebuild fresh (built for a different model; retrofit would mislead)

1. **The chat surface itself.** UnifiedInbox is a guest-message inbox. The threading model (Channex thread_id, channel_code, OTA-asymmetric booking link, content-filter regex, mark-read) is wrong shape for an agent chat (which has agent/user roles, tool calls, artifact attachments, optionally extended-thinking blocks). Don't conflate. Confidence in rebuild verdict: high.
2. **Streaming infrastructure.** Zero exists. Anthropic calls are non-streaming `messages.create`; frontend has no SSE/stream consumer. Token streaming + intermediate-event streaming (tool-call dispatched, tool-result returned, agent-thinking-block updated) needs to be built end-to-end. Confidence: high.
3. **Agent loop.** No tools, no multi-turn, no tool-call dispatcher, no orchestration. Greenfield decision: roll our own (simple Claude tool-use loop) vs. adopt Anthropic's Agent SDK or Vercel AI SDK. Confidence in greenfield-build verdict: high.
4. **Realtime "agent progress" events.** Zero exists. Either Supabase realtime channels (free per the existing `@supabase/realtime-js` dep) or SSE. Both greenfield. Confidence: high.
5. **Artifact rendering surface.** The component vocabulary exists (modals, drawers, popovers) but there's no typed artifact registry, no `AgentArtifact` wrapper, no protocol for "agent emits a `kind: calendar` artifact, chat renders the right component, artifact captures user edits and sends them back to the agent as a tool result." That whole layer is greenfield, with bespoke wrappers per artifact type built on the existing Koast primitives. Confidence: high.
6. **Persistent global chat affordance in layout.** Today the layout reserves no real estate for a persistent chat. The sidebar collapses to 60px; there's no right-rail; main content takes whatever's left. A chat-as-spine layout needs either: a third permanent column (sidebar + content + chat), a slide-over chat dock that survives route changes, or an "orb mode" where chat is the foreground and tabs collapse. Either way, layout rework is greenfield. Confidence: high.
7. **Voice.** No voice input/output anywhere. Greenfield. Confidence: high.
8. **Memory feeding the agent.** Per Belief 1 inventory — no general-purpose memory exists. The agent's per-host accumulated knowledge has no current home. Greenfield. Confidence: high.
9. **CommandPalette.** Currently a placeholder shell. If it's repurposed as the chat affordance (⌘K-summon a chat) the input + focus-trap + ESC behavior is reusable, but the body is a no-op today. Treat as half-empty scaffold: keep the shell, replace the body. Confidence: medium.

### Partial / "exists but for an adjacent purpose"

1. **`/messages` page + `UnifiedInbox`.** Should remain as the *guest-facing* inbox. The Channex sync, optimistic send, draft-pending-approval flow, content-filter warning, mark-read — all real value for the guest comms surface. Don't replace it; build the host-agent chat as a **separate** surface and let both coexist. Confidence: high.
2. **`PendingDraftBubble` + `messaging_executor` template firing.** Time-anchored template firings are likely to be replaced by agent-driven personalization, but the *idempotency table* (`message_automation_firings`) and *draft-pending-approval lifecycle* (`messages.draft_status`) are reusable patterns for any future "agent proposed an outbound message, host approves" flow. Keep the patterns; the implementation will likely be rewritten. Confidence: medium.
3. **`/api/dashboard/actions` ranker.** Useful as a *starter capability list* the agent can introspect ("what does Koast think the host should look at right now?") but the rule cascade itself is not the model — replace the heuristic with agent reasoning over the same underlying data. Keep the data shape, replace the engine. Confidence: medium.
4. **`usePricingTab` hook.** A good model for a per-domain composed read hook with stale-while-revalidate. The agent's read tools could share this style. The hook itself is pricing-specific; the **pattern** generalizes. Confidence: medium.
5. **`createServiceClient` + RLS access patterns.** Solid for server-side data access from API routes. The agent's tool runners can use the same client. The patterns are reusable, but the *security model* needs review for an agent context (who is the agent acting as? when can it access cross-property data?). Confidence: medium.

### Headline

The Koast frontend today is a competent collection of **page-shaped surfaces** with strong visual primitives and a workable RSC + REST data layer. None of the structural pieces that make a chat-as-spine product feel alive — persistent chat affordance, streaming token output, intermediate-event channels, agent loop, tool calls, artifact registry, memory — exist today. They're greenfield, and the work needed is roughly equivalent to building a second Next.js app's worth of capability beside the existing one, while continuing to ship the page surfaces (which remain useful as peer surfaces beside the chat). The keep-list is real and worth preserving; the rebuild-list is the entire spine of Belief 2.
