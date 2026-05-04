-- Agent loop v1 — Milestone 6, migration 2 of 3.
--
-- Expand agent_artifacts to carry the full proposal lifecycle for M6's
-- first gated write tool (write_memory_fact) and every future gated
-- action that follows the propose-then-approve pattern.
--
-- Three concerns ship together because they all encode the artifact
-- lifecycle layer (D21 + D25 in the M6 conventions doc):
--
--   1. audit_log_id FK — paired ref to the audit row recorded for the
--      same proposal attempt. Lifecycle (this table) and execution-
--      accountability (agent_audit_log) are distinct concerns; the FK
--      makes the relationship explicit and queryable. Pre-existing
--      JSONB lookup via agent_audit_log.context.artifact_id stays as a
--      defensive secondary path for back-compat with M2's bypass code.
--
--   2. supersedes self-reference — correction-chain at the lifecycle
--      layer. When the agent proposes a corrected memory write, the
--      new artifact row carries supersedes pointing at the prior row;
--      the substrate also flips the prior row's state to 'superseded'.
--
--   3. state CHECK gains 'superseded' — additive, alongside the
--      existing 'emitted', 'confirmed', 'edited', 'dismissed' values
--      from 20260501020000_agent_loop_tables.sql:174-176. Existing
--      rows are unaffected; default state stays 'emitted'.
--
-- agent_audit_log.outcome is intentionally NOT touched. Audit log is
-- execution accountability (succeeded/failed/pending of the action's
-- handler attempt); supersession is lifecycle, not execution. Keeping
-- the two semantics separate is the load-bearing decision of D21/D25.

ALTER TABLE agent_artifacts
  ADD COLUMN audit_log_id uuid NULL REFERENCES agent_audit_log(id) ON DELETE SET NULL;

ALTER TABLE agent_artifacts
  ADD COLUMN supersedes uuid NULL REFERENCES agent_artifacts(id) ON DELETE SET NULL;

ALTER TABLE agent_artifacts DROP CONSTRAINT agent_artifacts_state_check;
ALTER TABLE agent_artifacts ADD CONSTRAINT agent_artifacts_state_check
  CHECK (state IN ('emitted', 'confirmed', 'edited', 'dismissed', 'superseded'));

-- Lookup the audit-log row for an artifact (e.g., when the artifact
-- endpoint resolves an approve/discard action). Partial because
-- legacy rows pre-M6 have NULL audit_log_id; new rows are non-null.
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_audit_log
  ON agent_artifacts(audit_log_id)
  WHERE audit_log_id IS NOT NULL;

-- Walk the supersession chain (find the artifact this one corrects).
-- Partial because most rows have NULL supersedes.
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_supersedes
  ON agent_artifacts(supersedes)
  WHERE supersedes IS NOT NULL;
