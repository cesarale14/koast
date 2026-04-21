-- Add UNIQUE index on pricing_performance(property_id, date) to
-- support .upsert() in /api/pricing/apply. One row per
-- (property, date) — latest apply wins; prior apply attempts
-- are overwritten. Historical audit trail is out of scope here;
-- if needed later, add a separate pricing_apply_events log table.
--
-- NOTE: This assumes no existing duplicate (property_id, date)
-- rows in pricing_performance. If duplicates exist, this
-- migration will fail and a dedup script must run first.

CREATE UNIQUE INDEX IF NOT EXISTS pricing_performance_prop_date_unique
  ON pricing_performance(property_id, date);
