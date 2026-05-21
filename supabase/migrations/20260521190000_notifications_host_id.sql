-- M10 Phase C STEP 6: add host_id column to notifications.
--
-- Decision Q-M3-a (phase-c-ultraplan §2.5 + STEP 4 §13.1): host_id NULLABLE
-- PERMANENT for historical rows. STEP 6 §6.1 sub-step verify determined
-- Outcome 3 — existing notification rows have NO derivable owning-host
-- context. recipient is cleaner.name (cleaner notifications) or literal
-- "host" (host notifications); neither reliably maps to the owning host.
-- NOT NULL DB constraint deferred / abandoned for historical compatibility.
-- New-row enforcement is app-level (STEP 7 threads host_id through
-- storeNotification + 4 notify* callers).
--
-- Companion: supabase/scripts/m10-phase-c-m3-host-id-backfill.sql is a
-- documented no-op per Outcome 3.
--
-- Prepares for M3 STEP 7 (host_id population on new rows) and STEP 8
-- (audit-feed 5th source with WHERE host_id = $auth_uid scoping; rows with
-- NULL host_id naturally excluded from per-host audit-feed visibility —
-- accepted state per phase-c-ultraplan §2.5).
--
-- FK target: auth.users(id) per Koast convention (no Drizzle hosts table;
-- auth.uid() is the host identifier; pattern matches properties.user_id,
-- sms_log.user_id, host_state.host_id).

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS host_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_host_id
  ON notifications(host_id);
