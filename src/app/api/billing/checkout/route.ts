/**
 * POST /api/billing/checkout (P5) — create a Stripe Checkout Session for Koast Pro.
 *
 * Inert-safe: 503 when billing isn't configured (no Stripe env). A comped host
 * (owner / dogfood) gets 409 — they already have Pro, no checkout. Resolves or
 * creates the host's Stripe customer (persisting stripe_customer_id), then opens
 * a subscription Checkout Session with a 14-day trial.
 *
 * TEST MODE ONLY — no real charge happens with sk_test_ keys; the real checkout
 * round-trip is A5.
 */

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, getProPriceId, isBillingEnabled, TRIAL_PERIOD_DAYS } from "@/lib/billing/stripe";
import { resolveAccess } from "@/lib/billing/plan";

export async function POST() {
  try {
    const stripe = getStripe();
    const priceId = getProPriceId();
    // Name the missing piece so a 503 is instantly diagnosable (config var
    // NAME only — never a secret value; both live in Vercel env, not code).
    if (!isBillingEnabled() || !stripe) {
      return NextResponse.json(
        { error: "Billing is not configured — STRIPE_SECRET_KEY is missing in this environment." },
        { status: 503 },
      );
    }
    if (!priceId) {
      return NextResponse.json(
        { error: "Billing is not configured — STRIPE_PRO_PRICE_ID is missing in this environment." },
        { status: 503 },
      );
    }

    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServiceClient();

    // Comped hosts already have Pro — no checkout.
    const access = await resolveAccess(supabase, user.id);
    if (access.comped) {
      return NextResponse.json({ error: "Your account already has Pro access." }, { status: 409 });
    }

    // Resolve or create the Stripe customer, persisting the id.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: subRow } = await (supabase.from("user_subscriptions") as any)
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    let customerId: string | null = subRow?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { koast_user_id: user.id },
      });
      customerId = customer.id;
      // Persist the customer id so the post-payment webhook can map the
      // subscription back to this user. This MUST succeed: user_subscriptions.tier
      // is NOT NULL with no default, so a fresh INSERT has to carry tier
      // ('free' — the host stays Free until the webhook flips them). When a row
      // already exists we only set the customer id (never touch tier — don't
      // clobber a comped/pro row). If the write fails we ABORT rather than open
      // a checkout we can't reconcile — otherwise the host pays and stays Free
      // (the A5 failure: the prior code used .upsert WITHOUT tier and ignored
      // the error, so the NOT-NULL violation failed silently).
      const nowIso = new Date().toISOString();
      const persist = subRow
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? await (supabase.from("user_subscriptions") as any)
            .update({ stripe_customer_id: customerId, updated_at: nowIso })
            .eq("user_id", user.id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : await (supabase.from("user_subscriptions") as any)
            .insert({ user_id: user.id, tier: "free", stripe_customer_id: customerId, updated_at: nowIso });
      if (persist.error) {
        console.error("[billing/checkout] failed to persist stripe_customer_id:", persist.error.message);
        return NextResponse.json(
          { error: `Could not start checkout: ${persist.error.message}` },
          { status: 500 },
        );
      }
    }

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.koasthq.com";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: TRIAL_PERIOD_DAYS },
      success_url: `${base}/settings?billing=success`,
      cancel_url: `${base}/settings?billing=cancelled`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[billing/checkout]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
