-- M9 Phase E — voice substrate migration.
--
-- Extends memory_facts.sub_entity_type CHECK constraint to allow
-- 'voice' for D25 voice_mode storage (entity_type='host',
-- sub_entity_type='voice'). Adds original_draft_text columns on
-- messages + guest_reviews per B3 (a) lock — captures Koast-generated
-- draft text alongside the host-edited final text for voice extraction
-- worker training and trust-inspection.
--
-- v2.5 conventions:
--   - D25 voice_mode lives on memory_facts (entity_type='host',
--     sub_entity_type='voice'). Fact payload value JSONB carries
--     mode + features + optional seed_samples.
--   - B3 (a) v1: column on messages + guest_reviews; separate
--     message_drafts table = M10 candidate when diff history needed.

-- ---- (1) Extend sub_entity_type CHECK to include 'voice' ----

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
    'voice'
  ));

-- ---- (2) Add original_draft_text columns ----

-- messages: Phase B Site 1 (/api/messages/draft) persists Koast's
-- generated draft as ai_draft today; original_draft_text parallel-
-- captures the un-edited generation for voice extraction supersession
-- delta tracking + trust-inspection.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS original_draft_text text;

-- guest_reviews: Phase B Sites 2-4 (/api/reviews/*) persist
-- draftText / response_draft today; original_draft_text mirrors that
-- but locked to Koast's generation (separate from host's edited draft).
ALTER TABLE guest_reviews
  ADD COLUMN IF NOT EXISTS original_draft_text text;

COMMENT ON COLUMN messages.original_draft_text IS
  'M9 Phase E F6: Koast-generated draft text from /api/messages/draft, captured at generation time. Distinct from ai_draft (which may have been replaced by host edits in some flows). Source for voice extraction supersession delta + trust-inspection.';

COMMENT ON COLUMN guest_reviews.original_draft_text IS
  'M9 Phase E F6: Koast-generated draft text from /api/reviews/* routes (Sites 2-4), captured at generation time. Distinct from draftText / response_draft which may track host edits.';
