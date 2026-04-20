-- Backfill calendar_rates from applied pricing recommendations.
--
-- Why: pre-Session-4.6 /api/pricing/apply only pushed rates to BDC and
-- did NOT write the applied rate back into calendar_rates. This script
-- heals the gap by reconstructing calendar_rates rows from the paired
-- (pricing_recommendations + pricing_performance) history.
--
-- Idempotent: `ON CONFLICT DO NOTHING` so a second run is a no-op. If
-- Session 4.6 already wrote a row for a given (property, date, channel)
-- tuple, we do not clobber it with historical data.
--
-- Expected heals after a successful run:
--   - Villa Jamaica Stage 1 test (rec 5a18fb28-bd6b-4920-b491-ddcb8ef03abf,
--     May 24 2026, $230 BDC) → two new calendar_rates rows: one per-
--     channel override (channel_code='BDC') + one base row (NULL).
--
-- Verification queries (run before + after):
--   SELECT COUNT(*) AS missing_rows
--   FROM pricing_recommendations r
--   JOIN pricing_performance p ON p.property_id = r.property_id AND p.date = r.date
--   WHERE r.status = 'applied'
--     AND p.applied_rate IS NOT NULL
--     AND NOT EXISTS (
--       SELECT 1 FROM calendar_rates cr
--       WHERE cr.property_id = r.property_id AND cr.date = r.date AND cr.channel_code IS NULL
--     );
--
--   SELECT * FROM calendar_rates
--   WHERE property_id = 'bfb0750e-9ae9-4ef4-a7de-988062f6a0ad'
--     AND date = '2026-05-24';

BEGIN;

-- Per-channel override rows. Explode the pricing_performance.channels_pushed
-- text[] array and map each slug to the calendar_rates.channel_code
-- upper-case convention ('booking_com' → 'BDC', 'airbnb' → 'ABB', ...).
INSERT INTO calendar_rates (property_id, date, channel_code, applied_rate, rate_source, is_available)
SELECT
  r.property_id,
  r.date,
  CASE lower(slug)
    WHEN 'booking_com' THEN 'BDC'
    WHEN 'booking-com' THEN 'BDC'
    WHEN 'booking'     THEN 'BDC'
    WHEN 'airbnb'      THEN 'ABB'
    WHEN 'vrbo'        THEN 'VRBO'
    WHEN 'direct'      THEN 'DIRECT'
    ELSE upper(slug)
  END AS channel_code,
  p.applied_rate,
  'engine' AS rate_source,
  TRUE AS is_available
FROM pricing_recommendations r
JOIN pricing_performance p
  ON p.property_id = r.property_id AND p.date = r.date
CROSS JOIN LATERAL unnest(p.channels_pushed) AS slug
WHERE r.status = 'applied'
  AND p.applied_rate IS NOT NULL
ON CONFLICT (property_id, date, channel_code) DO NOTHING;

-- Base row (channel_code = NULL). DISTINCT to dedupe when a (property,
-- date) pair has multiple performance rows (shouldn't, but defensive).
INSERT INTO calendar_rates (property_id, date, channel_code, applied_rate, rate_source, is_available)
SELECT DISTINCT
  r.property_id,
  r.date,
  NULL AS channel_code,
  p.applied_rate,
  'engine' AS rate_source,
  TRUE AS is_available
FROM pricing_recommendations r
JOIN pricing_performance p
  ON p.property_id = r.property_id AND p.date = r.date
WHERE r.status = 'applied'
  AND p.applied_rate IS NOT NULL
ON CONFLICT (property_id, date, channel_code) DO NOTHING;

COMMIT;
