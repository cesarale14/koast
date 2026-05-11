-- M8 Phase G C4 — host_state table (D16 + D17d audit-drawer landing).
--
-- Hosts a single row per host carrying per-host UI/inspection state.
-- Phase G column: last_seen_inspect_at, the timestamp the host last
-- opened the AuditDrawer. Used to compute the unread-event badge math
-- on the topbar audit icon (events in unified_audit_feed with
-- occurred_at > last_seen_inspect_at are "unread").
--
-- Landing decision (per C4 sign-off Trap 2 + R-2): NEW table, not a
-- column on agent_conversations (wrong-semantics — audit is host-scoped,
-- not conversation-scoped) and not a memory_fact attribute (write-
-- frequency mismatch — every drawer-open would write a new fact row;
-- memory_facts is append-only-by-supersession by discipline).
--
-- The table is extensible: future per-host UI state (welcome_seen,
-- dismissed_banners, last_seen_pricing_at, etc.) lands here as columns,
-- not a new table per feature.
--
-- RLS: enabled explicitly per CLAUDE.md "RLS enable is explicit, not
-- implicit" discipline (codified post-Phase B / C9 audit). Even though
-- production's ensure_rls event trigger would auto-enable, staging
-- doesn't have that trigger; explicit ALTER avoids drift.
--
-- Backfill (C4 sign-off R-4): NULL — honest. Existing hosts haven't
-- opened the drawer. First-open will surface "many unread" capped at
-- "9+" badge per R-11.

CREATE TABLE IF NOT EXISTS host_state (
  host_id              uuid PRIMARY KEY,
  last_seen_inspect_at timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE host_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own host_state" ON host_state FOR ALL
  USING (host_id = auth.uid());

-- updated_at trigger so the column reflects actual write time and
-- doesn't decay to insert time. Mirrors the memory_facts pattern.
CREATE OR REPLACE FUNCTION set_host_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_host_state_updated_at
  BEFORE UPDATE ON host_state
  FOR EACH ROW EXECUTE FUNCTION set_host_state_updated_at();

-- Record this migration in the koast_migration_history audit table
-- per the staging-environment discipline.
INSERT INTO koast_migration_history (migration_name, applied_at, applied_by, notes)
  VALUES (
    '20260511010000_add_host_state_table',
    now(),
    'm8-phase-g-c4',
    'Adds host_state table with last_seen_inspect_at for AuditDrawer badge'
  )
  ON CONFLICT (migration_name) DO NOTHING;
