/**
 * POST /api/billing/portal (P5) — open the Stripe Customer Portal so a host can
 * manage / cancel their Koast Pro subscription. Inert-safe (503 when billing
 * isn't configured); 409 when the host has no Stripe customer yet.
 */

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, isBillingEnabled } from "@/lib/billing/stripe";

export async function POST() {
  try {
    const stripe = getStripe();
    if (!isBillingEnabled() || !stripe) {
      return NextResponse.json(
        { error: "Billing is not configured — STRIPE_SECRET_KEY is missing in this environment." },
        { status: 503 },
      );
    }

    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: subRow } = await (supabase.from("user_subscriptions") as any)
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const customerId: string | null = subRow?.stripe_customer_id ?? null;
    if (!customerId) {
      return NextResponse.json({ error: "No billing account yet — subscribe first." }, { status: 409 });
    }

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.koasthq.com";
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${base}/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[billing/portal]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
