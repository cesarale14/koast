-- Fix RLS policies for 11 tables that have RLS enabled but 0 policies.
-- Without policies, reads through the auth client return 0 rows.

-- ============================================================
-- Property-scoped tables (have property_id column)
-- ============================================================

-- property_channels
CREATE POLICY "Users can view own property_channels"
  ON property_channels FOR SELECT
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own property_channels"
  ON property_channels FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- channex_room_types
CREATE POLICY "Users can view own channex_room_types"
  ON channex_room_types FOR SELECT
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own channex_room_types"
  ON channex_room_types FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- channex_rate_plans
CREATE POLICY "Users can view own channex_rate_plans"
  ON channex_rate_plans FOR SELECT
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own channex_rate_plans"
  ON channex_rate_plans FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- pricing_outcomes
CREATE POLICY "Users can view own pricing_outcomes"
  ON pricing_outcomes FOR SELECT
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own pricing_outcomes"
  ON pricing_outcomes FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- local_events
CREATE POLICY "Users can view own local_events"
  ON local_events FOR SELECT
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own local_events"
  ON local_events FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- ical_feeds
CREATE POLICY "Users can view own ical_feeds"
  ON ical_feeds FOR SELECT
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own ical_feeds"
  ON ical_feeds FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- ============================================================
-- channex_webhook_log (uses channex_property_id, not property_id)
-- ============================================================

CREATE POLICY "Users can view own webhook logs"
  ON channex_webhook_log FOR SELECT
  USING (channex_property_id IN (
    SELECT channex_property_id FROM properties WHERE user_id = auth.uid()
  ));

-- ============================================================
-- channex_sync_state (singleton, no user scoping)
-- ============================================================

CREATE POLICY "Authenticated users can read sync state"
  ON channex_sync_state FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- leads (public-facing: anyone can insert, auth users can read)
-- ============================================================

CREATE POLICY "Anyone can insert leads"
  ON leads FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read leads"
  ON leads FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- revenue_checks (public-facing: anyone can insert, auth users can read)
-- ============================================================

CREATE POLICY "Anyone can insert revenue_checks"
  ON revenue_checks FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read revenue_checks"
  ON revenue_checks FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- weather_cache (global cache, any authenticated user can read)
-- ============================================================

CREATE POLICY "Authenticated users can read weather cache"
  ON weather_cache FOR SELECT
  USING (auth.uid() IS NOT NULL);
