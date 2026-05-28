-- M13 Phase 1.B STEP 4 — host_surface_telemetry fluidity extension.
--
-- Additive migration per the M13 Phase 1.B STOP §2.3 (operator-confirmed
-- shape, Telegram msg 3527): adds three columns and extends one CHECK
-- constraint so the existing per-host telemetry table can also carry
-- perceived-fluidity measurements (perf-class rows) alongside the
-- navigation-class rows it already carries.
--
-- Schema delta:
--   + latency_ms      numeric NULL  — milliseconds for the budgeted action
--   + budget_class    text NULL CHECK (...)  — which fluidity budget this
--                                             measurement applies to
--   + event_category  text NOT NULL DEFAULT 'navigation' CHECK (...)  — clean
--                                             discriminator between
--                                             navigation events (chat_view,
--                                             inspect_view, inspect_entry)
--                                             and perf events
--                                             (fluidity_measurement)
--
-- event_kind CHECK extended:
--   adds 'fluidity_measurement' to the allowed set so a perf row carries a
--   distinct event_kind value (avoids overloading the navigation values).
--
-- For perf rows (event_category='perf', event_kind='fluidity_measurement'):
--   - latency_ms IS REQUIRED at application layer (route.ts zod schema enforces;
--     not added as a DB CHECK because PostgreSQL cross-column CHECK is awkward
--     and the API route is the single insert path)
--   - budget_class IS REQUIRED at application layer
--   - task_class + entry_trigger remain NULL (navigation-only columns)
--   - pathname carries the route the measurement was taken on (so the
--     analyzer can split by surface)
--
-- For navigation rows (event_category='navigation'; the existing 4 rows
-- in production today): unchanged. Migration is fully backwards-compatible —
-- DEFAULT 'navigation' fills existing rows automatically.
--
-- RLS — no policy change needed. The existing
-- 'host_surface_telemetry_select_own' policy scopes by host_id; perf rows
-- carry host_id like nav rows; same policy covers both. CLAUDE.md R5
-- firewall contract is respected unchanged: per-host private, cross-host
-- aggregation MUST pass through the future anonymization VIEW.
--
-- 3-part presence verification per v2.8 §3.5.D + §4.2.2 applies at apply
-- time:
--   1. information_schema.columns: latency_ms / budget_class / event_category present
--   2. pg_constraint: extended event_kind CHECK includes 'fluidity_measurement';
--      new budget_class CHECK present; new event_category CHECK present
--   3. relrowsecurity=t inherited (no policy churn)

ALTER TABLE host_surface_telemetry
  ADD COLUMN latency_ms numeric NULL,
  ADD COLUMN budget_class text NULL,
  ADD COLUMN event_category text NOT NULL DEFAULT 'navigation';

-- Drop + re-add the event_kind CHECK to extend the allowed set.
ALTER TABLE host_surface_telemetry
  DROP CONSTRAINT host_surface_telemetry_event_kind_check;
ALTER TABLE host_surface_telemetry
  ADD CONSTRAINT host_surface_telemetry_event_kind_check
  CHECK (event_kind IN (
    'chat_view',
    'inspect_view',
    'inspect_entry',
    'fluidity_measurement'
  ));

-- Add CHECKs for the two new vocab-constrained columns.
ALTER TABLE host_surface_telemetry
  ADD CONSTRAINT host_surface_telemetry_budget_class_check
  CHECK (budget_class IS NULL OR budget_class IN (
    'property_focus',
    'chat_start_of_stream',
    'cmd_k_first_result',
    'route_nav',
    'perceived_action'
  ));

ALTER TABLE host_surface_telemetry
  ADD CONSTRAINT host_surface_telemetry_event_category_check
  CHECK (event_category IN ('navigation', 'perf'));

-- Index for the analyzer query path — production rollup will filter by
-- (host_id, event_category, budget_class) for perf rows; existing
-- (host_id, ts) covers the time-range filter but a category-discriminated
-- index keeps the perf-only path fast as data accumulates.
CREATE INDEX idx_host_surface_telemetry_perf
  ON host_surface_telemetry (host_id, event_category, budget_class)
  WHERE event_category = 'perf';

-- Documentation comments.
COMMENT ON COLUMN host_surface_telemetry.latency_ms IS
  'M13 Phase 1.B: milliseconds for the budgeted action on perf-category rows. NULL on navigation rows.';
COMMENT ON COLUMN host_surface_telemetry.budget_class IS
  'M13 Phase 1.B: which fluidity budget this measurement applies to. NULL on navigation rows.';
COMMENT ON COLUMN host_surface_telemetry.event_category IS
  'M13 Phase 1.B: navigation (chat/inspect events) vs perf (fluidity measurements). Discriminator for analyzer query paths.';
