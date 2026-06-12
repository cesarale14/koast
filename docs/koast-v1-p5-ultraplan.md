# Koast v1 — P5 ultraplan: Stripe billing (TEST MODE ONLY)

**Mode:** nonstop, merge-on-green, hard gates only. **No real checkout** (that's A5);
deterministic tests with **mocked Stripe**. Everything **no-ops gracefully when the
Stripe env is unset**. New dep `stripe` (justified — surfaced here). OTA flag stays OFF.

## Grounding (audit-reconciled, not duplicated)
- `user_subscriptions(user_id uuid, tier text, created_at, updated_at)` — minimal, NO
  Stripe columns. ONE manual prod row: the OWNER `312f9366-dbb4-49e2-8b89-48286fb93b3b`,
  tier `business`. This is the dogfood + A1–A4 test rig → **grandfather it**.
- No Stripe/billing tables or routes exist. The `enforce_property_quota` DB trigger reads
  `user_subscriptions.tier` (free/pro/business) for property COUNT — separate from feature gating.
- **Tiering rule (ROADMAP §"Tiering rule"):** *anything that calls Channex is Pro*; iCal +
  viewing recommendations + market intel = Free. Cleaner token routes NEVER gated.
- Pro price $129–199/mo → propose **$149**; code references the Stripe **price ID** (env), so
  the dollar amount is Cesar's product decision, not hardcoded. Trial **14 days** (brief default).

## The inert-when-unset principle (the spine)
`isBillingEnabled()` = `STRIPE_SECRET_KEY` present (mirrors the OTA-flag pattern). When billing
is OFF (env unset — the state through A5): checkout/portal return a clean "billing not configured",
the webhook 200s, and **plan-gating is INERT (allows everyone)** so the app is never bricked
pre-launch. When billing is ON: gates enforce. The owner's `comped` row is Pro **in both states**.

---

## Slice 1 — schema (additive migration) + typed unions
`supabase/migrations/<ts>_billing_stripe.sql` (staging-first discipline N/A — single prod env;
additive, autonomous per the brief). Extend `user_subscriptions`:
- `stripe_customer_id text`, `stripe_subscription_id text`, `status text`
  (CHECK in `active|trialing|past_due|canceled|incomplete|incomplete_expired|unpaid|paused` + `null`),
  `price_id text`, `current_period_end timestamptz`, `cancel_at_period_end boolean default false`,
  `trial_end timestamptz`, `comped boolean not null default false`.
- Backfill: `UPDATE user_subscriptions SET comped = true WHERE user_id = '<owner>'` (grandfather).
- `stripe_events(id text primary key, type text, received_at timestamptz default now())` — webhook
  idempotency ledger (dedup by Stripe event id; insert-or-skip = atomic claim).
- `ALTER TABLE … ENABLE ROW LEVEL SECURITY` per the explicit-RLS convention; host-scoped policy on
  user_subscriptions (read own), service-role-only on stripe_events.
- `src/lib/db/schema.ts`: typed `SubscriptionStatus` union mirroring the CHECK (the CHECK-constrained-
  column convention).

## Slice 2 — the billing lib (inert-safe) + plan resolution
- `src/lib/billing/stripe.ts`: lazy `getStripe()` returning a configured `Stripe` client or `null`
  when `STRIPE_SECRET_KEY` unset; `isBillingEnabled()`. Single `apiVersion` pin. No top-level throw.
- `src/lib/billing/plan.ts`: `resolveAccess(svc, userId): { plan: 'free'|'pro', source: 'comped'|'stripe'|'default', proAccess: boolean }`.
  Rules: `comped` → pro. Else `status ∈ {active,trialing}` + a Pro price → pro. Else free. **When
  `!isBillingEnabled()` → proAccess = true for everyone (inert).** Pure-ish (svc-injected), unit-tested.
- `src/lib/billing/gate.ts`: `requireProAccess(svc, userId)` → throws a typed `PlanGateError`
  (402-ish) when billing on AND not pro. Used at route seams + inside applyOtaRestrictions (defense).

## Slice 3 — checkout + portal + status routes
- `POST /api/billing/checkout` — auth; if `!isBillingEnabled()` → 503 "billing not configured";
  resolve/create the host's Stripe customer (store `stripe_customer_id`); create a Checkout Session
  (mode subscription, `STRIPE_PRO_PRICE_ID`, `subscription_data.trial_period_days=14`, success/cancel
  URLs); return `{ url }`. Comped host → 409 "already comped" (no checkout).
- `POST /api/billing/portal` — auth; customer-portal session for the host's customer; return `{ url }`.
- `GET /api/billing/status` — auth; returns `resolveAccess` + period_end/cancel_at_period_end for the UI.
  Always works (even billing-off → `{ plan:'pro'(inert)|..., billingEnabled:false }`).

## Slice 4 — webhook → subscriptions sync (sig-verified, idempotent, atomic)
`POST /api/webhooks/stripe`:
- Read raw body; `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` — **signature
  verified**; 400 on failure. (Needs `runtime`/raw-body handling — App Router `await req.text()`.)
- **Idempotency:** INSERT `stripe_events(id=event.id)`; unique-violation → 200 ack + skip (atomic claim).
- Handle: `checkout.session.completed`, `customer.subscription.created|updated|deleted`,
  `invoice.payment_failed`. Each maps the Stripe subscription → `user_subscriptions` (status,
  price_id, current_period_end, cancel_at_period_end, trial_end, tier='pro' when active/trialing else
  'free'). **Never downgrades a `comped` row.** Resolve the user by `stripe_customer_id`.
- All updates host-scoped + guarded; partial-failure surfaces a 500 (Stripe retries) AFTER the
  idempotency row is written only on success (so a failed handler re-runs on retry).

## Slice 5 — plan gating at the feature seams (server-side)
Per the roadmap rule, gate the **Channex-touching** write seams with `requireProAccess`:
- The unified OTA write: inside `applyOtaRestrictions` (defense — like the OTA flag) AND at its
  callers' route boundaries (/api/pricing/apply, /api/calendar/rates/apply, /api/channels/rates POST,
  the proposals execute path for otaTouching actions).
- Channel connect/activate (/api/channels/connect-booking-com*, /activate), messaging send
  (Channex inbox), reviews sync — Pro-only.
- **Free (NOT gated):** iCal (/api/ical/*), reading recommendations (/api/pricing/recommendations,
  calculate, detect-opportunities is worker-only), market intel, viewing.
- **NEVER gated (hard rule):** the cleaner token routes `/api/clean/[taskId]/[token]/*` and public
  routes (`/revenue-check`). A test asserts these stay open even when billing is on + the host is free.
- The gate is INERT when billing is off (no behavior change pre-launch) and skips comped hosts.

## Slice 6 — tests (mocked Stripe, deterministic) + phase report
- `plan.test.ts`: resolveAccess matrix (comped→pro, active/trialing→pro, canceled/past_due→free,
  default→free, **billing-off→pro-inert for all**).
- `gate.test.ts`: requireProAccess (throws for free when on; passes for pro/comped; inert when off).
- `webhook.test.ts`: signature-verify failure→400; idempotent replay (same event.id→single apply);
  subscription.created/updated/deleted → correct user_subscriptions sync; comped never downgraded.
- `checkout.test.ts` / `portal.test.ts`: billing-off→503; creates session via mocked Stripe; comped→409.
- A seam test: a Channex write route 402s for a free host when billing on; the cleaner token route
  stays 200.
- Phase report `docs/koast-v1-p5-phase-report.md`; NEEDS-CESAR env lines.

## NEEDS-CESAR (test-mode env — one-pass setup)
- `STRIPE_SECRET_KEY` (sk_test_…), `STRIPE_WEBHOOK_SECRET` (whsec_… from the test-mode endpoint),
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_test_…), `STRIPE_PRO_PRICE_ID` (price_… for the Pro product —
  create a $149/mo recurring price, or your chosen point), `NEXT_PUBLIC_APP_URL` (for success/cancel URLs).
- Create the test-mode Stripe **Product** "Koast Pro" with a monthly recurring **price**; paste the price id.
- The webhook endpoint URL to register in Stripe test mode: `https://app.koasthq.com/api/webhooks/stripe`.

## Hard guarantees
- Owner account never bricked (comped → pro in every state; webhook never downgrades comped).
- Cleaner token routes never plan-gated (explicit test).
- Inert when Stripe env unset (no app behavior change through A5).
- New dep `stripe` only; mocked in tests; no real network/checkout.
