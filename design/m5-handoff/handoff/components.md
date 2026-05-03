# Components — machine-readable spec

> Each component below has a `name`, the file(s) where you can see it
> rendered, the **props** it should accept (TypeScript-style for clarity),
> the **slots** (children regions), and **a11y** notes. Style tokens are
> referenced as `--token-name` from `colors_and_type.css`.

---

## ChatShell

**Renders in:** every state file
**Hierarchy:** root component

```ts
type ChatShellProps = {
  theme?: 'light' | 'dark';        // toggles [data-theme] on the wrapper
  mobile?: boolean;                  // adds .m-mobile (collapses rail behind hamburger)
  children: [Rail, Surface];
}
```

Layout: CSS grid `240px 1fr`, full viewport height. At `mobile=true`, single column; rail is hidden.

---

## Rail

**Renders in:** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 14
**Hidden in:** 13 (mobile)

```ts
type RailProps = {
  brand: BrandSlot;                  // <RailHead> contents
  groups: ConversationGroup[];       // [{ label: 'Today', items: Conversation[] }]
  user: UserSummary;                 // { initials, name, org }
  activeConversationId?: string;
  onSelectConversation?(id): void;
  onNewConversation?(): void;
}

type Conversation = {
  id: string;
  propertyName: string;
  preview: string;                   // "draft pricing for Padres weekend"
  timeLabel: string;                 // "2:14 pm" | "mon" | "sun"
  unread?: boolean;                  // (NOT designed for v1 — see README gaps)
}
```

**a11y:** `<aside aria-label="Conversations">`. Each `.conv` is a `<button>` with the conversation name as accessible name; meta line is read as part of the button via `aria-describedby` or just appended text.

---

## Surface

**Renders in:** every state.
**Hierarchy:** sibling to `<Rail>` inside `<ChatShell>`.

```ts
type SurfaceProps = {
  topbar: TopbarSlot;
  children: Turn[];                  // streamed in
  composer: ComposerSlot;
  responding?: boolean;              // shows <RespondingRow> below composer
}
```

---

## Topbar

**Renders in:** every state.

```ts
type TopbarProps = {
  property?: { name: string, meta?: string };  // { name: "Seabreeze Loft", meta: "Pacific Beach · 2 br" }
  onOpenPropertyMenu?(): void;
  actions: { auditLog: () => void, newThread: () => void };
}
```

If `property` is undefined, render "Pick a property…" placeholder.

**a11y:** the property trigger is `<button aria-haspopup="true">`; topbar action buttons require `aria-label`.

---

## Turn

**Renders in:** every populated state.

```ts
type TurnProps = {
  role: 'user' | 'koast';
  meta: { who: string, time: string, avatar: AvatarSlot };
  children: BodyContent;             // see below
}
```

A turn's `body` is a sequence of:
- `Text` (paragraphs, with `<em>`, `<code>`, `<strong>` inline)
- `ToolCall` (collapsed, in-flight, completed, expanded)
- `ActionProposal`
- `MemoryArtifact`
- `ErrorBlock`
- `RefusalTag` (an optional eyebrow on a refusal turn)

User turns ONLY contain text. Agent turns can contain any of the above.

---

## KoastMark (avatar)

**Renders in:** every state, multiple sizes.
**Markup:** see `_mark.svg.html`. Animation classes are in `koast-mark.css`.

```ts
type KoastMarkProps = {
  size: number;                      // px; ≥32 enables full cascade, 16-31 enables brightness pulse
  state: 'idle' | 'active' | 'milestone';
  // 'hero' EXISTS but is marketing-only — do not use in product
}
```

Render attributes: `data-state="${state}"`, plus `data-size="small"` if size < 32 (and state is `active`).

**Reduced motion:** all animations are gated by `@media (prefers-reduced-motion: reduce)` — KoastMark.css already handles this.

---

## ToolCall

**Renders in:** 05, 06, 07, 08, 09, 10, 13, 14
**Three rendered forms (same DOM node, different classes):**

```ts
type ToolCallProps = {
  name: string;                      // "read_comp_set" — mono
  params: Record<string, string>;    // rendered as "key=value · key=value"
  state: 'in-flight' | 'completed' | 'failed';
  durationMs?: number;               // shown when state='completed' or 'failed'
  expanded?: boolean;                // toggles the .tool-expanded panel below
  result?: ToolResult;               // body of the expanded panel
  onToggleExpand?(): void;
}
```

**Layout rule:** `<ToolCall>` lives **inline** inside `<Turn role="koast">.body`, in the order it was streamed. Never lift it into a sibling card.

**Mutation rule:** when `tool_call_completed` arrives, mutate the existing in-flight DOM node — do NOT remove + re-insert. This preserves layout and avoids a flash.

**a11y:** the collapsed row is `role="button" tabindex="0"` and supports Enter/Space. Add `aria-expanded` and `aria-controls={expandedPanelId}`.

---

## ActionProposal

**Renders in:** 08, 13

```ts
type ActionProposalProps = {
  head: ReactNode;                   // "Push price to $199 on Airbnb · expires Tue 12:00 pm"
  why: ReactNode;                    // 1-3 sentences, max-w 56ch
  actions: Action[];                 // [{ label, kind: 'primary'|'secondary'|'ghost', icon?, onClick }]
}
```

The block is laid out with a left tide-color stripe (`border-left: 2px solid var(--accent)`). NO shadow, NO bg fill.

Buttons are `<Button kind="primary">Approve <ArrowIcon/></Button>`. Primary is filled, secondary is hairline-bordered, ghost is bare.

---

## MemoryArtifact

**Renders in:** 14

```ts
type MemoryArtifactProps = {
  state: 'pending' | 'saved';
  fact: FactSpan[];                  // alternating { kind: 'key', text } / { kind: 'val', text }
  onSave?(): void;                   // pending only
  onEdit?(): void;
  onDiscard?(): void;
  layersSettled?: number;            // shown in saved state
}
```

`fact` is rendered as a sequence of spans so values can be styled (mono, accent-deep, surface-tinted) without HTML escaping issues.

When `state` transitions `pending → saved`, also fire the **milestone** animation on the avatar in this turn (one shot via `data-state="milestone"`, then return to `idle`).

---

## ErrorBlock

**Renders in:** 10

```ts
type ErrorBlockProps = {
  kind: 'connection' | 'server' | 'rate_limit';
  message: string;                   // "Lost connection mid-response."
  onRetry?(): void;
  onDismiss?(): void;
}
```

Renders **inline**, after whatever partial content was preserved. No modal, no toast.

---

## RefusalTag

**Renders in:** 11

```ts
type RefusalTagProps = {
  scope: string[];                   // ["scope", "pricing", "auto-approve"]
}
```

A mono eyebrow rendered above the refusal text — purely a label, no chrome. Optional; if the SSE doesn't include scope tags, omit.

---

## Composer

**Renders in:** every state.
**Four states:**

```ts
type ComposerProps = {
  state: 'empty' | 'typing' | 'sending' | 'blocked';
  value: string;
  placeholder?: string;
  onChange(value: string): void;
  onSubmit(): void;
  onAttach?(file: File): void;
  onSwitchProperty?(): void;         // triggered by toolbar button OR by typing "@"
}
```

| state    | textarea | send button             | container class |
|----------|----------|-------------------------|-----------------|
| empty    | empty, enabled | disabled (rule fill)  | (none)          |
| typing   | content, enabled | active (filled deep teal) | `.is-focus` |
| sending  | content, **disabled** | spinner icon, disabled | `.is-disabled` |
| blocked  | empty (or last user msg restored), **disabled** | disabled | `.is-disabled` |

`@` triggers a property-switch popover (NOT designed in M5; treat as an open behavior).

**Keyboard:** `⌘/Ctrl+Enter` submits. `Esc` while `state==='blocked'` cancels streaming (same as the stop button).

---

## RespondingRow

**Renders in:** 04, 06, 12·4

```ts
type RespondingRowProps = {
  visible: boolean;
  onStop(): void;
}
```

A small mono row below the composer with a 12px active-pulse mark and a "stop" button. `role="status" aria-live="polite"`.

---

## EmptyState

**Renders in:** 01

```ts
type EmptyStateProps = {
  prompt?: string;                   // default: "Ask Koast about a guest, a price, a turnover."
}
```

Just an idle 28px mark and a single 17px line. No CTAs, no example chips.

---

## Day divider

```ts
type DayProps = {
  label: string;                     // "today · 2:14 pm" — local timezone
}
```

Mono, uppercase, 0.18em tracking, hairline rules left and right of the label.

---

## State machine — one turn

```
                              [user submits]
                                    │
                                    ▼
                       ┌─ turn_started (koast) ─┐
                       │  composer.is-disabled   │
                       │  responding=true        │
                       │  avatar=active(small)   │
                       └────────────┬────────────┘
                                    ▼
                  ┌─────────────────┴─────────────────┐
                  │            (any order)            │
                  │  token            → append text   │
                  │  tool_call_started → .tool.in-fl. │
                  │  tool_call_compl.  → mutate to ✓  │
                  │  action_proposed   → ActionProp.  │
                  │  memory_pending    → MemoryArt.   │
                  │  memory_saved      → mutate +     │
                  │                       avatar:milestone (one shot)
                  └─────────────────┬─────────────────┘
                                    ▼
                       ┌─────  done ──────┐  → composer enabled
                       │   error          │  → preserve partial + ErrorBlock + composer enabled
                       │   refusal        │  → render as agent text + composer enabled
                       └────────┬─────────┘
                                ▼
                       avatar = idle
                       responding = false
```
