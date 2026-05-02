# Agent Loop v1 — Milestone 1 Staging Verification

*Executed 2026-05-02 against the staging Supabase project (`aljowaggoulsswtxdtmf`) post the Session 2 full migration replay. All 35 test-plan queries passed (with one transaction-semantics caveat that surfaced a real production-correct trigger pattern). One environment drift item discovered out-of-scope.*

Cross-references:
- Test plan: `agent-loop-v1-milestone-1-test-plan.md`
- Baseline: `agent-loop-v1-milestone-1-baseline.md`
- Staging environment: `staging-environment.md`

---

## Test artifacts

- `/tmp/koast-milestone-1-resume/phase2-structural.txt` — B2-B7 + C1-C3 raw psql output
- `/tmp/koast-milestone-1-resume/phase2-active-v3-output.txt` — D-F raw psql output (with transactional GRANTs)

---

## Section results

### B2 — Column shapes ✅

All 6 tables present with expected column counts:

| Table | Columns |
|---|---|
| `agent_artifacts` | 10 |
| `agent_audit_log` | 13 |
| `agent_conversations` | 8 |
| `agent_turns` | 13 |
| `guests` | 6 |
| `memory_facts` | 18 |

All column names, types, NOT NULL flags, and default values match the migration files verbatim.

### B3 — CHECK constraints ✅

All 14 expected CHECK constraints present with correct values:

| Constraint | Definition |
|---|---|
| `messages_actor_kind_check` | `IN ('host','agent','cleaner','cohost','system')` — 'guest' explicitly excluded |
| `memory_facts_entity_type_check` | `IN ('host','property','guest','vendor','booking')` |
| `memory_facts_sub_entity_type_check` | `IN ('front_door','lock','parking','wifi','hvac','kitchen_appliances')` — 6 canonical |
| `memory_facts_source_check` | `IN ('host_taught','inferred','observed')` |
| `memory_facts_status_check` | `IN ('active','superseded','deprecated')` |
| `memory_facts_confidence_check` | `BETWEEN 0 AND 1` |
| `agent_conversations_status_check` | `IN ('active','closed','error')` |
| `agent_turns_role_check` | `IN ('user','assistant')` |
| `agent_artifacts_state_check` | `IN ('emitted','confirmed','edited','dismissed')` |
| `agent_audit_log_actor_kind_check` | `IN ('host','agent','worker','system')` |
| `agent_audit_log_autonomy_level_check` | `IN ('silent','confirmed','blocked')` |
| `agent_audit_log_source_check` | `IN ('frontend_api','agent_artifact','agent_tool','worker')` |
| `agent_audit_log_outcome_check` | `IN ('succeeded','failed','pending')` |
| `agent_audit_log_confidence_check` | NULL OR `BETWEEN 0 AND 1` |

### B4 — Indexes ✅

21 expected `idx_*` indexes present (including all partial indexes with the documented `WHERE` clauses for `state='emitted'`, `actor_id IS NOT NULL`, `status='active'`, `outcome='failed'`, etc.).

### B5 — RLS enabled ✅

All 6 new tables have `rowsecurity=true`.

### B6 — RLS policies ✅

All 6 expected policies present with correct cmd:
- `agent_audit_log` is SELECT-only (no INSERT/UPDATE/DELETE for authenticated)
- All others are ALL (authenticated users have full CRUD on rows they own)

### B7 — `updated_at` triggers ✅

Triggers exist on `memory_facts`, `guests`, `agent_conversations`, `agent_artifacts` (4 tables, BEFORE UPDATE).

### B8 — Smoke insert ✅

Service-role insert into `memory_facts` with provenance JSONB succeeded. Defaults populated correctly: `confidence=1.00`, `status='active'`, `learned_at` populated by `now()`.

### B9 — CHECK constraint rejection ✅

8 sub-tests:
| # | Test | Result |
|---|---|---|
| B9.1 | `source='pure_speculation'` (not in vocab) | REJECTED ✓ |
| B9.2 | `confidence=1.5` (> 1) | REJECTED ✓ |
| B9.3 | `sub_entity_type='frontdoor'` (typo) | REJECTED ✓ |
| B9.4 | `sub_entity_type='main_door'` (variant) | REJECTED ✓ |
| B9.5 | `sub_entity_type=NULL` | ACCEPTED ✓ |
| B9.6 | All 6 canonical `sub_entity_type` values | 6 INSERTs ACCEPTED ✓ |
| B9.7 | `messages.actor_kind='guest'` | REJECTED ✓ |
| B9.8 | `messages.actor_kind=NULL` | ACCEPTED ✓ |
| B9.9 | `messages.actor_kind='host'` | ACCEPTED ✓ |

### C1-C3 — Existing-data verification (vacuous on empty staging) ✅

All 6 agent loop tables: 0 rows. `messages` table: 0 rows on staging (it's empty after the staging-arc replay). The structural verification of `actor_id` (uuid, nullable, no default) and `actor_kind` (text, nullable, no default) is the meaningful check at staging's empty state. **Real data verification of back-population happens in Phase 3 against production.**

### D1-D5 — RLS round-trip ✅

Implementation note: RLS testing required transactional `GRANT USAGE ON SCHEMA public` and table-level grants for the `authenticated` role, because **staging is missing the production-level role grants** (see DRIFT-3 below). The grants were applied inside the test transaction and reverted by ROLLBACK, so this drift item didn't get patched here.

| # | Test | Result |
|---|---|---|
| D1 | User A creates conv → User A sees 1 conv | 1 ✓ |
| D2 | User B sees 0 convs / 0 memory_facts / 0 guests | 0/0/0 ✓ |
| D3 | User B inserts as User A → RLS rejects | REJECTED ✓ |
| D4 | Service role bypasses RLS, sees 1 conv | 1 ✓ |
| D5a | Authenticated user INSERT into agent_audit_log | REJECTED ✓ |
| D5b | Service role INSERT into agent_audit_log | ACCEPTED ✓ |

### E1-E5 — FK constraints ✅

| # | Test | Result |
|---|---|---|
| E1 | `memory_facts.guest_id` non-existent | FK violation ✓ |
| E2 | `agent_turns.conversation_id` non-existent | FK violation ✓ |
| E3 | Cascade DELETE conv → turns + artifacts deleted | pre=2/1, post=0/0 ✓ |
| E5 | DELETE memory_fact_b → memory_fact_a.superseded_by becomes NULL | pre=set, post=NULL ✓ |

E4 (auth.users delete cascading actor_id) was structurally verified via FK declaration inspection; not exercised here because deleting auth.users rows triggers cascades to many other tables and is overkill for this milestone's verification scope.

### F1-F2 — Triggers ✅

F1 first attempt within a single transaction showed `bump_happened=f` for all 4 tables. Root cause: `now()` returns the **transaction start time**, not wall-clock time, so INSERT and UPDATE within the same transaction produce identical timestamps. This is the production-correct pattern — `now()` is what the trigger uses, and in production the INSERT and UPDATE land in different transactions with different timestamps.

Re-test across separate transactions:

```
Tx 1: INSERT memory_fact at 05:25:55.576615+00
      → created_at == updated_at (both = transaction start)
sleep 1.5s outside any transaction
Tx 2: UPDATE memory_fact at 05:25:58.045931+00
      → updated_at = 05:25:58.045931+00 (new transaction start)
      → bump_happened = TRUE ✓
```

The trigger fires correctly. The original in-transaction failure was a test-design artifact.

F2 — `agent_turns` and `agent_audit_log` have NO `updated_at` trigger (verified zero rows in `information_schema.triggers` for those tables). Append-only by design ✓.

### G1 — Drizzle / TypeScript type-check ✅

```
$ npx tsc --noEmit
$ echo $?
0
```

No errors, no output.

---

## Drift items discovered (out of scope for this session)

### DRIFT-3: Staging missing standard Supabase role grants on public schema

**Production**: anon, authenticated, service_role roles all have `USAGE` on `public` schema and `SELECT/INSERT/UPDATE/DELETE/TRIGGER/REFERENCES/TRUNCATE` on every public table.

**Staging**: Only `postgres` has any grants. anon, authenticated, service_role roles don't have schema USAGE — meaning a Supabase JS client connecting via the anon or service_role key gets `permission denied for schema public` on every query.

**Impact**: Functional staging usage (running the Next.js app or workers against staging) is currently broken at the auth layer. Phase 2 verification worked by granting permissions transactionally and rolling back; structural validity confirmed but staging isn't ready to serve API calls until the grants are added permanently.

**Why this happened**: Production gets these grants applied automatically by the Supabase platform during initial project provisioning. Staging was bootstrapped via `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` followed by migration replay — the platform-managed grants aren't part of any migration file and don't replay.

**Fix recommendation**: A symmetric recovery migration that GRANTs the standard role privileges. Pattern follows DRIFT-1 (channex_webhook_log table create) and DRIFT-5 (RLS-enable on late-created tables) — codify production's platform-level state into the migration source-of-truth so fresh staging replays match. Suggested filename: `20260502100000_recovery_supabase_role_grants.sql`. Out of scope for this session per "DO NOT apply any other migrations or changes to either environment in this session" constraint.

This drift was discovered while testing RLS round-trip and is documented here for the next staging-arc maintenance session.

---

## Sign-off

- [x] B1-B9 fresh-database verification clean
- [x] C1-C3 existing-data verification (vacuous on empty staging; real verification in Phase 3 against production)
- [x] D1-D5 RLS verification clean (with transactional GRANT workaround; DRIFT-3 documented)
- [x] E1-E3, E5 FK constraint verification clean
- [x] F1-F2 trigger verification clean (with separate-transaction caveat for F1 noting the production-correct `now()` pattern)
- [x] G1 type-check clean
- [x] Staging post-test cleanliness confirmed (all tables back to 0 rows; transactional GRANTs reverted)

All 35 verification queries pass. Phase 2 sign-off complete. Phase 3 production rollout cleared to proceed.
