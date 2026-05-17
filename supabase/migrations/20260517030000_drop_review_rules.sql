-- M9 Phase G E3 STEP 8.4: terminal drop of review_rules table.
--
-- Preconditions verified at STEP 8.4.0 pre-implementation check:
--   - review_rules exists on both staging + production (no asymmetric-
--     migration handling required; simple body sufficient).
--   - 0 rows on both environments (confirmed at /ultraplan reframe
--     STEP 8.1 + STEP 8.4.0). Backup snapshot is purely procedural
--     per G8-G3 institutional discipline (snapshot before terminal
--     drop, even when data inventory is zero).
--
-- Consumer refactor shipped STEP 8.3 (91cc458): 5 consumer files
-- switched from review_rules table reads to readReviewPreferences
-- helper. Q-G6 β atomic cutover: /api/reviews/rules/[propertyId]
-- removed, /api/reviews/preferences shipped. Phase B F3 Zod boundary
-- at reviews/generator.ts preserved unchanged.
--
-- Backup table review_rules_backup_phase_g preserves the column shape
-- via CREATE TABLE AS SELECT *. Indexes, constraints, defaults are NOT
-- preserved (CTAS produces columns-only) — fine for the 0-row schema-
-- preservation case. Backup table is mild schema clutter that can be
-- dropped in a future hygiene pass once Phase G is fully shaken out.
--
-- Per-property → per-host architectural change documented in
-- v2.6 §1.3 (Cluster E E3) + phase-g.md STEP 10 close note.

CREATE TABLE IF NOT EXISTS review_rules_backup_phase_g AS
  SELECT * FROM review_rules;

DROP TABLE review_rules;
