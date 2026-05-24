-- M10 Phase G H1: drop the M9 Phase G E3 backup table.
--
-- review_rules_backup_phase_g was created by 20260517030000_drop_review_rules.sql
-- as a 0-row column-shape preservation table when review_rules was migrated to
-- memory_facts (entity_type='host', sub_entity_type='reviews'). Zero readers
-- across the entire codebase (Phase G STEP 2 + STEP 6 re-verify): only
-- schema.ts comment-only reference + the original creating migration; no
-- Drizzle declaration, no SELECT, no UI consumer.
--
-- M9 Phase G rollback window long since passed; the safety value of the
-- backup is exhausted. Idempotent via IF EXISTS (§6.12).

DROP TABLE IF EXISTS public.review_rules_backup_phase_g;
