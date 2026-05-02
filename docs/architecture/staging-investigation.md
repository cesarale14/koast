# Staging Environment — Investigation

*Captured 2026-05-01. This is investigation only. No changes were made; no Supabase projects created; no migrations run; no environment variables modified. The output is a structured report covering current state and viable paths to staging, with a non-binding recommendation at the end.*

Cross-references:
- `~/koast/CLAUDE.md` — current operational state
- `~/koast/docs/architecture/agent-loop-v1-milestone-1-baseline.md` — the milestone that surfaced the staging gap
- `supabase/migrations/` — 48 migration files
- `~/.claude/skills/koast-development/references/playbooks.md` — pre-existing patterns for the no-staging-Postgres situation (BEGIN/ROLLBACK validation, two-stage trigger cutover)

---

## 1. Current Supabase setup

### 1.1 Project identification

| Property | Value | Source |
|---|---|---|
| Supabase project ref | `wxxpbgbfebpkvsxhpphb` | derived from `NEXT_PUBLIC_SUPABASE_URL` and `DATABASE_URL` host |
| Database host | `db.wxxpbgbfebpkvsxhpphb.supabase.co` | live `psql` connection |
| Database name | `postgres` | `SELECT current_database()` |
| Connecting role | `postgres` (superuser via the connection string) | `SELECT current_user` |
| Replica? | No (`pg_is_in_recovery() = false`) | live query |
| Postgres version | **17.6** on aarch64 | `SELECT version()` |

### 1.2 Tier and region

**Tier**: cannot be determined from the workspace alone. There is no `supabase/config.toml`, no Supabase CLI link, no billing-related env var, no project-metadata file. Tier signals available from the dashboard the user can verify directly:

- Supabase Studio → Project Settings → General → "Plan" (Free / Pro / Team / Enterprise).
- Daily-active-projects is a Free-tier signal: Free projects pause after 7 days of inactivity. The fact that the database is responding to queries today means either (a) it's Free + recently active, or (b) it's Pro+. Given continuous worker activity (booking_sync every 15 min, pricing_validator daily, messages_sync hourly), inactivity-pause hasn't been a concern; the tier is consistent with either Free or Pro.

**Region**: also not visible from the workspace. The `db.wxxpbgbfebpkvsxhpphb.supabase.co` hostname doesn't encode region the way Supabase pooler URLs do (`aws-0-us-east-1.pooler.supabase.com` etc.). Verifiable from Project Settings → Database in the dashboard.

**ACTION ITEM for the user (not blocking this report)**: confirm the tier from the dashboard. The recommendation below splits along this question.

### 1.3 Database usage

Live snapshot from `pg_stat_user_tables` and `pg_database_size()`:

| Metric | Value |
|---|---|
| Total approximate row count (public schema) | **1,437** |
| Database size on disk | **18 MB** |
| Distinct populated tables | 25 (of 30+ defined) |

Top-row-count tables, descending:

| Table | Rows |
|---:|---|
| calendar_rates | 667 |
| pricing_recommendations | 209 |
| channex_webhook_log | 102 |
| messages | 90 |
| bookings | 90 |
| cleaning_tasks | 58 |
| weather_cache | 49 |
| pricing_outcomes | 44 |
| market_snapshots | 26 |
| market_comps | 20 |
| channex_outbound_log | 17 |
| message_threads | 16 |
| local_events | 16 |
| guest_reviews | 13 |

**Tier-limit relevance**: the Supabase Free tier provides **500 MB database** and **50K MAU** and **5 GB egress**. Koast at 18 MB DB is at ~3.6% of the Free DB cap. Pro provides 8 GB DB included. There's no near-term tier-limit pressure on database size; staging on either tier is fine for size, and the staging DB at any reasonable seed strategy will be smaller than production anyway.

### 1.4 Sub-conclusion §1

The production project is identifiable, accessible, and operating cleanly on Postgres 17.6. The DB is small (18 MB / ~1,400 rows). Tier and region need user confirmation from the dashboard but are not blocking for this report. No tier-limit pressure today; no architectural anomalies in the production state that would complicate staging setup.

---

## 2. Supabase CLI and tooling

### 2.1 CLI install state

**Not installed on this VPS.** Verification:

```
$ which supabase
(empty — not in PATH)
$ ls /usr/local/bin/supabase /usr/bin/supabase ~/.local/bin/supabase /opt/supabase
(none exist)
```

The workspace's `~/koast/supabase/.temp/cli-latest` file contains the literal string `v2.84.2` — this is the latest-version manifest that the Supabase CLI would write if it were running, but the CLI binary itself is absent. Likely a leftover from a prior session that briefly installed and removed the CLI, or from someone running the CLI elsewhere with the project mounted.

### 2.2 Install paths on Ubuntu 22.04 (informational; nothing installed in this session)

Available paths, ordered by suitability for this workspace:

| Path | Constraints |
|---|---|
| **Direct installer** — `curl -fsSL https://supabase.com/cli/install/linux \| sh` | Single binary, no Node dependency, pinned version. Cleanest. |
| npm — `npm install -g supabase` | Node already present (`v22.22.0`, `npm v10.9.4`). Works but the npm package wraps the binary; either path produces the same CLI. |
| Homebrew — `brew install supabase/tap/supabase` | Homebrew not installed on this machine; would need Linuxbrew install first. Not worth it for one tool. |
| Debian package — `dpkg -i supabase_<ver>_linux_amd64.deb` | Pinned to a specific version, manual upgrade. |

There is **no reason** the CLI can't be installed when staging setup proceeds. The blocker is policy (this is an investigation session; no installs) not feasibility.

### 2.3 Existing scripts

`supabase/scripts/` contains exactly **one file**:

- `backfill_calendar_rates_from_applied_recs.sql` — a one-shot backfill SQL (per the file's header comment, run manually after a specific behavioral change to `pricing_performance`). Not a migration system; not staging-related.

There is no `migrate.sh`, no `apply-staging.sh`, no Makefile, no GitHub Action workflow, no `supabase/config.toml`. The codebase has no scripted migration path at all.

### 2.4 Current pattern for applying migrations to production

Based on three converging signals:

1. **`supabase_migrations.schema_migrations` table exists** (it's a Supabase-managed system table) **but contains 0 rows** in production. If Supabase CLI's `supabase db push` had ever been used to apply migrations, those rows would exist.
2. **No `supabase/config.toml`** — the project isn't linked to the CLI for migration management.
3. **CLAUDE.md "Development Workflow"** says: *"1. Make changes in ~/koast. 2. `npx tsc --noEmit 2>&1 | head -20`. 3. If clean: `git add -A && git commit -m "message" && git push`. 4. Vercel auto-builds (~30s)."* — describes code deployment but says nothing about migrations.
4. **Multiple migration files reference manual application** in their comments (e.g., `001_initial_schema.sql` says *"Run via Supabase SQL Editor or supabase db push"*).

**Conclusion**: production migrations are applied **manually via the Supabase Studio SQL Editor** (or equivalent direct `psql` execution), not through any CLI/CI flow. There is no recorded history of which migrations were applied when; reconstruction relies on filename timestamps + the absence of error reports.

This is consistent with the observed state of the production schema — the new tables and changes from each migration are present, but there's no metadata trail. It's also consistent with `~/.claude/skills/koast-development/references/playbooks.md` which has patterns for "BEGIN/ROLLBACK migration validation against prod" specifically because there's no staging.

### 2.5 Sub-conclusion §2

No CLI today; nothing prevents installing one. No scripted migration apply path; the team has been running migrations through the Studio SQL editor. Building staging requires (a) installing the CLI (or equivalent psql wrapper script), (b) establishing a tracked migration application pattern, (c) deciding whether to back-fill `supabase_migrations.schema_migrations` so production gets tracked alongside staging.

---

## 3. Existing migration history

### 3.1 Count and naming

**48 migration files** total in `supabase/migrations/`:

- 9 with the pre-timestamp naming convention (`001_*.sql` through `009_*.sql`) — initial schema, channex constraints, cleaning tokens, reviews, pricing outcomes, leads, ical, property details + templates, review dedup.
- 39 with the timestamp convention (`YYYYMMDDhhmmss_*.sql`) — every migration since 2026-03-29. Latest is `20260501040000_messages_actor_columns.sql` (the agent loop v1 actor-columns hygiene fix).

The four agent loop v1 Milestone 1 migrations (`20260501010000` through `20260501040000`) are present in the directory but **not yet applied** anywhere — the Milestone 1 rollout was paused before any DB writes per the baseline doc.

### 3.2 Tracking mechanism

**None used in production.** `supabase_migrations.schema_migrations` exists (the Supabase-managed system table) but is empty. Every migration applied to production was applied without writing a tracking row. The history is reconstructable only from:

- Filename timestamps in `supabase/migrations/`.
- Schema state — querying `information_schema` tells you which tables/columns/policies exist.
- Git history of the `supabase/migrations/` directory.

Staging needs a tracking mechanism to know "what's been applied here." Options:
- **Use the Supabase CLI** which writes to `supabase_migrations.schema_migrations` automatically.
- **Use a custom tracking table** (e.g., `koast_migration_history`) written by a `migrate.sh` script.
- **Skip tracking** and rely on the team applying migrations in lockstep — fragile, not recommended.

### 3.3 Replay safety

Scanned all 48 migrations for patterns that would prevent clean replay against an empty database:

| Pattern | Files affected | Replay-safe? |
|---|---|---|
| `INSERT INTO ... ON CONFLICT DO NOTHING` based on existing data | `20260413010000_free_tier_property_quota.sql` (grandfathers existing properties' users into 'business' tier) | **Safe**: against empty staging, the SELECT returns 0 rows, the INSERT is a no-op. |
| `INSERT INTO` for deploy markers | `20260417020000_channex_outbound_log.sql` (writes one row marking the start of outbound logging) | **Safe**: simple INSERT, runs cleanly. |
| `UPDATE` for back-population | `20260501040000_messages_actor_columns.sql` (back-pops actor_id/actor_kind on existing messages) | **Safe**: against empty staging, UPDATE matches 0 rows; the column defaults are set so new inserts going forward work correctly. |
| `INSERT INTO` for grandfathering RLS-policy-fix data | `20260408010000_fix_rls_policies.sql` | None — only CREATE POLICY statements; no data side effects. **Safe.** |
| Idempotency guards (`IF NOT EXISTS` / `IF EXISTS`) | 46 of 48 migrations | **Safe** to forward-replay; safe to re-replay too. |
| Missing idempotency guards | `002_channex_constraints.sql` (creates UNIQUE indexes without `IF NOT EXISTS`), `006_leads.sql` (creates tables without `IF NOT EXISTS`) | **Safe to forward-replay** on empty staging. **Not safe to re-replay** on a DB that already has the schema — rerunning would error. Mitigation: track applied state so re-replay never happens. |

**Specific dependencies that staging must satisfy** (not deal-breakers, just things to know):

| Dependency | Migration | What staging needs |
|---|---|---|
| `auth.users` schema (`auth` schema with the `users` table) | 001 + several others | Supabase auto-provisions this on a new project. ✅ available on Supabase tiers; would need stubbing on plain Postgres. |
| `extensions` schema (uuid extensions like `gen_random_uuid()`) | 001 + every migration that uses `gen_random_uuid()` | Supabase auto-enables on new projects. ✅ |
| `pg_net` extension + Supabase Vault secrets | `20260426060000_bookings_turnover_trigger_inert.sql` | Supabase Pro/Team tiers include `pg_net`; Free tier does not. **Vault secrets** (`{turnover_app_url, turnover_trigger_secret}`) need to be configured per-environment. ⚠️ tier-relevant. |
| `auth.uid()` function | Every RLS policy across the 48 migrations | Supabase auto-provides. ✅ on Supabase. Plain Postgres would need a stub. |

The `pg_net` + Vault dependency is the only tier-relevant signal: if the staging project is on Free tier, the `bookings_turnover_trigger_inert` migration will install the trigger but the `net.http_post` calls inside the function body will fail at runtime when (and if) the function is ever activated. Since the function is intentionally inert at the migration level, this doesn't break replay — it just means staging can't fully test the active state of that trigger without Pro tier. Acceptable for v1 staging; flag for the future.

### 3.4 Sub-conclusion §3

48 migrations. All replay-safe forward against an empty Supabase project. Two missing idempotency guards mean re-replay on a populated DB would fail — easily mitigated by tracking applied state. The `pg_net` + Vault dependency requires Pro tier for full fidelity but doesn't break Free-tier replay. Staging schema setup is mechanically straightforward: replay all 48 files in order against a fresh project.

---

## 4. Current environment variables

### 4.1 Inventory

`koast/.env.local` (Next.js + Vercel):

```
NEXT_PUBLIC_SUPABASE_URL              ← public Supabase URL (browser-side)
NEXT_PUBLIC_SUPABASE_ANON_KEY         ← anon key (browser-side)
SUPABASE_SERVICE_ROLE_KEY             ← service-role key (server-side)
DATABASE_URL                          ← direct Postgres URL (Drizzle, server queries)
DATABASE_URL_POOLED                   ← pooled Postgres URL (Vercel serverless)
CHANNEX_API_URL, CHANNEX_API_KEY      ← Channex
AIRROI_BASE_URL, AIRROI_API_KEY       ← market data
ANTHROPIC_API_KEY                     ← Claude
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
TICKETMASTER_API_KEY
NEXT_PUBLIC_APP_URL
```

`koast-workers/.env` (Python workers on the Virginia VPS):

```
SUPABASE_URL                          ← Supabase URL (workers use direct Postgres mostly, this for the `supabase` Python client)
SUPABASE_SERVICE_ROLE_KEY             ← service-role key
CHANNEX_API_URL, CHANNEX_API_KEY      ← Channex
AIRROI_API_KEY                        ← market data
KOAST_API_URL                         ← back-call URL into the Next.js app
DATABASE_URL                          ← direct Postgres URL (psycopg2 in db.py + others)
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
```

### 4.2 DB-related env vars used by the codebase

Single source of truth across both .env files: **`DATABASE_URL`**. Plus `NEXT_PUBLIC_SUPABASE_URL` + the two key vars for the Supabase JS client.

Source-tree references:

```
$ grep -rn "DATABASE_URL\|wxxpbgbfebpkvsxhpphb" src/
→ 2 references (both `process.env.DATABASE_URL` in drizzle.config.ts and src/lib/db/pooled.ts)

$ grep -rn "wxxpbgbfebpkvsxhpphb" src/ supabase/migrations/ koast-workers/
→ ZERO hardcoded host references
```

`drizzle.config.ts` simply reads `process.env.DATABASE_URL!` with no environment-discrimination logic. Worker scripts (`db.py`, `pricing_validator.py`, `pricing_performance_reconciler.py`) all read `DATABASE_URL` from `os.environ`. The codebase is **uniform**: one env var name, one reading pattern, no hardcoded hosts. Switching environments is a matter of pointing `DATABASE_URL` at a different DB.

### 4.3 Cleanest staging coexistence pattern

Three viable patterns:

**Pattern A — Single .env per environment, swap by file** (matches Vercel's "Production / Preview / Development" environment slots):

```
koast/.env.local           ← always-present, treated as production
koast/.env.staging         ← gitignored alternative; rename / symlink to .env.local for staging work
koast/.env.local.example   ← already exists; document the staging slot here
```

Vercel UI lets you set per-environment values for the same variable name. Locally, the engineer chooses which file is `.env.local` at any moment. The application code stays untouched (still reads `process.env.DATABASE_URL`). **Pros**: zero application-code changes; fits the existing pattern; matches Vercel's deployment model. **Cons**: easy to forget which env file is active locally; staging accidentally points at production if someone forgets to swap.

**Pattern B — Dual env vars, environment-aware code**:

```
DATABASE_URL                     ← treated as the "active" environment
DATABASE_URL_PRODUCTION          ← always points at production
DATABASE_URL_STAGING             ← always points at staging
KOAST_ENV=production|staging     ← chooses which to use at runtime
```

The application reads `KOAST_ENV` and selects the appropriate URL. **Pros**: both URLs present simultaneously, clear which is which. **Cons**: every code path that reads DATABASE_URL needs updating; risk of a code path missing the discrimination and pointing at the wrong DB; ergonomics worse for Vercel (fights the UI's per-environment value model).

**Pattern C — Fully separate workspaces**:

A separate clone of the repo, with its own .env.local pointing at staging. The engineer `cd`s between them. **Pros**: simplest mental model. **Cons**: doubles disk; doesn't help workers on the VPS (which have one .env file).

**Recommendation among these three**: **Pattern A**. Matches the existing architecture (every component reads one env var), matches Vercel's deployment model, requires zero application code changes. Document in `koast/.env.local.example` and `koast-workers/.env.example` what the staging URL slot is and how to swap.

### 4.4 Worker hardcoding check

Workers read `DATABASE_URL` and `SUPABASE_URL` from environment. No hardcoded URLs anywhere (`grep -rn wxxpbgbfebpkvsxhpphb koast-workers/` returns zero). The VPS has a single `koast-workers/.env` file; for staging-mode worker runs, the engineer points that file at staging temporarily, runs the worker manually, then points it back at production. Acceptable for v1; if the team wants concurrent prod + staging worker runs, that's a separate question (likely solved by running staging workers from a different host or container).

### 4.5 Sub-conclusion §4

The codebase's env-var architecture is staging-friendly: uniform use of `DATABASE_URL`, no hardcoded hosts. Staging coexistence is best handled at the env-file layer (Pattern A above), not via application code changes. Vercel's per-environment values + a documented `.env.staging` template gets the team a clean staging story with no code touched.

---

## 5. Supabase staging options

### 5a. Supabase Branch Databases (Pro tier feature)

**Availability**: Supabase Pro tier ($25/mo per project) and above includes "Database Branches." Free tier does not. The team needs to confirm tier first (per §1.2).

**How it works**:
- Each branch is a copy of the main project's schema in a separate logical database.
- Migrations applied to a branch are tested in isolation. When ready, the migrations are merged to main via a merge request flow.
- Each branch gets its own connection string (`DATABASE_URL` for that branch).
- Optional: copy production data into the branch on creation, or start empty.
- Auto-cleanup: branches can be configured to TTL after N days.

**Migration deployment pattern with branches**:
1. Create a branch named e.g. `staging-agent-loop-m1`.
2. Apply the four Milestone 1 migrations against the branch.
3. Run the test plan's verification queries against the branch's `DATABASE_URL`.
4. If clean, merge the branch to main — Supabase replays the migrations against production.
5. If broken, drop the branch and try again.

**Cost**: $0.32/hour per active branch on Pro tier. A short-lived branch (a few hours of testing) costs cents. A persistent staging branch (always-on) costs ~$230/month, which is significant. Best used as ephemeral per-feature branches.

**Migration tracking**: `supabase_migrations.schema_migrations` is automatically populated by branch operations. Solves the §3.2 tracking gap.

**Pros**:
- Cleanest possible — schema sync is automatic, branches are first-class Supabase concepts, the merge flow is the deployment discipline (covers §7 too).
- Includes `pg_net`, Vault, RLS, auth.users — full feature parity with production.
- Auto-cleanup means staging doesn't drift from production.

**Cons**:
- Pro tier dependency. If Koast is on Free, this requires upgrading first (minimum ~$25/mo for the project plus per-branch compute).
- Learning curve: the branching workflow is new to the team.
- Persistent staging branches are expensive (~$230/mo); ephemeral-per-feature is the cost-reasonable usage pattern.

### 5b. Separate Supabase project (any tier)

**Availability**: works on any tier. Most staging-friendly approach.

**Setup**:
1. Create a new Supabase project (Free tier is sufficient for staging at Koast's scale: 18MB prod DB ≪ 500MB Free cap).
2. Replay all 48 prior migrations in order via psql or the Studio SQL Editor.
3. Apply the four new Milestone 1 migrations via the same path.
4. Run verification queries.
5. Generate `STAGING_DATABASE_URL` / `STAGING_SUPABASE_URL` / `STAGING_SUPABASE_ANON_KEY` / `STAGING_SUPABASE_SERVICE_ROLE_KEY` env values.
6. Document the staging project ref in `~/koast/docs/architecture/staging-environment.md`.

**Schema replication**:
- **Replay migrations** (recommended for v1): run all 48 migration files in order against the new project. Reproducible, easy to re-create. ~10-30 minutes of one-time SQL execution.
- **pg_dump | pg_restore** (alternative): dump production schema-only, restore to staging. Faster but creates a one-time snapshot that diverges from the migrations directory; harder to keep in sync.

Replay is cleaner because the migrations directory is the source of truth.

**Env routing**: per Pattern A in §4.3 — production has `DATABASE_URL=<prod>`, staging has `DATABASE_URL=<staging>`, application code unchanged.

**Cost**:
- Free tier: $0/mo. 500 MB DB / 50K MAU / 5 GB egress / 1 GB storage.
- Pro tier: $25/mo per project. Use only if testing pg_net / Vault dependencies matters at staging time.

**Migration tracking**: needs to be built — a `migrate.sh` script that records applied migrations in a custom table (e.g., `koast_migration_history`) or activates the `supabase_migrations.schema_migrations` table by switching to CLI-driven migration apply.

**Pros**:
- Works on Free tier ($0) for the foreseeable future given Koast's scale.
- Full project isolation — staging mistakes can't touch production.
- Same auth.users / RLS / pg_net (on Pro) / Vault (on Pro) / storage / edge functions architecture as production.
- Mechanically simple; no Pro-tier dependency unless you want pg_net testing.

**Cons**:
- More manual setup than branches: 48 migrations to replay (a one-time hit).
- Drift potential: if a migration is applied to production without being applied to staging (or vice versa), the two diverge. Mitigated by `migrate.sh` discipline (see §7).
- pg_net + Vault require Pro on the staging project for full fidelity; on Free, the inert turnover trigger migration applies but the function body's `net.http_post` calls would fail if executed.

### 5c. External managed Postgres (Neon, Railway, Render, etc.)

**Availability**: any of these. Neon has the closest fit for Postgres-only staging.

**Tradeoffs vs Supabase-on-Supabase**:
- ❌ No `auth.users` schema → RLS policies referencing `auth.uid()` would fail unless we install a stub function.
- ❌ No `pg_net` extension → `bookings_turnover_trigger_inert` migration would partially fail (the function body references `net.http_post` which wouldn't exist).
- ❌ No Supabase Storage / Edge Functions / realtime → can't test those layers at staging.
- ❌ No `supabase_migrations.schema_migrations` integration → custom tracking required.
- ✅ Cheaper on the absolute floor (Neon free tier).
- ✅ Branching support on Neon (similar to 5a but without Supabase coupling).

**Likely cost**: Neon Free is $0/mo for the scale we'd use. Railway/Render are similar.

**Pros**:
- Cheapest absolute path.
- Neon's branching is mature and free-tier-available.

**Cons**:
- Doesn't include Supabase auth or Supabase-specific extensions. Staging would be **DB-only** and might not test the full stack — RLS policy correctness is a meaningful chunk of what staging needs to verify, and `auth.uid()` makes RLS RLS.
- Stubbing `auth.uid()` is possible (`CREATE FUNCTION auth.uid() RETURNS uuid AS 'SELECT current_setting(''request.jwt.claims'', true)::json->>''sub'';' LANGUAGE sql;`) but the behavior diverges subtly from real Supabase, and tests passing on the stub may not pass on production.

**Recommendation against**: not worth the integration loss for staging that needs to verify RLS-policy-affecting work. Supabase-on-Supabase preserves the architectural identity.

### 5d. Local Postgres for ad-hoc verification only

**Availability**: any developer machine.

**When useful**:
- Fast iteration on a migration's SQL syntax.
- Running BEGIN/ROLLBACK validation (per the existing playbooks pattern) without consuming Supabase resources.
- Schema-only structural checks (does the migration create the right indexes, etc.).

**When insufficient**:
- RLS testing requires real Supabase auth context. `SET request.jwt.claims` works approximately but doesn't replicate Supabase's full auth integration.
- Integration tests that depend on `auth.users` triggers, Supabase service-role keys, edge functions, etc.
- End-to-end agent-loop testing once that exists — it'll need a real Supabase project.

**As a complement to staging, not a replacement**: useful for the initial syntax pass on a migration before pushing to staging. Already captured in playbooks.md's "BEGIN/ROLLBACK migration validation against prod" pattern.

### 5e. Comparison table

| Path | Tier required | Setup time | Monthly cost | Auth fidelity | pg_net | Production parity | Verdict |
|---|---|---|---|---|---|---|---|
| 5a Branch DBs | Pro+ ($25/mo+) | Minutes | $0.32/hr per active branch (~$230 always-on) | ✅ | ✅ | Highest | Best if already on Pro |
| 5b Separate project (Free) | Any | ~30 min one-time replay | $0 | ✅ | ❌ | High | **Best for v1 if on Free** |
| 5b Separate project (Pro) | Pro+ | ~30 min one-time replay | $25/mo | ✅ | ✅ | Highest | Best if Pro is OK and branches are too ephemeral |
| 5c External (Neon etc.) | Any | ~1 hr setup + stubs | $0 | ❌ stub | ❌ | Low | Not recommended |
| 5d Local Postgres | n/a | Minutes | $0 | ❌ stub | ❌ | Lowest | Complement only |

### 5f. Sub-conclusion §5

The architecture decision splits along the Pro-vs-Free question. If on Pro: branches (5a) are cleanest. If on Free: a separate Supabase project (5b) is the right path; pg_net fidelity is the only meaningful gap and it's tolerable since the affected migration is intentionally inert today. External Postgres (5c) and local-only (5d) are not staging replacements — local-only is a complement.

---

## 6. Data strategy options

### 6a. Empty staging (schema only)

**Sufficient for**:
- B-series CHECK-constraint rejection tests (per the test plan).
- Schema syntax verification (does the migration apply cleanly).
- RLS structure (does the policy exist; does the table have RLS enabled).
- Trigger installation (does the trigger fire on the right event).

**Insufficient for**:
- C-series back-population verification (the back-pop UPDATEs target existing rows; on empty staging they match 0 rows, which doesn't validate the logic).
- End-to-end agent loop testing once that exists (no conversations to retrieve, no memory to recall).

**Implementation**: trivial. Apply migrations against fresh project, done.

### 6b. Synthetic seed (a few rows of mock data)

**Sufficient for**:
- Most verification work, including the C-series back-pop tests.
- End-to-end agent loop testing with fake data.
- RLS round-trip tests (insert as user A, verify user B can't see).
- FK constraint tests.

**Insufficient for**:
- Testing migrations against real-shaped production data (e.g., the messaging_executor detection heuristic fires on `ai_draft IS NOT NULL AND content = ai_draft` — synthetic data either matches that condition or doesn't, but won't reflect the actual production distribution).
- Edge cases the team hasn't anticipated.

**Implementation pattern**:
- A `supabase/seed-staging.sql` file with INSERT statements producing a small fixture: 2 mock auth.users, 2 properties, 4 listings, ~10 mock bookings, ~20 mock messages with sender='guest'/'property' distribution, ~5 cleaning_tasks, etc.
- A small Python or Node script that calls `supabase.auth.admin.createUser` for the auth.users (auth tables aren't directly INSERT-friendly; the admin API creates users with the right shape).
- Run once after migrations apply.

**Maintenance**: low. The seed is short, lives in the repo, evolves alongside the schema.

### 6c. Production-data subset (sanitized clone)

**Sufficient for**:
- Testing migrations against real shapes — catches data-edge-case bugs (e.g., a UNIQUE constraint that's fine on synthetic data but fails on production's denormalized rows from years past).
- Realistic end-to-end agent loop testing.

**Concerns**:
- **Privacy**: messages.content contains guest PII (names, occasionally phone numbers, occasional payment details guests typed despite OTA filters). bookings.guest_email / guest_phone / guest_name are PII. Shipping a full clone to a less-secure staging environment is a privacy risk.
- **Compliance**: depends on Koast's data-handling commitments. CAN-SPAM, GDPR if any EU guests, basic confidentiality.
- **Drift**: production grows over time; a one-time clone diverges; refresh cadence is its own discipline.

**Sanitization approach**: Drop or hash PII columns. A reusable script:

```sql
-- After cloning, run in the staging DB:
UPDATE messages SET content = '[redacted-' || id::text || ']';
UPDATE bookings SET guest_name = 'Test Guest ' || id::text,
                    guest_email = 'guest-' || id::text || '@example.com',
                    guest_phone = NULL;
UPDATE guest_reviews SET incoming_text = '[redacted]', private_feedback = NULL;
-- etc.
```

**Verdict**: useful at scale or once Koast has 50+ properties; **overkill for the current 2-property single-host fleet**. Defer until production data shape becomes the load-bearing thing staging needs to validate.

### 6d. Production-data full clone (sanitized)

**Sufficient for**: maximum confidence — staging looks exactly like production sans PII.

**Concerns**:
- All of 6c's concerns plus storage cost on the staging tier (the production DB is 18 MB today; trivial. But this scales.)
- Refresh cadence: weekly clone? Monthly? Each refresh is an operational task.

**Verdict**: more than v1 needs; revisit when production scale grows.

### 6e. Sub-conclusion §6

For the agent loop v1 work and through Phase 1 of the Method-in-Code map, **6b synthetic seed** is the right choice. It's enough to verify the B + C + D + E + F + G test-plan sections (constraint rejection, back-pop, RLS round-trip, FK enforcement, trigger behavior, type-check), it's privacy-safe, and it's cheap. Move to 6c when production data shape becomes load-bearing for verification (likely Phase 3 substrate expansion or when external hosts join the test fleet).

---

## 7. Deployment discipline options

### 7a. Manual two-step

**Pattern**: engineer runs `psql "$STAGING_DATABASE_URL" -f migration.sql`, runs verification queries by hand, then runs `psql "$DATABASE_URL" -f migration.sql` against production.

**Pros**:
- No CI/CD investment; ships immediately.
- Maximum flexibility — engineer can interleave verification however they want.

**Cons**:
- Discipline depends entirely on the engineer remembering to run staging first.
- No record of what was applied where unless logged manually.
- Easy to silently swap "staging" and "production" in a tired moment.

**Setup effort**: zero (this is what's happening today already, just without the staging step).

### 7b. Script-based

**Pattern**: a `scripts/apply-migration.sh` that takes an environment flag, applies a single migration, runs a small verification suite against the schema, records the applied migration in a tracking table, and exits non-zero on any failure.

```bash
#!/usr/bin/env bash
# scripts/apply-migration.sh staging path/to/migration.sql
set -euo pipefail
ENV="$1"; FILE="$2"
URL_VAR="DATABASE_URL_$(echo $ENV | tr a-z A-Z)"  # DATABASE_URL_STAGING or DATABASE_URL_PRODUCTION
URL="${!URL_VAR}"
# ... apply migration in a transaction, run verification, write to koast_migration_history, etc.
```

The team's discipline is "run this script, check exit code, run the test plan, repeat for production."

**Pros**:
- Automation reduces footgun risk (env discrimination is in the script, not in the engineer's head).
- Tracking table gives history.
- Verification is bundled with apply.
- Still manual trigger; no CI/CD complexity.

**Cons**:
- Someone has to write the script and maintain it.
- The team has to actually use it (vs falling back to direct psql).

**Setup effort**: 4-8 hours one-time for a working v1 script with tracking + verification harness. Test plan queries from §B-F can be parameterized.

### 7c. GitHub Actions or similar CI/CD

**Pattern**: pushing a new migration file to a feature branch triggers a workflow that:
1. Applies the migration to staging.
2. Runs the full test plan.
3. Posts results as a PR comment.
4. After PR merge to main, applies to production with a separate workflow gated on manual approval.

**Pros**:
- Most automation; least engineer-cognitive-load per migration.
- Records of every apply attempt with timestamps.
- Multi-engineer-safe (the workflow is the source of truth).

**Cons**:
- More setup: GitHub repo secrets for staging + production DB URLs, deployment-key management, action runner permissions.
- New failure mode: the workflow itself can break and block the team.
- Overkill for solo-founder cadence.

**Setup effort**: 1-2 days one-time including secrets configuration, workflow YAML, runner debugging.

### 7d. Sub-conclusion §7

The team is currently at 7a (manual, no staging) and the Milestone 1 pause surfaced that this isn't enough. Moving to **7b (script-based)** is the right next step: the cost is small, the safety improvement is meaningful, and the script can evolve into 7c later if the team grows. Skip 7c at v1 — the operational cost of CI/CD outweighs the safety gain at solo-founder cadence.

---

## 8. Recommendation (non-binding)

The team makes the actual call. This is one read on the cleanest path.

### 8.1 Architecture: 5b (separate Supabase project, Free tier)

**Why**:
- Production scale (18 MB / 1,400 rows) is far below Free-tier limits for the foreseeable future. A staging Free-tier project is also small and stays well under limits.
- Full Supabase parity (auth.users, RLS, storage, realtime) preserves the production architecture; staging tests what production runs.
- Free tier is $0; no upgrade decision needed today.
- The pg_net + Vault gap (the one Free-tier limitation) affects exactly one currently-inert trigger; tolerable until that trigger needs activation testing.
- Branches (5a) are cleaner if the team is already on Pro, but committing to Pro just to enable branches is a $25/mo+ decision worth pausing on. If tier is already Pro, recommend revisiting 5a as the higher-fidelity path.

**Setup work**:
- Create a new Supabase project from the dashboard (~5 min).
- Replay all 48 migrations against the new project (~30 min — can be a single psql run if a small wrapper script is written first).
- Generate staging keys + connection strings, document in `~/koast/.env.staging.example` and `~/koast-workers/.env.staging.example`.

**Estimated effort**: ~2-3 hours one-time including project creation, migration replay, env-var documentation. Single session.

### 8.2 Data strategy: 6b (synthetic seed)

**Why**:
- Sufficient for the verification work the agent loop v1 needs and for everything through Phase 1 of the Method-in-Code map.
- Privacy-safe (no production PII).
- Cheap to maintain (a small `seed-staging.sql` that lives in the repo).
- Realistic enough to drive the back-population verification (C1-C4 in the test plan needs SOME mock messages with sender='property' and 'guest' to verify the actor_id / actor_kind back-pop).

**Setup work**:
- Write `supabase/seed-staging.sql` (or `.ts` for parts that need the auth admin API).
- Create at least: 2 mock auth.users, 2 mock properties, 4 listings, ~12 mock messages (5 sender='property' / 7 sender='guest'), 2 bookings, 2 cleaners.
- Add an "apply seed" step to the rollout flow.

**Estimated effort**: ~2 hours one-time. The seed is small and the schema is well-known.

**When to graduate to 6c**: when production reaches ~10+ active hosts and the data-shape distribution starts mattering for verification. Currently far away.

### 8.3 Deployment discipline: 7b (script-based)

**Why**:
- Bigger safety improvement than 7a for modest setup cost.
- Records what's applied where (closes the §3.2 tracking gap).
- Verification harness can re-use the test plan's queries (no new test material to write).
- 7c (GitHub Actions) is overkill at solo-founder cadence; revisit when the team is 2+ engineers.

**Setup work**:
- Write `scripts/apply-migration.sh` (Bash, ~50-100 lines): takes env name + migration path, applies in a transaction with `BEGIN; ... ROLLBACK;` for dry-run mode, records to a tracking table on success.
- Write `scripts/run-test-plan.sh`: runs the test plan's verification queries against a target environment, exits non-zero on any failure.
- Add `koast_migration_history` table (a small migration of its own — the bootstrap one).

**Estimated effort**: ~4-6 hours including script development, the bootstrap migration, and a manual end-to-end test against staging.

### 8.4 Total estimated effort

Pulling these together: **~8-12 hours of focused work** across two sessions:

- **Session 1** (~3-4 hours): Create the staging Supabase project. Replay migrations. Generate keys. Document env-var pattern. Verify staging schema matches production by spot-checking a few `information_schema` queries.
- **Session 2** (~4-6 hours): Write the seed file. Write the apply-migration script. Write the run-test-plan script. Apply the seed. End-to-end test the full pipeline by re-running the agent loop v1 Milestone 1 against staging (Phase 2 of that rollout).

After Session 2, the staging environment is real and the agent loop v1 Milestone 1 rollout can resume from Phase 2 against the new staging URL, with Phase 3 against production following Phase 2 sign-off.

### 8.5 What this recommendation does NOT cover (separate decisions)

- Whether to retroactively populate `supabase_migrations.schema_migrations` on production (or `koast_migration_history` if we go custom) so production gets tracked alongside staging. Recommend: yes, in Session 2, as a one-time bootstrap.
- Whether to upgrade production to Pro tier for pg_net testing on staging at full fidelity. Recommend: defer unless the BDC-clobber-incident response or another safeguard pattern starts depending on `pg_net` end-to-end testing.
- Whether to use Supabase's branch feature on top of the separate project (i.e., production = main project, staging = branch project, staging branches = ephemeral branches of staging). Recommend: defer until the team's migration cadence is high enough that branches save real time.
- Multi-region staging (US-east production + US-east staging assumed). Verify region from dashboard; if production is in a non-US region, match staging to it for latency parity.

### 8.6 Closing

The staging gap is solvable in two focused sessions. The path that fits Koast's current scale, tier ambiguity, and solo-founder cadence is: **5b (separate Free-tier Supabase project) + 6b (synthetic seed) + 7b (script-based apply)**. The architectural identity stays Supabase-shaped, the tier decision can be deferred, and the team gets a real staging story before any of the remaining Phase 1 milestones (memory retrieval handler, action substrate, agent loop request handler, SSE, frontend chat, artifact registry, write commit) need it.

When staging is established, the agent loop v1 Milestone 1 rollout resumes from Phase 2 — migrations, test plan, and Drizzle declarations remain locked-and-ready and unchanged.
