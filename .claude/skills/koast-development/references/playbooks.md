# Playbooks

Repeatable session patterns extracted from sessions 5a/5b/6.x. Consult
when a session matches one of the named triggers below — picking the
right playbook up front saves the mid-session pivots that produce
muddled work.

## Diagnostic-first session

When to use:
- Scope is unclear or the codebase state is uncertain
- The session involves data flows we haven't fully verified
- Prior sessions left ambiguity about what shipped vs what's stubbed

Pattern:
1. Read CLAUDE.md, repomix, and any relevant skills
2. Investigate without modifying: grep code, query DB, probe APIs
3. Report findings as a structured document with:
   - File:line references for every claim about code state
   - Concrete DB row counts / response shapes
   - Distinct bugs separated from architectural questions
4. End with "Recommended scope" so Cesar can approve or adjust
   before any code is written
5. Wait for Cesar's go-ahead. Do not start implementing in the
   same session.

Anti-pattern:
- Combining diagnose + implement in one session. The diagnostic
  reveals scope changes; mid-session pivots produce muddled work.
- Writing a fix based on assumed root cause before confirming it.
  Today's "Reviews page already submitted" error came from an
  assumed double-click race; real cause was different and only
  visible after probing the DB.

Real examples from prior sessions:
- Session 6.1 audit (diagnostic-only) → 8 bugs identified with
  file:line cause for each. Session 6.1a then fixed all 8 in one
  coherent pass.
- Session 6.3 pre-flight discovered Channex /bookings excludes
  historical bookings → original 6.3 scope rewritten before code.
- PropertyDetail audit (2026-04-26) → 14 bugs + tech-debt picked
  up with file:line. Then PD-V1 (visual) + PD-B1 (behavioral)
  shipped as two distinct commits, each on a feature branch with
  Vercel preview gate. The audit is what made the V/B split
  obvious — without it we'd have bundled visual + behavioral churn
  into one commit and increased revert blast radius.

## Scheduled-write worker with idempotency table

Pattern for any worker that creates user-facing content on a
schedule (vs reading/reconciling existing data). First example
in Koast: `messaging_executor.py` (Session 8a, 2026-04-27).
Earlier workers (`pricing_validator.py`, `booking_sync.py`,
`messages_sync.py`, `reviews_sync.py`) are read-only or
ingest-only — none write user-visible content.

The shape:

1. **Idempotency table.** Side table with full UNIQUE constraint
   on `(source_id, target_id)`. Worker uses
   `INSERT INTO firings (source_id, target_id) ON CONFLICT DO
   NOTHING RETURNING id` to detect first-time fires. **No
   partial unique index** — see `conventions.md` "Database
   conventions — partial indexes" for why partial UNIQUE breaks
   PostgREST upserts. Match the convention even though the
   worker writes via psycopg2, not PostgREST — future API
   routes may upsert into the same table.
2. **Write content only when RETURNING gives a row.** If the
   firings insert hits the conflict, the worker has already
   processed this `(source, target)` pair and must not produce
   a duplicate draft / message / notification.
3. **Backfill the firings row with the content row's id.** Two
   writes per fire: first the firings INSERT (idempotency
   gate), then the content INSERT, then UPDATE firings.x_id =
   content.id. The firings row is now self-contained for audit.
4. **Per-row try/except.** One bad source row (e.g. a malformed
   template body) must not poison the run. Catch + log + skip.
5. **Lookback window.** Don't fire ancient sources. The
   messaging executor uses `now() - 7 days`. Without a window,
   re-enabling the worker after downtime fires every backfill
   from the beginning of time.
6. **Structured per-row logs.** Include the firings_id and the
   content_id in the log line so a "did this fire?" question
   can be answered with a single grep.

Real example: `~/koast-workers/messaging_executor.py`.
Firings table = `message_automation_firings`. Source =
`message_templates`. Target = `bookings`. Content =
`messages` rows with `draft_status='draft_pending_approval'`.
Lookback = 7 days. Cadence = hourly via systemd.

The discard-vs-firings split (D4 from 8a) is the second part of
this pattern: the firings row is the idempotency source of
truth, not the eventual state of the content row. A discarded
draft does NOT remove the firings row — the worker must NEVER
re-fire on a `(source, target)` pair regardless of whether the
content was approved, sent, discarded, or even hard-deleted.
This decouples "did the fire happen?" from "what happened to
the resulting content?" and is the only invariant that holds
under all UI behavior.

## RENAME COLUMN doesn't update CHECK constraints

Postgres preserves CHECK constraints by name across `ALTER TABLE
RENAME COLUMN`. The constraint's expression is still bound to the
new column name internally — but if the constraint's accepted
value list was specific to the old semantics (e.g. union of
`('none','pending','generated','approved','sent')` on
`ai_draft_status`), the constraint **continues to enforce the
old union** even though the column is now `draft_status` with a
broader expected union (now including
`'draft_pending_approval'` and `'discarded'`).

This bit Session 8a's supervised first run: the runtime
discovery happened mid-execution because the synthetic INSERT
hit a `CHECK violation` despite the migration looking clean.
Fix was a follow-on `ALTER TABLE ... DROP CONSTRAINT IF EXISTS`
captured in migration `20260427020000_drop_obsolete_messages_draft_status_check.sql`.

**Convention going forward**: any `RENAME COLUMN` migration on a
column that has CHECK constraints needs to either DROP the old
CHECK explicitly OR re-CREATE it with the updated expression in
the same transaction. `\d <table>` post-migration confirms the
constraint state. Better: avoid CHECK constraints on text-union
fields where the union is expected to grow — document the union
via `COMMENT ON COLUMN` instead, like Session 8a did.

## Migration + code coordination (deploy-order rule)

Vercel auto-deploys from `main` on push. Supabase migrations
do **not** auto-deploy — they're applied manually via
psycopg2 service role from the workers venv. The two surfaces
are independent. Merging a code-and-migration pair to main in
the wrong order opens a window where production code references
columns that don't exist on the live schema.

**Always migration-first.** When a session ships a coordinated
schema change + code change:

1. Apply the migration file to the live Supabase DB via
   psycopg2 service role (`from db import get_connection;
   conn.execute(open(migration_path).read())` — single
   transaction).
2. Verify the migration succeeded with three probes:
   - `information_schema.columns` for column rename / add.
   - `to_regclass('public.<new_table>')` for table creation.
   - `pg_indexes` for new indexes / unique constraints.
3. Then merge the code branch to `main` (Vercel auto-deploys).
4. Verify the route the migration unblocks renders correctly
   (the verification gate from the original session prompt —
   step 1 of the test path is usually "page loads cleanly").

Migration-first ordering means the live schema is always
at-or-ahead of the live code. Code-first ordering means there's
a window — between code merge and migration apply — where any
host hitting the affected route gets a broken render because
PostgREST returns an error on the unknown column / table, and
the route handlers' `data ?? []` fallback masks it as an empty
result rather than a 500.

Real example: Session 8a (2026-04-27) shipped the rename
`messages.ai_draft_status` → `messages.draft_status` plus the
new `message_automation_firings` table. Code merged to main in
the morning, migration didn't apply until ~6 hours later.
During that window, `/messages` rendered "No messages in this
conversation yet" for every thread because the merged thread
route selected `draft_status` (live DB still had
`ai_draft_status`). Symptom looked like a UI bug; root cause
was a deploy-order gap. The fix was applying the migration —
no code change needed — and the session-8a commit body now
includes the migration-apply step as part of the merge ritual.

Failure mode to watch: a session prompt's verification path
includes "render the page that uses the new column" as gate
1, and that gate gets skipped during the merge handoff
because the merge confirmation reads as "shipped." If the
gate ran pre-merge (or even immediately post-merge before
moving on), the broken render would surface. Don't move on
from a merge until the gate-1 render check is run.

Anti-pattern: assuming the Vercel preview build's success
implies the route works in production. Vercel preview builds
the code; it doesn't apply the migration. The preview can
build green and the production page can still 500 the moment
production points at the new code.

## Replacement-coverage audit before disabling workers

When a migration session plans to disable existing systemd
units, cron jobs, or background workers, the audit phase must
**verify** — not assume — that each one has a confirmed
replacement actually running. "Listed in a repo" or "planned
for next session" is not a replacement.

**The check, per unit being disabled:**
1. Name the workload (the script or job, e.g.
   `booking_sync.py every 15min`).
2. Name the live replacement that runs the same workload
   (e.g. `koast-booking-sync.timer`).
3. Verify the replacement is currently active:
   - `systemctl is-active <new-unit>` returns `active`
   - `systemctl list-timers` shows it in the upcoming list
   - The replacement's last successful run is recent enough
     that we believe it actually does the work
4. If any of those three checks fails, halt and surface the
   gap. Don't disable.

**Halt condition phrasing for migration prompts:**

> For each existing unit being disabled, what is the running
> replacement, and how is it verified? If a replacement is
> not yet running, halt — don't disable an orphan that's the
> only running version of its workload.

Real example: BR1 Phase 4 (2026-04-29) listed three orphan
systemd units (`staycommand-bookings`, `staycommand-pricing`,
`staycommand-market`) for disable+rename. The plan's mental
model assumed they had koast-* replacements from a prior
worker-rename session (WK1). Pre-flight revealed:
- `staycommand-bookings` (booking_sync.py every 15min) had
  NO koast-booking-sync.timer anywhere — it was the only
  thing running booking sync.
- `staycommand-pricing` (pricing_worker.py every 6h) was
  conflated with koast-pricing-validator.timer, but those
  run different scripts (pricing_worker.py vs
  pricing_validator.py).
- `staycommand-market` was the only one genuinely retired
  (workload intentionally stopped per CLAUDE.md).

Disabling 1 and 2 without committing replacement units to
the workers repo first would have stopped booking sync and
the every-6h pricing recalculation entirely, with no
self-healing path. The halt-condition guard caught it
before any change landed.

Failure mode this prevents: a "rename in place" instinct
during the disable step that masquerades as cleanup but
silently retires a live workload. The audit must distinguish
"renamed" from "replaced" — renaming a unit file isn't the
same as having a different unit doing the same work.

## Multi-phase migration with read-only pre-flight

For migrations that touch state across systems (paths,
processes, external services, config, database), structure
the session as: read-only audit → checkpoint → action
phases with pause-and-verify between. The audit verifies
upstream assumptions before any state change.

Pattern (from BR1 night, 2026-04-28):
1. **Audit phase (read-only).** Inventory every surface
   that will change. Verify each assumption that the next
   phase rests on. Output a structured report: what we
   expect to find vs. what we actually find.
2. **Pre-flight halt.** User reviews the audit. Discrepancies
   between expected and actual state become the starting
   point of the next phase, not items to discover mid-action.
3. **Action phases, each with checkpoints.** Each phase is
   small enough that rollback is easy. After each, verify
   the system is still in a coherent state before
   proceeding.
4. **Verification phase.** Asymmetric verification per the
   conventions doc: confirm the new state behaves correctly
   AND the old behavior is genuinely retired.

Worked example: BR1 Phase 4 (staycommand → koast VPS
migration) ran a read-only audit before any directory mv,
systemd change, or env edit. The audit caught:
- 2 of 3 staycommand-* "orphan" units had no koast-*
  replacement (would have silently retired live workloads
  if disabled blindly)
- 3 services in failed state with a single shared root
  cause (wrong /var/log/ path, fixed by Phase 4E mkdir)
- systemd unit-file content still pointing at /home/ubuntu/
  staycommand-workers/ even though filenames were
  koast-prefixed (the rename was filename-only, not
  content)

Each finding redirected what Phase 4B-4G actually had to
do. The session shipped clean because the audit caught
the assumptions before the action.

Failure mode this prevents: shipping a "mechanical sweep"
that's mechanical only on the surface. Real migrations
have texture — old units, stale assumptions, hidden state.
The audit phase is the cheapest place to find the texture.

## Brand identity development workflow (multi-session arc)

Production brand work doesn't fit a single session. The
arc that worked for Koast (2026-04-29 → 2026-04-30):

**Phase 1 — Strategic positioning, in chat (no design work yet).**
Lock the audience, the category-creation claim (or absence
of one), the brand-vs-feature distinction, the reference-
brand register. Nothing visual. The strategic frame
determines whether the visual frame is solvable.

**Phase 2 — Color palette evolution, before logo.**
Decide the accent system before the symbol. The palette
becomes a constraint on what the logo can do, not a
parallel decision. For Koast: cool teal AI accent locked
before any logo iteration; the metaphor and the logo had
to fit *into* that palette, not draft alongside it.

**Phase 3 — Logo iteration via structured decision trees.**
Don't generate flat n-ups of variations. Use the design
skill's strength: explore breadth across genuinely
distinct conceptual territory, then narrow via cascading
single-variable decisions (terminal → weight → optical
sizing → gap size, each isolated). The "Aperture-O"
iteration in L3-iter2 is the worked example.

**Phase 4 — Different sessions for different surfaces.**
Strategic reasoning in chat, generation in the Adobe
connector / banana / svg-design skill, integration in
Claude Code on the VPS. Each is good at one thing.
Cross-session integration is friction — expect a
zip-and-handoff workflow until cross-Claude memory
improves.

**Phase 5 — Cross-session brief.** When work moves from
one Claude to another, the human is the bridge. Brief the
new Claude explicitly with deliverables, file paths,
branch names, and locked decisions. Don't rely on
"Claude Code can read the same files" — it can read but
doesn't know which decisions are open vs closed without
explicit briefing. (See "Cross-Claude context handoffs"
in conventions.)

What didn't work: fixed the metaphor in advance ("it's a
wave"), tried to nail it in one session, used the same
Claude instance for all three phases. Iteration produced
incremental improvement without breakthrough — until the
strategic territory was sharpened to "accumulated memory
vs. instantaneous genius" in Phase 1, then everything
downstream resolved.

## Two-headed sync subsystem (cross-repo coordination)

When a feature spans both `koast` (Next.js + DB) AND
`koast-workers` (the companion private repo on the VPS),
each repo gets its own commit. Pattern:

1. Branch on each repo with parallel naming
   (`session-Nx-feature` on both).
2. Land the koast-side changes (migration, API routes,
   UI) on its branch. Push, wait for Vercel preview green,
   merge to main.
3. Land the workers-side changes (new `.py` worker, systemd
   units, requirements bump) on the workers repo branch.
   Push, merge to main.
4. Each commit body cross-references the companion commit
   hash so future archaeology can stitch the two together.
5. Deployment on the VPS: `cd ~/koast-workers && git
   pull && sudo systemctl daemon-reload`. Supervised-first-run
   gate before flipping any new timer on (per `tech-debt.md`
   "Worker timers not yet enabled").

Real example: Session 8a (messaging executor) — koast
commit `c870cfa` (migration + UI + API) and workers commit
`306f78d` (initial worker repo extraction) reference each
other in their bodies.

The repo split is operational, not architectural — the
two-headed pattern existed pre-split (workers as an
unversioned dir on the VPS); the WK1 session just gave the
worker side a real history.

## Visual + behavioral split (V→B sessions)

When to use:
- A surface needs both visual primitive migration AND behavioral
  correctness fixes
- The visual changes touch tokens / primitives only and the
  behavioral changes touch data fetching / API routes / state

Pattern:
1. Audit the surface read-only (Diagnostic-first playbook above).
2. Split the audit findings into two buckets: V (visual-only,
   primitive swaps, token migration, no behavior change) and
   B (behavioral, API routes, query collapse, missing
   loading/error boundaries, validation, etc.).
3. Plan + ship V first as one commit on a feature branch
   (`<surface>-v1`). Push, wait for Vercel preview green, merge
   to main.
4. Plan + ship B second as a separate commit on its own feature
   branch (`<surface>-b1`). Same gate. Merge to main.
5. Defer further behavioral expansion (new features, new columns
   surfaced) to a B2 session.

Why split:
- Visual diffs are hard to read when behavior also changed; the
  V commit's diff should be near-pure render-tree restructuring.
- A bad V commit reverts cleanly without losing the B fixes; a
  bad B commit reverts cleanly without losing the V polish.
- Each commit has a single failure mode in the Vercel preview
  gate.

Real example:
- `/properties/[id]` (2026-04-27): PD-V1 (`a752dfa`) shipped 10
  visual tasks (TabBar, StatusBanner, empty states, button,
  FormControls extract, keyframes, tokens, doc fix). PD-B1
  (`7c1cce8`) shipped 9 behavioral tasks (href bug, loading.tsx,
  error.tsx, not-found.tsx, zod schema, PUT handler, handleSave
  migration, query collapse, reviews bound). Each was a single
  feature branch + Vercel preview gate + main merge. Net: clean
  diffs, easy revert path, no pivots mid-session.

Anti-pattern:
- Bundling visual + behavioral in one commit because "they're in
  the same file." The PR review pain compounds; reverts get
  ugly.

## Probe-then-implement against an external API

When to use:
- Writing code that calls a Channex/OTA endpoint not yet probe-
  validated in our skills
- About to depend on an undocumented or partially-documented API
  shape

Pattern:
1. Web-fetch the relevant docs page first
2. Run ONE safe probe:
   - Garbage payload (non-JSON or completely empty) to see
     parse-stage behavior
   - OR an idempotent re-write of an existing value
3. Report the actual shape, status code, error structure
4. Wait for Cesar's approval before any write code based on the
   findings

Anti-pattern:
- "Malformed but plausible" probes against live endpoints.
  Channex's shape-only validation accepts garbage with HTTP 200,
  which writes ghost state to the connector. See channex-expert
  quirk #19 — this happened on review HM2NAQZ542 and required a
  blocking migration.

Real examples from prior sessions:
- Session 6.2 pre-session probe established
  /reviews/:id/guest_review payload shape but contaminated one
  row by being too aggressive on the second probe.
- Session 6.3 pre-flight probed /bookings and /booking_revisions
  with safe GETs only — discovered the historical-bookings TTL
  before any code was written.

## Implementation with safety rails for external writes

When to use:
- Shipping a feature that writes to an external system (OTA,
  Channex, payment processor, anything we don't control)
- The external system has weak validation OR ambiguous
  acknowledgment semantics

Pattern:
1. Three-timestamp tracking when applicable:
   - intent_at: user/system initiated the action
   - acked_at: external system returned success
   - confirmed_at: downstream verification (poll/webhook/sync)
     proved the action actually took effect
2. Validate payload client-side AND server-side. Don't trust the
   external system to enforce constraints (it often won't).
3. Stamp intent BEFORE the external call to prevent double-click
   races. Rollback the stamp on call failure. Stamp acked AFTER
   success.
4. Real error messages on the client. No hardcoded "Failed"
   toasts. Surface the underlying error.
5. UI shows the distinct states honestly. "Submitted, pending"
   ≠ "Confirmed."
6. Roll back at EVERY exception layer, not just the typed-error
   catch. The inner try/catch around the external call only
   handles classified errors (typed exceptions, e.g.
   ChannexValidationError); unhandled exceptions between the
   stamp and the typed catches — client instantiation throws,
   lock re-read failures, validation runtime errors — bypass the
   inner rollback and orphan the row. Mirror the rollback in the
   outer catch, conditional on `acked_at IS NULL` so a post-ack
   throw can't undo a real submission. State cleanup is
   independent of error classification and must run on every
   error path.

Anti-pattern:
- Treating external 2xx as confirmation. Channex returns 200 on
  shape-valid garbage that the OTA will reject silently
  downstream. Our DB ends up showing "submitted" while the guest
  sees nothing.
- Single timestamp ("submitted_at") collapses three distinct
  states into one. Hosts can't tell from the UI whether their
  action actually reached the OTA.
- Inner-only rollback. Returning a 500 from the outer catch
  without rolling back leaves the row stuck in submitted-state
  forever; the host sees "Submitted, pending" with no
  acknowledgment ever arriving. This produced the orphan on
  review 321d7369 (Session 6.4 diagnostic, Session 6.5 fix).

Real examples from prior sessions:
- Session 6.2 shipped three-timestamp guest-review tracking
  (submitted_at / channex_acked_at / airbnb_confirmed_at) after
  the probe lesson.
- Session 5a/5b BDC pricing path uses buildSafeBdcRestrictions
  for similar reasons (10% whiplash threshold treats Channex's
  acceptance as untrusted).
- Session 6.5 added outer-catch rollback to submit-guest-review
  after diagnosing the 321d7369 orphan, and shipped is_expired
  gating on the Reviews UI. Lesson encoded as channex-expert
  quirks #21 + #22.

## Probe → write → verify chain for live tests

When to use:
- Validating that a write works end-to-end after an implementation
  session
- Cesar needs to confirm the feature works against the real
  external system before considering it shipped

Pattern:
1. Cesar drives manually via the UI (not Claude Code automation)
2. Use the smallest safe value for the first live test (5-star
   review, low-controversy reply, $1 rate delta, etc.)
3. Verify on the external system's own dashboard, not just
   Koast's DB
4. Report all three states: intent (Koast), acked (Channex),
   confirmed (OTA dashboard)
5. If any state is missing, debug before doing more live tests

Anti-pattern:
- Letting Claude Code automate live writes. Real commercial
  actions need a human in the loop.
- Verifying only via Koast's DB. The DB shows what we think
  happened, not what actually happened upstream.

Real examples from prior sessions:
- Session 5b multi-date push: Cesar manually edited rates,
  Claude verified Airbnb host dashboard reflected the change
  within 5-15 minutes.
- Session 6.2 deferred live submission test for exactly this
  reason — the probe contamination showed why automation alone
  isn't enough.

## Two-headed sync subsystem

When to use:
- Building a sync between Channex (or any external system) and
  Koast where (a) the host needs an immediate manual trigger
  and (b) a steady-state background pull also has to run.

Pattern:
1. Single canonical TS helper in `src/lib/<feature>/sync.ts`
   that owns the upsert + transformation logic.
2. The `/api/<feature>/sync` route is a thin wrapper around the
   helper (auth check + call).
3. The same helper is invoked non-blocking from on-connect
   trigger sites (import handlers, channel activation, etc).
   `void helper(prop).catch(err => console.error(...))` shape so
   the import response returns immediately.
4. A Python worker at `~/koast-workers/<feature>_sync.py`
   mirrors the upsert logic for the steady-state timer-driven
   pull. Reuses booking_sync.py auth + logging patterns
   (file+stdout logs at /var/log/koast/<feature>.log).
5. Cross-language consistency: both implementations write the
   same DB columns with the same predicates. When one changes,
   the other follows in the same commit when possible. The
   Python worker carries an inline comment pointing back to the
   TS helper as canonical.

Anti-pattern:
- Worker-only sync: hosts hit "Refresh" and nothing happens for
  20 min. Bad UX on first connect.
- Route-only sync: works for refresh + on-connect, but a host
  who closes the tab for a week sees stale data.
- Helper duplicated TS-side AND in the route's body: drifts.
  One canonical implementation, route is a thin caller.
- Letting the on-connect trigger block the import response:
  Channex outage → import looks broken to the host even though
  the property write succeeded.

Real examples:
- `~/koast-workers/booking_sync.py` ↔ `src/lib/bookings/upsert-from-channex.ts` ↔ `/api/properties/[id]/sync-bookings/route.ts`
  (booking sync since Session 6.3).
- `~/koast-workers/reviews_sync.py` ↔ `src/lib/reviews/sync.ts` ↔ `/api/reviews/sync/route.ts`
  (reviews sync since Session 6.6/6.7; on-connect trigger added
  to /api/properties/import, /api/channex/import, and
  /api/channels/connect-booking-com/activate).
- `~/koast-workers/messages_sync.py` ↔
  `src/lib/messages/sync.ts` ↔ `/api/messages/sync/route.ts`
  (messaging sync since MSG-S1; webhook is the realtime path
  with the worker as 60-min reconciliation since Channex
  doesn't echo property-originated outbound POSTs).

## Three-stage write pattern for unreliable downstreams

When Koast writes through Channex (or any external system that
acks before its own downstream confirms), persist three distinct
timestamps so the UI can honestly tell the host "we tried / they
acked / they delivered." Single timestamp ("submitted_at") collapses
three states and produces the orphan-stuck-in-pending-state bug.

The three timestamps:
1. `<action>_submitted_at` — host clicked Submit, lock acquired,
   intent recorded.
2. `<action>_channex_acked_at` — Channex returned 2xx. NOT
   confirmation that the OTA accepted (per channex-expert quirk
   #19 — Channex validates payload SHAPE only, OTA validates
   content async).
3. `<action>_ota_confirmed_at` — next sync (worker or webhook)
   sees the property-side write echoed back from the OTA;
   matches by id + body. ONLY at this point do we tell the host
   "delivered."

Inner-AND-outer rollback required. Returning a 500 from the
outer catch without rolling back leaves the row in
submitted-state forever; host sees "pending" with no
acknowledgment ever arriving. Both layers gate rollback on
"channex_acked_at IS NULL" so a post-ack throw can't undo a
real submission.

Real examples:
- Reviews counter-review submit: Session 6.2 shipped the three
  stamps, Session 6.5 added the outer-catch rollback after
  diagnosing the 321d7369 orphan.
- Messaging outbound send (MSG-S2 Phase B.1): the same three
  columns added at slice-1 schema-time per MSG-S2-PRE Q9 so
  slice 2 didn't need a follow-up migration.
- TURN-S1a's Notify path doesn't need the third stamp because
  Twilio's `delivered` status arrives via a different mechanism
  (the StatusCallback URL pattern, currently unimplemented —
  see tech-debt's "sms_log.status reconciliation gap").

The lesson is never "Channex 200 means done." It means "Channex
shape-validated and queued for the OTA." The OTA reply is the
only delivery proof.

## Channel attribution stamped at sync time, not derived at read time

When ingesting from a multi-channel external system (Channex
serving Airbnb + BDC + Vrbo), persist the channel identity on
the local row at sync time. Do NOT derive it at read time from
adjacent joins.

Established the hard way during reviews. REVIEWS_DATA_TRUTH §2.4:
the original `pending/route.ts:170-178` derived `platform` from
the linked booking with hardcoded `"airbnb"` fallback when no
booking matched. This was correct-by-accident in production
(every review had no booking link AND every review was Airbnb).
The moment BDC reviews land, the fallback fires and every BDC
review renders as "airbnb."

Fix is a stamped column on the local row. Reviews learned this
late and added `channel_code` retroactively in RDX-3.
Messaging applied the lesson upfront — `message_threads.channel_code`
+ `provider_raw` are stamped from `attributes.provider` at
sync-time (`buildThreadRowFromChannex` in
`src/lib/webhooks/messaging.ts`).

Preserve the raw provider string in a separate column too —
the casing surprise (`AirBNB` / `BookingCom` per channex-expert
quirk #27) is recoverable if you stored both.

When you spot a "platform" or "channel" derived at read time
from a join chain that isn't always populated, that's the
shape of this bug.

## Optimistic UI + retry on external-API writes

Pattern for any UI write that goes through a route → external
API where the round trip takes >500ms and may fail. Established
MSG-S2 composer (commit `3c5167b`).

Recipe:
1. UI generates a client-side `clientId` (e.g. `tmp_<rand>`)
   for the optimistic row.
2. Insert the temp row into the local list immediately, render
   with status='sending' (visually muted: 55% opacity, "Sending…"
   timestamp suffix).
3. POST the write to the route.
4. On 2xx: replace the temp row with the real one returned by
   the route, status='sent'. Use the same React key (the
   clientId) so DOM continuity holds.
5. On 4xx/5xx: keep the temp row visible, status='failed' (red
   border + inline error text + Retry button). Do NOT silently
   discard.
6. Retry button re-submits the same body, re-uses the same
   clientId, flips back to status='sending', repeats.
7. Server-side complement: in-flight dedup on (target_id,
   body_hash) for 5s prevents host-double-tap from creating two
   downstream writes when the route's external API doesn't
   support an idempotency key. See MSG-S2's
   `/api/messages/threads/[id]/send` route for the canonical
   implementation.

The key is: failed writes stay visible. The host's mental model
is "I sent that thing"; if it fails silently and disappears,
they never know to retry. If it stays visible with a Retry
button, it self-heals.

Forward-compat with the three-stage write pattern: the
optimistic UI shows status='sent' on Channex 2xx, but the
underlying row's `<action>_ota_confirmed_at` doesn't stamp until
the next sync sees the echo. Two parallel trackers; UI prefers
the optimistic one for responsiveness.

## Postgres trigger fires Next.js internal route via pg_net

Architecture for "auto-react to a row that lands in Postgres regardless
of which code path inserted it." Established TURN-S1a (cleaning_tasks
auto-create on bookings INSERT/UPDATE).

Pieces:
1. `pg_net` extension installed in the standard `extensions` schema.
2. Trigger function (`SECURITY DEFINER`, `SET search_path = public,
   extensions, vault`) reads two `vault.decrypted_secrets`:
   - `<feature>_app_url` — the app's base URL.
   - `<feature>_trigger_secret` — a 32-byte hex random.
   Falls into a `RAISE WARNING; RETURN NEW;` branch if either secret
   is missing — never blocks the parent INSERT.
3. Trigger fires `net.http_post(url, body, headers)` with
   `Authorization: Bearer <vault_secret>` + the same secret value
   in Vercel env (e.g. `INTERNAL_TRIGGER_SECRET`). Fire-and-forget at
   the SQL level; result lands in `net._http_response` async.
4. New `/api/internal/<feature>` route. Auth via shared
   `src/lib/auth/internal.ts:assertInternalAuth(request)` —
   constant-time compare against `process.env.INTERNAL_TRIGGER_SECRET`,
   401 on miss including when env is undefined.
5. Route loads the row, runs the side-effect (idempotently — the
   trigger may fire twice), returns `{created, ...}` for ad-hoc
   debugging.
6. Reconciliation safety net: keep the existing manual-backfill /
   worker path. pg_net does NOT retry on HTTP failure; failed POSTs
   land in `net._http_response` with non-2xx status. Don't design
   so this path is the only writer.

Operational queries during a soak:
```sql
-- Was the http_post fired?
SELECT count(*) FROM net._http_response
  WHERE created > now() - interval '24 hours';
-- For inert-stage soak this should be 0.
-- For active stage this should match qualifying row insert volume.

-- What did the route return?
SELECT id, status_code, content::text FROM net._http_response
  WHERE created > now() - interval '1 hour' ORDER BY created DESC LIMIT 10;
```

Real example: `bookings_fire_turnover_task` trigger →
`/api/internal/booking-created` → `createCleaningTask`
(TURN-S1a, commit `e594f2a` + 2b activator).

Related: "Two-stage trigger cutover" below — the recommended
pattern for shipping a new pg_net trigger to prod when there's no
staging environment.

## Two-stage trigger cutover (inert → activated)

Pattern for shipping a new pg_net (or any external-write) trigger
to prod when there's no staging environment OR when you want a
conservative gate even with one. Established TURN-S1a Amendment 4.

Stage 2a — install inert
- Migration creates the trigger + function. Function's first
  executable line is `RETURN NEW;` — short-circuits before any
  external-write.
- Real body lives BELOW the early return as a comment block,
  preserved verbatim so reviewers see the whole design.
- Trigger fires on every qualifying row but does nothing.
- Validates: extension installed, function compiles, trigger
  doesn't break parent INSERTs under real production traffic.

Soak ≥24h with two queries clean:
```sql
SELECT count(*) FROM bookings WHERE created_at > now() - interval '24 hours';
-- Matches expected ingest cadence. Drop = trigger is somehow
-- blocking inserts despite the early return. Abort + DROP TRIGGER.

SELECT count(*) FROM net._http_response WHERE created > now() - interval '24 hours';
-- MUST be 0 throughout 2a. Any non-zero row = the early-return
-- is leaky. Abort + DROP TRIGGER + investigate.
```

Stage 2b — activate body
- Single follow-up commit, ~one file.
- `CREATE OR REPLACE FUNCTION` with the real body uncommented.
- Smoke test immediately post-apply: insert a synthetic test row,
  observe `net._http_response` populates with a 2xx, observe the
  side-effect lands.

Emergency disable in either stage: `DROP TRIGGER IF EXISTS <name>
ON <table>;` — single SQL, < 60s, no deploy. Function can stay
for forensics.

Related: "Postgres trigger fires Next.js internal route via
pg_net" above for the architecture this stages.

## BEGIN/ROLLBACK migration validation against prod

> **Status (2026-05-01):** the agent loop v1 work formally surfaced
> the no-staging-Postgres situation as a Koast-wide gap blocking
> Phase 1 milestone rollout. Setting up real staging is its own
> session of infrastructure work. Until that lands, the patterns
> below remain the canonical safety techniques. Resumption-ready
> context: `~/koast/docs/architecture/agent-loop-v1-milestone-1-baseline.md`.

When there's no staging Postgres, validate that a new migration
parses + applies cleanly without altering state:

```sql
BEGIN;
\set ON_ERROR_STOP on
-- paste migration body here
ROLLBACK;
```

Run via `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f -` from a
script. rc=0 + the expected sequence of `CREATE TABLE / ALTER
TABLE / CREATE INDEX` STDOUT lines = the migration would apply
cleanly. ROLLBACK reverts everything (including any pre-flight
SELECTs you do before the changes).

Bundle multiple migrations in one BEGIN/ROLLBACK to validate the
order. Used in TURN-S1a (FK + UNIQUE migration plus pg_net
trigger migration validated together; rc=0 with one expected
NOTICE about the IF EXISTS DROP).

Doesn't validate runtime behavior — only SQL parse + apply
shape. For runtime validation see "Two-stage trigger cutover"
above (the inert soak IS the runtime test for new triggers).
