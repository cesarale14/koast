-- MSG-S1 hotfix — PostgREST on_conflict can't target a partial unique
-- index. The original migration created
--   CREATE UNIQUE INDEX ... WHERE channex_message_id IS NOT NULL
-- which Postgres accepts but PostgREST refuses with
--   "there is no unique or exclusion constraint matching the ON
--    CONFLICT specification" (42P10).
-- Drop the partial index, replace with a full unique constraint.
-- NULL values remain allowed (Postgres treats NULLs as distinct in
-- unique constraints by default).

DROP INDEX IF EXISTS idx_messages_channex_id;

ALTER TABLE messages
  ADD CONSTRAINT messages_channex_message_id_key UNIQUE (channex_message_id);
