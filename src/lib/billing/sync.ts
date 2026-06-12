/**
 * Subscription → user_subscriptions sync (P5). The single mapper the webhook uses
 * to project a Stripe subscription onto our row. Resolves the host by
 * stripe_customer_id (the checkout route persists it before opening the session).
 *
 * INVARIANT: a comped row is NEVER downgraded — we still record the Stripe fields
 * (so the portal/UI reflect reality) but leave `tier` and feature access on comped.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { SubscriptionStatus } from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any, any, any>;

const PRO_STATUSES = new Set<SubscriptionStatus>(["active", "trialing"]);

function customerIdOf(sub: Stripe.Subscription): string {
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
}
function tsToIso(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

export type SyncResult =
  | { ok: true; userId: string; tier: string; comped: boolean }
  | { ok: false; reason: string };

/**
 * Project a Stripe subscription onto the host's user_subscriptions row.
 * Returns ok:false (not a throw) when no row matches the customer — the webhook
 * acks it (a subscription for a customer we don't track is not retryable).
 */
export async function syncSubscriptionToDb(svc: Svc, sub: Stripe.Subscription): Promise<SyncResult> {
  const customerId = customerIdOf(sub);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await (svc.from("user_subscriptions") as any)
    .select("user_id, comped")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (!row?.user_id) {
    return { ok: false, reason: `no user_subscriptions row for customer ${customerId}` };
  }

  const status = sub.status as SubscriptionStatus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceId: string | null = (sub.items?.data?.[0] as any)?.price?.id ?? null;
  // current_period_end lives on the subscription (v1) or its first item (newer API).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cpeSeconds: number | null =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sub as any).current_period_end ?? (sub.items?.data?.[0] as any)?.current_period_end ?? null;

  const comped = row.comped === true;
  const tier = PRO_STATUSES.has(status) ? "pro" : "free";

  const update: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    status,
    price_id: priceId,
    current_period_end: tsToIso(cpeSeconds),
    cancel_at_period_end: sub.cancel_at_period_end === true,
    trial_end: tsToIso(sub.trial_end),
    updated_at: new Date().toISOString(),
  };
  // Never downgrade a comped row's tier (owner / dogfood / A-rig stays Pro).
  if (!comped) update.tier = tier;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (svc.from("user_subscriptions") as any).update(update).eq("user_id", row.user_id);
  return { ok: true, userId: row.user_id, tier: comped ? "business" : tier, comped };
}
