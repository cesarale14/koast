# Inline ProposalCard — /ultraplan (focused pass, pre-acceptance)

**Goal:** when the agent creates a proposals-lane proposal mid-turn, the thread renders
the REAL `ProposalCard` inline (trench frame, rationale, payload via the block registry,
live Approve/Dismiss) in place of the raw `propose_*` tool-call line — same component +
same atomic-claim approve path as Today, no chat-only fork. Plus host edit-before-approve
for `send_guest_reply` (edited text is what sends, audit-logged) + consistency-by-refetch
if decided elsewhere.

## Grounding (verified loci)
- Proposals-lane tools (`propose-guest-reply`, `propose-assign-cleaner`, `propose-notify-
  cleaner`, `propose-pricing-rule`, `propose-ota`) all return `{created, proposal_id}` and
  call `createProposal()` → a `proposals` row. `normalizeProposal(row)` → `NormalizedProposal`
  (the exact shape `ProposalCard` consumes; block validated via `blockDataSchema`).
- The loop's existing inline-artifact emission is `loop.ts` ~539–584 (`isProposalOutput` →
  `action_proposed` for the M6/M7 artifact tools only — NOT proposals-lane).
- Two event unions: server `src/lib/agent/sse.ts` + client `src/lib/agent-client/types.ts`
  (the client re-validates SSE). The streaming reducer `src/lib/agent-client/turnReducer.ts`
  maps events → `ContentBlock[]`; `ChatClient.tsx` renders `state.content` + harvests post-
  stream. `__setNowForTests` makes the reducer deterministically testable.
- `/api/proposals?status=pending` exists; `TodaySuggests` refetches on `focus`+`visibilitychange`.
- `ProposalCard` (`src/components/proposals/`) already does the atomic-claim approve POST to
  `/api/proposals/[id]/approve` + Dismiss + local status; takes `{proposal, onResolved}`.

## Architecture decision — render model
**Live-render + refetch-consistency (primary), reload-fallback-to-tool-line (documented).**
The card renders live from a new `proposal_created` SSE event (carrying the normalized
proposal) → a new `proposal_card` ContentBlock → `<ProposalCard>`. It stays consistent if
decided in Today/bell via the SAME refetch-on-focus pattern as TodaySuggests (GET the
proposal's current status). Proposals have no conversation/turn FK today, so a HARD reload
re-renders the persisted turn's tool-call line (graceful, honest — the proposal is still
reachable from Today/bell). Full cross-reload card persistence (proposals.conversation_id +
server turn-render join) is a documented follow-up, NOT this pass — it needs a schema +
server-render change and isn't in the live-script seams.

## Build phases (each its own hard gate + commit)

### Phase 1 — substrate (additive, fully type-checked, unit-tested)
1. `proposals/server.ts`: `normalizedProposalSchema` (Zod, mirrors NormalizedProposal +
   reuses `blockDataSchema`) + `fetchAndNormalizeProposal(svc, id)` + `getProposalById`.
2. `sse.ts`: `proposal_created` member `{type, proposal: normalizedProposalSchema}`.
3. `agent-client/types.ts`: same `proposal_created` member + `proposal_card` ContentBlock.
4. `turnReducer.ts`: `case "proposal_created"` → append a `proposal_card` block (mirror
   `appendGuestMessageArtifactPending`). Exhaustiveness `never` forces the case.
5. `loop.ts`: after the existing `isProposalOutput` branch, detect proposals-lane output
   `{created:true, proposal_id}` → `fetchAndNormalizeProposal` → `yield proposal_created`.
6. Tests: sse round-trip parse; turnReducer proposal_created→block; normalize shape.

### Phase 2 — render + edit (client)
7. `ChatClient.tsx`: render `proposal_card` block → `<ProposalCard>`; SUPPRESS the matching
   `propose_*` tool block (render the card in its place); harvest-preserve the block post-
   stream (mirror guest_message_artifact); on `onResolved`/focus, refetch the proposal.
8. `ProposalCard.tsx`: edit-before-approve for `actionType==='send_guest_reply'` — inline
   editable draft; Approve sends the EDITED text. Unchanged drafts never auto-approve.
9. `POST /api/proposals/[id]/edit` (host-auth): re-runs `applyOutputJudges('host-to-guest')`
   on the edited text, updates `payload.action.messageText` + `payload.block.data.messageText`
   + `judge_results`, and audit-logs the edit (original + final). Approve then sends final.
10. Tests: edit→send payload path (original vs final), judge re-run on edit.

### Phase 3 — close
11. Remaining P3.1 reads + P3.3 fixtures — SECOND deliverable, only if budget remains after
    the card ships green (the card is "the last build item"; reads/fixtures were listed but
    the brief + live script center on the card). Else scoped.
12. LIVE-VERIFICATION SCRIPT (numbered prod probes) — the seams unit tests can't reach.

## Hard gates
`npx tsc --noEmit` + the touched jest suites (sse, turnReducer, proposals) green before each
commit; full suite before push. The `_exhaustive: never` guards mean a missed case fails
compile — the additive event/block can't silently break existing flows.
