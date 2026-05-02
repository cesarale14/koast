# Staging Environment

*Established 2026-05-02 (Session 2). This is the team's reference for working with the staging Supabase project, switching env files, and the migration discipline that staging now enforces.*

Cross-references:
- `staging-investigation.md` — original Session 1 investigation that drove the architectural decision (Option 5b: separate Supabase project, Free tier).
- `production-schema-drift-audit.md` — drift between production schema and migration source-of-truth that Session 2 reconciled.
- `migration-replay-correctness-scan.md` — scan for replay traps that Session 2 used.
- `staging-setup-session-2-report.md` — the Session 2 execution report (this session's work).

---

## Two projects, one codebase

Koast now runs against two Supabase projects:

| Environment | Project ref | Region | Purpose |
|---|---|---|---|
| **Production** | `wxxpbgbfebpkvsxhpphb` | aws-1-us-east-1 | Live `app.koasthq.com`. Real host data. |
| **Staging** | `aljowaggoulsswtxdtmf` | aws-0-us-east-1 | Migration verification and integration testing. Synthetic seed only (Session 2: empty schema; Session 3+ adds seed). |

Both projects run PostgreSQL 17.6, both are in `us-east-1` (different pooler nodes, same region — `aws-0` vs `aws-1` is a Supabase-internal pooler assignment, not a region difference).

The same `~/koast` repo and `~/koast-workers` codebase point at either project depending on which `.env` file is active. The application reads `DATABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` (plus key vars) from environment; the env file determines the project.

---

## Env files

Two pairs of env files exist, both `.gitignore`'d:

### Production
- `~/koast/.env.local` — Next.js / Vercel.
- `~/koast-workers/.env` — Python workers on the Virginia VPS.

### Staging
- `~/koast/.env.staging` — staging-equivalent of `.env.local`. Same key set: `DATABASE_URL`, `DATABASE_URL_POOLED`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`, `SUPABASE_PROJECT_REGION`.
- `~/koast-workers/.env.staging` — staging-equivalent of the workers' `.env`. Same key subset: `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

### Switching environments

**The team's chosen pattern**: `set -a; source <env-file>; set +a` in a shell session.

```bash
# Working against staging:
cd ~/koast
set -a; source .env.staging; set +a

# Now psql, scripts, etc. read DATABASE_URL from the staging env.
psql "$DATABASE_URL" -c "..."

# Working against production: open a new shell or source .env.local instead.
cd ~/koast
set -a; source .env.local; set +a
```

This pattern was chosen over alternatives because:
- It's explicit (you know which environment you're in by reading the recent shell history).
- It works for both Next.js dev and worker scripts (both read from `process.env` / `os.environ`).
- It doesn't require renaming or symlinking files (which leaves an "active" file with no obvious tag).
- New shells default to no environment loaded — meaning a fresh session can't accidentally hit production with a stale env.

For Vercel deployment, environment values are managed in the Vercel dashboard's per-environment settings (Production / Preview / Development), independent of the local `.env` files.

### Verifying which environment is active

Always confirm before running write operations:

```bash
psql "$DATABASE_URL" -At -c \
  "SELECT current_database() || '@' || split_part(current_setting('cluster_name', true), '_', 2);"
```

Or simpler — check the project ref:

```bash
echo "$SUPABASE_PROJECT_REF"
# wxxpbgbfebpkvsxhpphb = production
# aljowaggoulsswtxdtmf = staging
```

For `koast-workers/.env` use the same pattern; the worker `.env` files have the same keys.

---

## Discipline

**No production work happens with the staging env active. No staging work happens with the production env active.** This is enforced socially, not technically — there's no automated guard. The cost of getting it wrong on production is high, so the practice is:

1. Open a new shell for any session that will touch a database.
2. Source the right env file.
3. Verify via `echo "$SUPABASE_PROJECT_REF"`.
4. Then proceed.

For Claude Code sessions specifically: the user states the target environment in the prompt; Claude verifies before running any write.

---

## Migration discipline (post-Session 2)

From this session forward, every new migration follows the staging-first flow:

1. **Author** the migration in `supabase/migrations/`.
2. **Apply to staging** via `psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f <file>.sql`.
3. **Verify** the migration's intended effect (per the migration's verification queries — every migration should have them inline as comments).
4. **Record** in `koast_migration_history` on staging:
   ```sql
   INSERT INTO koast_migration_history (migration_name, applied_by, notes, checksum)
   VALUES ('<filename>', 'session-N', '<context>', '<sha256>');
   ```
5. **Apply to production** via `psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -f <file>.sql`.
6. **Verify** the same effect.
7. **Record** in `koast_migration_history` on production with the same shape.

If a migration is asymmetric (applies to staging only — see the recovery migration `20260407990000_drop_pre_408010000_dupe_policies.sql` for the canonical example), production gets a `koast_migration_history` row marked as already-applied with a note explaining why it isn't run via SQL on production.

### Migration immutability

Once a migration has been applied to either environment, **the file is locked**. Further changes require a new migration. This is the "migrations are append-only" principle. Editing an applied migration creates drift: staging has the original, production has the edit (or vice versa), and the next replay diverges from production.

The two recovery migrations in this session demonstrate the principle: when production was discovered to have drifted from migration source-of-truth, the fix was a NEW migration (`20260407040000_recovery_schema_drift.sql`), not edits to existing files.

### CHECK-constrained text columns convention

When adding a CHECK-constrained text column (e.g., `status text CHECK (status IN ('a', 'b', 'c'))`), also export a typed union from `src/lib/db/schema.ts` mirroring the constraint values, so application-layer callers get compile-time enforcement matching the database-layer enforcement. Established in agent loop v1 Milestone 1 work; see `MessagesActorKind`, `MemoryFactSubEntityType`, `MemoryFactEntityType`, `MemoryFactSource`, `MemoryFactStatus` in `schema.ts` for the canonical examples.

---

## Operational notes

### Staging tier

Staging is on Supabase Free tier. Limits are far above Koast's current scale (Free: 500 MB DB, 50K MAU, 5 GB egress; Koast production currently at 18 MB / 0 MAU). The single Free-tier limitation that bites: `pg_net` extension is Pro-only, so the `bookings_turnover_trigger_inert` migration's `net.http_post` call (which is intentionally inert at the migration level) cannot be activated on staging without a Pro upgrade. Production also runs Free, so this isn't a fidelity gap between staging and production — both have the same limitation.

### Staging RLS auto-enable

Production has a Supabase-managed event trigger `ensure_rls` that auto-enables RLS on every CREATE TABLE in the public schema. **Staging does NOT have this trigger** (Supabase's per-project provisioning is inconsistent on this; Session 2 verified staging is missing it).

To work around the missing trigger, **every migration that creates a table includes an explicit `ALTER TABLE [name] ENABLE ROW LEVEL SECURITY` statement in the same file**, regardless of whether the production trigger would handle it (see CLAUDE.md "RLS enable is explicit, not implicit"). The agent loop v1 Milestone 1 migrations follow this pattern; the tables they create were never RLS-disabled on staging as a result.

For tables created before the discipline was codified, two recovery migrations close the historical gap:
- `20260407040000_recovery_schema_drift.sql` (Session 2) — explicit ALTER ENABLE for 4 of the 17 D5-flagged tables that exist at chronological position 15.
- `20260502000000_recovery_rls_enables_late_tables.sql` (Session 3) — explicit ALTER ENABLE for the remaining 13 tables (the 12 late-created ones from D5 plus `koast_migration_history`, which exhibited the same drift mechanism but post-dated the original audit).

After both recovery migrations run, staging and production have **identical RLS coverage** (100% of public-schema tables RLS-enabled in both environments). The fidelity gap is closed, and the discipline above prevents recurrence on future migrations.

### Staging cost

Free tier = $0/month. The only cost is engineer time spent on migration discipline.

### Refreshing staging from scratch

Sometimes staging needs a clean reset (e.g., the schema diverged via experimental work). The clean-reset procedure:

```bash
cd ~/koast
set -a; source .env.staging; set +a
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

for f in $(ls supabase/migrations/*.sql | sort); do
  echo "Applying $f..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

# Re-bootstrap koast_migration_history per the Session 2 pattern.
```

This takes ~60 seconds for the current 50 migrations.

---

## Future work

- **Synthetic seed for staging** (deferred to Session 4+). Staging is currently empty post-replay. A `supabase/seed-staging.sql` will provide a few mock auth.users + properties + bookings + messages so end-to-end testing has data to operate on.
- **Apply-migration script** (deferred). A `scripts/apply-migration.sh` that wraps the staging-first → record → production → record discipline into a single command, reducing footgun risk.
- ~~**Recovery RLS-enable migration** for the late-created tables.~~ Closed Session 3 via `20260502000000_recovery_rls_enables_late_tables.sql`.
- **Periodic drift audit** as new migrations land, to catch any new staging-vs-production divergence early.
