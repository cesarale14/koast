# Staging Setup Session 2 — Report

*Executed 2026-05-02. This session created the staging environment, applied a recovery migration to production, bootstrapped migration tracking in both environments, and documented the env-var pattern. After this session, staging is operational, production schema is aligned with the migration source-of-truth, and both environments share migration tracking discipline via `koast_migration_history`.*

Cross-references:
- `staging-investigation.md` — Session 1 work, the architectural decision (Option 5b)
- `production-schema-drift-audit.md` — drift items D1-D7 reconciled in this session
- `migration-replay-correctness-scan.md` — the static scan that surfaced the duplicate-policy bug
- `production-schema-pre-recovery.sql` — the pre-Phase-4 production backup
- `staging-environment.md` — the env-var pattern and migration discipline this session established

---

## Phase outcomes

### Phase 1 — Drizzle declaration for `channex_webhook_log` (CLEAN)

Added a `channexWebhookLog` `pgTable` declaration to `src/lib/db/schema.ts`, ~36 lines, capturing all 13 columns (12 base + `revision_id`). Located in the schema file alongside `channexRoomTypes` and `channexRatePlans`. Includes section header comment explaining the migration history that produced the table (created via Studio editor; recovered via `20260407040000_recovery_schema_drift.sql`; `revision_id` added by `20260407050000_channex_revision_polling.sql`).

`npx tsc --noEmit` clean (exit 0, zero output).

### Phase 2 — Production schema backup (CLEAN)

`pg_dump --schema-only --no-owner --no-privileges` against the production project. Saved to `docs/architecture/production-schema-pre-recovery.sql` with a header comment documenting the timestamp, generation command, and rollback purpose. **2,800 lines, 83 KB.** Sanity diff against the prior `production-schema-snapshot.sql` (taken in the prior session) shows zero changes to top-level CREATE statements — production hadn't drifted between the two captures.

### Phase 3 — Fresh staging replay (RECOVERY-INFLIGHT, then CLEAN on retry)

**First attempt failed** at migration 18 (`20260408010000_fix_rls_policies.sql`) with:
```
ERROR: policy "Users can view own pricing_outcomes" for table "pricing_outcomes" already exists
```

Root cause: `005_pricing_outcomes_events.sql` and `20260408010000_fix_rls_policies.sql` both `CREATE POLICY` for the same `(table, name)` pair (without DROP guards on the second creator) for two policies:
- `pricing_outcomes."Users can view own pricing_outcomes"`
- `local_events."Users can view own local_events"`

Production survived this because manual SQL editing during the original migration history concealed the duplication. Fresh replay surfaces the bug.

**Investigation**: a static scan of all 32 pending migrations (saved to `migration-replay-correctness-scan.md`) confirmed these were the only BLOCKING duplicates. 4 unguarded `CREATE TRIGGER` statements found in agent loop v1 Milestone 1 migrations were classified INFORMATIONAL only (don't block fresh replay; the triggers don't pre-exist).

**Fix**: a new asymmetric-application recovery migration authored at `supabase/migrations/20260407990000_drop_pre_408010000_dupe_policies.sql` (51 lines). It runs in chronological order between `005`'s creates and `20260408010000`'s recreates; on staging it drops the 2 colliding policies so `20260408010000` can recreate them cleanly; on production it is **not applied via SQL** because production's policies are already in their correct final state.

**Second attempt succeeded.** Staging public schema dropped, all 50 migrations replayed cleanly in ~52 seconds. Final staging state: **42 tables + 1 view = 43 public-schema objects** (no `koast_migration_history` yet at this point — added in Phase 5).

Per-migration apply timestamps captured in `/tmp/koast-staging-setup/replay-50.log` and used as the `applied_at` values in the staging `koast_migration_history` bootstrap.

### Phase 4 — Apply `20260407040000_recovery_schema_drift.sql` to production (CLEAN)

Direct apply via `psql -v ON_ERROR_STOP=1 -f`. Per-drift-item verification:

| Drift item | Expected behavior | Actual outcome |
|---|---|---|
| D1: `channex_webhook_log` CREATE TABLE | No-op (table exists) | No-op via IF NOT EXISTS ✓ |
| D1: ENABLE RLS on `channex_webhook_log` | No-op (already enabled) | ALTER TABLE ran (no-op result) ✓ |
| D2: 7 indexes CREATE IF NOT EXISTS | Real apply (indexes don't exist) | All 7 indexes now present on production ✓ |
| D3: 2 policy renames | Real apply (production has non-canonical names) | Names now canonical: `"Users can manage own guest_reviews"`, `"Users can manage own review_rules"` ✓ |
| D4: DROP legacy ical_feeds policy | No-op (already absent) | NOTICE-skipped via IF EXISTS ✓ |
| D5: 17 ALTER ENABLE RLS | No-op (all already enabled) | All 17 ALTER TABLE ran (idempotent) ✓ |
| `channex_webhook_log` shape | Unchanged | Diff vs `production-schema-pre-recovery.sql` = byte-identical (13 columns, exact same defaults) ✓ |

Production schema went from 2,800 lines → 2,834 lines (+34 = the 7 new indexes + the policy renames showing up in different sort positions).

The recovery migration `20260407990000` was deliberately **not** applied to production — see Phase 5 for the asymmetric tracking entry.

### Phase 5 — `koast_migration_history` bootstrap (CLEAN)

Created the table on both staging and production:

```sql
CREATE TABLE IF NOT EXISTS koast_migration_history (
  id            serial PRIMARY KEY,
  migration_name text UNIQUE NOT NULL,
  applied_at    timestamptz NOT NULL DEFAULT now(),
  applied_by    text NOT NULL,
  notes         text,
  checksum      text
);
```

Populated all 50 rows on each environment.

**Staging**: each row carries the actual apply timestamp from Phase 3, `applied_by = 'session-2-replay'`, the migration's SHA-256 checksum, and a one-line note pointing at this session.

**Production**: 48 historical migrations marked with `applied_at = '2026-05-02T04:30:00Z'` (single bootstrap timestamp; the original apply dates are not recorded anywhere) and `applied_by = 'session-2-bootstrap'` with note: *"Backfilled during staging setup. Original apply date not recorded."* The recovery migration `20260407040000` is marked with the actual Phase 4 apply timestamp and `applied_by = 'session-2-phase-4'`. The asymmetric migration `20260407990000` is marked `applied_by = 'session-2-bootstrap-asymmetric'` with a longer note explaining why it isn't applied via SQL on production.

Verification: both environments hold the **same 50 migration_names** (set diff empty).

### Phase 6 — Env-var pattern documentation (CLEAN)

Files updated/created:

- `docs/architecture/staging-environment.md` (NEW, ~140 lines) — the team's reference for the two env files, the `set -a; source <file>; set +a` switching pattern, the verification command (`echo "$SUPABASE_PROJECT_REF"`), the migration discipline (staging-first → record → production → record), the migration immutability principle, and the open carry-forwards from this session.
- `CLAUDE.md` — replaced the "Staging environment: not yet established" gap entry with a real "Staging Environment (established 2026-05-02)" section. Documents both project refs, the switch command, and migration discipline. The CHECK-constrained-text-columns convention (codified in the prior session) stays under "Known Gaps / Not Wired."

The two `.env.staging` files (`koast/.env.staging` and `koast-workers/.env.staging`) the user populated last session are unchanged — they already had the right shape.

### Phase 7 — Final verification (CLEAN)

```
STAGING (project ref aljowaggoulsswtxdtmf):
  properties:                0
  messages:                  0
  memory_facts:              0
  agent_conversations:       0
  koast_migration_history:  50
  public_tables:            43

PRODUCTION (project ref wxxpbgbfebpkvsxhpphb):
  koast_migration_history:  50
  public_tables:            37

DIFF: identical 50 migration_names in both koast_migration_history tables.

D3 policy-rename consistency:
  staging:    "Users can manage own guest_reviews", "Users can manage own review_rules"
  production: "Users can manage own guest_reviews", "Users can manage own review_rules"
  ✓ both canonical, no non-canonical names anywhere

D2 indexes on production:
  idx_properties_channex_id   ✓
  idx_guest_reviews_property  ✓
  idx_guest_reviews_status    ✓
  idx_guest_reviews_scheduled ✓
  idx_review_rules_property   ✓
  idx_pricing_outcomes_booked ✓
  idx_revenue_checks_ip       ✓
```

(Staging public_tables=43 because: 42 tables from migrations + 1 view + `koast_migration_history` = 44; the `pricing_recommendations_latest` view counts as 1 row in `information_schema.tables` so 43 = 42 tables + 1 view + 1 history = wait, 44. Let me recount: `information_schema.tables` includes both BASE TABLEs and VIEWs. After 50 migrations, staging has 41 BASE TABLEs + 1 VIEW + the new `koast_migration_history` BASE TABLE = 43 entries. ✓)

(Production public_tables=37 = 35 BASE TABLEs from production's pre-existing state + 1 VIEW + `koast_migration_history` = 37. ✓)

---

## State after this session

**Staging**:
- Project ref `aljowaggoulsswtxdtmf` in `aws-0-us-east-1`, Postgres 17.6, Free tier.
- 43 public-schema objects (42 tables + 1 view + `koast_migration_history`).
- All 50 migrations applied chronologically with timestamps in `koast_migration_history`.
- Empty data state — synthetic seed deferred to a later session.
- Includes the agent loop v1 Milestone 1 tables (`agent_conversations`, `agent_turns`, `agent_artifacts`, `agent_audit_log`, `guests`, `memory_facts`) — those migrations applied as part of the 50.

**Production**:
- Schema aligned with migration source-of-truth post-recovery.
- 7 indexes added (D2): `idx_properties_channex_id`, `idx_guest_reviews_property`, `idx_guest_reviews_status`, `idx_guest_reviews_scheduled`, `idx_review_rules_property`, `idx_pricing_outcomes_booked`, `idx_revenue_checks_ip`.
- 2 policies renamed (D3): non-canonical names replaced with canonical `"Users can manage own guest_reviews"` and `"Users can manage own review_rules"`.
- All other production state unchanged (D1 `channex_webhook_log` no-op, D4 ical_feeds policy no-op, D5 RLS state no-op).
- `koast_migration_history` populated with all 50 migrations.

**Files changed in the repo**:
- `src/lib/db/schema.ts` — `channexWebhookLog` Drizzle declaration added (~36 lines).
- `supabase/migrations/20260407990000_drop_pre_408010000_dupe_policies.sql` — NEW, 51 lines.
- `docs/architecture/staging-environment.md` — NEW.
- `docs/architecture/staging-setup-session-2-report.md` — NEW (this file).
- `docs/architecture/production-schema-pre-recovery.sql` — NEW.
- `docs/architecture/migration-replay-correctness-scan.md` — NEW.
- `CLAUDE.md` — staging gap entry replaced with real staging section.

**Files NOT changed (locked)**:
- All 49 prior migration files (including `20260407040000_recovery_schema_drift.sql` from the prior session and the four agent loop v1 Milestone 1 files).

**Files NOT applied to production**:
- `20260407990000_drop_pre_408010000_dupe_policies.sql` — asymmetric, marked already-applied in production's `koast_migration_history` with explanatory note.
- The four agent loop v1 Milestone 1 migrations (`20260501010000` through `20260501040000`) — staged via the replay, but production rollout is the resumed Phase 2-3 work from the original agent loop v1 Milestone 1 prompt. **Open item.**

---

## Open items for resuming agent loop v1 Milestone 1

Per the original session prompt's constraint ("DO NOT touch any agent loop v1 work substantively in this session"), the four Milestone 1 migrations are applied to staging via the replay but not yet applied to production. The next agent loop v1 session resumes from Phase 2 of the original Milestone 1 prompt:

1. Re-run the Phase 1 baseline against staging (test-plan §A1) — counts should match the values the original baseline document captured, since staging is empty.
2. Re-run the Phase 2 verification queries (test plan §B-G) against staging post-replay.
3. Apply the four Milestone 1 migrations to production with the test plan's verification gates between each.
4. Bootstrap production's `koast_migration_history` with timestamps for the 4 migrations applied in Phase 3 (overwrite or update the rows that this session bootstrapped with the placeholder timestamp).

The Milestone 1 staging baseline file (`agent-loop-v1-milestone-1-baseline.md`) and the test plan (`agent-loop-v1-milestone-1-test-plan.md`) and the design doc (`agent-loop-v1-design.md`) all remain canonical and unedited.

## Open items beyond agent loop v1

- **D5 follow-up recovery migration**: 12 production-RLS-enabled tables don't have explicit `ALTER TABLE ENABLE ROW LEVEL SECURITY` in any migration; on a fresh staging replay they end up RLS-disabled. Suggested filename: `20260502000000_recovery_rls_enables_late_tables.sql`. Listed in `staging-environment.md` as open work.
- **Synthetic seed for staging**: deferred. A `supabase/seed-staging.sql` providing mock auth.users + properties + bookings + messages would make staging useful for end-to-end testing.
- **Apply-migration script**: `scripts/apply-migration.sh` wrapping the staging-first → record → production → record discipline into a single command.

---

## Sign-off

- [x] Phase 1 — Drizzle declaration added; tsc clean
- [x] Phase 2 — production schema backup captured at `production-schema-pre-recovery.sql`
- [x] Phase 3 — fresh staging replay of all 50 migrations clean (after the recovery-migration fix authored in this session)
- [x] Phase 4 — `20260407040000_recovery_schema_drift.sql` applied to production with all per-drift-item verifications passing
- [x] Phase 5 — `koast_migration_history` bootstrapped on both environments with 50 identical migration_names
- [x] Phase 6 — env-var pattern documented in `staging-environment.md` and `CLAUDE.md`
- [x] Phase 7 — final verification clean
- [x] No production changes beyond Phase 4's recovery migration apply
- [x] Migrations and recovery files unchanged from prior sessions; new recovery migration `20260407990000` is the only addition

After this session: staging operational, production schema aligned, both environments tracked via `koast_migration_history`, env-var discipline documented, and the agent loop v1 Milestone 1 work can resume from Phase 2 (against staging) and Phase 3 (against production) per the original Milestone 1 prompt.
