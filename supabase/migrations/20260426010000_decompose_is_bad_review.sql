-- RDX-4 — decompose is_bad_review into two source-of-truth columns:
--   is_low_rating       — algorithmic, derived from incoming_rating < 4.
--                         Sync-write on every iteration. Unsafe for hosts
--                         to mutate manually.
--   is_flagged_by_host  — host-asserted via the more-menu mark/unmark
--                         action. Sync NEVER touches this.
--
-- The legacy is_bad_review column is retained for one full release
-- cycle so any in-flight reads keep working. Removal is tech-debt
-- with a 90-day target. UI predicate post-RDX-4:
--   isBad = is_low_rating OR is_flagged_by_host

ALTER TABLE guest_reviews
  ADD COLUMN IF NOT EXISTS is_low_rating boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_flagged_by_host boolean NOT NULL DEFAULT false;

UPDATE guest_reviews
SET is_low_rating = true
WHERE incoming_rating IS NOT NULL AND incoming_rating < 4
  AND is_low_rating = false;

UPDATE guest_reviews
SET is_flagged_by_host = true
WHERE is_bad_review = true
  AND is_flagged_by_host = false;
