-- Agent loop v1 — Milestone 6, migration 1 of 3.
--
-- Rename action_type 'memory_fact_write' → 'write_memory_fact' to align
-- with the verb_noun naming convention shared by M3's read_memory tool
-- and every future gated action type (write_memory_fact establishes the
-- pattern; propose_guest_message, propose_price_change, etc. follow).
--
-- Pure data UPDATE. agent_audit_log.action_type has no CHECK constraint
-- (Phase 1 STOP confirmed; the column is plain `text NOT NULL` per
-- 20260501030000_agent_audit_log.sql:29). Nothing to alter on the
-- constraint side.
--
-- Companion authoring changes (same M6 commit, separate files):
--   - src/lib/action-substrate/stakes-registry.ts seed entry
--   - src/lib/action-substrate/tests/audit-writer.test.ts
--   - src/lib/action-substrate/tests/request-action.test.ts
--   - src/lib/action-substrate/tests/stakes-registry.test.ts
--   - schema-comment cleanup on agent_audit_log.action_type referencing
--     the stale 'memory.write' value

UPDATE agent_audit_log
SET action_type = 'write_memory_fact'
WHERE action_type = 'memory_fact_write';
