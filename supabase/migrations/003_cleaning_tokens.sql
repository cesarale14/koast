-- Add cleaner token for mobile access
ALTER TABLE cleaning_tasks ADD COLUMN cleaner_token text;
CREATE UNIQUE INDEX idx_cleaning_tasks_token ON cleaning_tasks(cleaner_token) WHERE cleaner_token IS NOT NULL;

-- Notifications table
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  recipient text,
  message text NOT NULL,
  channel text DEFAULT 'console',
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
