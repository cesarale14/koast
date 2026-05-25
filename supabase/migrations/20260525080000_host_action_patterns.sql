-- M11 Phase B item 1 — F8 host_action_patterns substrate.
--
-- Per agent-loop-v1-design.md §7.3 + M11 Phase B STEP 2 conventions
-- reconciliation ([[phase-b-phase-1-stop]] §3 + §4.1): pattern-match
-- index for host responses to agent-proposed actions. Subject = host
-- (calibration target). Originating actor implicit (agent at v1).
-- Row written on /api/agent/artifact terminal-state transitions
-- (approve/edit-then-approve/discard); read logic deferred to
-- Phase 2 (v1 writes only — substrate-without-immediate-behavior-
-- change pattern; potential 3rd M3-outcome-3-family instance).
--
-- Schema reconciliation additions vs §7.3:
--   - ENABLE ROW LEVEL SECURITY (Session-3 explicit-RLS discipline)
--   - CREATE POLICY for SELECT (host reads own; service_role bypass for writes)
--   - Nullable agent_audit_log_id FK for lineage to full audit record
--
-- Apply-before-writing-code 6th instance (first STATE-CHANGING apply
-- after M10 H1 + M11 A2 which were no-op DROP-IF-EXISTS). 7-step
-- discipline: staging psql → 3-part verify (information_schema +
-- pg_indexes + pg_policies+relrowsecurity per RLS-silent-failure
-- guard) → INSERT history → prod psql → 3-part verify → INSERT
-- history → THEN code commit.

CREATE TABLE host_action_patterns (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type          text NOT NULL,
  outcome              text NOT NULL CHECK (outcome IN ('confirmed', 'modified', 'dismissed', 'silent')),
  payload_summary      jsonb NOT NULL DEFAULT '{}',
  agent_audit_log_id   uuid REFERENCES agent_audit_log(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_host_action_patterns_lookup
  ON host_action_patterns(host_id, action_type, created_at DESC);

-- Session-3 explicit-RLS discipline.
ALTER TABLE host_action_patterns ENABLE ROW LEVEL SECURITY;

-- Host reads own patterns. Server-side writes go via createServiceClient
-- (service_role; bypasses RLS).
CREATE POLICY host_action_patterns_select_own ON host_action_patterns
  FOR SELECT TO authenticated
  USING (auth.uid() = host_id);

COMMENT ON TABLE host_action_patterns IS
  'M11 Phase B (M1) — light fingerprint of host responses to agent-proposed actions. Subject=host. Pattern-match index for Phase 2+ calibration logic. Full audit lives in agent_audit_log (optional join via agent_audit_log_id).';

COMMENT ON COLUMN host_action_patterns.outcome IS
  'confirmed=host approved unchanged; modified=host edited then approved (M7 D38); dismissed=host rejected; silent=autonomous (Phase 2+, dead-value at v1).';
