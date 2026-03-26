CREATE TABLE ical_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties NOT NULL,
  platform text NOT NULL CHECK (platform IN ('airbnb', 'vrbo', 'booking_com', 'direct')),
  feed_url text NOT NULL,
  is_active boolean DEFAULT true,
  last_synced timestamptz,
  last_error text,
  sync_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_ical_feeds_property_platform ON ical_feeds(property_id, platform);
CREATE INDEX idx_ical_feeds_active ON ical_feeds(is_active);

ALTER TABLE ical_feeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own ical feeds" ON ical_feeds
  FOR ALL USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));
