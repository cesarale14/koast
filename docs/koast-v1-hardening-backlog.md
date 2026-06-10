# Koast v1 — Hardening Backlog (deferred items, by phase)

Deferred hardening/correctness items surfaced during the v1 execution program
(P1–P7), parked to the phase where they're in-scope rather than fixed inline.
Each item carries enough to action it later without re-discovery. Added to as
phases surface deferrals; cleared as the owning phase ships them.

---

## P6 — External-user de-risk

### H6.1 — Channex webhook revision-claim (TOCTOU) — claim-first on `revision_id`
- **Source:** P2 adversarial review (surfaced via the P2.4 booking bell), 2026-06-10. Added to this list per the P3 brief.
- **Severity:** medium. Pre-existing webhook concurrency; P2 only made the symptom host-visible (duplicate "New booking"/"Booking cancelled" bell rows).
- **Issue:** `src/app/api/webhooks/channex/route.ts` dedups a Channex revision by READING `channex_webhook_log` for a prior terminal row (`action_taken IN created|modified|cancelled|skipped_self`) near the top, but the terminal log row is only INSERTed at the very END of the handler — after `channex.getBooking`, room-type fetch, `updateAvailability`, the `pricing_performance` backfill, and (P2.4) the `host_notifications` bell emit. If Channex re-delivers the same revision while the first request is still in-flight (plausible: the sequential Channex round-trips can exceed the webhook timeout), BOTH requests pass the dedup check and BOTH run the full body → duplicate booking bell, duplicate pricing backfill, duplicate availability push.
- **Fix:** claim the revision BEFORE doing the work. Either (a) insert a `processing` marker row for `revision_id` up front and treat a unique-constraint violation as "already being processed → ack + skip", or (b) take a `concurrency_locks` advisory lock keyed `channex_revision:{revision_id}` (mirrors the BDC-connect 60s mutex pattern). Then every side effect — including the bell emit — is gated by the same claim. Also close the documented-but-unimplemented "booking_id + event_type" fallback for deliveries without a `revision_id` (or correct the comment).
- **Test:** simulate two concurrent POSTs of the same revision; assert exactly one terminal log row, one bell row, one availability push.
- **Files:** `src/app/api/webhooks/channex/route.ts` (dedup block ~L171–204; terminal insert ~L453), `supabase/migrations/*concurrency_locks*`.

---

## Notes
- This list is the durable home for cross-phase deferrals. Inline-fixable items
  are fixed in their slice; only items that genuinely belong to a later phase
  land here.
