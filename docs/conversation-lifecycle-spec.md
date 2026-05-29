# Koast — Conversation Lifecycle Spec

**Living document.** Source of truth for the Conversation entity's states, operations, and definition-of-done, plus the standing regression sweep. Statuses flip as operations land — update them in the same PR that changes the behavior.

**Before any conversation-system work, read this.** It treats a Conversation as a domain entity and enumerates every state it can be in and every operation it must support, so the work is a finite, prioritized list rather than something discovered one tap at a time.

Origin: authored 2026-05-29 (operator) after the M13 chat-primary conversation cascade — the lifecycle *felt* endless because it was unenumerated. Enumerated, the remaining work is small and bounded. Vault pointer: `decisions/2026-05-29-conversation-lifecycle-spec.md`.

---

## Legend

**Status**
- `BUILT` — built and attested (or unit/integration-covered)
- `BUILT*` — built, pending on-device attestation
- `BUILT-GAP` — built, with a known unaddressed edge
- `UNCONFIRMED` — believed to exist, needs a code check
- `MISSING` — not built

**Priority**
- `P0` — wedge / private-beta blocker
- `P1` — soon after beta
- `P2` — later / nice-to-have

---

## 1. The Entity

A **Conversation** owns an ordered list of **Turns**.

### Conversation

| Field | Notes | Confidence |
|---|---|---|
| `id` | UUID, server-generated, returned in the `turn_started` SSE event | confirmed |
| `host_id` | owner; RLS-scoped (regression-guard test exists) | confirmed |
| `created_at` | | standard |
| `last_turn_at` | recency sort key for history + recents | confirmed |
| `preview` / `title` | label in history. Currently: first user message. A `title text` column EXISTS on `agent_conversations` but nothing writes it; `listConversations` returns `preview` from the first user turn, never `title`. | confirmed (preview); title-gen **MISSING** |
| `property` | optional association (`propertyName` / `property_id`). Portfolio-level or property-scoped. Optimistic entry sets `propertyName: ""`. | confirmed field; semantics partial |
| `archived` / `deleted_at` | **proposed** — does not exist yet; `deleted_at` needed for D1 soft-delete | proposed |

### Turn

| Field | Notes |
|---|---|
| `conversation_id` | parent |
| `role` | user / agent (`koast`) |
| `content` | message body |
| `state` | streaming / complete / error |
| `created_at` | |
| (agent turns) | may carry artifacts, tool calls, proposals — agent/substrate layer, spec'd separately |

---

## 2. Surface States

The chat surface is a state machine. **Cardinal rule (the flash bug violated it): these states must be visually distinct.** "Loading an existing conversation" must never render the same as "empty new conversation," and "error/not-found" must never silently render as either.

| # | State | What renders | Status |
|---|---|---|---|
| S1 | **Empty / New** | Landing EmptyState | `BUILT` |
| S2 | **Anchoring** | Transient — first message sent, conversation being created + URL pushed | `BUILT*` |
| S3 | **Streaming** | A turn is generating (SSE); live response renders incrementally | `BUILT` (pre-M13) |
| S4 | **Loaded / Idle** | Turns present, no active generation | `BUILT` |
| S5 | **Loading** | `ConversationLoadingSkeleton` while hydrating an existing conversation — distinct from S1 | `BUILT*` |
| S6 | **Error / Not-found** | Redirect to `/` (resolves the URL↔content desync) | `BUILT*` — **was MISSING**, shipped in the N4/S6 PR (ChatURLSync redirects on unloadable conversation) |

---

## 3. Operations

### Create

| ID | Operation | Behavior + edges | Status | Pri |
|---|---|---|---|---|
| C1 | New from landing (first send) | Create once → push URL to `/chat/[id]` → reuse id for subsequent turns. Edge: rapid double-send (X1). | `BUILT*` (08a1c33) | P0 |
| C2 | New via explicit "New chat" / Cmd+K | Fresh empty conversation, clean state — no leak. | `BUILT` — confirmed clean (`onNewConversation` resets store + sessionHarvest; optimisticConvos correctly persists) | P0 |

### Read

| ID | Operation | Behavior + edges | Status | Pri |
|---|---|---|---|---|
| R1 | List conversations (sidebar + Cmd+K recents) | Reactive to creation (optimistic prepend + `mergeConversationLists`, server-wins-by-id). No dup after reload. | `BUILT*` (20e947c) | P0 |
| R2 | Load a conversation (click / deep-link) | Hydrate turns. Happy path. | `BUILT*` (947ef9b) | P0 |
| R3 | Paginate history | One-shot lazy fetch today. At 50+ conversations needs infinite-scroll or paging. | `MISSING` | P1 |
| R4 | Search conversations | Cmd+K matches recents by label/preview (substring + token-prefix). Content search not built. | `BUILT` (label/preview) / content `MISSING` | P1 |

### Update

| ID | Operation | Behavior + edges | Status | Pri |
|---|---|---|---|---|
| U1 | Append turn (send in existing conversation) | Append to active conversation, reuse id. | `BUILT*` (08a1c33) | P0 |
| U2 | Rename conversation | Manual title edit. Optimistic + reconcile (R1 pattern). | `MISSING` | P1 |
| U3 | Auto-title generation | No server-side generator runs; conversations labeled by first message. Reconciliation is "server preview confirms optimistic" (both = first message), so absence is **no regression**. | `MISSING` (not a blocker; beta-fine) | P1 |

### Delete / Archive

| ID | Operation | Behavior + edges | Status | Pri |
|---|---|---|---|---|
| D1 | **Delete a conversation** | **SOFT delete** (`deleted_at` flag, filtered from list/load, RLS-scoped). Reversible. Deleting the active conversation → next load 404 → N4/S6 redirect fires (composes; no special delete-active path). Optimistic remove + reconcile. | `MISSING` (approved; soft-delete) | **P0** |
| D2 | Bulk delete / clear | Clear many at once. Minimal "clear all" for test-pile cleanup. True purge of test rows = one-off hard-delete run, not a feature. | `MISSING` | P0 (minimal) / P2 (full) |
| D3 | Archive (soft-hide) | Hide without destroying. Near-free once D1 soft-delete exists. | `MISSING` | P2 |

### Navigate / Switch

| ID | Operation | Behavior + edges | Status | Pri |
|---|---|---|---|---|
| N1 | Switch A→B | Loading skeleton (S5), never a landing flash. | `BUILT*` (08a1c33) | P0 |
| N2 | Browser back/forward across conversations | Correct conversation each time (URL-driven via ChatURLSync). | `BUILT*` | P0 |
| N3 | Return to landing/new from a conversation | | `BUILT*` | P0 |
| N4 | Deep-link / bookmark a conversation URL | Happy path loads. Unhappy path (deleted / foreign / nonexistent id) → redirect to `/`, NOT strand on stale URL + empty content. | `BUILT*` — **was BUILT-GAP**, unhappy path shipped in the N4/S6 PR | **P0** |

### Generation control

| ID | Operation | Status | Pri |
|---|---|---|---|
| G1 | Stop generation mid-stream | `BUILT` — `RespondingRow` Stop button wired to `cancel()` while streaming | P1 |
| G2 | Regenerate response | `MISSING` | P2 |
| G3 | Edit-and-resend a message | `MISSING` | P2 |

---

## 4. Cross-cutting Concerns

- **Optimistic updates + reconciliation.** `mergeConversationLists`, server-wins **per field** (not whole-row), remount-resets-optimistic. Proven for create (R1); must extend to delete (optimistic remove + reconcile) and rename (U2). **Field-level caveat (load-bearing):** a populated optimistic field is *never* clobbered by an empty server field. A whole-row server-wins reintroduces the rail-preview race — the optimistic entry carries the real preview (first user message), but a list read landing before the first user turn is visible returns that conversation with an empty preview, and whole-row server-wins overwrites the good value with `""`; the rail (fetched once) then shows an unlabeled entry until reload. The guard is general — it protects any async-populated field (preview today, auto-title next), so the next such field can't repeat the bug. A *populated* server field still wins (placeholder → real value). Covered by `mergeConversationLists.test.ts` + Playwright sweep items 1/7.
- **Error / not-found handling (S6).** A failed/empty/404 fetch resolves URL↔content (redirect to `/`), not clear-the-skeleton-into-stale-URL-empty. Shipped in the N4/S6 PR.
- **Concurrency / races.**
  - Anchor race (store ahead of URL) — **fixed** via URL-only ChatURLSync + ref read (08a1c33).
  - Double-send (X1) — **fixed** via `useAgentTurn.isPending` (set synchronously at submit, cleared in `finally` on every exit) feeding `deriveComposerState` → composer locks from submit, not from stream start.
- **Persistence.** Turns + conversation rows in Supabase, RLS-scoped to `host_id`.
- **Streaming.** SSE (`loop.ts` / `sse.ts`), `turn_started → incremental render → terminal`. Pre-M13, stable.
- **Composer state.** Locks (`blocked`) while `isPending || isStreaming` — covers the full in-flight window.

### Race detail

| ID | Race | Resolution | Status |
|---|---|---|---|
| X1 | Double-send before `turn_started` (null-id window) | `isPending` locks the composer from submit-time; clears on every exit path (success/error/abort) via `finally` + `cancel`. | **fixed** |

---

## 5. Prioritization Summary

**P0 — must be true before a beta host touches it**
- All `BUILT*` operations attest clean on device: C1, R1, R2, U1, N1, N2, N3, N4, S2, S5
- UNCONFIRMED P0 items resolved: C2 (clean ✓), U3 (no-regression ✓), composer-lock + X1 (fixed ✓)
- Build: **D1** (soft delete) + minimal **D2** (clear)
- ~~Build: N4/S6 unhappy path~~ — shipped

**P1 — soon after beta**
- U2 (rename), R3 (history pagination), R4 (content search), title-gen (U3)

**P2 — later**
- D3 (archive), G2 (regenerate), G3 (edit-resend), full D2

---

## 6. Reference Diff — Vercel ai-chatbot / AI SDK useChat

Diff Koast's lifecycle layer against the reference; every delta is a deliberate choice or a found gap.

**Reference provides, we match (or should):**
- Generation status enum: `submitted | streaming | ready | error` (maps to S2–S6). Koast's equivalent: `useAgentTurn` reducer status + `isPending` + `conversationLoading`.
- Persistence: save-on-finish + load-by-id ✓
- History sidebar with delete + rename ← delete (D1) in progress; rename (U2) P1
- Empty / loading / error states first-class ← S6 shipped
- Stop / regenerate / edit-resend ← Stop ✓ (G1); G2/G3 P2

**We have beyond the reference (custom — iterate through real use, don't copy):**
- The substrate: memory (B3), voice (B7), judge (B5), gradient (B4)
- The operational doctrine (Agent-PMS framing)
- Portfolio / property scoping on conversations
- The agent loop + action layer

Rule: for the lifecycle layer, steal from the reference (solved problem). For the custom layer, iterate through real use.

---

## 7. Definition of Done (conversation system)

Not "happy path + unit-green + compiles." Done =
1. All P0 operations built, with all six surface states handled — especially S6 distinct from S1/S5.
2. Integration tests (Playwright) covering the lifecycle happy paths + the key edges in §8.
3. The full regression sweep (§8) green on device.
4. No state conflation (loading ≠ empty ≠ error), no open races (anchor, double-send), no URL↔content desync.

---

## 8. Standing Regression Sweep

Run as one pass. Green across all → spine is clean. Grouped by operation; expands as P0 operations land.

**Create / Append**
1. New chat + first prompt → conversation persists and appears in history immediately, no reload (C1, R1)
2. Several turns from landing → ONE conversation in history + Cmd+K recents (C1/U1)
3. First message → URL updates to `/chat/[id]` (C1)
4. Rapid double-send from landing (before first reply starts) → still ONE conversation (X1)
5. After reload → no duplicate in either list; optimistic reconciles by id (R1)
6. Start a second fresh conversation after the first → opens clean, no state leak (C2)
7. Title populates when generated — N/A until title-gen ships; today preview = first message (U3)

**Load / Switch**
8. Click a recent conversation → it loads (R2)
9. Switch A→B → skeleton, never a landing flash (N1)
10. `/chat/[idA]` → `/chat/[idB]` → switches correctly (N1/N2)
11. `/chat/[id]` → `/` (back) → returns to landing (N3)
12. Browser back/forward across conversations → correct one each time (N2)
13. Reload mid-conversation → still coherent, no duplicate in history

**Error / unhappy**
14. Bad deep-link (deleted / foreign / nonexistent id) → redirect to `/`, NOT stale-URL + empty content (N4 / S6)

**Delete (add once D1 is built)**
15. Delete a non-active conversation → gone from list immediately, gone after reload
16. Delete the active conversation → redirect to `/` (not stranded on a dead URL)
17. Delete → no resurrection on next list fetch (optimistic remove reconciles)

**Rename (add once U2 is built)**
18. Rename → updates in history immediately and after reload

---

## 9. Test harness

The cascade that produced this spec was caught by the operator's eyes because there is no integration harness. A Playwright harness scoped to sweep items 1–14 is the structural fix — it converts the manual sweep into CI and stays as regression protection for every future conversation change (1.C navigation, 1.D/1.E agent all touch this spine).

Status: scoped Playwright harness — see the M13 Phase 1.B follow-on work. First job: verify N4/S6 + X1 (+ D1 when it lands).

---

## 10. Implementation pointers (current code)

- Layout state machine: `src/app/(dashboard)/layout.tsx` (pathname-derived chat-primary vs inspect)
- Pathname → conversation binding: `src/components/chat/ChatURLSync.tsx` (+ `src/lib/chat/conversationIdFromPathname.ts`)
- Conversation store: `src/components/chat/chatReducer.ts` (`ANCHOR_CONVERSATION`, `conversationLoading`) + `ChatStore.tsx`
- List reconciliation: `src/lib/chat/mergeConversationLists.ts`
- Composer lock rule: `src/lib/chat/deriveComposerState.ts` + `useAgentTurn.isPending`
- Server: `src/lib/agent/conversation.ts` (`loadTurnsForConversation`, `listConversations`), `src/app/api/agent/conversations/[conversation_id]/turns/route.ts`, `src/app/api/agent/turn/route.ts` (SSE)
- Loading skeleton: `src/components/chat/ConversationLoadingSkeleton.tsx`
