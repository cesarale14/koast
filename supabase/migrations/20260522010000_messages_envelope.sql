-- M10 Phase D STEP 6 (S3): add envelope JSONB column to messages.
--
-- envelope JSONB persists the D22 AgentTextOutput (content / confidence /
-- source_attribution / hedge / output_grounding / judge_results) per draft.
--
-- Nullable PERMANENT per phase-d-ultraplan §3.6 (M3-outcome-3-family lineage,
-- 2nd instance after notifications.host_id):
--   - Historical drafts predate envelope generation; NULL by nature (no
--     derivation possible — envelope is new data, not historical-recoverable).
--   - NO backfill (envelope is new data, nothing to derive).
--   - New drafts populate via /api/messages/draft at STEP 7 (app-level
--     population).
--   - UI gates display on envelope presence at STEP 8 (display-on-presence).
--   - NOT NULL DB constraint DEFERRED / abandoned for historical compat;
--     enforcement on new rows is app-level.
--
-- No FK (JSONB blob; envelope is denormalized D22 envelope content per row).
-- No index (envelope is read alongside its message row by id; never queried
-- by envelope content — SELECT envelope FROM messages WHERE id = ...).
-- No NOT NULL (per nullable-permanent above).
--
-- Companion: schema.ts adds messages.envelope typed jsonb<AgentTextOutput>
-- for downstream type-safety at STEP 7 persist + STEP 8 read.
--
-- Production apply: SCHEDULED at STEP 7 precondition gate (mirror Phase C 7.0
-- discipline; envelope-writing code at STEP 7 requires the column). schema.ts
-- envelope is INERT this step (unused until STEP 7 persist).

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS envelope jsonb;
