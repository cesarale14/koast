-- Ensure cleaning_tasks has proper RLS policies
-- The service role bypasses RLS, but adding policies as defense-in-depth
-- so that the host-facing API works through both auth and service clients.

-- Drop any existing policies to start clean (idempotent)
DROP POLICY IF EXISTS "Users can view own cleaning_tasks" ON cleaning_tasks;
DROP POLICY IF EXISTS "Users can insert own cleaning_tasks" ON cleaning_tasks;
DROP POLICY IF EXISTS "Users can update own cleaning_tasks" ON cleaning_tasks;
DROP POLICY IF EXISTS "Users can delete own cleaning_tasks" ON cleaning_tasks;

-- SELECT: users can read tasks for their properties
CREATE POLICY "Users can view own cleaning_tasks"
  ON cleaning_tasks FOR SELECT
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- INSERT: users can create tasks for their properties
CREATE POLICY "Users can insert own cleaning_tasks"
  ON cleaning_tasks FOR INSERT
  WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- UPDATE: users can update tasks for their properties
CREATE POLICY "Users can update own cleaning_tasks"
  ON cleaning_tasks FOR UPDATE
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()))
  WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- DELETE: users can delete tasks for their properties
CREATE POLICY "Users can delete own cleaning_tasks"
  ON cleaning_tasks FOR DELETE
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));
