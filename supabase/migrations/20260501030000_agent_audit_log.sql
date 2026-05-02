-- Agent loop v1 — Milestone 1, migration 3 of 4.
--
-- The unified action audit feed per docs/architecture/agent-loop-v1-design.md
-- §7 and docs/method/koast-method-in-code.md §"the unified action audit feed".
--
-- Per Belief 4 §6: today the audit surface is fragmented across
-- channex_outbound_log (102 rows), channex_webhook_log (102 rows),
-- notifications (0 rows), sms_log (1 row), pricing_recommendations
-- (209 rows), and pricing_performance. None of those are surfaced as
-- a host-facing "what did Koast do recently" feed — only
-- channex_webhook_log is exposed via /channels/sync-log.
--
-- agent_audit_log is the host-facing feed. Existing audit tables keep
-- their tooling-specific roles (incident reconstruction, webhook
-- replay, etc.); the agent layer + future gated paths cross-write here
-- so a single feed serves the recent-activity UI.
--
-- Conventions: snake_case, RLS via host_id = auth.uid(), text + CHECK
-- enums, JSONB for payload + context.

CREATE TABLE IF NOT EXISTS agent_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Action identity. Matches the stakes registry key
  -- (src/lib/action-substrate/stakes-registry.ts at implementation
  -- time). v1 has 'memory.write'; Phase 2 expands to the ~40 agent
  -- tools in BELIEF_6_SUBSTRATE_INVENTORY.md §2.
  action_type     text NOT NULL,

  -- The action's payload. For memory.write:
  --   { "memory_fact_id": "...", "entity_type": "...", "entity_id": "...",
  --     "attribute": "...", "value_summary": "..." }
  -- The full payload may be re-derived from the artifact / memory_fact
  -- row; this is a lightweight summary for the recent-activity feed.
  payload         jsonb NOT NULL,

  -- Where the action was initiated.
  --   'frontend_api'   = a Next.js API route (existing handler)
  --   'agent_artifact' = an agent-emitted artifact the host confirmed
  --   'agent_tool'     = an agent tool call (Phase 2+ for write tools)
  --   'worker'         = a Python worker on the Virginia VPS
  source          text NOT NULL CHECK (source IN (
    'frontend_api', 'agent_artifact', 'agent_tool', 'worker'
  )),

  -- Who acted.
  --   'host'   = the authenticated user
  --   'agent'  = autonomous agent action (Phase 2+; v1 always has the
  --             host as the actor since every memory write requires
  --             host confirmation)
  --   'worker' = a scheduled worker
  --   'system' = the platform (e.g., Channex relay)
  actor_kind      text NOT NULL CHECK (actor_kind IN (
    'host', 'agent', 'worker', 'system'
  )),
  -- Resolves to auth.users.id when actor_kind='host'. NULL for the
  -- other actor_kinds (worker/system don't have user identities).
  -- When multi-user lands, 'host' splits into 'host'/'cohost'/'va' and
  -- actor_id will reference the specific user.
  actor_id        uuid,

  -- The action substrate's mode classification at decision time.
  --   'silent'    = autonomously executed (Phase 2+; not used at v1)
  --   'confirmed' = host explicitly approved (artifact, modal, etc.)
  --   'blocked'   = the substrate refused; payload + context explain why
  autonomy_level  text NOT NULL CHECK (autonomy_level IN (
    'silent', 'confirmed', 'blocked'
  )),

  -- Outcome of the actual execution.
  --   'succeeded' = the action's commit completed
  --   'failed'    = the action errored mid-flight
  --   'pending'   = action is still in progress (e.g., async job)
  outcome         text NOT NULL CHECK (outcome IN (
    'succeeded', 'failed', 'pending'
  )),

  -- Free-form context. For source='agent_artifact':
  --   { "artifact_id": "...", "conversation_id": "...", "turn_id": "..." }
  -- For source='frontend_api':
  --   { "route": "/api/...", "user_agent": "..." }
  -- For source='worker':
  --   { "worker": "pricing_validator", "run_id": "..." }
  -- Schema is intentionally loose; structure emerges per source over time.
  context         jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Confidence assigned by the agent at decision time. NULL for non-
  -- LLM-driven actions (frontend_api / worker writes that don't have a
  -- model in the loop).
  confidence      numeric(3, 2) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),

  -- Wall-clock latency of the action's execution. NULL when the action
  -- is asynchronous and latency isn't meaningful.
  latency_ms      integer,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Recent-activity feed: scoped by host, ordered by most recent.
CREATE INDEX IF NOT EXISTS idx_agent_audit_log_host_recent
  ON agent_audit_log(host_id, created_at DESC);

-- Per-action-type analytics ("how often does the agent dismiss memory
-- writes" etc.). Useful for both the team's introspection and for
-- per-host calibration logic in Phase 2.
CREATE INDEX IF NOT EXISTS idx_agent_audit_log_action_type
  ON agent_audit_log(action_type, created_at DESC);

-- Failure rate slice for ops monitoring.
CREATE INDEX IF NOT EXISTS idx_agent_audit_log_failures
  ON agent_audit_log(created_at DESC) WHERE outcome = 'failed';

-- Source slice for migration verification ("are agent_artifact rows
-- landing as expected").
CREATE INDEX IF NOT EXISTS idx_agent_audit_log_source
  ON agent_audit_log(source, created_at DESC);

ALTER TABLE agent_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own audit log" ON agent_audit_log FOR SELECT
  USING (host_id = auth.uid());

-- Writes go through service-role from API routes / agent loop / worker
-- shims. No insert policy for authenticated users; the recent-activity
-- UI is read-only at v1.
