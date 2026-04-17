-- Notification audit log. Every outbound user notification (SMS today,
-- email/push later) that the app sends lands here as a durable record
-- so delivery issues can be debugged and notification history can be
-- surfaced in the UI.
--
-- Writer: src/lib/notifications/index.ts storeNotification() is called
-- after every notify* call (cleaner_assigned, cleaner_reminder,
-- host_complete, host_issue). The shape matches the existing Drizzle
-- schema in src/lib/db/schema.ts (exported as `notifications`).
--
-- The table was declared in schema.ts but its migration was missing —
-- inserts were silently failing against a nonexistent table. This
-- migration resolves that gap.

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL,
  recipient   text,
  message     text NOT NULL,
  channel     text DEFAULT 'console',
  sent_at     timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON notifications(type);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON notifications(created_at DESC);
