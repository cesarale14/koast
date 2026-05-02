# Production Schema Drift Audit

*Captured 2026-05-01. This is a comparison of production's actual schema against what the 48 migration files in `supabase/migrations/` would produce against an empty database. Investigation only; no recovery migrations authored, no environments modified.*

Cross-references:
- Production schema dump: `production-schema-snapshot.sql` (2,785 lines, captured via `pg_dump --schema-only --no-owner --no-privileges` against the production project at version 17.6)
- Migration replay snapshot through migrations 1-14: `migration-replay-snapshot-through-14.sql` (1,646 lines, captured against staging after a clean replay of migrations 1-14)
- Drift analyzer: `/tmp/koast-staging-setup/drift-analyzer.py` (position-aware Python script that parses both dumps + all 48 migration files)
- Related: `staging-investigation.md`, `agent-loop-v1-milestone-1-baseline.md`

## Executive summary

The audit finds **one severe drift item** (a production table that no migration ever creates), **two moderate drift items** (production-side missing indexes the migrations claim to create; production-side renamed RLS policies), and **two project-level configuration drift items between staging and production** (missing event trigger; missing function). Plus a number of expected-and-benign discrepancies caused by the agent loop v1 Milestone 1 migrations (`20260501010000` through `20260501040000`) being authored but not yet applied to production.

The path forward depends on the user's call on each item below — recovery migration authoring is left for a separate session per the prompt's constraints.

---

## D1 — `channex_webhook_log` table never created in any migration

**Category: NEEDS RECOVERY MIGRATION**

The table exists in production with 13 columns, 102 rows, RLS enabled, 1 RLS policy, and 2 indexes. **No `CREATE TABLE channex_webhook_log` statement exists in any of the 48 migration files.** Three migrations only `ALTER` it:

- `20260407050000_channex_revision_polling.sql` — `ALTER TABLE channex_webhook_log ADD COLUMN IF NOT EXISTS revision_id text;` (and creates an index on revision_id)
- `20260408010000_fix_rls_policies.sql` — declares the RLS policy `"Users can view own webhook logs"` for the table
- `20260501030000_agent_audit_log.sql` — references the table in a code comment but doesn't modify it

The table itself was likely created via the Supabase Studio SQL Editor at some point and never back-filed as a migration.

**Fresh-replay impact**: confirmed live this session — staging migration #15 (the `20260407050000_channex_revision_polling.sql` ALTER) failed with `ERROR: relation "channex_webhook_log" does not exist`. Replay cannot proceed past that migration without the recovery.

**Production schema for reference**:

```sql
-- Production state (12 columns at original create + 1 added by 20260407050000):
CREATE TABLE channex_webhook_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type          text,
  booking_id          text,
  channex_property_id text,
  guest_name          text,
  check_in            text,
  check_out           text,
  payload             jsonb,
  action_taken        text,
  ack_sent            boolean DEFAULT false,
  ack_response        text,
  created_at          timestamptz DEFAULT now()
  -- revision_id added later by 20260407050000_channex_revision_polling.sql
);
```

**Recommended fix**: a recovery migration `20260407040000_channex_webhook_log.sql` (sequenced before the `20260407050000_channex_revision_polling.sql` ALTER that depends on the table). The recovery migration creates the table and enables RLS; the existing `20260408010000_fix_rls_policies.sql` continues to create the policy.

**On production**: with `CREATE TABLE IF NOT EXISTS`, the recovery migration is a no-op against the already-populated table. No data loss risk.

---

## D2 — Seven indexes declared in early migrations but absent from production

**Category: NEEDS PRODUCTION FIX (or accept-and-document if intentional)**

The migrations 002, 004, 005, 006 declare 7 `CREATE INDEX` statements, but production has none of them:

| Index | Declared in | Live in production? |
|---|---|---|
| `idx_properties_channex_id` | `002_channex_constraints.sql` | NO |
| `idx_guest_reviews_property` | `004_reviews.sql` | NO |
| `idx_guest_reviews_status` | `004_reviews.sql` | NO |
| `idx_guest_reviews_scheduled` | `004_reviews.sql` | NO |
| `idx_review_rules_property` | `004_reviews.sql` | NO |
| `idx_pricing_outcomes_booked` | `005_pricing_outcomes_events.sql` | NO |
| `idx_revenue_checks_ip` | `006_leads.sql` | NO |

The migrations are syntactically valid (`CREATE INDEX ... ON <table>(...)`); they would create the indexes on a clean replay. They don't exist in production.

**Possible causes**:

1. **The migrations were never applied to production in their original form**, and the schema was bootstrapped by an earlier path (e.g., the Studio SQL editor) that didn't include these indexes.
2. **The indexes were created and later DROPped manually** via the SQL editor, possibly for performance reasons (overhead of maintaining unused indexes) or accidentally.
3. **The migration application failed silently for the CREATE INDEX statements**, but the rest of the migration succeeded. This is rare in PostgreSQL but theoretically possible if non-blocking-error tools were in the pipeline.

**Performance impact today**: trivial. The affected tables have very low row counts (`guest_reviews=13`, `review_rules=0`, `pricing_outcomes=44`, `revenue_checks=1`, `properties=2`). Sequential scans cost essentially nothing.

**Performance impact at scale**: meaningful. As `guest_reviews` and `pricing_outcomes` grow into the thousands of rows per property, the absence of these indexes will cause slow ORDER BY and WHERE clauses.

**Fresh-replay impact**: when staging runs the full 48-migration replay, staging will have all 7 indexes. Staging schema will be a *superset* of production for this category. Comparison and verification queries that EXPLAIN-test query plans will produce different results between staging and production until production matches.

**Recommended fix**: a recovery migration that creates these 7 indexes with `IF NOT EXISTS` guards, applied to production. No-op on staging (where they already exist). This converges staging and production schemas to the same state. Alternatively, modify the original migrations to align — but that violates the "migrations are immutable once applied" principle (which the team is now formalizing per `koast_migration_history`).

**Decision the user makes**: are these indexes wanted? If yes, ship a recovery migration to add them. If no, ship a recovery migration to drop them from the migration files (or document the intentional omission). Either way the staging-vs-production drift on this category is closed.

---

## D3 — Two RLS policies in production with non-canonical names

**Category: COSMETIC DRIFT — functionally equivalent, names differ**

| Production policy | Migration policy | Difference |
|---|---|---|
| `guest_reviews."Users manage own reviews"` | migration 004's `"Users can manage own guest_reviews"` | Production lacks "can"; uses "reviews" instead of "guest_reviews"; no underscore |
| `review_rules."Users manage own review rules"` | migration 004's `"Users can manage own review_rules"` | Production lacks "can"; uses "review rules" with space instead of "review_rules" |

The `WHERE`/`USING`/`WITH CHECK` clauses are equivalent — both forms enforce `property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())`. The names differ.

**How this happened**: the prevailing theory is that someone created the policies by hand in the Studio SQL editor with informal names, then later authored a migration with canonical names but didn't drop the original. The migration's CREATE POLICY would have failed if the canonical-named policy didn't exist before but the casual-named one was already there — or it succeeded (PostgreSQL allows multiple CREATE POLICY statements on the same table with different names).

**Fresh-replay impact**: staging replay creates the canonical-named policies. Staging schema has different policy *names* than production — but the *behavior* (who can read/write) is identical. This is BENIGN at the behavioral level.

**Recommended fix**: rename in production via the SQL editor:

```sql
ALTER POLICY "Users manage own reviews" ON guest_reviews RENAME TO "Users can manage own guest_reviews";
ALTER POLICY "Users manage own review rules" ON review_rules RENAME TO "Users can manage own review_rules";
```

Two-line cleanup. Authoritative migration names match production. No behavior change.

**Decision the user makes**: rename now, or accept the cosmetic drift. Recommended: rename (it's two SQL statements).

---

## D4 — `ical_feeds` legacy policy in migrations not in production

**Category: BENIGN — stale policy in old migration; production correctly missing it**

Migration `007_ical.sql` creates `"Users can manage their own ical feeds"` (note: spaces and possessive "their own"). Migration `20260408010000_fix_rls_policies.sql` later creates two replacement policies: `"Users can view own ical_feeds"` and `"Users can manage own ical_feeds"` (canonical names).

The `20260408010000_fix_rls_policies.sql` migration **does not drop** the old `"Users can manage their own ical feeds"` policy. So a clean replay produces three ical_feeds policies. Production has only the two canonical ones — somewhere between migration apply and now, the old policy was dropped manually.

**Fresh-replay impact**: staging will end up with three policies; production has two. The third (legacy-named) policy on staging is functionally a duplicate of `"Users can manage own ical_feeds"`.

**Recommended fix**: add a `DROP POLICY IF EXISTS "Users can manage their own ical feeds" ON ical_feeds;` statement to one of the recovery migrations to align staging with production. Or drop in 007 (modifying a migration), but that's against the immutable-migrations principle. Or accept the harmless duplicate on staging.

**Decision the user makes**: low-priority cleanup. Either harmonize via recovery migration or accept the duplicate as benign. Recommended: harmonize via recovery (one DROP statement).

---

## D5 — 17 tables RLS-enabled in production but no migration ALTER ENABLE statement

**Category: SUPABASE PROJECT-LEVEL CONFIGURATION — production has the auto-RLS event trigger; staging does not**

Tables in production with RLS enabled but no migration `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`:

```
channex_outbound_log, channex_rate_plans, channex_room_types, channex_sync_state,
channex_webhook_log, concurrency_locks, leads, message_automation_firings,
message_threads, notifications, pricing_performance, pricing_recommendations,
pricing_rules, property_channels, revenue_checks, user_subscriptions, weather_cache
```

Production has a Supabase-managed event trigger called `ensure_rls` that fires on `ddl_command_end`, calling a function `rls_auto_enable()` which calls `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on every freshly-created public-schema table. So tables created by migrations get RLS auto-enabled even without explicit migration statements.

**Staging is MISSING this event trigger.** Verified live this session:

```
Production event triggers:                         Staging event triggers:
- issue_pg_graphql_access                         - issue_pg_graphql_access
- issue_graphql_placeholder                       - issue_graphql_placeholder  
- pgrst_ddl_watch                                 - pgrst_ddl_watch
- pgrst_drop_watch                                - pgrst_drop_watch
- issue_pg_cron_access                            - issue_pg_cron_access
- issue_pg_net_access                             - issue_pg_net_access
- ensure_rls                                ←  MISSING from staging
```

This means: when staging runs the full 48-migration replay, the 17 tables listed above will be created **without** RLS enabled (because no migration declares ALTER ENABLE on them). Production has them enabled. **Real environment-fidelity drift between staging and production.**

**Recommended fixes** (the team picks one):

**Option A — Replicate the event trigger on staging**:

```sql
-- On staging, copy the function and event trigger from production.
CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS event_trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog'
AS $function$
DECLARE cmd record;
BEGIN
  FOR cmd IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
    IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT LIKE 'pg_%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;
END;
$function$;

CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  EXECUTE FUNCTION public.rls_auto_enable();
```

This is Supabase's built-in trigger, replicated. Pro: identical behavior to production. Con: requires elevated permissions; the staging postgres role may not allow `CREATE EVENT TRIGGER` (Supabase usually disables this for non-superuser roles).

**Option B — Add explicit ALTER ENABLE statements to a recovery migration**:

```sql
-- Recovery migration: explicit RLS enabling for tables that depend on
-- the auto-RLS event trigger in production. Makes RLS state migration-
-- declared so it works on any environment, not just Supabase-with-trigger.
ALTER TABLE channex_outbound_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE channex_rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE channex_room_types ENABLE ROW LEVEL SECURITY;
-- ... etc for all 17 tables
```

This is portable and migration-declared. Pro: works regardless of project-level config, including future non-Supabase environments. Con: noise in the recovery migration.

**Option C — Add explicit ALTER ENABLE to each individual table-creating migration retroactively**:

Modify each migration that creates one of the 17 tables to add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` after the CREATE. Violates the immutable-migrations principle (those migrations were applied to production). Not recommended.

**Recommendation**: **Option B**. Most portable, least magic, doesn't depend on Supabase project-level configuration. Add to a single recovery migration that explicitly enables RLS on all 17 tables; since `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is idempotent (no error if already enabled), the migration is a no-op on production and a real change on staging.

---

## D6 — `rls_auto_enable` function in production not in migrations

**Category: SUPABASE PROJECT-LEVEL CONFIGURATION — same root cause as D5**

The function powering D5's `ensure_rls` event trigger is `rls_auto_enable()`, present in production, absent from staging. It's Supabase-managed code, not application migrations. See D5 for fix recommendations — addressing D5 also addresses D6 (because the function is meaningful only paired with the event trigger).

---

## D7 — `pricing_recommendations_latest` view exists in production, declared in migrations

**Category: BENIGN — view IS in migrations, just not picked up by all parsers**

The view is created by `20260414010000_pricing_recommendations.sql` via `CREATE OR REPLACE VIEW pricing_recommendations_latest AS ...`. My initial drift analyzer didn't track views; now confirmed they're correctly declared. **No drift.** Listed here only for completeness so the analyzer's output isn't misread.

---

## Expected discrepancies (NOT drift)

These items appear in the analyzer output but are **expected** because the agent loop v1 Milestone 1 migrations (`20260501010000` through `20260501040000`) have been authored and committed but not yet applied to production:

- 6 tables in migrations not in production: `agent_artifacts`, `agent_audit_log`, `agent_conversations`, `agent_turns`, `guests`, `memory_facts`
- 2 columns in migrations not in production: `messages.actor_id`, `messages.actor_kind`
- 20 indexes in migrations not in production (all `idx_agent_*`, `idx_memory_facts_*`, `idx_guests_*`, `idx_messages_actor_*`)
- 5 RLS policies in migrations not in production (all on the 6 new tables)
- 6 RLS-enabled tables in migrations not in production (the 6 new tables)
- 4 triggers in migrations not in production (all `*_updated_at` for the new tables)
- 4 functions in migrations not in production (all `set_*_updated_at` for the new tables)

These all resolve when Milestone 1 rollout resumes after staging is established. **No action required for these in this drift audit.**

---

## Summary table — every drift item, classified

| # | Drift item | Category | Recommended fix |
|---|---|---|---|
| D1 | `channex_webhook_log` table never CREATE'd in migrations | NEEDS RECOVERY MIGRATION | Author `20260407040000_channex_webhook_log.sql` to create the table to match production's shape. Idempotent (CREATE TABLE IF NOT EXISTS) so no-op on production. |
| D2 | 7 indexes declared in migrations 002/004/005/006 but absent from production | NEEDS PRODUCTION FIX (low-stakes today, real-stakes at scale) | Author a recovery migration that creates the 7 indexes with IF NOT EXISTS. No-op on staging, real on production. Or document the intentional absence if dropping was deliberate. |
| D3 | 2 RLS policies on production have non-canonical names | COSMETIC DRIFT | Two `ALTER POLICY ... RENAME TO` statements to align production with migration names. Or accept the cosmetic drift. |
| D4 | 1 legacy ical_feeds policy in migration 007 not dropped | BENIGN — duplicate-shape | One `DROP POLICY IF EXISTS` in a recovery migration. Or accept the harmless duplicate on staging. |
| D5 | 17 tables RLS-enabled by Supabase event trigger, not by migrations | PROJECT-LEVEL CONFIGURATION | **Option B recommended**: recovery migration with explicit `ALTER TABLE ... ENABLE RLS` for all 17 tables. Idempotent, portable, no-op on production. |
| D6 | `rls_auto_enable` function in production not in migrations | PROJECT-LEVEL CONFIGURATION | Resolved by D5's recovery migration; function is no longer load-bearing if every table has explicit RLS. |
| D7 | `pricing_recommendations_latest` view (parser noise) | NOT DRIFT | None. View is correctly created by `20260414010000_pricing_recommendations.sql`. |

---

## Recovery migration sketch (recommendation only — to be authored in a separate session)

If the user accepts the recommendations above, a single recovery migration can address D1, D2, D4, and D5 together. D3 is a manual one-time SQL editor cleanup.

Suggested filename: `20260407040000_recovery_schema_drift.sql` (timestamp pre-`20260407050000_channex_revision_polling.sql` so the channex_webhook_log creation runs before the ALTER that depends on it).

The recovery migration would contain (sketch):

```sql
-- D1: create channex_webhook_log to match production's shape.
CREATE TABLE IF NOT EXISTS channex_webhook_log ( ... 12 columns ... );
ALTER TABLE channex_webhook_log ENABLE ROW LEVEL SECURITY;

-- D2: create the 7 indexes that early migrations declare but production lacks.
CREATE INDEX IF NOT EXISTS idx_properties_channex_id ...;
CREATE INDEX IF NOT EXISTS idx_guest_reviews_property ...;
-- ... 5 more

-- D4: drop the legacy ical_feeds policy from migration 007.
DROP POLICY IF EXISTS "Users can manage their own ical feeds" ON ical_feeds;

-- D5: explicit RLS enable for the 17 tables that production auto-enables.
ALTER TABLE channex_outbound_log ENABLE ROW LEVEL SECURITY;
-- ... 16 more
```

The migration is fully idempotent (`IF NOT EXISTS` / `IF EXISTS` everywhere) — running it on production is a no-op for D1 (table exists), partial-real for D2 (creates the missing indexes), real for D4 (drops the legacy policy if any production project still has it; harmless otherwise), no-op for D5 (RLS already enabled). On staging it's full-real for everything.

D3 (policy renames) does not fit cleanly into a migration because RENAME requires a specific source name. If those policies are renamed, do it via two manual `ALTER POLICY ... RENAME TO` statements directly against production.

---

## Decision points for the next session

The drift audit is the artifact. The next session decides:

1. **Accept the recommendations and author the recovery migration?** Or revise the categorization on any item?
2. **For D2 indexes — recreate them in production, or document the intentional absence?** If the indexes were dropped on purpose, this changes the recommendation from "recovery migration" to "modify the original migration files to remove them" (which then violates the immutability principle and needs its own decision).
3. **For D5 — Option A (replicate Supabase event trigger on staging) or Option B (explicit ALTER TABLE ENABLE in a recovery migration)?** Option B is more portable; Option A is closer to production's actual mechanism.
4. **For D3 — rename in production manually now, or live with the cosmetic drift?**

Once those decisions are made, the recovery migration(s) can be authored and the staging Phase 2 replay resumed from migration #15 with everything in place.

---

## State at end of this session

- Production schema dump captured: `production-schema-snapshot.sql` (read-only operation against production).
- Staging migrations 1-14 replay: clean. Schema dump captured: `migration-replay-snapshot-through-14.sql`.
- Drift audit: this document.
- **No recovery migrations authored.** Per the prompt's constraint.
- **No further migrations applied to staging or production.** Per the prompt's constraint.
- Staging public schema currently holds the post-1-14 state (22 tables). Migrations 15-48 await the recovery decisions before resuming.

The 48 migration files in `supabase/migrations/` (including the four agent loop v1 Milestone 1 migrations at `20260501010000` through `20260501040000`) are unchanged from prior sessions.
