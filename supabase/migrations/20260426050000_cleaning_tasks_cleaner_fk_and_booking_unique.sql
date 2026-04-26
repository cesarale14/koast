-- TURN-S1a — fix cleaning_tasks FK target + add UNIQUE on booking_id.
--
-- (1) FK fix: migration 001:158 declared `cleaner_id uuid REFERENCES
--     auth.users` but the assign route writes cleaners.id values.
--     Production has 0 rows with cleaner_id set (verified live
--     2026-04-26 via psycopg2), so the bad constraint never failed
--     in practice. Fix the target before the new pg_net trigger
--     starts auto-assigning via default_cleaner_id.
--
-- (2) UNIQUE on booking_id: closes the TOCTOU race in
--     createCleaningTask's existing SELECT-then-INSERT guard
--     (auto-create.ts:34-36). The trigger may fire concurrently
--     with the host-clicked Auto-Create button; UNIQUE makes the
--     duplicate insert raise 23505 which the helper catches as
--     no-op success.
--
-- Pre-flight (verified live 2026-04-26):
--   SELECT booking_id, count(*) FROM cleaning_tasks
--     GROUP BY booking_id HAVING count(*) > 1   → 0 rows
--   SELECT count(*) FILTER (WHERE booking_id IS NULL) FROM
--     cleaning_tasks                            → 0 rows
--   So the new UNIQUE has no data violation. Multiple-NULLs allowed
--   anyway (Postgres treats NULLs as distinct in UNIQUE).
--
-- TURN-S1a / PG-PARTIAL-FIX learning: full UNIQUE constraint, not
-- partial. Lets PostgREST upsert with on_conflict=booking_id work
-- if a future code path needs it.

ALTER TABLE cleaning_tasks
  DROP CONSTRAINT IF EXISTS cleaning_tasks_cleaner_id_fkey;

ALTER TABLE cleaning_tasks
  ADD CONSTRAINT cleaning_tasks_cleaner_id_fkey
  FOREIGN KEY (cleaner_id) REFERENCES cleaners(id) ON DELETE SET NULL;

ALTER TABLE cleaning_tasks
  ADD CONSTRAINT cleaning_tasks_booking_id_unique
  UNIQUE (booking_id);
