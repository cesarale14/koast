-- Session 8a — Messaging template executor.
--
-- Two changes:
-- 1. Rename `messages.ai_draft_status` → `messages.draft_status`.
--    Original column was AI-specific; the executor now writes
--    template-rendered drafts through the same column. Rename
--    captures the broader semantic. ≤8-file rg sweep at session
--    start confirmed safe — only 3 callers + the schema declaration.
-- 2. New `message_automation_firings` table for idempotency.
--    Worker INSERTs ON CONFLICT DO NOTHING RETURNING id; only
--    creates a draft message when the insert succeeded.
--    Full unique constraint per `feedback_postgrest_partial_index_upsert`
--    convention — no partial indexes for upsert paths.

ALTER TABLE messages RENAME COLUMN ai_draft_status TO draft_status;

-- Comment doc — the union as of 8a:
--   'none'                    (default — inbound or never drafted)
--   'generated'               (set by /api/messages/draft after Claude renders)
--   'sent'                    (set by /api/messages/send when isAutoReply=true,
--                              or by Approve & Send for template drafts)
--   'draft_pending_approval'  (set by messaging_executor.py — host action required)
--   'discarded'               (set by /api/messages/threads/[id]/discard)
COMMENT ON COLUMN messages.draft_status IS
  'Draft lifecycle: none | generated | sent | draft_pending_approval | discarded';

CREATE TABLE message_automation_firings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL
    REFERENCES message_templates(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL
    REFERENCES bookings(id) ON DELETE CASCADE,
  draft_message_id uuid
    REFERENCES messages(id) ON DELETE SET NULL,
  fired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, booking_id)
);

CREATE INDEX idx_message_automation_firings_template
  ON message_automation_firings(template_id);
