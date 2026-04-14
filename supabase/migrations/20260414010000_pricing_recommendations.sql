-- Pricing engine validation log.
--
-- Each row captures, for a single property+date, what Koast's 9-signal
-- pricing engine thinks the rate should be compared to what Airbnb is
-- actually showing right now (which may be Airbnb's own Smart Pricing,
-- the host's static override, or Koast's last push). The delta is the
-- proof point that shows whether our engine is beating Airbnb's.
--
-- Populated daily by the pricing_validator.py VPS worker.

CREATE TABLE IF NOT EXISTS pricing_recommendations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  date            date NOT NULL,
  -- What Airbnb is actually displaying right now, via Channex
  current_rate    numeric(10, 2),
  -- What Koast's pricing engine suggests (9-signal output)
  suggested_rate  numeric(10, 2),
  -- Per-signal breakdown + dollar impact. Shape:
  --   { "demand":     { "value": 0.72, "delta": 12.50, "score": 0.2,  "reason": "..." },
  --     "seasonality":{ "value": 1.05, "delta":  6.00, "score": 0.15, "reason": "..." },
  --     ... }
  reason_signals  jsonb,
  -- Computed on insert for quick reporting
  delta_abs       numeric(10, 2) GENERATED ALWAYS AS (suggested_rate - current_rate) STORED,
  delta_pct       numeric(6, 2)  GENERATED ALWAYS AS (
    CASE
      WHEN current_rate IS NULL OR current_rate = 0 THEN NULL
      ELSE ROUND(((suggested_rate - current_rate) / current_rate) * 100, 2)
    END
  ) STORED,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_recommendations_property_date
  ON pricing_recommendations(property_id, date);

CREATE INDEX IF NOT EXISTS idx_pricing_recommendations_created_at
  ON pricing_recommendations(created_at DESC);

-- Convenience view: most recent recommendation per (property, date). The
-- validator inserts a new row every run so we want quick access to the
-- latest snapshot without pruning history.
CREATE OR REPLACE VIEW pricing_recommendations_latest AS
SELECT DISTINCT ON (property_id, date)
  id, property_id, date, current_rate, suggested_rate,
  reason_signals, delta_abs, delta_pct, created_at
FROM pricing_recommendations
ORDER BY property_id, date, created_at DESC;
