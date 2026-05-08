-- M8 Phase C HARD GATE — backfill channex_outbound_log.property_id
--
-- Phase A carry-forward: src/lib/channex/client.ts logOutbound() shipped
-- with property_id hardcoded to NULL. unified_audit_feed VIEW (migration
-- 20260507040000) INNER JOINs on properties.id = channex_outbound_log
-- .property_id, so all historical NULL rows drop from /koast/inspect/
-- activity — Channex is the most active write surface and would render
-- empty.
--
-- Path (β) ships a code-level fix in logOutbound (DB lookup against
-- properties.channex_property_id at write time). This migration backfills
-- the historical NULL rows that captured channex_property_id but not
-- the internal property_id.
--
-- Idempotent: WHERE property_id IS NULL filters re-runs to a no-op.
-- Lossless: rows whose channex_property_id has no matching property
-- (e.g., deleted scaffold properties) remain NULL — same outcome as the
-- forward-fill code path for those rows.

UPDATE channex_outbound_log AS c
SET property_id = p.id
FROM properties AS p
WHERE c.property_id IS NULL
  AND c.channex_property_id IS NOT NULL
  AND p.channex_property_id = c.channex_property_id;
