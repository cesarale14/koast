-- M8 Phase A · D3 — unified_audit_feed VIEW (revised v1.3 design).
--
-- Four-source UNION ALL with normalized envelope shape per M8 conventions
-- §D3. Sources, in order:
--   1. agent_audit_log     (host_id direct)
--   2. channex_outbound_log (host_id derived via JOIN properties)
--   3. sms_log             (user_id aliased as host_id)
--   4. pricing_performance (host_id derived via JOIN properties)
--
-- notifications excluded at M8 — no host scoping today; deferred to M9
-- per anti-scope §6.1.
--
-- Envelope columns:
--   host_id, occurred_at, actor, category, entity_type, entity_id,
--   outcome, summary, source_table, source_id, metadata
--
-- ----------------------------------------------------------------------
-- v1.2 design refinements (post-Phase-1-STOP locks):
--
-- (b) action_type categorization: explicit CASE on canonical values.
--     'other' fallback emits the raw action_type into metadata so drill-
--     down preserves the source semantics. Forces every new agent tool
--     that ships to either map to an existing category or self-surface
--     under 'other' with a visible signal in metadata. Self-policing.
--
--     Read-class action_types (action_type ILIKE 'read_%') are filtered
--     OUT of the audit feed entirely — they're agent-internal observability,
--     not host-state changes. Convention: read_* is reads; write_* /
--     propose_* / apply_* are state changes. Future tools must honor.
--
-- (d) Category granularity: VIEW emits 'sms' and (eventually) 'notification'
--     as distinct categories. UI chip layer folds at query time:
--       "All"           → no filter
--       "Memory"        → category = 'memory_write'
--       "Messages"      → category = 'guest_message'
--       "Pricing"       → category IN ('rate_push', 'pricing_outcome')
--       "Notifications" → category IN ('sms', 'notification')
--     Granular VIEW preserves drill-down + future-proof for M9 when
--     notifications source joins.
--
-- Envelope category vocabulary (extended v1.2):
--   'memory_write' | 'guest_message' | 'rate_push' | 'sms'
--   | 'pricing_outcome' | 'notification' | 'other'
-- ----------------------------------------------------------------------
--
-- ----------------------------------------------------------------------
-- v1.3 design refinements (post-structural-review):
--
-- Source 4 (pricing_performance) filtered to applied rows only. The feed
-- surfaces "what Koast did"; unapplied pricing recommendations are
-- consideration-but-not-action and surface in the pricing tab rather
-- than the audit feed. Cleaner feed semantics; honest 'completed'
-- outcome since the filter guarantees the action happened.
--
-- Source 3 (sms_log) entity_type NULL handling documented inline:
-- non-cleaning-task SMS rows have entity_type NULL; cleaner_id remains
-- in metadata for drill-down. Future entity-scoped filtering would
-- extend the mapping.
-- ----------------------------------------------------------------------
--
-- The VIEW is non-materialized. Performance leans on per-source
-- (host_id, timestamp) indexes (added Phase A migration 030000 for
-- sms_log; agent_audit_log + channex_outbound_log already have
-- appropriate indexes).
--
-- Drill-down to source_table + source_id from the inspect surface for
-- technical detail (per D17c inline-expand pattern).

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
    ELSE 'system'  -- defensive fallback; CHECK constraint makes ELSE unreachable in practice
  END                                         AS actor,
  CASE a.action_type
    WHEN 'write_memory_fact'     THEN 'memory_write'
    WHEN 'propose_guest_message' THEN 'guest_message'
    WHEN 'pricing_apply'         THEN 'rate_push'
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
    'raw_action_type',  a.action_type,   -- preserved for 'other' drill-down
    'payload',          a.payload,
    'context',          a.context,
    'autonomy_level',   a.autonomy_level,
    'confidence',       a.confidence,
    'latency_ms',       a.latency_ms,
    'source',           a.source
  )                                           AS metadata
FROM agent_audit_log a
WHERE a.action_type NOT ILIKE 'read_%'  -- read-class actions are agent-internal observability

UNION ALL

-- Source 2: channex_outbound_log (host_id derived via property)
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
WHERE c.endpoint <> 'deploy_marker'  -- exclude deploy marker from host feed

UNION ALL

-- Source 3: sms_log (user_id aliased as host_id)
SELECT
  s.user_id                                   AS host_id,
  s.created_at                                AS occurred_at,
  'koast'::text                               AS actor,
  'sms'::text                                 AS category,
  -- Non-cleaning-task SMS rows have entity_type NULL; cleaner_id remains
  -- in metadata for drill-down. Future entity-scoped filtering surfaces
  -- (e.g., "show all activity related to cleaner Mike") would extend this
  -- mapping to promote cleaner_id when cleaning_task_id is null.
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
WHERE s.user_id IS NOT NULL  -- system-initiated rows excluded from host feed

UNION ALL

-- Source 4: pricing_performance (host_id derived via property).
-- Filtered to applied rows only (applied_at IS NOT NULL) — the feed
-- surfaces "what Koast did," and unapplied recommendations are
-- considered-but-not-acted-on rather than actions. Suggestions that
-- weren't applied surface in the pricing tab, not the audit feed.
-- occurred_at uses applied_at directly since the filter guarantees
-- it's non-null.
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
    'booked_at',        pp.booked_at,
    'revenue_delta',    pp.revenue_delta,
    'channels_pushed',  pp.channels_pushed
  )                                                        AS metadata
FROM pricing_performance pp
INNER JOIN properties p ON p.id = pp.property_id
WHERE pp.applied_at IS NOT NULL;  -- only applied pricing actions surface in the feed

COMMENT ON VIEW unified_audit_feed IS
  'M8 D3 (v1.3) — host-scoped audit feed across 4 sources (agent_audit_log, channex_outbound_log, sms_log, pricing_performance). Read-class action_types filtered (agent-internal observability). Unmapped action_types fall to category=''other'' with raw_action_type preserved in metadata. pricing_performance filtered to applied rows. notifications excluded at M8; M9 adds it after host_id schema migration.';
