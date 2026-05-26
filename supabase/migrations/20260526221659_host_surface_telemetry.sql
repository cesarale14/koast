-- M13 Phase 1.A STEP 4 — host_surface_telemetry substrate.
--
-- Per operator msg 3518 A5 (entry_trigger column binding): falsifiable
-- measurement substrate for the chat-primary inversion thesis. The thesis
-- is "the host stays on the chat-primary surface as the canonical work
-- surface, navigating to inspect only when agent navchips invite them or
-- when they actively need to scan/configure something." Without
-- entry_trigger we cannot distinguish "agent offered, host followed" from
-- "host self-navigated despite the spine" — the latter is the inversion
-- breaking down.
--
-- Schema (privacy-aware per CLAUDE.md R5 firewall contract):
--   - host_id is host-private (cross-host reads MUST pass through future
--     anonymization VIEW; this raw table is per-host only)
--   - session_id is opaque (not derivable to user identity outside the row)
--   - pathname captures the surface; task_class is the bucketed inspect
--     intent (scan / bulk_operate / visual_survey / config / external_link
--     / other); entry_trigger separates agent-offered navchips from
--     self-navigation
--
-- §3.5.D adversarial-regression discipline: RLS policy is the ONLY guard
-- on cross-host reads. Tested at the API + integration layer (host A
-- cannot SELECT host B's rows via the endpoint).
--
-- Session-3 explicit-RLS discipline (CLAUDE.md "RLS enable is explicit,
-- not implicit"): ENABLE ROW LEVEL SECURITY in the same migration that
-- CREATE TABLEs, regardless of the production trigger that would handle
-- it. Staging doesn't have the trigger; mirroring at the SQL level
-- prevents drift.

CREATE TABLE host_surface_telemetry (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id      text NOT NULL,
  ts              timestamptz NOT NULL DEFAULT now(),
  event_kind      text NOT NULL CHECK (event_kind IN (
    'chat_view',
    'inspect_view',
    'inspect_entry'
  )),
  pathname        text NOT NULL,
  task_class      text NULL CHECK (task_class IS NULL OR task_class IN (
    'scan',
    'bulk_operate',
    'visual_survey',
    'config',
    'external_link',
    'other'
  )),
  -- A5 binding: separates "host followed an agent-offered navchip" from
  -- "host self-navigated to an inspect surface." Required on inspect_entry
  -- events; null on chat_view / inspect_view (only navigation transitions
  -- carry a trigger). Null-permitted shape mirrors §6.16 M3-outcome-3-family
  -- nullable-permanent pattern.
  entry_trigger   text NULL CHECK (entry_trigger IS NULL OR entry_trigger IN (
    'agent_offered_navchip',
    'self_navigated'
  )),
  context         jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_host_surface_telemetry_host_ts
  ON host_surface_telemetry (host_id, ts DESC);

CREATE INDEX idx_host_surface_telemetry_event_kind
  ON host_surface_telemetry (event_kind, ts DESC);

-- Session-3 explicit-RLS discipline.
ALTER TABLE host_surface_telemetry ENABLE ROW LEVEL SECURITY;

-- Host reads own telemetry only. Server-side writes use createServiceClient
-- (service_role; bypasses RLS) and derive host_id from the authenticated
-- session per operator msg 3518 A8 — endpoints NEVER trust client-supplied
-- host_id.
CREATE POLICY host_surface_telemetry_select_own ON host_surface_telemetry
  FOR SELECT TO authenticated
  USING (auth.uid() = host_id);

COMMENT ON TABLE host_surface_telemetry IS
  'M13 Phase 1.A (STEP 4) — surface-occupancy + navigation telemetry. Per-host private; cross-host aggregation MUST pass through the future anonymization VIEW (CLAUDE.md R5 firewall contract). entry_trigger column makes the chat-primary inversion thesis falsifiable per operator msg 3518 A5.';

COMMENT ON COLUMN host_surface_telemetry.event_kind IS
  'chat_view = host is on chat-primary; inspect_view = host is on an inspect surface (periodic heartbeat); inspect_entry = transition into an inspect surface (carries entry_trigger).';

COMMENT ON COLUMN host_surface_telemetry.entry_trigger IS
  'A5 binding (msg 3518): agent_offered_navchip = the agent surfaced a navchip and the host followed it; self_navigated = the host went to the inspect surface without an agent prompt. The ratio is the falsifiability of the chat-primary inversion thesis.';
