# Agent Loop v1 — Milestone 1 Rollout Report

## STATUS: COMPLETE (2026-05-02)

Milestone 1 schema migrations applied to production, back-population verified clean, both environments aligned. The agent loop v1 foundation schema is in production. Milestone 2 (memory handlers + action substrate) is the next foundation work.

This file replaces the prior PAUSED stub. Cross-references:
- Baseline (Phase 1 work that paused): [`agent-loop-v1-milestone-1-baseline.md`](./agent-loop-v1-milestone-1-baseline.md)
- Test plan: [`agent-loop-v1-milestone-1-test-plan.md`](./agent-loop-v1-milestone-1-test-plan.md)
- Staging verification (Phase 2 detail): [`agent-loop-v1-milestone-1-staging-verification.md`](./agent-loop-v1-milestone-1-staging-verification.md)
- Design doc: [`agent-loop-v1-design.md`](./agent-loop-v1-design.md)
- Staging arc closure: [`staging-setup-session-3-report.md`](./staging-setup-session-3-report.md)

---

## Phase outcomes

### Phase 1 — Pre-flight verification (CLEAN)

Both environments verified before any rollout work:

**Staging** (`aljowaggoulsswtxdtmf`):
- All 6 agent loop tables present with RLS enabled
- `messages.actor_id` + `messages.actor_kind` columns present (both nullable, no default)
- `memory_facts.sub_entity_type` CHECK constraint with the 6 canonical values
- All 4 Milestone 1 migrations in `koast_migration_history` with real apply timestamps from Session 2's full replay (`applied_by = 'session-2-replay'`)

**Production** (`wxxpbgbfebpkvsxhpphb`):
- Zero agent loop tables exist (verified absent: 6 tables not in pg_tables)
- Zero `actor_*` columns on messages (verified absent in information_schema.columns)
- 4 `koast_migration_history` rows with bootstrap timestamps from Session 2 (`applied_by = 'session-2-bootstrap'`)
- Baseline counts unchanged: 90 messages (53 property + 37 guest), 0 system, 0 ai_draft, 2 properties, 90 bookings — exactly matching the §A1 baseline

All preconditions met. Phase 1 ✓.

### Phase 2 — Test plan execution against staging (CLEAN, 35/35)

All 35 verification queries from `agent-loop-v1-milestone-1-test-plan.md` §B-G passed against staging. Detailed results in `agent-loop-v1-milestone-1-staging-verification.md`. Summary:

| Section | Tests | Result |
|---|---|---|
| B2 Column shapes | 6 tables × column counts | ✓ all match |
| B3 CHECK constraints | 14 expected | ✓ all present, all correct |
| B4 Indexes | 21 idx_* indexes | ✓ all present |
| B5 RLS enabled | 6 tables | ✓ all rowsecurity=true |
| B6 RLS policies | 6 policies (5 ALL, 1 SELECT-only) | ✓ all match |
| B7 updated_at triggers | 4 tables | ✓ all present |
| B8 Smoke insert | service-role memory_facts insert | ✓ |
| B9 CHECK rejection | 8 sub-tests | ✓ all reject as expected |
| C1-C3 Existing-data | counts vacuous on empty staging | ✓ |
| D1-D5 RLS round-trip | 6 sub-tests with transactional GRANT workaround | ✓ |
| E1-E3, E5 FK constraints | 4 tests | ✓ all reject/cascade correctly |
| F1-F2 Triggers | 2 tests (verified across separate transactions for F1) | ✓ |
| G1 TypeScript type-check | `npx tsc --noEmit` | ✓ exit 0 |

**One drift item discovered out-of-scope** (DRIFT-3): staging is missing the production-level role grants (anon/authenticated/service_role lack USAGE on public schema and table-level grants). The Phase 2 RLS testing worked around it via transactional GRANTs that were reverted by ROLLBACK. Documented in the staging verification report and `staging-environment.md` for a future session.

### Phase 3 — Production rollout (CLEAN, 4/4 with verification gates)

#### Pre-apply: A4 rollback snapshot

```sql
CREATE TABLE messages_pre_milestone1_snapshot AS SELECT * FROM messages;
```

Captured 90 rows. Per test plan §A4, this snapshot is retained for ≥7 days of production observation, then dropped. **Open carry-forward**: schedule a `DROP TABLE messages_pre_milestone1_snapshot;` for ≥2026-05-09.

#### Pre-apply migration-4 dry-run

The back-population heuristic counts on production, computed BEFORE applying any migration:

| Heuristic | Expected | Actual | Match |
|---|---:|---:|---|
| `sender='property' AND (ai_draft IS NULL OR content != ai_draft)` → would_be_host | ~53 | **53** | ✓ |
| `sender='property' AND ai_draft IS NOT NULL AND content = ai_draft` → would_be_agent | 0 | **0** | ✓ |
| `sender='guest'` → would_be_null | 37 | **37** | ✓ |
| `sender NOT IN ('guest','property')` → would_be_other | 0 | **0** | ✓ |
| Total | 90 | **90** | ✓ |
| `messages.property_id` joinable to `properties.user_id` for sender='property' | 53/53 | **53/53** | ✓ |

All four counts matched exactly. Heuristic was safe to apply.

#### Per-migration application

| # | Migration | Apply time | Real timestamp | Verification |
|---|---|---:|---|---|
| 1 | `20260501010000_guests_and_memory_facts.sql` | 0.50s | 2026-05-02T05:29:59+00:00 | 2 tables, 7 indexes, 5 CHECK, 2 triggers, RLS on both ✓ |
| 2 | `20260501020000_agent_loop_tables.sql` | 2.00s | 2026-05-02T05:30:15+00:00 | 3 tables, 6 idx_* + 1 unique-constraint index, 3 CHECK, 2 triggers, RLS on all ✓ |
| 3 | `20260501030000_agent_audit_log.sql` | 0.50s | 2026-05-02T05:30:37+00:00 | 1 table, 4 idx_* indexes, 5 CHECK, 1 SELECT-only policy, RLS on ✓ |
| 4 | `20260501040000_messages_actor_columns.sql` | 1.03s | 2026-05-02T05:30:57+00:00 | 2 columns added, 2 indexes, 4 UPDATE statements: 53 actor_id sets, 53 actor_kind='host' sets, 0 agent (correct), 0 system (correct) ✓ |

Total apply time: ~4 seconds across all 4 migrations.

#### Post-apply distribution (the load-bearing verification)

```
   actor_kind |  sender  | direction | count
  ------------+----------+-----------+-------
   host       | property | outbound  |    53
   <NULL>     | guest    | inbound   |    37
                                       ━━━━━━
   total                                  90
```

Sub-checks:
- `outbound_with_actor_id = 53`, `outbound_without_actor_id = 0` ✓
- `actor_id == properties.user_id` for all 53 outbound rows: 53 matches, 0 mismatches ✓
- Inbound rows: 37 with `actor_id IS NULL AND actor_kind IS NULL` (clean), 0 dirty ✓
- Spot-check of 5 most-recent rows: outbound = host + actor_id set; inbound = NULL/NULL ✓

Distribution exactly matches the test plan's §C3 expected. **No anomalies.**

### Phase 4 — Update production migration history (CLEAN)

Updated 4 rows in `koast_migration_history`:

```sql
UPDATE koast_migration_history
   SET applied_at = <real timestamp from Phase 3>,
       applied_by = 'session-4-milestone-1-rollout',
       notes      = 'Real production apply during Milestone 1 resumption. Replaces bootstrap timestamp from Session 2.'
 WHERE migration_name IN (
   '20260501010000_guests_and_memory_facts.sql',
   '20260501020000_agent_loop_tables.sql',
   '20260501030000_agent_audit_log.sql',
   '20260501040000_messages_actor_columns.sql'
 );
```

Result: 4 rows updated. Each now carries the actual apply timestamp from Phase 3.

### Phase 5 — Final state verification (CLEAN, both environments aligned)

**Production:**
- 6 agent loop tables, 0 rows each (no application traffic yet)
- `messages.actor_id` (uuid, nullable) + `messages.actor_kind` (text, nullable) present
- 53 messages with `actor_kind='host'` + actor_id matching properties.user_id; 37 with both columns NULL
- 51 rows in `koast_migration_history` (50 from prior + 1 new for Session 3's RLS recovery is already counted)
- 43 public-schema tables (36 prior + 6 agent loop + 1 messages_pre_milestone1_snapshot)

**Staging:**
- 6 agent loop tables, 0 rows each (synthetic seed deferred)
- Same `messages.actor_*` columns, no rows (staging messages is empty)
- 51 rows in `koast_migration_history` with real apply timestamps from Session 2's full replay

**Cross-environment:**
- `koast_migration_history` migration_name set diff: empty (51 identical names)
- Milestone 1 migration applied_by values:
  - Staging: `session-2-replay` with timestamps `04:19:55-58`
  - Production: `session-4-milestone-1-rollout` with timestamps `05:29:59-30:57`

The applied_by + applied_at fields differ correctly per environment (staging applied via Session 2 replay; production applied this session). The migration_name set is identical, which is what the discipline requires.

---

## State after this session

- ✅ Foundation schema for agent loop v1 in production
- ✅ Back-population produced exactly the expected actor_kind / actor_id distribution (53 host / 37 NULL guest / 0 agent / 0 system)
- ✅ All 35 staging verification queries passed
- ✅ Both environments aligned via `koast_migration_history`
- ✅ A4 snapshot table preserved for rollback safety (≥7-day observation window)

**Files unchanged this session** (locked, applied):
- `supabase/migrations/20260501010000_guests_and_memory_facts.sql`
- `supabase/migrations/20260501020000_agent_loop_tables.sql`
- `supabase/migrations/20260501030000_agent_audit_log.sql`
- `supabase/migrations/20260501040000_messages_actor_columns.sql`
- `src/lib/db/schema.ts`

**Files added this session**:
- `docs/architecture/agent-loop-v1-milestone-1-staging-verification.md`
- `docs/architecture/agent-loop-v1-milestone-1-rollout-report.md` (this file — replaces the PAUSED stub)

---

## Open carry-forwards

1. **Drop messages_pre_milestone1_snapshot** — scheduled for ≥2026-05-09 after a 7-day observation window. Quick: `DROP TABLE messages_pre_milestone1_snapshot;` from production. Add to a CronCreate or schedule reminder.

2. **DRIFT-3: staging missing Supabase role grants** — anon/authenticated/service_role need USAGE on public + table-level grants. Production has these via platform provisioning; staging was bootstrapped via DROP SCHEMA + replay so the grants didn't carry. Out of scope this session; suggested filename for the recovery migration: `20260502100000_recovery_supabase_role_grants.sql`. Documented in `agent-loop-v1-milestone-1-staging-verification.md` and `staging-environment.md`.

3. **Outcome capture wiring for the executor** — when the messaging executor begins firing in production (Milestone 2+), the back-population's `actor_kind='agent'` heuristic (`ai_draft IS NOT NULL AND content = ai_draft`) needs to be replicated in the executor's INSERT path so new rows get correctly attributed at write-time, not via post-hoc back-population. Per migration 4's inline comments.

4. **Milestone 2 — memory handlers + action substrate** — the next foundation work. Per the Method-in-Code plan: memory retrieval handler (read-side query layer over `memory_facts` with provenance/confidence aggregation) + memory write helper (write-side that constructs the JSONB provenance from a current conversation/turn) + action substrate (the `agent_artifacts` consumer that turns artifacts into real side-effects via the `agent_audit_log` write path).

---

## Sign-off

- [x] Phase 1 pre-flight (staging + production verified clean)
- [x] Phase 2 staging verification (35/35 queries pass)
- [x] A4 rollback snapshot captured (90 rows in messages_pre_milestone1_snapshot)
- [x] Pre-apply migration-4 dry-run (heuristic counts match expected exactly)
- [x] Phase 3 production rollout (4/4 migrations clean with verification gates)
- [x] Phase 4 production migration_history updated (4 rows, real timestamps)
- [x] Phase 5 cross-environment final state verification (51 identical migration_names; both environments aligned)
- [x] Migration files unchanged from prior session
- [x] No production changes outside the 4 Milestone 1 migrations + A4 snapshot + 4 history updates

After this session: agent loop v1 Milestone 1 is formally complete. Foundation schema is in production. Milestone 2 work can begin from the design doc's §6-§8 (memory retrieval handler, memory write helper, action substrate).
