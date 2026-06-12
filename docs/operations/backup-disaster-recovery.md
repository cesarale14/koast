# Backup & disaster-recovery runbook (P6.4)

Operational runbook only — **no infra changes**. Documents the backup posture and the
restore procedure so a real incident has a written path instead of improvisation.

## Projects
| Env | Supabase project ref | Region | Notes |
|---|---|---|---|
| **Production** | `wxxpbgbfebpkvsxhpphb` | aws-1-us-east-1 | Live `app.koasthq.com`. Authoritative. |
| **Staging** | `aljowaggoulsswtxdtmf` | aws-0-us-east-1 | Free tier; replay target for migration verification. |

## Backup posture (verify in the Supabase dashboard → Database → Backups)
- **Daily logical backups** are standard on the production tier. Confirm the retention
  window shown in the dashboard (typically 7 days on Pro).
- **Point-in-Time Recovery (PITR)** — confirm whether it is enabled on prod. If the project
  is on a tier/add-on that includes PITR, the dashboard shows the recoverable window (e.g.
  last 7 days, second-granularity). **If PITR is NOT enabled and the data warrants it, enable
  it before external users onboard** — this is the single highest-leverage DR upgrade.
- **Staging** (free tier): limited/no PITR. Treat staging as reproducible (replay migrations),
  not as a backup of prod.

## Restore procedure (rehearse on staging first — NEVER first-try on prod)
1. **Identify the target time** (the last-known-good instant before the incident).
2. **Dashboard → Database → Backups → Restore** (or PITR → pick the timestamp).
   - PITR restores create a new instance at the chosen point; a daily backup restores the
     snapshot. Read the dashboard's exact flow for the current Supabase version.
3. **Restore onto STAGING first** to validate the data + that the app boots against it
   (point `.env.staging` at the restored instance; run the app + the smoke checks).
4. Only after staging validation, restore prod (or promote the restored instance per
   Supabase's documented cutover).
5. **Re-point env** (Vercel `DATABASE_URL` / `NEXT_PUBLIC_SUPABASE_*`, the VPS workers'
   `~/koast-workers/.env`) if the restore produced a new project ref.
6. **Re-verify** `/api/health` (P6.4) returns `status:ok` + a recent `last_migration`, and
   the booking/pricing workers' next timer fire succeeds.

## RPO / RTO (set + document targets)
- **RPO** (max acceptable data loss): bounded by PITR granularity (seconds) if enabled,
  else by the daily-backup cadence (up to ~24h). Enable PITR to tighten RPO.
- **RTO** (max acceptable downtime): a dashboard restore is minutes-to-tens-of-minutes for
  a 2-property dataset; rehearse once to get a real number.

## Quarterly DR test (sign-off log)
Once per quarter: restore the latest prod backup onto staging, boot the app, run the smoke,
confirm `/api/health` + a sample booking/pricing read, and record the date + RTO observed
below. A backup you have never restored is not a backup.

| Date | Restored from | RTO observed | Signed off by |
|---|---|---|---|
| _(first test pending)_ | | | |

## Alert thresholds (manual until automated)
- DB storage > 80% of quota → plan an upgrade/prune.
- `/api/health` `db_latency_ms` sustained > 1s → investigate.
- `channex_webhook_log` unbounded growth → see the P6.4 retention follow-up.
