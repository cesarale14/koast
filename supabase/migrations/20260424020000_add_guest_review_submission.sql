-- Session 6.2 — local tracking of host-side guest_review submission state.
--
-- Three timestamps, populated in order, because Channex's
-- /reviews/:id/guest_review endpoint validates payload SHAPE only:
-- malformed categories or out-of-range ratings still return 200, while
-- Airbnb silently drops the submission downstream. We need separate
-- signals for each stage so the UI can distinguish "Channex acked" from
-- "Airbnb confirmed".
--
--   guest_review_submitted_at        — host clicked Submit (set first,
--                                       defends against double-click)
--   guest_review_channex_acked_at    — Channex returned 200
--   guest_review_airbnb_confirmed_at — verified via subsequent sync /
--                                       webhook that Airbnb accepted
--
-- guest_review_payload stores what we sent, so a future sync can
-- compare against Channex's reply.guest_review to confirm a match.

ALTER TABLE guest_reviews
  ADD COLUMN IF NOT EXISTS guest_review_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS guest_review_channex_acked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS guest_review_airbnb_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS guest_review_payload JSONB;

-- Block the UI from offering guest-review submission on the
-- probe-contaminated row. Channex stored the malformed test payload;
-- Airbnb rejected it (verified via host dashboard). Channex's
-- already-submitted state would block any future submit-via-Koast
-- attempt anyway — stamping locally surfaces the explanation.
UPDATE guest_reviews
SET
  guest_review_submitted_at = '2026-04-24T00:00:00Z',
  guest_review_channex_acked_at = '2026-04-24T00:00:00Z',
  guest_review_payload = jsonb_build_object(
    'probe_contaminated', true,
    'note', 'Malformed test payload accepted by Channex, rejected by Airbnb. Do not re-submit via Koast.'
  )
WHERE channex_review_id = '0d9d89a3-745a-437f-9144-99c26b43dcaf';
