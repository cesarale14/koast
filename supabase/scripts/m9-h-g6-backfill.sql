-- M9 Phase H STEP 6: G6 voice_substrate migration_history backfill.
--
-- Surfaces from Phase G STEP 6.3 cross-phase audit (vault 82d1eb4
-- G-phase-1-stop.md §2.3) + Phase H STEP 6.1 cross-env re-verification
-- (G8-H3): Phase E voice_substrate (20260515220000) applied to BOTH
-- staging and production but unrecorded in koast_migration_history on
-- either environment. Original Phase G "production-only gap" claim
-- inherited Session 2 staging-setup scope incorrectly; STEP 6.1
-- direct staging query surfaced the actual cross-env state.
--
-- Session 2 staging-env setup was a one-time backfill of pre-existing
-- migrations at staging creation time; it does NOT auto-record
-- migrations applied AFTER. Phase E voice_substrate (applied post-
-- Session-2) required manual recording on BOTH environments — neither
-- got it at Phase E close.
--
-- applied_at proxy: Phase E close commit timestamp from
-- `git log -1 --format='%cI' 96a5a22` → 2026-05-15T23:13:35+00:00.
-- Actual apply timestamp not in operator log; commit timestamp is the
-- closest forensic proxy.
--
-- Column-name confirmation (G8-H4 caught at STEP 6.1 verification):
-- shipped schema uses `migration_name` not `file_name`. INSERT validated
-- against `\d koast_migration_history` output before execution.
--
-- Environment-agnostic: same INSERT applies to both staging and
-- production. Apply staging-first per CLAUDE.md migration discipline.
--
-- Idempotency: NOT idempotent. One-shot backfill; re-run creates a
-- duplicate history row (no unique constraint on migration_name in
-- shipped schema, despite UNIQUE INDEX existing per earlier inspection —
-- so re-run would fail on the UNIQUE constraint, which is also a
-- safety property: re-run-protection by the schema itself).

INSERT INTO koast_migration_history (migration_name, applied_at, applied_by, notes)
VALUES (
  '20260515220000_voice_substrate.sql',
  '2026-05-15T23:13:35+00:00',
  'm9-phase-h-g6-backfill',
  'Backfill: migration applied during M9 Phase E close (commit 96a5a22) but not recorded in koast_migration_history on either environment. Gap surfaced Phase G STEP 6.3 (narrow-scope claim production-only) + Phase H STEP 6.1 re-audit (G8-H3 cross-stratum: actual cross-env gap). applied_at proxy = Phase E close commit timestamp; exact apply time not in operator log. Backfilled at Phase H STEP 6 per §7.8 close protocol gate 1 (migration history audit).'
);
