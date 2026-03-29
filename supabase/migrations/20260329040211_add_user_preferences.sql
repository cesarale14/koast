CREATE TABLE user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own preferences" ON user_preferences FOR ALL
  USING (user_id = auth.uid());
