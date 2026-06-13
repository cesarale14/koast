# Koast v1 — A1–A6 acceptance log

Running log of the live acceptance pass (with Cesar). Each entry: item · status ·
fix commit(s) · evidence. Failures found mid-pass were fixed merge-on-green and re-probed.

## PREP

### P-2 — Property Settings / Access info discoverability — FIXED (`d8b10c2`)
The P1.5a Access-info form was only reachable via a subtle hero gear. Fixed: (1)
`/properties/[id]?settings=access` deep-link auto-opens the Settings modal at Access info;
(2) a Settings button on each Properties-list card; (3) a turnover-card "Add access info"
CTA when a property has none (computes `hasAccessInfo` from `property_details`).

## A3 — post-checkout / post-stay guest messaging

### A3-1 — recently-departed guests visible to the agent — FIXED (`8c20637`)
The agent couldn't draft to a guest who checked out yesterday — booking ids reached it only
via the agenda preamble, windowed today+48h. Fix: a "RECENTLY DEPARTED" preamble section
(checked out ≤30 days, with the booking id + the propose path), `read_bookings` window
extended, kept out of the render groups. `read_guest_thread`/`propose_guest_reply` were never
date-scoped, so they work for a past booking once the id is visible; cold-send still fails
closed. 30-day read window grounded in Airbnb (14-day review window, thread stays messageable)
+ Booking.com post-stay follow-ups; the send obeys the platform window via Channex.

### Access-info bleed into drafting — FIXED (`7104b70` doctrine + `7366b0b` the real gate)
A post-checkout follow-up draft was blocked by a demand for door/wifi/parking. Root cause
(per Cesar's screenshot evidence) was the M8 C3 (D9) required-capability check in the loop's
pre-dispatch intercept, firing for EVERY `propose_guest_reply` unconditionally. Fix:
- `isCheckinInstructionDraft(messageText)` — the C3 gate now runs ONLY for check-in /
  arrival-instruction drafts; review / post-checkout / thank-you / general replies are never
  gated. Publisher-category hard-refusal unchanged.
- The `host_input_needed` card now shows human labels ("Door code", "Wifi", "Parking") via
  `slotLabel()`, never the raw field slugs.
- Agenda + system-prompt doctrine reworded to non-gating (access info matters only for
  check-in-instruction messages).
- Deterministic fixture: `isCheckinInstructionDraft` false for follow-up/review/thank-you,
  true for check-in/arrival; label mapping pinned.

### Plan badge showed "Free" for the comped account — FIXED (`7104b70`)
Display-only. The gate is correct + already tested (`resolveAccess(comped)→Pro`,
`requireProAccess` passes for comped, inert billing-off). The sidebar hardcoded
"Cesar / Free plan"; replaced with a self-fetching `<UserBadge>` (real name + real plan from
`/api/billing/status`).

### A3-2 — live guest send (edit-before-approve, end-to-end) — ✅ PASS
Live-confirmed on Airbnb's end (edited draft → Approve → Channex M7 → delivered).
Booking: Jonathan Briones, Villa Jamaica, Jun 8–11, airbnb. Proposal `a0cc27e7…` (executed).
Audit verification (prod, byte-exact in SQL):
- `send_guest_reply_edit` row — context holds `original_text` ("…Cesar") AND `final_text`
  ("…Cesar." — host added a period); `actor_kind=host`, `autonomy_level=confirmed`,
  `actor_id` == the property owner.
- `send_guest_reply` row — `outcome=succeeded`, `channex_message_id` present;
  `actor_kind=host`, `autonomy_level=confirmed`, `actor_id` == owner.
- Equality: sent `messages` content == proposal final `messageText` == edit `final_text`
  (TRUE); `final_text != original_text` (TRUE — the edit was real and is what was sent).

## Inline ProposalCard (pre-acceptance build) — SHIPPED (`635a135` + `46b768a`)
Live render of the real ProposalCard in the thread, edit-before-approve for send_guest_reply,
refetch-on-focus consistency. Live-verification script:
`docs/koast-v1-inline-proposalcard-live-verification.md`.

## Remaining NEEDS-CESAR
PITR toggle · Stripe test-mode env · the A4 OTA-flag flip.
