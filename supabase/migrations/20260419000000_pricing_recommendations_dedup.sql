-- pricing_recommendations deduplication + partial unique constraint.
--
-- Why: both /api/pricing/calculate (Next.js route) and pricing_validator.py
-- (VPS worker) write to pricing_recommendations with status='pending',
-- and neither dedups against an existing pending row for the same
-- (property_id, date). The result is visible inflation across the UI
-- (Dashboard "act now" counts, PropertyDetail "N pending", Scorecard
-- "$X potential").
--
-- This migration does two things:
--   A) Collapses existing duplicates — keeps the most recent pending
--      row per (property_id, date), drops the rest.
--   B) Replaces the existing non-unique partial index with a UNIQUE
--      partial index on (property_id, date) WHERE status='pending'.
--      After this migration lands, any second pending insert for the
--      same (property, date) pair fails at the DB level.
--
-- Writer-side updates (delete-then-insert in the API route, ON CONFLICT
-- WHERE in the Python worker) ship alongside this migration. See
-- src/app/api/pricing/calculate/[propertyId]/route.ts and
-- ~/koast-workers/pricing_validator.py in the same commit.

BEGIN;

-- ================ PART A: backfill ================
-- Rank every pending row per (property_id, date) by recency; keep rank 1,
-- delete the rest. Ties on created_at break on id DESC just for
-- determinism.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY property_id, date
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM pricing_recommendations
  WHERE status = 'pending'
)
DELETE FROM pricing_recommendations
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ================ PART B: constraint ================
-- The pre-existing non-unique index with the same predicate is replaced
-- by a UNIQUE variant so future writers can't regress this.
DROP INDEX IF EXISTS idx_pricing_recommendations_status_pending;

CREATE UNIQUE INDEX IF NOT EXISTS pricing_recs_unique_pending_per_date
  ON pricing_recommendations (property_id, date)
  WHERE status = 'pending';

COMMIT;
