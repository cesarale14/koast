/**
 * POST /api/webhooks/stripe (P5) — the billing source of truth sync. Inert-safe:
 * 200 (ignored) when billing isn't configured.
 *
 * Discipline:
 *   - SIGNATURE VERIFIED: stripe.webhooks.constructEvent over the RAW body; 400 on
 *     failure (an unsigned/forged event never touches the DB).
 *   - IDEMPOTENT via atomic claim: INSERT stripe_events(id=event.id) up front; a
 *     unique-violation means a re-delivery → 200 ack + skip. On a handler failure
 *     the claim is ROLLED BACK (deleted) so Stripe's retry reprocesses (the sync
 *     itself is idempotent regardless).
 *   - State transitions go through the single syncSubscriptionToDb mapper, which
 *     never downgrades a comped row.
 */

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, isBillingEnabled } from "@/lib/billing/stripe";
import { syncSubscriptionToDb } from "@/lib/billing/sync";

export const runtime = "nodejs";

const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  // Inert when billing isn't configured — ack so Stripe doesn't retry forever.
  if (!isBillingEnabled() || !stripe || !webhookSecret) {
    return NextResponse.json({ received: true, ignored: "billing_disabled" });
  }

  // P6.3 — body-size guard. Stripe webhooks are <50 KB; cap before reading.
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const sig = request.headers.get("stripe-signature");
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig ?? "", webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "bad signature";
    console.warn("[webhooks/stripe] signature verification failed:", msg);
    return NextResponse.json({ error: `Webhook signature verification failed: ${msg}` }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Atomic claim — dedup re-deliveries by event id.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: claimErr } = await (supabase.from("stripe_events") as any).insert({
    id: event.id,
    type: event.type,
  });
  if (claimErr) {
    // 23505 = unique_violation → already processed (re-delivery). Ack + skip.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((claimErr as any).code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[webhooks/stripe] claim insert failed:", claimErr.message);
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }

  try {
    if (HANDLED.has(event.type)) {
      let sub: Stripe.Subscription | null = null;
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (subId) sub = await stripe.subscriptions.retrieve(subId);
      } else if (event.type === "invoice.payment_failed") {
        const invoice = event.data.object as Stripe.Invoice;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subId = typeof (invoice as any).subscription === "string"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (invoice as any).subscription
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : (invoice as any).subscription?.id;
        if (subId) sub = await stripe.subscriptions.retrieve(subId);
      } else {
        // customer.subscription.created | updated | deleted — the object IS the sub.
        sub = event.data.object as Stripe.Subscription;
      }
      if (sub) {
        const r = await syncSubscriptionToDb(supabase, sub);
        if (!r.ok) console.warn("[webhooks/stripe] sync skipped:", r.reason);
      }
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    // Roll back the claim so Stripe's retry reprocesses (the sync is idempotent).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("stripe_events") as any).delete().eq("id", event.id);
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[webhooks/stripe] handler error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
