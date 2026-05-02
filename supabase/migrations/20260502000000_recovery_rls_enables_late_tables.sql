-- ============================================================================
-- 20260502000000_recovery_rls_enables_late_tables.sql
--
-- Recovery migration closing the final RLS-state drift item flagged in
-- docs/architecture/staging-setup-session-2-report.md (D5 follow-up).
--
-- ----------------------------------------------------------------------------
-- BACKGROUND
-- ----------------------------------------------------------------------------
-- The D5 finding in docs/architecture/production-schema-drift-audit.md
-- identified 17 tables that production had RLS-enabled but no migration
-- file declared the ALTER TABLE ENABLE statement for. Production gets RLS
-- on those tables via a Supabase-managed event trigger (`ensure_rls` on
-- ddl_command_end, calling `rls_auto_enable()`); staging does NOT have
-- that trigger, so on a fresh replay those 17 tables end up RLS-disabled.
--
-- The Session 2 recovery (20260407040000_recovery_schema_drift.sql)
-- explicitly enabled RLS on the 4 of those 17 tables that exist at its
-- chronological position (channex_webhook_log, leads, revenue_checks,
-- weather_cache). The remaining tables — created by later migrations —
-- were left for this end-of-sequence follow-up.
--
-- ----------------------------------------------------------------------------
-- COUNT IS 13, NOT 12
-- ----------------------------------------------------------------------------
-- staging-setup-session-2-report.md states "12 production-RLS-enabled
-- tables" remain. Direct cross-environment comparison (Session 3, Phase 1)
-- found 13 tables in the gap, not 12. The extra one is
-- `koast_migration_history` itself, which was created during Session 2's
-- bootstrap script. Production fired the `ensure_rls` event trigger on
-- that CREATE TABLE and ended up RLS-on; staging lacks the trigger and
-- ended up RLS-off. The mechanism is identical to D5; the table was
-- simply too new to be in the original audit.
--
-- This migration enables RLS on all 13.
--
-- ----------------------------------------------------------------------------
-- SYMMETRIC APPLICATION (idempotent on both environments)
-- ----------------------------------------------------------------------------
-- This migration is APPLIED to BOTH staging and production.
--
--   - On staging: 13 ALTER TABLE statements perform real changes (each
--     table goes from rowsecurity=false to rowsecurity=true).
--   - On production: 13 ALTER TABLE statements are no-ops (RLS already
--     enabled by the ensure_rls event trigger).
--
-- Each statement is wrapped in a DO block guarded by pg_class lookup,
-- making the migration safe to run against any environment progress
-- state — if a table doesn't exist (e.g., a partial replay), the statement
-- is skipped via RAISE NOTICE rather than erroring.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS MIGRATION CLOSES — AND WHAT IT DOESN'T
-- ----------------------------------------------------------------------------
-- This migration closes the CURRENT 13-table gap. It does NOT close the
-- underlying mechanism: production still has the `ensure_rls` event
-- trigger and staging still doesn't. Future CREATE TABLE migrations that
-- don't explicitly include ALTER TABLE ENABLE ROW LEVEL SECURITY will
-- create the same drift again.
--
-- The mechanism is closed by GOING-FORWARD DISCIPLINE, codified in
-- CLAUDE.md (section: "RLS enable is explicit, not implicit"): every
-- migration that creates a table in public schema must include an
-- explicit ALTER TABLE … ENABLE ROW LEVEL SECURITY statement in the
-- same file, regardless of whether production's event trigger would
-- handle it. This makes RLS protection a visible property of each
-- migration file rather than an implicit consequence of platform
-- infrastructure.
--
-- The agent loop v1 Milestone 1 migrations already follow this pattern;
-- their tables (agent_artifacts, agent_audit_log, agent_conversations,
-- agent_turns, guests, memory_facts) are NOT in this drift list.
-- ============================================================================


DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'channex_outbound_log' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE channex_outbound_log ENABLE ROW LEVEL SECURITY';
  ELSE
    RAISE NOTICE 'Table channex_outbound_log does not exist, skipping';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'channex_rate_plans' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE channex_rate_plans ENABLE ROW LEVEL SECURITY';
  ELSE
    RAISE NOTICE 'Table channex_rate_plans does not exist, skipping';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'channex_room_types' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE channex_room_types ENABLE ROW LEVEL SECURITY';
  ELSE
    RAISE NOTICE 'Table channex_room_types does not exist, skipping';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'channex_sync_state' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE channex_sync_state ENABLE ROW LEVEL SECURITY';
  ELSE
    RAISE NOTICE 'Table channex_sync_state does not exist, skipping';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'concurrency_locks' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE concurrency_locks ENABLE ROW LEVEL SECURITY';
  ELSE
    RAISE NOTICE 'Table concurrency_locks does not exist, skipping';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'koast_migration_history' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE koast_migration_history ENABLE ROW LEVEL SECURITY';
  ELSE
    RAISE NOTICE 'Table koast_migration_history does not exist, skipping';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'message_automation_firings' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE message_automation_firings ENABLE ROW LEVEL SECURITY';
  ELSE
    RAISE NOTICE 'Table message_automation_firings does not exist, skipping';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'message_threads' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY';
  ELSE
    RAISE NOTICE 'Table message_threads does not exist, skipping';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'pricing_performance' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE pricing_performance ENABLE ROW LEVEL SECURITY';
  ELSE
    RAISE NOTICE 'Table pricing_performance does not exist, skipping';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'pricing_recommendations' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE pricing_recommendations ENABLE ROW LEVEL SECURITY';
  ELSE
    RAISE NOTICE 'Table pricing_recommendations does not exist, skipping';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'pricing_rules' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY';
  ELSE
    RAISE NOTICE 'Table pricing_rules does not exist, skipping';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'property_channels' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE property_channels ENABLE ROW LEVEL SECURITY';
  ELSE
    RAISE NOTICE 'Table property_channels does not exist, skipping';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'user_subscriptions' AND relnamespace = 'public'::regnamespace) THEN
    EXECUTE 'ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY';
  ELSE
    RAISE NOTICE 'Table user_subscriptions does not exist, skipping';
  END IF;
END $$;
