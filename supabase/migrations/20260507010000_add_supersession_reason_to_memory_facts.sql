-- M8 Phase A · D7 — supersession_reason column on memory_facts.
--
-- D7 splits memory edits into three affordances (correct / supersede /
-- mark wrong). The discriminator lives here so the agent loop and the
-- inspect surface can render the right semantics for each row.
--
-- - 'outdated'  → host superseded because the prior fact is no longer true
--                 (e.g., wifi password changed, lockbox code rotated)
-- - 'incorrect' → host superseded because the prior fact was wrong at
--                 extraction time (M9 calibration learning will read this)
--
-- Nullable. Existing rows (from M6 supersession substrate) stay NULL —
-- their reason is not retroactively classified.

ALTER TABLE memory_facts
  ADD COLUMN supersession_reason text
  CHECK (supersession_reason IS NULL OR supersession_reason IN ('outdated', 'incorrect'));

COMMENT ON COLUMN memory_facts.supersession_reason IS
  'Discriminator for memory_facts.superseded_by edits. Set by D7 edit affordances. M9 calibration substrate reads ''incorrect'' as extraction-error signal.';
