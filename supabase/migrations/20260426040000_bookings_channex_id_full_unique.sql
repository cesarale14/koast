-- PG-PARTIAL-FIX — promote bookings.channex_booking_id partial unique
-- index to a full UNIQUE constraint.
--
-- Background: migration 002_channex_constraints.sql:9-11 created
--   CREATE UNIQUE INDEX idx_bookings_channex_booking_id
--     ON bookings(channex_booking_id) WHERE channex_booking_id IS NOT NULL;
-- which Postgres accepts but PostgREST cannot target via
-- .upsert({ onConflict: "channex_booking_id" }) — error 42P10.
--
-- The canonical writer (src/lib/bookings/upsert-from-channex.ts)
-- uses select-then-update-or-insert and is unaffected. But
-- src/app/api/properties/[propertyId]/sync-bookings/route.ts:129
-- does call PostgREST upsert with this onConflict, so the next host
-- to hit "Sync bookings now" would 500. Latent bug fix.
--
-- Same shape as the MSG-S1 hotfix (commit a078ce3) for
-- messages.channex_message_id. Postgres treats NULLs as distinct in
-- UNIQUE constraints by default, so the WHERE NOT NULL predicate is
-- redundant — multiple NULL rows remain allowed under the full
-- constraint.
--
-- See: PG-PARTIAL-AUDIT (2026-04-26), MSG-S1 hotfix.

DROP INDEX IF EXISTS idx_bookings_channex_booking_id;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_channex_booking_id_key
  UNIQUE (channex_booking_id);
