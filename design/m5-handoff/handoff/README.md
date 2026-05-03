# M5 — Koast chat shell · implementation handoff

> **Read this first.** You're a Claude Code instance receiving 14 design states
> for the foundational Koast chat shell. This document describes what to build,
> what data each state receives, what state transitions occur, and what's left
> to your discretion.

---

## What's in the bundle

```
handoff/
├── README.md               ← you are here
├── chat-shell.css          ← shared component CSS (consume verbatim or port to your styling system)
├── _mark.svg.html          ← canonical 5-band Koast mark (b1..b5) — inline as SVG, animate via koast-mark.css
├── components.md           ← machine-readable component spec (component tree, props, slots)
└── states/
    ├── 01-empty.html
    ├── 02-conversation-list.html
    ├── 03-message-stream.html
    ├── 04-streaming.html
    ├── 05-inline-tool-call.html
    ├── 06-tool-call-in-flight.html
    ├── 07-tool-call-completed.html
    ├── 08-action-proposal.html
    ├── 09-completed-turn.html
    ├── 10-error.html
    ├── 11-refusal.html
    ├── 12-input-bar.html
    ├── 13-mobile.html
    └── 14-memory-artifact.html
```

Each state file is self-contained HTML you can open directly in a browser to
inspect markup, computed styles, and animation timing. Treat the markup in
those files as the **structural source of truth**; treat `chat-shell.css` as
the **style source of truth**. Both consume:

- `colors_and_type.css` — design tokens (palette, type, spacing, radii, motion easings)
- `koast-mark.css`      — motion vocabulary for the brand mark
- `assets/logos/*.svg`  — static logo masters

Don't introduce new colors, new fonts, or new spacing values. The design system
is locked. If you find yourself needing one, **stop and ask** — it's a system
gap, not an implementation choice.

---

## The product, in one paragraph

Koast is the conversational interface a short-term-rental host uses to
operate their portfolio. The agent sits on top of an existing agent loop
(SSE-streamed). Visual register is **Cursor-quality, Claude.ai-quality,
Linear-adjacent**. Quiet by default, alive during action. No SaaS-AI tropes:
no purple, no gradients, no glow, no "Welcome to Koast" banner, no model-name
badge, no chip-style status pills. Status is always a colored dot.

---

## Component tree

```
<App>
  <ChatShell theme="light|dark">          // grid: 240px rail | 1fr surface
    <Rail>                                 // collapses behind hamburger <960px
      <RailHead brand newConversationButton/>
      <RailList groups={[{label, items: Conversation[]}]}/>
      <RailFoot user/>
    </Rail>
    <Surface>
      <Topbar>
        <PropertyContext property menuTrigger/>
        <TopbarActions auditLog newThread/>
      </Topbar>
      <Scroll>                             // max-w 720px content column
        <Day label/>
        <Turn role="user|koast">
          <Meta who time avatar/>
          <Body>                           // user: bubble · koast: prose
            <Markdown/>
            <ToolCall  state="collapsed|in-flight|completed|expanded"/>
            <ActionProposal action why ctas/>
            <MemoryArtifact fact state="pending|saved"/>
            <ErrorBlock kind="connection|server" onRetry/>
            <RefusalBlock scopeTags/>
          </Body>
        </Turn>
        ...
      </Scroll>
      <Composer state="empty|typing|sending|blocked"/>
      <RespondingRow visible={agent.streaming}/>  // sits below composer
    </Surface>
  </ChatShell>
</App>
```

`components.md` is the machine-readable version of the same tree with prop
types, slot lists, and per-component a11y notes.

---

## SSE event → visual transition mapping

The chat surface is driven entirely by SSE events from the agent loop. Map each
event type to the visual transition listed here. **A turn is the unit of
state.** A `Turn` instance is created on `turn_started` and closed on `done`,
`error`, or `refusal`. All events between those bounds belong to it.

| SSE event              | Visual transition                                                                                              | State file(s)                                  |
|------------------------|----------------------------------------------------------------------------------------------------------------|------------------------------------------------|
| `turn_started`         | Insert empty `<Turn role="koast">` with avatar in `data-state="active"` (or `active`+`data-size="small"` if avatar is 16-31px). Composer enters `is-disabled`; `<RespondingRow>` mounts. | 04-streaming · 06-tool-call-in-flight          |
| `token`                | Append text to the current paragraph. Use the `.reveal` class for the first paragraph render (360ms fade-up). Subsequent paragraphs created by `\n\n` get a fresh `.reveal s2..s5`. The active "tail" is a `.stream-tail` block — NOT a typewriter cursor. | 04-streaming                                   |
| `tool_call_started`    | Append `<span class="tool in-flight">` to current message body. Show tool name in mono, params dim, `tool-dur="resolving"`, plus `<span class="pulse">`. Avatar stays active.                          | 06-tool-call-in-flight                         |
| `tool_call_completed`  | Mutate the same `.tool` node: drop `.in-flight`, set duration to actual ms (tabular-nums), swap pulse for chevron. The completed tool keeps its inline position — DO NOT move it.                       | 07-tool-call-completed                         |
| `tool_call_failed`     | Same node, replace duration with `failed` styled in `--koast-warn`, append a thin retry control to the right of the row.                                                                                | (combine 07 + 10)                              |
| `action_proposed`      | Render `<ActionProposal>` block inside current message body. Buttons: Approve (primary), 1-3 alternatives (secondary), "I'll write it" (ghost). Avatar stays active until proposal fully rendered.       | 08-action-proposal                             |
| `memory_write_pending` | Render `<MemoryArtifact state="pending">` — fact rendered with key+val tags, three buttons: Save / Edit / Discard. Avatar idles.                                                                         | 14-memory-artifact                             |
| `memory_write_saved`   | Mutate to `state="saved"`: replace the action row with `<MemorySaved>` ("Saved · 1 layer settled"). Trigger **milestone** state on the avatar (`data-state="milestone"`) for one shot, then return to idle. | 14-memory-artifact                             |
| `done`                 | Drop avatar back to `data-state="idle"`. Composer leaves `is-disabled`, `<RespondingRow>` unmounts. Auto-focus the textarea unless user is scrolled away from the bottom.                                | 09-completed-turn                              |
| `error`                | Preserve any partial message content. Append `<ErrorBlock kind="connection">` inline with retry/dismiss controls. Avatar drops to idle. Composer is **re-enabled** so user can keep typing.             | 10-error                                       |
| `refusal`              | The refusal text comes through as normal `token` events — render it as the agent's own message. Optionally add a `<refusal-tag>` eyebrow if the SSE includes a `scope_tag` field. No special chrome.    | 11-refusal                                     |

### Avatar motion states

The `<KoastMark>` in the agent's meta row reflects the agent's current state:

| Agent state                         | Avatar `data-state`                                | Notes                                                        |
|-------------------------------------|----------------------------------------------------|--------------------------------------------------------------|
| Idle (no active turn)               | `idle`                                             | Default. No animation.                                       |
| Streaming text or running a tool    | `active` + `data-size="small"` (since avatar is 16px) | Brightness pulse animation runs from `koast-mark.css`.    |
| Memory write succeeded              | `milestone` (one shot, ~2s)                        | Plays once, then returns to `idle`.                          |
| At ≥32px scale (e.g. empty state)   | `active` (without `data-size`)                     | Full 5-band cascade animation.                               |

The marketing-only `hero` state must NOT be used inside the product. It runs continuously and would feel restless inside a tool.

---

## Per-state implementation notes

### 01 · Empty state
- Renders when `conversations.length === 0` for the user, OR when the user is in a fresh thread with no turns yet.
- Center column: idle 5-band mark at ~28px and a single placeholder line. No "Welcome." No tutorial. No example prompt chips.
- Property-context dropdown reads "Pick a property…" with a neutral pill (linear-gradient teal stack) since no property is selected.

### 02 · Conversation list
- Groups: Today / Yesterday / This week / Older. Render only groups that have items.
- Active conversation: `.conv.active` (shore-tone background fill, no border accent).
- Each item: name + meta line ("draft pricing for Padres weekend · 2:14 pm"). Time is mono, tabular-nums.
- **Don't** add unread dots or count badges in v1 — the spec doesn't define when a conversation is "unread."

### 03 · Message stream
- Day divider every time the local-tz date changes. Mono, uppercase, 0.18em tracking, hairline rules ::before/::after.
- User bubble: shore-mist tint, asymmetric radius `14px 14px 4px 14px`. Right-aligned. Max width 84% of column.
- Agent prose: no bubble. Body 14/1.62. `<em>` is teal-ink; `<code>` is shore-tinted with mono inside.

### 04 · Streaming
- Composer is `.is-disabled` (62% opacity, pointer-events none).
- `<RespondingRow>` below the composer with the small mark in `active`+`small` and a "stop" button on the right. The stop button cancels the SSE stream.
- The stream tail (`.stream-tail`) is a 6×14px deep-teal block, NOT a typewriter cursor. It pulses on its own keyframe (1.1s ease-in-out).

### 05 · Inline tool call (collapsed + expanded)
- Collapsed: single line, mono, hairline border, hover dims to shore. Click toggles to expanded.
- Expanded: contained block with shore-tinted header strip + result body. Result body keeps mono, with `.k` for accent values, `.n` for separators, `.dim` for parenthetical notes.
- The tool call **lives inside `.koast-msg`**, in source order. Never a card above or below the message.

### 06 · Tool call · in-flight
- `.tool.in-flight` swaps the tool icon for a spinning quarter-circle, replaces `tool-dur` with the literal text `"resolving"` styled in `--accent`, and appends `<span class="pulse">`.
- Avatar is `active`+`small`.
- Composer is `.is-disabled`.

### 07 · Tool call · completed
- Mutate the same DOM node — DO NOT replace it. The latency is now in tabular mono (e.g. `240ms`).
- Avatar drops to `idle` only when the *containing turn* completes (i.e. `done` arrives), not when this tool resolves — multiple tool calls can sequence inside one turn.

### 08 · Action proposal
- Left tide-color stripe (2px, full height) carries the affordance. NOT a card with shadow. NOT a pill-rounded container.
- Two slots: `<ProposalHead>` (statement + the action's key value as `<code>`) and `<ProposalWhy>` (mono "WHY" eyebrow + 1-3 sentences of reasoning, max-w 56ch).
- Buttons: Approve (primary, `→` icon trailing), 1-3 secondary alternatives, ghost "I'll write it" or similar.

### 09 · Completed turn
- Visual cue is **absence of motion** — avatar idle, no responding row, composer focused & ready.
- Whatever was inside the turn (text, tools, proposals, memory artifacts) stays as-rendered.

### 10 · Error
- Renders inline within the partial message — partial content is preserved, NOT discarded.
- `.err` block: warn-tinted background (5% alpha), warn-tinted border, brief "Lost connection mid-response." with Retry / Dismiss controls inline on the right.
- The composer is **re-enabled** so the user can keep typing while error chrome is present.
- Don't overdramatize — no modal, no toast, no full-bleed banner. Errors should feel handled.

### 11 · Refusal
- The agent's refusal language IS the message — no special chrome needed beyond an optional `<span class="refusal-tag">` mono eyebrow if you want to label scope (e.g. `scope · pricing · auto-approve`).
- The refusal explains *why it can't*, then proposes adjacent paths it CAN take.
- Do not gate the composer; refusals are normal turns.

### 12 · Input bar (4 states)
- `empty`: placeholder visible, send button disabled (rule-color background).
- `typing`: textarea has content, container gets `.is-focus` (deep-teal border + 3px focus ring at 10% alpha), send button active (filled `--accent-deep`).
- `sending`: textarea disabled, hint reads "sending…", send button is the spinning quarter-circle.
- `blocked` (during stream): textarea disabled, send button disabled, plus a `<RespondingRow>` below.

### 13 · Mobile (375px)
- Apply `.m-mobile` to `<body>` (or your nearest layout wrapper). The rail collapses behind a hamburger button.
- Topbar reduces padding to 14px, drops the property meta (Pacific Beach · 2 br) since it would clip.
- Content column padding drops to 16px.
- The drawer interaction itself is **NOT specified** — see "gaps" below.

### 14 · Memory artifact (pending + saved)
- `pending`: `<MemoryArtifact state="pending">` — a tinted block (teal at 7% alpha) with mono `memory · pending review` eyebrow, the fact rendered as `key val key val` chunks, and Save / Edit / Discard buttons.
- `saved`: same block, but action row replaced with `<MemorySaved>` ("Saved · 1 layer settled") and the avatar runs the **milestone** animation once.
- The fact rendering is structured: each `key`/`val` pair is its own span so the implementer can swap in real data without HTML escaping issues.

---

## Tokens (do not redefine)

Every value below comes from `colors_and_type.css`. Reach for the **semantic** token, not the raw palette.

| Use                    | Token                                |
|------------------------|--------------------------------------|
| Page background        | `var(--bg)` (`#fafaf7`)              |
| Surface (cards/inputs) | `var(--surface)` (`#ffffff`)         |
| Subtle bg / hover      | `var(--koast-shore)` (`#f7f3ec`)     |
| Body text              | `var(--fg)` (`#0f1815`)              |
| Secondary text         | `var(--fg-2)` (`#4a5552`)            |
| Tertiary / labels      | `var(--fg-3)` (`#6e7976`)            |
| Hairline rules         | `var(--rule)` (`#e7e2d6`)            |
| Brand teal (band 3)    | `var(--accent)` (`#4cc4cc`)          |
| Filled buttons         | `var(--accent-deep)` (`#0e7a8a`)     |
| Tinted bg accent       | `var(--accent-tint)` (`#d4eef0`)     |
| Warn (error)           | `var(--koast-warn)` (`#b34141`)      |
| Good (success)         | `var(--koast-good)` (`#2a7a4a`)      |
| Sans family            | `var(--font-sans)` — Plus Jakarta Sans |
| Mono family            | `var(--font-mono)` — JetBrains Mono  |
| Easing (default UI)    | `var(--ease-default)`                |

**Hairlines are 0.5px on retina, 1px otherwise.** Don't elevate cards with shadows. Don't pill-round anything except tags/badges (which we don't use here — status is dots).

---

## What's NOT specified — gaps for you to address

These were intentionally left out of M5 because they require runtime behavior or surface decisions that the design canvas can't fully describe. Flag any of these to the team if your implementation choice would be visible in the UI.

1. **Mobile drawer interaction.** The hamburger appears in 13-mobile but the drawer slide-in motion, scrim, and dismiss behavior are not specified. Use the `--ease-default` easing and keep the motion ≤200ms; scrim should be `rgba(15, 24, 21, 0.32)`.

2. **Tablet (640-960px).** The breakpoint is between mobile (`.m-mobile`) and the default desktop layout. Keep the rail visible but compress to 200px; reduce content column padding to 24px.

3. **Dark mode.** `colors_and_type.css` ships a dark theme via `[data-theme="dark"]`. The chat-shell CSS uses semantic tokens throughout so dark should "just work" — but not every state has been visually QA'd in dark. Test 04, 06, 08, 10, 14 specifically.

4. **Accessibility.**
   - `<RespondingRow>` should be `role="status"` with `aria-live="polite"`. The state files don't all set this consistently — do.
   - Tool-call expand/collapse: the collapsed `.tool` is `role="button"` already, but you need to add `aria-expanded` and tie it to the expanded panel's `id`.
   - `<MemoryArtifact>` should announce save with `aria-live="polite"` so screen readers hear "Saved · 1 layer settled" without focus.
   - All icon-only buttons in the topbar/composer need `aria-label`s — the state files have them but check after porting.
   - Reduced motion: `koast-mark.css` already disables avatar animation under `prefers-reduced-motion: reduce`. Add the same media query to `.stream-tail` and `.tool.in-flight .pulse` in your port.

5. **Keyboard shortcuts.** `⌘↵` to send is shown in the composer hint but not wired in the state files. Standard chat conventions: `Enter` → newline, `⌘/Ctrl+↵` → send, `↑` in empty composer → recall last message, `Esc` → cancel streaming (matches stop button).

6. **Scroll-to-bottom behavior.** When new tokens arrive, auto-scroll only if the user is already within ~120px of the bottom. If they've scrolled up to read history, don't yank them. Consider a small "↓ new" pill that appears at the bottom-right when content is below the fold.

7. **Conversation grouping (rail).** "Today / Yesterday / This week / Older" — these labels are the spec, but the bucketing rules (what counts as "this week" — last 7 days vs. since Monday?) are your call.

8. **Property context dropdown.** The state files render the trigger but the dropdown panel is not designed. Match the rail-list typography and keep the dropdown ≤320px wide.

9. **Audit log.** The icon-button in the topbar is wired to nothing. The audit log surface is a separate M-spec; for now, it should open a side-sheet or right-rail. Don't design it inline.

10. **Error variants.** Only the connection-loss variant is shown. Server errors (500), rate limits (429), and content-policy refusals from the upstream model all need quiet equivalents — borrow the `.err` chrome and vary the text + retry semantics.

---

## Implementation order (suggested)

1. Port tokens. Verify Plus Jakarta Sans + JetBrains Mono load correctly with `font-display: swap`.
2. Build the shell layout (rail + surface). Validate against state 02.
3. Build `<Turn>`, `<Meta>`, user/koast bodies. Validate against state 03.
4. Build `<ToolCall>` with its three states (collapsed, in-flight, completed). Validate against 05, 06, 07.
5. Wire SSE → state machine. Validate the streaming path with 04 → 09 transitions.
6. Build `<ActionProposal>`, `<ErrorBlock>`, `<RefusalBlock>`. Validate 08, 10, 11.
7. Build `<MemoryArtifact>` and the milestone animation trigger. Validate 14.
8. Build the empty state (01) and conversation list (02 — already done in step 2).
9. Mobile pass (13).

---

## Anti-patterns — do not ship these

These have all been actively rejected during M5 design. Any of them will fail review:

- ❌ "Welcome to Koast" banner, hero illustration, or example-prompt chips on the empty state
- ❌ Gradient backgrounds anywhere in the chat surface
- ❌ Shadow-elevated cards (proposals, memory artifacts, anything)
- ❌ Purple — or any color outside the locked palette
- ❌ Tool calls rendered as separate cards above/below agent messages
- ❌ Chip-style status pills (use a colored dot)
- ❌ Top-right "AI" badge, model-name indicator, or "Powered by Claude" inside the chat surface
- ❌ Icon-only buttons for primary actions (always text + small icon, e.g. "Approve →")
- ❌ Typewriter cursor in streaming text (use the `.stream-tail` block)
- ❌ Toast notifications for errors (use inline `.err`)
- ❌ Pill-rounded inputs or message bubbles
- ❌ Avatar in `data-state="hero"` (that mode is marketing-only, runs continuously, and feels restless inside a tool)

---

## Questions you may need to ask the design team

- The "stop streaming" affordance lives in `<RespondingRow>` — should it also be reachable via Esc? (Recommended yes, but unconfirmed.)
- For long agent prose with 5+ tool calls, do we need any "collapse all tools" affordance? Spec is silent.
- For the action-proposal block, should approving the action collapse the proposal into a one-line summary above the next agent message? (Common pattern; not designed in M5.)
- Memory `pending` state — is there a TTL after which an unactioned memory write expires? Not specified.

Bring these back to the design team before shipping.
