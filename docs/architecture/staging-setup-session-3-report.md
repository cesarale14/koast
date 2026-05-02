# Staging Setup Session 3 — Report

*Executed 2026-05-02. This session closes the final RLS-state drift item carried over from Session 2 (D5 follow-up) and codifies the going-forward discipline that prevents recurrence. After this session, staging and production have identical RLS coverage on every public-schema table they share, and the staging setup arc is formally closed.*

Cross-references:
- `staging-setup-session-2-report.md` — the prior session that flagged D5 as an open carry-forward
- `production-schema-drift-audit.md` — the original drift audit (D5 finding section)
- `staging-environment.md` — the team's reference for staging operations (updated this session)
- The recovery migration: `supabase/migrations/20260502000000_recovery_rls_enables_late_tables.sql`

---

## Phase outcomes

### Phase 1 — Identify the 12 tables (DISCREPANCY: gap is 13, not 12)

Direct cross-environment RLS comparison via `pg_tables.rowsecurity` against staging and production. Reported the discrepancy and stopped per the prompt's STOP instruction. Result list (production=RLS-on, staging=RLS-off, table exists in both):

```
channex_outbound_log
channex_rate_plans
channex_room_types
channex_sync_state
concurrency_locks
koast_migration_history    ← the 13th, not in original D5 audit
message_automation_firings
message_threads
pricing_performance
pricing_recommendations
pricing_rules
property_channels
user_subscriptions
```

The 12 from the Session 2 report are the late-created subset of the D5 audit's original 17 tables (the 17 minus 5 already covered by `20260407040000_recovery_schema_drift.sql`). The 13th is `koast_migration_history` itself — created during Session 2's bootstrap script, drift-impacted by the same mechanism (production has the `ensure_rls` event trigger, staging doesn't), but post-dating the audit. Same drift mechanism, same fix; just not in the original list.

User approved Option C (include all 13 with header comment explaining why count is 13-not-12) plus an extension: codify the going-forward "RLS enable is explicit, not implicit" discipline in CLAUDE.md so the underlying mechanism is also closed.

### Phase 2 — Recovery migration authored

`supabase/migrations/20260502000000_recovery_rls_enables_late_tables.sql` (158 lines).

Header comment (~75 lines) covers:
- D5 finding background and which tables Session 2 already covered (4 of 17)
- Why count is 13-not-12 (Phase 1 finding above)
- SYMMETRIC application declaration (idempotent on both environments)
- What this migration closes (the 13-table gap) and what it doesn't (the underlying production-only event trigger; closed instead by going-forward discipline)
- Reference to the agent loop v1 Milestone 1 migrations as the canonical example of the discipline

Body (13 DO blocks): one per table, each guarded by `pg_class WHERE relname = '...' AND relnamespace = 'public'::regnamespace` so the migration is safe to run against any environment progress state. If a table doesn't exist, RAISE NOTICE skips the statement.

### Phase 3 — Apply to staging (CLEAN)

```
Pre-apply staging RLS state for the 13 tables:  all 13 = false
Migration apply: 13 DO blocks, 1.05 seconds, exit code 0
Post-apply staging RLS state for the 13 tables: all 13 = true
```

Sanity diff against the staging-all-public-tables RLS state pre/post apply: the diff is exactly the 13 target tables flipping from false to true, no other tables affected. Migration well under the 10-second STOP threshold.

After this phase, staging has 42 of 42 public tables RLS-enabled (100%).

### Phase 4 — Apply to production (TRUE NO-OP CONFIRMED)

```
Pre-apply production RLS state for the 13 tables:  all 13 = true
Migration apply: 13 DO blocks, 1.44 seconds, exit code 0
Post-apply production RLS state for the 13 tables: all 13 = true
Diff of all-public-tables RLS state pre/post apply: empty
```

The diff being empty confirms the migration was a true no-op against production — every ALTER TABLE statement ran against an already-RLS-enabled table, and PostgreSQL silently no-ops the redundant operation. No tables were affected; no schema changes occurred.

After this phase, production maintains 36 of 36 public tables RLS-enabled (100%).

### Phase 5 — `koast_migration_history` row added on both environments

```sql
INSERT INTO koast_migration_history (migration_name, applied_at, applied_by, notes, checksum)
VALUES (
  '20260502000000_recovery_rls_enables_late_tables.sql',
  '2026-05-02T04:55:00Z',  -- staging timestamp (Phase 3 apply)
  'session-3-d5-recovery',
  'Symmetric recovery: explicit ALTER ENABLE for 12 tables that production had via ensure_rls event trigger but staging lacked, plus koast_migration_history (the 13th, created during Session 2 with same drift mechanism). Effective on staging; no-op on production. Closes D5 from staging-setup-session-2-report.md.',
  'sha256:3077d4dcb49414c8aa6c3752818dc69b30b654b30ed583c5b10f8234f0d01c23'
);
```

Production gets the same row with `applied_at = 2026-05-02T04:55:30Z` (Phase 4 apply timestamp). All other fields identical.

Final row counts: **staging = 51, production = 51**, identical migration_name sets (diff empty).

### Phase 6 — Final fidelity verification (ZERO RLS GAP)

Cross-environment comparison after Phase 5:

```
Staging public tables: 42 (all rls=true: 42)
Production public tables: 36 (all rls=true: 36)

FIDELITY GAP (prod=on, stg=off): 0
REVERSE GAP (stg=on, prod=off): 0
Both RLS-off:                    0

Staging-only tables (agent loop v1 Milestone 1, expected):
  agent_artifacts, agent_audit_log, agent_conversations,
  agent_turns, guests, memory_facts
  (all rls=true on staging, will be rls=true on production after Milestone 1 rollout)
Production-only tables: []

koast_migration_history diff (migration_name set): empty (51 identical rows)
```

The fidelity gap is closed. Both environments have 100% RLS coverage on every public-schema table they share, plus matching coverage on the agent loop v1 Milestone 1 tables (staging-only for now; production rollout pending in the resumed Milestone 1 session).

### Phase 7 — CLAUDE.md update + session report (this file)

**CLAUDE.md changes:**

1. **Staging Environment section** — replaced the open carry-forward "12 production-RLS-enabled tables…" with a closed-out note pointing at this session and the migration. Two other carry-forwards (synthetic seed, `apply-migration.sh`) remain.

2. **Known Gaps / Not Wired section** — added a new convention bullet "RLS enable is explicit, not implicit" alongside the existing CHECK-constrained-text-columns convention. The note explains:
   - Production has `ensure_rls` event trigger, staging doesn't
   - Going-forward, every CREATE TABLE migration includes explicit `ALTER TABLE … ENABLE ROW LEVEL SECURITY` in the same file
   - This pattern is established in `20260502000000_recovery_rls_enables_late_tables.sql`
   - The agent loop v1 Milestone 1 migrations are cited as the existing canonical example

**`staging-environment.md` changes:**

1. **Staging RLS auto-enable section** — rewritten. The original text described the gap as a known deviation needing follow-up. The new text describes the discipline (explicit ALTER ENABLE in every CREATE TABLE migration), references both recovery migrations (Session 2 + Session 3), and confirms environments now have identical RLS coverage.

2. **Future work section** — struck through the "Recovery RLS-enable migration" item; updated the synthetic seed deferral from "Session 3+" to "Session 4+".

---

## State after this session

**Staging**:
- Project ref `aljowaggoulsswtxdtmf`. 42 public-schema tables, all RLS-enabled (100%).
- 51 rows in `koast_migration_history` (50 from Session 2 + 1 from this session).
- Empty data state — synthetic seed deferred to a later session.

**Production**:
- Project ref `wxxpbgbfebpkvsxhpphb`. 36 public-schema tables, all RLS-enabled (100%).
- Schema unchanged — Phase 4 was a true no-op (empty pre/post diff).
- 51 rows in `koast_migration_history` (50 from Session 2 + 1 from this session).
- Going-forward RLS discipline codified in CLAUDE.md and `staging-environment.md`.

**Files changed this session**:
- `supabase/migrations/20260502000000_recovery_rls_enables_late_tables.sql` — NEW, 158 lines.
- `CLAUDE.md` — staging carry-forward updated; "RLS enable is explicit, not implicit" convention added.
- `docs/architecture/staging-environment.md` — Staging RLS auto-enable section rewritten; future-work item closed.
- `docs/architecture/staging-setup-session-3-report.md` — NEW (this file).

**Files NOT changed** (locked):
- All 50 prior migration files, including `20260407040000_recovery_schema_drift.sql` and `20260407990000_drop_pre_408010000_dupe_policies.sql`.

---

## Why "the staging setup arc is formally closed"

After Sessions 1–3:

1. ✅ **Staging environment exists** — separate Supabase Free-tier project, env-var pattern documented, switching procedure codified.
2. ✅ **Production schema aligned with migration source-of-truth** — D1-D5 reconciled via `20260407040000_recovery_schema_drift.sql` (Session 2).
3. ✅ **Migration tracking discipline** — `koast_migration_history` populated on both environments, both share identical 51 migration_names, asymmetric application discipline established.
4. ✅ **Replay determinism** — duplicate-policy bug fixed via `20260407990000_drop_pre_408010000_dupe_policies.sql` (Session 2 asymmetric).
5. ✅ **RLS state symmetry** — Session 3's `20260502000000_recovery_rls_enables_late_tables.sql` closes the 13-table gap; both environments now have 100% RLS coverage.
6. ✅ **Going-forward discipline** — "RLS enable is explicit, not implicit" codified in CLAUDE.md to prevent recurrence.

The remaining staging-arc carry-forwards are nice-to-haves, not correctness gaps:
- Synthetic seed for staging (operational nicety; staging is fully functional empty)
- `scripts/apply-migration.sh` (ergonomic wrapper around the discipline; the discipline works without it)

Both can ship in any future session without unblocking anything.

---

## Open items for resuming agent loop v1 Milestone 1

The four Milestone 1 migrations (`20260501010000` through `20260501040000`) are applied to staging via Session 2's full replay. They are NOT applied to production yet. The next agent loop v1 session resumes from Phase 2 of the original Milestone 1 prompt:

1. **Phase 2 verification against staging post-replay** — re-run the test plan §B-G queries (counts, FK references, CHECK constraint enforcement) against staging. Compare to the captured baseline. Since staging is empty, expectations match the baseline document's empty-state values.
2. **Phase 3 production rollout** — apply the four Milestone 1 migrations to production with the test plan's verification gates between each. Update production's `koast_migration_history` rows for `20260501010000`-`20260501040000` (currently bootstrap-marked) with real apply timestamps.

The Milestone 1 design doc (`agent-loop-v1-design.md`), test plan (`agent-loop-v1-milestone-1-test-plan.md`), and baseline (`agent-loop-v1-milestone-1-baseline.md`) all remain canonical and unedited.

---

## Sign-off

- [x] Phase 1 — Cross-environment RLS comparison; STOP triggered when count was 13 instead of 12; user approved Option C with discipline extension
- [x] Phase 2 — `20260502000000_recovery_rls_enables_late_tables.sql` authored (158 lines, 13 idempotent DO-block ALTER statements)
- [x] Phase 3 — Migration applied to staging; all 13 tables flipped to RLS-on; no other tables affected; 1.05s elapsed
- [x] Phase 4 — Migration applied to production; true no-op confirmed (empty pre/post diff); 1.44s elapsed
- [x] Phase 5 — `koast_migration_history` row inserted on both environments with session-3-d5-recovery metadata; 51 identical migration_names
- [x] Phase 6 — Cross-environment fidelity gap = 0; reverse gap = 0; staging 42/42 RLS-on; production 36/36 RLS-on
- [x] Phase 7 — CLAUDE.md updated; `staging-environment.md` updated; this session report written
- [x] No production changes beyond Phase 4's true-no-op
- [x] All prior migration files unchanged

After this session: staging setup arc closed; agent loop v1 Milestone 1 work can resume from Phase 2 (test plan verification against staging) per the original Milestone 1 prompt.
