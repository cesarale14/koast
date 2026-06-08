# TURN-S2-send — Ultraplan + Staging Finding

**Branch:** `turnover-s2-send` (off main, not the spike) · preview-only, review before merge.
**Scope:** productionize the cleaner web-push dispatch send-path (web-push replaces SMS). API + UI + DB + new subsystem.
**Date:** 2026-06-08

---

## 1. Gated step-0 — staging finding (reconciliation)

The skill says "no staging"; the CLAUDE.md *Staging Environment* section says staging = `aljowaggoulsswtxdtmf`. **Checked the actual infra, not the docs:**

| Check | Result |
|---|---|
| `.env.staging` on main | **Present** → `SUPABASE_PROJECT_REF=aljowaggoulsswtxdtmf`, `DATABASE_URL` → `db.aljowaggoulsswtxdtmf.supabase.co` |
| `.env.local` (prod) | `db.wxxpbgbfebpkvsxhpphb.supabase.co` |
| Staging reachable | **Yes** — `select 1` returns; `cleaners` table exists; schema present |
| Staging `koast_migration_history` | **Exists**, 74 rows, latest = `20260531020000_properties_timezone` (matches the newest file on main → staging is in sync) |
| Prod `koast_migration_history` | Exists |
| `cleaner_push_subscriptions` (both envs) | **Absent** — confirms the migration is needed on both |
| Supabase CLI / `config.toml` | **None** — no CLI in PATH, no project linkage. Migrations are applied **manually via psql**. |

**Verdict:** the skill's "no staging" note is **stale**. Staging (`aljowaggoulsswtxdtmf`) is live, schema-current, and tracked in `koast_migration_history`. The CLAUDE.md staging-first discipline is the real process. `koast_migration_history` columns: `id, migration_name, applied_at, applied_by, notes, checksum`.

## 2. Proposed migration flow (HELD — awaiting operator confirm)

Migration file written but **NOT applied**: `supabase/migrations/20260608010000_cleaner_push_subscriptions.sql`.

1. **Staging first:**
   `set -a; source .env.staging; set +a`
   `psql "$DATABASE_URL" -f supabase/migrations/20260608010000_cleaner_push_subscriptions.sql`
2. **Verify staging:** table exists, `endpoint` UNIQUE, `idx_cleaner_push_subscriptions_cleaner` present, RLS enabled, FK cascade to `cleaners`.
3. **Record staging apply:** `INSERT INTO koast_migration_history (migration_name, applied_by, notes) VALUES ('20260608010000_cleaner_push_subscriptions','s2-send','cleaner web-push subscription store; service-role only, RLS on no policies');`
4. **Production:** repeat 1–3 against `.env.local`.

No data backfill. No destructive ops. Additive table only. **I will not run any of this until you confirm.**

---

## 3. Architecture (the slice)

```
Cleaner device (PWA)                     Koast (Next on Vercel)                Supabase (service role)
─────────────────────                    ──────────────────────                ───────────────────────
/clean/[taskId]/[token]                  GET /api/clean/.../  ── task + vapidPublicKey + cleanerId
  EnableAlerts                           POST /api/clean/.../subscribe ──────▶ upsert cleaner_push_subscriptions
    register /sw.js (scope /)                 (token → task → cleaner_id)         (onConflict endpoint)
    Notification.requestPermission
    pushManager.subscribe(applicationServerKey = vapidPublicKey)

Host assigns task                        POST /api/turnover/assign
                                           update cleaning_tasks (cleaner_id, assigned)
                                           sendAssignmentPush(svc,{cleanerId,url,title,body})
                                             load subs by cleaner_id ──────────▶ select cleaner_push_subscriptions
                                             web-push.sendNotification per sub
                                             410/404 → delete sub (prune) ─────▶ delete cleaner_push_subscriptions

push → /sw.js `push` → showNotification → `notificationclick` → open /clean/[taskId]/[token]
```

### Files
- **DB:** `supabase/migrations/20260608010000_cleaner_push_subscriptions.sql` (held) + `src/lib/db/schema.ts` (`cleanerPushSubscriptions`).
- **SW:** `public/sw.js` (root-scoped, push + notificationclick; icons → `/icon-192.png`). `src/middleware.ts` exempts `/sw.js` + `/manifest.webmanifest`.
- **Push lib:** `src/lib/push/vapid.ts` (env-only, no fallback), `src/lib/push/send.ts` (`sendAssignmentPush` + 410 prune), `src/lib/push/web-push.d.ts`.
- **Subscribe:** `src/app/api/clean/[taskId]/[token]/subscribe/route.ts`; `vapidPublicKey` + `cleanerId` added to the clean GET.
- **Send-on-assign:** `src/app/api/turnover/assign/route.ts` (replaced SMS `notifyCleanerAssigned` with `sendAssignmentPush`).
- **UI:** `src/components/clean/EnableAlerts.tsx` + wired into `src/app/clean/[taskId]/[token]/page.tsx`.
- **Dep:** `web-push@^3.6.7` (operator-mandated Node web-push).

### Key decisions
- **D3 trim honored:** single assigned-task send only. No pywebpush, no VPS reminder worker, no reminders, no subscribe-confirmation push (keeps web-push to the assign path).
- **Token-as-device-auth:** subscribe binds the device to `task.cleaner_id`; one installed device gets all that cleaner's future jobs.
- **Idempotent subscribe:** `onConflict: endpoint` updates keys + cleaner binding + `last_seen_at`.
- **410 prune:** a send returning 410 (or 404) deletes the dead row.
- **RLS:** enabled, **no** anon/authenticated policies (service-role only). Deny-by-default.
- **VAPID:** real keypair generated; env-only (`VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT`). No embedded fallback. Until set in Vercel env, subscribe/send degrade gracefully (UI hides, send no-ops with `configured:false`).

---

## 4. Proof (deterministic — no live sends, no prod data)

`src/lib/push/__tests__/turnover-s2-send.test.ts` (8 tests, web-push mocked, stateful in-memory Supabase):
1. subscribe → row persisted bound to `cleaner_id`; re-subscribe same endpoint → no duplicate; invalid token → 403; unassigned task → 409.
2. assign-send → exactly one web-push per subscription, payload carries the deep link.
3. 410 on send → dead subscription pruned.
4. no subs / VAPID unconfigured → no-op.

---

## 5. Flags / follow-ups (separate, gated)
- **VAPID env:** real keys are in `~/.koast-vapid-s2.txt` (outside the repo). Set `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` in Vercel (Production + Preview) for the live path to work. Subscribe/send are inert until then.
- **Migration:** held — run staging-first only after operator confirm.
- **PWA start_url:** the global manifest `start_url` is `/`; an installed PWA opens to `/`, not a specific job (push deep-links the job). Reusing the existing manifest per instruction; per-job start_url is a follow-up if desired.
- **SMS abandoned:** `notifyCleanerAssigned` (SMS) is no longer called by the assign route. It still exists, referenced only by the dormant `auto-create` default-cleaner path; switch that to push when auto-assign is enabled.
- **First job:** the very first contact can't push to a not-yet-subscribed device — first link delivered out-of-band; subsequent assigns push. (Acknowledged in the brief.)
- **Live test (later):** real subscribe on an iPhone + real assign-to-Karem is the deferred live test — not in this slice.
