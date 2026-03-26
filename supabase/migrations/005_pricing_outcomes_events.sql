-- Pricing outcomes (ML data foundation)
CREATE TABLE pricing_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties NOT NULL,
  date date NOT NULL,
  suggested_rate decimal(10,2),
  applied_rate decimal(10,2),
  rate_source text,
  was_booked boolean DEFAULT false,
  booking_id uuid REFERENCES bookings,
  actual_revenue decimal(10,2),
  booked_at timestamptz,
  days_before_checkin int,
  market_adr decimal(10,2),
  market_occupancy decimal(5,2),
  demand_score decimal(5,2),
  comp_median_adr decimal(10,2),
  signals jsonb,
  revenue_vs_suggested decimal(10,2),
  created_at timestamptz DEFAULT now(),
  UNIQUE(property_id, date)
);

CREATE INDEX idx_pricing_outcomes_property_date ON pricing_outcomes(property_id, date);
CREATE INDEX idx_pricing_outcomes_booked ON pricing_outcomes(was_booked, date);

ALTER TABLE pricing_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own pricing_outcomes"
  ON pricing_outcomes FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- Local events
CREATE TABLE local_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties,
  event_name text NOT NULL,
  event_date date NOT NULL,
  venue_name text,
  event_type text,
  estimated_attendance int,
  demand_impact decimal(3,2),
  source text DEFAULT 'ticketmaster',
  raw_data jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_local_events_property_date ON local_events(property_id, event_date);
CREATE INDEX idx_local_events_date ON local_events(event_date);

ALTER TABLE local_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own local_events"
  ON local_events FOR ALL
  USING (property_id IS NULL OR property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));
