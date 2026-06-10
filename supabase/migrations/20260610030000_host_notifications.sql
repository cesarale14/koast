-- Koast v1 P2.4 — host_notifications: the curated host-facing in-app feed behind
-- the bell. DISTINCT from `notifications` (the outbound SMS/email delivery AUDIT
-- LOG) and from unified_audit_feed (the deep operational ledger / AuditDrawer).
-- This is a small, per-item-read set of events the host cares about, each with a
-- deep-link payload (e.g. cleaning_completed → open the photos).
--
-- Host-scoped (direct host_id; RLS host_id=auth.uid(), SELECT-only — all writes
-- via createServiceClient/service_role). Additive; staging-first 7-step
-- discipline + 3-part CREATE TABLE verify (information_schema + pg_indexes +
-- pg_policies/relrowsecurity per the RLS-silent-failure guard).

CREATE TABLE host_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL
                CHECK (type IN ('cleaning_completed', 'booking_new', 'booking_cancelled', 'proposal_created', 'push_delivery_failure')),
  payload     jsonb NOT NULL DEFAULT '{}',
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_host_notifications_recent ON host_notifications(host_id, created_at DESC);
-- Partial index for the unread-count badge (read_at IS NULL).
CREATE INDEX idx_host_notifications_unread ON host_notifications(host_id) WHERE read_at IS NULL;

-- Session-3 explicit-RLS discipline.
ALTER TABLE host_notifications ENABLE ROW LEVEL SECURITY;

-- Host reads own feed. Server-side writes go via createServiceClient
-- (service_role; bypasses RLS).
CREATE POLICY host_notifications_select_own ON host_notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = host_id);

COMMENT ON TABLE host_notifications IS
  'Koast v1 P2.4 — curated host-facing in-app notification feed behind the bell (per-item read_at + deep-link payload). Distinct from `notifications` (outbound SMS/email audit log) and unified_audit_feed (operational ledger). Host-scoped (RLS host_id=auth.uid(), SELECT-only; writes via service_role).';
COMMENT ON COLUMN host_notifications.type IS
  'cleaning_completed | booking_new | booking_cancelled | proposal_created | push_delivery_failure. Mirrored by HostNotificationType.';
COMMENT ON COLUMN host_notifications.payload IS
  'Display fields + deep-link target, e.g. cleaning_completed → {taskId, propertyName, photoCount}.';

-- Verify (staging + prod):
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='host_notifications' ORDER BY ordinal_position;
-- SELECT indexname FROM pg_indexes WHERE tablename='host_notifications' ORDER BY indexname;
-- SELECT policyname, cmd FROM pg_policies WHERE tablename='host_notifications';
-- SELECT relrowsecurity FROM pg_class WHERE relname='host_notifications';
-- INSERT INTO koast_migration_history (migration_name, applied_by, notes)
--   VALUES ('20260610030000_host_notifications', 'koast-v1-p2.4', 'P2.4 host_notifications feed (the bell)')
--   ON CONFLICT (migration_name) DO NOTHING;
