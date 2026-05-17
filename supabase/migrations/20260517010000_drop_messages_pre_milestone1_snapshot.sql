-- M9 Phase G E4: drop overdue Milestone 1 rollback-safety snapshot.
-- Created raw-SQL during M1 rollout (2026-05-02 region) as snapshot before
-- back-population. Observation window expired 2026-05-09 per M1 test plan
-- §A4; today 2026-05-17 = 8 days past. Terminal-drop per M1 design intent;
-- back-population is durable post-window.
--
-- Zero code consumers verified STEP 2 + STEP 6.1 (grep across src/ +
-- supabase/migrations/ empty). Staging never had the table (set up
-- post-M1 rollout); production has 90 rows. DROP TABLE IF EXISTS keeps
-- the migration idempotent across both environments — no-op on staging,
-- real drop on production. Asymmetric-migration exception per CLAUDE.md
-- staging-environment docs.

DROP TABLE IF EXISTS messages_pre_milestone1_snapshot;
