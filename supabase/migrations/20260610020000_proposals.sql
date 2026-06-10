-- Koast v1 P2.3 — proposals: the agent's host-surface suggestions (built now,
-- emitted by the agent's hands in P3). A proposal targets a property and is
-- host-readable; the host approves/dismisses. Approval executes through the
-- SAME named internal action the manual UI uses (no agent side-doors) and
-- writes an agent_audit_log row; dismiss closes with zero side effects.
--
-- Host-scoped (direct host_id; RLS = host_id = auth.uid(), SELECT-only — all
-- writes go via createServiceClient/service_role). property_id is the action
-- target (both columns carried per the host-readable-yet-property-targeted
-- shape). Additive; staging-first 7-step discipline + 3-part CREATE TABLE
-- verify (information_schema + pg_indexes + pg_policies/relrowsecurity per the
-- RLS-silent-failure guard).
--
-- NOTE: the table is named `proposals`, distinct from agent_artifacts (which is
-- conversation-turn-scoped, in-chat gated-tool artifacts). proposals is the
-- host-surface suggestion store surfaced on Today / the bell / inline in chat.

CREATE TABLE proposals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  action_type   text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}',
  rationale     text,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'dismissed', 'executed', 'failed')),
  created_by    text NOT NULL CHECK (created_by IN ('agent', 'host', 'worker', 'system')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  executed_at   timestamptz,
  result        jsonb
);

CREATE INDEX idx_proposals_host_status ON proposals(host_id, status);
CREATE INDEX idx_proposals_property ON proposals(property_id);
CREATE INDEX idx_proposals_host_created ON proposals(host_id, created_at DESC);

-- Session-3 explicit-RLS discipline.
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

-- Host reads own proposals. Server-side writes go via createServiceClient
-- (service_role; bypasses RLS).
CREATE POLICY proposals_select_own ON proposals
  FOR SELECT TO authenticated
  USING (auth.uid() = host_id);

COMMENT ON TABLE proposals IS
  'Koast v1 P2.3 — agent-proposed (and host/worker/system-created) host-surface actions. Host approves/dismisses; approval executes through the named internal action + writes agent_audit_log. Host-scoped (RLS host_id=auth.uid(), SELECT-only; writes via service_role).';
COMMENT ON COLUMN proposals.status IS
  'pending=awaiting host; approved=host approved, execution in flight; executed=action ran; failed=execution errored (stays actionable, re-approvable); dismissed=host rejected (zero side effects).';
COMMENT ON COLUMN proposals.payload IS
  'Action input. Convention: { block: <id-lean BlockData rendered by the ProposalCard>, action: <execution fields incl. entity ids> }.';
COMMENT ON COLUMN proposals.created_by IS
  'agent (the agents hands, P3) | host | worker | system. Mirrors agent_audit_log.actor_kind.';

-- Verify (staging + prod):
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='proposals' ORDER BY ordinal_position;
-- SELECT indexname FROM pg_indexes WHERE tablename='proposals' ORDER BY indexname;
-- SELECT polname, cmd FROM pg_policies WHERE tablename='proposals';
-- SELECT relrowsecurity FROM pg_class WHERE relname='proposals';
-- INSERT INTO koast_migration_history (migration_name, applied_by, notes)
--   VALUES ('20260610020000_proposals', 'koast-v1-p2.3', 'P2.3 proposals table (host-surface suggestions)')
--   ON CONFLICT (migration_name) DO NOTHING;
