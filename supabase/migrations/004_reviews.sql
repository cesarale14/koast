-- Review automation system

CREATE TABLE review_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties NOT NULL,
  is_active boolean DEFAULT true,
  auto_publish boolean DEFAULT false,
  publish_delay_days int DEFAULT 3,
  tone text DEFAULT 'warm' CHECK (tone IN ('warm', 'professional', 'enthusiastic')),
  target_keywords text[] DEFAULT '{}',
  bad_review_delay boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE guest_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings UNIQUE NOT NULL,
  property_id uuid REFERENCES properties NOT NULL,
  direction text CHECK (direction IN ('outgoing', 'incoming')),

  -- Outgoing (host → guest)
  draft_text text,
  final_text text,
  star_rating int DEFAULT 5 CHECK (star_rating BETWEEN 1 AND 5),
  recommend_guest boolean DEFAULT true,
  private_note text,

  -- Incoming (guest → host)
  incoming_text text,
  incoming_rating decimal(2,1),
  incoming_date timestamptz,
  response_draft text,
  response_final text,
  response_sent boolean DEFAULT false,

  -- Status
  status text DEFAULT 'pending' CHECK (status IN (
    'pending', 'draft_generated', 'approved', 'scheduled', 'published', 'bad_review_held'
  )),
  scheduled_publish_at timestamptz,
  published_at timestamptz,
  is_bad_review boolean DEFAULT false,

  -- AI context
  ai_context jsonb,
  created_at timestamptz DEFAULT now()
);

-- Add review solicitation tracking to bookings
ALTER TABLE bookings ADD COLUMN review_solicitation_sent boolean DEFAULT false;

-- Indexes
CREATE INDEX idx_guest_reviews_property ON guest_reviews(property_id);
CREATE INDEX idx_guest_reviews_status ON guest_reviews(status);
CREATE INDEX idx_guest_reviews_scheduled ON guest_reviews(scheduled_publish_at) WHERE status = 'scheduled';
CREATE INDEX idx_review_rules_property ON review_rules(property_id);

-- RLS
ALTER TABLE review_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own review_rules"
  ON review_rules FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own guest_reviews"
  ON guest_reviews FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));
