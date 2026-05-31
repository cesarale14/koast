-- M13 agenda — per-property timezone.
--
-- The agent's operational agenda windows each property's "today" + the next 48h
-- in the PROPERTY's local timezone, not UTC (the UTC bug labeled an 8:38pm EDT
-- moment as the next calendar day). Add an IANA timezone column and backfill
-- existing properties to their VERIFIED tz.
--
-- Backfill is verified per city/state, NOT a blanket state→tz assumption
-- (states span timezones — FL has a Central panhandle, TX spans Central/
-- Mountain, etc.). The current properties are Tampa, FL and Asheville, NC, both
-- unambiguously Eastern:
--   Tampa, FL      → America/New_York   (not the FL Central panhandle)
--   NC (Asheville) → America/New_York   (North Carolina is entirely Eastern)
-- Any property NOT matching stays NULL — the agenda SKIPS null-tz properties
-- (a missing item beats a wrong-day one). Set those by hand after verifying.
--
-- ADD COLUMN nullable — properties already exists + is RLS-enabled (no RLS
-- block needed). Checkpoint discipline (D1): staging first (gated + verify) →
-- prod applied by hand before the tz-aware code deploys.

ALTER TABLE properties ADD COLUMN IF NOT EXISTS timezone text;

UPDATE properties SET timezone = 'America/New_York'
  WHERE timezone IS NULL
    AND (
      state = 'NC'
      OR (state = 'FL' AND city = 'Tampa')
    );

COMMENT ON COLUMN properties.timezone IS
  'M13 agenda — IANA timezone (e.g. America/New_York). The agenda windows each property''s "today" + 48h in its own tz; null-tz properties are SKIPPED (never UTC-fallback). New-property auto-defaulting deferred.';
