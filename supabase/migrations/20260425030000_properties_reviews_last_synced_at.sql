-- Session 6.6 — reviews background sync.
--
-- Adds a per-property timestamp the worker stamps on a successful
-- sync run. NULL = never synced. The Reviews UI reads this for the
-- "Last synced N min ago" display next to the Refresh-now button.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS reviews_last_synced_at TIMESTAMPTZ;
