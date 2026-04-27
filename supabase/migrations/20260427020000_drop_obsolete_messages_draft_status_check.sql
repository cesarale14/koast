-- Drop the obsolete `messages_ai_draft_status_check` CHECK constraint.
--
-- Caught during Session 8a's supervised first run of
-- messaging_executor.py (2026-04-27). The constraint pre-dates the
-- ai_draft_status → draft_status rename in
-- 20260427010000_messaging_executor_8a.sql; Postgres preserved the
-- constraint by name through the RENAME COLUMN, but its expression
-- still restricted the column to the old union
-- ('none', 'pending', 'generated', 'approved', 'sent') and rejected
-- inserts with the new 'draft_pending_approval' or 'discarded' values.
--
-- The 8a design intent (per the migration comment) is to document the
-- union via COMMENT ON COLUMN rather than enforce via CHECK, so the
-- union can grow without further migrations. Dropping the obsolete
-- CHECK matches that intent.

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_ai_draft_status_check;
