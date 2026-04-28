-- Session 6.7 — pre-disclosure state for guest_reviews.
--
-- Channex /reviews payload carries `attributes.is_hidden`:
-- true while the review is pre-disclosure (rating=0, content=null,
-- 14-day mutual-disclosure window open), false once the review is
-- visible to the host. Sync ignored this field, and the
-- is_low_rating classifier (`rating5 != null && rating5 < 4`)
-- mistagged pre-disclosure reviews as "Bad review" because rating=0
-- is below the threshold.
--
-- This migration adds the column. Sync extracts it on every iteration;
-- the classifier guard `is_low_rating = !is_hidden && rating5 < 4`
-- gates the bad-review tag on the disclosure state.
--
-- Default `false` so existing rows treat as "disclosed" until the
-- next sync run backfills the real value from Channex.

ALTER TABLE guest_reviews
  ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN guest_reviews.is_hidden IS
  'Pre-disclosure flag from Channex /reviews attributes.is_hidden. True while the 14-day disclosure window is open and the guest review is hidden from the host.';
