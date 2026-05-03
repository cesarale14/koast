# Agent loop v1 — Milestone 5 conventions

> **Status:** Phase 1 STOP complete (2026-05-03 against commit `fe63295`). 18 architectural decisions locked in §12 (10 pre-authoring + 5 surface findings + D17 prop refinements + D18 property dropdown post-smoke #1 + D19 ui_context plumbing post-smoke #2; D-Q5/D-GITIGNORE/D-FONT-LOCATION cross-reference D15/D-F4/D-F5 — 21 named decisions, 18 unique). 19 numbered carry-forwards in §10, **17 active deferred**: CF1-9, CF11-14, CF15 (milestone visual stub), CF16 (TTF→woff2 in M6), CF17 (component test infra deferred), CF19 (timestamp suppressHydrationWarning escape hatch — proper canonical strategy in M6). CF§10.10 (property dropdown) and CF§10.18 (ui_context plumbing) are listed-but-RESOLVED-IN-M5 per D18 / D19 — entries kept for traceability, not counted as active. Corrections applied to §6 (CSS port), §8 (SSE event count), §10 (carry-forwards count + #8 scroll clarification + #10 resolution + #18 added-as-resolved + #19 added-as-deferred), §12 (D15/D-Q5 phrasing + D17 + D18 + D19), §15 (success-criteria count). Source of truth for M5 implementation.
>
> **Predecessors:** M1 (schema foundation), M2 (action substrate + memory handlers), M3 (tool dispatcher + read_memory), M4 (agent loop server with end-to-end streaming).
>
> **Successor signals:** several decisions in M5 surface forward-looking SSE event needs that M6 (polish) and M7 (artifact registry) will need to add to the substrate. Captured in the carry-forward section.

---

## 1. Scope

M5 is the **foundational chat shell** — the first user-facing surface in the project. It consumes M4's agent loop server (`/api/agent/turn` SSE endpoint) and renders the host's conversation with the Koast agent.

In scope for M5:
- The chat shell route under the existing `(dashboard)` route group
- Client-side SSE consumption hook
- Components for: empty state, conversation list, message stream, streaming text, inline tool calls (collapsed/in-flight/completed), action proposals, completed turns, error states, refusals, input bar (4 states), mobile (375px), memory artifact (pending + saved)
- Mapping M4's actual SSE events to UI state transitions
- Brand vocabulary port: `colors_and_type.css` semantic tokens, `koast-mark.css` motion vocabulary, the banded mark SVG, Plus Jakarta Sans + JetBrains Mono fonts
- Test discipline matching M2-M4 (unit tests for the SSE hook + component logic; staging smoke against the live M4 endpoint)

Out of scope for M5 (deferred to later milestones):
- Mobile drawer interaction beyond the static 375px example
- Tablet (640-960px) breakpoint
- Dark mode QA pass
- Accessibility audit beyond what the design bundle specifies
- The audit log surface (M7+ artifact)
- Forward-looking SSE events the design surfaced that M4 doesn't emit yet (see §10)

---

## 2. Source of truth

The Phase C deliverable from Claude Design is the **design specification source of truth**. M5 implementation must:

| Source | Purpose | Treatment |
|--------|---------|-----------|
| `handoff/README.md` | Implementation guide, SSE event mapping, per-state notes, anti-patterns, gaps | Read first. Anti-patterns are non-negotiable. |
| `handoff/components.md` | Machine-readable component spec with TypeScript prop signatures, hierarchy, a11y rules, state machine diagram | Component implementations match these signatures. Don't deviate without recording a decision. |
| `handoff/states/*.html` | Structural source of truth for markup (14 self-contained state files) | The HTML structure (class names, element hierarchy, ARIA attributes) is the contract. Translate to JSX preserving structure. |
| `handoff/chat-shell.css` | Style source of truth | Consume verbatim into a CSS module, OR port to Tailwind utilities — see §6. |
| `colors_and_type.css` | Design tokens — palette, type, spacing, radii, motion easings | Port verbatim into the koast repo's globals. See §6. |
| `koast-mark.css` | Motion vocabulary keyframes | Port verbatim. Don't redefine the cascade/pulse/milestone keyframes. |
| `_mark.svg.html` | Canonical 5-band mark markup | Inline as an SVG component (see §7). |

**Locked tokens:** the 9 semantic palette tokens (shore, deep-sea, ink, shore-mist, shoal, tide, reef, trench, plus the dark-ramp variants) and the two typefaces (Plus Jakarta Sans, JetBrains Mono) are locked at the brand level. M5 does not introduce new colors, fonts, or spacing values. If implementation surfaces a need, that's a system gap to surface back to design — not an implementation choice.

---

## 3. Where M5 lives in the App Router

**Decision (proposal — confirm during Phase 1 STOP):**

The chat shell lives inside the existing `(dashboard)` route group at:

```
src/app/(dashboard)/chat/
├── layout.tsx               // chat-specific layout (rail + surface grid)
├── page.tsx                 // landing chat surface (empty state for new conversation)
└── [conversation_id]/
    └── page.tsx             // existing conversation surface
```

Rationale:
- `(dashboard)` is the existing authenticated route group — auth flow + nav chrome already present
- The chat shell is the new primary surface but coexists with the legacy dashboard surfaces during the rollout window
- Route groups don't affect URLs, so this lives at `/chat` and `/chat/[id]`

**Phase 1 STOP must verify:**
- Whether `(dashboard)` actually exists with that exact path or has been refactored
- The auth pattern in the existing layout (likely `getAuthenticatedUser` per M2-M4 conventions)
- Whether there's an existing nav/rail in `(dashboard)` that the chat shell's rail must coexist with or replace
- Whether existing dashboard pages (PropertyDetail, AnalyticsDashboard, PricingDashboard) need to remain reachable from the chat shell's nav

If `(dashboard)` doesn't exist or has a different shape, M5's location adjusts accordingly. The constraint is: same auth scope, same env access, same nav/chrome family.

---

## 4. Component layout — files and module boundaries

**Decision (proposal):**

```
src/components/chat/
├── ChatShell.tsx            // root: rail + surface grid, theme prop
├── Rail.tsx                 // conversation list sidebar
├── RailHead.tsx             // brand + new-conversation button
├── RailList.tsx             // grouped conversation items
├── RailFoot.tsx             // user summary
├── Surface.tsx              // topbar + scroll + composer + responding row
├── Topbar.tsx               // property context + topbar actions
├── PropertyContext.tsx      // property name + meta + dropdown trigger
├── Turn.tsx                 // single conversation turn (user or koast)
├── Meta.tsx                 // turn meta row (avatar + who + time)
├── KoastMark.tsx            // banded mark SVG component with motion states
├── UserMessage.tsx          // user message bubble
├── KoastMessage.tsx         // agent message body (renders mixed content)
├── ToolCall.tsx             // inline tool call (collapsed/in-flight/completed/expanded)
├── ActionProposal.tsx       // action proposal block with reasoning + buttons
├── MemoryArtifact.tsx       // memory artifact (pending + saved states)
├── ErrorBlock.tsx           // inline error
├── RefusalTag.tsx           // optional eyebrow on refusal turns
├── Composer.tsx             // input bar (4 states)
├── RespondingRow.tsx        // small mono row below composer with stop button
├── EmptyState.tsx           // first-time / fresh-thread placeholder
├── DayDivider.tsx           // day separator in the message stream
└── index.ts                 // barrel exports
```

Plus the SSE consumption hook:

```
src/lib/agent-client/
├── useAgentTurn.ts          // hook that POSTs to /api/agent/turn and consumes SSE stream
├── parseSSEEvent.ts         // pure function: SSE chunk → typed AgentStreamEvent
├── turnReducer.ts           // pure function: (state, event) → newState (state machine)
├── types.ts                 // client-side mirror of src/lib/agent/sse.ts AgentStreamEvent
└── tests/
    ├── parseSSEEvent.test.ts
    └── turnReducer.test.ts
```

Boundaries:
- `src/lib/agent/` (M2-M4) is **server-side**. M5 does not import from it on the client.
- `src/lib/agent-client/` (M5) is **client-side only**. It mirrors the typed event union from `src/lib/agent/sse.ts` but does not import it (avoid bundling server code).
- `src/components/chat/` consumes `src/lib/agent-client/`. Components are dumb where possible — the hook + reducer hold state machine logic.

---

## 5. Client-side state pattern

**Decision (proposal — confirm during Phase 1 STOP):**

Use a **reducer + hook** pattern, not a global state library.

```typescript
// src/lib/agent-client/turnReducer.ts
type TurnState =
  | { kind: 'idle' }
  | { kind: 'streaming'; turnId: string; partial: TurnContent[]; toolCalls: ToolCallState[] }
  | { kind: 'done'; turnId: string; final: TurnContent[] }
  | { kind: 'error'; turnId: string; partial: TurnContent[]; error: string }
  | { kind: 'refusal'; turnId: string; refusal: TurnContent[] };

export function turnReducer(state: TurnState, event: AgentStreamEvent): TurnState { ... }
```

```typescript
// src/lib/agent-client/useAgentTurn.ts
export function useAgentTurn(conversationId: string) {
  const [state, dispatch] = useReducer(turnReducer, { kind: 'idle' });
  const submit = async (userMessage: string) => { /* POST + read SSE stream */ };
  const cancel = () => { /* abort the active turn */ };
  return { state, submit, cancel };
}
```

Rationale:
- The chat shell's state is fundamentally a state machine driven by SSE events. A reducer is the right primitive.
- TanStack Query / SWR are good for request-response, awkward for streaming.
- Zustand / Jotai are reasonable but global-state libraries add a dependency for what fits in a hook.
- The reducer is unit-testable as a pure function (matches M2-M4 testing discipline).

**Phase 1 STOP must verify:**
- Whether the existing koast repo has an established client-state pattern (e.g., is TanStack Query already used elsewhere, and would using it here be consistent even if not ideal?)
- Whether there's existing context/provider chrome the chat shell layout should slot into

If the repo has a strong existing convention, M5 follows it. If not, the reducer + hook pattern above is the proposal.

---

## 6. CSS port strategy

The Phase C deliverable ships:
- `colors_and_type.css` — design tokens as CSS custom properties
- `koast-mark.css` — motion keyframes
- `chat-shell.css` — chat shell component styles (~22.7 KB)

**Decisions (corrected at Phase 1 STOP — see also D-13a, D-13b, D14 in §12):**

1. **Palette + type tokens → `globals.css :root` as net-new additions.** The bundle's `--koast-shore`, `--koast-deep-sea`, `--koast-ink`, `--koast-shore-mist`, `--koast-shoal`, `--koast-tide`, `--koast-reef`, `--koast-trench`, `--koast-ink-2`, `--koast-ink-3`, `--koast-rule`, `--koast-bg`, `--koast-good`, `--koast-warn` (palette) and `--font-sans`, `--font-mono`, `--font-display`, `--font-body`, `--font-code`, `--font-wordmark`, `--fs-*` (type) names do not collide with any existing token in `globals.css`. They land at `:root` alongside the current Koast tokens. Dark theme via `[data-theme="dark"]` per the brand spec.

2. **Semantic layer (`--bg`, `--surface`, `--fg`, `--fg-2`, `--fg-3`, `--accent`, `--accent-deep`, `--accent-tint`, `--rule`, `--rule-strong`, `--bg-substrate`, `--bg-tinted`, `--surface-muted`, `--fg-on-dark`, `--focus-ring`) → SCOPED to the `.chat-shell` wrapper, NOT `:root`.** These are intentionally chat-shell-scoped to avoid hijacking app-wide names that future PRs may use differently. Outside the chat shell, no surface needs these semantic aliases — components elsewhere read `--coastal`, `--golden`, `--shore`, etc. directly.

3. **Shadow + radius value collisions: same `.chat-shell` scoping.** The bundle's `--shadow-md` (`0 6px 24px -8px rgba(15, 24, 21, 0.10)`) differs from existing `--shadow-md` (Koast coastal-tinted card shadow). Same for `--radius-md` (10px vs existing 8px) and `--radius-xl` (14px vs existing 16px). Resolve by scoping the bundle's shadow/radius values to the `.chat-shell` wrapper alongside the semantic layer. No global override.

4. **Existing `--golden`, `--coastal`, `--mangrove`, `--tideline`, `--shore`, `--shore-soft`, `--dry-sand`, `--shell`, `--lume*`, `--positive`, `--abyss`, `--coral-reef`, `--amber-tide`, `--lagoon`, `--deep-water`, `--bar-dark` tokens stay untouched.** These are the **current canonical** Koast Design System tokens (Apr 2026 rebrand), heavily used by every dashboard, calendar, properties, pricing, and polish-pass primitive. The original conventions framing of these as "legacy PMS-era tokens to remove" was wrong — corrected at Phase 1 STOP per Q2.

5. **`koast-mark.css` keyframes → `globals.css`** alongside the `--koast-*` palette. The brand mark renders in multiple surfaces; its keyframes belong globally.

6. **`chat-shell.css` ports as a CSS module: `src/components/chat/ChatShell.module.css`** (or `chat-shell.module.css` at the chat directory level if multiple components share styles). NOT inlined as Tailwind utilities. Rationale:
   - The CSS is structured around semantic tokens, not utility classes
   - Translating to Tailwind would lose the design intent and create token drift risk
   - The koast repo already uses Tailwind for application chrome, so this is a hybrid: Tailwind for layouts/utilities elsewhere, CSS modules for the chat shell's bespoke component styles

7. **Tailwind `font-mono` stays Plus Jakarta Sans (D-13b).** This is intentional in the existing repo — `globals.css` lines 184-190 (`.font-mono`, `[data-stat]`, `.stat-value`) rely on Plus Jakarta Sans's tabular-nums OpenType feature, and 25 .tsx/.ts/.css files reference `font-mono` for stat tabular numerics. Replacing the family globally would visually shift all of those surfaces. Inside the chat shell, JetBrains Mono is consumed via the CSS module's `var(--font-mono)` token — no Tailwind change needed. If JetBrains Mono is ever required outside the chat shell via Tailwind, add it as a new family `font-koast-mono`.

8. **No new Tailwind color extensions for the chat shell's semantic layer.** The chat shell uses the CSS module exclusively — no `bg-accent` / `text-fg` Tailwind utilities are added. Keeps the global Tailwind theme clean and avoids namespace collisions.

**Phase 1 STOP findings confirmed all of the above against repo state at commit `fe63295`. See `~/koast/.m5-phase1-stop.md` Q2/Q3 for the full token-collision inventory.**

---

## 7. The KoastMark component

The banded mark SVG is the agent's avatar and the brand's structural element. Implementation discipline:

```typescript
// src/components/chat/KoastMark.tsx
type KoastMarkProps = {
  size?: number;                                  // px; default 24
  state?: 'idle' | 'active' | 'milestone';        // default 'idle'
  // NOTE: 'hero' state intentionally omitted — marketing-only per brand spec
};

export function KoastMark({ size = 24, state = 'idle' }: KoastMarkProps) {
  const isSmall = size < 32 && state === 'active';
  return (
    <span
      className="k-mark"
      data-state={state}
      data-size={isSmall ? 'small' : undefined}
      style={{ width: size, height: size, display: 'inline-block' }}
    >
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id={`k-clip-${useId()}`}>
            <circle cx="50" cy="50" r="46" />
          </clipPath>
        </defs>
        <g clipPath={`url(#k-clip-${useId()})`} className="bands">
          <rect className="b1" x="0" y="4"  width="100" height="23" fill="#d4eef0" />
          <rect className="b2" x="0" y="27" width="100" height="20" fill="#a8e0e3" />
          <rect className="b3" x="0" y="47" width="100" height="18" fill="#4cc4cc" />
          <rect className="b4" x="0" y="65" width="100" height="17" fill="#2ba2ad" />
          <rect className="b5" x="0" y="82" width="100" height="14" fill="#0e7a8a" />
        </g>
      </svg>
    </span>
  );
}
```

Notes:
- `useId()` is React's built-in for SSR-safe unique IDs (the Phase C HTML uses static IDs which would collide across multiple marks on a page)
- The hero state is intentionally not in the prop union — TypeScript prevents accidental use in product
- Animations are gated by `prefers-reduced-motion` in `koast-mark.css` (already shipped with the brand bundle)

---

## 8. SSE event mapping — actual M4 events vs. design's expected events

The Phase C handoff README enumerates 11 SSE event types. **7 of them exist in M4 today** (corrected at Phase 1 STOP per D-F1 — original conventions claim of 6 was wrong; `turn_started` IS emitted). The other 4 are forward-looking — surfaced by the design but not yet emitted by the substrate.

| Event | Status in M4 | Maps to UI state | Notes |
|-------|--------------|-------------------|-------|
| `token` | ✅ emits | streaming text append | M4's hybrid SDK consumption produces text deltas via for-await |
| `tool_call_started` | ✅ emits | `<ToolCall state="in-flight">` | Avatar stays active |
| `tool_call_completed` | ✅ emits | mutate same `<ToolCall>` to `state="completed"` | DO NOT remove + re-insert |
| `done` | ✅ emits | avatar idle, composer enabled, RespondingRow unmounts | |
| `error` | ✅ emits | preserve partial + ErrorBlock + composer re-enabled | |
| `refusal` | ✅ emits | render as agent text + optional RefusalTag | No special chrome |
| `turn_started` | ✅ emits | start of streaming, RespondingRow mounts | M4 emits this at `src/lib/agent/loop.ts:232` (`yield { type: "turn_started", conversation_id }`) at the start of each turn. The reducer's `idle → streaming` transition fires on this event, NOT on POST. Client consumes `conversation_id` to identify the new turn. |
| `tool_call_failed` | ❌ not in M4 | error variant on a single tool, not the whole turn | **M5 substitute:** treat tool failure as a turn-level `error` for now; revisit in M6+ |
| `action_proposed` | ❌ not in M4 | render `<ActionProposal>` block | **M5 substitute:** action proposals don't render in M5; the substrate doesn't yet propose actions. State 08 (action proposal) is built but not driven by live data — wired up when M6/M7 adds the substrate event |
| `memory_write_pending` | ❌ not in M4 | render `<MemoryArtifact state="pending">` | **M5 substitute:** memory artifacts don't render in M5 from live data; State 14 is built but not driven. Wired when substrate emits the event |
| `memory_write_saved` | ❌ not in M4 | mutate to saved state, fire avatar milestone | Same as above |

**Implication for M5 implementation:**
- Build all 14 state components — the design specifies them, the components.md gives prop signatures, the state files give markup
- Wire the 7 events that M4 emits to their corresponding states
- Leave the 4 forward-looking events as TypeScript types in `src/lib/agent-client/types.ts` with `// TODO M6/M7` comments — **types only, no reducer branches** (D-FORWARD-EVENTS in §12). When the substrate adds these events, the reducer's exhaustive `switch` triggers a TS exhaustiveness error, forcing paired implementation. Dead code branches are worse than no code.
- ActionProposal and MemoryArtifact components exist but are only reachable via documented preview routes (`(dashboard)/_preview/m5-states/[state]/page.tsx`) until the substrate emits their events. Preview routes are unlinked from product nav, no auth bypass, no env flag (D-PREVIEW-ROUTES in §12).

This is honest: M5 ships a chat shell that handles every event the substrate currently emits, plus components ready to handle events the substrate will emit later. We don't ship dead code — the M6+ components are reachable via documented preview routes for design review.

**Carry-forward to M6/M7:** the 4 forward-looking events (`tool_call_failed`, `action_proposed`, `memory_write_pending`, `memory_write_saved`) get added to `src/lib/agent/sse.ts` (server) and `src/lib/agent-client/types.ts` (client) as their corresponding milestones land.

---

## 9. Test discipline

Match M2-M4 patterns:

- **Unit tests** for `parseSSEEvent.ts` and `turnReducer.ts`. These are pure functions; test the state transitions for every event type, including edge cases (out-of-order events, partial events, error mid-stream).
- **Component tests** (vitest + testing-library/react) for the components with non-trivial state: `<ToolCall>`, `<MemoryArtifact>`, `<Composer>`, `<EmptyState>`. Lighter-touch tests for purely-visual components (rendering shape only).
- **Hook tests** for `useAgentTurn` with a mocked SSE stream — verify the hook drives the reducer correctly through a representative turn (token + tool_call_started + tool_call_completed + done).
- **Integration test** at the route level: render `<ChatShell>` with a mocked SSE endpoint, simulate a user submission, verify the rendered DOM matches the streaming → completed flow.
- **Staging smoke** against the live M4 endpoint: open the chat shell in a real browser, submit a message that triggers `read_memory`, verify the SSE roundtrip renders correctly. Same shape as M4's staging smoke. Cost expectation: ~$0.0018/turn.

Test count target (rough): ~30 unit, ~20 component/hook, ~3 integration, 1 staging smoke. Pattern matches M2-M4's ~50/3 split.

---

## 10. Carry-forwards (open items)

These are decisions deferred or items that need attention beyond M5's scope. Captured here so they don't get lost.

1. **4 forward-looking SSE events** (`tool_call_failed`, `action_proposed`, `memory_write_pending`, `memory_write_saved`) — the substrate (`src/lib/agent/sse.ts` + the loop) needs to emit these in M6/M7. (Phase 1 STOP corrected the original count of 5 — `turn_started` is already emitted by M4.)

2. **Memory artifact pending TTL** — design surfaced this as unspecified. Default for v1: persists across turns until the host explicitly accepts/rejects/dismisses; dismisses on conversation close. Revisit when implementation lands and we see how it feels.

3. **Mobile drawer interaction** — `≤200ms` slide with `--ease-default`, scrim `rgba(15, 24, 21, 0.32)` per the design README. Implementation choice in M5; revisit if it feels off.

4. **Tablet breakpoint (640-960px)** — rail compresses to 200px, content padding reduces to 24px. Minimum viable; refine in M6 polish.

5. **Dark mode QA** — tokens support it, but states 04/06/08/10/14 specifically need visual verification in dark theme. M5 implementation leaves dark mode functional but unverified; M6 polish includes dedicated dark QA.

6. **Accessibility audit** — design README lists a11y requirements per component. M5 implements them as listed. A formal audit (screen reader walkthrough, keyboard-only navigation, contrast verification) is M6+ work.

7. **Keyboard shortcuts** — `⌘/Ctrl+Enter` to send, `Esc` to cancel streaming, `↑` to recall last message. M5 implements `⌘/Ctrl+Enter` and `Esc`; `↑` recall is deferred unless trivial.

8. **Scroll-to-bottom behavior — clarified post-smoke (2026-05-03).** Auto-scroll rule SHIPS in M5: stick to bottom while streaming when the user is within ~120px of bottom; once they scroll up further, stop auto-following so they can read earlier turns without being yanked. Re-enables on submit. Implemented in `ChatClient` via a scroll-anchored ref + `onScroll` handler attached to `<Surface>`'s scroll container. The "↓ new" pill (a floating affordance to jump back to the bottom when content is below the fold) is the part that's deferred to M6 polish, not the underlying anchor rule.

9. **Conversation grouping rules in the rail** — "Today / Yesterday / This week / Older" labels are spec'd; bucketing rules ("this week" = last 7 days vs. since Monday?) are an M5 implementation choice. Default: rolling 7-day windows.

10. **Property context dropdown panel — REMOVED (now in M5 scope per D18, post-smoke 2026-05-03).** The original framing as "M5 stub: trigger opens a placeholder panel, real design lands in M6" was wrong. Smoke surfaced that without the dropdown the chat shell cannot populate `ui_context.active_property_id`, which makes `read_memory` (the agent's primary differentiator) unreachable from the chat surface. M5 now ships a working dropdown — quiet hairline-bordered panel, list of host's properties from `listProperties(hostId)`, click-to-select, persists across navigation via sessionStorage. Full design polish (loading state, empty-state CTAs, search filter) is M6 polish if real conversations show the need. See D18 in §12.

11. **Audit log surface** — icon button in topbar wired to nothing. The audit log is M7+ artifact work. M5 disables the button or links to a placeholder route.

12. **Error variants** — only connection-loss is shown. Server errors (500), rate limits (429), content-policy refusals — borrow `.err` chrome and vary text. M5 implements connection + server (basic); rate limits are forward-looking.

13. **Action proposal collapse-after-approval** — common pattern, not designed in M5. M5 leaves the proposal block in-place after approval; M6 polish adds collapse-to-summary.

14. **Long-prose tool-call collapse-all** — for messages with 5+ tool calls, do we need a "collapse all" affordance? Spec is silent. M5 leaves all tools individually expandable; revisit if real conversations surface the need.

15. **KoastMark milestone state — visual stub.** D-FORWARD-EVENTS ships the milestone state machine: `data-state="milestone"` flips for ~2s on `memory_write_saved`, then returns to `idle`. The full deposit visual (`k-milestone-ghost` + `k-milestone-stack` keyframes) targets `.ghost` / `.stack` SVG groups that are NOT in the basic 5-band markup the chat shell uses. State machine works today; the visual fallback is the idle mark. Full deposit visual lands in M6 polish when memory_write_saved is wired live and the markup gains the layered groups.

16. **Self-hosted fonts in TTF format.** D-F5 ships TTF variable fonts (`/fonts/koast/JetBrainsMono-VariableFont_wght.ttf` + italic). Production-grade font delivery typically uses woff2 (30-50% smaller payload, faster first paint). M5 ships TTF — they load and render correctly under `@font-face` `format('truetype-variations')`. M6 polish: convert to woff2, update `@font-face` `src` declarations to prefer woff2 with TTF fallback, verify visual parity. Not blocking M5.

17. **Component test infrastructure deferred to M6.** Component-level tests for the chat surfaces (ActionProposal, MemoryArtifact, ErrorBlock, RefusalTag, EmptyState, Composer, RespondingRow, ToolCall) require `jest-environment-jsdom` + `@testing-library/react` + `@testing-library/jest-dom` + a CSS-module identity-obj-proxy mock. Adding them in M5 breaches the "no new dependencies" invariant CP2 locked in. M5 ships unit tests for the pure-function layer (`parseSSEEvent` + `turnReducer` + `sse-integration` = 39 tests) plus 10 server-side tests for D19's ui_context helpers (49 total chat-scope tests + 156 prior agent-loop tests = 205 across the repo) and relies on the staging smoke for end-to-end UI verification. M6 polish picks up the dep additions + ~20 component tests targeted at `components.md` prop signatures (especially the four-state Composer keyboard handling and the pending→saved MemoryArtifact transition that fires the parent KoastMark milestone). Acceptable at M5's risk profile because the components are largely declarative and the live SSE path is exercised end-to-end by the smoke.

18. **M4-era ui_context plumbing gap — RESOLVED in M5 (per D19, post-smoke 2026-05-03).** Discovered during M5 staging smoke #2: the agent kept asking for the property UUID even though Villa Jamaica was selected in the chat shell. Tracing the chain end-to-end surfaced an M4-era bug compounded across three layers — (a) the `/api/agent/turn` route validated `ui_context` via Zod but destructured it out and never forwarded it to `runAgentTurn`; (b) `loop.ts` had no `ui_context` field on `RunAgentTurnInput` at all; (c) `system-prompt.ts`'s header documented the design intent ("ui_context hints go into messages, NOT system prompt — preserves prompt cache") but no code anywhere in the loop actually injected hints into messages. Resolved in M5 commit per D19 (server-side ownership check + preamble injection at SDK-call time + 10 unit tests covering preamble shape, last-plain-user-message targeting, and unauthorized-id drop). Closing-as-resolved in M5; not deferred.

19. **Timestamp rendering — `suppressHydrationWarning` as M5 escape hatch.** Server renders timestamps in UTC (Virginia VPS); client renders in browser-local timezone (e.g., EDT). The 4-hour delta produces React hydration warnings on every mounted chat surface (`RailList.conv-time`, `Meta.stamp`, `DayDivider.day`). M5 applies `suppressHydrationWarning` to all timestamp spans/divs in the chat surfaces — React's sanctioned escape hatch for known TZ-driven server/client mismatches. Caught during M5 staging smoke #3 (2026-05-03). M6 polish: pick a canonical timestamp strategy and implement consistently on server + client. Options: (a) commit to UTC display everywhere; (b) use date-fns `formatDistanceToNow` which renders identically given a fixed Date input; (c) read host's saved timezone from a profile field and render in that consistently. Decision deferred to M6 once the host-timezone product question is resolved (today there's no `users.timezone` column). Also note: the rail's bucket labels ("Today / Yesterday / This week / Older") are computed from `last_turn_at` against `new Date()` and could in principle bucket differently between server (UTC) and client (browser-local) for boundary-time conversations, producing structural DOM differences (a "Today" section appearing/disappearing). Not observed yet; if it surfaces, the fix is to defer grouping to a client-only post-mount pass.

---

## 11. Phase 1 STOP — questions to answer before authoring

The first Claude Code session for M5 starts with Phase 1 STOP per CLAUDE.md discipline. Surface these questions before writing any code:

1. **App Router structure:** does `(dashboard)` exist exactly as proposed? If not, what's the actual route group / auth scope structure?
2. **Existing globals.css:** does it have legacy PMS-era tokens (`--golden`, `--coastal`, `--mangrove`, `--tideline`)? What's the cleanup scope — drop them, deprecate, or leave?
3. **Existing Tailwind config:** what's already there for colors and fonts? Does adding the brand tokens conflict?
4. **Existing client-state pattern:** is there a TanStack Query / Zustand / context provider chrome the chat shell should slot into, or does it own its own state cleanly?
5. **Existing nav/rail in `(dashboard)`:** does the chat shell's rail replace it, sit alongside it, or get nested inside it?
6. **Auth flow client-side:** what's the existing pattern for getting the authenticated user on the client (cookie-based session, middleware-injected, hook)?
7. **Existing dashboard pages reachability:** do PropertyDetail / AnalyticsDashboard / PricingDashboard need to remain accessible from the chat shell's nav, or are they being deprecated?
8. **Conversation persistence:** the M4 schema has `agent_conversations` table; what's the existing pattern for loading conversation history on page mount? Is there a server-side fetch already in the M4 API or does M5 build it?
9. **Repomix discipline:** confirm `~/koast/CLAUDE.md` requires reading repomix output first, then run repomix, then proceed.

The answers to these become the first decisions logged in the M5 session report.

---

## 12. Architectural decisions (locked)

Decisions made during M5 conventions authoring. Add to this list during Phase 1 STOP and during implementation.

1. **M5 location:** `src/app/(dashboard)/chat/...` route family inside the existing authenticated route group.
2. **Component module:** `src/components/chat/` for all M5-specific components; reuse existing UI primitives only where they exist and match the design.
3. **Client agent module:** `src/lib/agent-client/` mirrors but does not import from `src/lib/agent/`.
4. **State management:** reducer + hook pattern; no new global state library.
5. **CSS port:** tokens to `globals.css`, motion keyframes alongside, chat shell styles as a CSS module.
6. **Tailwind extension:** add Plus Jakarta Sans + JetBrains Mono to `fontFamily`; add semantic color tokens to `theme.extend.colors` for non-chat uses.
7. **KoastMark component:** reusable, hero-state intentionally excluded from the type union.
8. **SSE event handling:** M5 wires the 6 events M4 emits; the 5 forward-looking events have typed shapes but no live data path until M6/M7.
9. **ActionProposal + MemoryArtifact components:** built per spec, reachable via documented preview routes, not live in the chat surface until substrate emits the events.
10. **Test discipline:** matches M2-M4 (~50 unit + ~3 integration + 1 staging smoke).

### Phase 1 STOP additions (locked 2026-05-03 against commit `fe63295`)

These decisions resolve the 9 §11 questions plus 5 surface findings (F1-F5) discovered during Phase 1 STOP. Full provenance: `~/koast/.m5-phase1-stop.md`. Where a Phase 1 STOP decision refines a pre-authoring decision above (e.g., D-13a refines D5), the refinement supersedes.

**D11 — Chat surface route placement** (refines D1; resolves Q1).
Routes: `src/app/(dashboard)/chat/page.tsx` (landing / fresh thread) and `src/app/(dashboard)/chat/[conversation_id]/page.tsx` (existing conversation). Inside the existing authenticated `(dashboard)` route group; `chat/` directory does not yet exist (verified). No prior `ChatShell` component or `/chat` reference anywhere in `src/`.

**D12 — Client state pattern** (locks D4; resolves Q4).
Reducer + hook (`useReducer` + `useAgentTurn`) inside `src/lib/agent-client/`. Repo currently has zero `useReducer`/`useQuery`/`useSWR`/`zustand`/`jotai`/`createContext` usage; the pattern is consistent with the established lightweight-React approach. No new dependency.

**D-13a — CSS port: token namespace + scoping** (refines D5; resolves Q2; see updated §6).
- Palette tokens (`--koast-shore`/`-deep-sea`/`-ink`/`-shore-mist`/`-shoal`/`-tide`/`-reef`/`-trench`/`-ink-2`/`-ink-3`/`-rule`/`-bg`/`-good`/`-warn`) → `globals.css :root` as net-new (no name collisions with existing tokens).
- Type tokens (`--font-sans`, `--font-mono`, `--font-display`, `--font-body`, `--font-code`, `--font-wordmark`, `--fs-*`) → `globals.css :root` as net-new.
- Semantic layer (`--bg`, `--surface`, `--fg`, `--fg-2`, `--fg-3`, `--accent`, `--accent-deep`, `--accent-tint`, `--rule`, `--rule-strong`, `--focus-ring`, `--bg-substrate`, `--bg-tinted`, `--surface-muted`, `--fg-on-dark`) → scoped to `.chat-shell` wrapper, NOT `:root`. Avoids hijacking app-wide names.
- Shadow + radius collisions (`--shadow-md/sm/pop`, `--radius-md/xl`): scope bundle values to `.chat-shell` alongside semantic layer.
- `koast-mark.css` keyframes → `globals.css` (brand mark renders in multiple surfaces).
- `chat-shell.css` → `src/components/chat/ChatShell.module.css` (CSS module, not Tailwind).

**D-13b — Tailwind `font-mono` unchanged** (refines D6; resolves Q3).
Tailwind `font-mono` stays Plus Jakarta Sans (preserves 25 existing tabular-num surfaces in dashboard/calendar/pricing/etc.). Chat shell consumes JetBrains Mono via CSS-module `var(--font-mono)`. New family `font-koast-mono` only added if JetBrains Mono is ever needed outside the chat shell via Tailwind.

**D14 — Existing canonical Koast tokens stay** (corrects original §6 framing; resolves Q2).
`--golden`, `--coastal`, `--mangrove`, `--tideline`, `--shore`, `--shore-soft`, `--dry-sand`, `--shell`, `--lume*`, `--positive`, `--abyss`, `--coral-reef`, `--amber-tide`, `--lagoon`, `--deep-water`, `--bar-dark`, etc. are the **current canonical** Koast Design System tokens (Apr 2026 rebrand), not "legacy PMS-era" artifacts. Heavily used by every dashboard surface and the polish-pass primitive set. Leave untouched.

**D15 / D-Q5 — Dashboard layout early-return for `/chat/*`** (resolves Q5; phrasing corrected during step 14.5d).
Modify `(dashboard)/layout.tsx` with a TRUE early-return `<>{children}</>` when `pathname?.startsWith('/chat')` (and the documented preview routes `pathname?.startsWith('/_preview/m5-states')` per D-PREVIEW-ROUTES). Bypasses `<DesktopSidebar>` / `<MobileSidebar>` / the dashboard `<header>` / `<ToastProvider>` / `<CommandPalette>` so the chat shell renders edge to edge — Topbar lives inside the chat surface, not in the dashboard chrome. Same auth scope (the early-return is inside the `(dashboard)` route group, so middleware auth still gates the route).

**Note — divergence from the original §3 framing:** the original phrasing claimed this was "consistent with the layout's existing `pathname === '/calendar'` / `'/messages'` / `^/properties/[^/]+$` conditional branches." That was loose. Those existing branches are NOT early-returns — they only vary the inner wrapping inside `<main>` (sidebar + header still render in /calendar, /messages, and the property-detail route). Chat genuinely needs a harder bypass because the dashboard topbar would compete with the chat Topbar and the CommandPalette would steal the chat shell's keyboard surface (⌘K, ⌘Enter). The early-return is the correct call; the "consistent with" framing is replaced by this paragraph. Fallback: sibling `(chat)` route group with its own layout was considered and not needed — the early-return inside `(dashboard)` keeps the auth boundary clean without an extra route group.

**D16 — Mock SSE driver shape for preview routes** (resolves M5 prompt step 14).
Pure-JS `AgentStreamEvent[]` array + `setTimeout`-staged dispatcher in `src/lib/agent-client/__mock__/mockStream.ts`. Reused by component tests, integration test, and `_preview/m5-states/[state]/page.tsx` routes. No external mock library.

**D-F1 — `turn_started` wired directly; 7 emitted / 4 forward-looking** (corrects original D8 + §8).
M4 emits `turn_started` at `src/lib/agent/loop.ts:232` (`yield { type: "turn_started", conversation_id }`). The original "M5 substitute: synthesize on POST" workaround in §8 is removed; the client's reducer transitions to `streaming` on the `turn_started` event, NOT on submit. M4 emits **7** events: `turn_started`, `token`, `tool_call_started`, `tool_call_completed`, `done`, `error`, `refusal`. Forward-looking events are **4**: `tool_call_failed`, `action_proposed`, `memory_write_pending`, `memory_write_saved`.

**D-F2 — Conversation list "preview" + property derivation** (resolves F2; M6 schema migration deferred).
`agent_conversations` has no `title` or `preview` column in the M4 schema. M5 derives at read time:
- `preview`: from the first user turn's `content_text` truncated to ~50 chars
- `propertyName`: from the first user turn's persisted `ui_context.active_property_id` resolved against `properties.name`, fallback "All properties"
- `timeLabel`: from `agent_conversations.last_turn_at`
M6 polish adds dedicated columns via schema migration. Captured in §10 carry-forwards.

**D-F4 / D-GITIGNORE — `.gitignore` Phase 1 STOP working files** (resolves F4 / open-question 4).
Add `.m*-phase1-stop.md` glob to `.gitignore` as part of the M5 commit. Codifies the "gitignored or removed" wording from CLAUDE.md "Phase 1 STOP discipline" §5. After commit lands, `rm .m5-phase1-stop.md` (now covered by `.gitignore` for any re-creation). Future Phase 1 STOP files (M6, M7, ...) auto-excluded.

**D-F5 / D-FONT-LOCATION — Self-host fonts at `public/fonts/koast/`** (resolves F5 / open-question 5).
Copy `PlusJakartaSans-VariableFont_wght.ttf` (+ italic) and `JetBrainsMono-VariableFont_wght.ttf` (+ italic) from `design/m5-handoff/fonts/` into `public/fonts/koast/`. `@font-face` rules in `globals.css` (or a chat-shell-scoped `@font-face` block) point at `/fonts/koast/...`. `next/font/google` Plus Jakarta Sans loading for non-chat surfaces stays untouched (same family, same weight axis — visual continuity preserved). `design/m5-handoff/` remains the canonical design-source archive; never served from.

**D-Q6 — Server-component pages + Client Component for SSE** (resolves Q6).
`src/app/(dashboard)/chat/page.tsx` and `src/app/(dashboard)/chat/[conversation_id]/page.tsx` are server components. They fetch via `createClient()` + `createServiceClient()` (matches `messages/page.tsx` pattern), `auth.getUser()` for host identity, and pass typed conversation/turns props into a `<ChatClient>` Client Component that owns the SSE state machine and composer. No new API routes for v1 — reads use server-side fetch; writes (POST `/api/agent/turn`) use the existing M4 endpoint.

**D-Q8 — Conversation read functions in `conversation.ts`** (resolves Q8).
Add to `src/lib/agent/conversation.ts`:
- `listConversations(host_id: string): Promise<ConversationListItem[]>` — `SELECT id, host_id, status, started_at, last_turn_at` filtered by host, ordered by `last_turn_at DESC`. Includes derived `preview` (per D-F2) and resolved `propertyName`.
- `loadTurnsForConversation(conversation_id: string, host_id: string): Promise<UITurn[]>` — host-ownership check + ordered `SELECT *` from `agent_turns`, parsed into a UI-ready typed shape (parsed `tool_calls` JSONB, refusal/error rendered, etc.).
Server-side only; consumed directly by chat page server components. No new API routes.

**D-FORWARD-EVENTS — Forward-looking events: types only, no reducer branches** (resolves open-question 2; refines D8 / D-F1).
Declare `tool_call_failed`, `action_proposed`, `memory_write_pending`, `memory_write_saved` as TypeScript types in `src/lib/agent-client/types.ts` with `// TODO M6/M7` markers. **Reducer does NOT include `case` branches for these.** When the substrate adds them, the reducer's exhaustive `switch` triggers a TS exhaustiveness error, forcing paired implementation. Dead code branches are worse than no code.

**D-PREVIEW-ROUTES — Preview routes** (resolves open-question 3).
`src/app/(dashboard)/_preview/m5-states/[state]/page.tsx` route family renders states 08 (ActionProposal) and 14 (MemoryArtifact) driven by the D16 mock dispatcher. Routes are **unlinked from product nav, no auth bypass, no env flag gating** — accessible by direct URL only. Documented in M5 session report. Future M6/M7 substrate work can flip them to live data.

**D19 — ui_context plumbing: route → loop → SDK-call** (locked during step 15 staging smoke #3, 2026-05-03; resolves the M4-era gap captured as CF§10 #18).
The chat shell sends `ui_context.active_property_id` correctly, but the substrate dropped it at multiple layers — Zod-validated then destructured-out at the route, never modeled in `RunAgentTurnInput`, and the documented "inject into messages, preserve prompt cache" design (system-prompt.ts header) was never wired. Locked path:
- **Route forwards.** `src/app/api/agent/turn/route.ts` destructures `ui_context` and passes it to `runAgentTurn` alongside `host`, `conversation_id`, `user_message_text`.
- **Loop accepts.** `RunAgentTurnInput` gains `ui_context?: { active_property_id?: string }` (extensible shape — future hints add fields here, not new params).
- **Server-side ownership check.** Before any context injection, `resolveActiveProperty(hostId, ui_context)` does a `SELECT id, name, user_id FROM properties WHERE id = $id`, then verifies `user_id === hostId`. Mismatch logs warn (`unauthorized active_property_id attempted: host={id} requested={id}`) and returns null — turn proceeds without preamble. Permissive on UX (stale sessionStorage, deleted property), audit-friendly for genuine spoof attempts.
- **Preamble injection at SDK-call time.** `prependActiveContextToLastUserMessage` returns a copy of the messages array with `buildActivePropertyPreamble({ name, id })` prepended to the last *plain* user message (skips synthetic tool_result entries). Persistence is unchanged — `agent_turns.content_text` keeps the host's verbatim text. `reconstructHistory` continues to read clean rows; preambles never enter history. Preserves prompt-cache hits (system prompt unchanged); the per-turn variability lives in the user message, which is the right cache boundary.
- **Preamble copy (locked, do not edit casually):**

  ```
  [active context — provided by the host's UI]
  active_property = "{name}"
  active_property_id = {id}
  use this id for read_memory tool calls.
  if the host's message references a different property by name, ask them to select that property in the UI rather than guessing its id.

  ```

  Wording chosen to (a) frame the context as authoritative ("provided by the host's UI"), (b) name `read_memory` explicitly to avoid loose generalization, (c) route multi-property references back to the UI rather than letting the model guess.
- **Tests (10 added in `tests/ui-context.test.ts`):** preamble shape lock, prepend-targets-last-plain-user-message (multi-turn + skip-tool_result variants), no-op on empty preamble, ownership check pass / unauthorized-other-host / no-row paths.

**D18 — `listProperties(host_id)` server reader + chat-shell property dropdown** (locked during step 15 staging smoke, 2026-05-03; resolves a misclassification in original §10 #10).
The original conventions framed the property dropdown as M6 polish. The first staging-smoke pass surfaced that without it, `ui_context.active_property_id` cannot be populated from the chat shell, so `read_memory` (the agent's primary differentiator) is unreachable. M5 cannot ship a chat shell where the product's central tool is unexercisable. Decision:
- Add `listProperties(hostId)` to `src/lib/agent/conversation.ts` alongside the other D-Q8 server readers. Reads `properties WHERE user_id = hostId`, ordered by name. Returns `ChatPropertyOption[]` = `{ id, name, meta }` where meta is "City · N br".
- Server pages (`/chat`, `/chat/[conversation_id]`) fetch properties + conversations in parallel and pass to `<ChatClient>` as a typed prop.
- `<PropertyContext>` extends with the open-state dropdown panel: hairline border, no shadow (anti-pattern §14), click-to-select, outside-click + Escape to close. Selection persisted to sessionStorage so it survives /chat ↔ /chat/[id] navigation.
- `<ChatClient>` owns `activePropertyId` state and merges `{ active_property_id }` into the `ui_context` prop on every `submit()` call. The hook (`useAgentTurn`) was already wired to forward `ui_context` into the POST body — no changes there.

Net effect: `read_memory` becomes reachable from the chat shell as soon as a property is selected; the empty-property fleet is gracefully handled (panel shows "No properties yet" instead of opening empty).

**D17 — Prop signature refinements vs. components.md** (locked during steps 9-14.5; documents implementation as source of truth for M5).
Three component prop signatures landed in CP2 (steps 6-8) that diverge from `handoff/components.md`. Implementation supersedes spec for M5; the M5 session report references this decision so M6 can either back-port to `components.md` or refactor the components to match the spec.
- **Topbar** — flat handler props `onOpenAuditLog?` / `onNewThread?` / `onOpenPropertyMenu?` instead of the spec's nested `actions: { auditLog, newThread }` object. Flat props match the rest of the chat-shell components and avoid an unnecessary wrapper object.
- **ToolCall** — `resultBody?: ReactNode` instead of `result?: ToolResult`; the failure variant is carried by `state: 'in-flight' | 'completed' | 'failed'` rather than a separate `success: boolean`. Reasoning: the visual contract is three states, not two-states-plus-flag; collapsing to a discriminated state union matches the rest of the reducer's vocabulary.
- **Composer** — `onEscape?: () => void` callback instead of a generic event hook; the four visual states (`empty` / `typing` / `sending` / `blocked`) are preserved and `Esc` while `state === 'blocked'` is the documented cancel path.

Net impact: `<ChatClient>` parses the wire-level `input_summary` string (`"key=value · key=value"`) into the `Record<string, string>` shape via a small `parseParams` helper before passing to `<ToolCall>`. No behavior change vs. spec — just a wire-format vs. component-prop boundary that landed inside ChatClient rather than in ToolCall itself.

---

## 13. Implementation order (suggested)

Per the Phase C handoff README, with M5-specific adjustments:

1. **Phase 1 STOP** — answer §11 questions, log decisions, run repomix
2. **Tokens + fonts** — port `colors_and_type.css` to `globals.css`; verify Plus Jakarta Sans + JetBrains Mono load with `font-display: swap`; add Tailwind config extensions
3. **`<KoastMark>`** — implement the component, verify all four motion states render correctly with `koast-mark.css` keyframes
4. **`<ChatShell>` + `<Rail>` + `<Surface>` skeleton** — validate against state 02 (conversation list)
5. **`<Turn>` + `<Meta>` + `<UserMessage>` + `<KoastMessage>`** — validate against state 03 (message stream)
6. **`<ToolCall>` (3 states)** — validate against states 05, 06, 07
7. **Client SSE module** — `parseSSEEvent`, `turnReducer`, `useAgentTurn`; unit tests for each
8. **Wire SSE → state machine** — validate streaming path: state 04 (streaming) → state 09 (completed turn)
9. **`<ActionProposal>`, `<ErrorBlock>`, `<RefusalTag>`** — validate states 08, 10, 11
10. **`<MemoryArtifact>`** — validate state 14, including milestone animation trigger
11. **`<EmptyState>`** — validate state 01
12. **`<Composer>` (4 states) + `<RespondingRow>`** — validate state 12
13. **Mobile pass** — validate state 13
14. **Staging smoke** — live M4 endpoint roundtrip
15. **Session report** — `docs/architecture/agent-loop-v1-milestone-5-report.md` capturing decisions, deviations, test counts, costs, carry-forwards
16. **Commit** — single commit with the M5-conventions doc + the implementation, per M2-M4 commit pattern

---

## 14. Anti-patterns (do not ship)

From the Phase C handoff README, repeated here for emphasis:

- ❌ "Welcome to Koast" banner, hero illustration, or example-prompt chips on the empty state
- ❌ Gradient backgrounds anywhere in the chat surface
- ❌ Shadow-elevated cards (proposals, memory artifacts, anything)
- ❌ Purple — or any color outside the locked palette
- ❌ Tool calls rendered as separate cards above/below agent messages
- ❌ Chip-style status pills (use a colored dot)
- ❌ Top-right "AI" badge, model-name indicator, or "Powered by Claude" inside the chat surface
- ❌ Icon-only buttons for primary actions (always text + small icon, e.g., "Approve →")
- ❌ Typewriter cursor in streaming text (use the `.stream-tail` block)
- ❌ Toast notifications for errors (use inline `.err`)
- ❌ Pill-rounded inputs or message bubbles
- ❌ Avatar in `data-state="hero"` (marketing-only; runs continuously; feels restless inside a tool)

Plus M5-specific anti-patterns:

- ❌ Importing from `src/lib/agent/` on the client side (server code)
- ❌ Defining new color, font, or spacing values outside the locked design system
- ❌ Re-implementing motion keyframes that exist in `koast-mark.css`
- ❌ Using a global state library where the reducer + hook pattern suffices
- ❌ Lifting `<ToolCall>` out of `<KoastMessage>` into a sibling card (the design is explicit: tool calls are inline in source order)
- ❌ Co-Authored-By trailers in commits (per CLAUDE.md)

---

## 15. Success criteria

M5 is complete when:

- All 14 state files from the Phase C bundle have corresponding React components in the koast repo
- The 7 M4-emitted SSE events drive their corresponding UI transitions correctly
- The 4 forward-looking events have typed shapes ready for M6/M7 wiring
- Staging smoke roundtrip passes — chat shell renders a live conversation including a `read_memory` tool call
- Test counts match M2-M4 discipline (unit + integration + smoke)
- `agent-loop-v1-milestone-5-report.md` written with decisions, costs, deviations, carry-forwards
- Commit lands on main with no Co-Authored-By trailer
- Visual quality at the experiential bar: Cursor-quality, Claude.ai-quality, Linear-adjacent

---

*End of M5 conventions. Updated as Phase 1 STOP and implementation surface new architectural questions.*
