-- M13 D1 — conversation soft-delete.
--
-- docs/conversation-lifecycle-spec.md operation D1 (P0): conversations are
-- SOFT-deleted (deleted_at flag), filtered from every read, reversible. This
-- migration adds the nullable column + a partial recency index covering only
-- LIVE rows (the rail's hot path: host_id, last_turn_at DESC WHERE not deleted).
--
-- ADD COLUMN only — agent_conversations already exists and is RLS-enabled, so
-- no ENABLE ROW LEVEL SECURITY / policy block is needed. deleted_at NULL = live;
-- non-NULL = soft-deleted.
--
-- MIGRATION ORDERING IS LOAD-BEARING (worse than the cmdk failure class — a
-- missing column 500s EVERY conversation list + load): apply to STAGING and
-- verify the column + index BEFORE the read-filter code runs against staging,
-- and to PROD before that code deploys. Staging-first discipline +
-- koast_migration_history per docs/architecture/staging-environment.md.

ALTER TABLE agent_conversations
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_agent_conversations_host_active
  ON agent_conversations (host_id, last_turn_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN agent_conversations.deleted_at IS
  'M13 D1 soft-delete. NULL = live; non-NULL = soft-deleted — filtered from all conversation reads via the notDeleted() helper in src/lib/agent/conversation.ts (enforced by scripts/conversation-reads-guard.sh). Reversible: undo nulls it.';
