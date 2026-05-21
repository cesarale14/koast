-- M10 Phase C STEP 8 (M3): unified_audit_feed v2 — notifications as 5th source.
--
-- Companion to the M3 substrate: STEP 6 added notifications.host_id (nullable);
-- STEP 7 threaded app-level host_id on new rows; STEP 8 surfaces notifications
-- in the audit-feed VIEW so the per-host inspect surface shows notification
-- events alongside agent / channex / sms / pricing-outcome rows.
--
-- 5th source mapping per phase-c-ultraplan §4.3:
--   host_id      = n.host_id (direct, now post STEP 6)
--   occurred_at  = COALESCE(n.sent_at, n.created_at)
--   actor        = 'system'
--   category     = 'notification'  (already in v1.2 design vocabulary; activates here)
--   entity_type  = 'notification'
--   entity_id    = n.id::text
--   outcome      = 'completed' (write-time semantic = sent successfully; failures live in sms_log)
--   summary      = LEFT(n.message, 120)
--   source_table = 'notifications'
--   source_id    = n.id
--   metadata     = jsonb(type, recipient, channel)
--
-- Filter (per sms_log v1.3 precedent): WHERE n.host_id IS NOT NULL.
-- Historical rows with NULL host_id (Outcome 3 per STEP 6) won't surface in
-- per-host feeds — expected behavior; production had 0 such rows at apply
-- time. New rows from STEP 7 onward set host_id at INSERT.
--
-- Chip-filter convention (audit-feed.ts FILTER_TO_CATEGORIES, STEP 8):
--   "Notifications" chip → category IN ('sms', 'notification') — surfaces
--   sms_log delivery events + notifications audit-log events in one feed.
--
-- The migration is CREATE OR REPLACE VIEW — idempotent + safe to re-apply.
-- The pre-existing 4 sources are reproduced verbatim from
-- 20260507040000_unified_audit_feed_view.sql; only the 5th UNION ALL branch
-- is new.

CREATE OR REPLACE VIEW unified_audit_feed AS

-- Source 1: agent_audit_log (host_id direct).
-- Reads filtered out — they're not host-state changes.
SELECT
  a.host_id                                   AS host_id,
  a.created_at                                AS occurred_at,
  CASE a.actor_kind
    WHEN 'host'   THEN 'host'
    WHEN 'agent'  THEN 'koast'
    WHEN 'worker' THEN 'system'
    WHEN 'system' THEN 'system'
    ELSE 'system'
  END                                         AS actor,
  CASE
    WHEN a.action_type = 'write_memory_fact'       THEN 'memory_write'
    WHEN a.action_type = 'propose_guest_message'   THEN 'guest_message'
    WHEN a.action_type ILIKE 'apply_rate%'         THEN 'rate_push'
    WHEN a.action_type ILIKE 'pricing_%'           THEN 'pricing_outcome'
    ELSE 'other'
  END                                         AS category,
  COALESCE(a.payload->>'entity_type', NULL)   AS entity_type,
  COALESCE(a.payload->>'entity_id', NULL)     AS entity_id,
  CASE a.outcome
    WHEN 'succeeded' THEN 'completed'
    WHEN 'failed'    THEN 'failed'
    WHEN 'pending'   THEN 'pending'
    ELSE 'pending'
  END                                         AS outcome,
  a.action_type                               AS summary,
  'agent_audit_log'::text                     AS source_table,
  a.id                                        AS source_id,
  jsonb_build_object(
    'raw_action_type',  a.action_type,
    'payload',          a.payload,
    'context',          a.context,
    'autonomy_level',   a.autonomy_level,
    'confidence',       a.confidence,
    'latency_ms',       a.latency_ms,
    'source',           a.source
  )                                           AS metadata
FROM agent_audit_log a
WHERE a.action_type NOT ILIKE 'read_%'

UNION ALL

-- Source 2: channex_outbound_log (host_id derived via property).
SELECT
  p.user_id                                   AS host_id,
  c.created_at                                AS occurred_at,
  'koast'::text                               AS actor,
  'rate_push'::text                           AS category,
  'property'::text                            AS entity_type,
  c.property_id::text                         AS entity_id,
  CASE
    WHEN c.response_status BETWEEN 200 AND 299 THEN 'completed'
    WHEN c.response_status IS NULL             THEN 'pending'
    ELSE 'failed'
  END                                         AS outcome,
  c.method || ' ' || c.endpoint               AS summary,
  'channex_outbound_log'::text                AS source_table,
  c.id                                        AS source_id,
  jsonb_build_object(
    'channex_property_id', c.channex_property_id,
    'rate_plan_id',        c.rate_plan_id,
    'date_from',           c.date_from,
    'date_to',             c.date_to,
    'entries_count',       c.entries_count,
    'response_status',     c.response_status,
    'response_body',       c.response_body,
    'error_message',       c.error_message,
    'payload_sample',      c.payload_sample
  )                                           AS metadata
FROM channex_outbound_log c
INNER JOIN properties p ON p.id = c.property_id
WHERE c.endpoint <> 'deploy_marker'

UNION ALL

-- Source 3: sms_log (user_id aliased as host_id).
SELECT
  s.user_id                                   AS host_id,
  s.created_at                                AS occurred_at,
  'koast'::text                               AS actor,
  'sms'::text                                 AS category,
  CASE WHEN s.cleaning_task_id IS NOT NULL
    THEN 'cleaning_task'
    ELSE NULL
  END                                         AS entity_type,
  s.cleaning_task_id::text                    AS entity_id,
  CASE s.status
    WHEN 'sent'   THEN 'completed'
    WHEN 'failed' THEN 'failed'
    ELSE 'pending'
  END                                         AS outcome,
  LEFT(s.message_body, 120)                   AS summary,
  'sms_log'::text                             AS source_table,
  s.id                                        AS source_id,
  jsonb_build_object(
    'phone_to',    s.phone_to,
    'twilio_sid',  s.twilio_sid,
    'cleaner_id',  s.cleaner_id,
    'status',      s.status
  )                                           AS metadata
FROM sms_log s
WHERE s.user_id IS NOT NULL

UNION ALL

-- Source 4: pricing_performance (host_id derived via property; applied rows only).
SELECT
  p.user_id                                                AS host_id,
  pp.applied_at                                            AS occurred_at,
  'koast'::text                                            AS actor,
  'pricing_outcome'::text                                  AS category,
  'property'::text                                         AS entity_type,
  pp.property_id::text                                     AS entity_id,
  'completed'::text                                        AS outcome,
  'Pricing applied for ' || pp.date::text || ': $' ||
    COALESCE(pp.applied_rate::text, pp.suggested_rate::text)
                                                           AS summary,
  'pricing_performance'::text                              AS source_table,
  pp.id                                                    AS source_id,
  jsonb_build_object(
    'date',             pp.date,
    'suggested_rate',   pp.suggested_rate,
    'applied_rate',     pp.applied_rate,
    'actual_rate',      pp.actual_rate,
    'booked',           pp.booked,
    'channels_pushed',  pp.channels_pushed
  )                                                        AS metadata
FROM pricing_performance pp
INNER JOIN properties p ON p.id = pp.property_id
WHERE pp.applied_at IS NOT NULL

UNION ALL

-- Source 5 (NEW M10 Phase C STEP 8): notifications (host_id direct, M3 STEP 6).
SELECT
  n.host_id                                   AS host_id,
  COALESCE(n.sent_at, n.created_at)           AS occurred_at,
  'system'::text                              AS actor,
  'notification'::text                        AS category,
  'notification'::text                        AS entity_type,
  n.id::text                                  AS entity_id,
  'completed'::text                           AS outcome,
  LEFT(n.message, 120)                        AS summary,
  'notifications'::text                       AS source_table,
  n.id                                        AS source_id,
  jsonb_build_object(
    'type',      n.type,
    'recipient', n.recipient,
    'channel',   n.channel
  )                                           AS metadata
FROM notifications n
WHERE n.host_id IS NOT NULL;
