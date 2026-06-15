# Koast v1 — A1–A6 acceptance log

Running log of the live acceptance pass (with Cesar). Each entry: item · status ·
fix commit(s) · evidence. Failures found mid-pass were fixed merge-on-green and re-probed.

## PREP

### P-2 — Property Settings / Access info discoverability — FIXED (`d8b10c2`)
The P1.5a Access-info form was only reachable via a subtle hero gear. Fixed: (1)
`/properties/[id]?settings=access` deep-link auto-opens the Settings modal at Access info;
(2) a Settings button on each Properties-list card; (3) a turnover-card "Add access info"
CTA when a property has none (computes `hasAccessInfo` from `property_details`).

## A1 — cleaner push notifications (web-push)

### A1-5 — "Enable job alerts" rejected the VAPID key — FIXED (`17e2ec4` code + Vercel env)
"Enable job alerts" threw "applicationServerKey must contain a valid P-256 public key". Root
cause (diagnosed against prod, by curling the `/api/clean` endpoint + decoding the served
key): the Vercel `VAPID_PUBLIC_KEY` decoded to 64 bytes / 86 base64url chars — truncated by
one char; a valid key is 65 bytes / ~87 chars (0x04 uncompressed-P-256 prefix), so
`pushManager.subscribe` rejected it. The client conversion was correct; the env value was
malformed (a paste truncation). Fix:
- (env) Cesar set a correct, MATCHING VAPID keypair in Vercel + redeployed.
- (code, `17e2ec4`) pure `src/lib/push/vapid-key.ts` `isValidVapidPublicKey` (must decode to
  65 bytes / 0x04); `getVapidPublicKey()` validates → returns null + warns on a bad key (page
  degrades to "unavailable", misconfig visible in logs); `EnableAlerts` refuses an invalid key
  before `subscribe()` with a plain message.
- Deterministic test (the no-jsdom seam the suite was blind to): the EXACT truncated prod key
  pinned as rejected, a valid 65-byte key accepted, + null/empty/std-base64/private-key-shape.

### A1 — web-push end-to-end on a real iPhone (prod) — ✅ PASS
Confirmed live by Cesar: notification delivered BOTH app-open AND app-closed on a real iPhone
(installed PWA), prod. DB evidence:
- `cleaner_push_subscriptions` row — cleaner **Karem Gutierrez**, Apple Web Push endpoint
  (`web.push.apple.com/…`), p256dh + auth present, device iPhone iOS 18.7 Safari, bound via the
  task token; `last_seen_at` fresh (2026-06-14 23:03 UTC).
- **0** `push_delivery_failure` host-notification bells in the window (consistent with success).
- (web-push → APNs isn't logged server-side beyond failures; the `notifications` table is the
  SMS/email audit, so no row there is expected — the on-device delivery is authoritative.)

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

## A4 — OTA write flip (agent price → Channel) — ✅ PASS (hard-floor)
The OTA write gate (`KOAST_ALLOW_BDC_CALENDAR_PUSH`, 1 flag → isCalendarPushEnabled →
isOtaWriteEnabled) was flipped ON in Vercel. Controlled verification against Villa Jamaica:
- **Pre-flip dry-run** (read-only `buildSafeBdcRestrictions` vs live BDC): of the 5 pending
  agent adjust_price proposals, 2 under-±10% would push, 3 over-threshold REFUSED
  (`rate_delta_exceeds_threshold`) — safe-restrictions proven before any write.
- **Controlled write** — host approved the Aug-3 proposal in prod UI (BDC 218 → 210, −3.7%).
  Verified (independent BDC re-read + DB): BDC Aug-3 = 210; Aug 4/5/6 still CLOSED (avail=0 —
  host-closed dates preserved); Aug 1/2 untouched; pushed `["BDC","ABB"]`; proposal executed;
  audit `actor=host, autonomy=confirmed, succeeded`.
- **Gap found + fixed (`e9cd698`):** the proposals-lane OTA execution wrote NO
  `pricing_performance` row (only the legacy /api/pricing/apply route did) — agent-applied
  prices were invisible to the outcome flywheel + the host performance view.
  `adjust_price` execute now upserts pricing_performance on push success (mirroring the apply
  route); block_dates/set_min_stay don't (no rate). Aug-3 row backfilled. +2 deterministic tests.

## Inline ProposalCard (pre-acceptance build) — SHIPPED (`635a135` + `46b768a`)
Live render of the real ProposalCard in the thread, edit-before-approve for send_guest_reply,
refetch-on-focus consistency. Live-verification script:
`docs/koast-v1-inline-proposalcard-live-verification.md`.

## Remaining NEEDS-CESAR
PITR toggle · Stripe test-mode env. (A4 OTA flag now FLIPPED ON in prod — verified via the
Aug-3 controlled write.) (Optional: rotate the VAPID keypair
before public launch — the working pair was generated in-channel during the A1-5 fix; it's a
low-stakes, trivially-rotatable notification key.)
