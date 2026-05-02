-- Agent loop v1 — Milestone 1, migration 1 of 4.
--
-- The memory substrate. Two tables:
--
-- 1. `guests` — entity table for guest memory. Pre-allocated for v1: no
--    writer in this milestone, but `memory_facts.guest_id` needs an FK
--    target. Back-population from existing `bookings` columns is a
--    separate migration that ships when the resolver worker lands
--    (Phase 2). Today's bookings store guest data inline as columns;
--    `guests.id` will be retroactively assigned to those rows by joining
--    on (lower(email), normalized_name, host_id).
--
-- 2. `memory_facts` — Tier 1 memory schema per
--    docs/architecture/agent-loop-v1-design.md §6 and
--    docs/method/koast-method-in-code.md §"the memory architecture".
--    Mirrors the `pricing_rules.source` + `inferred_from` JSONB
--    precedent established by migration 20260418000000.
--
-- Conventions followed:
--   - snake_case names + columns
--   - timestamptz for all timestamps
--   - JSONB for flexible value shapes (value, learned_from)
--   - text + CHECK for enums (matches existing codebase pattern;
--     no Postgres enum types — see e.g. property_type, source on
--     pricing_rules)
--   - RLS via host_id = auth.uid() for host-scoped tables (matches
--     cleaners, user_preferences, user_subscriptions)
--   - Composite/partial indexes only where access patterns justify

-- =============================================================================
-- guests
-- =============================================================================

CREATE TABLE IF NOT EXISTS guests (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Display name shown to the host. Resolved from booking guest_name
  -- by the back-population worker; nullable until then.
  display_name             text,
  -- The first booking this guest was observed on. Useful for "this is a
  -- repeat guest" detection in Phase 2. NULL when the guest is created
  -- through some other path (e.g., direct memory write before any booking).
  first_seen_booking_id    uuid REFERENCES bookings(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guests_host
  ON guests(host_id);

CREATE INDEX IF NOT EXISTS idx_guests_first_seen_booking
  ON guests(first_seen_booking_id) WHERE first_seen_booking_id IS NOT NULL;

ALTER TABLE guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own guests" ON guests FOR ALL
  USING (host_id = auth.uid());


-- =============================================================================
-- memory_facts
-- =============================================================================

CREATE TABLE IF NOT EXISTS memory_facts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scoping. host_id is always set; entity_type + entity_id name what
  -- the fact is about; sub_entity_type + sub_entity_id narrow further;
  -- guest_id optionally narrows a property fact to a specific guest.
  host_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Pre-allocated entity types. v1 only writes 'property' and 'host' facts,
  -- but the schema supports the other types so future writers don't need
  -- a migration to start using them.
  entity_type         text NOT NULL CHECK (entity_type IN (
    'host', 'property', 'guest', 'vendor', 'booking'
  )),
  -- entity_id refers to the row this fact is about. Type discriminated
  -- by entity_type; not enforced as FK (cross-table polymorphism is
  -- expensive in Postgres). The agent layer's tool dispatcher resolves
  -- references by entity_type before writing.
  entity_id           uuid NOT NULL,

  -- Sub-entity narrows the scope. sub_entity_type is a controlled
  -- vocabulary CHECK-constrained to canonical sub-entity names so the
  -- agent's extraction pipeline doesn't fragment memory across
  -- spelling variations ('front_door' vs 'frontdoor' vs 'main_door'
  -- vs 'entrance'). The vocabulary is intentionally narrow at v1;
  -- future migrations expand it as new sub-entity types prove out.
  --
  -- Example uses (entity_type='property'):
  --   sub_entity_type='front_door',         sub_entity_id=NULL (or 'north'/'south' if a property has multiple)
  --   sub_entity_type='wifi',               sub_entity_id='primary_router'
  --   sub_entity_type='hvac',               sub_entity_id='living_room_unit'
  --   sub_entity_type='kitchen_appliances', sub_entity_id='dishwasher'
  --
  -- v1 sub_entity_id is a free-text disambiguator — no sub-entity
  -- tables exist yet. When sub-entity tables ship (Phase 2+), a
  -- separate migration converts this column to uuid + FK.
  sub_entity_type     text CHECK (sub_entity_type IN (
    'front_door', 'lock', 'parking', 'wifi', 'hvac', 'kitchen_appliances'
  )),
  sub_entity_id       text,

  -- Optional guest narrowing for facts that emerged from a specific
  -- guest's stay ("Sarah noted the front door issue"). NULL when the
  -- fact is not guest-specific.
  guest_id            uuid REFERENCES guests(id) ON DELETE SET NULL,

  -- The fact itself.
  attribute           text NOT NULL,
  -- value is JSONB so values can be text, numeric, structured. Most v1
  -- facts will be { "text": "..." }; the JSONB allows future richer
  -- shapes without a migration.
  value               jsonb NOT NULL,

  -- Provenance per Belief 5 §1c source-marker convention.
  source              text NOT NULL CHECK (source IN (
    'host_taught', 'inferred', 'observed'
  )),
  confidence          numeric(3, 2) NOT NULL DEFAULT 1.00
    CHECK (confidence BETWEEN 0 AND 1),
  -- learned_from JSONB carries the audit trail. For host_taught:
  --   { "conversation_id": "...", "turn_id": "...", "source_message_text": "..." }
  -- For inferred (Phase 2):
  --   { "algorithm": "...", "row_count": N, "computed_at": "...", "sample_ids": [...] }
  -- For observed (Phase 2):
  --   { "event_type": "...", "event_id": "...", "observed_at": "..." }
  -- Mirrors pricing_rules.inferred_from shape.
  learned_from        jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Lifecycle. status='active' is the only state used by retrieval;
  -- 'superseded' rows are retained for history and pointed to by the
  -- newer fact via superseded_by; 'deprecated' is for facts the host
  -- has explicitly retired (e.g., "the cleaner I had no longer works
  -- here").
  status              text NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'superseded', 'deprecated'
  )),
  -- Self-FK: when a new fact replaces an old one, the old one's
  -- superseded_by points at the new one. ON DELETE SET NULL preserves
  -- history if a fact is hard-deleted.
  superseded_by       uuid REFERENCES memory_facts(id) ON DELETE SET NULL,

  learned_at          timestamptz NOT NULL DEFAULT now(),
  -- Updated by the read tool's handler each time a fact is retrieved.
  -- Used in Phase 2+ for decay logic ("this fact hasn't been touched
  -- in 90 days, ask host if it's still accurate").
  last_used_at        timestamptz,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Hot retrieval path: scope by entity, filter to active.
CREATE INDEX IF NOT EXISTS idx_memory_facts_active_entity
  ON memory_facts(entity_type, entity_id, status)
  WHERE status = 'active';

-- Sub-entity lookups (e.g., "all facts about Villa Jamaica's front door").
CREATE INDEX IF NOT EXISTS idx_memory_facts_sub_entity
  ON memory_facts(entity_type, entity_id, sub_entity_type, sub_entity_id, attribute)
  WHERE status = 'active';

-- Recent-facts-by-host listing (memory inspector UI).
CREATE INDEX IF NOT EXISTS idx_memory_facts_host_learned
  ON memory_facts(host_id, learned_at DESC);

-- Guest-specific facts retrieval.
CREATE INDEX IF NOT EXISTS idx_memory_facts_guest
  ON memory_facts(guest_id) WHERE guest_id IS NOT NULL;

-- Supersession history walk.
CREATE INDEX IF NOT EXISTS idx_memory_facts_superseded_by
  ON memory_facts(superseded_by) WHERE superseded_by IS NOT NULL;

ALTER TABLE memory_facts ENABLE ROW LEVEL SECURITY;

-- Primary scope: host_id = auth.uid(). This matches how `cleaners`,
-- `user_preferences`, and `user_subscriptions` are scoped. The
-- entity_type + entity_id values are subject metadata (what the fact
-- is ABOUT), not ownership claims. Defense-in-depth checks against
-- entity_id pointing to a non-owned property would require a CASE
-- expression that checks each entity_type's owning table — at v1 we
-- rely on the agent layer's pre-write ownership check (see the
-- design doc §7.1 requestAction flow). If a future audit reveals
-- this isn't sufficient, a stricter policy can be added.
CREATE POLICY "Users access own memory_facts" ON memory_facts FOR ALL
  USING (host_id = auth.uid());

-- A trigger to keep updated_at in sync. The codebase has a known data
-- quality issue (per CLAUDE.md "Known Data Quality Issues") that
-- properties.updated_at isn't auto-bumped. memory_facts ships with the
-- trigger from day one to avoid the same gap.
CREATE OR REPLACE FUNCTION set_memory_facts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER memory_facts_updated_at
  BEFORE UPDATE ON memory_facts
  FOR EACH ROW EXECUTE FUNCTION set_memory_facts_updated_at();

-- Same trigger for guests.
CREATE OR REPLACE FUNCTION set_guests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guests_updated_at
  BEFORE UPDATE ON guests
  FOR EACH ROW EXECUTE FUNCTION set_guests_updated_at();
