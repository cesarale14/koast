# E2E — Playwright conversation-lifecycle harness

The verification layer for the conversation spine. Encodes the
`docs/conversation-lifecycle-spec.md` §8 sweep (items 1–14) as automated
browser tests. M13 Phase 1.B.

**Scope:** the conversation lifecycle only — create/append, load/switch,
error/unhappy. Not the rest of the app.

## Safety (read first)

These specs **create, delete, and seed** conversations + users. They run
against the **non-prod staging** Supabase project only. `e2e/global-setup.ts`
runs an allowlist-shaped, fail-closed `prod-guard` that **refuses to run**
unless the target matches the expected staging ref AND is not the prod
ref. The app-under-test boots with `.env.playwright` (staging), never
`.env.local` (prod).

## One-time setup

1. Create `.env.playwright` at the repo root (gitignored). Source it from
   `.env.staging` plus the harness vars. The shape:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://aljowaggoulsswtxdtmf.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging anon key>
   SUPABASE_SERVICE_ROLE_KEY=<staging service role key>
   DATABASE_URL=<staging db url>
   DATABASE_URL_POOLED=<staging pooled url>
   KOAST_E2E_CANNED_AGENT=1
   PLAYWRIGHT_TEST_EMAIL=e2e-host1@koast-test.local
   PLAYWRIGHT_TEST_EMAIL_2=e2e-host2@koast-test.local
   PLAYWRIGHT_TEST_PASSWORD=<any strong string>
   PLAYWRIGHT_EXPECTED_SUPABASE_REF=aljowaggoulsswtxdtmf
   ```

   (Regenerate any time from `.env.staging` — see the generator snippet in
   the M13 Phase 1.B session notes.)

2. Install the chromium browser binary (one-time):

   ```
   npx playwright install chromium
   ```

## Run it

```
npm run test:e2e            # all 14 specs (Playwright starts the app itself)
npm run test:e2e -- --headed        # watch the browser
npm run test:e2e -- create-append   # one file
npx playwright show-report          # last HTML report
```

Playwright's `webServer` launches the app automatically:
- **local:** `next dev` (no build — respects the "never build on the VPS" rule)
- **CI:** `next build && next start` (prod-faithful; source of truth)

Both boot with the staging env + `KOAST_E2E_CANNED_AGENT=1`. The canned
agent returns a deterministic response server-side (no live LLM), so the
create specs are fast + deterministic while still persisting real rows.

## How it's wired

- `playwright.config.ts` — config, env-conditional webServer, storageState, prod-guard load order
- `e2e/global-setup.ts` — prod-guard → idempotent seed (H1, H2, convs A/B/F) → real-login → save `e2e/.auth/host1.json`
- `e2e/global-teardown.ts` — remove durable fixtures (best-effort)
- `e2e/helpers/` — fixtures (fixed ids), env loader, prod-guard, supabase-admin (seed/cleanup/count), actions (sendMessage, openCmdK, delayRoute)
- `e2e/*.spec.ts` — the 14 specs (create-append 1–7, load-switch 8–13, error-unhappy 14)

## Flakiness discipline

- Web-first assertions only (`expect(locator).toBeVisible()` — auto-retry). No fixed sleeps in assertions.
- Assert observable **states**, never absolute timings. Timing-sensitive states (item 4 composer-lock, item 9 loading-skeleton) are made observable by delaying the relevant network route via `delayRoute` + `route.continue()` — which delays without buffering the SSE, not by sleeping in the test.
- Each spec independent; mutating specs nonce-scope their data and clean up in-test.

## CI (Phase 2 — not yet wired)

Phase 1 is green-local only. Phase 2 adds a `playwright` job to
`.github/workflows/ci.yml` (browser install + staging secrets + `next build`).
That lands in a separate PR after Phase 1 review.
