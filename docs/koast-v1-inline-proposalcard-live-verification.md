# Inline ProposalCard — LIVE-VERIFICATION SCRIPT

Run these in prod (`app.koasthq.com`) with a real host session. This is **step zero
of the acceptance session** — it covers the seams no unit test can reach (the repo has
no jsdom/RTL harness, so the SSE→reducer→render→approve chain is verified live). Each
step lists the expected result; note PASS/FAIL.

Deterministic coverage already in CI (so you don't re-check these by hand): the
`proposal_created` SSE union (accept/reject/serialize), the turnReducer
`proposal_created → proposal_card` transition (order + status), and the edit→send
payload merge (`applyGuestReplyEdit`: text lands in BOTH action+block, ids preserved,
original captured, no mutation).

## 1. Inline render — card replaces the tool line
1. Open `/chat`, pick a property with a guest thread.
2. Ask: *"Draft a reply to the latest guest message."* (The agent calls
   `read_guest_thread` then `propose_guest_reply`.)
3. **Expect:** the thread renders the trench **ProposalCard** inline — "Koast suggests",
   the rationale line, the guest-reply block (channel + draft text), and **Approve /
   Edit / Dismiss** buttons. There is **no** raw `propose_guest_reply(...)` tool line
   (it's suppressed; the card is in its place).

## 2. Approve from the thread — executes exactly once
1. On that inline card, click **Approve**.
2. **Expect:** the card flips to **"Done"**; the guest receives the message (check the
   thread / Channex). Double-click Approve → still **one** send (atomic claim; a second
   click sees "already approved", no second send).

## 3. Decided elsewhere — the card stays consistent (refetch-on-focus)
1. Ask the agent for another proposal (don't approve it in chat).
2. Switch to **Today** (or the **bell**) and **Approve** (or **Dismiss**) it there.
3. Switch back to the chat tab.
4. **Expect:** on focus, the inline card reflects the new state — **Done** (approved) or
   gone (dismissed) — NOT a stale Approve button. (It refetches `/api/proposals?id=`; it
   does not run a parallel state machine.)

## 4. Edit-before-approve — the EDITED text is what sends
1. On a pending `send_guest_reply` card, click **Edit**.
2. Change the draft text; click **Save edit**.
3. **Expect:** the card now shows the edited text.
4. Click **Approve**.
5. **Expect:** the GUEST receives the **edited** text (not the original). The audit log
   (`agent_audit_log`, action_type `send_guest_reply_edit`) has `context.original_text` +
   `context.final_text`.

## 5. Edit re-runs the voice judges
1. Edit a draft to include an emoji (e.g. add " 🙂"); **Save edit**.
2. **Expect:** the saved/sent text has the emoji **stripped** (J1 emoji-filter re-ran on
   the edit — the stored text is voice-clean, so the guest never sees it).

## 6. Reload fallback (documented behavior, not a bug)
1. Create a proposal inline (don't decide it), then **hard-reload** the page.
2. **Expect:** after reload the turn shows the `propose_*` tool line again (the inline
   card does NOT survive a hard reload — proposals have no turn FK yet). The proposal is
   still pending and reachable from **Today** / the **bell**. Full cross-reload card
   persistence (proposals.conversation_id + a server turn-render join) is the documented
   follow-up.

## 7. Failed propose still shows its line
1. If you can trigger a `propose_*` that fails (e.g. an unknown booking), **expect** the
   tool error line to render (no card) — only *successful* proposes are suppressed.

---
After this script passes, proceed to the A1–A6 acceptance pass.
