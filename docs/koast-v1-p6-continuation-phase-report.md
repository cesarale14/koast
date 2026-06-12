# Koast v1 — P6-continuation phase report

**Date:** 2026-06-12 · **Branch:** main · **Mode:** nonstop, merge-on-green, hard
gates only. Destructive migrations applied via the full staging→verify→prod→verify→
record flow per Cesar's conditional confirm. OTA flag stayed OFF.

Continuation = (A): build the scoped P6.3–6.5 remainder + apply the confirmed held
batch + retire message_templates + verify the detector cron. This report is the
consolidated close.

---

## Commits (all pushed to main)
| Commit | Front |
|---|---|
| `19c9487` | P6.2 — apply confirmed pg_net turnover-trigger drop (staging+prod), keep extension |
| `fdef674` | P6.2 — RETIRE message_templates feature (8 degraded surfaces) |
| `9ebc5b1` | P6.3 — rate-limit + cleaner-token rotation + upload caps + Zod webhook guards |
| `376dc9d` | P6.4 — channel-health monitor + internal error capture |
| `a607d69` | P6.5 — A2 Today imminence window + headline/rendered consistency pin |
| `d4988ec` (koast-workers) | P6.4 — fold channel-disconnect detector into the validator cron |

## Migrations applied (staging → verify → prod → verify → record, both envs)
| Migration | What | Verify |
|---|---|---|
| `20260612020000` | DROP vestigial inert pg_net turnover trigger+function; **pg_net extension KEPT** | trigger=0, func=0, pg_net retained, bookings still ingest |
| `20260612030000` | `rate_limits` table + `rate_limit_hit`/`rate_limit_prune` fns + `cleaning_tasks.token_invalidated_at`/`token_expires_at` | smoke hit1=true / hit2=false at limit 1 |
| `20260612040000` | `+channel_disconnect` host_notifications type; `api_errors` capture table | api_errors created, CHECK extended |

---

## ✅ Held pg_net batch — APPLIED (Cesar-confirmed, conditional)
Dropped the inert `bookings_fire_turnover_task` trigger + `fire_turnover_task_create()`
function. **Extension decision (the conditional):** a both-DB consumer scan found the
only other net.http_* reference is Supabase's platform-managed
`extensions.grant_pg_net_access()` event trigger (provisions `supabase_functions_admin`
on `CREATE EXTENSION pg_net`). pg_cron is not installed in either DB. Because dropping
pg_net would CASCADE into Supabase's own plumbing, **the extension was LEFT installed and
the reason documented in the migration body** — exactly the "otherwise leave + document"
branch of your confirm.

## ✅ message_templates — RETIRED
8 degraded surfaces removed (the tables were dropped in 20260507020000 but still
referenced, so the feature was broken-in-place): both DB cascade-delete lists (deleting
from a non-existent table was erroring property + account deletion), the schema.ts
declarations, the Messages Templates tab (TemplateManager + MessagesPageTabs deleted; page
is inbox-only), the onboarding templates step (+ its default-templates lib + setup route),
and a stale comment. AI messaging is the successor; no recreation. tsc + lint + full suite
green; no test referenced the removed symbols.

## ✅ Detector cron (P4.4) — VERIFIED, not slipped; dropped from NEEDS-CESAR
It was already installed (koast-workers `da18065`) and runs daily 10:00 UTC inside
`koast-pricing-validator.timer`, co-located with the pricing trigger. Today's 10:00 UTC run
called `/api/pricing/detect-opportunities` for both properties (HTTP 200), idempotent:
Villa Jamaica "skipped(already-proposed) 4" (the 4 P4 proposals + bells still pending),
Cozy Loft "detected 0". The slip was only my prior report mislabeling it as NEEDS-CESAR.
No manual re-run was forced (would have duplicated nothing — it's idempotent — but the
scheduled run already proved end-to-end). Schedule line: `OnCalendar=*-*-* 10:00:00 UTC`.

## ✅ P6.3 — abuse surface — SHIPPED IN FULL
- **Rate limiting:** DB fixed-window limiter (`src/lib/rate-limit`, no Redis; atomic
  `rate_limit_hit` SQL fn; FAIL-OPEN). Applied to all 4 /api/clean token routes per IP.
- **Cleaner-token rotation:** `verifyCleanerToken` is now the single auth path for all 5
  clean routes (matches token AND enforces `token_invalidated_at`/`token_expires_at`).
  Host-auth `POST /api/turnover/rotate-token` mints a fresh token (old link dies instantly)
  + re-pushes the new link to the cleaner.
- **Photo upload caps:** MIME + 10 MB already existed; added the missing COUNT cap (30),
  checked before the storage upload (no orphaned objects).
- **Zod webhook guards:** permissive envelope validation on both Channex + Stripe webhooks.
- Tests: verifyCleanerToken (valid/expired/invalidated/missing) + rateLimit (under/over/
  fail-open) + clientIp. 35 targeted + full-suite (1335) green.

## ✅ P6.4 — eyes — SHIPPED IN FULL
- **Channel-health monitor:** `GET /api/health/channels` (host-auth detail) +
  `POST /api/health/channels/detect` (service-key, wired into the validator cron) that rings
  a new `channel_disconnect` host bell per down channel, transition-deduped (24h).
  Classifier is CONSERVATIVE — only an explicit non-active status is "disconnected";
  last_error is "degraded". **Staleness is reported but NOT health-driving** because
  `last_sync_at` isn't maintained by the workers (observed 2-months-stale on live active
  channels) — letting it drive health would flag every channel permanently. Verified safe
  against prod: all live channels classify healthy/degraded → ZERO false bells.
- **Error capture:** `api_errors` table + `captureApiError()` (no Sentry dep) — writes the
  error + logs a loud CRITICAL line on a same-route burst (≥5 / 10 min). Operator-facing,
  never host-facing, never throws.
- Tests: classify (6 cases) + capture (insert/burst/below-threshold/never-throws). Green.

## ◑ P6.5 — harmony — A2 SHIPPED; deep chat-surface items SCOPED (decision below)
- **✅ A2 (both):** (5b) the "Needs you" list now focuses on today+48h via a pure tested
  `partitionImminentGaps` helper; dated gaps beyond fold into a "+N upcoming →" link to
  /turnovers. (5a) a pin-test locks that the greeting's turnover count and the rendered
  no_cleaner rows can't diverge (both derive from payload.gaps). +7 curate tests.
- **○ DEFERRED — deep chat-surface work (with a recommendation, see below):**
  - **Inline trench ProposalCard** for the proposals lane: confirmed genuinely unwired —
    the existing `action_proposed` SSE path covers only the M6/M7 artifact tools
    (memory_write, propose_guest_message), NOT proposals-lane `{created, proposal_id}`.
    Needs: a `proposal_created` member in `src/lib/agent/sse.ts` (mirror the
    `action_proposed` discriminated-union pattern), emission in `src/lib/agent/loop.ts`
    ~539–584 (detect proposals-lane returns → fetch+normalize the row via
    `src/lib/proposals/server.ts`), and a render branch in `ChatClient.tsx`'s SSE reducer
    (~497–1174) wiring `<ProposalCard>` (which already exists, `src/components/proposals/`).
  - **send_guest_reply edit-before-approve:** lands with the inline card — an Edit mode that
    rewrites `payload.action.messageText`, RE-RUNS the voice judges, and audit-logs the edit.
  - **Remaining P3.1 reads:** read_calendar_rates, read_threads (extract-first, render-flag-
    gated). Note `read_guest_thread` already exists. These carry the "exposed-IFF-advertised"
    invariant tripwire (a P4 lesson) — must advertise in the base prompt iff registered.
  - **P3.3 discipline fixture tests:** a canned-Anthropic-tool_use harness through the loop.

### Why P6.5's deep items are scoped, not rushed
These three (inline ProposalCard, edit-before-approve, the reads) are multi-layer changes
to the **highest-visibility surface — the agent chat / SSE reducer (`ChatClient.tsx`, 1300+
lines, stateful)** — and the repo has **no jsdom/RTL render harness**, so they can't be
deterministically unit-tested; they need live verification. Rushing them unverified into the
chat surface in the tail of this session, immediately before the **live A1–A6 acceptance
pass**, is the exact failure mode "ship 90%-polished, not 60%-shipped-fast" warns against.
The external-user DE-RISK fronts (P6.1–P6.4) — the load-bearing half of P6 — shipped in full
with prod migrations verified. **Recommendation:** land the inline-ProposalCard + edit-before-
approve as a focused follow-up, ideally verified live (the loci above make it turnkey), OR
fold it into the A1–A6 pass. Your call — say the word and I build it next.

---

## Backlog items closed by name
H6.1 (webhook TOCTOU, P6.1) · H7.1 (AmbiguousSendError, P6.1) · H3.1 (phantom
user_preferences read, P6.2) · pg_net vestigial trigger (P1→P6.2, applied) ·
message_templates retire (P6.2) · P4.4 detector cron (verified) · cleaner-token
rate-limit/rotation/upload-cap (P6.3) · webhook Zod + body caps (P6.3) · channel-health
monitor + channel_disconnect bell (P6.4) · api_errors capture (P6.4) · A2 5a + 5b (P6.5).

## Remaining NEEDS-CESAR (reduced to the three you named)
1. **Enable Supabase PITR on prod** (the single biggest DR upgrade — see backup runbook).
2. **Stripe test-mode env** + product/webhook setup (carried from P5; billing is inert until set).
3. **The A4 OTA-flag flip itself** (`KOAST_ALLOW_BDC_CALENDAR_PUSH`) — the controlled
   browser-devtools test against Villa Jamaica.

(Plus the open product/scope call: do you want the deferred P6.5 inline-ProposalCard built
next, or folded into acceptance?)

## Status & next
P6.1–P6.4 + A2 shipped, gated, pushed; 3 migrations applied to prod + staging + recorded.
**HOLD** — next is the live A1–A6 acceptance pass with Cesar.
