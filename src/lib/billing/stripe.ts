/**
 * Stripe client (P5) — inert-safe. The whole billing system gates on
 * `isBillingEnabled()` (STRIPE_SECRET_KEY present). When unset — the state through
 * A5 — getStripe() returns null and every caller no-ops gracefully (checkout/portal
 * 503, webhook 200, plan-gating inert). No top-level throw, so the module is safe to
 * import anywhere even with no Stripe env.
 *
 * NEEDS-CESAR (test-mode env, one pass): STRIPE_SECRET_KEY (sk_test_…),
 * STRIPE_WEBHOOK_SECRET (whsec_…), NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_test_…),
 * STRIPE_PRO_PRICE_ID (price_… for the $79/mo Koast Pro recurring price per
 * src/lib/billing/plans.ts — NOT the $149 Business price), NEXT_PUBLIC_APP_URL
 * (checkout success/cancel base).
 *
 * Pricing-integrity rule (operator msg 3730): the dollar amount shown to the
 * host MUST derive from the Stripe price object the customer will actually be
 * charged — never a static string. `getProPrice()` is that single source; the
 * UI reads it via /api/billing/status. If STRIPE_PRO_PRICE_ID points at the
 * wrong product, the surface shows the wrong (but truthful) price — so display
 * can never silently diverge from the charge.
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

/** The live, charge-accurate price the host will pay for Pro. Cents +
 *  currency + interval, read straight from the configured Stripe price
 *  object — the SINGLE source of the displayed price (no static strings).
 *  Returns null when billing is off, no price id is set, or the lookup
 *  fails; callers then show no price rather than a possibly-wrong one. */
export interface ProPrice {
  amountCents: number;
  currency: string;
  interval: string | null;
}
export async function getProPrice(): Promise<ProPrice | null> {
  const stripe = getStripe();
  const priceId = getProPriceId();
  if (!stripe || !priceId) return null;
  try {
    const price = await stripe.prices.retrieve(priceId);
    if (price.unit_amount == null) return null;
    return {
      amountCents: price.unit_amount,
      currency: price.currency,
      interval: price.recurring?.interval ?? null,
    };
  } catch {
    return null;
  }
}

export const TRIAL_PERIOD_DAYS = 14;
