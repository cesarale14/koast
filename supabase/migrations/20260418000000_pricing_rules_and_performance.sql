-- Track B Stage 1 PR B: rules enforcement + outcome tracking foundation.
--
-- pricing_rules  → per-property guardrails (min/max/base rate, channel
--   markups, daily-delta cap, comp floor, seasonal overrides, auto-apply
--   toggle). Source marker tracks lineage: 'defaults' (hard-coded), 'inferred'
--   (from >=30 days of calendar_rates), 'host_set' (explicit edit). The
--   inferred_from JSONB captures the summary stats the inference used, so
--   the algorithm can be re-run auditably when it improves.
--
-- pricing_performance → suggested vs applied vs actual per date, with a
--   generated revenue_delta column. Consumed by the seasonality learning
--   loop and the "how the engine performed" scorecard.
--
-- pricing_recommendations extensions → status/urgency/reason_text so the UI
--   can show "Act now" vs "Coming up" vs "Review" groupings with human-
--   readable reasons, and so dismiss/apply transitions persist to the row.

CREATE TABLE IF NOT EXISTS pricing_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         uuid NOT NULL UNIQUE REFERENCES properties(id) ON DELETE CASCADE,
  base_rate           numeric(10, 2) NOT NULL,
  min_rate            numeric(10, 2) NOT NULL,
  max_rate            numeric(10, 2) NOT NULL,
  channel_markups     jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_daily_delta_pct numeric(5, 4) NOT NULL DEFAULT 0.20,
  comp_floor_pct      numeric(5, 4) NOT NULL DEFAULT 0.85,
  seasonal_overrides  jsonb DEFAULT '{}'::jsonb,
  auto_apply          boolean NOT NULL DEFAULT false,
  source              text NOT NULL DEFAULT 'defaults'
    CHECK (source IN ('defaults', 'inferred', 'host_set')),
  inferred_from       jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (min_rate <= base_rate AND base_rate <= max_rate),
  CHECK (max_daily_delta_pct > 0 AND max_daily_delta_pct <= 1.0),
  CHECK (comp_floor_pct >= 0 AND comp_floor_pct <= 1.0)
);

CREATE TABLE IF NOT EXISTS pricing_performance (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  date              date NOT NULL,
  suggested_rate    numeric(10, 2) NOT NULL,
  applied_rate      numeric(10, 2),
  actual_rate       numeric(10, 2),
  applied_at        timestamptz,
  booked            boolean NOT NULL DEFAULT false,
  booked_at         timestamptz,
  revenue_delta     numeric(10, 2) GENERATED ALWAYS AS (
    CASE WHEN booked AND actual_rate IS NOT NULL AND suggested_rate IS NOT NULL
         THEN actual_rate - suggested_rate ELSE NULL END
  ) STORED,
  channels_pushed   text[] DEFAULT ARRAY[]::text[],
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_performance_property_date
  ON pricing_performance(property_id, date);

CREATE INDEX IF NOT EXISTS idx_pricing_performance_applied
  ON pricing_performance(applied_at DESC) WHERE applied_at IS NOT NULL;

-- Extend pricing_recommendations with workflow state.
ALTER TABLE pricing_recommendations
  ADD COLUMN IF NOT EXISTS status       text        NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS applied_at   timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS urgency      text,
  ADD COLUMN IF NOT EXISTS reason_text  text;

CREATE INDEX IF NOT EXISTS idx_pricing_recommendations_status_pending
  ON pricing_recommendations(property_id, date) WHERE status = 'pending';
