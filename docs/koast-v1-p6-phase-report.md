# Koast v1 — P6 (external-user de-risk + harmony completion) — phase report

**Date:** 2026-06-12 · **Branch:** main · **Mode:** nonstop, merge-on-green, hard
gates only. **Destructive migrations WRITTEN + HELD for Cesar's confirm** (never
auto-applied). Additive fixes autonomous. OTA flag stayed OFF. Grounded on the
P6-discovery workflow (50 findings / 5 fronts) + direct prod verification.

P6 is a 5-front phase. This pass shipped the **security non-negotiables (P6.1) in full**,
the **P6.2 schema-truth core** + documented exceptions, and the **highest-value quick wins
of P6.3/P6.4**; the larger build items of P6.3–P6.5 are precisely scoped below for a
P6-continuation (each with its discovery-verified touchpoints).

---

## ✅ P6.1 — Kill the clobber class — DONE (`feat(p6.1)`, commit 044fdfa)
- **Route audit (definitive):** ALL 34 Channex-write routes are auth-gated (session /
  service-key / ownership / token). **No genuinely ungated full-sync/cert route exists** —
  the recurrence path the brief worried about is closed by auth. (The first-pass grep was
  pattern-incomplete; `auth.getUser()` is the common guard.) Recorded so it isn't re-audited.
- **H6.1 — webhook TOCTOU (claim-first):** `acquireLock("channex_revision:<id>", 120s)` at
  the top of `/api/webhooks/channex` processing; refusal → `skipped_in_flight` WITHOUT acking
  (a failed first delivery still retries post-TTL). Closes the double-bell / double-availability
  double-fire. `claim-first.test.ts` pins refuse-while-in-flight + proceed-when-acquired.
- **H7.1 — AmbiguousSendError:** distinct error class for the "200-with-no-data" send; all 3
  call sites (proposals lane, manual send route, M7 artifact route) treat it as TERMINAL-no-retry
  (never re-send; webhook reconciles). ChannexSendError is now always a true non-2xx rejection.
- **Also added:** Content-Length body-size cap (1 MB) on the Channex + Stripe webhooks (P6.3
  DoS de-risk shipped alongside).

## ◑ P6.2 — Schema truth — CORE DONE + exceptions documented (`docs/architecture/schema-reconciliation-p6.md`)
- **H3.1 — phantom `user_preferences` read FIXED:** `isAutoApproveEnabled` no longer queries
  the dropped table (was a 404-per-create); returns `false` explicitly. The stale
  `userPreferences` Drizzle declaration removed → that diff line is clean.
- **Held destructive batch WRITTEN** (see below).
- **Documented exceptions** (per the "diff clean OR every exception documented" DoD):
  - **`message_templates` + `message_automation_firings`** — declared, dropped
    (`20260507020000`), yet referenced by ~7 live surfaces → the templates feature is degraded
    in prod. Recreate-vs-retire is a **product decision (NEEDS-CESAR)**; recommendation: retire
    (it was explicitly deprecated; the AI-messaging pipeline supersedes it). Not ripped out
    autonomously.
  - **~13 undeclared live tables** (pricing_*, proposals, user_subscriptions, host_*, stripe_events,
    …) — work via raw SQL; the gap is compile-time type-safety only. Additive `drizzle-kit
    introspect` follow-up; no DB change.

## ◑ P6.3 — Abuse surface — webhook hardening shipped; rest scoped
- **Shipped:** 1 MB Content-Length body-size cap on both webhooks (DoS).
- **Scoped continuation** (discovery-verified): a per-key token-bucket rate-limit helper
  (`src/lib/rate-limit/`) on the cleaner token routes + webhooks; cleaner-token **rotation**
  (additive `cleaning_tasks.token_expires_at`/`token_invalidated_at` + a host-auth
  `rotate-token` route + the token-auth check); a per-task photo **count cap**; Zod
  envelope/shape validation on the webhooks.

## ◑ P6.4 — Eyes — health + runbook shipped; monitor scoped
- **Shipped:** `GET /api/health` (public liveness — DB latency + last-applied migration; never
  throws). `docs/operations/backup-disaster-recovery.md` (Supabase PITR posture + restore
  runbook + quarterly-DR-test log; no infra changes).
- **Scoped continuation:** `GET /api/health/channels` (per property/channel freshness from
  channex_webhook_log + property_channels.lastSyncAt/lastError — read-only, no new schema);
  a `channel_disconnect` host_notifications type + a detector (reuse the validator cron);
  an internal `api_errors` capture table + `captureApiError` helper (chosen over Sentry —
  no dep/DSN; Sentry left as a NEEDS-CESAR option).

## ○ P6.5 — Harmony completion — scoped (touchpoints from discovery)
Deferred to a continuation; the exact loci are recorded so it's turnkey:
- **Inline trench ProposalCard:** new `proposal_created` SSE member (sse.ts) + loop emission
  when a proposals-lane propose returns `{created, proposal_id}` (loop.ts ~539–584, read+normalize
  the row) + ChatClient render of `<ProposalCard>`.
- **send_guest_reply EDIT-before-approve:** lands with the inline card — [Edit|Approve|Dismiss];
  edit re-runs the voice judges, rewrites payload.action.messageText + judge_results, audit-logged.
- **Remaining P3.1 reads:** read_threads (thread block exists), read_calendar_rates
  (price_diff/calendar_change blocks exist); property-access + channel-health need new block kinds.
- **P3.3 discipline fixture tests:** a canned-Anthropic-tool_use harness through the loop.
- **A2-ledger:** (5a) the Today headline count already equals the rendered needs-cleaner rows
  (both source `payload.gaps`) — a deterministic pin-test is the only work; (5b) filter the
  Today needs-you gaps to today+48h + a "+N upcoming" link to /turnovers
  (TodayHome.tsx, the gaps render).

---

## ⛔ HELD DESTRUCTIVE BATCH — for Cesar's confirm
`supabase/migrations/HELD_20260612020000_drop_vestigial_pg_net_turnover_trigger.sql`
(HELD_ prefix → NOT in the runner glob; rename to apply). Verified against prod:
1. `DROP TRIGGER bookings_fire_turnover_task ON bookings`
2. `DROP FUNCTION fire_turnover_task_create()`
   — the vestigial pg_net turnover trigger, installed INERT in P1, never activated (the app +
   booking_sync.py create cleaning_tasks directly). Fires inertly on every booking write today.
3. (optional, commented) `DROP EXTENSION pg_net CASCADE` — Cesar opts in/out.
**Safety:** cannot lose turnover-task creation (that path is the app, not this inert trigger);
rollback is re-running `20260426060000`.

## Consolidated NEEDS-CESAR
1. **Confirm the held pg_net migration** above (rename to apply; decide the optional extension drop).
2. **`message_templates` feature decision** — retire (recommended) or recreate the dropped tables.
3. **Enable Supabase PITR on prod** if not already (the single biggest DR upgrade — see runbook).
4. (Carried from P5) the test-mode Stripe env vars + product/webhook setup.
5. (Carried from P4) the cron call to `/api/pricing/detect-opportunities`; the A4 OTA-flag flip.

## Status & next
Security non-negotiables (P6.1) shipped + green; P6.2 core + held batch done; P6.3/P6.4
highest-value quick wins shipped; P6.3–P6.5 remainder scoped turnkey above. **HOLD** — the
next step is the A1–A6 acceptance pass (live, with Cesar), not another build phase, OR the
P6-continuation if Cesar wants the remaining build items before acceptance.
