# Agent Loop v1 — Milestone 1 Test Plan

*Verification plan for the four schema migrations produced in Milestone 1. Run by hand against a non-production database first; against staging second; against production last (with a backup snapshot taken first).*

The migrations are produced and not yet run. The plan below covers verification before, during, and after migration application.

## Migrations under test

| File | What it does |
|---|---|
| `supabase/migrations/20260501010000_guests_and_memory_facts.sql` | Creates `guests` (FK target) + `memory_facts` (Tier 1 memory) + their RLS + `updated_at` triggers |
| `supabase/migrations/20260501020000_agent_loop_tables.sql` | Creates `agent_conversations` + `agent_turns` + `agent_artifacts` + their RLS + `updated_at` triggers |
| `supabase/migrations/20260501030000_agent_audit_log.sql` | Creates `agent_audit_log` + RLS (read-only for authenticated users) |
| `supabase/migrations/20260501040000_messages_actor_columns.sql` | Adds `actor_id` + `actor_kind` to `messages` and runs back-population |

Plus the Drizzle declarations in `src/lib/db/schema.ts` mirroring the migrations.

---

## Pre-migration verification (capture baseline)

### A1 — Capture baseline counts (production)

```sql
-- Run before applying migrations to record current state. The
-- post-migration verification compares against these numbers.
SELECT
  (SELECT count(*) FROM messages)                               AS messages_total,
  (SELECT count(*) FROM messages WHERE sender = 'property')     AS messages_property,
  (SELECT count(*) FROM messages WHERE sender = 'guest')        AS messages_guest,
  (SELECT count(*) FROM messages WHERE sender = 'system')       AS messages_system,
  (SELECT count(*) FROM messages WHERE ai_draft IS NOT NULL)    AS messages_with_draft,
  (SELECT count(*) FROM properties)                             AS properties_total,
  (SELECT count(*) FROM bookings)                               AS bookings_total;
```

**Expected on the test fleet (verified 2026-05-01)**:
- `messages_total = 90`
- `messages_property = 53`
- `messages_guest = 37`
- `messages_system = 0`
- `messages_with_draft = 0`
- `properties_total = 2`
- `bookings_total = 90`

### A2 — Confirm none of the new tables exist

```sql
SELECT tablename
  FROM pg_tables
 WHERE schemaname = 'public'
   AND tablename IN (
     'guests', 'memory_facts', 'agent_conversations',
     'agent_turns', 'agent_artifacts', 'agent_audit_log'
   );
```

Expected: zero rows. If any exist, abort and investigate before applying.

### A3 — Confirm `messages.actor_id` and `messages.actor_kind` do not exist

```sql
SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'messages'
   AND column_name IN ('actor_id', 'actor_kind');
```

Expected: zero rows.

### A4 — Take a snapshot of `messages` for rollback

```sql
CREATE TABLE messages_pre_milestone1_snapshot AS SELECT * FROM messages;
```

This is a one-shot full copy of `messages` before migration 4's back-population runs. Used only for rollback if back-population produces wrong attribution. Drop after a few days of production observation: `DROP TABLE messages_pre_milestone1_snapshot;`.

---

## Fresh-database verification

This is the simpler path: a fresh Supabase project (or local Postgres with the project's prior migrations applied) gets the four new migrations applied in order. Verifies the migrations are syntactically clean and produce the expected schema without any pre-existing data interactions.

### B1 — Apply migrations in order

```bash
# Local: from the repo root, against a Supabase local stack.
supabase db reset                                             # blank slate; reapplies all migrations
# OR (for a fresh Supabase project linked to staging):
supabase db push
```

The four new migrations apply alphabetically after the existing ones (their timestamps `20260501*` are after the latest existing `20260428010000`).

Expected: clean output, no errors.

### B2 — Verify tables exist with expected columns

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN (
     'guests', 'memory_facts', 'agent_conversations',
     'agent_turns', 'agent_artifacts', 'agent_audit_log'
   )
 ORDER BY table_name, ordinal_position;
```

Expected: every column listed in the migration files. Spot-check:
- `memory_facts` has `id, host_id, entity_type, entity_id, sub_entity_type, sub_entity_id, guest_id, attribute, value, source, confidence, learned_from, status, superseded_by, learned_at, last_used_at, created_at, updated_at` — 18 columns.
- `agent_audit_log` has 13 columns including `confidence` (numeric), `latency_ms` (integer), `context` (jsonb default `'{}'`).

### B3 — Verify CHECK constraints

```sql
SELECT conrelid::regclass AS table_name,
       conname,
       pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid::regclass::text IN (
         'memory_facts', 'agent_conversations', 'agent_turns',
         'agent_artifacts', 'agent_audit_log', 'messages'
       )
   AND contype = 'c'
 ORDER BY 1, 2;
```

Expected entries (a non-exhaustive set the verifier should see):
- `memory_facts_entity_type_check` — `IN ('host', 'property', 'guest', 'vendor', 'booking')`
- `memory_facts_sub_entity_type_check` — `IN ('front_door', 'lock', 'parking', 'wifi', 'hvac', 'kitchen_appliances')` (NULL allowed)
- `memory_facts_source_check` — `IN ('host_taught', 'inferred', 'observed')`
- `memory_facts_status_check` — `IN ('active', 'superseded', 'deprecated')`
- `memory_facts_confidence_check` — `BETWEEN 0 AND 1`
- `agent_conversations_status_check` — `IN ('active', 'closed', 'error')`
- `agent_turns_role_check` — `IN ('user', 'assistant')`
- `agent_artifacts_state_check` — `IN ('emitted', 'confirmed', 'edited', 'dismissed')`
- `agent_audit_log_source_check` — `IN ('frontend_api', 'agent_artifact', 'agent_tool', 'worker')`
- `agent_audit_log_actor_kind_check` — `IN ('host', 'agent', 'worker', 'system')`
- `agent_audit_log_autonomy_level_check` — `IN ('silent', 'confirmed', 'blocked')`
- `agent_audit_log_outcome_check` — `IN ('succeeded', 'failed', 'pending')`
- `messages_actor_kind_check` — `IN ('host', 'agent', 'cleaner', 'cohost', 'system')` (NULL allowed; 'guest' explicitly excluded — guest is not an internal actor)

### B4 — Verify indexes

```sql
SELECT tablename, indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename IN (
     'guests', 'memory_facts', 'agent_conversations',
     'agent_turns', 'agent_artifacts', 'agent_audit_log', 'messages'
   )
   AND indexname LIKE 'idx_%'
 ORDER BY 1, 2;
```

Expected indexes (non-exhaustive):
- `idx_guests_host`
- `idx_guests_first_seen_booking` (partial: `WHERE first_seen_booking_id IS NOT NULL`)
- `idx_memory_facts_active_entity` (partial: `WHERE status = 'active'`)
- `idx_memory_facts_sub_entity` (partial: `WHERE status = 'active'`)
- `idx_memory_facts_host_learned`
- `idx_memory_facts_guest` (partial)
- `idx_memory_facts_superseded_by` (partial)
- `idx_agent_conversations_host_recent`
- `idx_agent_conversations_host_status` (partial: `WHERE status = 'active'`)
- `idx_agent_turns_conversation`
- `idx_agent_turns_conversation_turn_index` (the UNIQUE index)
- `idx_agent_artifacts_conversation`
- `idx_agent_artifacts_turn`
- `idx_agent_artifacts_pending` (partial: `WHERE state = 'emitted'`)
- `idx_agent_audit_log_host_recent`
- `idx_agent_audit_log_action_type`
- `idx_agent_audit_log_failures` (partial: `WHERE outcome = 'failed'`)
- `idx_agent_audit_log_source`
- `idx_messages_actor_voice_filter`
- `idx_messages_actor_id` (partial: `WHERE actor_id IS NOT NULL`)

### B5 — Verify RLS is enabled on all new tables

```sql
SELECT tablename, rowsecurity
  FROM pg_tables
 WHERE schemaname = 'public'
   AND tablename IN (
     'guests', 'memory_facts', 'agent_conversations',
     'agent_turns', 'agent_artifacts', 'agent_audit_log'
   )
 ORDER BY 1;
```

Expected: every row has `rowsecurity = true`.

### B6 — Verify RLS policies exist

```sql
SELECT schemaname, tablename, policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN (
     'guests', 'memory_facts', 'agent_conversations',
     'agent_turns', 'agent_artifacts', 'agent_audit_log'
   )
 ORDER BY 1, 2, 3;
```

Expected:
- `guests` — `Users access own guests` (ALL)
- `memory_facts` — `Users access own memory_facts` (ALL)
- `agent_conversations` — `Users access own conversations` (ALL)
- `agent_turns` — `Users access turns of own conversations` (ALL)
- `agent_artifacts` — `Users access artifacts of own conversations` (ALL)
- `agent_audit_log` — `Users view own audit log` (SELECT only — writes go through service role)

### B7 — Verify triggers

```sql
SELECT event_object_table AS table_name,
       trigger_name, action_timing, event_manipulation
  FROM information_schema.triggers
 WHERE event_object_schema = 'public'
   AND event_object_table IN (
     'memory_facts', 'guests', 'agent_conversations', 'agent_artifacts'
   )
 ORDER BY 1, 2;
```

Expected: each table has its `*_updated_at` BEFORE UPDATE trigger.

### B8 — Smoke insert + RLS round-trip (fresh DB)

This requires either (a) Supabase Auth populated with a test user, or (b) a service-role client + a manually created `auth.users` row.

```sql
-- AS service-role: create a test user via Supabase Auth dashboard or:
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'test-host@example.com');

-- AS service-role: insert a property + guest + memory_fact for that user.
INSERT INTO properties (id, user_id, name)
  VALUES ('11111111-1111-1111-1111-111111111111',
          '00000000-0000-0000-0000-000000000001',
          'Test Property');

INSERT INTO guests (id, host_id, display_name)
  VALUES ('22222222-2222-2222-2222-222222222222',
          '00000000-0000-0000-0000-000000000001',
          'Test Guest');

INSERT INTO memory_facts
  (host_id, entity_type, entity_id, attribute, value, source, learned_from)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   'property', '11111111-1111-1111-1111-111111111111',
   'unlock_mechanism',
   '"pull horizontally — hurricane door, sticks if pulled straight"'::jsonb,
   'host_taught',
   '{"conversation_id":null,"turn_id":null,"source_message_text":"manual seed"}'::jsonb);

-- Verify the row landed.
SELECT id, entity_type, attribute, source, confidence, status, learned_at
  FROM memory_facts
 WHERE host_id = '00000000-0000-0000-0000-000000000001';
```

Expected: 1 row, `confidence = 1.00`, `status = 'active'`, `learned_at` populated by default.

### B9 — Verify CHECK constraint rejection

```sql
-- Should fail with check constraint violation.
INSERT INTO memory_facts
  (host_id, entity_type, entity_id, attribute, value, source)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   'property', '11111111-1111-1111-1111-111111111111',
   'attr', '"v"'::jsonb,
   'pure_speculation');                                        -- not in source enum
-- Expected: ERROR: new row violates check constraint "memory_facts_source_check"

INSERT INTO memory_facts
  (host_id, entity_type, entity_id, attribute, value, source, confidence)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   'property', '11111111-1111-1111-1111-111111111111',
   'attr', '"v"'::jsonb,
   'host_taught', 1.5);                                        -- > 1
-- Expected: ERROR: violates "memory_facts_confidence_check"

-- Sub-entity controlled vocabulary: an unknown type must be rejected.
INSERT INTO memory_facts
  (host_id, entity_type, entity_id, sub_entity_type, attribute, value, source)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   'property', '11111111-1111-1111-1111-111111111111',
   'frontdoor',                                                -- typo / not in vocabulary
   'attr', '"v"'::jsonb, 'host_taught');
-- Expected: ERROR: violates "memory_facts_sub_entity_type_check"

INSERT INTO memory_facts
  (host_id, entity_type, entity_id, sub_entity_type, attribute, value, source)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   'property', '11111111-1111-1111-1111-111111111111',
   'main_door',                                                -- spelling variant of front_door
   'attr', '"v"'::jsonb, 'host_taught');
-- Expected: ERROR: violates "memory_facts_sub_entity_type_check"

-- NULL sub_entity_type is valid (fact scoped to the property as a whole).
INSERT INTO memory_facts
  (host_id, entity_type, entity_id, sub_entity_type, attribute, value, source)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   'property', '11111111-1111-1111-1111-111111111111',
   NULL,                                                       -- explicit NULL
   'general_note', '"the property has a 2-car garage"'::jsonb, 'host_taught');
-- Expected: succeeds.

-- Each canonical sub_entity_type must be accepted.
INSERT INTO memory_facts
  (host_id, entity_type, entity_id, sub_entity_type, attribute, value, source)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'property', '11111111-1111-1111-1111-111111111111', 'front_door',         'unlock_mechanism', '"v"'::jsonb, 'host_taught'),
  ('00000000-0000-0000-0000-000000000001', 'property', '11111111-1111-1111-1111-111111111111', 'lock',               'lockbox_combo',    '"v"'::jsonb, 'host_taught'),
  ('00000000-0000-0000-0000-000000000001', 'property', '11111111-1111-1111-1111-111111111111', 'parking',            'spot_assignment',  '"v"'::jsonb, 'host_taught'),
  ('00000000-0000-0000-0000-000000000001', 'property', '11111111-1111-1111-1111-111111111111', 'wifi',               'password',         '"v"'::jsonb, 'host_taught'),
  ('00000000-0000-0000-0000-000000000001', 'property', '11111111-1111-1111-1111-111111111111', 'hvac',               'thermostat_quirk', '"v"'::jsonb, 'host_taught'),
  ('00000000-0000-0000-0000-000000000001', 'property', '11111111-1111-1111-1111-111111111111', 'kitchen_appliances', 'dishwasher_trick', '"v"'::jsonb, 'host_taught');
-- Expected: 6 rows inserted.

-- messages.actor_kind: 'guest' must be rejected (excluded from the enum).
INSERT INTO messages
  (property_id, platform, content, sender, direction, actor_kind)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'airbnb', 'test', 'guest', 'inbound', 'guest');
-- Expected: ERROR: violates "messages_actor_kind_check"

-- messages.actor_kind: NULL is valid (the canonical state for inbound).
INSERT INTO messages
  (property_id, platform, content, sender, direction, actor_kind)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'airbnb', 'test', 'guest', 'inbound', NULL);
-- Expected: succeeds.
```

All errors should fire as expected. If any succeed where they shouldn't, the CHECK constraint is wrong.

---

## Existing-data verification (the riskier path)

This is the path that runs against a database with prior data — staging or production. The new tables are empty; the only existing-data interaction is migration 4's back-population of `messages.actor_id` and `messages.actor_kind`.

### C1 — Apply migrations 1, 2, 3 only (no back-population yet)

If running against a database with prior data, apply migrations one at a time. After migrations 1-3:

```sql
SELECT count(*) FROM guests;             -- expected: 0
SELECT count(*) FROM memory_facts;        -- expected: 0
SELECT count(*) FROM agent_conversations; -- expected: 0
SELECT count(*) FROM agent_turns;         -- expected: 0
SELECT count(*) FROM agent_artifacts;     -- expected: 0
SELECT count(*) FROM agent_audit_log;     -- expected: 0
```

### C2 — Apply migration 4 (the back-population)

This is the riskiest step. The migration:
1. Adds `actor_id` (uuid, nullable) and `actor_kind` (text, default 'host') to `messages`.
2. Sets `actor_id` for all `sender = 'property'` rows by joining through `properties.user_id`.
3. Overrides `actor_kind` to `'guest'` for `sender = 'guest'` rows.
4. Overrides `actor_kind` to `'agent'` for rows where `ai_draft IS NOT NULL AND content = ai_draft`.
5. Overrides `actor_kind` to `'system'` for `sender = 'system'` rows.

### C3 — Verify back-population on production data

```sql
-- Count distribution after back-population.
SELECT actor_kind, sender, direction, count(*)
  FROM messages
 GROUP BY 1, 2, 3
 ORDER BY 1, 2, 3;
```

**Expected on the test fleet** (compare against pre-migration baseline from A1):
| actor_kind | sender   | direction | count |
|------------|----------|-----------|-------|
| host       | property | outbound  | 53    |
| NULL       | guest    | inbound   | 37    |

Total: 90. Inbound (sender='guest') rows have `actor_kind = NULL` by design — guest is not an internal actor and the column is nullable. No `agent` or `system` rows because the test fleet has none.

```sql
-- actor_id population for outbound rows.
SELECT
  count(*) FILTER (WHERE actor_id IS NOT NULL)         AS outbound_with_actor,
  count(*) FILTER (WHERE actor_id IS NULL)             AS outbound_without_actor
  FROM messages WHERE sender = 'property';
```

**Expected**: `outbound_with_actor = 53`, `outbound_without_actor = 0`.

```sql
-- actor_id should match properties.user_id for outbound rows.
SELECT m.id, m.actor_id, p.user_id, m.actor_id = p.user_id AS matches
  FROM messages m
  JOIN properties p ON p.id = m.property_id
 WHERE m.sender = 'property'
 LIMIT 10;
```

**Expected**: every row's `matches = true`.

```sql
-- For inbound (guest) rows, BOTH actor_id and actor_kind should be NULL.
SELECT
  count(*) FILTER (WHERE actor_id IS NULL AND actor_kind IS NULL)    AS clean_null,
  count(*) FILTER (WHERE actor_id IS NOT NULL OR actor_kind IS NOT NULL) AS dirty
  FROM messages WHERE sender = 'guest';
```

**Expected**: `clean_null = 37`, `dirty = 0`. Any non-NULL value on either column for an inbound row signals back-population logic mis-attributed an external party as an internal actor.

### C4 — Spot-check a few rows manually

```sql
SELECT id, sender, direction, actor_kind, actor_id,
       length(content) AS content_len,
       ai_draft IS NOT NULL AS has_draft,
       (ai_draft IS NOT NULL AND content = ai_draft) AS would_be_agent
  FROM messages
 ORDER BY created_at DESC
 LIMIT 20;
```

Manually confirm:
- Outbound (`sender='property'`) rows: `actor_kind='host'` (or `'agent'` if `would_be_agent`), `actor_id` set.
- Inbound (`sender='guest'`) rows: `actor_kind=NULL`, `actor_id=NULL`.
- No row has `actor_kind` outside the allowed enum (and no row has actor_kind='guest', which is intentionally excluded).

---

## RLS verification (authorized vs unauthorized access)

This requires a Supabase JWT for at least two test users. Best run against a staging environment where you can set `request.jwt.claims` directly or use the Supabase JS client with authenticated keys.

### D1 — User A inserts data; User A reads it back

Authenticated as user A (uuid `aaaa...`):
```sql
INSERT INTO agent_conversations (host_id, status)
  VALUES (auth.uid(), 'active') RETURNING id;
-- → returns one row, conversation_id assigned.

SELECT count(*) FROM agent_conversations;
-- Expected: 1 (the conversation User A just created).
```

### D2 — User B cannot see User A's data

Authenticated as user B (uuid `bbbb...`, different from A):
```sql
SELECT count(*) FROM agent_conversations;
-- Expected: 0 (RLS hides User A's row).

SELECT count(*) FROM memory_facts;
-- Expected: 0.

SELECT count(*) FROM guests;
-- Expected: 0.
```

### D3 — User B cannot insert as User A

```sql
INSERT INTO agent_conversations (host_id, status)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active');
-- Expected: ERROR — row violates row-level security policy.
```

### D4 — Service role bypasses RLS (sanity)

Using the service-role key:
```sql
SELECT count(*) FROM agent_conversations;
-- Expected: 1 (User A's row visible because service role bypasses RLS).
```

### D5 — Audit log: SELECT-only for authenticated users

```sql
-- As User A: should fail (no INSERT policy on agent_audit_log).
INSERT INTO agent_audit_log
  (host_id, action_type, payload, source, actor_kind, autonomy_level, outcome)
VALUES
  (auth.uid(), 'memory.write', '{}'::jsonb, 'agent_artifact', 'host', 'confirmed', 'succeeded');
-- Expected: ERROR — row violates row-level security policy (no INSERT permission).

-- As service role: should succeed.
-- (Run with service-role client.)
```

---

## FK constraint verification

### E1 — `memory_facts.guest_id` rejects a non-existent guest

As service role:
```sql
INSERT INTO memory_facts
  (host_id, entity_type, entity_id, attribute, value, source, guest_id)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   'property', '11111111-1111-1111-1111-111111111111',
   'attr', '"v"'::jsonb, 'host_taught',
   '99999999-9999-9999-9999-999999999999');                    -- non-existent
-- Expected: ERROR — foreign key violation on memory_facts_guest_id_fkey.
```

### E2 — `agent_turns.conversation_id` rejects a non-existent conversation

```sql
INSERT INTO agent_turns
  (conversation_id, turn_index, role, content_text)
VALUES
  ('99999999-9999-9999-9999-999999999999', 0, 'user', 'hi');
-- Expected: ERROR — foreign key violation.
```

### E3 — Cascade delete: removing an `agent_conversation` removes its turns and artifacts

```sql
-- Setup: create a conversation, two turns, one artifact.
INSERT INTO agent_conversations (id, host_id, status)
  VALUES ('33333333-3333-3333-3333-333333333333',
          '00000000-0000-0000-0000-000000000001',
          'active');
INSERT INTO agent_turns (id, conversation_id, turn_index, role, content_text)
  VALUES
  ('44444444-4444-4444-4444-444444444444',
   '33333333-3333-3333-3333-333333333333', 0, 'user', 'hi'),
  ('55555555-5555-5555-5555-555555555555',
   '33333333-3333-3333-3333-333333333333', 1, 'assistant', 'hello');
INSERT INTO agent_artifacts
  (id, conversation_id, turn_id, kind, payload)
VALUES
  ('66666666-6666-6666-6666-666666666666',
   '33333333-3333-3333-3333-333333333333',
   '55555555-5555-5555-5555-555555555555',
   'property_knowledge_confirmation',
   '{}'::jsonb);

-- Delete the conversation.
DELETE FROM agent_conversations WHERE id = '33333333-3333-3333-3333-333333333333';

-- Verify cascade.
SELECT count(*) FROM agent_turns WHERE conversation_id = '33333333-3333-3333-3333-333333333333';
-- Expected: 0
SELECT count(*) FROM agent_artifacts WHERE conversation_id = '33333333-3333-3333-3333-333333333333';
-- Expected: 0
```

### E4 — `messages.actor_id` SET NULL on user delete

```sql
-- Setup: a message attributed to a test user.
-- (Assumes a test user + property + message already exists from B8.)

-- Delete the test user.
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001';
-- Expected: succeeds; messages.actor_id for affected rows is now NULL.

-- (May require also cleaning up properties first per existing FK from
-- properties.user_id; that's the existing behavior, not new.)
```

### E5 — Self-FK: `memory_facts.superseded_by` SET NULL on parent delete

```sql
-- Setup: two facts, fact_b supersedes fact_a.
WITH a AS (
  INSERT INTO memory_facts
    (host_id, entity_type, entity_id, attribute, value, source, status)
  VALUES
    ('00000000-0000-0000-0000-000000000001',
     'property', '11111111-1111-1111-1111-111111111111',
     'attr', '"old value"'::jsonb, 'host_taught', 'superseded')
  RETURNING id
), b AS (
  INSERT INTO memory_facts
    (host_id, entity_type, entity_id, attribute, value, source)
  VALUES
    ('00000000-0000-0000-0000-000000000001',
     'property', '11111111-1111-1111-1111-111111111111',
     'attr', '"new value"'::jsonb, 'host_taught')
  RETURNING id
)
UPDATE memory_facts
   SET superseded_by = (SELECT id FROM b)
 WHERE id = (SELECT id FROM a);

-- Hard-delete fact_b (the newer one).
DELETE FROM memory_facts
 WHERE value = '"new value"'::jsonb
   AND host_id = '00000000-0000-0000-0000-000000000001';

-- Verify fact_a's superseded_by is now NULL (history preserved).
SELECT value, status, superseded_by
  FROM memory_facts
 WHERE host_id = '00000000-0000-0000-0000-000000000001'
   AND entity_id = '11111111-1111-1111-1111-111111111111';
-- Expected: one row, value='"old value"', status='superseded', superseded_by IS NULL.
```

---

## Trigger verification

### F1 — `updated_at` bumps on UPDATE

```sql
-- Setup: a memory fact.
INSERT INTO memory_facts (id, host_id, entity_type, entity_id, attribute, value, source)
  VALUES
  ('77777777-7777-7777-7777-777777777777',
   '00000000-0000-0000-0000-000000000001',
   'property', '11111111-1111-1111-1111-111111111111',
   'attr', '"v"'::jsonb, 'host_taught');

SELECT updated_at FROM memory_facts WHERE id = '77777777-7777-7777-7777-777777777777';
-- Note the timestamp.

-- Wait a moment, then update.
SELECT pg_sleep(1);

UPDATE memory_facts SET attribute = 'new_attr'
  WHERE id = '77777777-7777-7777-7777-777777777777';

SELECT updated_at FROM memory_facts WHERE id = '77777777-7777-7777-7777-777777777777';
-- Expected: timestamp has advanced.
```

Repeat the same shape for `guests`, `agent_conversations`, `agent_artifacts`.

### F2 — Confirm trigger does NOT exist on `agent_turns` and `agent_audit_log`

These are append-only by design — no `updated_at` column means no `*_updated_at` trigger. Verify:

```sql
SELECT event_object_table, trigger_name
  FROM information_schema.triggers
 WHERE event_object_schema = 'public'
   AND event_object_table IN ('agent_turns', 'agent_audit_log');
-- Expected: zero rows.
```

---

## Drizzle declaration check

### G1 — TypeScript type-check passes

From the repo root:

```bash
npx tsc --noEmit 2>&1 | head -50
```

Expected: zero errors. (Verified clean during Milestone 1 production.)

### G2 — Drizzle introspection matches the migration

Optional sanity check — useful to detect any drift between the Drizzle declarations and the SQL migrations. Not required for milestone sign-off but recommended once before Phase 1 closeout.

```bash
# In a working tree, against the migrated DB:
npx drizzle-kit generate --schema=src/lib/db/schema.ts --out=tmp_drizzle_diff
# Inspect tmp_drizzle_diff/*.sql — expected: empty diff.
rm -rf tmp_drizzle_diff
```

If the diff is non-empty, the Drizzle declarations and the hand-written SQL have drifted. Reconcile before the next milestone.

---

## Failure handling and rollback

### H1 — Rollback procedure if back-population produces wrong attribution

If post-C3 verification shows wrong `actor_kind` distribution:

```sql
-- Re-attribute from the snapshot taken in A4.
UPDATE messages m
SET
  actor_id   = NULL,
  actor_kind = 'host'
FROM messages_pre_milestone1_snapshot s
WHERE m.id = s.id;

-- Then re-run the back-population logic with corrected detection.
```

If the back-population logic itself is wrong (rather than just data), the safer rollback:

```sql
ALTER TABLE messages DROP COLUMN IF EXISTS actor_id;
ALTER TABLE messages DROP COLUMN IF EXISTS actor_kind;
DROP INDEX IF EXISTS idx_messages_actor_voice_filter;
DROP INDEX IF EXISTS idx_messages_actor_id;
```

Then revise migration 4 and re-apply.

### H2 — Rollback procedure for the new tables

Order matters (FK dependencies):

```sql
DROP TABLE IF EXISTS agent_audit_log CASCADE;
DROP TABLE IF EXISTS agent_artifacts CASCADE;
DROP TABLE IF EXISTS agent_turns CASCADE;
DROP TABLE IF EXISTS agent_conversations CASCADE;
DROP TABLE IF EXISTS memory_facts CASCADE;
DROP TABLE IF EXISTS guests CASCADE;
DROP FUNCTION IF EXISTS set_memory_facts_updated_at();
DROP FUNCTION IF EXISTS set_guests_updated_at();
DROP FUNCTION IF EXISTS set_agent_conversations_updated_at();
DROP FUNCTION IF EXISTS set_agent_artifacts_updated_at();
```

(Cascading function drops aren't usually necessary because the triggers DROP CASCADE handles that, but listing them explicitly avoids leftover orphan functions.)

### H3 — When NOT to roll back

- A small number of `actor_kind` rows misattributed (e.g., a few host-typed messages got tagged `agent` because the host happened to send a draft verbatim) is acceptable signal noise; correct in place rather than rolling back.
- An RLS policy producing too-restrictive results (User A can't see their own data) means the policy is wrong but the schema is fine — `DROP POLICY` and re-create.
- An index showing up missing in B4 — `CREATE INDEX IF NOT EXISTS` it manually rather than re-running the migration.

---

## Sign-off checklist

Before marking Milestone 1 complete:

- [ ] A1-A4 pre-migration baseline captured.
- [ ] B1-B9 fresh-database verification clean.
- [ ] C1-C4 existing-data verification clean (run against staging first).
- [ ] D1-D5 RLS verification clean.
- [ ] E1-E5 FK constraint verification clean.
- [ ] F1-F2 trigger verification clean.
- [ ] G1 type-check clean.
- [ ] (Optional) G2 Drizzle introspection clean.
- [ ] Production back-population row counts match expected (Cesar's fleet: 53 host / 37 guest / 0 agent / 0 system).
- [ ] `messages_pre_milestone1_snapshot` table retained for at least 7 days; dropped after observation.

Once these pass, Milestone 1 is done and Milestone 2 (memory retrieval handler + memory write helper) can begin.
