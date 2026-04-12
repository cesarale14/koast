-- Per-channel rate overrides on calendar_rates.
--
-- Base rates (from the pricing engine / manual edits at the property level)
-- keep channel_code = NULL. Per-channel overrides are sibling rows with the
-- same (property_id, date) but a populated channel_code (e.g. 'BDC', 'VRBO').
--
-- Readers that want the base rate must filter `channel_code IS NULL`.
-- Readers that want the effective rate for a specific channel should look up
-- the channel override first and fall back to the base rate.

ALTER TABLE calendar_rates ADD COLUMN IF NOT EXISTS channel_code TEXT NULL;
ALTER TABLE calendar_rates ADD COLUMN IF NOT EXISTS channex_rate_plan_id TEXT NULL;
ALTER TABLE calendar_rates ADD COLUMN IF NOT EXISTS last_pushed_at TIMESTAMPTZ NULL;
ALTER TABLE calendar_rates ADD COLUMN IF NOT EXISTS last_channex_rate NUMERIC(10,2) NULL;

-- The original unique constraint on (property_id, date) blocks per-channel
-- siblings. Replace it with a unique index on (property_id, date, channel_code)
-- with NULLS NOT DISTINCT so that the base row (channel_code = NULL) still
-- has exactly one entry per (property, date). Using NULLS NOT DISTINCT lets
-- PostgREST / Supabase JS upsert with onConflict="property_id,date,channel_code"
-- without having to special-case NULLs.
ALTER TABLE calendar_rates DROP CONSTRAINT IF EXISTS calendar_rates_property_id_date_key;
DROP INDEX IF EXISTS calendar_rates_prop_date_chan_unique;
CREATE UNIQUE INDEX calendar_rates_prop_date_chan_unique
  ON calendar_rates (property_id, date, channel_code) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_calendar_rates_channel
  ON calendar_rates (property_id, channel_code, date)
  WHERE channel_code IS NOT NULL;

-- Allow the new rate_source used by per-channel manual overrides.
ALTER TABLE calendar_rates DROP CONSTRAINT IF EXISTS calendar_rates_rate_source_check;
ALTER TABLE calendar_rates ADD CONSTRAINT calendar_rates_rate_source_check
  CHECK (rate_source = ANY (ARRAY['manual'::text, 'engine'::text, 'override'::text, 'manual_per_channel'::text]));
