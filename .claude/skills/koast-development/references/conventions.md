# Koast Working Conventions

Cesar is a solo founder. Sessions are the unit of work; each one
should leave the repo in a cohesive state.

## Session numbering

| Prefix | Scope |
|---|---|
| `5a.X` | Polish-pass calendar work (sidebar, rate cards, sync). `.X` for sub-sessions (5a.1, 5a.6, etc.). |
| `5b.X` | Polish-pass calendar multi-date / bulk-edit / master-push. |
| `6.X` | Reviews feature work. |
| `7.X+` | Messaging work (upcoming). |
| Other whole numbers | New features (automation engine = 8, direct booking = eventual). |

Commits and commit messages reference the session number:
"Reviews sync — Channex read + response send (Session 6)".
Makes it trivial to grep `git log` for a session's shipped work.

## Session prefix conventions

Letter prefixes group housekeeping or cross-cutting work that
doesn't fit the numbered feature track. Format: `<PREFIX><N>`,
e.g. `BR1`, `PD-V1`, `MSG-S2-PRE`, `RDX-FINAL`.

| Prefix | Scope |
|---|---|
| `BR` | Brand / housekeeping renames (e.g. BR1 = staycommand → koast). Mechanical sweeps across paths, env vars, log paths, systemd units, repo names, external services. Coordinated rename across both repos + skill bundle in one session. |
| `PD` | Property Detail polish-pass migrations (e.g. PD-V1 visual primitive migration). |
| `MSG` | Messaging work (e.g. MSG-S2-PRE Airbnb OAuth re-verification). |
| `RDX` | Reviews data-layer / data-residue cleanup (e.g. RDX-FINAL Phase E suffix backfill). |
| `TURN` | Turnover board / cleaning task work. |

Lettered prefixes are coherent-commit sessions just like numbered
ones — keep the same one-commit-per-repo discipline, name the
branch `session-<prefix-lower>-<description>` (e.g.
`session-br1-rename-to-koast`), and reference the prefix in the
commit subject.

## Transient onboarding state can look like upstream anomalies

When a worker hits "this upstream gave me bad data" — null
references, missing fields, unknown IDs — check whether the
failure timestamp falls inside a known onboarding, migration,
or backfill window for THIS system before assuming the upstream
is at fault.

Real example: `booking_sync.py`'s "Property None not in Supabase,
acknowledging and skipping" path looked, at first read, like
Channex returning bad JSON (relationships.property.data=null).
Session 6.8a's audit revealed the actual root cause was
internal: `properties.channex_property_id` was NULL in our DB
during the OAuth onboarding window before the column was
backfilled by the channel-connect flow. The worker's startup
filter `WHERE channex_property_id IS NOT NULL` excluded the
property mid-onboarding, so revisions arriving during that
2-3 day gap silent-acked. Channex was sending correct data the
whole time; the Koast side was the transient.

The anti-pattern this guards against: building an "upstream
defensive fallback" (e.g. room_type → property_id resolution)
when the actual problem is a Koast-side state machine that
hasn't reached steady state yet. The fallback would solve a
non-problem and miss the real fix (deferring worker activity
until onboarding completes, or running a reconciler to catch
revisions that arrived during the gap).

Triage checklist when investigating worker-side silent failures:
1. When did the failures cluster? (timestamps from logs)
2. What was happening to Koast's state in that window?
   (channel connects, schema migrations, property creates,
   OAuth reconnects, BR-style renames)
3. Does the failure shape persist after the window closes?
4. If no: the upstream is fine; the internal transient was the
   cause. Document the window in the postmortem and consider
   whether the worker should defer or reconcile after the
   transient resolves.
5. If yes: keep investigating upstream OR the worker's defensive
   layer.

## Source-field filtering is unreliable on rows with insert-path lineage

When a column like `bookings.source` has a schema-level default
(`source: text("source").default("ical")`), rows inserted by code
paths that omit the column get the default value — even when the
booking is actually canonically managed by a different system.
Filtering downstream behavior solely on that column will miss
rows whose value reflects "who first inserted me" rather than
"who currently owns me."

Pattern: when filtering by a source-style field on rows that may
pre-date the canonical setter for that source, verify against
another column whose write-path is more recent or canonical.
Defensive two-column guards beat single-column source filters
when there's an insert-path-lineage question.

Worked example: Fix A (Apr 28, commit 7518918) added
`source='ical'` to the iCal cancellation pass SELECT in
`booking_sync.py`. Correct directionally — Channex-canonical
rows should be excluded — but caught only post-canonical-helper
rows. Pre-canonical-helper rows (Briana 2026-04-13, Kathy
2026-04-11, plus Nadia/Venus 2026-04-25) were inserted via the
iCal-side path that defaulted source to 'ical', then later had
`channex_booking_id` populated by some other path that didn't
overwrite source. Those rows passed Fix A's filter and got
re-cancelled every iCal tick. Session 6.8b (Apr 29) added the
defensive second guard `AND channex_booking_id IS NULL` —
Channex-tracked rows are now skipped regardless of source value.

The reliable guard for "iCal-only managed" is
`channex_booking_id IS NULL`, not `source='ical'`. If a row has
a Channex booking id, Channex is its source of truth, full stop.

This pattern generalizes to any system where you might be
tempted to filter on a "type" or "source" column whose value
reflects insertion lineage rather than current ownership: prefer
boolean-existence checks on the canonical foreign key
(`channex_booking_id IS NULL`, `parent_id IS NULL`,
`migrated_to_v2 = false`) over typed-source filters.

**Symmetric application across worker + API surfaces.** When a
defense-in-depth fix ships on a worker, sweep the equivalent
surface on the API/UI side and apply parallel guards. The same
class of cancellation bug existed on both `~/koast-workers/
booking_sync.py` (15-min timer) AND `~/koast/src/lib/ical/
sync.ts` (manual `/api/ical/sync/[propertyId]`). The Python
fix landed first (Session 6.8b, koast-workers commit 177bb08)
because that's where the bug was observable; the TS-side
parity (Session 6.8c, koast commit 262a3a1) covered the
manual-sync surface so the next host who triggers a manual
sync from the UI doesn't reintroduce the cancelled-but-
Channex-tracked state. Pattern: when scoping a fix, ask
"does the same logical operation exist on a different
surface?" — webhook + worker, worker + API route, server +
client validation, etc. — and apply parallel guards in one
session-pair. The split into 6.8b/6.8c rather than one
unified session was deliberate (different repos, different
commit boundaries) but they should be tracked as a pair.

## Silent acks are an invisible failure mode

When a worker consumes from an upstream feed that uses the
ack-on-process pattern (Channex `/booking_revisions/feed` is the
canonical example), the worker is the only thing keeping that
data alive. An ack without a successful local store loses the
revision permanently — the feed will not re-deliver it.

The default behavior on any unprocessable condition (missing
data, null references, unknown property mapping, schema
mismatch, etc.) must be:
1. Log a structured error with enough context to triage
2. Leave the revision unacked so the next tick retries
3. Surface a metric / alert so silent backlogs become visible

**Acking without processing is only acceptable when the
revision is intentionally ignored** (e.g. self-originated
booking, deliberate skip), and that intent must be documented
inline with a comment explaining why a future agent shouldn't
turn it into an error. Default to "leave unacked" if you're
unsure.

Real example: `booking_sync.py` prior to fix (3) hit a
"Property None not in Supabase, acknowledging and skipping"
path 15 times in `/var/log/staycommand/bookings.log` —
each time silently ack'ing a revision the worker couldn't map
to a local property, with no alerting. The revisions were lost
to Channex's feed forever. Discovered during Session 6.8
diagnostic; fix is queued as a separate session because the
property-fallback logic itself needs design (room_type lookup,
rate_plan lookup, or graceful degradation).

This applies to ALL ack-on-process upstreams, not just
Channex: webhook event consumers that mark events processed,
queue consumers that delete-on-ack, etc. If you can't process
the message, don't pretend you did.

## State-of-the-world check at session start

Every fresh Claude or Claude Code session — especially one
picking up across compaction or chat-session boundaries —
opens with a read-only state check before scoping new work.
Pattern, on each repo:

  git branch --show-current && git status -sb
  git log --oneline -10
  git branch -a | head -20

For chat sessions, ask Claude Code for an explicit
state-of-the-world dump (or invoke a `/state` command if
configured). Surface: which branches are live, which
commits landed since the previous session, which workers
are running on the VPS, which deploys are in flight.

The check prevents scoping work on stale assumptions. Real
example: BR1 + the 6.8 series shipped after a chat
compaction event and were invisible from the chat-side
summary, nearly leading to triage of resolved problems.
A two-minute state dump at session-open would have shown
the relevant branches/commits and saved the rabbit hole.

## Compacted chat history is incomplete history

When a Claude chat session compacts, the resulting summary
captures only what was discussed before the compact event.
Subsequent chat turns, Claude Code sessions, Adobe-connector
runs, or any other concurrent work are invisible to that
summary. Treating a compaction summary as authoritative
current state will mislead.

Posture: compaction summaries are *historical* artifacts,
not *current* artifacts. Verify against the live system
(repo, VPS, deployed surface) before acting on a summary's
claim about what exists. The state-of-the-world check above
is the standard verification tool.

## Cross-Claude context handoffs require explicit briefing

Different Claude environments don't share context: the
chat Claude, Claude Code on the VPS, the Adobe-connector
Claude session, MCP-client Claudes — each starts fresh.
When work moves between sessions, the human is the bridge
that carries context across the gap.

For now: when picking up cross-session work, brief the new
Claude explicitly. Include the prior session's deliverables,
file paths, branch names, and any decisions already locked.
Don't rely on "Claude Code can read the same files" — it
can read files but doesn't know which files matter, which
decisions are open vs closed, or what the prior session
inferred but didn't write down.

Future architectural improvement (not today's problem):
when MCPs improve cross-session memory or shared scratchpad,
this brief-the-bridge pattern becomes less manual. Until
then, the explicit briefing is the workflow.

## Start-of-session baseline

EVERY fresh Claude session, regardless of skill loading:

1. Read `~/koast/CLAUDE.md` first — it's the project-level
   rules doc.
2. Read `~/koast/repomix-output.xml` for the repo map — file
   tree plus inlined content for small files. Running `repomix` in
   the repo refreshes it.
3. If the session is strategic (roadmap / prioritization):
   `ROADMAP/PATH_TO_5K.md` for strategy, `ROADMAP/FEATURE_INVENTORY.md`
   for status.
4. If the session is on a polish-pass arc: `docs/POLISH_PASS_HANDOFF.md`.
5. Scoped reads as needed — the specific route, the specific
   component, the specific migration.

Don't skip 1 + 2. They're not ceremonial; they carry context the
session will otherwise re-derive or get wrong.

## Diagnose before coding (non-trivial work)

For bugs with ambiguous root cause or features with unclear data
flow, run a **diagnostic-only session** first. No code changes.
Output: structured report with findings, recommended options, scope
estimate. Cesar approves scope, THEN the build session fires.

Diagnostic reports always include:
- What the code currently does (grep + read results).
- What the DB / external system currently shows (live queries /
  probes).
- What the gap is vs what the user expected.
- 2-4 fix options ranked by effort + risk.
- Explicit recommendation with lean.

This pattern has saved multiple "fix took 30 min but cleanup took
3 hours because the diagnosis was wrong" outcomes. Use it when in
doubt.

**Non-negotiable for schema-touching or worker-touching sessions.**
A bad schema migration or a worker-state regression has a wider
blast radius than a UI bug, and recovery is more involved (re-run
backfills, rollback migrations, restore rows from Channex truth).
Sessions 8a, 8a.1, 6.7, 6.7.1, and the booking_sync.py iCal
absence-from-feed bug all surfaced real schema/worker gaps that a
diagnostic-only first phase caught before code went out. Skip the
diagnostic phase here only when the symptom is unambiguous and the
fix is one-line — and even then, prefer 30 seconds of probing over
30 minutes of unwinding a wrong assumption.

## Commit discipline

- **One coherent commit per session.** Session 5b.3 shipped ~1300
  LOC across 8 files in a single commit — intentional. Partial
  commits on a half-wired feature leave the repo in a broken state
  between commits.
- **Detailed commit body.** Section headings, file-by-file summary
  of what landed, "scope held" / "deferred" section noting what
  was explicitly out of scope this session.
- **Commit message starts with what changed, not session number.**
  "Multi-date selection + per-card bulk editing (Session 5b.3)"
  rather than "Session 5b.3 — ..." — readability first, session
  tagging second.
- **No AI commit attribution by default.** Cesar's preference
  locked 2026-04-30: commits should NOT include
  `Co-Authored-By: Claude ...` trailers unless the user
  explicitly requests AI attribution in a specific commit
  message. The HEREDOC commit-message template defaults to
  no trailer. Pre-2026-04-30 commits in the repo carry the
  trailer (historical record stays).

## Branch-first regardless of commit size

Almost every commit goes through a feature branch + Vercel preview
gate, even small ones. Originally we carved out "tiny commits
(single-line bug fix, doc edit) the branch dance is overkill" — in
practice the cost of being wrong on what looks tiny outweighs the
~30 seconds of branch discipline. Recent example (Session 6.7.1):
a 50-LOC UI-only restructure committed accidentally to local
main, immediately reset + branched + pushed — the branch dance
would have prevented the local cleanup. Default to feature branch
unless you're explicitly iterating on a doc-only change you've
already discussed.

If in doubt: branch it.

## Verify previous merge before scoping the next session

Before scoping a new session, **confirm the previous session's
branch is actually merged to main**. The `7c1cce8..c870cfa` merge
conversation (Session 8a) revealed that "fast-forward merged"
confirmation in chat doesn't always mean the remote main has the
commit — branches can sit on origin without being fast-forwarded
to main if the merge step was forgotten or interrupted. The
6-second `git log --oneline main | head -3` check at the start of
any new session catches this. Worth doing.

The session-6-7 merge sat outstanding for ~6 hours after the
"shipped" report because the conversation pivoted to other work
before merge. Production didn't have the fix until Cesar asked
"did 9497192 merge?"

## Vercel preview as build gate

When a session ships meaningful changes (more than a one-line
fix), do not push directly to main. Pattern:

1. Branch off main (`git checkout -b <session-name>`).
2. Land all session work as one commit on the branch.
3. Push the branch (`git push -u origin <session-name>`).
4. Vercel auto-deploys the preview branch.
5. Wait for Cesar's green/red signal — Vercel CLI / `gh` are
   typically not authenticated on the VPS, so the agent cannot
   poll the preview status.
6. After green: `git checkout main && git merge --ff-only
   <session-name> && git push origin main`. Vercel redeploys
   from main.

This replaces the older "ship to main and roll back if it fails"
posture. The Vercel preview IS the build verification — it has
8GB RAM and the production env, neither of which the VPS does
(per `feedback_no_local_build`). A failed preview build is
recoverable without touching main; a failed main build leaves
production in a degraded state until forward-fix or revert.

For tiny commits (single-line bug fix, doc edit) the branch
dance is overkill. Use judgment.

## Safety-mechanism conservatism

Memoryized rule: keep <10-line safety mechanisms in place until the
replacement is observed working in production. Example: the
`KOAST_ALLOW_BDC_CALENDAR_PUSH` env gate stayed live even after
`buildSafeBdcRestrictions` was battle-tested — they're
belt-and-suspenders. Don't rip a guard out just because a new layer
arrived. Wait for real traffic to confirm the new layer handles the
case the old guard caught.

## "Verification test path" convention

Every commit message (or session report) includes a **manual test
path** the human can run to confirm the feature works. Example from
Session 6:

> 1. Hard-refresh `/reviews` after Vercel redeploys
> 2. Select Villa Jamaica — 10 real Airbnb reviews appear
> 3. Click Generate Draft Response on one → existing flow works
> 4. Approve → new Channex-sending path
> 5. Verify Channex side (is_replied: true)
> 6. Verify Airbnb host dashboard within 5-15 min

These lists are for Cesar. Claude can't run the browser test;
Cesar can. Make the list runnable — numbered, single-line actions,
no "check if the feature works" hand-waving.

## Out-of-scope discipline

If a user's prompt mentions three features and the task envelope
only fits one cleanly, ship one and defer the other two in the
commit body. Don't stretch. Out-of-scope deferrals historically
land:
- Mid-commit-body under a "Deferred" heading.
- In the session's Telegram reply as explicit callouts.
- In `ROADMAP/FEATURE_INVENTORY.md` as pending items with a pointer
  to the session that deferred them.

## Telegram workflow

Cesar sends session prompts via Telegram to Claude Code. Multi-part
prompts are common (Telegram's 4k-character cap). Hard rule:
**wait for follow-up messages before acting on a truncated prompt**.
The truncation marker isn't explicit — look for mid-sentence ends,
missing SCOPE / COMMIT sections that the session template usually
has. If in doubt, react with 👀 and pause.

Other Telegram notes:
- Always react to incoming messages (hard rule from memory).
- Use `edit_message` for interim progress updates on long tasks;
  use fresh `reply` messages when a commit ships (triggers a push
  notification on the host's phone).
- Reports in replies should be structured (headings, tables) when
  the content warrants; flat prose when it's a quick update.

## No local `npm run build`

Hard rule: never run `npm run build` on the VPS. It consumes too
much memory and tanks the machine. Vercel handles the build. If
you need a pre-push check, use `npx tsc --noEmit` + `npx eslint
<files>`. These catch 95% of issues without the build cost.

## Database conventions — partial indexes

Default to full unique indexes/constraints, not partial. Partial
indexes (`UNIQUE INDEX ... WHERE pred`) cannot be targeted by the
Supabase JS client's `.upsert(row, { onConflict: col })` calls —
PostgREST returns **42P10** "there is no unique or exclusion
constraint matching the ON CONFLICT specification". Postgres itself
accepts the partial index for uniqueness enforcement; the failure
is purely on the PostgREST upsert path.

Use partial indexes only when BOTH conditions hold:
1. There is a specific business rule requiring uniqueness under a
   predicate (e.g. "only one pending row per `(property_id, date)`"
   in `pricing_recommendations`).
2. ALL writers use raw SQL with the matching `ON CONFLICT (col)
   WHERE pred` form — typically `psycopg2` in workers. The Supabase
   JS client must NOT target the index.

Latent failure profile: a partial-index + Supabase-`.upsert()`
combo passes `npx tsc --noEmit`, passes `npx next lint`, and
applies cleanly via `psql`. Failure surfaces only on the FIRST
runtime upsert attempt. So:

- When adding a new partial unique index, audit every Supabase
  `.upsert()` call site that writes to that table and confirm
  none target the partial-index columns.
- When adding a new Supabase `.upsert(..., { onConflict: ... })`
  call, audit `pg_indexes` for partial unique indexes on those
  columns. If one exists, either drop it and add a full UNIQUE
  constraint, or change the upsert call to not target it.
- Postgres treats NULLs as distinct in UNIQUE constraints by
  default, so the typical `WHERE col IS NOT NULL` partial pattern
  is usually redundant — multiple NULL rows are already allowed
  under a full constraint.

See: PG-PARTIAL-AUDIT (2026-04-26), MSG-S1 hotfix commit `a078ce3`,
PG-PARTIAL-FIX commit (2026-04-26).

## Sync ingest vs host workflow — column gating

When sync writes to a row that the host can also mutate, the
column has to belong to one source of truth or the conflation
will eventually corrupt rows. RDX-2 ate one corrupted row before
RDX-4 split the conflated column.

Three categories of behavior, three rules:

1. **Algorithmic column** (derived from upstream signal each
   iteration). Re-evaluate on every sync iteration, write
   unconditionally. Example: `guest_reviews.is_low_rating` is
   `incoming_rating < 4` — sync owns it, hosts can't edit it.
2. **Host-asserted column** (set by the host through a UI action,
   never derived from upstream). Sync NEVER writes this, on any
   iteration. Example: `guest_reviews.is_flagged_by_host` is
   the more-menu mark/unmark action; sync doesn't touch it.
3. **Upstream-state-mirror column** (sync mirrors a remote
   boolean). Re-evaluate on every iteration, **but apply a
   no-downgrade rule** if the host workflow can also flip it.
   Example: `guest_reviews.response_sent` mirrors Channex's
   `is_replied`, but Koast can also flip it true via the
   publish path. RDX-DIAG-FIX rule: only flip false→true on
   sync; never flip true→false from sync, even if Channex
   appears to have lost the upstream state. (Channex 200 isn't
   confirmation per known-quirks #19; the host's intent is the
   floor.)

Anti-pattern: a single column that conflates an algorithmic
signal AND a host-asserted flag (the original `is_bad_review`).
Sync's "every iteration" write fights with the host's mark, and
whoever wrote last wins.

When in doubt, split. Two clearly-named columns are cheaper than
one ambiguous column.

## Tooling preferences

- `psycopg2` for DB queries in the `~/koast-workers` venv
  (script at `/tmp/X.py`, run via `python3 /tmp/X.py` — NOT
  heredocs, which break `load_dotenv()`'s frame inspection).
- `urllib.request` for Channex probes. We avoid `requests` in the
  workers venv for dependency-minimalism.
- `curl` for one-off Channex auth-free probes when keys are in env.
- Supabase CLI for schema exploration locally. But when applying
  migrations to the live DB, go through psycopg2 directly with the
  service role — safer than `supabase db push` which we don't have
  wired.

## Skill feedback discipline

Skills don't self-update. They go stale unless lessons from real
sessions get captured back into them. Before committing any
session, ask: did this session reveal anything that belongs in a
skill?

Cross-repo coverage: a session may now span the
`koast` repo AND the `koast-workers` repo. When a
worker convention emerges (e.g. the
"Scheduled-write worker with idempotency table" pattern from
Session 8a), the playbook entry references both repos and
points at concrete commit hashes on each side. The skill is the
single index across both repos.

Things worth capturing:
- A new Channex quirk or undocumented behavior →
  channex-expert/references/known-quirks.md
- A new architectural invariant or codebase convention →
  koast-development/references/architecture.md or
  conventions.md
- A repeatable workflow pattern (probe-then-implement, three-stage
  write tracking, etc.) →
  koast-development/references/playbooks.md
- New tech debt with a file:line pointer →
  koast-development/references/tech-debt.md

Things NOT worth capturing:
- Specific bugs being fixed in this session (transient state)
- Session-numbered work-in-progress (5b.4, 6.1c, etc — captured
  in commits, not skills)
- Content that would go stale within weeks (current sprint focus,
  active feature flags)

If a lesson is worth capturing: propose the skill update as a
SEPARATE small commit AFTER the main session commit. Don't bundle
skill changes with feature changes — they have different review
cadences and different risk profiles. The skill update commit is
small enough that it doesn't slow the main work but visible enough
that it doesn't get forgotten.

If a session reveals nothing skill-worthy, that's fine. Most
sessions won't. The discipline is the question, not the answer.

## Internal-route auth pattern

Routes under `/api/internal/*` are called by Postgres triggers (via
`pg_net`) and other server-side surfaces — never by browsers.
They authenticate via a single shared bearer secret stored as
`INTERNAL_TRIGGER_SECRET` in the Vercel env, mirrored verbatim in
Supabase vault as a per-feature secret name (e.g.
`turnover_trigger_secret`).

Rules:
- Use `src/lib/auth/internal.ts:assertInternalAuth(request)` at
  the top of every internal route handler. It constant-time-
  compares against `process.env.INTERNAL_TRIGGER_SECRET` via
  `crypto.timingSafeEqual` with a length pre-check (timingSafeEqual
  requires equal-length buffers).
- When the env var is undefined (e.g. during initial deploy
  before the env is pasted), the helper throws 401. `undefined`
  is never accepted; no fuzzy match anywhere. The pre-deploy
  window is "401 for every request," not "auth bypass."
- NOT a substitute for `getAuthenticatedUser` on user-facing
  routes. Single shared secret = trusted internal callers only.
  Never expose to the browser, never log, never echo in error
  messages.
- Vault and Vercel must hold the same value. If you rotate one,
  rotate the other in the same window. Vault rotation:
  `SELECT vault.update_secret((SELECT id FROM vault.secrets WHERE
   name = '<name>'), '<new_value>');`.

Established TURN-S1a (commit `e594f2a`). The `/api/internal/booking-
created` route is the first instance.

## Multi-tier guest_display_name resolver

Channex's `attributes.guest_name` is structurally null on AirBNB
reviews and most AirBNB threads (per channex-expert quirk #7).
"AirBNB Guest" was the embarrassing UX consequence until the
multi-tier resolver landed. Apply this fallback chain to any
surface that needs to render a guest's name from an OTA-sourced
row:

1. **Manual host override** (`*.guest_name_override` or
   equivalent column). Always wins. Single pencil-icon edit
   surface per row writes here.
2. **Booking link** — `bookings.guest_name` via the row's
   `booking_id`. Populated for BDC by Channex; populated for
   AirBNB only after RDX-3's `ota_reservation_code` join key
   landed AND if the booking still appears in the
   `/booking_revisions/feed` (channex-expert quirk #20 ages out
   bookings post-checkout).
3. **Channex-side adjacent fields** — for messaging this is
   `message_threads.title` (Channex puts the guest's first
   name here on AirBNB — verified live across 6 AirBNB threads
   on Villa Jamaica). For reviews this branch is dead because
   `guest_name` is the only source and it's null.
4. **Platform-tagged fallback** — "Airbnb Guest", "Booking.com
   Guest", "Direct Guest". Last resort; never tier-1.

Real examples:
- `src/lib/guest-name.ts:resolveDisplayGuestName` — reviews
  resolver (tiers 1, 2, 4; tier 3 is empty for reviews).
- `src/app/api/messages/threads/route.ts` and the SSR
  `/messages` page — messaging fallback chain
  `bookings.guest_name ?? thread.title ?? "Guest"`.

Anti-pattern: rendering `b?.guest_name ?? "Guest"` and
shipping. The middle tiers are where most of the data lives.

## Synthetic-data verification for state changes

Pattern for verifying a code change that depends on a state
transition you can't reliably trigger from production data within
the verification window. INSERT a synthetic row, observe the
expected state, DELETE the synthetic row.

Worked-three-times in:
- Session 8a — synthetic booking + thread + template to verify
  the messaging executor fires drafts.
- Session 8a.1 — synthetic draft to verify the inline-bubble
  layout + Approve & Send + Discard flow.
- Session 6.7 / 6.7.1 — synthetic pre-disclosure + disclosed
  reviews on Margot's restored booking row to verify the
  is_hidden classifier guard, the slide-over differentiation,
  and the AI Generate draft path.

Conventions when running it:
- Tag the synthetic with an obviously non-real identifier
  (`HMTEST6_7_001`, `synthetic-001`, `test-supervised-8a-001`)
  so it's grep-able for cleanup.
- Capture the row id at INSERT time, return it in the report so
  Cesar (or the next agent) can find it for cleanup or extension.
- Always pair INSERT with DELETE in the same session; don't
  defer cleanup. Synthetic rows that survive past their session
  pollute calendar / inbox / dashboards (8a's `synthetic-001`
  booking sat on Villa Jamaica's calendar for ~24h before
  cleanup).
- Add a final-verify probe: `SELECT count(*) FROM <table> WHERE
  <synthetic-tag-filter>` should return 0 post-cleanup.
- For schemas with cascading FKs, drop synthetic in the order
  that respects FK constraints (or rely on `ON DELETE CASCADE`
  + drop the parent row).

When real production data CAN trigger the state, prefer that —
synthetic-data verification is a fallback for time-pressed cases.

## State-changing field propagation — `rg` every surface

When introducing or extending a field that's read at MULTIPLE
surfaces (`is_hidden` from session 6.7 was the worked example),
update **every consumer** in the same session — DB schema +
sync writers + API serialization + UI renderer + companion
worker code paths.

The 6.7 session ran the TS-side Python-mirror two-headed-sync
update (sync.ts AND reviews_sync.py) but ALMOST shipped without
the Python side because they're separate code paths. The fix:
before declaring done, `rg` the new field name across:
- `src/lib/db/schema.ts`
- `src/lib/<domain>/sync.ts` (TS sync)
- `src/app/api/<domain>/**/route.ts` (API serialization)
- `src/lib/<domain>/types.ts` (DTO types)
- `src/components/<domain>/**/*.tsx` (UI renderers)
- `~/koast-workers/<domain>_sync.py` (Python mirror)

A field that's missed on any of these layers produces a render
gap (sync writes the field, route doesn't surface it, UI never
sees it) — silent, hard to debug, often only caught when a
human tries the feature on real data.

## Asymmetric verification — both directions on cancellation/state paths

For bug fixes that touch a state transition (e.g., the iCal
cancellation pass), verify **both directions** of the predicate:
- Rows that SHOULD be cancelled — still cancelled after the fix.
- Rows that SHOULD NOT be cancelled — stay confirmed after the fix.

The booking_sync.py iCal cancellation fix (commit `7518918`)
needed both: Margot/Jordan (Channex `status='new'`) had to stay
confirmed across the next iCal pass, AND Alissia/Jasiauna/Bettina
(Channex `status='cancelled'`) had to stay cancelled. A one-sided
verification would have missed either failure mode.

Pattern: name the cohort of rows that should flip in each
direction, run the worker / route, query each cohort
post-execution, confirm both held. Don't accept "the symptom is
gone" as proof — confirm the inverse case still works.

## Verify quirk scope before treating as hard limit

A documented quirk (e.g. "guest_name is null on Airbnb reviews")
might be narrower than the docs imply. Before designing around
it, **probe the live response** in the specific account /
property / endpoint context. Session 6.7's diagnostic confirmed
quirk #7 against today's Channex API but ALSO confirmed the
docs example showing it populated was a schema-illustration
fixture, not a behavior contract — the "Channex doesn't expose
the name" framing held.

Conversely: if your scope is narrower than the docs say (e.g.
"X happens only on /reviews/:id/reply, not on /respond/:id"),
verify the boundary — assuming a wider scope causes
defensive-design overkill.

## Investigate vendor support before override-style workarounds

When the canonical fix path runs through a vendor (Channex,
Airbnb), file a support email or check community channels
**before** building an override-style workaround. The Andrew
confirmation pattern: send the question to the Channex support
contact (Andrew), capture the response in the session log, then
decide whether to build the workaround or rely on the vendor's
fix.

Override workarounds are correct when:
- The vendor confirms the limit is intentional / not on their
  roadmap.
- The vendor's eventual fix is far away enough that the host
  experience would degrade in the interim.

They're wasteful when:
- The vendor confirms a fix is shipping in days/weeks.
- The vendor has an undocumented endpoint that does what we
  need.
- The vendor's API supports the use case but our integration
  reads the wrong field.

## Distinguish "review" from "reply" in UI copy

Airbnb's two-sided review model gives hosts two distinct
actions on every incoming guest review:
- **Reply**: post-disclosure public response to the guest's
  review, visible on Airbnb to future guests of the property.
  Routes through `POST /reviews/:id/reply`.
- **Review**: host's counter-review of the guest, evaluating
  the guest. Routes through `POST /reviews/:id/guest_review`.

Hosts in the wild routinely conflate these because "respond"
overloads between them — Session 6.7c surfaced the bug after
a host saw "Needs response" on a review where they'd already
submitted the counter-review and assumed the action was done.

Conventions for any future review-surface copy:
- Use **"reply"** (verb) and **"public reply"** (noun) for the
  post-disclosure host-to-public-comment action.
- Use **"review"** (verb) and **"host review of {guest}"** /
  **"counter-review"** (noun) for the host-to-guest action.
- Never use "respond" / "response" in user-visible strings on
  the reviews surface. Internally `response_draft`,
  `response_sent`, etc. are fine — they're DB column names
  and renaming them is a separate scope.
- Section headers in the slide-over already follow this
  pattern: "Public reply on {property}" and "Submit a review
  for {guest}". Mirror them in any new copy.

### Sweep with the broader stem, not the specific phrasing

A wording shift on one surface usually has 3-5 sibling
surfaces using the same vocabulary that need to move
together. The 6.7c → 6.7e progression is the worked
example:

- **6.7c** swept "Needs response" / "Responded" badges
  + filter chips (specific phrasings).
- **6.7e (commit 1)** caught the third badge state
  "Response ready" — same component, sibling state, missed
  by the specific-phrasing search.
- **6.7e (commit 2)** caught the metric tile
  "Response rate" on ReviewsDashboardStrip — different
  component, same vocabulary, also missed.

Process for any UI vocabulary shift:

1. `rg "<broad stem>"` over `src/` (e.g. `respon[ds]`,
   not `"Needs response"`).
2. Inventory every match. Split into three buckets:
   - **User-visible labels** (JSX text, `label=`,
     `placeholder=`, alt text) — change.
   - **DB column / API field / analytics event names** —
     keep stable, even if visually inconsistent with the
     new label. Renaming is a separate scope.
   - **Comments / debug logs** — leave unless they
     mislead a future reader.
3. After the change, re-run `rg "<old phrasing>"` to
   confirm zero user-visible hits.

Skipping step 1 (searching only the specific phrasing)
ships the user a half-fixed surface and the next session
re-opens the same arc.

## Drizzle schema FK forward-reference

Drizzle's `references(() => OtherTable.column, { onDelete: ... })`
takes a callback that resolves at runtime, so a column referencing
a table defined LATER in `schema.ts` works fine without
rearrangement. Example from TURN-S1a:

```ts
// cleaning_tasks defined at line ~283
cleanerId: uuid("cleaner_id").references(
  () => cleaners.id,
  { onDelete: "set null" }
),
// ...

// cleaners defined at line ~502
export const cleaners = pgTable("cleaners", { ... });
```

Don't reorder the file just to satisfy a perceived declaration
order. Drizzle handles it.

## Iteration loops without breakthrough signal upstream problems

When a sequence of iterations produces incremental improvement
but never the "yes, that's it" reaction, the answer is not in
the iteration tools — it's upstream in the brief, the territory,
or the strategic frame. More variants on the same axis won't
land; the axis itself is wrong.

Diagnostic question to ask after 2-3 unsuccessful rounds: *what
am I optimizing within that's actually the wrong thing to
optimize?* Reset the brief, sharpen the territory, then resume.

Worked example: Koast logo work 2026-04-29. L1 produced 7 wave
executions; L2 widened to four geometric metaphors; L3 pivoted
to typography; L3-iter1 and iter2 refined an Aperture-O wordmark
through 6 + decision-cascade variants. Each round was honestly
better than the last but none was the answer. The breakthrough
came in the next round when the strategic territory was
sharpened — "accumulated memory" (sediment/strata) vs.
"instantaneous genius" (sparks/orbs/asterisks dominating other
AI brands). With the new frame, the banded-circle direction
emerged in one Adobe-connector session. The territory was the
problem, not the iteration tools.

## Multi-agent design iteration: the brief is most of the work

When using Claude with AI design tools (Adobe-for-creativity
connector, banana, svg-design, etc.), the strategic brief
determines output quality more than the tools themselves.
Tools follow the brief; bad briefs produce sophisticated-but-
wrong work.

Brief failure modes to avoid:
- **Locking the metaphor in advance.** ("It's a wave.") Kills
  the metaphor-diversity capability of the design skill, which
  is one of its highest-leverage features.
- **Constraining the creative territory too narrowly.**
  Produces a flat n-up of variations on a theme. The skill's
  strength is breadth, not volume.
- **Constraining the wrong dimension.** Constrain on quality
  bar (audience, register, brand register, do-not-list) and
  on out-of-scope items (gradients, literal-coastal, Anthropic-
  swirl-clones). DON'T constrain on what the mark "should look
  like" — that's the work the design skill is supposed to do.

Constraint should be on the *bar* and the *anti-list*, not on
the creative territory. If the territory feels under-defined,
that's the right amount of room for the design skill to
explore.


