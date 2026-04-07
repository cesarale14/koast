-- Track Channex booking revision polling state
CREATE TABLE IF NOT EXISTS channex_sync_state (
  id text PRIMARY KEY DEFAULT 'default',
  last_revision_id text,
  last_polled_at timestamptz DEFAULT now(),
  revisions_processed integer DEFAULT 0
);

-- Seed default row
INSERT INTO channex_sync_state (id) VALUES ('default') ON CONFLICT DO NOTHING;

-- Add revision_id to webhook log for dedup between webhook + poller
ALTER TABLE channex_webhook_log ADD COLUMN IF NOT EXISTS revision_id text;
CREATE INDEX IF NOT EXISTS idx_webhook_log_revision_id ON channex_webhook_log(revision_id) WHERE revision_id IS NOT NULL;
