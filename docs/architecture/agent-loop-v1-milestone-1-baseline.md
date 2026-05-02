# Agent Loop v1 — Milestone 1 Baseline (Phase 1)

*Captured 2026-05-01 against the production Supabase project (`wxxpbgbfebpkvsxhpphb.supabase.co`). The migrations are produced, locked, and unrun. This report covers the read-only baseline counts established in Phase 1 of the Milestone 1 rollout, and the staging-gap finding that paused Phase 2 / 3 in the same session.*

Cross-references:
- Migration files: `supabase/migrations/20260501010000` through `20260501040000_*.sql`
- Test plan: `docs/architecture/agent-loop-v1-milestone-1-test-plan.md`
- Design: `docs/architecture/agent-loop-v1-design.md`
- Rollout report stub (PAUSED): `docs/architecture/agent-loop-v1-milestone-1-rollout-report.md`

---

## 1. Baseline counts (Phase 1, a-d)

The four read-only queries from the test plan §A1 / Phase 1 prompt, run against the production Supabase project. The DB connection used was `DATABASE_URL` from `~/koast-workers/.env`, which resolves to `wxxpbgbfebpkvsxhpphb.supabase.co` — the same project `NEXT_PUBLIC_SUPABASE_URL` in `koast/.env.local` points at.

| # | Query | Result | Test plan expected | Status |
|---|-------|-------:|-------------------:|--------|
| (a) | `SELECT COUNT(*) FROM messages WHERE sender='guest';` | **37** | 37 | ✅ matches |
| (b) | `SELECT COUNT(*) FROM messages WHERE sender='property';` | **53** | 53 | ✅ matches |
| (c) | `SELECT COUNT(*) FROM messages WHERE sender='property' AND ai_draft IS NOT NULL AND content = ai_draft;` | **0** | 0 | ✅ matches |
| (d) | `SELECT COUNT(*) FROM messages WHERE sender NOT IN ('guest','property');` (broken out by sender) | **0 rows** | 0 rows | ✅ matches |

Total messages: 90 (= 37 + 53). Distribution as expected.

### Bonus context queries

- `COUNT(*) WHERE ai_draft IS NOT NULL` → **0**. Confirms (c) at the substrate level: the heuristic-detection column has no candidate rows on the production DB.
- `draft_status` distribution: 90 rows, all `'none'`. No `generated`, no `draft_pending_approval`, no `sent`, no `discarded`.

### Conclusion on the executor-detection heuristic (Phase 1c)

Result is **0** and **expected**. The executor-detection heuristic is `sender='property' AND ai_draft IS NOT NULL AND content = ai_draft` — meaning "rows where the host approved an executor-generated draft as-is." Production has zero such rows because the messaging executor has not fired in production yet:

- CLAUDE.md "Known Gaps / Not Wired" notes the AI messaging pipeline is scaffolded but not automated; the "AI Drafted" filter is dimmed.
- `koast-workers/messaging_executor.py` file header: *"NOT systemd-enabled in this commit. Manual run + log inspection is the supervised first-run gate."*
- BELIEF_1_CONFIG_INVENTORY.md confirmed `message_automation_firings = 0` and `message_templates = 0` rows in production.
- BELIEF_2_CHAT_INVENTORY.md noted `PendingDraftBubble` + executor are not yet active in production.

**No heuristic refinement is needed before migration.** The 0 result is the correct number for the current state of the system. When the executor begins firing in a later milestone, `actor_kind='agent'` will be set on those rows by the existing back-population logic running on each new insert (specifically the inbound write paths that need to be wired in a follow-up commit per migration 20260501040000's comments).

### Conclusion on the test plan's expected counts

The test plan's §C3 expected count distribution stands without revision:

| actor_kind | sender   | direction | count |
|------------|----------|-----------|-------|
| host       | property | outbound  | 53    |
| NULL       | guest    | inbound   | 37    |

90 total. No `agent` rows (back-pop's executor detection finds 0). No `system` rows (sender 'system' has 0 rows). No NULL `actor_kind` rows on outbound (back-pop sets `'host'` for sender='property'). Inbound rows have `actor_kind=NULL` by design after the post-review revision (§13.2 of the design doc) — the column excludes 'guest' from its enum because guest is an external party, not an internal actor.

---

## 2. Staging-gap finding (the reason this milestone paused)

The user prompt structures Phase 2 as "staging" and Phase 3 as "production." Workspace investigation surfaced that there is no staging environment configured:

- **No Supabase CLI** in PATH on the workspace VPS (`which supabase` → empty).
- **No `supabase/config.toml`** — no Supabase project linkage. Only `supabase/migrations/` and `supabase/scripts/` directories exist.
- **Single `DATABASE_URL`** across both `.env` files (`koast/.env.local` and `koast-workers/.env`), pointing at the same project: `wxxpbgbfebpkvsxhpphb.supabase.co`. No `STAGING_DATABASE_URL` / `DATABASE_URL_STAGING`.
- **That Supabase project is the production app's database** — the one app.koasthq.com reads from, the one with 90 messages / 209 pricing recommendations / 102 channex_webhook_log rows that the prior Belief inventories queried.

The koast-development skill's `playbooks.md` already references the no-staging-Postgres situation in two places (the "Two-stage trigger cutover" pattern and the "no staging Postgres" migration-validation note). The gap was a known operational limitation; this milestone is the first that bumps directly into it.

Per the rollout prompt: *"Do NOT skip phases. Phase 1 baseline must complete before Phase 2 staging migrations. Phase 2 sign-off must be clean before Phase 3 production."* Treating the production project as staging would silently skip Phase 2 and violate the discipline. The session paused at this point and surfaced the gap rather than proceeding.

### Three options surfaced in-session

**Option A — Set up real staging (separate session, recommended).** Provision a separate Supabase project (or use Supabase's branching feature on Pro tier, or a managed Postgres instance with prior migrations replayed). Expose its connection string as `STAGING_DATABASE_URL`. Phase 2 verification then runs against staging; Phase 3 against production. Cleanest path; matches the test plan's intent. Cost: another session of infrastructure setup before this slice ships, but the staging environment becomes a load-bearing piece of every future Phase 1 milestone — the cost amortizes across the entire build.

**Option B — Local Postgres as ad-hoc staging.** Install postgres locally, replay all prior migrations + a synthetic seed (mock messages, mock properties, mock auth.users), apply the four new migrations, run B1-B9 + FK + RLS verification. Limitations: no production-like data so C1-C4 back-population verification can't run there; RLS depends on `auth.uid()` which only fully works in a real Supabase project (works approximately with `SET request.jwt.claims` but not identically). Validates schema syntax and structure but not the data-affecting back-population.

**Option C — Skip Phase 2 conceptually, single-environment rollout to production.** Take the `messages_pre_milestone1_snapshot` per test plan §A4 BEFORE doing anything else, apply migrations one at a time with verification between each, abort + roll back if anything fails. The test plan's §C1-C4 was actually written for production data verification. The risk: any back-population mistake mutates production immediately. Mitigation: snapshot + per-migration verification + small data volume (90 messages) means rollback is mechanical.

### Decision

**Option A.** Per the user's response in the same session: *"The absence of staging is a Koast-wide infrastructure gap, not just this migration's problem — every Phase 1 milestone will have the same need. Setting it up now is infrastructure that pays off across the entire Phase 1 build."* Milestone 1 rollout pauses here; staging environment setup is its own session.

---

## 3. State of the milestone at pause

### Files unchanged (locked, ready)

- `supabase/migrations/20260501010000_guests_and_memory_facts.sql`
- `supabase/migrations/20260501020000_agent_loop_tables.sql`
- `supabase/migrations/20260501030000_agent_audit_log.sql`
- `supabase/migrations/20260501040000_messages_actor_columns.sql`
- `src/lib/db/schema.ts` (Drizzle declarations + four typed-union exports: `MessagesActorKind`, `MemoryFactSubEntityType`, `MemoryFactEntityType`, `MemoryFactSource`, `MemoryFactStatus`)

The migrations are NOT applied to any environment. None ran. Schema state on production is unchanged from before this session began.

### Files updated this session

- `docs/architecture/agent-loop-v1-milestone-1-baseline.md` (this document)
- `docs/architecture/agent-loop-v1-milestone-1-rollout-report.md` (PAUSED stub pointing here)
- `CLAUDE.md` — staging-environment gap appended to the Known Gaps section
- `~/.claude/skills/koast-development/SKILL.md` — staging-gap entry added to operational state
- `~/.claude/skills/koast-development/references/playbooks.md` — cross-ref to baseline.md from existing "no staging Postgres" notes

### Resumption preconditions

When the next session resumes Milestone 1:

1. A `STAGING_DATABASE_URL` (or equivalent) must be available pointing at a non-production Postgres compatible with the codebase's Supabase conventions (auth schema, RLS, etc.).
2. Prior production migrations (every file in `supabase/migrations/` from `001_initial_schema.sql` through `20260428010000_guest_reviews_is_hidden.sql`) must be applied to staging first so the four new migrations apply against the same prior schema state production has.
3. A small synthetic seed (a few mock `auth.users` rows, mock properties, mock messages with `sender='guest'` and `sender='property'` distributions) is helpful for C1-C4 back-population verification but not strictly required if the staging DB is fresh and the team is comfortable letting Phase 3 production back-population be the first real-data run.

Once staging exists, the next session resumes at Phase 2 of the rollout. The migrations + test plan + Drizzle declarations are unchanged and ready.

---

## 4. Sign-off

- [x] Phase 1 baseline counts captured against production.
- [x] Test plan's expected numbers verified to match actual; no test plan revision needed.
- [x] Executor-detection heuristic dry-run = 0, confirmed expected (no refinement needed).
- [x] Staging gap identified and surfaced before any DB writes.
- [x] User decision: pause until staging is established (Option A).
- [x] Migration files locked (no edits during pause).
- [x] CLAUDE.md, koast-development skill, baseline report all updated for next-session context.
- [ ] Phase 2 staging verification (BLOCKED on staging environment).
- [ ] Phase 3 production rollout (BLOCKED on Phase 2 sign-off).
- [ ] Final rollout report (BLOCKED on Phase 3 completion).
