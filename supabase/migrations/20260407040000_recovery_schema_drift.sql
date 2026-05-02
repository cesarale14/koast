-- ============================================================================
-- 20260407040000_recovery_schema_drift.sql
--
-- Recovery migration addressing the production schema drift identified in
-- docs/architecture/production-schema-drift-audit.md (D1, D2, D3, D4, D5).
--
-- Sequenced at 20260407040000 to run BEFORE
-- 20260407050000_channex_revision_polling.sql, which depends on
-- channex_webhook_log existing (D1).
--
-- IDEMPOTENT THROUGHOUT — every statement is guarded by IF NOT EXISTS or
-- IF EXISTS, so this migration is safe to run against:
--   - Production (mostly a no-op; D2 indexes + D4 policy drop are the only
--     real changes, plus possibly D3 renames if the policies still have
--     non-canonical names).
--   - Fresh staging replay (D1 creates the table; D2 creates 7 indexes;
--     D3 renames are no-ops because canonical names already exist;
--     D4 drops the legacy policy added by 007 once 007 has run; D5 enables
--     RLS on the 4 tables that exist at this timestamp).
--
-- See production-schema-drift-audit.md for the full categorization.
-- ============================================================================


-- ============================================================================
-- D1 — channex_webhook_log table create.
--
-- The table exists in production with 13 columns; revision_id (the 13th)
-- is added by 20260407050000_channex_revision_polling.sql. We create the
-- 12-column base shape here and let the next migration add revision_id.
--
-- Column types and defaults verified against production via
-- information_schema.columns on 2026-05-02 — exact match.
-- ============================================================================

CREATE TABLE IF NOT EXISTS channex_webhook_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type          text,
  booking_id          text,
  channex_property_id text,
  guest_name          text,
  check_in            text,
  check_out           text,
  payload             jsonb,
  action_taken        text,
  ack_sent            boolean DEFAULT false,
  ack_response        text,
  created_at          timestamptz DEFAULT now()
);

-- The "Users can view own webhook logs" RLS policy for this table is
-- created in 20260408010000_fix_rls_policies.sql, which runs later.
-- This recovery migration only ensures the table + RLS-enabled state
-- exist by the time that policy migration tries to declare against it.


-- ============================================================================
-- D2 — Seven indexes declared in early migrations 002/004/005/006 but
-- absent from production. Recreate with IF NOT EXISTS so:
--   - Staging fresh replay keeps the indexes (002 etc. already created
--     them; this migration's IF NOT EXISTS makes the second pass a no-op).
--   - Production (which is missing them per the drift audit) gets them
--     created.
--
-- Index definitions taken verbatim from the original declaring migrations.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_channex_id
  ON properties(channex_property_id)
  WHERE channex_property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_guest_reviews_property
  ON guest_reviews(property_id);

CREATE INDEX IF NOT EXISTS idx_guest_reviews_status
  ON guest_reviews(status);

CREATE INDEX IF NOT EXISTS idx_guest_reviews_scheduled
  ON guest_reviews(scheduled_publish_at)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_review_rules_property
  ON review_rules(property_id);

CREATE INDEX IF NOT EXISTS idx_pricing_outcomes_booked
  ON pricing_outcomes(was_booked, date);

CREATE INDEX IF NOT EXISTS idx_revenue_checks_ip
  ON revenue_checks(ip_address, created_at);


-- ============================================================================
-- D3 — Two RLS policies in production with non-canonical names.
--
-- Production has:
--   guest_reviews."Users manage own reviews"
--   review_rules."Users manage own review rules"
-- Migrations declare canonical names:
--   guest_reviews."Users can manage own guest_reviews"
--   review_rules."Users can manage own review_rules"
--
-- Both pairs have identical USING clauses; only the names differ. Rename
-- production to match canonical.
--
-- ALTER POLICY does not support IF EXISTS in PostgreSQL 17, so we wrap
-- in DO blocks with conditional checks against pg_policies. Idempotent:
--   - Production with old names → renames to canonical.
--   - Production already renamed → no-op.
--   - Staging fresh replay → migration 004 created canonical names; the
--     DO block finds no policy with the old name and skips.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'guest_reviews'
      AND policyname = 'Users manage own reviews'
  ) THEN
    ALTER POLICY "Users manage own reviews" ON guest_reviews
      RENAME TO "Users can manage own guest_reviews";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'review_rules'
      AND policyname = 'Users manage own review rules'
  ) THEN
    ALTER POLICY "Users manage own review rules" ON review_rules
      RENAME TO "Users can manage own review_rules";
  END IF;
END$$;


-- ============================================================================
-- D4 — Drop the legacy ical_feeds policy from migration 007.
--
-- 007_ical.sql created "Users can manage their own ical feeds" (note: spaces
-- and possessive "their own"). 20260408010000_fix_rls_policies.sql later
-- created two replacements with canonical names ("Users can view own
-- ical_feeds" + "Users can manage own ical_feeds") but did NOT drop the
-- old policy.
--
-- Production correctly has only the two canonical policies — someone
-- dropped the legacy one manually post-creation. This DROP IF EXISTS
-- aligns staging fresh replay (which would otherwise have all three
-- policies) with production.
--
-- Sequencing note: ical_feeds is created in 007_ical.sql which runs
-- BEFORE this recovery migration. So the table exists by this point on
-- a fresh replay; the DROP POLICY IF EXISTS is safe.
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage their own ical feeds" ON ical_feeds;


-- ============================================================================
-- D5 — Explicit RLS enable for the 17 tables that production has
-- RLS-enabled but where no migration declares ALTER TABLE ... ENABLE
-- ROW LEVEL SECURITY.
--
-- Production gets RLS via the Supabase-managed `ensure_rls` event trigger.
-- Staging doesn't have that trigger, so without these explicit statements
-- those tables end up RLS-DISABLED on a staging fresh replay.
--
-- Per the team's portability decision (Option B in the drift audit):
-- security-critical RLS state belongs in migration files explicitly, not
-- via a Supabase-platform event trigger.
--
-- ALTER TABLE IF EXISTS guards make every statement safe: the migration
-- runs against any environment progress state without erroring on
-- not-yet-created tables.
--
-- IMPORTANT — partial coverage on fresh staging replay:
-- Of the 17 tables, only 4 EXIST at this migration's chronological
-- position (20260407040000):
--   - channex_webhook_log (created above in D1)
--   - leads (created in 006)
--   - revenue_checks (created in 006)
--   - weather_cache (created in 20260330180000)
--
-- The remaining 13 tables are created by later migrations (positions
-- 20260407050000 through 20260427010000). The IF EXISTS guards make those
-- 13 ALTER statements no-ops during fresh staging replay. After the full
-- replay completes, those 13 tables would be RLS-DISABLED on staging.
--
-- For production this migration is a one-shot fix — all 17 tables exist
-- when the migration runs, all 17 ENABLE statements execute (no-ops since
-- RLS is already enabled by the event trigger).
--
-- For staging fresh-replay parity, a SECOND recovery migration positioned
-- at end-of-sequence (suggested timestamp 20260502000000) is needed to
-- ENABLE RLS on the 13 late-created tables. See the session report's
-- "Deviations" section for the full proposal.
-- ============================================================================

ALTER TABLE IF EXISTS channex_webhook_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS leads                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS revenue_checks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS weather_cache             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS channex_outbound_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS channex_rate_plans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS channex_room_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS channex_sync_state        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS concurrency_locks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS message_automation_firings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS message_threads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pricing_performance       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pricing_recommendations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pricing_rules             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS property_channels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_subscriptions        ENABLE ROW LEVEL SECURITY;
