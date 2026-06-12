# Koast v1 — P6 ultraplan: external-user de-risk + harmony completion

**Mode:** nonstop, merge-on-green, hard gates only. **Destructive migrations are
WRITTEN + verified-on-staging-if-safe + HELD for Cesar's confirm** (never auto-applied
to prod). Additive fixes autonomous. OTA flag stays OFF. Grounded on the P6-discovery
workflow (50 findings / 5 fronts) + direct prod verification.

## The single held destructive batch (P6.2) — for Cesar's confirm
Verified directly against prod. One migration file, NOT applied:
1. `DROP TRIGGER IF EXISTS bookings_fire_turnover_task ON bookings;`
2. `DROP FUNCTION IF EXISTS fire_turnover_task_create();`
   — the vestigial pg_net turnover trigger, installed INERT in P1 (`20260426060000`),
   never activated (the app + booking_sync.py create cleaning_tasks directly). Fires
   inertly on every booking write today.
3. (optional, same batch) `DROP EXTENSION IF EXISTS pg_net CASCADE;` — removes pg_net +
   its http_* functions (supply-chain cleanup). Hold separately; Cesar opts in/out.
Everything else in P6 is additive or code-only.

---

## P6.1 — Kill the clobber class (security; highest priority)
- **Ungated route audit (the inline audit + the failed discovery front):** the channex
  full-sync/cert routes (`full-sync`, `certification`, `certification-runner`,
  `certification/booking-test`, `setup-webhook`) ARE gated (getAuthenticatedUser/
  verifyServiceKey). `channex/sync` (POST) gates via `auth.getUser()`. **VERIFY each
  remaining sync/cert/destructive route** has an enforced guard before side effects;
  for any genuinely ungated one, default DELETE if no prod caller, else auth-gate. Add
  the P5 plan-gate to the cert/full-sync routes (they call Channex → Pro).
- **H6.1 webhook TOCTOU (claim-first):** `/api/webhooks/channex` dedups by READING
  channex_webhook_log for a terminal row, but the terminal insert is at the END →
  concurrent re-delivery double-processes (double bell, double availability push). Fix:
  `acquireLock(supabase, "channex_revision:"+revisionId, 120)` up front (the existing
  concurrency_locks primitive); on `false` → ack + skip. releaseLock in finally.
- **H7.1 AmbiguousSendError:** `sendMessage`/`sendMessageOnBooking` (messages.ts:395/433)
  throw `ChannexSendError("...returned no data", 200, res)` on `res.ok && !res.data`.
  Introduce a distinct `AmbiguousSendError`; the 3 send call sites (manual send route,
  M7 artifact route, proposals send_guest_reply) treat it as TERMINAL-no-retry (webhook
  reconciles), not retryable. proposals/server already re-throws 2xx-ChannexSendError →
  simplify to catch AmbiguousSendError.
- **Negative tests:** unauthenticated POST/GET to each formerly-ungated/gated route →
  401/403; the webhook claim-first dedup (two concurrent same-revision → one process).

## P6.2 — Schema truth
- **Additive (autonomous):** add the ~14 undeclared live tables to schema.ts as Drizzle
  pgTable declarations (type-safety, no DB change) — pricing_recommendations,
  pricing_performance, pricing_rules, user_subscriptions, proposals, host_notifications,
  host_action_patterns, host_surface_telemetry, channex_outbound_log, concurrency_locks,
  stripe_events, channex_sync_state, weather_cache. (Prioritize the load-bearing ones;
  the rest can be a follow-up if time-boxed.)
- **Declared-but-dropped reconciliation (code-only, additive):** message_templates,
  message_automation_firings, user_preferences were INTENTIONALLY dropped
  (`20260507020000`). schema.ts still declares them (stale). REMOVE the stale
  declarations + relations + dead code refs. **H3.1:** fix `isAutoApproveEnabled` to NOT
  read the dropped user_preferences (return false / repoint to host_state) — remove the
  phantom read.
- **Held destructive:** the pg_net batch above (one migration, HELD).
- **End state:** introspection diff clean (every live table declared; no declaration
  without a table) or every exception documented.

## P6.3 — Abuse surface
- **Rate-limit helper** (`src/lib/rate-limit/`): a lightweight per-key token-bucket
  (in-memory Map + TTL; Vercel-lambda-scoped — documented as best-effort, not a
  distributed limiter). Apply to: cleaner token routes (per-token), Stripe + Channex
  webhooks (per-IP/coarse).
- **Cleaner token rotation:** additive migration — `cleaning_tasks.token_expires_at`,
  `token_invalidated_at`; `POST /api/clean/[taskId]/rotate-token` (host-auth) → new token
  + invalidate old + re-notify cleaner; token-auth routes check
  `token_invalidated_at IS NULL`. (Additive, autonomous.)
- **Upload constraints:** photo route — cap photo COUNT per task (e.g. 30) + a Content-
  Length guard, on top of the existing per-file 10MB + MIME check.
- **Webhook shape/size:** Content-Length cap + Zod envelope validation on the Channex +
  Stripe webhooks; truncate the channex_webhook_log payload.

## P6.4 — Eyes
- **`GET /api/health`** (public, no auth): `SELECT 1` latency + last-migration timestamp
  → `{status, db_latency_ms, ...}`. **`GET /api/health/channels`** (auth): per
  property/channel freshness from channex_webhook_log.createdAt + property_channels
  .lastSyncAt/lastError → `{status: healthy|degraded|disconnected, last_webhook_at, ...}`.
- **Channel-disconnect alert:** add `channel_disconnect` to host_notifications.type CHECK
  (additive migration); a detector (reuse the validator cron or a small route) emits the
  bell row when a channel goes stale/disconnected.
- **Error capture (choice: internal table, NOT Sentry):** Sentry adds a dep + DSN; a
  minimal `api_errors` table (additive) + a `captureApiError` helper + bell on repeated
  failures is lower-overhead and self-hosted. Sentry left as a NEEDS-CESAR option.
- **Backup runbook** (`docs/operations/backup-disaster-recovery.md`): Supabase project
  refs + PITR window + restore steps + quarterly-test note. No infra changes.

## P6.5 — Harmony completion
- **Inline trench ProposalCard:** new SSE `proposal_created` event (sse.ts) carrying the
  NormalizedProposal; loop.ts emits it when a proposals-lane propose tool returns
  `{created, proposal_id}` (read the row, normalize); ChatClient renders `<ProposalCard>`
  inline (consistent with Today/bell).
- **send_guest_reply EDIT-before-approve:** the inline card gets [Edit | Approve |
  Dismiss]; editing re-runs the voice judges on the new text, rewrites
  payload.action.messageText + payload.judge_results, audit-logged; the edited text is
  what sends.
- **Remaining P3.1 reads (render-flag-gated, extract-first):** read_threads (thread block
  exists), read_calendar_rates (price_diff/calendar_change blocks exist). property-access
  + channel-health reads need new block kinds — defer with a note unless cheap.
- **P3.3 discipline fixture tests:** a fixture harness feeding canned Anthropic tool_use
  responses through the loop, asserting emission discipline (one imperative → exactly one
  proposal; questions → prose; refusal over guessing).
- **A2-ledger:** (5a) a deterministic test pinning Today headline count == rendered
  needs-cleaner rows (already aligned — pin it). (5b) tighten the Today needs-you window
  to today+48h + a "+N upcoming" link into Turnovers.

## Sequencing
P6.1 (security) → P6.2 (schema, held batch written) → P6.3 (abuse) → P6.4 (eyes) →
P6.5 (harmony). Each slice tsc+jest green before commit. The held destructive migration
stays uncommitted-to-prod; listed in the phase report for confirm.

## Phase report
Every closed backlog item checked off by name (H6.1, H7.1, H3.1, ungated routes, pg_net
trigger, P3.3 deferrals); the held destructive batch listed for confirm; consolidated
NEEDS-CESAR. Then HOLD for A1–A6.
