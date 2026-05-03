# Agent Loop v1 — Milestone 5 Report

*Executed 2026-05-03. The first user-facing surface of the agent loop. M5 ships the chat shell that consumes M4's `/api/agent/turn` SSE endpoint, renders the host's conversation with the Koast agent across 14 design states, and lays the foundation for M6 (polish) and M7 (artifact registry). End-to-end staging smoke confirmed: with Villa Jamaica selected in the topbar dropdown, a host prompt triggered `read_memory` against the property's UUID, the dispatcher succeeded in 800ms, the agent rendered a truthful "no facts on file yet" reply with an invitation to teach, and the persisted conversation reloaded cleanly across browser refresh.*

Cross-references:
- Conventions inventory: [`agent-loop-v1-milestone-5-conventions.md`](./agent-loop-v1-milestone-5-conventions.md)
- Predecessors: M1 schema · M2 substrate + memory handlers · M3 dispatcher + read_memory · M4 agent loop server
- Design doc: §3 (streaming) · §4 (tool dispatch) · §10 (chat shell scope)

---

## 1. Summary

M5 is the first user-facing surface in the agent loop. The work consumed the M4 SSE endpoint via a client-side reducer + hook, ported the brand bundle's design tokens / motion vocabulary / banded mark, and built React surfaces for all 14 chat shell states from the Phase C design handoff (states 01-14). Of the 11 SSE events the design enumerates, M5 wires the 7 events M4 actually emits (`turn_started`, `token`, `tool_call_started`, `tool_call_completed`, `done`, `error`, `refusal`) and treats the 4 forward-looking events (`tool_call_failed`, `action_proposed`, `memory_write_pending`, `memory_write_saved`) as TypeScript types only — the reducer's exhaustive switch will fail TS the moment M6/M7 lifts them into the active schema, forcing paired implementation (D-FORWARD-EVENTS).

Scope expanded twice during staging smoke. The first smoke surfaced that the property-context dropdown panel (originally framed as M6 polish in CF§10.10) was actually load-bearing — without it the chat shell couldn't populate `ui_context.active_property_id` and `read_memory` was unreachable. **D18** added `listProperties(host_id)` and the dropdown panel into M5 scope. The second smoke surfaced an M4-era bug compounded across three layers — `ui_context` was Zod-validated at the route then dropped, never modeled in `RunAgentTurnInput`, and the documented "inject into messages, preserve cache" design was never wired. **D19** resolved the plumbing with a server-side ownership check + preamble injection at SDK-call time. Smoke #3 confirmed `read_memory` fired correctly with the Villa Jamaica UUID. The third smoke surfaced a UTC-vs-EDT hydration warning on every chat-shell timestamp — fixed minimally with `suppressHydrationWarning`, with M6 picking up the canonical strategy (CF§10.19).

The chat shell is reachable at `/chat` (landing) and `/chat/[conversation_id]` (existing thread). Forward-looking states 08 (ActionProposal) and 14 (MemoryArtifact) are reachable via documented preview routes only (`/_preview/m5-states/[state]`) until the substrate emits their events (D-PREVIEW-ROUTES).

---

## 2. Added

### Chat surfaces — `src/components/chat/`

| File | Lines | Purpose |
|---|---:|---|
| `ChatShell.tsx` | 39 | Root grid (240px rail + 1fr surface), theme attribute, `m-mobile` class flip |
| `ChatShell.module.css` | 769 | Full chat-shell stylesheet — palette/type/motion tokens scoped to `.shell`, all component styles, mobile rules |
| `Rail.tsx` | 56 | `<aside>` wrapper composing RailHead/List/Foot |
| `RailHead.tsx` | 24 | Brand mark + new-conversation button |
| `RailList.tsx` | 46 | Grouped conversation list (Today/Yesterday/This week/Older) |
| `RailFoot.tsx` | 14 | Host avatar + name + org |
| `Surface.tsx` | 43 | Topbar + scroll + composer container; passes through scrollRef + onScroll for CF§10.8 anchoring |
| `Topbar.tsx` | 74 | Property context pill + audit-log + new-thread icon buttons |
| `PropertyContext.tsx` | 133 | Property pill trigger **+ dropdown panel (D18)** with outside-click + Escape close |
| `Turn.tsx` | 25 | One conversation turn (user or koast role) |
| `Meta.tsx` | 53 | Avatar + who + time row, role-aware DOM ordering |
| `KoastMark.tsx` | 77 | Banded mark SVG with `idle`/`active`/`milestone` states; `useId()` once for SSR-safe clipPath id |
| `UserMessage.tsx` | 8 | Right-aligned user message bubble |
| `KoastMessage.tsx` | 38 | Agent body + `StreamingParagraph` + `StreamTail` (the dot, not a typewriter cursor) |
| `ToolCall.tsx` | 121 | Inline tool row, three states (in-flight/completed/failed) + expandable result panel |
| `ActionProposal.tsx` | 77 | **NEW (step 9)** — left tide-stripe block with head + why + actions; D-PREVIEW-ROUTES only in M5 |
| `MemoryArtifact.tsx` | 116 | **NEW (step 10)** — pending + saved variants; saved fires parent KoastMark milestone (CF15 visual stub) |
| `ErrorBlock.tsx` | 47 | Inline `<span class="err" role="status">` with retry/dismiss |
| `RefusalTag.tsx` | 14 | Mono eyebrow ("scope · pricing · auto-approve") |
| `Composer.tsx` | 111 | 4-state input bar (empty/typing/sending/blocked) with ⌘↵ submit + Esc cancel |
| `RespondingRow.tsx` | 20 | "Koast is responding…" mono row + stop button |
| `EmptyState.tsx` | 19 | 28px idle mark + single 17px line, no chips |
| `DayDivider.tsx` | 14 | Mono uppercase day separator |
| `ChatClient.tsx` | 508 | **Live orchestrator** — owns useAgentTurn, draft state, conversation grouping, property selection state (D18), session harvest, auto-scroll anchor (CF§10.8) |
| `index.ts` | 45 | Barrel exports |

**Component subtotal: 2491 lines.**

### Client-side SSE module — `src/lib/agent-client/`

| File | Lines | Purpose |
|---|---:|---|
| `types.ts` | 192 | Zod-validated AgentStreamEvent union mirroring `src/lib/agent/sse.ts`; 4 forward-looking event types declared but not in the active schema (D-FORWARD-EVENTS) |
| `parseSSEEvent.ts` | 76 | Pure SSE-chunk parser with buffer remainder for cross-chunk events |
| `turnReducer.ts` | 170 | `(state, event) => state` reducer for the 7 M4-emitted events, exhaustive switch with `_exhaustive: never` |
| `useAgentTurn.ts` | 158 | Hook: POST `/api/agent/turn`, decode SSE, drive reducer, expose `submit/cancel/reset` |
| `__mock__/mockStream.ts` | 76 | `runMockStream` async-gen + `sampleStreamingTurn` fixture (D16) |
| `tests/parseSSEEvent.test.ts` | 184 | 18 tests |
| `tests/turnReducer.test.ts` | 245 | 16 tests |
| `tests/sse-integration.test.ts` | 229 | 5 tests (the explicit CP2 gate) |

**Client-module subtotal: 1330 lines (4 source files + 3 test files + mock).**

### Routes

| File | Lines | Purpose |
|---|---:|---|
| `src/app/(dashboard)/chat/page.tsx` | 62 | Server component, `createClient()` + `auth.getUser()`, fetches conversations + properties in parallel (D-Q6, D18) |
| `src/app/(dashboard)/chat/[conversation_id]/page.tsx` | 72 | Server component, host-ownership check via `loadTurnsForConversation`, hands typed history + properties to ChatClient |
| `src/app/(dashboard)/_preview/m5-states/[state]/page.tsx` | 229 | D-PREVIEW-ROUTES — renders ActionProposal (state 08) and MemoryArtifact (state 14) with the D16 mock dispatcher; unlinked, no auth bypass, no env flag |

### Tests

| File | Lines | Tests |
|---|---:|---:|
| `src/lib/agent/tests/ui-context.test.ts` | 191 | 10 (D19 helpers — preamble shape, last-plain-user-message targeting incl. tool_result skip, ownership check pass/unauthorized/no-row) |

### Assets + docs

- `public/fonts/koast/JetBrainsMono-VariableFont_wght.ttf` (+ italic) — D-F5 / CF16 (TTF→woff2 in M6)
- `docs/architecture/agent-loop-v1-milestone-5-conventions.md` — 541 lines, 18 architectural decisions + 19 numbered carry-forwards
- `docs/architecture/agent-loop-v1-milestone-5-report.md` — this file
- `design/m5-handoff/` — full Phase C handoff bundle (untouched archive)

---

## 3. Modified

| File | Change |
|---|---|
| `src/app/globals.css` | Added M5 palette + type + motion tokens at `:root`, `@font-face` for JetBrains Mono regular + italic, `koast-mark.css` keyframes (D-13a, D-F5) |
| `src/app/(dashboard)/layout.tsx` | True early-return `<>{children}</>` when `pathname?.startsWith('/chat')` or `'/_preview/m5-states'` — bypasses sidebar/header/CommandPalette so chat shell renders edge to edge (D15 / D-Q5) |
| `src/lib/agent/conversation.ts` | +`listConversations` + `loadTurnsForConversation` + `listProperties` + `ChatPropertyOption` + `UITurn` + `ConversationListItem` + `summarizeToolInput` + `summarizeToolResult` + `truncatePreview` (D-Q8, D-F2, D18) |
| `src/lib/agent/loop.ts` | +`ui_context?: { active_property_id?: string }` on `RunAgentTurnInput`; +`buildActivePropertyPreamble` + `prependActiveContextToLastUserMessage` + `resolveActiveProperty`; injection between `reconstructHistory` and round loop (D19) |
| `src/app/api/agent/turn/route.ts` | Forwards `ui_context` from parsed body to `runAgentTurn` (D19) |
| `docs/architecture/agent-loop-v1-milestone-5-conventions.md` | Status banner updated for D17/D18/D19 + CF15-19; D15/D-Q5 phrasing corrected; CF§10.8 + CF§10.10 amended in place |
| `.gitignore` | Added `.m*-phase1-stop.md` and `.m*-recovery.md` glob (D-F4 + recovery extension) |

---

## 4. Architectural decisions

All 18 decisions in `agent-loop-v1-milestone-5-conventions.md` §12. Summary:

| ID | Topic | Origin |
|---|---|---|
| D1-D10 | Pre-authoring decisions: M5 location, component module layout, client agent module, reducer + hook state pattern, CSS port, Tailwind extension, KoastMark, SSE event handling, ActionProposal/MemoryArtifact components, test discipline | Conventions authoring |
| D11 / D-Q1 | Chat surface route placement: `(dashboard)/chat/page.tsx` + `[conversation_id]/page.tsx` | Phase 1 STOP |
| D12 / D-Q4 | Client state: `useReducer` + `useAgentTurn` (no new dep) | Phase 1 STOP |
| D-13a / D-Q2 | CSS port: token namespace + scoping rules (`:root` for palette/type, `.chat-shell` for semantic layer) | Phase 1 STOP |
| D-13b / D-Q3 | Tailwind `font-mono` unchanged (preserves 25 tabular-num surfaces) | Phase 1 STOP |
| D14 / D-Q2 | Existing canonical Koast tokens (`--golden`/`--coastal`/etc.) stay untouched — Apr 2026 rebrand canonical, not "legacy PMS-era" | Phase 1 STOP |
| D15 / D-Q5 | Dashboard layout TRUE early-return for `/chat/*` (corrected during step 14.5d to clarify the divergence from `/calendar` / `/messages` branches which only vary inner wrapping) | Phase 1 STOP, refined step 14.5d |
| D16 | Mock SSE driver shape for preview routes (`__mock__/mockStream.ts`) | Phase 1 STOP |
| D-F1 | `turn_started` wired directly; **7 emitted, 4 forward-looking** (corrected the original M5 conventions claim of 6) | Phase 1 STOP |
| D-F2 | Conversation list `preview` + `propertyName` + `timeLabel` derived at read time; M6 schema migration adds dedicated columns | Phase 1 STOP |
| D-F4 / D-GITIGNORE | `.gitignore` Phase 1 STOP working files (`.m*-phase1-stop.md`, extended in M5 to `.m*-recovery.md`) | Phase 1 STOP |
| D-F5 / D-FONT-LOCATION | Self-host fonts at `public/fonts/koast/` (TTF in M5; CF16 woff2 in M6) | Phase 1 STOP |
| D-Q6 | Server-component pages + Client Component for SSE | Phase 1 STOP |
| D-Q8 | `listConversations` + `loadTurnsForConversation` in `conversation.ts` | Phase 1 STOP |
| D-FORWARD-EVENTS | Forward-looking events: types only, no reducer branches | Phase 1 STOP |
| D-PREVIEW-ROUTES | Preview routes for ActionProposal + MemoryArtifact (unlinked, no auth bypass, no env flag) | Phase 1 STOP |
| **D17** | Prop signature refinements vs. components.md (Topbar flat handlers, ToolCall `state='failed'` not `success`, Composer `onEscape`) | Steps 9-14.5 |
| **D18** | `listProperties(host_id)` + chat-shell property dropdown — moved into M5 scope post-smoke #1 | Step 15 smoke |
| **D19** | ui_context plumbing: route → loop → SDK-call with server-side ownership check + preamble injection at SDK-call time | Step 15 smoke |

---

## 5. Phase 1 STOP findings (summary)

Captured fully in `~/koast/.m5-phase1-stop.md` (gitignored, removed pre-commit). Five surface findings (F1-F5) elevated alongside the 9 §11 questions:

- **F1** — M4 emits `turn_started`; original conventions claim of 6 events was wrong. Reducer transitions to `streaming` on the event, not on POST.
- **F2** — `agent_conversations` has no title/preview column; preview/property/timeLabel derive at read time. M6 schema migration adds columns.
- **F3** — Plus Jakarta Sans is already loaded via `@fontsource-variable`; reuse rather than self-host. JetBrains Mono is the only new self-host.
- **F4** — `.m*-phase1-stop.md` gitignore pattern needed to prevent the working file from leaking into commits.
- **F5** — Font location standardized at `public/fonts/koast/`; `design/m5-handoff/` stays as the canonical design archive (never served from).

The recovery file `~/koast/.m5-recovery.md` (also gitignored, removed pre-commit) captured the second-session catch-up that verified CP2's claims against actual disk state — finding two cosmetic discrepancies (CP2's "mock/" directory was actually `__mock__/`, "woff2/ttf" was actually TTF-only) and confirming all 14 design states had React surfaces.

---

## 6. Staging smoke

Three smoke iterations run against the dev server (Next.js 14.2.35 on `0.0.0.0:3001`) over commits made during the session. Each iteration surfaced a real gap that loops back to the conventions doc.

### Smoke #1

**Result:** route compiled and rendered, but the topbar dropdown was empty — no properties listed. Without a selectable property the chat shell could not populate `ui_context.active_property_id`, making `read_memory` unreachable.

**Resolution:** D18 — added `listProperties(hostId)` server reader, server pages fetch properties + conversations in parallel, ChatClient owns `activePropertyId` state, PropertyContext extends with the dropdown panel. CF§10.10 (originally "trigger renders, panel deferred") REMOVED into M5 scope.

### Smoke #2

**Result:** Villa Jamaica selected in the topbar pill ("Villa Jamaica · Tampa · 4 br"), `ui_context.active_property_id` confirmed in POST body — but the agent still refused to call `read_memory` for three turns, asking the host to "select it in your system or provide the UUID." The selection wasn't reaching the agent.

**Diagnosis (4-layer trace):**
- Layer 1 ChatClient → POST: ✅ working — `ui_context` in body
- Layer 2 `/api/agent/turn` route: 🚨 destructured `ui_context` out, never forwarded to `runAgentTurn`
- Layer 3 `loop.ts`: 🚨 `RunAgentTurnInput` had no `ui_context` field at all
- Layer 4 `system-prompt.ts`: header documented "ui_context goes into messages, NOT system prompt — preserves cache" but no code anywhere implemented the injection

M4-era gap inherited by M5; staging smoke earned its keep.

**Resolution:** D19 — `RunAgentTurnInput.ui_context?: { active_property_id?: string }`, route forwards, `resolveActiveProperty` does server-side ownership check, `prependActiveContextToLastUserMessage` injects the locked-shape preamble at SDK-call time only (not persisted, doesn't pollute `reconstructHistory`). Preamble copy locked verbatim per Cesar's wording. 10 unit tests in `tests/ui-context.test.ts` cover preamble shape, last-plain-user-message targeting (incl. tool_result skip), ownership pass/unauthorized/no-row.

### Smoke #3 — END-TO-END SUCCESS

Conversation `af2ab79d-10c4-434a-81d3-4b40872cdb08`. Villa Jamaica selected. Host prompt: "What memory do you have about Villa Jamaica?"

**Wire-level outcome (from dev-server log + `agent_turns` row):**
- `POST /api/agent/turn` → 200, total wall-clock 25004 ms
- Dispatcher log: `[dispatcher] Tool 'read_memory' succeeded in 800ms.`
- `agent_turns` row for the assistant turn:

| Field | Value |
|---|---|
| model_id | `claude-sonnet-4-5-20250929` |
| input_tokens | 169 |
| output_tokens | 25 |
| cache_read_tokens | **1033** |
| n_tool_calls | 1 (read_memory) |
| content_text length | 94 chars |
| turn_index | 1 |

**Cost calculation** (Sonnet 4.5 @ $3/M input · $15/M output · $0.30/M cache_read):
$3·169/1e6 + $15·25/1e6 + $0.30·1033/1e6 ≈ $0.000507 + $0.000375 + $0.000310 = **~$0.00119/turn**.

Below M4's documented $0.0018 baseline — the cache hit on the system prompt (1033 tokens served from cache) produced the savings. **D19's preamble injection landed in the user message, not the system prompt — confirms the architectural premise that prompt cache stays warm even when ui_context varies per turn.**

**Tool dispatch verified:** `read_memory` returned an empty fact set (truthful — no facts saved for Villa Jamaica yet; memory writing is M7 work). The agent rendered an honest "no facts on file yet" reply with an invitation to teach.

**Persistence verified:** browser refresh reloaded the conversation from `agent_turns`; the rendered DOM matched the pre-refresh state modulo streaming-specific transient elements. The persisted user message in `content_text` is the host's verbatim text — the D19 preamble does not leak into the DB.

### Smoke #3 follow-up — hydration error

DevTools console reported: `Text content does not match server-rendered HTML. Server: "8:44 am" Client: "4:44 am"`. Server (Virginia VPS) renders timestamps in UTC; client renders in browser-local (EDT). 4-hour delta = TZ mismatch on every chat-shell timestamp.

**Resolution (Option B — minimal):** `suppressHydrationWarning` applied to the timestamp spans in `RailList.conv-time` + `Meta.stamp` (both koast and user variants) + proactively on `DayDivider.day`. CF§10.19 documents M6 polish to pick a canonical strategy (UTC display everywhere / `formatDistanceToNow` / host-timezone profile field).

After the fix, hard refresh of `/chat` and `/chat/[id]` → console clean. Confirmed by Cesar.

---

## 7. Verification — 10 gates from the M5 prompt

| Gate | Outcome |
|---|---|
| 1. All 14 state files have a React surface | ✅ 01 EmptyState · 02 Rail+RailList · 03 Turn+UserMessage+KoastMessage+Meta · 04 StreamingParagraph+StreamTail+RespondingRow · 05-07 ToolCall {3 states} · 08 ActionProposal · 09 Turn done · 10 ErrorBlock · 11 RefusalTag · 12 Composer {4 states} · 13 ChatShell.m-mobile · 14 MemoryArtifact |
| 2. 7 M4 events drive UI transitions | ✅ turnReducer.ts switch covers all 7; `sse-integration.test.ts` x5 verifies the streaming path |
| 3. 4 forward-looking events are types-only in turnReducer.ts | ✅ grep `tool_call_failed\|action_proposed\|memory_write_pending\|memory_write_saved` against turnReducer.ts returns only doc-comment lines 5-6 explaining the omission, NOT switch branches |
| 4. No legacy PMS tokens in chat surfaces | ✅ grep `--golden\|--coastal\|--mangrove\|--tideline` across `src/components/chat/` and `src/lib/agent-client/` returns empty |
| 5. No `from "@/lib/agent"` imports in client code | ✅ grep returns empty |
| 6. (dashboard)/layout.tsx early-return for /chat | ✅ at line 314: `pathname?.startsWith("/chat") \|\| pathname?.startsWith("/_preview/m5-states") → return <>{children}</>` |
| 7. tsc clean | ✅ `npx tsc --noEmit` exit 0, no output |
| 8. ESLint clean on M5 surfaces | ✅ `npx next lint --max-warnings=0` on `src/components/chat`, `src/app/(dashboard)/chat`, `src/app/(dashboard)/_preview`, `src/lib/agent`, `src/lib/agent-client` → 0 warnings 0 errors |
| 9. Tests pass | ✅ 19 suites, 3 skipped (pre-existing), **205 tests passed / 0 failed**. Chat-scope: 39 client SSE/reducer/integration + 10 D19 ui-context = 49 |
| 10. Live M4 endpoint roundtrip | ✅ smoke #3 — `read_memory` fired against Villa Jamaica UUID, dispatcher succeeded in 800ms, persistence held across refresh, console hydration-clean |

---

## 8. Stats

**Code (TypeScript / TSX):**
- Chat components (`src/components/chat/`): 25 source files, **2491 lines** (incl. 769-line CSS module)
- Client SSE module (`src/lib/agent-client/`): 4 source files + 3 tests + 1 mock, **1330 lines** (905 source / 425 test+mock)
- Server reads added to `src/lib/agent/conversation.ts`: ~316 net-new lines (from 278 → 594)
- Server plumbing added to `src/lib/agent/loop.ts`: ~105 net-new lines (from 380 → 485)
- Routes (`src/app/(dashboard)/chat/*`, `_preview/*`): 3 files, **363 lines**
- D19 unit tests (`src/lib/agent/tests/ui-context.test.ts`): **191 lines** / 10 cases

**Total source LOC added in M5: ~3589 net-new** (excluding modifications to globals.css, layout.tsx).
**Total test LOC added in M5: ~849** (3 client SSE/reducer/integration suites + the D19 suite + the mock).

**Tests (full repo):** 205 passing across 19 suites; 3 skipped (pre-existing). Chat-scope tests: 49.

**Dependencies added:** **0** — preserves CP2's "no new deps" invariant. Component-level tests (jest-environment-jsdom + testing-library) deferred to M6 (CF17).

**Docs:**
- `agent-loop-v1-milestone-5-conventions.md`: 541 lines (18 decisions, 19 carry-forwards)
- `agent-loop-v1-milestone-5-report.md`: this file

---

## 9. Carry-forwards

19 numbered entries in conventions §10. **17 active deferred** + 2 listed-but-resolved-in-M5.

| # | Item | Status |
|---|---|---|
| 1 | 4 forward-looking SSE events (`tool_call_failed`, `action_proposed`, `memory_write_pending`, `memory_write_saved`) for M6/M7 substrate | Active deferred |
| 2 | Memory artifact pending TTL — default v1: persists until host accepts/rejects/dismisses | Active deferred |
| 3 | Mobile drawer interaction (≤200ms slide, scrim) — full polish in M6 | Active deferred |
| 4 | Tablet breakpoint (640-960px) | Active deferred |
| 5 | Dark mode QA (states 04/06/08/10/14 in dark theme) | Active deferred |
| 6 | Accessibility audit (formal screen-reader / keyboard-only walkthrough) | Active deferred |
| 7 | Keyboard shortcut: `↑` to recall last message | Active deferred |
| 8 | Auto-scroll behavior — **rule SHIPPED in M5** (clarified 2026-05-03); only the "↓ new" pill is M6 polish | Partial-deferred (pill only) |
| 9 | Conversation grouping rules — defaulted to rolling 7-day windows | Active deferred (revisit if it feels off) |
| **10** | **Property context dropdown panel — RESOLVED IN M5 per D18** (originally framed as M6 polish; smoke surfaced load-bearing) | Listed-but-resolved-in-M5 |
| 11 | Audit log surface (M7+ artifact work) — icon button wired to placeholder | Active deferred |
| 12 | Error variants beyond connection + server (rate limits, content-policy refusals) | Active deferred |
| 13 | Action proposal collapse-after-approval | Active deferred |
| 14 | Long-prose tool-call collapse-all (5+ tool calls) | Active deferred |
| 15 | KoastMark milestone state visual is stub-only (state machine works; full deposit visual targets `.ghost`/`.stack` SVG groups not in 5-band markup) | Active deferred (M6 polish) |
| 16 | Self-hosted fonts in TTF format (woff2 conversion in M6) | Active deferred (M6 polish) |
| 17 | Component test infrastructure deferred to M6 (jest-jsdom + testing-library + CSS-module mock — would breach "no new deps") | Active deferred |
| **18** | **M4-era ui_context plumbing gap — RESOLVED IN M5 per D19** (route validated then dropped, loop unmodeled, system-prompt design comment never wired) | Listed-but-resolved-in-M5 |
| 19 | Timestamp rendering uses `suppressHydrationWarning` as M5 escape hatch — M6 picks a canonical strategy (UTC everywhere / `formatDistanceToNow` / host-timezone profile field) | Active deferred (M6) |

---

*End of M5 report.*
