-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  HELD — DESTRUCTIVE — DO NOT APPLY WITHOUT CESAR'S EXPLICIT CONFIRM        ║
-- ║  Filename is prefixed HELD_ and timestamped so it does NOT match the       ║
-- ║  migration runner glob until renamed (drop the HELD_ prefix on confirm).   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- P6.2 — drop the vestigial pg_net turnover trigger. Verified against prod
-- 2026-06-12: the trigger `bookings_fire_turnover_task` (function
-- `fire_turnover_task_create`) was installed INERT in P1 (migration
-- 20260426060000_bookings_turnover_trigger_inert.sql) as stage 2a of a two-stage
-- pg_net cutover whose stage 2b never shipped — the app + booking_sync.py create
-- cleaning_tasks directly instead. The trigger fires on EVERY booking insert/update
-- today, returns early (no side effect), and is pure overhead + a confusing
-- supply-chain artifact (pg_net http_post path that is never used).
--
-- Safety: dropping the trigger CANNOT lose turnover-task creation — that path is
-- the app/worker, not this trigger (which has been inert since install). Rollback
-- is trivial (re-run 20260426060000).
--
-- Verify after apply:
--   SELECT 1 FROM pg_trigger WHERE tgname='bookings_fire_turnover_task';  -- 0 rows
--   SELECT 1 FROM pg_proc    WHERE proname='fire_turnover_task_create';   -- 0 rows
--   -- bookings still ingest (the trigger was inert, so no behavior change):
--   SELECT count(*) FROM bookings WHERE created_at > now() - interval '1 hour';

DROP TRIGGER IF EXISTS bookings_fire_turnover_task ON bookings;
DROP FUNCTION IF EXISTS fire_turnover_task_create();

-- ── OPTIONAL (separate decision — Cesar opts in/out) ────────────────────────
-- Remove the pg_net extension entirely (supply-chain simplification). pg_net is
-- a Supabase baseline extension; nothing in Koast uses it (all HTTP is Node-side)
-- once the trigger above is gone. CASCADE drops its http_* helper functions.
-- Leave COMMENTED unless Cesar wants the extension removed too:
--
-- DROP EXTENSION IF EXISTS pg_net CASCADE;
