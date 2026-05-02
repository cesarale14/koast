-- Agent loop v1 — Milestone 1, migration 4 of 4.
--
-- Foundational hygiene fix per docs/architecture/agent-loop-v1-design.md
-- §8 and docs/method/koast-method-in-code.md §"the pre-launch calibration
-- debt".
--
-- Two new columns on `messages`:
--
-- 1. actor_id (uuid, nullable) — who performed the action that produced
--    this row. For outbound rows: the user that authored or approved
--    (host or future co-host/VA). For inbound: NULL — the actor is the
--    OTA's relay, not anyone in our system. NULL for system-generated
--    rows for the same reason.
--
-- 2. actor_kind (text, nullable, no default) — the role/identity class
--    that produced this row. The actor_kind column is for INTERNAL-side
--    actors (host / agent / cleaner / cohost / system) — those who act
--    on Koast's behalf. Guest is the external party Koast communicates
--    WITH, not an internal actor; the existing `sender` column already
--    distinguishes property-side from guest-side. Inbound (sender='guest')
--    rows therefore have actor_kind NULL by design.
--
--    The actor_kind='agent' value is the voice-extraction-exclusion
--    flag: when the future voice-learning worker (Belief 7) reads
--    outbound rows to extract the host's voice patterns, it filters
--    with `actor_kind = 'host' AND sender = 'property'` so Koast's own
--    templates don't get learned as the host's voice. NULL rows
--    (inbound) are excluded naturally because the voice-extraction
--    filter index is partial: WHERE actor_kind IS NOT NULL.
--
--    No DEFAULT is set: callers must explicitly attribute new rows.
--    Existing send routes will produce NULL actor_kind on new inserts
--    until they're updated (planned for a follow-up commit in the same
--    slice). Until then, the voice-extraction filter conservatively
--    excludes those rows — which is the right safe-failure behavior.
--
-- Back-population is included here because:
--   - The schema is small (2 columns).
--   - The detection logic is deterministic and runs once.
--   - Deferring back-population means voice extraction (which ships in
--     a later slice) inherits dirty data and has to either re-run this
--     work or fail closed.
--
-- Per docs/architecture/agent-loop-v1-design.md §8.1: today's test fleet
-- is single-host (Cesar). All outbound rows where sender='property'
-- attribute to that user via properties.user_id. The actor_kind='agent'
-- detection (ai_draft non-null AND content matching ai_draft) doesn't
-- match any production rows today (verified live: 0 of 90 messages
-- have ai_draft populated) but the logic runs anyway for correctness
-- once the messaging executor starts firing.

-- =============================================================================
-- Column additions
-- =============================================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS actor_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actor_kind text
    CHECK (actor_kind IN ('host', 'agent', 'cleaner', 'cohost', 'system'));

-- Voice-extraction-filter index: partial index excludes NULL rows
-- (inbound / unattributed) naturally. Hot path is
-- `WHERE actor_kind = 'host' AND sender = 'property'`.
CREATE INDEX IF NOT EXISTS idx_messages_actor_voice_filter
  ON messages(actor_kind, sender) WHERE actor_kind IS NOT NULL;

-- Per-actor lookup (for "which messages did I send" UI surfaces).
CREATE INDEX IF NOT EXISTS idx_messages_actor_id
  ON messages(actor_id) WHERE actor_id IS NOT NULL;


-- =============================================================================
-- Back-population
-- =============================================================================

-- Step 1: set actor_id for all outbound rows by joining through
-- properties to find the owning user. Inbound rows leave actor_id NULL
-- (no internal actor for OTA-relayed guest messages).
UPDATE messages
SET actor_id = (
  SELECT user_id
  FROM properties
  WHERE properties.id = messages.property_id
)
WHERE sender = 'property'
  AND actor_id IS NULL;

-- Step 2: attribute outbound rows to 'host' by default. The 'agent'
-- override comes next; we set 'host' first so the override only flips
-- the rows that genuinely match.
UPDATE messages
SET actor_kind = 'host'
WHERE sender = 'property'
  AND actor_kind IS NULL;

-- Step 3: detect messaging_executor-generated rows. Override
-- actor_kind='host' to actor_kind='agent' for rows where ai_draft is
-- non-null AND content equals ai_draft (the host approved the
-- executor's draft as-is). Edited drafts have content != ai_draft and
-- remain attributed to the host.
--
-- Note: 0 production rows match this condition today (the messaging
-- executor hasn't fired in production yet). The query runs anyway so
-- the logic exists when the executor does fire.
UPDATE messages
SET actor_kind = 'agent'
WHERE ai_draft IS NOT NULL
  AND content = ai_draft
  AND sender = 'property'
  AND actor_kind = 'host';

-- Step 4: system-sender rows (booking confirmations, OTA notifications,
-- etc. — sender='system' per the Channex enum). None in production
-- today but the logic is included for completeness.
UPDATE messages
SET actor_kind = 'system'
WHERE sender = 'system'
  AND actor_kind IS NULL;

-- Step 5: sender='guest' rows are intentionally left with actor_kind
-- NULL — guest is not an internal actor. No UPDATE needed; the column
-- has no default and no override step touches these rows.


-- =============================================================================
-- Verification queries (commented; run manually post-migration)
-- =============================================================================
--
-- Counts by actor_kind / sender / direction, expected on production:
--   SELECT actor_kind, sender, direction, COUNT(*)
--     FROM messages
--    GROUP BY 1, 2, 3
--    ORDER BY 1, 2, 3;
-- Expected on the test fleet (90 rows):
--   actor_kind='host'   sender='property' direction='outbound' → ~53
--   actor_kind=NULL     sender='guest'    direction='inbound'  → ~37
--   actor_kind='agent'  *                                      → 0
--   actor_kind='system' *                                      → 0
--
-- Spot-check actor_id population:
--   SELECT COUNT(*) FILTER (WHERE actor_id IS NOT NULL)         AS actor_id_set,
--          COUNT(*) FILTER (WHERE actor_id IS NULL)             AS actor_id_null
--     FROM messages WHERE sender = 'property';
-- Expected: all 53 outbound have actor_id set.
--
-- Confirm guest rows have NULL on both columns:
--   SELECT COUNT(*) FILTER (WHERE actor_kind IS NULL AND actor_id IS NULL) AS clean_null
--     FROM messages WHERE sender = 'guest';
-- Expected: 37.
