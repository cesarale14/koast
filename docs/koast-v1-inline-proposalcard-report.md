# Inline ProposalCard — focused-pass report

**Date:** 2026-06-12 · **Branch:** main · **Mode:** merge-on-green, hard gates only.
The last build item before the A1–A6 acceptance pass.

## Shipped (2 commits, pushed)
| Commit | Phase |
|---|---|
| `635a135` | Phase 1 — `proposal_created` SSE substrate |
| `46b768a` | Phase 2 — render + edit-before-approve |

### What it does
When the agent creates a proposals-lane proposal (`propose_guest_reply`,
`propose_assign_cleaner`, `propose_pricing_rule`, `propose_ota`, `propose_notify_cleaner`),
the thread now renders the **real `ProposalCard`** inline — trench frame, rationale, the
payload block via the registry, live **Approve / Edit / Dismiss** — in place of the raw
`propose_*` tool line. Same component + same atomic-claim approve path as Today; no
chat-only fork.

### How it's wired
- **`proposal_created` SSE event** (server `sse.ts` + client `agent-client/types.ts`),
  carrying the normalized proposal validated by ONE shared `normalizedProposalSchema`
  (new client-safe `proposals/schema.ts`) so emit and consume can't drift.
- **loop.ts** emits it when a proposals-lane tool returns `{created, proposal_id}` —
  `fetchAndNormalizeProposal` then yield (best-effort; a miss leaves the tool line).
- **turnReducer** appends a `proposal_card` ContentBlock (mirrors the guest-message
  artifact append; the `_exhaustive: never` guard forced the case).
- **ChatClient** renders `proposal_card` → `<ProposalCard>` live, harvests it onto
  `UITurnLite.pendingProposals` so it survives turn-completion in-session, and suppresses
  the successful `propose_*` tool line in both the live + persisted render.
- **Edit-before-approve** (`ProposalCard` + `POST /api/proposals/[id]/edit`): Edit opens
  the draft inline; Save re-runs the host-to-guest voice judges (J1 emoji-filters so the
  stored/sent text stays clean), merges the text into action+block via the pure
  `applyGuestReplyEdit` helper, and audit-logs original→final. The EDITED text is what sends.
- **Consistency:** `ProposalCard` refetches its status on focus/visibility (gated by a
  prop; chat sets it) via `GET /api/proposals?id=` — decided-in-Today/bell reflects here.
  Refetch like TodaySuggests, not a parallel state machine.

### Render-model decision (documented)
Live render + in-session persistence + refetch-consistency. A **hard reload** falls back
to the `propose_*` tool line — proposals have no conversation/turn FK, so the server
turn-render can't reconstruct the card. The proposal stays reachable from Today/bell. Full
cross-reload card persistence (`proposals.conversation_id` + a server turn-render join) is
a noted follow-up, deliberately out of scope (schema + render change; not a live-script seam).

### Tests + verification
- **Deterministic (CI):** `proposal_created` SSE union (accept/reject/serialize) ·
  turnReducer `proposal_created → proposal_card` (order, status-stays-streaming) ·
  `applyGuestReplyEdit` edit→send payload path (text lands in action+block, ids preserved,
  original captured, no mutation). tsc + 116 targeted + full suite green.
- **Live-verification script** (`docs/koast-v1-inline-proposalcard-live-verification.md`):
  7 numbered prod probes for the seams no unit test can reach (inline render · approve-once ·
  decided-elsewhere · edit→edited-sends · edit-re-judges · reload-fallback · failed-propose).
  **This script is step zero of the acceptance session.**

## Not in this pass (the brief listed them; the card was the focus)
The remaining P3.1 reads (`read_threads`, `read_calendar_rates`, property-access,
channel-health blocks) and the P3.3 discipline fixture tests are independent of the inline
card and were not built this pass — the inline ProposalCard + edit-before-approve was "the
last build item" and consumed the focused effort. They remain scoped (extract-first,
render-flag-gated; `read_guest_thread` already exists as the template). Say the word and I
build them next, or they fold into a later pass.

## NEEDS-CESAR (unchanged)
1. Enable Supabase PITR on prod. 2. Stripe test-mode env + setup. 3. The A4 OTA-flag flip.
Plus: **run the live-verification script** as step zero of A1–A6.

## Status
Inline ProposalCard + edit-before-approve SHIPPED + gated + pushed. **HOLD** — next is the
live-verification script, then the A1–A6 acceptance pass with Cesar.
