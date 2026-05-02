# Migration Replay Correctness Scan

*Static scan of 32 pending migrations (chronological positions 18-49) for the seven replay-correctness trap categories per the team's prompt. Captured 2026-05-02. Scanner: `/tmp/koast-staging-setup/replay-correctness-scan.py`.*

Migrations 1-17 in chronological order (001 through 20260407080000_channel_manager.sql plus the recovery migration at chronological position 15) replayed cleanly in the prior session. The scan below covers the 32 still-pending migrations, in chronological order:

  18. `20260408010000_fix_rls_policies.sql`
  19. `20260410000000_cleaning_tasks_rls.sql`
  20. `20260412010000_calendar_rates_per_channel.sql`
  21. `20260413010000_free_tier_property_quota.sql`
  22. `20260413020000_concurrency_locks.sql`
  23. `20260414010000_pricing_recommendations.sql`
  24. `20260417010000_notifications.sql`
  25. `20260417020000_channex_outbound_log.sql`
  26. `20260417030000_market_comps_source.sql`
  27. `20260418000000_pricing_rules_and_performance.sql`
  28. `20260419000000_pricing_recommendations_dedup.sql`
  29. `20260421000000_pricing_performance_unique.sql`
  30. `20260422010000_reviews_sync.sql`
  31. `20260423020000_add_guest_name_to_reviews.sql`
  32. `20260424010000_review_ota_reservation_code.sql`
  33. `20260424020000_add_guest_review_submission.sql`
  34. `20260425010000_bookings_channex_source_and_name_override.sql`
  35. `20260425020000_add_review_expired_at.sql`
  36. `20260425030000_properties_reviews_last_synced_at.sql`
  37. `20260426010000_decompose_is_bad_review.sql`
  38. `20260426020000_messaging_slice1.sql`
  39. `20260426030000_messaging_slice1_unique_fix.sql`
  40. `20260426040000_bookings_channex_id_full_unique.sql`
  41. `20260426050000_cleaning_tasks_cleaner_fk_and_booking_unique.sql`
  42. `20260426060000_bookings_turnover_trigger_inert.sql`
  43. `20260427010000_messaging_executor_8a.sql`
  44. `20260427020000_drop_obsolete_messages_draft_status_check.sql`
  45. `20260428010000_guest_reviews_is_hidden.sql`
  46. `20260501010000_guests_and_memory_facts.sql`
  47. `20260501020000_agent_loop_tables.sql`
  48. `20260501030000_agent_audit_log.sql`
  49. `20260501040000_messages_actor_columns.sql`

Each section reports findings with severity classification. **BLOCKING** = replay will fail. **RISKY** = could fail depending on data state. **INFORMATIONAL** = works but brittle (worth knowing about).

---

## Trap 1 — CREATE POLICY collisions

**BLOCKING** findings:

| Migration | Line | Table | Policy name | Earlier creator(s) | Severity |
|---|---|---|---|---|---|
| `20260408010000_fix_rls_policies.sql` | 24 | `pricing_outcomes` | `"Users can view own pricing_outcomes"` | `005_pricing_outcomes_events.sql` | **BLOCKING** |
| `20260408010000_fix_rls_policies.sql` | 33 | `local_events` | `"Users can view own local_events"` | `005_pricing_outcomes_events.sql` | **BLOCKING** |

These statements create a policy whose `(table, name)` already exists from an earlier migration without an intermediate `DROP POLICY`. PostgreSQL's `CREATE POLICY` does not support `IF NOT EXISTS`, so these collisions error on fresh replay. Fix: a small recovery migration that DROPs each colliding policy with conditional check (per the discussion in the prior session — DO block detecting whether the downstream migration has run, to avoid making production lose policies it currently has).

## Trap 2 — CREATE TYPE without IF NOT EXISTS / DO-block guard

**No findings.** No `CREATE TYPE` statements in pending migrations.

## Trap 3 — CREATE EXTENSION without IF NOT EXISTS

**No findings.** No `CREATE EXTENSION` statements without `IF NOT EXISTS` in pending migrations.

## Trap 4 — CREATE FUNCTION without OR REPLACE

**No findings.** Every `CREATE FUNCTION` in pending migrations uses `OR REPLACE`.

## Trap 5 — CREATE TRIGGER without DROP IF EXISTS guard

**INFORMATIONAL** (will succeed on fresh replay since the trigger doesn't exist yet, but won't be re-creatable on a re-run without a DROP guard):

| Migration | Line | Trigger | Severity |
|---|---|---|---|
| `20260501010000_guests_and_memory_facts.sql` | 69 | `memory_facts_updated_at` | INFORMATIONAL |
| `20260501010000_guests_and_memory_facts.sql` | 74 | `guests_updated_at` | INFORMATIONAL |
| `20260501020000_agent_loop_tables.sql` | 22 | `agent_conversations_updated_at` | INFORMATIONAL |
| `20260501020000_agent_loop_tables.sql` | 85 | `agent_artifacts_updated_at` | INFORMATIONAL |

These are NOT replay-blockers for a fresh-from-zero replay (the trigger doesn't pre-exist), but if a migration is partially applied and re-run, these CREATE TRIGGER statements would error.

Guarded (DROP TRIGGER IF EXISTS earlier in same file):
- `20260413010000_free_tier_property_quota.sql` line 30 — `enforce_property_quota_trigger` ✓
- `20260426060000_bookings_turnover_trigger_inert.sql` line 12 — `bookings_fire_turnover_task` ✓

## Trap 6 — ALTER COLUMN SET NOT NULL (data-state-dependent)

**No findings.** No `ALTER COLUMN ... SET NOT NULL` statements in pending migrations.

## Trap 7 — References to objects not yet created

**No findings.** Every `ALTER TABLE` reference in pending migrations either uses `IF EXISTS` or targets a table created earlier in the chronological sequence.

---

## Summary

- **BLOCKING**: 2 (replay will fail at these)
- **RISKY**: 0 (replay may fail depending on data state — fresh staging is fine)
- **INFORMATIONAL**: 4 (works on fresh replay; brittle on re-run)

**Verdict**: only the 2 known policy duplications (already identified in the prior session as `local_events."Users can view own local_events"` and `pricing_outcomes."Users can view own pricing_outcomes"`) are blocking. Proceeding with Option 1 from the prior session — a small recovery migration at `20260407990000` that conditionally DROPs those 2 policies — is sufficient to unblock fresh replay.

---

*This scan does not modify any migration files, does not author any new migrations, does not replay against staging, and does not touch production. The next session decides on the recovery migration shape based on this scan.*
