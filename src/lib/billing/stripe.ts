/**
 * Stripe client (P5) — inert-safe. The whole billing system gates on
 * `isBillingEnabled()` (STRIPE_SECRET_KEY present). When unset — the state through
 * A5 — getStripe() returns null and every caller no-ops gracefully (checkout/portal
 * 503, webhook 200, plan-gating inert). No top-level throw, so the module is safe to
 * import anywhere even with no Stripe env.
 *
 * NEEDS-CESAR (test-mode env, one pass): STRIPE_SECRET_KEY (sk_test_…),
 * STRIPE_WEBHOOK_SECRET (whsec_…), NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_test_…),
 * STRIPE_PRO_PRICE_ID (price_… for a $149/mo Koast Pro recurring price, or your point),
 * NEXT_PUBLIC_APP_URL (checkout success/cancel base).
 */

import Stripe from "stripe";

let cached: Stripe | null = null;

/** True iff Stripe is configured. The single spine the rest of billing reads. */
export function isBillingEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** A configured Stripe client, or null when billing is not enabled. */
export function getStripe(): Stripe | null {
  if (!isBillingEnabled()) return null;
  if (!cached) {
    cached = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  }
  return cached;
}

/** The Pro price id (the dollar amount lives in the Stripe product, not in code). */
export function getProPriceId(): string | null {
  return process.env.STRIPE_PRO_PRICE_ID ?? null;
}

export const TRIAL_PERIOD_DAYS = 14;
