CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  address text, city text, state text, zip text,
  bedrooms int,
  current_rate decimal(10,2),
  estimated_opportunity decimal(10,2),
  market_adr decimal(10,2),
  source text DEFAULT 'revenue_check',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE revenue_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text,
  address text, city text, state text,
  bedrooms int, current_rate decimal(10,2),
  result_json jsonb,
  lead_id uuid REFERENCES leads,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_revenue_checks_ip ON revenue_checks(ip_address, created_at);
