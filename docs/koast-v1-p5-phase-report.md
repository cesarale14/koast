# Koast v1 — P5 (Stripe billing, TEST MODE) — phase report

**Date:** 2026-06-12 · **Branch:** main · **Mode:** nonstop, merge-on-green, hard
gates only. **TEST MODE ONLY** — mocked-Stripe deterministic tests, no real
checkout (that's A5). **Inert when the Stripe env is unset** (the state through A5):
the whole system no-ops gracefully and never bricks the app. OTA flag stayed OFF.

## Grounded, not duplicated
The audit's "1 manual prod subscription" = the OWNER's `user_subscriptions` row
(`312f9366…`, tier `business`). We **extended** that table rather than building a
parallel one, and **grandfathered the owner** (`comped=true`) so billing can never
brick the dogfood / A1–A4 rig. `enforce_property_quota` (property-COUNT trigger) is
untouched — orthogonal to feature gating.

## The spine: inert-when-unset
`isBillingEnabled()` = `STRIPE_SECRET_KEY` present (mirrors the OTA-flag pattern).
OFF → checkout/portal 503, webhook 200-ignore, **plan-gating allows everyone**.
ON → gates enforce. `comped` is Pro in **both** states.

## What shipped
- **Migration `20260612010000_billing_stripe`** (applied to prod, recorded in
  koast_migration_history): additive Stripe columns on `user_subscriptions`
  (stripe_customer_id, stripe_subscription_id, status[CHECK], price_id,
  current_period_end, cancel_at_period_end, trial_end, **comped**) + `stripe_events`
  idempotency ledger. Owner backfilled `comped=true`. Explicit RLS; typed
  `SubscriptionStatus`/`BillingPlan` unions in schema.ts (CHECK-mirror convention).
- **Billing lib** (`src/lib/billing/`): `stripe.ts` (inert-safe `getStripe()` +
  `isBillingEnabled()` + `getProPriceId()` + `TRIAL_PERIOD_DAYS=14`), `plan.ts`
  (`resolveAccess` matrix), `gate.ts` (`requireProAccess`/`hasProAccess` +
  `PlanGateError` 402), `sync.ts` (`syncSubscriptionToDb` — never downgrades comped).
- **Routes:** `POST /api/billing/checkout` (subscription Checkout Session, 14-day
  trial, customer create+persist, comped→409, billing-off→503), `POST /api/billing/portal`
  (Customer Portal), `GET /api/billing/status` (UI), `POST /api/webhooks/stripe`
  (**signature-verified**, **idempotent atomic claim** via stripe_events with
  **rollback-on-failure** so Stripe retries, sync through the single mapper).
- **Plan gating at the feature seams (server-side):**
  - The unified OTA write — gated **inside `applyOtaRestrictions`** (the ONE seam
    covering all 3 apply routes + the proposals lane), resolving the property owner
    from the existing properties read → `hasProAccess`. Refuses `plan_gate_pro_required`.
  - `POST /api/channels/connect-booking-com` + `POST /api/messages/threads/[id]/send`
    (the non-OTA Channex write seams) → `requireProAccess` → 402.
  - **NEVER gated:** the cleaner token routes (`/api/clean/[taskId]/[token]/*`) — a
    structural test fails if anyone wires the gate into a clean route. iCal +
    reading recommendations + market intel stay Free (ungated).

## Tiering (ROADMAP-aligned)
Free = iCal-powered (read). Pro = anything Channex (the roadmap's self-executing rule:
OTA writes, channel connect, messaging send). Pro price **$129–199** → proposed **$149**;
the code references the Stripe **price ID** (env), so the dollar amount is Cesar's
product decision, not hardcoded.

## Tests (deterministic, mocked Stripe — no real checkout)
- `plan.test.ts` (resolveAccess matrix incl. billing-off-inert + comped-beats-canceled),
  `gate.test.ts`, `sync.test.ts` (comped-never-downgraded), `webhook.test.ts` (sig-fail
  400 · idempotent claim · duplicate-skip · rollback-on-failure), `checkout.test.ts`
  (503/409/trial-wired/customer-reuse), `portal.test.ts`, `cleaner-routes-ungated.test.ts`
  (the never-gate invariant), and the OTA writer seam tests (free→refuse, comped→pass,
  billing-off→inert). All green; full OTA regression unbroken (gate inert in those tests).

## NEEDS-CESAR (test-mode env — one-pass setup)
Create the test-mode Stripe **Product** "Koast Pro" with a monthly recurring **price**
(e.g. $149/mo), register the webhook endpoint `https://app.koasthq.com/api/webhooks/stripe`,
then set (Vercel, test values):
- `STRIPE_SECRET_KEY` = sk_test_…
- `STRIPE_WEBHOOK_SECRET` = whsec_… (from the test-mode endpoint)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = pk_test_…
- `STRIPE_PRO_PRICE_ID` = price_… (the Pro recurring price)
- `NEXT_PUBLIC_APP_URL` = https://app.koasthq.com (checkout success/cancel base)

Until these are set, billing is fully inert (no app behavior change). Once set, A5 runs
the real test-mode checkout round-trip.

## Hard guarantees met
- Owner never bricked (comped → Pro in every state; webhook never downgrades comped).
- Cleaner token routes never plan-gated (structural test).
- Inert when Stripe env unset (no behavior change through A5).
- One new dep (`stripe`), mocked in tests; no real network/checkout.

HELD for the P6 brief.
