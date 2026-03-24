-- StayCommand Initial Schema
-- Run via Supabase SQL Editor or supabase db push

-- =============================================================================
-- Updated_at trigger function
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Core entities
-- =============================================================================

CREATE TABLE properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  address text,
  city text,
  state text,
  zip text,
  latitude decimal(10,7),
  longitude decimal(10,7),
  bedrooms int,
  bathrooms decimal(3,1),
  max_guests int,
  property_type text CHECK (property_type IN ('entire_home', 'private_room', 'shared_room')),
  amenities jsonb DEFAULT '[]',
  photos jsonb DEFAULT '[]',
  channex_property_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties NOT NULL,
  platform text CHECK (platform IN ('airbnb', 'vrbo', 'booking_com', 'direct')) NOT NULL,
  platform_listing_id text,
  channex_room_id text,
  listing_url text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  UNIQUE(property_id, platform)
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties NOT NULL,
  listing_id uuid REFERENCES listings,
  platform text NOT NULL,
  platform_booking_id text,
  channex_booking_id text,
  guest_name text,
  guest_email text,
  guest_phone text,
  check_in date NOT NULL,
  check_out date NOT NULL,
  num_guests int,
  total_price decimal(10,2),
  currency text DEFAULT 'USD',
  status text DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- Pricing
-- =============================================================================

CREATE TABLE calendar_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties NOT NULL,
  date date NOT NULL,
  base_rate decimal(10,2),
  suggested_rate decimal(10,2),
  applied_rate decimal(10,2),
  min_stay int DEFAULT 1,
  is_available boolean DEFAULT true,
  rate_source text DEFAULT 'manual' CHECK (rate_source IN ('manual', 'engine', 'override')),
  factors jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(property_id, date)
);

-- =============================================================================
-- Market data cache
-- =============================================================================

CREATE TABLE market_comps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties NOT NULL,
  comp_listing_id text,
  comp_name text,
  comp_bedrooms int,
  comp_adr decimal(10,2),
  comp_occupancy decimal(5,2),
  comp_revpar decimal(10,2),
  distance_km decimal(5,2),
  last_synced timestamptz DEFAULT now()
);

CREATE TABLE market_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties NOT NULL,
  snapshot_date date NOT NULL,
  market_adr decimal(10,2),
  market_occupancy decimal(5,2),
  market_revpar decimal(10,2),
  market_supply int,
  market_demand_score decimal(5,2),
  data_source text DEFAULT 'airroi',
  raw_data jsonb,
  created_at timestamptz DEFAULT now()
);

-- =============================================================================
-- Messaging
-- =============================================================================

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings,
  property_id uuid REFERENCES properties NOT NULL,
  platform text NOT NULL,
  direction text CHECK (direction IN ('inbound', 'outbound')),
  sender_name text,
  content text NOT NULL,
  ai_draft text,
  ai_draft_status text DEFAULT 'none' CHECK (ai_draft_status IN ('none', 'pending', 'generated', 'approved', 'sent')),
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- =============================================================================
-- Turnover / Cleaning
-- =============================================================================

CREATE TABLE cleaning_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties NOT NULL,
  booking_id uuid REFERENCES bookings,
  next_booking_id uuid REFERENCES bookings,
  cleaner_id uuid REFERENCES auth.users,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'issue')),
  scheduled_date date NOT NULL,
  scheduled_time time,
  checklist jsonb DEFAULT '[]',
  photos jsonb DEFAULT '[]',
  notes text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_bookings_property_checkin ON bookings(property_id, check_in);
CREATE INDEX idx_calendar_rates_property_date ON calendar_rates(property_id, date);
CREATE INDEX idx_messages_property_created ON messages(property_id, created_at);
CREATE INDEX idx_cleaning_tasks_property_date ON cleaning_tasks(property_id, scheduled_date);
CREATE INDEX idx_properties_user ON properties(user_id);
CREATE INDEX idx_listings_property ON listings(property_id);
CREATE INDEX idx_market_comps_property ON market_comps(property_id);
CREATE INDEX idx_market_snapshots_property_date ON market_snapshots(property_id, snapshot_date);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_comps ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_tasks ENABLE ROW LEVEL SECURITY;

-- Properties: users see only their own
CREATE POLICY "Users can view own properties"
  ON properties FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own properties"
  ON properties FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own properties"
  ON properties FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own properties"
  ON properties FOR DELETE
  USING (auth.uid() = user_id);

-- Listings: via property ownership
CREATE POLICY "Users can view own listings"
  ON listings FOR SELECT
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own listings"
  ON listings FOR INSERT
  WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own listings"
  ON listings FOR UPDATE
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own listings"
  ON listings FOR DELETE
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- Bookings: via property ownership
CREATE POLICY "Users can view own bookings"
  ON bookings FOR SELECT
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own bookings"
  ON bookings FOR INSERT
  WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own bookings"
  ON bookings FOR UPDATE
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own bookings"
  ON bookings FOR DELETE
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- Calendar rates: via property ownership
CREATE POLICY "Users can view own calendar_rates"
  ON calendar_rates FOR SELECT
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own calendar_rates"
  ON calendar_rates FOR INSERT
  WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own calendar_rates"
  ON calendar_rates FOR UPDATE
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own calendar_rates"
  ON calendar_rates FOR DELETE
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- Market comps: via property ownership
CREATE POLICY "Users can view own market_comps"
  ON market_comps FOR SELECT
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own market_comps"
  ON market_comps FOR INSERT
  WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own market_comps"
  ON market_comps FOR UPDATE
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own market_comps"
  ON market_comps FOR DELETE
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- Market snapshots: via property ownership
CREATE POLICY "Users can view own market_snapshots"
  ON market_snapshots FOR SELECT
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own market_snapshots"
  ON market_snapshots FOR INSERT
  WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own market_snapshots"
  ON market_snapshots FOR UPDATE
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own market_snapshots"
  ON market_snapshots FOR DELETE
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- Messages: via property ownership
CREATE POLICY "Users can view own messages"
  ON messages FOR SELECT
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own messages"
  ON messages FOR INSERT
  WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own messages"
  ON messages FOR UPDATE
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own messages"
  ON messages FOR DELETE
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- Cleaning tasks: via property ownership
CREATE POLICY "Users can view own cleaning_tasks"
  ON cleaning_tasks FOR SELECT
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own cleaning_tasks"
  ON cleaning_tasks FOR INSERT
  WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own cleaning_tasks"
  ON cleaning_tasks FOR UPDATE
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own cleaning_tasks"
  ON cleaning_tasks FOR DELETE
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));
