-- M11 Phase A item 2 — drop the G8-E3 phantom columns.
--
-- messages.original_draft_text + guest_reviews.original_draft_text were
-- authored in supabase/migrations/20260515220000_voice_substrate.sql
-- section (2) but never landed in any environment (production + staging
-- both verified ABSENT via information_schema 2026-05-24). The source
-- migration was recorded-as-applied in both koast_migration_history
-- tables on 2026-05-15 23:13:35 — partial-application + full-recording
-- = G8-E3 root-cause sub-stratum (see M10-close.md §5 + §7.7 #5).
--
-- The 4-writer phantom-column blast radius was resolved at M10 Phase E
-- STEP 8e (writer strip across draft + reviews/respond + reviews/
-- generate-guest-review + reviews/generate routes) + M10 Phase G H1
-- (schema.ts strip with preserve-and-append lineage comment). This
-- migration closes the migration-file-side disposition: the columns are
-- explicitly dropped, ensuring no future env can land them silently.
--
-- Idempotent via IF EXISTS (§6.12). Both envs: no-op apply (columns
-- already absent). Future env where columns somehow exist: actual drop.

ALTER TABLE messages DROP COLUMN IF EXISTS original_draft_text;
ALTER TABLE guest_reviews DROP COLUMN IF EXISTS original_draft_text;
