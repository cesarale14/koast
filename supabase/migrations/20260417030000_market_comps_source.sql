-- PR A follow-up: transparent fallback for comp sets.
--
-- Some neighborhoods don't have enough tightly-matched 4BR/1BR STRs within
-- a 2km radius for the precise buildFilteredCompSet path to produce a
-- viable comp set. Rather than silently succeed with bad data OR block the
-- host entirely, `buildFilteredCompSet` now falls back to AirROI's
-- /comparables similarity search when the strict path yields <3 matches.
--
-- Every row is tagged with how it was sourced, and the property carries a
-- quality marker so downstream consumers (Competitor pricing signal, UI
-- comp-set display) can down-weight or explain fallback data explicitly
-- instead of treating all rows as equivalent.

ALTER TABLE market_comps
  ADD COLUMN IF NOT EXISTS source text NOT NULL
    DEFAULT 'filtered_radius'
    CHECK (source IN ('filtered_radius', 'similarity_fallback'));

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS comp_set_quality text
    DEFAULT 'unknown'
    CHECK (comp_set_quality IN ('unknown', 'precise', 'fallback', 'insufficient'));

-- Existing rows predate this migration and all came from the old
-- buildCompSet → AirROI /comparables path. That IS the similarity_fallback
-- shape, not the strict filtered_radius shape. Backfill honestly.
UPDATE market_comps SET source = 'similarity_fallback'
  WHERE source = 'filtered_radius';
