-- Cleaners table
CREATE TABLE cleaners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cleaners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cleaners" ON cleaners FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX idx_cleaners_user ON cleaners(user_id);

-- Default cleaner per property
ALTER TABLE properties ADD COLUMN IF NOT EXISTS default_cleaner_id uuid REFERENCES cleaners;

-- SMS log table
CREATE TABLE sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users,
  cleaner_id uuid REFERENCES cleaners,
  cleaning_task_id uuid REFERENCES cleaning_tasks,
  phone_to text NOT NULL,
  message_body text NOT NULL,
  twilio_sid text,
  status text DEFAULT 'sent',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own sms logs" ON sms_log FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Service inserts sms logs" ON sms_log FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_sms_log_user ON sms_log(user_id);
CREATE INDEX idx_sms_log_task ON sms_log(cleaning_task_id);

-- Reminder tracking on cleaning tasks
ALTER TABLE cleaning_tasks ADD COLUMN IF NOT EXISTS reminder_sent boolean DEFAULT false;
