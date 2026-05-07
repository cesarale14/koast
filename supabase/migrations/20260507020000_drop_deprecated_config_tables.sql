-- M8 Phase A · D15 — atomic drop of three deprecated config tables.
--
-- Phase 1 STOP audit (vault commit 0659e5b) verified:
--   * production row counts: 0/0/0 across these three tables
--   * code references audit: no functional callers outside schema.ts
--   * FK constraint audit: 1 internal FK (message_automation_firings →
--     message_templates); 0 external FKs
--
-- review_rules deferred to M9 — it has a live caller in
-- src/app/api/reviews/generate/[bookingId]/route.ts and ships in M9
-- alongside its reviews-generate refactor.
--
-- Statement order matters: drop the FK-holder first.

DROP TABLE IF EXISTS message_automation_firings;  -- drops FK to message_templates
DROP TABLE IF EXISTS message_templates;
DROP TABLE IF EXISTS user_preferences;
