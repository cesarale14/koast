-- Agent loop v1 — Milestone 6, migration 3 of 3.
--
-- Persist the property scope (active_property_id) on every agent turn.
-- Closes M5's CF D-F2 carry-forward — the loop's "All properties"
-- (active_property_id IS NULL) fallback no longer applies once writers
-- start populating this column.
--
-- Backfill is intentionally skipped. Existing turns predate M6's
-- per-turn property tracking; nullability is honest for them. The loop
-- (src/lib/agent/loop.ts) is updated in the same M6 commit to write
-- this field on every turn-write going forward.

ALTER TABLE agent_turns
  ADD COLUMN active_property_id uuid NULL REFERENCES properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_turns_active_property
  ON agent_turns(active_property_id)
  WHERE active_property_id IS NOT NULL;
