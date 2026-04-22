-- Session 6 — reviews sync.
--
-- Extends guest_reviews with the three columns the Channex reviews
-- sync needs to round-trip cleanly:
--   channex_review_id : stable Channex UUID, target of onConflict upsert
--   private_feedback  : Airbnb's private half of the review (raw_content.private_feedback)
--   subratings        : jsonb array of { category, score } entries Channex returns per platform

ALTER TABLE guest_reviews
  ADD COLUMN IF NOT EXISTS channex_review_id TEXT,
  ADD COLUMN IF NOT EXISTS private_feedback TEXT,
  ADD COLUMN IF NOT EXISTS subratings JSONB;

-- Unconditional unique index so Supabase onConflict upserts work. Postgres
-- allows multiple NULL values in a UNIQUE single-column index by default,
-- so the few pre-sync guest_reviews rows with channex_review_id IS NULL
-- coexist fine.
CREATE UNIQUE INDEX IF NOT EXISTS guest_reviews_channex_id_unique
  ON guest_reviews(channex_review_id);
