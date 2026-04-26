-- TURN-S1a Migration 2a — INSTALL the bookings → cleaning_tasks
-- trigger function with an INERT body. The trigger fires on every
-- qualifying booking insert/update but immediately returns without
-- side effects.
--
-- Architecture (TURN-S1a plan §Trigger semantics):
--   bookings INSERT/UPDATE OF status
--     → trigger gates on status IN ('confirmed','completed') AND
--       check_out >= today AND (TG_OP=INSERT OR OLD.status NOT IN
--       ('confirmed','completed')) AND skip-GUC not 'true'
--     → reads vault secrets {turnover_app_url, turnover_trigger_secret}
--     → net.http_post → /api/internal/booking-created
--     → that route loads the booking + calls createCleaningTask
--
-- This 2a migration is the INERT first stage of Amendment 4's two-stage
-- prod cutover. The function body's first executable line is RETURN NEW,
-- so the trigger validates "installs cleanly + doesn't break booking
-- inserts" without firing http_post. The real body lives below the
-- early return as a comment block; migration 2b (follow-up commit, ≥24h
-- later) replaces the function via CREATE OR REPLACE FUNCTION with the
-- comment block uncommented.
--
-- Verification of the 2a soak:
--   SELECT count(*) FROM bookings WHERE created_at > now() - interval
--     '24 hours'   → matches expected ingest cadence (proves trigger
--                   isn't blocking inserts)
--   SELECT count(*) FROM net._http_response WHERE created > now() -
--     interval '24 hours'  → 0 (proves the early-return is actually
--                              short-circuiting; if any rows appear
--                              the inert gate has a bug — abort and
--                              roll back via DROP TRIGGER)
--
-- Rollback (single SQL, < 60 seconds, no deploy needed):
--   DROP TRIGGER IF EXISTS bookings_fire_turnover_task ON bookings;

-- 1. Enable pg_net in the standard Supabase schema location.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Vault secrets — set BEFORE this migration runs in production
--    via the Supabase SQL editor (NOT in this migration; secrets
--    don't belong in source control):
--      SELECT vault.create_secret('https://app.koasthq.com',
--        'turnover_app_url');
--      SELECT vault.create_secret('<random_32_byte_hex>',
--        'turnover_trigger_secret');
--    The same trigger_secret value goes into Vercel env as
--    INTERNAL_TRIGGER_SECRET. The function falls into a RAISE WARNING
--    + RETURN NEW branch if either secret is missing, so a forgotten
--    setup can't block bookings — but it also means no tasks fire
--    until both are present.

-- 3. Trigger function — INERT in 2a (early RETURN NEW). The full body
--    (vault read, gates, net.http_post) is preserved as the comment
--    block below for 2b to uncomment via CREATE OR REPLACE FUNCTION.
CREATE OR REPLACE FUNCTION public.fire_turnover_task_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
BEGIN
  -- TURN-S1a 2a — INERT. Function installed but body short-circuited.
  -- TURN-S1a 2b will replace this function (CREATE OR REPLACE) with
  -- the real body once 24h of inert-soak shows zero booking-insert
  -- regressions and zero leaked net._http_response rows.
  RETURN NEW;

  -- ------------------------------------------------------------------
  -- BELOW HERE: 2b body (NOT yet active). Kept as a comment so
  -- reviewers see the full design that 2a is preparing for.
  -- ------------------------------------------------------------------
  --
  -- DECLARE
  --   v_app_url text;
  --   v_secret  text;
  --   v_payload jsonb;
  --   v_request_id bigint;
  -- BEGIN
  --   -- iCal bulk-insert bypass: the iCal sync wraps its bulk
  --   -- insert with SET LOCAL app.skip_turnover_trigger = 'true'
  --   -- and calls backfillCleaningTasks once at end. This avoids
  --   -- thundering-herd against Vercel on a fresh host's first
  --   -- iCal import.
  --   IF current_setting('app.skip_turnover_trigger', true) = 'true' THEN
  --     RETURN NEW;
  --   END IF;
  --
  --   -- Gate: only confirmed/completed bookings with check_out today
  --   -- or later get a turnover task.
  --   IF NEW.status NOT IN ('confirmed', 'completed') THEN
  --     RETURN NEW;
  --   END IF;
  --   IF NEW.check_out < CURRENT_DATE THEN
  --     RETURN NEW;
  --   END IF;
  --
  --   -- UPDATE only fires on a transition INTO confirmed/completed.
  --   IF TG_OP = 'UPDATE' THEN
  --     IF OLD.status IN ('confirmed', 'completed') THEN
  --       RETURN NEW;
  --     END IF;
  --   END IF;
  --
  --   SELECT decrypted_secret INTO v_app_url
  --     FROM vault.decrypted_secrets WHERE name = 'turnover_app_url'
  --     LIMIT 1;
  --   SELECT decrypted_secret INTO v_secret
  --     FROM vault.decrypted_secrets WHERE name = 'turnover_trigger_secret'
  --     LIMIT 1;
  --   IF v_app_url IS NULL OR v_secret IS NULL THEN
  --     RAISE WARNING 'fire_turnover_task_create: vault secrets not set; skipping booking %', NEW.id;
  --     RETURN NEW;
  --   END IF;
  --
  --   v_payload := jsonb_build_object(
  --     'booking_id',  NEW.id,
  --     'property_id', NEW.property_id,
  --     'source',      TG_OP
  --   );
  --
  --   SELECT net.http_post(
  --     url     := v_app_url || '/api/internal/booking-created',
  --     body    := v_payload,
  --     headers := jsonb_build_object(
  --       'content-type',  'application/json',
  --       'authorization', 'Bearer ' || v_secret
  --     ),
  --     timeout_milliseconds := 10000
  --   ) INTO v_request_id;
  --
  --   RETURN NEW;
  -- EXCEPTION WHEN OTHERS THEN
  --   RAISE WARNING 'fire_turnover_task_create exception for booking %: %', NEW.id, SQLERRM;
  --   RETURN NEW;
  -- END;
END;
$$;

-- 4. Trigger — AFTER INSERT/UPDATE OF status.
DROP TRIGGER IF EXISTS bookings_fire_turnover_task ON bookings;
CREATE TRIGGER bookings_fire_turnover_task
  AFTER INSERT OR UPDATE OF status ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.fire_turnover_task_create();

COMMENT ON TRIGGER bookings_fire_turnover_task ON bookings IS
  'TURN-S1a 2a — INERT trigger. CREATE OR REPLACE FUNCTION in 2b activates the body. Emergency disable: DROP TRIGGER bookings_fire_turnover_task ON bookings;';
