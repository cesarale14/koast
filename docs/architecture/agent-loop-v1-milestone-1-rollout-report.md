# Agent Loop v1 — Milestone 1 Rollout Report

## STATUS: PAUSED (2026-05-01)

Milestone 1 rollout paused after Phase 1 (read-only baseline counts) before any migrations were applied to any environment. The pause is intentional and was prompted by the absence of a staging environment in the workspace — a Koast-wide infrastructure gap that every Phase 1 milestone will need addressed, not just this one.

**No migrations were run.** The four migration files at `supabase/migrations/20260501010000` through `20260501040000_*.sql` are locked-and-ready and unchanged from the design-review session that produced them. Schema state on production is unchanged from before this session.

The full Phase 1 baseline + the staging-gap analysis + the resumption preconditions live in:

→ **[`agent-loop-v1-milestone-1-baseline.md`](./agent-loop-v1-milestone-1-baseline.md)**

This document is a stub. When the next session resumes Milestone 1 (after staging is established), this file becomes the rollout report covering Phases 2 and 3 — staging verification results, production rollout results, any discrepancies, and the schema-locked-after-rollout closeout.

---

### What the next session should do first

1. Confirm a `STAGING_DATABASE_URL` (or equivalent) is available and points at a non-production Postgres with all prior migrations replayed.
2. Re-read this file, the baseline document above, the locked test plan at `agent-loop-v1-milestone-1-test-plan.md`, and the locked design at `agent-loop-v1-design.md` (especially §13).
3. Resume at Phase 2 of the rollout prompt. Re-run Phase 1 baseline against staging if the staging seed differs from production's baseline (test plan §A1).

The migrations, the Drizzle declarations, and the test plan are not to be edited during resumption. If anything is wrong, the fix is a new migration in a separate session — not an edit to applied (or about-to-apply) migrations.
