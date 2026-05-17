-- M9 Phase G E3: extend memory_facts.sub_entity_type CHECK constraint to
-- allow 'reviews' for host review-preferences storage. Mirrors the
-- D25 voice_substrate migration (20260515220000) shape exactly.
--
-- Naming note: filename retains 'review_rules' table-lineage as the
-- historical descriptor of what's being changed; the constraint VALUE
-- 'reviews' is the runtime canonical per Q-G2 compression-style
-- precedent (see G-phase-1-stop.md). Filenames document intent at
-- migration-time; constraint values are runtime-canonical.
--
-- Constraint values now (8 total):
--   front_door, lock, parking, wifi, hvac, kitchen_appliances (M6 original)
--   voice (D25 added 2026-05-15)
--   reviews (M9 Phase G E3 added 2026-05-17)

ALTER TABLE memory_facts
  DROP CONSTRAINT memory_facts_sub_entity_type_check;

ALTER TABLE memory_facts
  ADD CONSTRAINT memory_facts_sub_entity_type_check
  CHECK (sub_entity_type IN (
    'front_door',
    'lock',
    'parking',
    'wifi',
    'hvac',
    'kitchen_appliances',
    'voice',
    'reviews'
  ));
